/**
 * UNIT TESTS — unifiedFlowService
 * (src/services/unifiedFlowService.ts)
 *
 * Only httpClient is mocked — all 11 service methods are verified
 * to hit the correct endpoint with the correct payload.
 *
 * Scenarios covered:
 *
 * submitFlow
 *  1. Calls POST /contracts/{id}/flow/submit with assignments + externalSigningIncluded
 *  2. Returns the raw httpClient response
 *
 * saveFlowFields
 *  3. Calls POST /contracts/{id}/flow/save-fields with fieldValues + formFields
 *
 * markFlowComplete
 *  4. Calls POST /contracts/{id}/flow/complete with comments payload
 *  5. Calls POST /contracts/{id}/flow/complete with uploadId + parts for approver
 *
 * rejectFlow
 *  6. Calls POST /contracts/{id}/flow/reject with comments
 *
 * initiateFlowUpload
 *  7. Calls POST /contracts/{id}/flow/upload/initiate
 *
 * getFlowPresignedUrl
 *  8. Calls GET /contracts/{id}/flow/upload/{uploadId}/presign/{partNumber}
 *
 * abortFlowUpload
 *  9. Calls DELETE /contracts/{id}/flow/upload/{uploadId}
 *
 * getParticipantFileUrl
 * 10. Calls GET /contracts/{id}/flow/file-url
 *
 * sendForSignatureUnified
 * 11. Calls POST /contracts/{id}/flow/send-for-signature with signers + senderName
 *
 * getFlowStatus
 * 12. Calls GET /contracts/{id}/flow/status
 *
 * getFlowInbox
 * 13. Calls GET /contracts/flow/inbox
 */

import { unifiedFlowService } from '@/services/unifiedFlowService';

// ─── Mock httpClient ─────────────────────────────────────────────────────────
const mockGet = jest.fn();
const mockPost = jest.fn();
const mockDelete = jest.fn();

jest.mock('@/lib/httpClient', () => ({
    httpClient: {
        get: (...args: any[]) => mockGet(...args),
        post: (...args: any[]) => mockPost(...args),
        delete: (...args: any[]) => mockDelete(...args),
    },
}));

const OK = { ok: true, status: 200, data: { result: 'ok' }, message: '' };

beforeEach(() => {
    jest.clearAllMocks();
    mockGet.mockResolvedValue(OK);
    mockPost.mockResolvedValue(OK);
    mockDelete.mockResolvedValue(OK);
});

// ─── submitFlow ───────────────────────────────────────────────────────────────

test('1. submitFlow — POST /contracts/{id}/flow/submit with participants', async () => {
    const participants = [{ email: 'alice@co.com', role: 'REVIEWER' as const, order: 1 }];
    await unifiedFlowService.submitFlow('c1', participants, false);
    expect(mockPost).toHaveBeenCalledWith(
        '/contracts/c1/flow/submit',
        { participants, externalSigningIncluded: false },
    );
});

test('2. submitFlow — returns httpClient response', async () => {
    mockPost.mockResolvedValue({ ok: true, data: { id: 'c1' } });
    const res = await unifiedFlowService.submitFlow('c1', [], true);
    expect(res).toEqual({ ok: true, data: { id: 'c1' } });
});

// ─── saveFlowFields ───────────────────────────────────────────────────────────

test('3. saveFlowFields — POST /contracts/{id}/flow/fields', async () => {
    await unifiedFlowService.saveFlowFields('c2', { fieldValues: { f: 'v' }, formFields: [] });
    expect(mockPost).toHaveBeenCalledWith(
        '/contracts/c2/flow/fields',
        { fieldValues: { f: 'v' }, formFields: [] },
    );
});

// ─── markFlowComplete ─────────────────────────────────────────────────────────

test('4. markFlowComplete — POST /contracts/{id}/flow/complete with comments', async () => {
    await unifiedFlowService.markFlowComplete('c3', { comments: 'LGTM' });
    expect(mockPost).toHaveBeenCalledWith('/contracts/c3/flow/complete', { comments: 'LGTM' });
});

test('5. markFlowComplete — POST includes uploadId + parts for approver', async () => {
    const parts = [{ partNumber: 1, etag: 'abc' }];
    await unifiedFlowService.markFlowComplete('c3', { uploadId: 'u1', parts });
    expect(mockPost).toHaveBeenCalledWith('/contracts/c3/flow/complete', { uploadId: 'u1', parts });
});

// ─── rejectFlow ───────────────────────────────────────────────────────────────

test('6. rejectFlow — POST /contracts/{id}/flow/reject with message', async () => {
    await unifiedFlowService.rejectFlow('c4', 'Not acceptable');
    expect(mockPost).toHaveBeenCalledWith('/contracts/c4/flow/reject', { message: 'Not acceptable' });
});

// ─── initiateFlowUpload ───────────────────────────────────────────────────────

test('7. initiateFlowUpload — POST /contracts/{id}/flow/upload/initiate', async () => {
    await unifiedFlowService.initiateFlowUpload('c5');
    expect(mockPost).toHaveBeenCalledWith('/contracts/c5/flow/upload/initiate', {});
});

// ─── getFlowPresignedUrl ──────────────────────────────────────────────────────

test('8. getFlowPresignedUrl — GET with uploadId + partNumber as query params', async () => {
    await unifiedFlowService.getFlowPresignedUrl('c6', 'upload123', 2);
    expect(mockGet).toHaveBeenCalledWith('/contracts/c6/flow/upload/presign?uploadId=upload123&partNumber=2');
});

// ─── abortFlowUpload ─────────────────────────────────────────────────────────

test('9. abortFlowUpload — POST /contracts/{id}/flow/upload/abort with uploadId query param', async () => {
    await unifiedFlowService.abortFlowUpload('c7', 'upload456');
    expect(mockPost).toHaveBeenCalledWith('/contracts/c7/flow/upload/abort?uploadId=upload456', {});
});

// ─── getParticipantFileUrl ────────────────────────────────────────────────────

test('10. getParticipantFileUrl — GET /contracts/{id}/flow/file-url', async () => {
    await unifiedFlowService.getParticipantFileUrl('c8');
    expect(mockGet).toHaveBeenCalledWith('/contracts/c8/flow/file-url');
});

// ─── sendForSignatureUnified ─────────────────────────────────────────────────

test('11. sendForSignatureUnified — POST with assignments and senderName', async () => {
    const assignments = [{ email: 'client@co.com', order: 1 }];
    await unifiedFlowService.sendForSignatureUnified('c9', assignments, 'Admin User');
    expect(mockPost).toHaveBeenCalledWith(
        '/contracts/c9/flow/send-for-signature',
        { assignments, senderName: 'Admin User' },
    );
});

// ─── getFlowStatus ────────────────────────────────────────────────────────────

test('12. getFlowStatus — GET /contracts/{id}/flow/status', async () => {
    await unifiedFlowService.getFlowStatus('c10');
    expect(mockGet).toHaveBeenCalledWith('/contracts/c10/flow/status');
});

// ─── getFlowInbox ─────────────────────────────────────────────────────────────

test('13. getFlowInbox — GET /contracts/flow/inbox', async () => {
    await unifiedFlowService.getFlowInbox();
    expect(mockGet).toHaveBeenCalledWith('/contracts/flow/inbox');
});
