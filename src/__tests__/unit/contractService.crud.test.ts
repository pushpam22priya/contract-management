/**
 * UNIT TESTS — ContractService (CRUD + lifecycle operations)
 * (src/services/contractService.ts)
 *
 * apiService is fully mocked at the module boundary.
 * httpClient and externalSignatureService are stubbed to prevent import errors.
 *
 * Scenarios covered:
 *
 * getAllContracts()
 *  1.  Delegates to apiService.getContracts() and returns the result as-is
 *
 * getContractById(id)
 *  2.  Returns the matching contract when the id exists
 *  3.  Returns undefined when no contract has the given id
 *
 * getInboxContracts()
 *  4.  Delegates to apiService.getInboxContracts() and returns the result
 *
 * getContractsCreatedByUser(email)
 *  5.  Returns only contracts where createdBy equals the given email
 *  6.  Returns an empty array when no contracts match
 *
 * createContract(data)
 *  7.  Returns { success: true, message: 'Contract created', contract } when apiService succeeds
 *  8.  Merges the returned id into the contract object
 *  9.  Returns { success: false, message } when apiService.createContract() fails
 *
 * deleteContract(id)
 * 10.  Passes the result from apiService.deleteContract() through unchanged
 * 11.  Passes failure result through unchanged
 *
 * updateContractSignedPdf(id, pdfData, xfdfData?)
 * 12.  Calls saveContractPdf with the original Blob when pdfData is a Blob
 * 13.  Converts a base64 string to a Blob before calling saveContractPdf
 * 14.  Calls updateContractDocument with xfdfData when provided and upload succeeds
 * 15.  Does NOT call updateContractDocument when xfdfData is not provided
 * 16.  Returns { success: false } when saveContractPdf fails — skips XFDF persist
 * 17.  Returns { success: true } even when the XFDF persist (updateContractDocument) fails
 *
 * checkExternalSignatureStatus(id)
 * 18.  Returns { success: true, signed: true } when contract status is SIGNED
 * 19.  Returns { signed: true } when contract status is SIGNED_BY_EVERYONE
 * 20.  Returns { signed: false } for non-signed statuses (e.g., DRAFT)
 */

// ─── Mocks (must precede all imports) ─────────────────────────────────────────

const mockGetContracts      = jest.fn();
const mockGetInboxContracts = jest.fn();
const mockCreateContractApi = jest.fn();
const mockSaveContractPdf   = jest.fn();
const mockUpdateContractDoc = jest.fn();
const mockDeleteContractApi = jest.fn();

jest.mock('@/services/apiService', () => ({
    apiService: {
        getContracts:           (...a: any[]) => mockGetContracts(...a),
        getInboxContracts:      (...a: any[]) => mockGetInboxContracts(...a),
        createContract:         (...a: any[]) => mockCreateContractApi(...a),
        saveContractPdf:        (...a: any[]) => mockSaveContractPdf(...a),
        updateContractDocument: (...a: any[]) => mockUpdateContractDoc(...a),
        deleteContract:         (...a: any[]) => mockDeleteContractApi(...a),
    },
}));

jest.mock('@/lib/httpClient', () => ({
    httpClient: { post: jest.fn(), get: jest.fn() },
}));

jest.mock('@/services/externalSignatureService', () => ({
    submitForSignature: jest.fn(),
}));

// ─── Imports ──────────────────────────────────────────────────────────────────

import { contractService } from '@/services/contractService';
import { ContractStatus }  from '@/types/contract';

// ─── Fixtures ─────────────────────────────────────────────────────────────────

const CONTRACT_ID = 'contract_abc123';

const makeContract = (overrides: Record<string, any> = {}) => ({
    id:           CONTRACT_ID,
    name:         'Service Agreement',
    title:        'Service Agreement',
    description:  'A test contract',
    client:       'Acme Corp',
    category:     'Services',
    status:       ContractStatus.DRAFT,
    templateId:   'tmpl_001',
    templateName: 'Service Template',
    content:      '',
    fieldValues:  {},
    expiresInDays: 365,
    createdBy:    'alice@example.com',
    createdAt:    '2026-01-01T00:00:00Z',
    updatedAt:    '2026-01-01T00:00:00Z',
    ...overrides,
});

beforeEach(() => jest.clearAllMocks());

// =============================================================================
// getAllContracts()
// =============================================================================

describe('contractService.getAllContracts()', () => {

    it('delegates to apiService.getContracts() and returns its result', async () => {
        const contracts = [makeContract(), makeContract({ id: 'contract_def456', title: 'NDA' })];
        mockGetContracts.mockResolvedValueOnce(contracts);

        const result = await contractService.getAllContracts();

        expect(mockGetContracts).toHaveBeenCalledTimes(1);
        expect(result).toEqual(contracts);
    });
});

// =============================================================================
// getContractById()
// =============================================================================

describe('contractService.getContractById()', () => {

    it('returns the matching contract when the id exists in the list', async () => {
        const target = makeContract({ id: 'target_id', title: 'Target' });
        const other  = makeContract({ id: 'other_id',  title: 'Other'  });
        mockGetContracts.mockResolvedValueOnce([target, other]);

        const result = await contractService.getContractById('target_id');

        expect(result).toEqual(target);
    });

    it('returns undefined when no contract has the given id', async () => {
        mockGetContracts.mockResolvedValueOnce([makeContract()]);

        const result = await contractService.getContractById('nonexistent_id');

        expect(result).toBeUndefined();
    });
});

// =============================================================================
// getInboxContracts()
// =============================================================================

describe('contractService.getInboxContracts()', () => {

    it('delegates to apiService.getInboxContracts() and returns its result', async () => {
        const inbox = [makeContract({ id: 'inbox_1', status: ContractStatus.IN_REVIEW })];
        mockGetInboxContracts.mockResolvedValueOnce(inbox);

        const result = await contractService.getInboxContracts();

        expect(mockGetInboxContracts).toHaveBeenCalledTimes(1);
        expect(result).toEqual(inbox);
    });
});

// =============================================================================
// getContractsCreatedByUser()
// =============================================================================

describe('contractService.getContractsCreatedByUser()', () => {

    it('returns only contracts where createdBy matches the given email', async () => {
        const owned   = makeContract({ id: 'owned',   createdBy: 'alice@example.com' });
        const foreign = makeContract({ id: 'foreign', createdBy: 'bob@example.com'   });
        mockGetContracts.mockResolvedValueOnce([owned, foreign]);

        const result = await contractService.getContractsCreatedByUser('alice@example.com');

        expect(result).toEqual([owned]);
    });

    it('returns an empty array when no contracts match the email', async () => {
        mockGetContracts.mockResolvedValueOnce([
            makeContract({ createdBy: 'bob@example.com' }),
        ]);

        const result = await contractService.getContractsCreatedByUser('alice@example.com');

        expect(result).toEqual([]);
    });
});

// =============================================================================
// createContract()
// =============================================================================

describe('contractService.createContract()', () => {

    const contractData = {
        name: 'New Contract', title: 'New Contract', description: '', client: 'Corp',
        category: 'Services', status: ContractStatus.DRAFT, templateId: 'tmpl_001',
        templateName: 'Service Template', content: '', fieldValues: {}, expiresInDays: 365,
    };

    it('returns { success: true, message, contract } when apiService succeeds', async () => {
        mockCreateContractApi.mockResolvedValueOnce({ success: true, id: 'new_id_789' });

        const result = await contractService.createContract(contractData as any);

        expect(result.success).toBe(true);
        expect(result.message).toBe('Contract created');
        expect(result.contract?.id).toBe('new_id_789');
    });

    it('merges the returned id into the contract object', async () => {
        mockCreateContractApi.mockResolvedValueOnce({ success: true, id: 'merged_id' });

        const result = await contractService.createContract(contractData as any);

        expect(result.contract).toMatchObject({ ...contractData, id: 'merged_id' });
    });

    it('returns { success: false, message } when apiService.createContract() fails', async () => {
        mockCreateContractApi.mockResolvedValueOnce({
            success: false, message: 'Validation failed: title is required',
        });

        const result = await contractService.createContract(contractData as any);

        expect(result.success).toBe(false);
        expect(result.message).toBe('Validation failed: title is required');
        expect(result.contract).toBeUndefined();
    });
});

// =============================================================================
// deleteContract()
// =============================================================================

describe('contractService.deleteContract()', () => {

    it('passes the apiService.deleteContract() success result through unchanged', async () => {
        mockDeleteContractApi.mockResolvedValueOnce({ success: true, message: 'Contract deleted successfully' });

        const result = await contractService.deleteContract(CONTRACT_ID);

        expect(mockDeleteContractApi).toHaveBeenCalledWith(CONTRACT_ID);
        expect(result).toEqual({ success: true, message: 'Contract deleted successfully' });
    });

    it('passes a failure result through unchanged', async () => {
        mockDeleteContractApi.mockResolvedValueOnce({
            success: false,
            message: 'Only draft or terminated contracts can be permanently deleted.',
        });

        const result = await contractService.deleteContract(CONTRACT_ID);

        expect(result.success).toBe(false);
        expect(result.message).toMatch(/draft or terminated/);
    });
});

// =============================================================================
// updateContractSignedPdf()
// =============================================================================

describe('contractService.updateContractSignedPdf()', () => {

    const SMALL_PDF   = new Blob(['%PDF-1.4 test pdf'], { type: 'application/pdf' });
    const VALID_BASE64 = btoa('%PDF-1.4 base64 test');

    it('calls saveContractPdf with the original Blob when pdfData is a Blob', async () => {
        mockSaveContractPdf.mockResolvedValueOnce({ success: true });

        await contractService.updateContractSignedPdf(CONTRACT_ID, SMALL_PDF);

        expect(mockSaveContractPdf).toHaveBeenCalledWith(CONTRACT_ID, SMALL_PDF);
    });

    it('converts a base64 string to a Blob before calling saveContractPdf', async () => {
        mockSaveContractPdf.mockResolvedValueOnce({ success: true });

        await contractService.updateContractSignedPdf(CONTRACT_ID, VALID_BASE64);

        const [, blobArg] = mockSaveContractPdf.mock.calls[0];
        expect(blobArg).toBeInstanceOf(Blob);
        expect(blobArg.type).toBe('application/pdf');
    });

    it('calls updateContractDocument with xfdfData when provided and upload succeeds', async () => {
        mockSaveContractPdf.mockResolvedValueOnce({ success: true });
        mockUpdateContractDoc.mockResolvedValueOnce({ success: true });

        await contractService.updateContractSignedPdf(CONTRACT_ID, SMALL_PDF, '<xfdf>test</xfdf>');

        expect(mockUpdateContractDoc).toHaveBeenCalledWith(
            CONTRACT_ID, { xfdfData: '<xfdf>test</xfdf>' }
        );
    });

    it('does NOT call updateContractDocument when xfdfData is not provided', async () => {
        mockSaveContractPdf.mockResolvedValueOnce({ success: true });

        await contractService.updateContractSignedPdf(CONTRACT_ID, SMALL_PDF);

        expect(mockUpdateContractDoc).not.toHaveBeenCalled();
    });

    it('returns { success: false } when saveContractPdf fails and skips XFDF persist', async () => {
        mockSaveContractPdf.mockResolvedValueOnce({ success: false, message: 'Upload failed' });

        const result = await contractService.updateContractSignedPdf(
            CONTRACT_ID, SMALL_PDF, '<xfdf>test</xfdf>'
        );

        expect(result.success).toBe(false);
        expect(result.message).toBe('Upload failed');
        expect(mockUpdateContractDoc).not.toHaveBeenCalled();
    });

    it('returns { success: true } even when the XFDF persist fails (non-fatal warning)', async () => {
        mockSaveContractPdf.mockResolvedValueOnce({ success: true });
        mockUpdateContractDoc.mockResolvedValueOnce({ success: false, message: 'XFDF persist failed' });

        const result = await contractService.updateContractSignedPdf(
            CONTRACT_ID, SMALL_PDF, '<xfdf>test</xfdf>'
        );

        expect(result.success).toBe(true);
    });
});

// =============================================================================
// checkExternalSignatureStatus()
// =============================================================================

describe('contractService.checkExternalSignatureStatus()', () => {

    it('returns { success: true, signed: true } when contract status is SIGNED', async () => {
        mockGetContracts.mockResolvedValueOnce([
            makeContract({ id: CONTRACT_ID, status: ContractStatus.SIGNED }),
        ]);

        const result = await contractService.checkExternalSignatureStatus(CONTRACT_ID);

        expect(result.success).toBe(true);
        expect(result.signed).toBe(true);
    });

    it('returns { signed: true } when contract status is SIGNED_BY_EVERYONE', async () => {
        mockGetContracts.mockResolvedValueOnce([
            makeContract({ id: CONTRACT_ID, status: ContractStatus.SIGNED_BY_EVERYONE }),
        ]);

        const result = await contractService.checkExternalSignatureStatus(CONTRACT_ID);

        expect(result.signed).toBe(true);
    });

    it('returns { signed: false } for non-signed statuses (e.g., DRAFT)', async () => {
        mockGetContracts.mockResolvedValueOnce([
            makeContract({ id: CONTRACT_ID, status: ContractStatus.DRAFT }),
        ]);

        const result = await contractService.checkExternalSignatureStatus(CONTRACT_ID);

        expect(result.signed).toBe(false);
    });
});
