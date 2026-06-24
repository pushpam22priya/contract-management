/**
 * UNIT TESTS — apiService contract methods
 * (src/services/apiService.ts — contract section)
 *
 * httpClient is mocked at the module boundary.
 * global.fetch is mocked for MinIO presigned PUT calls (chunked upload).
 * authService is stubbed to prevent import errors.
 *
 * Scenarios covered:
 *
 * getContracts()
 *  1.  Returns normalized contract list (id resolved from c.id or c._id)
 *  2.  Returns an empty array when backend responds with ok=false
 *  3.  Returns an empty array when backend data is not an array
 *
 * getInboxContracts()
 *  4.  Returns normalized inbox contract list on success
 *  5.  Returns an empty array when the backend responds with ok=false
 *
 * getContractDetails(id)
 *  6.  Returns contract with id normalized on success
 *  7.  Returns null when backend responds with ok=false
 *  8.  Returns null when response data is falsy
 *
 * createContract(data)
 *  9.  POSTs to /contracts with the provided data
 * 10.  Returns { success: true, id } when backend returns id in data.id
 * 11.  Returns { success: true, id } when backend returns id in data._id (fallback)
 * 12.  Returns { success: false, message } on a non-ok response
 *
 * saveContractPdf() — single-shot (< 30 MB)
 * 13.  Calls httpClient.putFile with content-type application/pdf for small blobs
 * 14.  Calls onProgress(100) after a successful single-shot upload
 * 15.  Returns { success: true } on a successful upload
 * 16.  Returns { success: false } when putFile returns a non-ok response
 *
 * saveContractPdf() — chunked multipart (>= 30 MB)
 * 17.  Initiates multipart upload via POST /contracts/{id}/file/initiate
 * 18.  Requests a presigned URL for each part via GET /contracts/{id}/file/presign
 * 19.  PUTs each chunk directly to the MinIO presigned URL via global.fetch
 * 20.  Completes upload via POST /contracts/{id}/file/complete with ETag-stamped parts
 * 21.  Returns { success: true } after a complete chunked upload
 * 22.  Sends abort when a MinIO PUT fails and returns { success: false }
 *
 * getContractViewUrl(id)
 * 23.  Returns the presigned URL string on success
 * 24.  Returns null when the backend responds with ok=false
 * 25.  Returns null when the url field is absent from the response data
 *
 * updateContractDocument(id, data)
 * 26.  PATCHes /contracts/{id} with the provided data
 * 27.  Returns { success: true } on an ok response
 * 28.  Returns { success: false, message } on failure
 *
 * updateContractMetadata(id, updates)
 * 29.  PATCHes /contracts/{id} with the provided updates
 * 30.  Returns { success: true } on an ok response
 * 31.  Returns { success: false, message } on failure
 *
 * deleteContract(id)
 * 32.  Calls DELETE /contracts/{id}
 * 33.  Returns { success: true } when response.ok is true
 * 34.  Returns { success: true } on 204 No Content (status=204, ok=false)
 * 35.  Returns { success: false, message } on a non-2xx failure
 */

// ─── httpClient mock ──────────────────────────────────────────────────────────

const mockHttpGet     = jest.fn();
const mockHttpPost    = jest.fn();
const mockHttpPutFile = jest.fn();
const mockHttpPatch   = jest.fn();
const mockHttpDelete  = jest.fn();

jest.mock('@/lib/httpClient', () => ({
    httpClient: {
        get:     (...a: any[]) => mockHttpGet(...a),
        post:    (...a: any[]) => mockHttpPost(...a),
        putFile: (...a: any[]) => mockHttpPutFile(...a),
        patch:   (...a: any[]) => mockHttpPatch(...a),
        delete:  (...a: any[]) => mockHttpDelete(...a),
    },
}));

// ─── authService stub ─────────────────────────────────────────────────────────

jest.mock('@/services/authService', () => ({
    authService: {
        getCurrentUser: jest.fn().mockReturnValue({ email: 'user@example.com' }),
    },
}));

// ─── Imports ──────────────────────────────────────────────────────────────────

import { apiService } from '@/services/apiService';

// ─── Helpers ──────────────────────────────────────────────────────────────────

const ok   = (data: any, message = 'OK')   => ({ ok: true,  data, status: 200, message });
const fail = (status: number, msg = 'Error') => ({ ok: false, data: null, status, message: msg });

const CONTRACT_ID       = 'contract_abc123';
const SMALL_PDF         = new Blob(['%PDF-1.4 small'], { type: 'application/pdf' });
const CHUNKED_THRESHOLD = 30 * 1024 * 1024; // 30 MB — matches apiService internal constant
const CHUNK_SIZE        = 10 * 1024 * 1024; // 10 MB per part

// ─── fetch mock ───────────────────────────────────────────────────────────────

const mockFetch = jest.fn();
(global as any).fetch = mockFetch;

// Returns a minimal MinIO-like PUT response with the given ETag header value
const eTagOk = (eTag = 'etag123') =>
    Promise.resolve({ ok: true, headers: { get: (h: string) => h === 'ETag' ? `"${eTag}"` : null } });

// Creates a Blob whose actual byte count equals exactly CHUNKED_THRESHOLD so that
// Math.ceil(size / CHUNK_SIZE) = Math.ceil(3.0) = 3 parts, triggering the chunked path.
const OVERSIZED_BLOB = new Blob([new Uint8Array(CHUNKED_THRESHOLD)]);

beforeEach(() => {
    jest.clearAllMocks();
    mockFetch.mockImplementation(() => eTagOk());
});

// =============================================================================
// getContracts()
// =============================================================================

describe('apiService.getContracts()', () => {

    it('returns a normalized list with id resolved from c.id or c._id', async () => {
        mockHttpGet.mockResolvedValueOnce(ok([
            { _id: 'id_from_underscore', title: 'Contract A', status: 'DRAFT'  },
            { id:  'id_from_field',      title: 'Contract B', status: 'ACTIVE' },
        ]));

        const result = await apiService.getContracts();

        expect(result).toHaveLength(2);
        expect(result[0].id).toBe('id_from_underscore');
        expect(result[1].id).toBe('id_from_field');
    });

    it('returns an empty array when the backend responds with ok=false', async () => {
        mockHttpGet.mockResolvedValueOnce(fail(500, 'Internal Server Error'));

        expect(await apiService.getContracts()).toEqual([]);
    });

    it('returns an empty array when backend data is not an array', async () => {
        mockHttpGet.mockResolvedValueOnce(ok({ unexpected: 'object' }));

        expect(await apiService.getContracts()).toEqual([]);
    });
});

// =============================================================================
// getInboxContracts()
// =============================================================================

describe('apiService.getInboxContracts()', () => {

    it('returns normalized inbox contracts on success', async () => {
        mockHttpGet.mockResolvedValueOnce(ok([{ _id: 'inbox_1', status: 'IN_REVIEW' }]));

        const result = await apiService.getInboxContracts();

        expect(result).toHaveLength(1);
        expect(result[0].id).toBe('inbox_1');
        expect(mockHttpGet).toHaveBeenCalledWith('/contracts/inbox');
    });

    it('returns an empty array when the backend responds with ok=false', async () => {
        mockHttpGet.mockResolvedValueOnce(fail(403, 'Forbidden'));

        expect(await apiService.getInboxContracts()).toEqual([]);
    });
});

// =============================================================================
// getContractDetails()
// =============================================================================

describe('apiService.getContractDetails()', () => {

    it('returns the contract with id normalized from the response data', async () => {
        mockHttpGet.mockResolvedValueOnce(ok({
            _id: CONTRACT_ID, title: 'Detail Contract', status: 'ACTIVE',
        }));

        const result = await apiService.getContractDetails(CONTRACT_ID);

        expect(result).not.toBeNull();
        expect(result!.id).toBe(CONTRACT_ID);
        expect(result!.title).toBe('Detail Contract');
        expect(mockHttpGet).toHaveBeenCalledWith(`/contracts/${CONTRACT_ID}`);
    });

    it('returns null when the backend responds with ok=false', async () => {
        mockHttpGet.mockResolvedValueOnce(fail(404, 'Contract not found'));

        expect(await apiService.getContractDetails(CONTRACT_ID)).toBeNull();
    });

    it('returns null when response data is falsy', async () => {
        mockHttpGet.mockResolvedValueOnce({ ok: true, data: null, status: 200 });

        expect(await apiService.getContractDetails(CONTRACT_ID)).toBeNull();
    });
});

// =============================================================================
// createContract()
// =============================================================================

describe('apiService.createContract()', () => {

    const payload = { title: 'New Contract', status: 'DRAFT', templateId: 'tmpl_001' };

    it('POSTs to /contracts with the provided data', async () => {
        mockHttpPost.mockResolvedValueOnce(ok({ id: 'created_id' }));

        await apiService.createContract(payload);

        expect(mockHttpPost).toHaveBeenCalledWith('/contracts', payload);
    });

    it('returns { success: true, id } when backend returns id in data.id', async () => {
        mockHttpPost.mockResolvedValueOnce(ok({ id: 'new_contract_id' }));

        const result = await apiService.createContract(payload);

        expect(result).toEqual({ success: true, id: 'new_contract_id' });
    });

    it('returns { success: true, id } when backend returns id in data._id (fallback)', async () => {
        mockHttpPost.mockResolvedValueOnce(ok({ _id: 'mongo_object_id' }));

        const result = await apiService.createContract(payload);

        expect(result).toEqual({ success: true, id: 'mongo_object_id' });
    });

    it('returns { success: false, message } on a non-ok response', async () => {
        mockHttpPost.mockResolvedValueOnce(fail(400, 'Title is required'));

        const result = await apiService.createContract(payload);

        expect(result).toEqual({ success: false, message: 'Title is required' });
    });
});

// =============================================================================
// saveContractPdf() — single-shot (< 30 MB)
// =============================================================================

describe('apiService.saveContractPdf() — single-shot', () => {

    it('calls httpClient.putFile with application/pdf for blobs under 30 MB', async () => {
        mockHttpPutFile.mockResolvedValueOnce({ ok: true, status: 200 });

        await apiService.saveContractPdf(CONTRACT_ID, SMALL_PDF);

        expect(mockHttpPutFile).toHaveBeenCalledWith(
            `/contracts/${CONTRACT_ID}/file`,
            SMALL_PDF,
            'application/pdf'
        );
    });

    it('calls onProgress(100) after a successful upload', async () => {
        mockHttpPutFile.mockResolvedValueOnce({ ok: true, status: 200 });
        const onProgress = jest.fn();

        await apiService.saveContractPdf(CONTRACT_ID, SMALL_PDF, onProgress);

        expect(onProgress).toHaveBeenCalledWith(100);
    });

    it('returns { success: true } on a successful upload', async () => {
        mockHttpPutFile.mockResolvedValueOnce({ ok: true, status: 200 });

        const result = await apiService.saveContractPdf(CONTRACT_ID, SMALL_PDF);

        expect(result).toEqual({ success: true });
    });

    it('returns { success: false } when putFile returns a non-ok response', async () => {
        mockHttpPutFile.mockResolvedValueOnce({ ok: false, status: 413, message: 'Payload Too Large' });

        const result = await apiService.saveContractPdf(CONTRACT_ID, SMALL_PDF);

        expect(result.success).toBe(false);
        expect(result.message).toMatch(/Payload Too Large|Upload failed/);
    });
});

// =============================================================================
// saveContractPdf() — chunked multipart (>= 30 MB)
// =============================================================================

describe('apiService.saveContractPdf() — chunked upload', () => {

    // OVERSIZED_BLOB is exactly 30 MB → Math.ceil(30MB / 10MB) = 3 parts

    function setupChunkedMocks(uploadId = 'upload_xyz') {
        mockHttpPost.mockResolvedValueOnce(ok({ uploadId })); // initiate
        for (let i = 1; i <= 3; i++) {
            mockHttpGet.mockResolvedValueOnce(ok({ url: `https://minio/part${i}`, partNumber: i }));
        }
        mockHttpPost.mockResolvedValueOnce(ok({})); // complete
    }

    it('initiates multipart upload via POST /contracts/{id}/file/initiate', async () => {
        setupChunkedMocks();

        await apiService.saveContractPdf(CONTRACT_ID, OVERSIZED_BLOB);

        expect(mockHttpPost).toHaveBeenNthCalledWith(1, `/contracts/${CONTRACT_ID}/file/initiate`, {});
    });

    it('requests a presigned URL for each part via GET /contracts/{id}/file/presign', async () => {
        setupChunkedMocks('upload_123');

        await apiService.saveContractPdf(CONTRACT_ID, OVERSIZED_BLOB);

        expect(mockHttpGet).toHaveBeenCalledTimes(3);
        expect(mockHttpGet).toHaveBeenNthCalledWith(
            1,
            `/contracts/${CONTRACT_ID}/file/presign?uploadId=upload_123&partNumber=1`
        );
    });

    it('PUTs each chunk to the MinIO presigned URL via global.fetch', async () => {
        setupChunkedMocks();

        await apiService.saveContractPdf(CONTRACT_ID, OVERSIZED_BLOB);

        expect(mockFetch).toHaveBeenCalledTimes(3);
        expect(mockFetch).toHaveBeenNthCalledWith(
            1,
            'https://minio/part1',
            expect.objectContaining({ method: 'PUT' })
        );
    });

    it('completes upload via POST /contracts/{id}/file/complete with ETag-stamped parts', async () => {
        setupChunkedMocks('upload_xyz');

        await apiService.saveContractPdf(CONTRACT_ID, OVERSIZED_BLOB);

        expect(mockHttpPost).toHaveBeenNthCalledWith(
            2,
            `/contracts/${CONTRACT_ID}/file/complete`,
            {
                uploadId: 'upload_xyz',
                parts: [
                    { partNumber: 1, eTag: 'etag123' },
                    { partNumber: 2, eTag: 'etag123' },
                    { partNumber: 3, eTag: 'etag123' },
                ],
            }
        );
    });

    it('returns { success: true } after a complete chunked upload', async () => {
        setupChunkedMocks();

        const result = await apiService.saveContractPdf(CONTRACT_ID, OVERSIZED_BLOB);

        expect(result).toEqual({ success: true });
    });

    it('sends an abort request and returns { success: false } when a MinIO PUT fails', async () => {
        mockHttpPost.mockResolvedValueOnce(ok({ uploadId: 'upload_to_abort' })); // initiate
        mockHttpGet.mockResolvedValueOnce(ok({ url: 'https://minio/part1', partNumber: 1 }));
        mockFetch.mockResolvedValueOnce({ ok: false, status: 500, headers: { get: () => null } });
        mockHttpPost.mockResolvedValueOnce(ok({})); // abort

        const result = await apiService.saveContractPdf(CONTRACT_ID, OVERSIZED_BLOB);

        expect(mockHttpPost).toHaveBeenCalledWith(
            `/contracts/${CONTRACT_ID}/file/abort?uploadId=${encodeURIComponent('upload_to_abort')}`,
            {}
        );
        expect(result.success).toBe(false);
    });
});

// =============================================================================
// getContractViewUrl()
// =============================================================================

describe('apiService.getContractViewUrl()', () => {

    it('returns the presigned URL string on success', async () => {
        const url = 'https://minio.example.com/contracts/abc.pdf?X-Amz-Signature=xyz';
        mockHttpGet.mockResolvedValueOnce(ok({ url }));

        const result = await apiService.getContractViewUrl(CONTRACT_ID);

        expect(result).toBe(url);
        expect(mockHttpGet).toHaveBeenCalledWith(`/contracts/${CONTRACT_ID}/file/view-url`);
    });

    it('returns null when the backend responds with ok=false', async () => {
        mockHttpGet.mockResolvedValueOnce(fail(404, 'File not found'));

        expect(await apiService.getContractViewUrl(CONTRACT_ID)).toBeNull();
    });

    it('returns null when the url field is absent from the response data', async () => {
        mockHttpGet.mockResolvedValueOnce(ok({ url: undefined }));

        expect(await apiService.getContractViewUrl(CONTRACT_ID)).toBeNull();
    });
});

// =============================================================================
// updateContractDocument()
// =============================================================================

describe('apiService.updateContractDocument()', () => {

    it('PATCHes /contracts/{id} with the provided fields', async () => {
        mockHttpPatch.mockResolvedValueOnce(ok({}));
        const updates = { xfdfData: '<xfdf/>', fieldValues: { name: 'Alice' } };

        await apiService.updateContractDocument(CONTRACT_ID, updates);

        expect(mockHttpPatch).toHaveBeenCalledWith(`/contracts/${CONTRACT_ID}`, updates);
    });

    it('returns { success: true } on an ok response', async () => {
        mockHttpPatch.mockResolvedValueOnce(ok({}));

        const result = await apiService.updateContractDocument(CONTRACT_ID, { xfdfData: '<xfdf/>' });

        expect(result).toEqual({ success: true });
    });

    it('returns { success: false, message } when the PATCH fails', async () => {
        mockHttpPatch.mockResolvedValueOnce(fail(404, 'Contract not found'));

        const result = await apiService.updateContractDocument(CONTRACT_ID, { xfdfData: '' });

        expect(result).toEqual({ success: false, message: 'Contract not found' });
    });
});

// =============================================================================
// updateContractMetadata()
// =============================================================================

describe('apiService.updateContractMetadata()', () => {

    it('PATCHes /contracts/{id} with the provided metadata updates', async () => {
        mockHttpPatch.mockResolvedValueOnce(ok({ message: 'Updated' }));
        const updates = { status: 'IN_REVIEW', reviewers: [{ email: 'rev@example.com' }] };

        await apiService.updateContractMetadata(CONTRACT_ID, updates);

        expect(mockHttpPatch).toHaveBeenCalledWith(`/contracts/${CONTRACT_ID}`, updates);
    });

    it('returns { success: true } on an ok response', async () => {
        mockHttpPatch.mockResolvedValueOnce(ok({ message: 'Updated' }));

        const result = await apiService.updateContractMetadata(CONTRACT_ID, { status: 'ACTIVE' });

        expect(result.success).toBe(true);
    });

    it('returns { success: false, message } when the PATCH fails', async () => {
        mockHttpPatch.mockResolvedValueOnce(fail(400, 'Invalid status transition'));

        const result = await apiService.updateContractMetadata(CONTRACT_ID, { status: 'INVALID' });

        expect(result).toEqual({ success: false, message: 'Invalid status transition' });
    });
});

// =============================================================================
// deleteContract()
// =============================================================================

describe('apiService.deleteContract()', () => {

    it('calls DELETE /contracts/{id}', async () => {
        mockHttpDelete.mockResolvedValueOnce({ ok: true, status: 200, data: null });

        await apiService.deleteContract(CONTRACT_ID);

        expect(mockHttpDelete).toHaveBeenCalledWith(`/contracts/${CONTRACT_ID}`);
    });

    it('returns { success: true, message } when response.ok is true', async () => {
        mockHttpDelete.mockResolvedValueOnce({ ok: true, status: 200, data: null });

        const result = await apiService.deleteContract(CONTRACT_ID);

        expect(result).toEqual({ success: true, message: 'Contract deleted successfully' });
    });

    it('returns { success: true } on 204 No Content (ok=false, status=204)', async () => {
        mockHttpDelete.mockResolvedValueOnce({ ok: false, status: 204, data: null, message: '' });

        const result = await apiService.deleteContract(CONTRACT_ID);

        expect(result).toEqual({ success: true, message: 'Contract deleted successfully' });
    });

    it('returns { success: false, message } on a non-2xx failure', async () => {
        mockHttpDelete.mockResolvedValueOnce(
            fail(403, 'Not authorized to delete this contract')
        );

        const result = await apiService.deleteContract(CONTRACT_ID);

        expect(result).toEqual({ success: false, message: 'Not authorized to delete this contract' });
    });
});
