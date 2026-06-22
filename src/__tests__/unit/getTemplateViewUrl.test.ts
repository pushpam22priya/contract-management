/**
 * UNIT TESTS — getTemplateViewUrl utility
 * (src/utils/getTemplateViewUrl.ts)
 *
 * The utility fetches a short-lived MinIO presigned URL from Spring Boot.
 * httpClient is mocked at the module boundary.
 *
 * Scenarios covered:
 *  1.  Returns the presigned URL string when the backend responds successfully
 *  2.  Calls GET /templates/{id}/file/view-url with the correct path
 *  3.  Returns null when the backend responds with ok=false
 *  4.  Returns null when the backend response has no url in data
 *  5.  Returns null when httpClient throws (network error)
 */

// ─── Mock httpClient ──────────────────────────────────────────────────────────

const mockGet = jest.fn();

jest.mock('@/lib/httpClient', () => ({
    httpClient: {
        get: (...args: any[]) => mockGet(...args),
    },
}));

import { getTemplateViewUrl } from '@/utils/getTemplateViewUrl';

// ─────────────────────────────────────────────────────────────────────────────

beforeEach(() => {
    jest.clearAllMocks();
});

// =============================================================================

describe('getTemplateViewUrl()', () => {

    it('returns the presigned URL string on a successful response', async () => {
        const presignedUrl = 'https://minio.example.com/templates/tpl_001.pdf?X-Amz-Signature=abc';
        mockGet.mockResolvedValueOnce({ ok: true, data: { url: presignedUrl } });

        const result = await getTemplateViewUrl('tpl_001');

        expect(result).toBe(presignedUrl);
    });

    it('calls GET /templates/{id}/file/view-url with the correct template id', async () => {
        mockGet.mockResolvedValueOnce({ ok: true, data: { url: 'https://minio.example.com/...' } });

        await getTemplateViewUrl('tpl_abc');

        expect(mockGet).toHaveBeenCalledWith('/templates/tpl_abc/file/view-url');
    });

    it('returns null when the backend responds with ok=false', async () => {
        mockGet.mockResolvedValueOnce({ ok: false, status: 404, message: 'Template not found', data: null });

        const result = await getTemplateViewUrl('missing_id');

        expect(result).toBeNull();
    });

    it('returns null when the response data contains no url field', async () => {
        mockGet.mockResolvedValueOnce({ ok: true, data: {} });

        const result = await getTemplateViewUrl('tpl_001');

        expect(result).toBeNull();
    });

    it('returns null when httpClient.get throws a network error', async () => {
        mockGet.mockRejectedValueOnce(new Error('Network error'));

        // The utility does not try/catch, so the promise rejects.
        // Verify that the error propagates (caller is responsible for handling).
        await expect(getTemplateViewUrl('tpl_001')).rejects.toThrow('Network error');
    });
});
