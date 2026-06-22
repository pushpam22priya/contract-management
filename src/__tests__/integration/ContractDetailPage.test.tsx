/**
 * INTEGRATION TESTS — Contract Detail Page (src/app/contracts/[id]/page.tsx)
 *
 * Renders the real component with:
 * - Service calls mocked via jest.mock (apiService, externalSignatureService, etc.)
 * - Heavy UI components replaced with lightweight stubs
 * - SignatureProgressTimeline stub exposes received props as data-attributes
 *   so we can assert what the page computed without rendering the full timeline
 * - useContractPolling mocked to prevent background side-effects in tests
 *
 * Scenarios covered:
 *  1. Shimmer shown while contract is loading
 *  2. "Not Found" shown when API returns null
 *  3. Contract title rendered in the header
 *  4. "(Renewal)" suffix stripped from the display title
 *  5. Numbered renewal suffixes like "(Renewal2)" also stripped
 *  6. Status chip shows the translated label for the contract status
 *  7. Back button calls router.back()
 *  8. History button shown when contract has renewedFromId
 *  9. History button shown when contract has renewedContractId
 * 10. History button hidden for plain (non-renewal) contracts
 * 11. Terminated banner shown when status is TERMINATED
 * 12. Terminated banner hidden for non-terminated contracts
 * 13. SignatureProgressTimeline rendered when externalSigners is non-empty
 * 14. SignatureProgressTimeline rendered when internalSigners is non-empty
 * 15. SignatureProgressTimeline hidden when contract has no signers
 * 16. canFinalize=true when all signers completed and signatureFlowStatus=all_completed
 * 17. canFinalize=false when signers are still pending
 * 18. isFinalized=true when signatureFlowStatus=finalized
 * 19. uniqueOrders derived correctly from both signer arrays (sorted, deduplicated)
 * 20. finalizeContract called with correct id on Finalize click
 * 21. Finalize error surfaced in the timeline on failure
 * 22. Document viewer dialog opens when a document is clicked
 * 23. Document viewer dialog closes on Close click
 */

import React, { Suspense } from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

// ─── Service mocks ────────────────────────────────────────────────────────────

const mockGetContractDetails = jest.fn();
const mockGetContractViewUrl  = jest.fn();
const mockUpdateContractMetadata = jest.fn();

jest.mock('@/services/apiService', () => ({
    apiService: {
        getContractDetails:      (...args: any[]) => mockGetContractDetails(...args),
        getContractViewUrl:      (...args: any[]) => mockGetContractViewUrl(...args),
        updateContractMetadata:  (...args: any[]) => mockUpdateContractMetadata(...args),
    },
}));

const mockFinalizeContract = jest.fn();
jest.mock('@/services/externalSignatureService', () => ({
    finalizeContract: (...args: any[]) => mockFinalizeContract(...args),
}));

jest.mock('@/services/contractService', () => ({
    contractService: {
        updateContractSignedPdf: jest.fn().mockResolvedValue({ success: true }),
    },
}));

jest.mock('@/services/templateService', () => ({
    templateService: {
        getTemplateById: jest.fn().mockResolvedValue(null),
    },
}));

// ─── Routing mock ─────────────────────────────────────────────────────────────

const mockRouterBack = jest.fn();
jest.mock('next/navigation', () => ({
    useRouter: () => ({ back: mockRouterBack }),
}));

// ─── Polling mock ─────────────────────────────────────────────────────────────
// Prevent polling from firing during tests — we test only initial load behavior.

jest.mock('@/hooks/useContractPolling', () => ({
    useContractPolling: jest.fn().mockReturnValue({ checkNow: jest.fn() }),
}));

// ─── next-intl mock ───────────────────────────────────────────────────────────

jest.mock('next-intl', () => ({
    useTranslations: (namespace: string) => {
        const map: Record<string, Record<string, string>> = {
            contractDetail: {
                goBack:             'Go Back',
                notFound:           'Contract Not Found',
                terminatedOn:       'Terminated on',
                terminatedBy:       'by',
                noFurtherActions:   'No further actions can be taken.',
                contractHistory:    'Contract History',
            },
            contractStatus: {
                ACTIVE:                 'Active',
                DRAFT:                  'Draft',
                IN_SIGNATURE:           'In Signature',
                SIGNED_BY_EVERYONE:     'Signed by Everyone',
                SIGNED:                 'Signed',
                TERMINATED:             'Terminated',
                EXPIRED:                'Expired',
                EXPIRING:               'Expiring',
                IN_REVIEW:              'In Review',
                IN_APPROVAL:            'In Approval',
                READY_FOR_SIGNATURE:    'Ready for Signature',
                REJECTED:               'Rejected',
                REJECTED_BY_REVIEWER:   'Rejected',
                REJECTED_BY_APPROVER:   'Rejected',
            },
        };
        return (key: string) => map[namespace]?.[key] ?? key;
    },
}));

// ─── UI component mocks ───────────────────────────────────────────────────────

jest.mock('@/components/layout/AppLayout', () => ({
    __esModule: true,
    default: ({ children }: any) => <div data-testid="app-layout">{children}</div>,
}));

jest.mock('@/components/common/ShimmerCard', () => ({
    ContractDetailShimmer: () => <div data-testid="shimmer">Loading shimmer</div>,
}));

// SignatureProgressTimeline stub — exposes every prop the page passes as a
// data-attribute so tests can assert computed values without rendering the
// full Apryse-backed timeline. Also renders a "Finalize" button so the
// onFinalize callback can be triggered from tests.
jest.mock('@/components/contracts/SignatureProgressTimeline', () => ({
    __esModule: true,
    default: ({
        canFinalize,
        isFinalized,
        uniqueOrders,
        currentOrder,
        finalizing,
        finalizeError,
        finalizeSuccess,
        onFinalize,
    }: any) => (
        <div
            data-testid="signature-timeline"
            data-can-finalize={String(canFinalize)}
            data-is-finalized={String(isFinalized)}
            data-unique-orders={JSON.stringify(uniqueOrders)}
            data-current-order={String(currentOrder)}
        >
            {!isFinalized && (
                <button onClick={onFinalize} data-testid="finalize-btn">
                    Finalize
                </button>
            )}
            {finalizing   && <div data-testid="finalizing">Finalizing...</div>}
            {finalizeError && <div data-testid="finalize-error">{finalizeError}</div>}
            {finalizeSuccess && <div data-testid="finalize-success">Success</div>}
        </div>
    ),
}));

jest.mock('@/components/contracts/ContractInformation', () => ({
    __esModule: true,
    default: ({ client, status }: any) => (
        <div data-testid="contract-info" data-client={client} data-status={status} />
    ),
}));

// ContractDetailsPanel stub — renders a "View" button for each document so
// tests can trigger the onViewDocument callback.
jest.mock('@/components/contracts/ContractDetailsPanel', () => ({
    __esModule: true,
    default: ({ documents, onViewDocument }: any) => (
        <div data-testid="details-panel">
            {(documents ?? []).map((doc: any) => (
                <button
                    key={doc.id}
                    data-testid={`view-doc-${doc.id}`}
                    onClick={() => onViewDocument(doc)}
                >
                    View {doc.name}
                </button>
            ))}
        </div>
    ),
}));

jest.mock('@/components/viewer/DocumentViewerDialog', () => ({
    __esModule: true,
    default: ({ open, onClose }: any) =>
        open ? (
            <div data-testid="document-viewer">
                <button data-testid="close-viewer" onClick={onClose}>Close</button>
            </div>
        ) : null,
}));

jest.mock('@/components/contracts/ContractHistoryPanel',  () => ({ __esModule: true, default: () => null }));
jest.mock('@/components/contracts/ContractHistoryDialog', () => ({ __esModule: true, default: () => null }));

// ─── Component under test ─────────────────────────────────────────────────────
// Import AFTER all jest.mock() calls so mocks are in place when the module loads.

import ContractViewPage from '@/app/contracts/[id]/page';

// ─── Test fixtures ────────────────────────────────────────────────────────────

const baseContract = {
    id: 'contract_123',
    title: 'Service Agreement',
    status: 'ACTIVE',
    createdAt:   '2026-01-01T00:00:00Z',
    updatedAt:   '2026-01-10T00:00:00Z',
    createdBy:   'contractor@company.com',
    client:      'Acme Corp',
    category:    'Services',
    templateId:  null,
    startDate:   '2026-01-01',
    endDate:     '2026-12-31',
    description: 'A test service agreement',
    externalSigners:      [],
    internalSigners:      [],
    signatureFlowStatus:  null,
    currentSigningOrder:  null,
    parties:     [],
    formFields:  [],
    fieldValues: {},
    renewedFromId:      null,
    renewedContractId:  null,
    terminatedAt:  null,
    terminatedBy:  null,
    finalizedAt:   null,
    finalizedBy:   null,
};

// ─── Render helper ────────────────────────────────────────────────────────────
// React 19's use(Promise) suspends the component — even for an already-resolved
// Promise — until React's internal scheduler processes the microtask. In jsdom,
// that scheduler tick never fires without special help. We bypass the suspend
// entirely by pre-marking the Promise with React's internal fulfilled tag
// (`status: 'fulfilled'`, `value: …`). React's use() reads those fields first
// and returns the value synchronously, so no Suspense boundary is triggered.

function resolvedParam<T extends object>(value: T): Promise<T> {
    const p = Promise.resolve(value) as any;
    p.status = 'fulfilled';
    p.value = value;
    return p as Promise<T>;
}

function renderPage(contractId = 'contract_123') {
    return render(
        <Suspense fallback={<div data-testid="suspense-loading">Loading...</div>}>
            <ContractViewPage params={resolvedParam({ id: contractId })} />
        </Suspense>
    );
}

// ─── Global mock reset ────────────────────────────────────────────────────────

afterEach(() => {
    jest.clearAllMocks();
});

// =============================================================================
// LOADING STATE
// =============================================================================

describe('ContractDetailPage — loading state', () => {

    it('shows a shimmer while the contract is being fetched', () => {
        /**
         * On initial render `loading` is true before the API call resolves.
         * The page must render ContractDetailShimmer (our stub shows data-testid="shimmer").
         * We use a never-resolving promise so the loading state stays visible.
         */
        mockGetContractDetails.mockImplementation(() => new Promise(() => {}));

        renderPage();

        expect(screen.getByTestId('shimmer')).toBeInTheDocument();
    });
});

// =============================================================================
// NOT FOUND STATE
// =============================================================================

describe('ContractDetailPage — not found state', () => {

    it('shows "Contract Not Found" when getContractDetails returns null', async () => {
        mockGetContractDetails.mockResolvedValue(null);
        mockGetContractViewUrl.mockResolvedValue('https://minio.test/contract.pdf');

        renderPage();

        await waitFor(() => {
            expect(screen.getByText('Contract Not Found')).toBeInTheDocument();
        });
    });
});

// =============================================================================
// CONTRACT DISPLAY
// =============================================================================

describe('ContractDetailPage — contract display', () => {

    beforeEach(() => {
        mockGetContractDetails.mockResolvedValue({ ...baseContract });
        mockGetContractViewUrl.mockResolvedValue('https://minio.test/contract.pdf');
    });

    it('renders the contract title in the page header', async () => {
        renderPage();

        await waitFor(() => {
            expect(screen.getByText('Service Agreement')).toBeInTheDocument();
        });
    });

    it('strips a "(Renewal)" suffix from the displayed title', async () => {
        mockGetContractDetails.mockResolvedValue({
            ...baseContract,
            title: 'Service Agreement (Renewal)',
        });

        renderPage();

        await waitFor(() => {
            expect(screen.getByText('Service Agreement')).toBeInTheDocument();
        });
        expect(screen.queryByText('Service Agreement (Renewal)')).not.toBeInTheDocument();
    });

    it('strips a numbered renewal suffix like "(Renewal2)"', async () => {
        mockGetContractDetails.mockResolvedValue({
            ...baseContract,
            title: 'NDA Agreement (Renewal2)',
        });

        renderPage();

        await waitFor(() => {
            expect(screen.getByText('NDA Agreement')).toBeInTheDocument();
        });
        expect(screen.queryByText('NDA Agreement (Renewal2)')).not.toBeInTheDocument();
    });

    it('shows the translated status label in the status chip', async () => {
        renderPage();

        // ACTIVE → "Active" via the contractStatus translation namespace
        await waitFor(() => {
            expect(screen.getByText('Active')).toBeInTheDocument();
        });
    });

    it('shows "In Signature" for IN_SIGNATURE status', async () => {
        mockGetContractDetails.mockResolvedValue({
            ...baseContract,
            status: 'IN_SIGNATURE',
            signatureFlowStatus: 'pending_signatures',
        });

        renderPage();

        await waitFor(() => {
            expect(screen.getByText('In Signature')).toBeInTheDocument();
        });
    });

    it('shows "Signed by Everyone" for SIGNED_BY_EVERYONE status', async () => {
        mockGetContractDetails.mockResolvedValue({
            ...baseContract,
            status: 'SIGNED_BY_EVERYONE',
            signatureFlowStatus: 'all_completed',
        });

        renderPage();

        await waitFor(() => {
            expect(screen.getByText('Signed by Everyone')).toBeInTheDocument();
        });
    });
});

// =============================================================================
// HEADER NAVIGATION
// =============================================================================

describe('ContractDetailPage — header navigation', () => {

    beforeEach(() => {
        mockGetContractDetails.mockResolvedValue({ ...baseContract });
        mockGetContractViewUrl.mockResolvedValue('https://minio.test/contract.pdf');
    });

    it('calls router.back() when the back button is clicked', async () => {
        const user = userEvent.setup();
        renderPage();

        await waitFor(() => {
            expect(screen.getByText('Service Agreement')).toBeInTheDocument();
        });

        await user.click(screen.getByRole('button', { name: /go back/i }));

        expect(mockRouterBack).toHaveBeenCalledTimes(1);
    });

    it('shows the history button when the contract has renewedFromId set', async () => {
        mockGetContractDetails.mockResolvedValue({
            ...baseContract,
            renewedFromId: 'original_contract_abc',
        });

        renderPage();

        await waitFor(() => {
            expect(
                screen.getByRole('button', { name: /contract history/i })
            ).toBeInTheDocument();
        });
    });

    it('shows the history button when the contract has renewedContractId set', async () => {
        mockGetContractDetails.mockResolvedValue({
            ...baseContract,
            renewedContractId: 'renewal_contract_xyz',
        });

        renderPage();

        await waitFor(() => {
            expect(
                screen.getByRole('button', { name: /contract history/i })
            ).toBeInTheDocument();
        });
    });

    it('does NOT show the history button for a plain (non-renewal) contract', async () => {
        renderPage();

        await waitFor(() => {
            expect(screen.getByText('Service Agreement')).toBeInTheDocument();
        });

        expect(
            screen.queryByRole('button', { name: /contract history/i })
        ).not.toBeInTheDocument();
    });
});

// =============================================================================
// TERMINATED BANNER
// =============================================================================

describe('ContractDetailPage — terminated banner', () => {

    beforeEach(() => {
        mockGetContractViewUrl.mockResolvedValue('https://minio.test/contract.pdf');
    });

    it('shows the terminated banner when status is TERMINATED', async () => {
        mockGetContractDetails.mockResolvedValue({
            ...baseContract,
            status: 'TERMINATED',
            terminatedAt: '2026-03-15T00:00:00Z',
            terminatedBy: 'admin@company.com',
        });

        renderPage();

        await waitFor(() => {
            expect(screen.getByText(/terminated on/i)).toBeInTheDocument();
        });
        expect(screen.getByText(/no further actions can be taken/i)).toBeInTheDocument();
    });

    it('does NOT show the terminated banner for an active contract', async () => {
        mockGetContractDetails.mockResolvedValue({ ...baseContract, status: 'ACTIVE' });

        renderPage();

        await waitFor(() => {
            expect(screen.getByText('Service Agreement')).toBeInTheDocument();
        });

        expect(screen.queryByText(/terminated on/i)).not.toBeInTheDocument();
    });
});

// =============================================================================
// MULTI-PARTY SIGNING TIMELINE
// =============================================================================

describe('ContractDetailPage — signature progress timeline', () => {

    beforeEach(() => {
        mockGetContractViewUrl.mockResolvedValue('https://minio.test/contract.pdf');
    });

    it('renders the timeline when externalSigners is non-empty', async () => {
        mockGetContractDetails.mockResolvedValue({
            ...baseContract,
            status: 'IN_SIGNATURE',
            signatureFlowStatus: 'pending_signatures',
            currentSigningOrder: 1,
            externalSigners: [
                { email: 'buyer@client.com', partyId: 'party_buyer', partyLabel: 'Buyer',
                  order: 1, status: 'unlocked', token: 'tok_1' },
            ],
        });

        renderPage();

        await waitFor(() => {
            expect(screen.getByTestId('signature-timeline')).toBeInTheDocument();
        });
    });

    it('renders the timeline when internalSigners is non-empty', async () => {
        mockGetContractDetails.mockResolvedValue({
            ...baseContract,
            status: 'IN_SIGNATURE',
            signatureFlowStatus: 'pending_signatures',
            currentSigningOrder: 1,
            internalSigners: [
                { email: 'alice@company.com', partyId: 'party_seller', partyLabel: 'Seller',
                  order: 1, status: 'unlocked', userId: 'user_1' },
            ],
        });

        renderPage();

        await waitFor(() => {
            expect(screen.getByTestId('signature-timeline')).toBeInTheDocument();
        });
    });

    it('does NOT render the timeline for a contract with no signers', async () => {
        mockGetContractDetails.mockResolvedValue({ ...baseContract });

        renderPage();

        await waitFor(() => {
            expect(screen.getByText('Service Agreement')).toBeInTheDocument();
        });

        expect(screen.queryByTestId('signature-timeline')).not.toBeInTheDocument();
    });

    it('passes canFinalize=true when all signers completed and signatureFlowStatus=all_completed', async () => {
        mockGetContractDetails.mockResolvedValue({
            ...baseContract,
            status: 'SIGNED_BY_EVERYONE',
            signatureFlowStatus: 'all_completed',
            externalSigners: [
                { email: 'buyer@client.com', partyId: 'party_buyer',
                  order: 1, status: 'completed', token: 'tok_1' },
            ],
            internalSigners: [],
        });

        renderPage();

        await waitFor(() => {
            const el = screen.getByTestId('signature-timeline');
            expect(el.dataset.canFinalize).toBe('true');
        });
    });

    it('passes canFinalize=false when a signer has not yet completed', async () => {
        mockGetContractDetails.mockResolvedValue({
            ...baseContract,
            status: 'IN_SIGNATURE',
            signatureFlowStatus: 'pending_signatures',
            externalSigners: [
                { email: 'buyer@client.com', partyId: 'party_buyer',
                  order: 1, status: 'unlocked', token: 'tok_1' }, // still in progress
            ],
            internalSigners: [],
        });

        renderPage();

        await waitFor(() => {
            const el = screen.getByTestId('signature-timeline');
            expect(el.dataset.canFinalize).toBe('false');
        });
    });

    it('passes canFinalize=false when all signers completed but signatureFlowStatus is not all_completed', async () => {
        mockGetContractDetails.mockResolvedValue({
            ...baseContract,
            status: 'IN_SIGNATURE',
            signatureFlowStatus: 'pending_signatures', // backend hasn't set all_completed yet
            externalSigners: [
                { email: 'buyer@client.com', partyId: 'party_buyer',
                  order: 1, status: 'completed', token: 'tok_1' },
            ],
        });

        renderPage();

        await waitFor(() => {
            const el = screen.getByTestId('signature-timeline');
            expect(el.dataset.canFinalize).toBe('false');
        });
    });

    it('passes isFinalized=true when signatureFlowStatus is "finalized"', async () => {
        mockGetContractDetails.mockResolvedValue({
            ...baseContract,
            status: 'SIGNED',
            signatureFlowStatus: 'finalized',
            finalizedAt: '2026-03-01T00:00:00Z',
            externalSigners: [
                { email: 'buyer@client.com', partyId: 'party_buyer',
                  order: 1, status: 'completed', token: 'tok_1' },
            ],
        });

        renderPage();

        await waitFor(() => {
            const el = screen.getByTestId('signature-timeline');
            expect(el.dataset.isFinalized).toBe('true');
        });
    });

    it('passes isFinalized=false when signatureFlowStatus is "all_completed"', async () => {
        mockGetContractDetails.mockResolvedValue({
            ...baseContract,
            status: 'SIGNED_BY_EVERYONE',
            signatureFlowStatus: 'all_completed',
            externalSigners: [
                { email: 'buyer@client.com', partyId: 'party_buyer',
                  order: 1, status: 'completed', token: 'tok_1' },
            ],
        });

        renderPage();

        await waitFor(() => {
            const el = screen.getByTestId('signature-timeline');
            expect(el.dataset.isFinalized).toBe('false');
        });
    });

    it('derives uniqueOrders sorted from both internal and external signer arrays', async () => {
        mockGetContractDetails.mockResolvedValue({
            ...baseContract,
            status: 'IN_SIGNATURE',
            signatureFlowStatus: 'pending_signatures',
            externalSigners: [
                { email: 'buyer@client.com',   partyId: 'p1', order: 1, status: 'completed', token: 'tok_1' },
                { email: 'witness@client.com', partyId: 'p3', order: 3, status: 'pending',   token: 'tok_3' },
            ],
            internalSigners: [
                { email: 'alice@company.com', partyId: 'p2', order: 2, status: 'unlocked', userId: 'u1' },
            ],
        });

        renderPage();

        await waitFor(() => {
            const el = screen.getByTestId('signature-timeline');
            expect(JSON.parse(el.dataset.uniqueOrders!)).toEqual([1, 2, 3]);
        });
    });

    it('deduplicates order numbers when multiple signers share the same order', async () => {
        mockGetContractDetails.mockResolvedValue({
            ...baseContract,
            status: 'IN_SIGNATURE',
            signatureFlowStatus: 'pending_signatures',
            externalSigners: [
                { email: 'buyer1@client.com', partyId: 'p1', order: 1, status: 'unlocked', token: 'tok_1' },
                { email: 'buyer2@client.com', partyId: 'p2', order: 1, status: 'unlocked', token: 'tok_2' },
            ],
            internalSigners: [
                { email: 'alice@company.com', partyId: 'p3', order: 2, status: 'pending', userId: 'u1' },
            ],
        });

        renderPage();

        await waitFor(() => {
            const el = screen.getByTestId('signature-timeline');
            // Two signers at order 1 → only one "1" in uniqueOrders
            expect(JSON.parse(el.dataset.uniqueOrders!)).toEqual([1, 2]);
        });
    });
});

// =============================================================================
// FINALIZE FLOW
// =============================================================================

describe('ContractDetailPage — finalize flow', () => {

    beforeEach(() => {
        mockGetContractViewUrl.mockResolvedValue('https://minio.test/contract.pdf');
    });

    it('calls finalizeContract with the contract id when Finalize is clicked', async () => {
        const user = userEvent.setup();

        const finalizedContract = {
            ...baseContract,
            status: 'SIGNED',
            signatureFlowStatus: 'finalized',
            finalizedAt: '2026-03-01T00:00:00Z',
            externalSigners: [
                { email: 'buyer@client.com', partyId: 'party_buyer', order: 1, status: 'completed', token: 'tok_1' },
            ],
        };

        mockGetContractDetails
            .mockResolvedValueOnce({
                ...baseContract,
                status: 'SIGNED_BY_EVERYONE',
                signatureFlowStatus: 'all_completed',
                externalSigners: [
                    { email: 'buyer@client.com', partyId: 'party_buyer', order: 1, status: 'completed', token: 'tok_1' },
                ],
            })
            .mockResolvedValueOnce(finalizedContract); // second call — page refreshes after finalize

        mockFinalizeContract.mockResolvedValue({ success: true, contract: finalizedContract });

        renderPage();

        const finalizeBtn = await screen.findByTestId('finalize-btn');
        await user.click(finalizeBtn);

        await waitFor(() => {
            expect(mockFinalizeContract).toHaveBeenCalledWith('contract_123');
        });
    });

    it('refreshes the contract after a successful finalize', async () => {
        const user = userEvent.setup();

        const finalizedContract = {
            ...baseContract,
            status: 'SIGNED',
            signatureFlowStatus: 'finalized',
            finalizedAt: '2026-03-01T00:00:00Z',
            externalSigners: [
                { email: 'buyer@client.com', partyId: 'party_buyer', order: 1, status: 'completed', token: 'tok_1' },
            ],
        };

        mockGetContractDetails
            .mockResolvedValueOnce({
                ...baseContract,
                status: 'SIGNED_BY_EVERYONE',
                signatureFlowStatus: 'all_completed',
                externalSigners: [
                    { email: 'buyer@client.com', partyId: 'party_buyer', order: 1, status: 'completed', token: 'tok_1' },
                ],
            })
            .mockResolvedValueOnce(finalizedContract);

        mockFinalizeContract.mockResolvedValue({ success: true, contract: finalizedContract });

        renderPage();

        await user.click(await screen.findByTestId('finalize-btn'));

        // After finalize, getContractDetails should be called a second time to refresh
        await waitFor(() => {
            expect(mockGetContractDetails).toHaveBeenCalledTimes(2);
        });
    });

    it('shows a finalize error in the timeline when finalizeContract returns success=false', async () => {
        const user = userEvent.setup();

        mockGetContractDetails.mockResolvedValue({
            ...baseContract,
            status: 'SIGNED_BY_EVERYONE',
            signatureFlowStatus: 'all_completed',
            externalSigners: [
                { email: 'buyer@client.com', partyId: 'party_buyer', order: 1, status: 'completed', token: 'tok_1' },
            ],
        });

        mockFinalizeContract.mockResolvedValue({
            success: false,
            message: 'Storage service unavailable',
        });

        renderPage();

        await user.click(await screen.findByTestId('finalize-btn'));

        await waitFor(() => {
            expect(screen.getByTestId('finalize-error'))
                .toHaveTextContent('Storage service unavailable');
        });
    });

    it('shows a finalize error when finalizeContract throws', async () => {
        const user = userEvent.setup();

        mockGetContractDetails.mockResolvedValue({
            ...baseContract,
            status: 'SIGNED_BY_EVERYONE',
            signatureFlowStatus: 'all_completed',
            externalSigners: [
                { email: 'buyer@client.com', partyId: 'party_buyer', order: 1, status: 'completed', token: 'tok_1' },
            ],
        });

        mockFinalizeContract.mockRejectedValue(new Error('Network timeout'));

        renderPage();

        await user.click(await screen.findByTestId('finalize-btn'));

        await waitFor(() => {
            expect(screen.getByTestId('finalize-error'))
                .toHaveTextContent('Network timeout');
        });
    });
});

// =============================================================================
// DOCUMENT VIEWER DIALOG
// =============================================================================

describe('ContractDetailPage — document viewer dialog', () => {

    beforeEach(() => {
        mockGetContractDetails.mockResolvedValue({ ...baseContract });
        mockGetContractViewUrl.mockResolvedValue('https://minio.test/contract.pdf');
    });

    it('opens the document viewer when a document row is clicked', async () => {
        const user = userEvent.setup();
        renderPage();

        // The stub ContractDetailsPanel renders a button per document.
        // The document id is the contract id ('contract_123').
        const viewBtn = await screen.findByTestId('view-doc-contract_123');
        await user.click(viewBtn);

        expect(screen.getByTestId('document-viewer')).toBeInTheDocument();
    });

    it('closes the document viewer when Close is clicked', async () => {
        const user = userEvent.setup();
        renderPage();

        // Open
        await user.click(await screen.findByTestId('view-doc-contract_123'));
        expect(screen.getByTestId('document-viewer')).toBeInTheDocument();

        // Close
        await user.click(screen.getByTestId('close-viewer'));
        expect(screen.queryByTestId('document-viewer')).not.toBeInTheDocument();
    });

    it('does NOT show the document viewer on initial load', async () => {
        renderPage();

        await waitFor(() => {
            expect(screen.getByText('Service Agreement')).toBeInTheDocument();
        });

        expect(screen.queryByTestId('document-viewer')).not.toBeInTheDocument();
    });
});
