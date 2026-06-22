/**
 * UNIT TESTS — apiService template methods
 * (src/services/apiService.ts — template section)
 *
 * httpClient and authService are mocked at the module boundary.
 * global.fetch is mocked for MinIO presigned PUT calls.
 *
 * Scenarios covered:
 *
 * getTemplates()
 *  1.  Returns normalised template list (id from t.id || t._id)
 *  2.  Returns empty array when backend responds with ok=false
 *  3.  Returns empty array when backend data is not an array
 *  4.  Sets fileUploaded=true only when backend value is exactly true
 *  5.  Sets fileUploaded=false when backend value is false
 *
 * getTemplateById()
 *  6.  Returns normalised template with id on success
 *  7.  Returns null when backend responds with ok=false
 *  8.  Returns null when response data is falsy
 *
 * uploadTemplate() — metadata step
 *  9.  POSTs metadata to /templates with correct fields
 * 10.  Includes uploadedBy from authService.getCurrentUser().email
 * 11.  Returns failure when POST /templates returns ok=false (no file upload)
 *
 * uploadTemplate() — single-shot binary upload (file < 30 MB)
 * 12.  PUTs file to /templates/{id}/file for small files
 * 13.  Calls onProgress(100) after single-shot upload
 * 14.  Returns { success: true, id } on complete success
 * 15.  Returns { success: false, id } when single-shot PUT fails
 *
 * uploadTemplate() — chunked upload (file >= 30 MB)
 * 16.  Initiates multipart upload via POST /templates/{id}/file/initiate
 * 17.  Requests presigned URL for each part
 * 18.  PUTs each chunk directly to the MinIO presigned URL
 * 19.  Completes upload via POST /templates/{id}/file/complete with parts list
 * 20.  Calls onProgress() after each part
 * 21.  Aborts the multipart upload when a part PUT fails
 * 22.  Returns failure after aborting on a part error
 *
 * updateTemplate()
 * 23.  Strips file/fileData/fileUrl/onProgress from metadata PUT payload
 * 24.  Returns failure when metadata PUT fails (no file upload attempted)
 * 25.  Skips file upload step when no file is provided
 * 26.  Uploads a new small file when file is provided
 * 27.  Returns { success: true } on complete success
 *
 * deleteTemplate()
 * 28.  Calls DELETE /templates/{id}
 * 29.  Returns success on 204 No Content (response.ok=true + status=204)
 * 30.  Returns failure when backend returns non-2xx
 */

// ─── httpClient mock ──────────────────────────────────────────────────────────

const mockHttpGet    = jest.fn();
const mockHttpPost   = jest.fn();
const mockHttpPut    = jest.fn();
const mockHttpPutFile = jest.fn();
const mockHttpDelete = jest.fn();

jest.mock('@/lib/httpClient', () => ({
    httpClient: {
        get:     (...a: any[]) => mockHttpGet(...a),
        post:    (...a: any[]) => mockHttpPost(...a),
        put:     (...a: any[]) => mockHttpPut(...a),
        putFile: (...a: any[]) => mockHttpPutFile(...a),
        delete:  (...a: any[]) => mockHttpDelete(...a),
    },
}));

// ─── authService mock ─────────────────────────────────────────────────────────

const mockGetCurrentUser = jest.fn();

jest.mock('@/services/authService', () => ({
    authService: {
        getCurrentUser: (...a: any[]) => mockGetCurrentUser(...a),
    },
}));

// ─── global fetch mock (used for MinIO presigned PUT) ────────────────────────

const mockFetch = jest.fn();
global.fetch = mockFetch as any;

import { apiService } from '@/services/apiService';

// ─── Fixtures ─────────────────────────────────────────────────────────────────

/** 1-byte Blob — well below the 30 MB single-shot threshold. */
const SMALL_FILE = new Blob(['%PDF'], { type: 'application/pdf' });

/** 31 MB Blob — above the 30 MB chunked threshold (30_000_000 bytes). */
const LARGE_FILE = new Blob([new Uint8Array(31_000_000)], { type: 'application/pdf' });

const UPLOAD_DATA_SMALL = {
    name:        'NDA Agreement',
    description: 'Standard NDA',
    category:    'Legal',
    fileName:    'nda.pdf',
    file:        SMALL_FILE,
};

const UPLOAD_DATA_LARGE = {
    name:        'Large Contract',
    description: '',
    category:    'Finance',
    fileName:    'large.pdf',
    file:        LARGE_FILE,
    onProgress:  jest.fn(),
};

// ─────────────────────────────────────────────────────────────────────────────

beforeEach(() => {
    jest.clearAllMocks();
    mockGetCurrentUser.mockReturnValue({ email: 'alice@example.com', isAdmin: false });
});

// =============================================================================
// getTemplates()
// =============================================================================

describe('apiService.getTemplates()', () => {

    it('returns a normalised list with id = t.id || t._id', async () => {
        mockHttpGet.mockResolvedValueOnce({
            ok: true,
            data: [
                { _id: 'mongo_id_1', name: 'NDA', fileUploaded: true },
                { id: 'existing_id', name: 'MSA', fileUploaded: false },
            ],
        });

        const result = await apiService.getTemplates();

        expect(result[0].id).toBe('mongo_id_1');   // falls back to _id
        expect(result[1].id).toBe('existing_id');  // uses id when present
    });

    it('returns empty array when backend responds with ok=false', async () => {
        mockHttpGet.mockResolvedValueOnce({ ok: false, status: 500, message: 'Server error', data: null });

        const result = await apiService.getTemplates();

        expect(result).toEqual([]);
    });

    it('returns empty array when response data is not an array', async () => {
        mockHttpGet.mockResolvedValueOnce({ ok: true, data: { items: [] } });

        const result = await apiService.getTemplates();

        expect(result).toEqual([]);
    });

    it('sets fileUploaded=true only when backend value is exactly true', async () => {
        mockHttpGet.mockResolvedValueOnce({
            ok: true,
            data: [
                { id: 'a', fileUploaded: true  },
                { id: 'b', fileUploaded: false },
                { id: 'c', fileUploaded: null  },
            ],
        });

        const result = await apiService.getTemplates();

        expect(result[0].fileUploaded).toBe(true);
        expect(result[1].fileUploaded).toBe(false);
        expect(result[2].fileUploaded).toBe(false);
    });
});

// =============================================================================
// getTemplateById()
// =============================================================================

describe('apiService.getTemplateById()', () => {

    it('returns a normalised template with id on success', async () => {
        mockHttpGet.mockResolvedValueOnce({
            ok: true,
            data: { _id: 'tpl_001', name: 'NDA', fileUploaded: true },
        });

        const result = await apiService.getTemplateById('tpl_001');

        expect(result?.id).toBe('tpl_001');
        expect(result?.name).toBe('NDA');
        expect(result?.fileUploaded).toBe(true);
    });

    it('returns null when the backend responds with ok=false', async () => {
        mockHttpGet.mockResolvedValueOnce({ ok: false, status: 404, data: null });

        const result = await apiService.getTemplateById('unknown');

        expect(result).toBeNull();
    });

    it('returns null when response data is falsy', async () => {
        mockHttpGet.mockResolvedValueOnce({ ok: true, data: null });

        const result = await apiService.getTemplateById('tpl_001');

        expect(result).toBeNull();
    });
});

// =============================================================================
// uploadTemplate() — metadata step
// =============================================================================

describe('apiService.uploadTemplate() — metadata', () => {

    it('POSTs metadata to /templates with name, description, category, fileName, formFields, parties', async () => {
        // Metadata step succeeds, binary step skipped by mocking putFile
        mockHttpPost.mockResolvedValueOnce({ ok: true, data: { id: 'tpl_new' } });
        mockHttpPutFile.mockResolvedValueOnce({ ok: true });

        await apiService.uploadTemplate(UPLOAD_DATA_SMALL);

        expect(mockHttpPost).toHaveBeenCalledWith(
            '/templates',
            expect.objectContaining({
                name:        'NDA Agreement',
                description: 'Standard NDA',
                category:    'Legal',
                fileName:    'nda.pdf',
                formFields:  [],
                parties:     [],
            })
        );
    });

    it('sets uploadedBy to the current user email from authService.getCurrentUser()', async () => {
        mockHttpPost.mockResolvedValueOnce({ ok: true, data: { id: 'tpl_new' } });
        mockHttpPutFile.mockResolvedValueOnce({ ok: true });

        await apiService.uploadTemplate(UPLOAD_DATA_SMALL);

        const [, metadata] = mockHttpPost.mock.calls[0];
        expect(metadata.uploadedBy).toBe('alice@example.com');
    });

    it('returns failure immediately when POST /templates fails — no binary upload attempted', async () => {
        mockHttpPost.mockResolvedValueOnce({ ok: false, message: 'Validation error' });

        const result = await apiService.uploadTemplate(UPLOAD_DATA_SMALL);

        expect(result.success).toBe(false);
        expect(result.message).toMatch(/validation error/i);
        expect(mockHttpPutFile).not.toHaveBeenCalled();
        expect(mockFetch).not.toHaveBeenCalled();
    });
});

// =============================================================================
// uploadTemplate() — single-shot upload (file < 30 MB)
// =============================================================================

describe('apiService.uploadTemplate() — single-shot upload', () => {

    beforeEach(() => {
        // Metadata step always succeeds in these tests
        mockHttpPost.mockResolvedValue({ ok: true, data: { id: 'tpl_new' } });
    });

    it('calls httpClient.putFile for a small file (< 30 MB)', async () => {
        mockHttpPutFile.mockResolvedValueOnce({ ok: true });

        await apiService.uploadTemplate(UPLOAD_DATA_SMALL);

        expect(mockHttpPutFile).toHaveBeenCalledWith(
            '/templates/tpl_new/file',
            SMALL_FILE,
            'application/octet-stream'
        );
    });

    it('calls onProgress(100) after the single-shot upload completes', async () => {
        const onProgress = jest.fn();
        mockHttpPutFile.mockResolvedValueOnce({ ok: true });

        await apiService.uploadTemplate({ ...UPLOAD_DATA_SMALL, onProgress });

        expect(onProgress).toHaveBeenCalledWith(100);
    });

    it('returns { success: true, id } on full success', async () => {
        mockHttpPutFile.mockResolvedValueOnce({ ok: true });

        const result = await apiService.uploadTemplate(UPLOAD_DATA_SMALL);

        expect(result.success).toBe(true);
        expect(result.id).toBe('tpl_new');
    });

    it('returns { success: false, id } when putFile fails (metadata was created)', async () => {
        mockHttpPutFile.mockResolvedValueOnce({ ok: false, status: 500, message: 'Storage unavailable' });

        const result = await apiService.uploadTemplate(UPLOAD_DATA_SMALL);

        expect(result.success).toBe(false);
        // id is still returned so the caller can clean up the orphaned metadata
        expect(result.id).toBe('tpl_new');
    });
});

// =============================================================================
// uploadTemplate() — chunked upload (file >= 30 MB)
// =============================================================================

describe('apiService.uploadTemplate() — chunked upload', () => {

    // The large file (31 MB) will be split into 4 chunks (10 MB each).
    // Each chunk requires: GET presign → PUT to MinIO.

    const UPLOAD_ID = 'multipart_upload_abc';
    const PRESIGNED_URL = 'https://minio.example.com/presigned?part=';

    function mockChunkedFlow(partCount: number) {
        // Step 0: metadata
        mockHttpPost
            .mockResolvedValueOnce({ ok: true, data: { id: 'tpl_chunked' } })  // POST /templates
            .mockResolvedValueOnce({ ok: true, data: {} });                     // POST …/initiate (see below — reordered via different mock)

        // Re-set precise mocks for chunked steps
        mockHttpPost.mockReset();
        mockHttpPost
            .mockResolvedValueOnce({ ok: true, data: { id: 'tpl_chunked' } })                 // POST /templates (metadata)
            .mockResolvedValueOnce({ ok: true, data: { uploadId: UPLOAD_ID } })               // POST …/file/initiate
            .mockResolvedValueOnce({ ok: true, data: {} });                                   // POST …/file/complete

        // GET presign for each part
        for (let i = 1; i <= partCount; i++) {
            mockHttpGet.mockResolvedValueOnce({ ok: true, data: { url: `${PRESIGNED_URL}${i}`, partNumber: i } });
        }

        // PUT to MinIO for each part
        for (let i = 1; i <= partCount; i++) {
            mockFetch.mockResolvedValueOnce({
                ok: true,
                status: 200,
                headers: { get: (h: string) => h === 'ETag' ? `"etag-part-${i}"` : null },
            });
        }
    }

    it('initiates multipart upload via POST /templates/{id}/file/initiate', async () => {
        const EXPECTED_PARTS = Math.ceil(LARGE_FILE.size / (10 * 1024 * 1024));
        mockChunkedFlow(EXPECTED_PARTS);

        await apiService.uploadTemplate(UPLOAD_DATA_LARGE);

        // Second POST call is the initiate
        const initCall = mockHttpPost.mock.calls.find(
            ([path]: [string]) => path.includes('/file/initiate')
        );
        expect(initCall).toBeDefined();
        expect(initCall![0]).toMatch(/\/templates\/tpl_chunked\/file\/initiate/);
    });

    it('requests a presigned URL for every part', async () => {
        const EXPECTED_PARTS = Math.ceil(LARGE_FILE.size / (10 * 1024 * 1024));
        mockChunkedFlow(EXPECTED_PARTS);

        await apiService.uploadTemplate(UPLOAD_DATA_LARGE);

        const presignCalls = mockHttpGet.mock.calls.filter(
            ([path]: [string]) => path.includes('/file/presign')
        );
        expect(presignCalls).toHaveLength(EXPECTED_PARTS);
    });

    it('PUTs each chunk directly to the MinIO presigned URL', async () => {
        const EXPECTED_PARTS = Math.ceil(LARGE_FILE.size / (10 * 1024 * 1024));
        mockChunkedFlow(EXPECTED_PARTS);

        await apiService.uploadTemplate(UPLOAD_DATA_LARGE);

        expect(mockFetch).toHaveBeenCalledTimes(EXPECTED_PARTS);
        // Every fetch call must be a PUT to a MinIO presigned URL
        for (const [url, opts] of mockFetch.mock.calls) {
            expect(url).toContain('minio.example.com');
            expect(opts.method).toBe('PUT');
        }
    });

    it('completes multipart upload via POST /templates/{id}/file/complete with parts list', async () => {
        const EXPECTED_PARTS = Math.ceil(LARGE_FILE.size / (10 * 1024 * 1024));
        mockChunkedFlow(EXPECTED_PARTS);

        await apiService.uploadTemplate(UPLOAD_DATA_LARGE);

        const completeCall = mockHttpPost.mock.calls.find(
            ([path]: [string]) => path.includes('/file/complete')
        );
        expect(completeCall).toBeDefined();
        const [, body] = completeCall!;
        expect(body.uploadId).toBe(UPLOAD_ID);
        expect(Array.isArray(body.parts)).toBe(true);
        expect(body.parts).toHaveLength(EXPECTED_PARTS);
    });

    it('calls onProgress() once per part', async () => {
        const EXPECTED_PARTS = Math.ceil(LARGE_FILE.size / (10 * 1024 * 1024));
        const onProgress = jest.fn();
        mockChunkedFlow(EXPECTED_PARTS);

        await apiService.uploadTemplate({ ...UPLOAD_DATA_LARGE, onProgress });

        expect(onProgress).toHaveBeenCalledTimes(EXPECTED_PARTS);
        // Last call should be 100%
        expect(onProgress).toHaveBeenLastCalledWith(100);
    });

    it('aborts the multipart upload when a MinIO part PUT fails', async () => {
        // Metadata + initiate succeed
        mockHttpPost
            .mockResolvedValueOnce({ ok: true, data: { id: 'tpl_chunked' } })
            .mockResolvedValueOnce({ ok: true, data: { uploadId: UPLOAD_ID } })
            .mockResolvedValueOnce({ ok: true, data: {} }); // abort response

        // First presign succeeds
        mockHttpGet.mockResolvedValueOnce({ ok: true, data: { url: `${PRESIGNED_URL}1`, partNumber: 1 } });

        // First MinIO PUT fails
        mockFetch.mockResolvedValueOnce({ ok: false, status: 503 });

        const result = await apiService.uploadTemplate(UPLOAD_DATA_LARGE);

        // Abort should have been called
        const abortCall = mockHttpPost.mock.calls.find(
            ([path]: [string]) => path.includes('/file/abort')
        );
        expect(abortCall).toBeDefined();
        expect(result.success).toBe(false);
    });
});

// =============================================================================
// updateTemplate()
// =============================================================================

describe('apiService.updateTemplate()', () => {

    it('strips file, fileData, fileUrl, and onProgress from the metadata PUT payload', async () => {
        mockHttpPut.mockResolvedValueOnce({ ok: true });

        await apiService.updateTemplate('tpl_001', {
            name:       'Updated NDA',
            file:       SMALL_FILE,
            fileData:   'base64==',
            fileUrl:    'https://minio.example.com/tpl_001',
            onProgress: jest.fn(),
        });

        const [, payload] = mockHttpPut.mock.calls[0];
        expect(payload.file).toBeUndefined();
        expect(payload.fileData).toBeUndefined();
        expect(payload.fileUrl).toBeUndefined();
        expect(payload.onProgress).toBeUndefined();
        expect(payload.name).toBe('Updated NDA');
    });

    it('returns failure when metadata PUT fails — no file upload attempted', async () => {
        mockHttpPut.mockResolvedValueOnce({ ok: false, message: 'Not found' });

        const result = await apiService.updateTemplate('tpl_001', { name: 'Updated NDA', file: SMALL_FILE });

        expect(result.success).toBe(false);
        expect(mockHttpPutFile).not.toHaveBeenCalled();
        expect(mockFetch).not.toHaveBeenCalled();
    });

    it('skips file upload step when no file is provided', async () => {
        mockHttpPut.mockResolvedValueOnce({ ok: true });

        await apiService.updateTemplate('tpl_001', { name: 'Renamed NDA' });

        expect(mockHttpPutFile).not.toHaveBeenCalled();
        expect(mockFetch).not.toHaveBeenCalled();
    });

    it('uploads new small file via single-shot when a file is provided', async () => {
        mockHttpPut.mockResolvedValueOnce({ ok: true });
        mockHttpPutFile.mockResolvedValueOnce({ ok: true });

        await apiService.updateTemplate('tpl_001', { name: 'Updated', file: SMALL_FILE });

        expect(mockHttpPutFile).toHaveBeenCalledWith(
            '/templates/tpl_001/file',
            SMALL_FILE,
            'application/octet-stream'
        );
    });

    it('returns { success: true } on full success without a new file', async () => {
        mockHttpPut.mockResolvedValueOnce({ ok: true });

        const result = await apiService.updateTemplate('tpl_001', { name: 'Updated NDA' });

        expect(result.success).toBe(true);
    });

    it('returns { success: true } on full success with a new small file', async () => {
        mockHttpPut.mockResolvedValueOnce({ ok: true });
        mockHttpPutFile.mockResolvedValueOnce({ ok: true });

        const result = await apiService.updateTemplate('tpl_001', { name: 'Updated NDA', file: SMALL_FILE });

        expect(result.success).toBe(true);
    });
});

// =============================================================================
// deleteTemplate()
// =============================================================================

describe('apiService.deleteTemplate()', () => {

    it('calls DELETE /templates/{id} with the correct id', async () => {
        mockHttpDelete.mockResolvedValueOnce({ ok: true, status: 204 });

        await apiService.deleteTemplate('tpl_001');

        expect(mockHttpDelete).toHaveBeenCalledWith('/templates/tpl_001');
    });

    it('returns { success: true } on 204 No Content', async () => {
        mockHttpDelete.mockResolvedValueOnce({ ok: true, status: 204 });

        const result = await apiService.deleteTemplate('tpl_001');

        expect(result.success).toBe(true);
        expect(result.message).toBe('Template deleted successfully');
    });

    it('returns { success: true } on 200 OK', async () => {
        mockHttpDelete.mockResolvedValueOnce({ ok: true, status: 200 });

        const result = await apiService.deleteTemplate('tpl_001');

        expect(result.success).toBe(true);
    });

    it('returns { success: false } when backend returns a non-2xx status', async () => {
        mockHttpDelete.mockResolvedValueOnce({ ok: false, status: 404, message: 'Template not found' });

        const result = await apiService.deleteTemplate('unknown_id');

        expect(result.success).toBe(false);
        expect(result.message).toBe('Template not found');
    });

    it('falls back to a generic message when backend provides none', async () => {
        mockHttpDelete.mockResolvedValueOnce({ ok: false, status: 500, message: '' });

        const result = await apiService.deleteTemplate('tpl_001');

        expect(result.success).toBe(false);
        expect(result.message).toBeTruthy();
    });
});
