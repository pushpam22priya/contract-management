import { Template, UploadTemplateData } from '@/types/template';
import { httpClient } from '@/lib/httpClient';
import { authService } from '@/services/authService';

// All contract and template operations now go through the Spring Boot backend
// via httpClient → /api/backend/* → Next.js rewrite proxy → Spring Boot.
// The internal Next.js MongoDB routes are no longer used for data operations.

// ---------------------------------------------------------------------------
// PRIVATE HELPER — Chunked multipart upload for large files (≥ 50 MB)
// Flow: initiate → presign each part → PUT chunk directly to MinIO (no auth) → complete
// Chunk size: 10 MB. MinIO requires min 5 MB per part (except the last part).
// ---------------------------------------------------------------------------
async function chunkedUpload(
    templateId: string,
    file: File | Blob,
    onProgress?: (progress: number) => void
): Promise<void> {
    const CHUNK_SIZE = 10 * 1024 * 1024; // 10 MB
    const totalSize = file.size;
    const totalParts = Math.ceil(totalSize / CHUNK_SIZE);

    console.log(`[ChunkedUpload] Starting for template "${templateId}"`);
    console.log(`[ChunkedUpload] File size=${(totalSize / 1024 / 1024).toFixed(2)}MB | parts=${totalParts} | chunkSize=10MB`);

    // 1. Initiate multipart upload — backend returns an uploadId
    console.log(`[ChunkedUpload] Step 1: POST /templates/${templateId}/file/initiate`);
    const initRes = await httpClient.post<{ uploadId: string }>(
        `/templates/${templateId}/file/initiate`,
        {}
    );
    if (!initRes.ok || !initRes.data?.uploadId) {
        throw new Error(`[ChunkedUpload] ✗ Failed to initiate upload: ${initRes.message}`);
    }
    const { uploadId } = initRes.data;
    console.log(`[ChunkedUpload] ✓ Upload initiated | uploadId="${uploadId}"`);

    // 2. Upload each part
    const parts: { partNumber: number; eTag: string }[] = [];

    try {
        for (let partNumber = 1; partNumber <= totalParts; partNumber++) {
            const start = (partNumber - 1) * CHUNK_SIZE;
            const end = Math.min(start + CHUNK_SIZE, totalSize);
            const chunk = file.slice(start, end);

            console.log(
                `[ChunkedUpload] Step 2.${partNumber}: Requesting presigned URL for part ${partNumber}/${totalParts}` +
                ` (bytes ${start}-${end - 1}, size=${(chunk.size / 1024).toFixed(0)}KB)`
            );

            // Get presigned URL for this part from backend
            // Backend returns { url, partNumber } — field is "url" not "presignedUrl"
            const presignRes = await httpClient.get<{ url: string; partNumber: number }>(
                `/templates/${templateId}/file/presign?uploadId=${encodeURIComponent(uploadId)}&partNumber=${partNumber}`
            );
            if (!presignRes.ok || !presignRes.data?.url) {
                throw new Error(`[ChunkedUpload] ✗ Failed to get presigned URL for part ${partNumber}: ${presignRes.message}`);
            }
            const presignedUrl = presignRes.data.url;
            console.log(`[ChunkedUpload] ✓ Presigned URL received for part ${partNumber}: ${presignedUrl.slice(0, 60)}...`);

            // PUT chunk directly to MinIO — presigned URL has credentials baked in.
            // IMPORTANT: Do NOT add Authorization header — MinIO will reject a pre-signed
            // request that also has an Authorization header.
            // Content-Type must be application/octet-stream as per MinIO requirements.
            console.log(`[ChunkedUpload] Uploading part ${partNumber}/${totalParts} directly to MinIO (${(chunk.size / 1024).toFixed(0)}KB)...`);
            const partRes = await fetch(presignedUrl, {
                method: 'PUT',
                body: chunk,
                headers: { 'Content-Type': 'application/octet-stream' },
            });
            if (!partRes.ok) {
                throw new Error(`[ChunkedUpload] ✗ Part ${partNumber} MinIO upload failed: HTTP ${partRes.status}`);
            }

            // ETag is returned by MinIO in the response header — strip surrounding quotes
            const rawETag = partRes.headers.get('ETag') || '';
            const eTag = rawETag.replace(/"/g, '');
            if (!eTag) {
                console.warn(`[ChunkedUpload] ⚠ No ETag in MinIO response for part ${partNumber} — CORS may be blocking the header`);
            }
            parts.push({ partNumber, eTag });

            const progress = Math.round((partNumber / totalParts) * 100);
            onProgress?.(progress);
            console.log(`[ChunkedUpload] ✓ Part ${partNumber}/${totalParts} complete | eTag="${eTag}" | progress=${progress}%`);
        }
    } catch (err) {
        // Abort the multipart upload on any failure to free orphaned MinIO resources
        console.error(`[ChunkedUpload] ✗ Error during part upload — aborting upload uploadId="${uploadId}"`, err);
        try {
            await httpClient.post(`/templates/${templateId}/file/abort?uploadId=${encodeURIComponent(uploadId)}`, {});
            console.log(`[ChunkedUpload] ✓ Abort sent for uploadId="${uploadId}"`);
        } catch (abortErr) {
            console.warn('[ChunkedUpload] Failed to send abort — orphaned parts may remain in MinIO:', abortErr);
        }
        throw err; // re-throw so uploadTemplate reports failure
    }

    // 3. Complete multipart upload — backend assembles the parts in MinIO
    console.log(`[ChunkedUpload] Step 3: POST /templates/${templateId}/file/complete with ${parts.length} parts`);
    console.log(`[ChunkedUpload] Parts:`, parts.map(p => `#${p.partNumber} eTag="${p.eTag}"`).join(', '));
    const completeRes = await httpClient.post(
        `/templates/${templateId}/file/complete`,
        { uploadId, parts }
    );
    if (!completeRes.ok) {
        throw new Error(`[ChunkedUpload] ✗ Failed to complete upload: ${completeRes.message}`);
    }
    console.log(`[ChunkedUpload] ✓ Multipart upload complete for template "${templateId}"`);
}

// ---------------------------------------------------------------------------
// PRIVATE HELPER — Single-shot binary upload for files < 50 MB
// Sends raw binary body with Content-Type: application/octet-stream.
// This is the standard Spring Boot @RequestBody byte[] / InputStream pattern.
// application/octet-stream is used (not application/pdf) because Spring MVC
// matches @RequestMapping(consumes) on the generic binary type.
// ---------------------------------------------------------------------------
async function singleShotUpload(templateId: string, file: File | Blob): Promise<void> {
    const sizeMB = (file.size / 1024 / 1024).toFixed(2);
    console.log(`[SingleShotUpload] PUT /templates/${templateId}/file | size=${sizeMB}MB | Content-Type=application/octet-stream`);

    const uploadRes = await httpClient.putFile(`/templates/${templateId}/file`, file, 'application/octet-stream');
    if (!uploadRes.ok) {
        throw new Error(`[SingleShotUpload] ✗ Binary upload failed (${uploadRes.status}): ${uploadRes.message}`);
    }
    console.log(`[SingleShotUpload] ✓ Binary uploaded for template "${templateId}"`);
}

// ---------------------------------------------------------------------------
// PRIVATE HELPERS — Contract file upload (mirrors template upload helpers)
// Threshold: 30 MB  (per the Contract API guide)
// Single-shot: PUT /contracts/{id}/file  (Content-Type: application/pdf)
// Chunked:     initiate → presign per part → PUT chunk to MinIO → complete
//              Abort called automatically on any part failure.
// ---------------------------------------------------------------------------

async function contractSingleShotUpload(contractId: string, file: Blob): Promise<void> {
    const sizeMB = (file.size / 1024 / 1024).toFixed(2);
    console.log(`[ContractSingleShot] PUT /contracts/${contractId}/file | size=${sizeMB}MB | Content-Type=application/pdf`);
    const uploadRes = await httpClient.putFile(`/contracts/${contractId}/file`, file, 'application/pdf');
    if (!uploadRes.ok) {
        throw new Error(`[ContractSingleShot] ✗ Upload failed (HTTP ${uploadRes.status}): ${uploadRes.message}`);
    }
    console.log(`[ContractSingleShot] ✓ File uploaded for contractId="${contractId}"`);
}

async function contractChunkedUpload(
    contractId: string,
    file: File | Blob,
    onProgress?: (progress: number) => void
): Promise<void> {
    const CHUNK_SIZE = 10 * 1024 * 1024; // 10 MB per chunk (MinIO min is 5 MB)
    const totalSize = file.size;
    const totalParts = Math.ceil(totalSize / CHUNK_SIZE);

    console.log(`[ContractChunkedUpload] Starting | contractId="${contractId}" | size=${(totalSize / 1024 / 1024).toFixed(2)}MB | parts=${totalParts}`);

    // Step 1 — Initiate multipart session
    console.log(`[ContractChunkedUpload] Step 1: POST /contracts/${contractId}/file/initiate`);
    const initRes = await httpClient.post<{ uploadId: string; templateId: string }>(
        `/contracts/${contractId}/file/initiate`,
        {}
    );
    if (!initRes.ok || !initRes.data?.uploadId) {
        throw new Error(`[ContractChunkedUpload] ✗ Initiate failed: ${initRes.message}`);
    }
    const { uploadId } = initRes.data;
    console.log(`[ContractChunkedUpload] ✓ Session initiated | uploadId="${uploadId}"`);

    // Step 2 — Upload each chunk directly to MinIO via presigned URL
    const parts: { partNumber: number; eTag: string }[] = [];

    try {
        for (let partNumber = 1; partNumber <= totalParts; partNumber++) {
            const start = (partNumber - 1) * CHUNK_SIZE;
            const end   = Math.min(start + CHUNK_SIZE, totalSize);
            const chunk = file.slice(start, end);

            console.log(
                `[ContractChunkedUpload] Step 2.${partNumber}: Requesting presigned URL for part ${partNumber}/${totalParts}` +
                ` (bytes ${start}-${end - 1}, size=${(chunk.size / 1024).toFixed(0)}KB)`
            );

            const presignRes = await httpClient.get<{ url: string; partNumber: number }>(
                `/contracts/${contractId}/file/presign?uploadId=${encodeURIComponent(uploadId)}&partNumber=${partNumber}`
            );
            if (!presignRes.ok || !presignRes.data?.url) {
                throw new Error(`[ContractChunkedUpload] ✗ Presign failed for part ${partNumber}: ${presignRes.message}`);
            }
            const presignedUrl = presignRes.data.url;
            console.log(`[ContractChunkedUpload] ✓ Presigned URL for part ${partNumber}: ${presignedUrl.slice(0, 60)}...`);

            // PUT chunk directly to MinIO — NO Authorization header (credentials are embedded in the URL)
            const partRes = await fetch(presignedUrl, {
                method:  'PUT',
                body:    chunk,
                headers: { 'Content-Type': 'application/octet-stream' },
            });
            if (!partRes.ok) {
                throw new Error(`[ContractChunkedUpload] ✗ MinIO PUT failed for part ${partNumber}: HTTP ${partRes.status}`);
            }

            // Strip surrounding quotes from ETag before storing
            const rawETag = partRes.headers.get('ETag') || '';
            const eTag    = rawETag.replace(/"/g, '');
            if (!eTag) {
                console.warn(`[ContractChunkedUpload] ⚠ No ETag for part ${partNumber} — CORS may be blocking the header`);
            }
            parts.push({ partNumber, eTag });

            const progress = Math.round((partNumber / totalParts) * 100);
            onProgress?.(progress);
            console.log(`[ContractChunkedUpload] ✓ Part ${partNumber}/${totalParts} done | eTag="${eTag}" | progress=${progress}%`);
        }
    } catch (err) {
        // Abort on any failure to free orphaned MinIO resources
        console.error(`[ContractChunkedUpload] ✗ Part upload error — aborting | uploadId="${uploadId}"`, err);
        try {
            await httpClient.post(`/contracts/${contractId}/file/abort?uploadId=${encodeURIComponent(uploadId)}`, {});
            console.log(`[ContractChunkedUpload] ✓ Abort sent for uploadId="${uploadId}"`);
        } catch (abortErr) {
            console.warn('[ContractChunkedUpload] Failed to abort — orphaned parts may remain in MinIO:', abortErr);
        }
        throw err;
    }

    // Step 3 — Complete: backend assembles all parts into the final PDF
    console.log(`[ContractChunkedUpload] Step 3: POST /contracts/${contractId}/file/complete | parts=${parts.length}`);
    console.log(`[ContractChunkedUpload] Parts:`, parts.map(p => `#${p.partNumber} eTag="${p.eTag}"`).join(', '));
    const completeRes = await httpClient.post(
        `/contracts/${contractId}/file/complete`,
        { uploadId, parts }
    );
    if (!completeRes.ok) {
        throw new Error(`[ContractChunkedUpload] ✗ Complete failed: ${completeRes.message}`);
    }
    console.log(`[ContractChunkedUpload] ✓ Multipart upload complete | contractId="${contractId}"`);
}

// ---------------------------------------------------------------------------
// PUBLIC API SERVICE
// ---------------------------------------------------------------------------
export const apiService = {

    // -------------------------------------------------------------------------
    // TEMPLATE METHODS — call Spring Boot backend (http://localhost:8080)
    // -------------------------------------------------------------------------

    /**
     * Fetch all templates (metadata only — no binary fields).
     * Backend: GET /templates
     */
    async getTemplates(): Promise<Template[]> {
        console.log('[ApiService] getTemplates → GET /templates');
        const response = await httpClient.get<any[]>('/templates');

        if (!response.ok || !Array.isArray(response.data)) {
            console.error('[ApiService] getTemplates ✗', response.status, response.message);
            return [];
        }

        const templates = response.data.map((t: any) => ({
            ...t,
            id: t.id || t._id,
            // Use backend's actual fileUploaded value — do NOT force true.
            // Chunked uploads that failed the complete step will have fileUploaded=false.
            fileUploaded: t.fileUploaded === true,
        }));

        console.log(`[ApiService] getTemplates ✓ received ${templates.length} templates`);
        return templates;
    },

    /**
     * Get a single template by ID (metadata only).
     * Backend: GET /templates/{id}
     */
    async getTemplateById(id: string): Promise<Template | null> {
        console.log(`[ApiService] getTemplateById → GET /templates/${id}`);
        const response = await httpClient.get<any>(`/templates/${id}`);

        if (!response.ok || !response.data) {
            console.error(`[ApiService] getTemplateById ✗`, response.status, response.message);
            return null;
        }

        const template = {
            ...response.data,
            id: response.data.id || response.data._id,
            fileUploaded: response.data.fileUploaded === true,
        };
        console.log(`[ApiService] getTemplateById ✓ name="${template.name}" | fileUploaded=${template.fileUploaded}`);
        return template;
    },

    /**
     * Upload a new template — two-step:
     * Step 1: POST /templates  (JSON metadata → returns { id })
     * Step 2: PUT /templates/{id}/file  (raw binary, size-gated: < 50MB single-shot, ≥ 50MB chunked)
     * Backend: POST /templates + PUT /templates/{id}/file (or chunked multipart)
     */
    async uploadTemplate(data: UploadTemplateData): Promise<{ success: boolean; id?: string; message: string }> {
        const currentUser = authService.getCurrentUser();
        const sizeMB = (data.file.size / 1024 / 1024).toFixed(2);
        console.log(`[ApiService] uploadTemplate → POST /templates | name="${data.name}" | size=${sizeMB}MB`);

        // Step 1 — Create metadata record, get back the new template id
        const metadata = {
            name: data.name,
            description: data.description,
            category: data.category,
            fileName: data.fileName,
            fileType: data.fileName.endsWith('.docx') ? 'docx' : 'pdf',
            uploadedBy: currentUser?.email || 'unknown',
            xfdfData: data.xfdfData,
            formFields: data.formFields || [],
            parties: data.parties || [],
        };

        console.log('[ApiService] uploadTemplate Step 1: creating metadata record', {
            name: metadata.name,
            category: metadata.category,
            uploadedBy: metadata.uploadedBy,
            formFieldsCount: metadata.formFields.length,
            partiesCount: metadata.parties.length,
        });

        const metaRes = await httpClient.post<{ id: string; message?: string }>('/templates', metadata);

        if (!metaRes.ok || !metaRes.data?.id) {
            console.error('[ApiService] uploadTemplate Step 1 ✗', metaRes.status, metaRes.message);
            return { success: false, message: metaRes.message || 'Failed to create template metadata' };
        }

        const id = metaRes.data.id;
        console.log(`[ApiService] uploadTemplate Step 1 ✓ id="${id}"`);

        // Step 2 — Upload binary (size-gated)
        const CHUNKED_THRESHOLD = 30 * 1024 * 1024; // 30 MB threshold for chunked upload
        console.log(
            `[ApiService] uploadTemplate Step 2: ${data.file.size >= CHUNKED_THRESHOLD ? 'CHUNKED' : 'single-shot'} upload`
        );

        try {
            if (data.file.size >= CHUNKED_THRESHOLD) {
                await chunkedUpload(id, data.file, data.onProgress);
            } else {
                await singleShotUpload(id, data.file);
                data.onProgress?.(100);
            }

            console.log(`[ApiService] uploadTemplate ✓ complete | id="${id}"`);
            return { success: true, id, message: 'Template uploaded successfully' };
        } catch (e: any) {
            console.error('[ApiService] uploadTemplate Step 2 ✗', e.message);
            return {
                success: false,
                id,
                message: e.message || 'File upload failed. Metadata was created but binary is missing.',
            };
        }
    },

    /**
     * Update an existing template — two-step:
     * Step 1: PUT /templates/{id}  (JSON metadata)
     * Step 2: PUT /templates/{id}/file  (raw binary, only if file changed)
     * Backend: PUT /templates/{id} + optional binary upload
     */
    async updateTemplate(id: string, data: any): Promise<{ success: boolean; message: string; template?: any }> {
        const sizeMB = data.file ? (data.file.size / 1024 / 1024).toFixed(2) : 'n/a';
        console.log(`[ApiService] updateTemplate → PUT /templates/${id} | hasNewFile=${!!data.file} | size=${sizeMB}MB`);

        // Strip binary fields from metadata payload — only send JSON-serialisable fields
        const metadata: any = { ...data };
        delete metadata.file;
        delete metadata.fileData;
        delete metadata.fileUrl;
        delete metadata.onProgress;

        console.log('[ApiService] updateTemplate Step 1: updating metadata', {
            name: metadata.name,
            category: metadata.category,
            formFieldsCount: metadata.formFields?.length ?? 0,
            partiesCount: metadata.parties?.length ?? 0,
        });

        const metaRes = await httpClient.put(`/templates/${id}`, metadata);
        if (!metaRes.ok) {
            console.error(`[ApiService] updateTemplate Step 1 ✗`, metaRes.status, metaRes.message);
            return { success: false, message: metaRes.message || 'Failed to update template metadata' };
        }
        console.log(`[ApiService] updateTemplate Step 1 ✓`);

        // Step 2 — Upload new binary if a file was provided
        if (data.file instanceof Blob || data.file instanceof File) {
            const CHUNKED_THRESHOLD = 50 * 1024 * 1024;
            console.log(
                `[ApiService] updateTemplate Step 2: ${data.file.size >= CHUNKED_THRESHOLD ? 'CHUNKED' : 'single-shot'} upload`
            );
            try {
                if (data.file.size >= CHUNKED_THRESHOLD) {
                    await chunkedUpload(id, data.file, data.onProgress);
                } else {
                    await singleShotUpload(id, data.file);
                    data.onProgress?.(100);
                }
                console.log(`[ApiService] updateTemplate Step 2 ✓`);
            } catch (e: any) {
                console.error('[ApiService] updateTemplate Step 2 ✗', e.message);
                return { success: false, message: e.message || 'Metadata updated but file upload failed' };
            }
        } else {
            console.log('[ApiService] updateTemplate Step 2: skipped (no new file provided)');
        }

        console.log(`[ApiService] updateTemplate ✓ complete | id="${id}"`);
        return { success: true, message: 'Template updated successfully' };
    },

    /**
     * Delete a template.
     * Backend: DELETE /templates/{id}
     * Returns 204 No Content on success (response.ok = true for all 2xx).
     */
    async deleteTemplate(id: string): Promise<{ success: boolean; message: string }> {
        console.log(`[ApiService] deleteTemplate → DELETE /templates/${id}`);
        const response = await httpClient.delete(`/templates/${id}`);

        // 204 No Content = success; response.ok covers all 2xx
        if (response.ok || response.status === 204) {
            console.log(`[ApiService] deleteTemplate ✓ id="${id}"`);
            return { success: true, message: 'Template deleted successfully' };
        }

        console.error(`[ApiService] deleteTemplate ✗`, response.status, response.message);
        return { success: false, message: response.message || 'Failed to delete template' };
    },

    // -------------------------------------------------------------------------
    // CONTRACT METHODS
    //
    // Routing strategy:
    //   • CREATE / FILE-UPLOAD / VIEW-URL / DELETE  → Spring Boot backend
    //     (http://localhost:8080) — files stored in MinIO
    //   • READ (list + detail)                      → internal Next.js route
    //     (/api/contracts) — returns full workflow fields (reviewers, approver,
    //     signers, etc.) that the Spring Boot contract model does not expose yet
    //   • METADATA UPDATE (xfdfData, reviewers, status…) → internal Next.js route
    //     until the backend adds a workflow endpoint
    // -------------------------------------------------------------------------

    /**
     * Fetch all contracts — Spring Boot backend via proxy.
     * Returns contracts owned by the authenticated user (filtered by JWT server-side).
     */
    async getContracts(): Promise<any[]> {
        console.log('[ApiService] getContracts → GET /contracts (Spring Boot via proxy)');
        const response = await httpClient.get<any[]>('/contracts');
        if (!response.ok || !Array.isArray(response.data)) {
            console.error('[ApiService] getContracts ✗', response.status, response.message);
            return [];
        }
        const count = response.data.length;
        console.log(`[ApiService] getContracts ✓ received ${count} contracts`);
        return response.data.map((c: any) => ({ ...c, id: c.id || c._id }));
    },

    /**
     * Get full contract detail by ID — Spring Boot backend via proxy.
     */
    async getContractDetails(id: string): Promise<any | null> {
        console.log(`[ApiService] getContractDetails → GET /contracts/${id} (Spring Boot via proxy)`);
        const response = await httpClient.get<any>(`/contracts/${id}`);
        if (!response.ok || !response.data) {
            console.warn(`[ApiService] getContractDetails ✗ id="${id}"`, response.status, response.message);
            return null;
        }
        const contract = { ...response.data, id: response.data.id || response.data._id };
        console.log(`[ApiService] getContractDetails ✓ id="${id}" status="${contract.status}"`);
        return contract;
    },

    /**
     * Create a new contract — Spring Boot backend.
     * Returns the new contract id to use for file upload.
     */
    async createContract(contractData: any): Promise<{ success: boolean; id?: string; message?: string }> {
        console.log(`[ApiService] createContract → POST /contracts | title="${contractData.title}" | teamId="${contractData.teamId ?? 'none'}"`);
        const response = await httpClient.post<any>('/contracts', contractData);
        if (!response.ok) {
            console.error('[ApiService] createContract ✗', response.status, response.message);
            return { success: false, message: response.message || 'Failed to create contract' };
        }
        const id = response.data?.id || response.data?._id;
        console.log(`[ApiService] createContract ✓ id="${id}"`);
        return { success: true, id };
    },

    /**
     * Upload contract PDF — Spring Boot backend → MinIO.
     * Automatically chooses single-shot (< 30 MB) or chunked (≥ 30 MB).
     * Sets fileUploaded = true on success.
     */
    async saveContractPdf(
        id: string,
        pdfBlob: Blob,
        onProgress?: (progress: number) => void
    ): Promise<{ success: boolean; message?: string }> {
        const sizeMB = (pdfBlob.size / 1024 / 1024).toFixed(2);
        const CHUNKED_THRESHOLD = 30 * 1024 * 1024; // 30 MB
        const uploadPath = pdfBlob.size >= CHUNKED_THRESHOLD ? 'CHUNKED' : 'SINGLE-SHOT';
        console.log(`[ApiService] saveContractPdf | id="${id}" | size=${sizeMB}MB | path=${uploadPath}`);
        try {
            if (pdfBlob.size >= CHUNKED_THRESHOLD) {
                await contractChunkedUpload(id, pdfBlob, onProgress);
            } else {
                await contractSingleShotUpload(id, pdfBlob);
                onProgress?.(100);
            }
            console.log(`[ApiService] saveContractPdf ✓ id="${id}" | fileUploaded=true`);
            return { success: true };
        } catch (e: any) {
            console.error(`[ApiService] saveContractPdf ✗ id="${id}"`, e.message);
            return { success: false, message: e.message || 'Contract file upload failed' };
        }
    },

    /**
     * Get a time-limited (15 min) MinIO presigned URL for viewing the contract PDF.
     * Pass the returned URL directly to Apryse WebViewer — no Authorization header needed.
     * Returns null if the contract has no file yet (fileUploaded = false) or on error.
     */
    async getContractViewUrl(id: string): Promise<string | null> {
        console.log(`[ApiService] getContractViewUrl → GET /contracts/${id}/file/view-url`);
        const response = await httpClient.get<{ url: string }>(`/contracts/${id}/file/view-url`);
        if (!response.ok || !response.data?.url) {
            console.error(`[ApiService] getContractViewUrl ✗ id="${id}"`, response.status, response.message);
            return null;
        }
        console.log(`[ApiService] getContractViewUrl ✓ id="${id}" | presigned URL received (15 min TTL)`);
        return response.data.url;
    },

    /**
     * Update document-level contract fields — Spring Boot backend.
     *
     * Use for: xfdfData, fieldValues, formFields, parties, title, client,
     * description, value, category, startDate, endDate, teamId.
     *
     * These fields live in Spring Boot's MongoDB document. Routing them through
     * the internal Next.js PATCH (/api/contracts/{id}) causes 404 for contracts
     * created via Spring Boot because the internal route queries a separate context.
     */
    async updateContractDocument(id: string, data: {
        xfdfData?: string;
        fieldValues?: Record<string, any>;
        formFields?: any[];
        [key: string]: any;
    }): Promise<{ success: boolean; message?: string }> {
        const fields = Object.keys(data).join(', ');
        console.log(`[ApiService] updateContractDocument → PATCH /contracts/${id} (Spring Boot) | fields=[${fields}]`);
        const response = await httpClient.patch<any>(`/contracts/${id}`, data);
        if (!response.ok) {
            console.error(`[ApiService] updateContractDocument ✗ id="${id}"`, response.status, response.message);
            return { success: false, message: response.message || 'Failed to update contract' };
        }
        console.log(`[ApiService] updateContractDocument ✓ id="${id}"`);
        return { success: true };
    },

    /**
     * Update contract metadata (workflow + document fields) — Spring Boot backend via proxy.
     *
     * Routed through the Next.js rewrite proxy (/api/backend/*) to avoid CORS.
     * Spring Boot stores all fields in its MongoDB — no separate internal route needed.
     */
    async updateContractMetadata(id: string, updates: {
        xfdfData?: string;
        formFields?: any[];
        [key: string]: any;
    }): Promise<{ success: boolean; message?: string }> {
        const fields = Object.keys(updates).join(', ');
        console.log(`[ApiService] updateContractMetadata → PATCH /contracts/${id} (Spring Boot via proxy) | fields=[${fields}]`);
        const response = await httpClient.patch<any>(`/contracts/${id}`, updates);
        if (!response.ok) {
            console.error(`[ApiService] updateContractMetadata ✗ id="${id}"`, response.status, response.message);
            return { success: false, message: response.message || 'Failed to update contract metadata' };
        }
        console.log(`[ApiService] updateContractMetadata ✓ id="${id}"`);
        return { success: true, message: response.data?.message };
    },

    /**
     * Delete a contract — Spring Boot backend.
     */
    async deleteContract(id: string): Promise<{ success: boolean; message: string }> {
        console.log(`[ApiService] deleteContract → DELETE /contracts/${id}`);
        const response = await httpClient.delete(`/contracts/${id}`);
        if (response.ok || response.status === 204) {
            console.log(`[ApiService] deleteContract ✓ id="${id}"`);
            return { success: true, message: 'Contract deleted successfully' };
        }
        console.error(`[ApiService] deleteContract ✗`, response.status, response.message);
        return { success: false, message: response.message || 'Failed to delete contract' };
    },
};
