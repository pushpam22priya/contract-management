/**
 * UNIT TESTS — ContractService (review & approval workflow)
 * (src/services/contractService.ts)
 *
 * Only httpClient is mocked — apiService and externalSignatureService
 * are stubbed to prevent import errors but are not under test here.
 *
 * Scenarios covered:
 *
 * submitForWorkflow(contractId, mode, reviewerEmails, approverEmail, ...)
 *  1.  ONLY_REVIEW — sends only reviewerEmails (no approverEmail)
 *  2.  ONLY_APPROVE — sends only approverEmail (no reviewerEmails)
 *  3.  REVIEW_AND_APPROVE — sends both arrays
 *  4.  Includes reviewerMessage when provided
 *  5.  Includes approverMessage when provided
 *  6.  Omits both messages when not provided
 *  7.  Returns { success: true, message } on an ok response
 *  8.  Returns { success: false, message } on a not-ok response
 *
 * markAsReviewed(contractId, _email, comments?)
 *  9.  Calls POST /contracts/{id}/review/complete with comments
 * 10.  Sends { comments: undefined } when comments are not provided
 * 11.  Returns { success: true, contract } on an ok response
 * 12.  Returns { success: false, message } on a not-ok response
 *
 * addAdditionalReviewers(contractId, emails, message?)
 * 13.  Calls POST /contracts/{id}/review/forward with email array
 * 14.  Includes message in body when provided
 * 15.  Omits message from body when not provided
 * 16.  Returns success message with the forwarded count
 * 17.  Returns { success: false } when response is not ok
 *
 * approveContract(contractId, _email, comments?)
 * 18.  Calls POST /contracts/{id}/approval/approve with comments
 * 19.  Returns { success: true, contract } on an ok response
 * 20.  Returns { success: false, message } on a not-ok response
 *
 * rejectByReviewer(contractId, _email, message)
 * 21.  Calls POST /contracts/{id}/review/reject with the message
 * 22.  Returns { success: true } on an ok response
 * 23.  Returns { success: false, message } on a not-ok response
 *
 * rejectByApprover(contractId, _email, message)
 * 24.  Calls POST /contracts/{id}/approval/reject with the message
 * 25.  Returns { success: true } on an ok response
 *
 * requestModification(contractId, email, role, comments)
 * 26.  role="reviewer" delegates to rejectByReviewer (calls review/reject endpoint)
 * 27.  role="approver" delegates to rejectByApprover (calls approval/reject endpoint)
 */

// ─── Mocks (must precede imports) ─────────────────────────────────────────────

const mockPost = jest.fn();
jest.mock('@/lib/httpClient', () => ({
    httpClient: { post: (...args: any[]) => mockPost(...args) },
}));

jest.mock('@/services/apiService', () => ({
    apiService: {
        getContracts: jest.fn().mockResolvedValue([]),
        getInboxContracts: jest.fn().mockResolvedValue([]),
        createContract: jest.fn(),
        saveContractPdf: jest.fn(),
        updateContractDocument: jest.fn(),
        deleteContract: jest.fn(),
    },
}));

jest.mock('@/services/externalSignatureService', () => ({
    submitForSignature: jest.fn(),
}));

// ─── Imports ──────────────────────────────────────────────────────────────────

import { contractService } from '@/services/contractService';

// ─── Fixtures ─────────────────────────────────────────────────────────────────

const CONTRACT_ID = 'contract_abc123';

const ok   = (data: any, message = 'OK')   => ({ ok: true,  data, status: 200, message });
const fail = (status: number, message = 'Error') => ({ ok: false, data: null, status, message });

beforeEach(() => jest.clearAllMocks());

// =============================================================================
// submitForWorkflow()
// =============================================================================

describe('contractService.submitForWorkflow()', () => {

    it('ONLY_REVIEW — sends reviewerEmails but not approverEmail when approverEmail is empty', async () => {
        mockPost.mockResolvedValueOnce(ok(null, 'Submitted'));

        await contractService.submitForWorkflow(CONTRACT_ID, 'ONLY_REVIEW', ['rev@example.com'], '');

        expect(mockPost).toHaveBeenCalledWith(
            `/contracts/${CONTRACT_ID}/submit`,
            expect.not.objectContaining({ approverEmail: expect.anything() })
        );
        expect(mockPost).toHaveBeenCalledWith(
            `/contracts/${CONTRACT_ID}/submit`,
            expect.objectContaining({ reviewerEmails: ['rev@example.com'] })
        );
    });

    it('ONLY_APPROVE — sends approverEmail but not reviewerEmails when array is empty', async () => {
        mockPost.mockResolvedValueOnce(ok(null, 'Submitted'));

        await contractService.submitForWorkflow(CONTRACT_ID, 'ONLY_APPROVE', [], 'approver@example.com');

        expect(mockPost).toHaveBeenCalledWith(
            `/contracts/${CONTRACT_ID}/submit`,
            expect.not.objectContaining({ reviewerEmails: expect.anything() })
        );
        expect(mockPost).toHaveBeenCalledWith(
            `/contracts/${CONTRACT_ID}/submit`,
            expect.objectContaining({ approverEmail: 'approver@example.com' })
        );
    });

    it('REVIEW_AND_APPROVE — sends both reviewerEmails and approverEmail', async () => {
        mockPost.mockResolvedValueOnce(ok(null));

        await contractService.submitForWorkflow(
            CONTRACT_ID, 'REVIEW_AND_APPROVE',
            ['rev1@example.com', 'rev2@example.com'],
            'approver@example.com'
        );

        expect(mockPost).toHaveBeenCalledWith(
            `/contracts/${CONTRACT_ID}/submit`,
            expect.objectContaining({
                mode: 'REVIEW_AND_APPROVE',
                reviewerEmails: ['rev1@example.com', 'rev2@example.com'],
                approverEmail: 'approver@example.com',
            })
        );
    });

    it('includes reviewerMessage in body when provided', async () => {
        mockPost.mockResolvedValueOnce(ok(null));

        await contractService.submitForWorkflow(
            CONTRACT_ID, 'ONLY_REVIEW', ['rev@example.com'], '', 'Please review carefully'
        );

        expect(mockPost).toHaveBeenCalledWith(
            `/contracts/${CONTRACT_ID}/submit`,
            expect.objectContaining({ reviewerMessage: 'Please review carefully' })
        );
    });

    it('includes approverMessage in body when provided', async () => {
        mockPost.mockResolvedValueOnce(ok(null));

        await contractService.submitForWorkflow(
            CONTRACT_ID, 'ONLY_APPROVE', [], 'approver@example.com', undefined, 'Awaiting your approval'
        );

        expect(mockPost).toHaveBeenCalledWith(
            `/contracts/${CONTRACT_ID}/submit`,
            expect.objectContaining({ approverMessage: 'Awaiting your approval' })
        );
    });

    it('omits both messages when they are not provided', async () => {
        mockPost.mockResolvedValueOnce(ok(null));

        await contractService.submitForWorkflow(CONTRACT_ID, 'ONLY_REVIEW', ['rev@example.com'], '');

        const [, body] = mockPost.mock.calls[0];
        expect(body).not.toHaveProperty('reviewerMessage');
        expect(body).not.toHaveProperty('approverMessage');
    });

    it('returns { success: true, message } on an ok response', async () => {
        mockPost.mockResolvedValueOnce(ok(null, 'Contract submitted successfully'));

        const result = await contractService.submitForWorkflow(
            CONTRACT_ID, 'ONLY_REVIEW', ['rev@example.com'], ''
        );

        expect(result).toEqual({ success: true, message: 'Contract submitted successfully' });
    });

    it('returns { success: false, message } on a not-ok response', async () => {
        mockPost.mockResolvedValueOnce(fail(400, 'Workflow already in progress'));

        const result = await contractService.submitForWorkflow(
            CONTRACT_ID, 'ONLY_REVIEW', ['rev@example.com'], ''
        );

        expect(result).toEqual({ success: false, message: 'Workflow already in progress' });
    });
});

// =============================================================================
// markAsReviewed()
// =============================================================================

describe('contractService.markAsReviewed()', () => {

    it('calls POST /contracts/{id}/review/complete with the provided comments', async () => {
        mockPost.mockResolvedValueOnce(ok({ id: CONTRACT_ID }));

        await contractService.markAsReviewed(CONTRACT_ID, '', 'Looks good');

        expect(mockPost).toHaveBeenCalledWith(
            `/contracts/${CONTRACT_ID}/review/complete`,
            { comments: 'Looks good' }
        );
    });

    it('sends { comments: undefined } when comments are not provided', async () => {
        mockPost.mockResolvedValueOnce(ok({ id: CONTRACT_ID }));

        await contractService.markAsReviewed(CONTRACT_ID, '');

        expect(mockPost).toHaveBeenCalledWith(
            `/contracts/${CONTRACT_ID}/review/complete`,
            { comments: undefined }
        );
    });

    it('returns { success: true, message, contract } on an ok response', async () => {
        const contractData = { id: CONTRACT_ID, status: 'IN_APPROVAL' };
        mockPost.mockResolvedValueOnce(ok(contractData));

        const result = await contractService.markAsReviewed(CONTRACT_ID, '');

        expect(result.success).toBe(true);
        expect(result.message).toBe('Marked as reviewed successfully');
        expect(result.contract).toEqual(contractData);
    });

    it('returns { success: false, message } on a not-ok response', async () => {
        mockPost.mockResolvedValueOnce(fail(403, 'Not authorized to review this contract'));

        const result = await contractService.markAsReviewed(CONTRACT_ID, '');

        expect(result).toEqual({ success: false, message: 'Not authorized to review this contract' });
    });
});

// =============================================================================
// addAdditionalReviewers()
// =============================================================================

describe('contractService.addAdditionalReviewers()', () => {

    it('calls POST /contracts/{id}/review/forward with the email array', async () => {
        mockPost.mockResolvedValueOnce(ok(null));

        await contractService.addAdditionalReviewers(CONTRACT_ID, ['a@example.com', 'b@example.com']);

        expect(mockPost).toHaveBeenCalledWith(
            `/contracts/${CONTRACT_ID}/review/forward`,
            expect.objectContaining({ additionalReviewerEmails: ['a@example.com', 'b@example.com'] })
        );
    });

    it('includes message in the body when provided', async () => {
        mockPost.mockResolvedValueOnce(ok(null));

        await contractService.addAdditionalReviewers(CONTRACT_ID, ['a@example.com'], 'Please review section 3');

        expect(mockPost).toHaveBeenCalledWith(
            `/contracts/${CONTRACT_ID}/review/forward`,
            expect.objectContaining({ message: 'Please review section 3' })
        );
    });

    it('omits message from the body when not provided', async () => {
        mockPost.mockResolvedValueOnce(ok(null));

        await contractService.addAdditionalReviewers(CONTRACT_ID, ['a@example.com']);

        const [, body] = mockPost.mock.calls[0];
        expect(body).not.toHaveProperty('message');
    });

    it('returns success message with the number of reviewers forwarded to', async () => {
        mockPost.mockResolvedValueOnce(ok(null));

        const result = await contractService.addAdditionalReviewers(
            CONTRACT_ID, ['a@example.com', 'b@example.com', 'c@example.com']
        );

        expect(result.success).toBe(true);
        expect(result.message).toMatch(/3 additional reviewer/);
    });

    it('returns { success: false, message } when response is not ok', async () => {
        mockPost.mockResolvedValueOnce(fail(404, 'Contract not found'));

        const result = await contractService.addAdditionalReviewers(CONTRACT_ID, ['a@example.com']);

        expect(result).toEqual({ success: false, message: 'Contract not found' });
    });
});

// =============================================================================
// approveContract()
// =============================================================================

describe('contractService.approveContract()', () => {

    it('calls POST /contracts/{id}/approval/approve with the provided comments', async () => {
        mockPost.mockResolvedValueOnce(ok({ id: CONTRACT_ID }));

        await contractService.approveContract(CONTRACT_ID, '', 'All clauses verified');

        expect(mockPost).toHaveBeenCalledWith(
            `/contracts/${CONTRACT_ID}/approval/approve`,
            { comments: 'All clauses verified' }
        );
    });

    it('returns { success: true, message, contract } on an ok response', async () => {
        const contractData = { id: CONTRACT_ID, status: 'READY_FOR_SIGNATURE' };
        mockPost.mockResolvedValueOnce(ok(contractData));

        const result = await contractService.approveContract(CONTRACT_ID, '');

        expect(result.success).toBe(true);
        expect(result.message).toBe('Contract approved successfully');
        expect(result.contract).toEqual(contractData);
    });

    it('returns { success: false, message } on a not-ok response', async () => {
        mockPost.mockResolvedValueOnce(fail(403, 'Reviews are still pending'));

        const result = await contractService.approveContract(CONTRACT_ID, '');

        expect(result).toEqual({ success: false, message: 'Reviews are still pending' });
    });
});

// =============================================================================
// rejectByReviewer()
// =============================================================================

describe('contractService.rejectByReviewer()', () => {

    it('calls POST /contracts/{id}/review/reject with the rejection message', async () => {
        mockPost.mockResolvedValueOnce(ok(null));

        await contractService.rejectByReviewer(CONTRACT_ID, '', 'Missing compliance section');

        expect(mockPost).toHaveBeenCalledWith(
            `/contracts/${CONTRACT_ID}/review/reject`,
            { message: 'Missing compliance section' }
        );
    });

    it('returns { success: true } on an ok response', async () => {
        mockPost.mockResolvedValueOnce(ok(null));

        const result = await contractService.rejectByReviewer(CONTRACT_ID, '', 'Needs revision');

        expect(result.success).toBe(true);
        expect(result.message).toBe('Contract rejected');
    });

    it('returns { success: false, message } on a not-ok response', async () => {
        mockPost.mockResolvedValueOnce(fail(400, 'Rejection message is required'));

        const result = await contractService.rejectByReviewer(CONTRACT_ID, '', '');

        expect(result).toEqual({ success: false, message: 'Rejection message is required' });
    });
});

// =============================================================================
// rejectByApprover()
// =============================================================================

describe('contractService.rejectByApprover()', () => {

    it('calls POST /contracts/{id}/approval/reject with the rejection message', async () => {
        mockPost.mockResolvedValueOnce(ok(null));

        await contractService.rejectByApprover(CONTRACT_ID, '', 'Terms are unacceptable');

        expect(mockPost).toHaveBeenCalledWith(
            `/contracts/${CONTRACT_ID}/approval/reject`,
            { message: 'Terms are unacceptable' }
        );
    });

    it('returns { success: true } on an ok response', async () => {
        mockPost.mockResolvedValueOnce(ok(null));

        const result = await contractService.rejectByApprover(CONTRACT_ID, '', 'Needs revision');

        expect(result.success).toBe(true);
    });
});

// =============================================================================
// requestModification() — delegation wrapper
// =============================================================================

describe('contractService.requestModification()', () => {

    it('role="reviewer" calls the review/reject endpoint', async () => {
        mockPost.mockResolvedValueOnce(ok(null));

        await contractService.requestModification(CONTRACT_ID, 'rev@example.com', 'reviewer', 'Please fix section 2');

        expect(mockPost).toHaveBeenCalledWith(
            `/contracts/${CONTRACT_ID}/review/reject`,
            { message: 'Please fix section 2' }
        );
    });

    it('role="approver" calls the approval/reject endpoint', async () => {
        mockPost.mockResolvedValueOnce(ok(null));

        await contractService.requestModification(CONTRACT_ID, 'approver@example.com', 'approver', 'Revise the liability clauses');

        expect(mockPost).toHaveBeenCalledWith(
            `/contracts/${CONTRACT_ID}/approval/reject`,
            { message: 'Revise the liability clauses' }
        );
    });
});
