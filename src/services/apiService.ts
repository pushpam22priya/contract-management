import { Template, UploadTemplateData } from '@/types/template';
import { httpClient } from '@/lib/httpClient';
import { authService } from '@/services/authService';

// Contract methods still call internal Next.js API routes (MongoDB-backed).
// Template methods now call the Spring Boot backend (MinIO-backed).
const API_BASE = '/api';

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
    console.log(`[ChunkedUpload] Step 1: POST /templates/${templateId}/upload/initiate`);
    const initRes = await httpClient.post<{ uploadId: string }>(
        `/templates/${templateId}/upload/initiate`,
        {}
    );
    if (!initRes.ok || !initRes.data?.uploadId) {
        throw new Error(`[ChunkedUpload] ✗ Failed to initiate upload: ${initRes.message}`);
    }
    const { uploadId } = initRes.data;
    console.log(`[ChunkedUpload] ✓ Upload initiated | uploadId="${uploadId}"`);

    // 2. Upload each part
    const parts: { partNumber: number; eTag: string }[] = [];

    for (let partNumber = 1; partNumber <= totalParts; partNumber++) {
        const start = (partNumber - 1) * CHUNK_SIZE;
        const end = Math.min(start + CHUNK_SIZE, totalSize);
        const chunk = file.slice(start, end);

        console.log(
            `[ChunkedUpload] Step 2.${partNumber}: Requesting presigned URL for part ${partNumber}/${totalParts}` +
            ` (bytes ${start}-${end - 1}, size=${(chunk.size / 1024).toFixed(0)}KB)`
        );

        // Get presigned URL for this part from backend
        const presignRes = await httpClient.get<{ presignedUrl: string }>(
            `/templates/${templateId}/upload/presign?uploadId=${encodeURIComponent(uploadId)}&partNumber=${partNumber}`
        );
        if (!presignRes.ok || !presignRes.data?.presignedUrl) {
            throw new Error(`[ChunkedUpload] ✗ Failed to get presigned URL for part ${partNumber}: ${presignRes.message}`);
        }
        const { presignedUrl } = presignRes.data;
        console.log(`[ChunkedUpload] ✓ Presigned URL received for part ${partNumber}`);

        // PUT chunk directly to MinIO — presigned URL has credentials baked in, no auth header needed
        console.log(`[ChunkedUpload] Uploading part ${partNumber}/${totalParts} directly to MinIO...`);
        const partRes = await fetch(presignedUrl, { method: 'PUT', body: chunk });
        if (!partRes.ok) {
            throw new Error(`[ChunkedUpload] ✗ Part ${partNumber} upload failed: HTTP ${partRes.status}`);
        }

        // ETag is returned by MinIO — strip surrounding quotes if present
        const rawETag = partRes.headers.get('ETag') || '';
        const eTag = rawETag.replace(/"/g, '');
        parts.push({ partNumber, eTag });

        const progress = Math.round((partNumber / totalParts) * 100);
        onProgress?.(progress);
        console.log(`[ChunkedUpload] ✓ Part ${partNumber}/${totalParts} complete | eTag="${eTag}" | progress=${progress}%`);
    }

    // 3. Complete multipart upload — backend assembles the parts in MinIO
    console.log(`[ChunkedUpload] Step 3: POST /templates/${templateId}/upload/complete with ${parts.length} parts`);
    const completeRes = await httpClient.post(
        `/templates/${templateId}/upload/complete`,
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
            id: t.id || t._id,      // backend may return _id (MongoDB) or id (mapped)
            fileUploaded: true,      // signals: binary lives in MinIO, use fetchTemplateBlobUrl()
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

        const template = { ...response.data, id: response.data.id || response.data._id, fileUploaded: true };
        console.log(`[ApiService] getTemplateById ✓ name="${template.name}"`);
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
        const CHUNKED_THRESHOLD = 50 * 1024 * 1024; // 50 MB
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
    // CONTRACT METHODS — call internal Next.js API routes (unchanged)
    // -------------------------------------------------------------------------

    /**
     * Fetch all contracts
     */
    async getContracts(): Promise<any[]> {
        const res = await fetch(`${API_BASE}/contracts`, { cache: 'no-store' });
        if (!res.ok) throw new Error('Failed to fetch contracts');
        return res.json();
    },

    /**
     * Get contract details
     */
    async getContractDetails(id: string): Promise<any | null> {
        const contracts = await this.getContracts();
        return contracts.find((c: any) => c.id === id) || null;
    },

    /**
     * Save a contract (binary update)
     * used for signing or saving updates
     */
    async saveContractPdf(id: string, pdfBlob: Blob): Promise<{ success: boolean }> {
        try {
            const res = await fetch(`${API_BASE}/file/${id}?type=contract`, {
                method: 'PUT',
                body: pdfBlob
            });
            if (!res.ok) throw new Error('Failed to save PDF');
            return { success: true };
        } catch (error) {
            console.error('Save failed:', error);
            return { success: false };
        }
    },

    /**
     * Update contract metadata (including XFDF data, reviewers, status, etc.)
     */
    async updateContractMetadata(id: string, updates: {
        xfdfData?: string;
        formFields?: any[];
        [key: string]: any;
    }): Promise<{ success: boolean; message?: string }> {
        try {
            const res = await fetch(`${API_BASE}/contracts/${id}`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(updates)
            });
            if (!res.ok) throw new Error('Failed to update contract metadata');
            const data = await res.json();
            return { success: true, message: data.message };
        } catch (error) {
            console.error('Update contract metadata failed:', error);
            return { success: false, message: 'Failed to update contract metadata' };
        }
    },

    /**
     * Create a new contract
     */
    async createContract(contractData: any): Promise<{ success: boolean; id?: string }> {
        try {
            const res = await fetch(`${API_BASE}/contracts`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(contractData)
            });
            if (!res.ok) throw new Error('Failed to create contract');
            const data = await res.json();
            return { success: true, id: data.id };
        } catch (error) {
            console.error('Create contract failed:', error);
            return { success: false };
        }
    },

    /**
     * Delete contract
     */
    async deleteContract(id: string): Promise<{ success: boolean; message: string }> {
        try {
            const res = await fetch(`${API_BASE}/contracts/${id}`, { method: 'DELETE' });
            if (!res.ok) throw new Error('Failed to delete contract');
            return { success: true, message: 'Contract deleted' };
        } catch (error: any) {
            console.error('Delete failed:', error);
            return { success: false, message: error.message };
        }
    }
};
