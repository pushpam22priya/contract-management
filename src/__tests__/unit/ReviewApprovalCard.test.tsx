/**
 * UNIT TESTS — ReviewApprovalCard
 * (src/components/contracts/ReviewApprovalCard.tsx)
 *
 * authService.getCurrentUser is mocked as reviewer@example.com.
 * useTheme is mocked with all required palette fields.
 * All action handlers are jest.fn() callbacks — no service calls are made.
 *
 * Scenarios covered:
 *
 * Rendering
 *  1.  Renders the (truncated) contract title
 *  2.  Renders sender "From:" information
 *  3.  Renders sent date/time when sentAt is present
 *  4.  Renders submission message when present
 *
 * Status chip — reviewer role
 *  5.  Shows "Pending Review" when reviewer status is pending (null)
 *  6.  Shows "Reviewed" when reviewer status is "reviewed"
 *  7.  Shows "Reviewed" when reviewer status is "forwarded"
 *  8.  Shows "Rejected" when reviewer status is "rejected"
 *
 * Status chip — approver role
 *  9.  Shows "Awaiting Reviews" when not all reviewers are done
 * 10.  Shows "Pending Approval" when all reviewers done but approver is pending
 * 11.  Shows "Approved" when approver status is "approved"
 * 12.  Shows "Rejected" when approver status is "rejected"
 *
 * Reviewer action buttons (inside Popover, opened via MoreVert)
 * 13.  Popover opens when the MoreVert button is clicked
 * 14.  "Mark as Reviewed" button is visible for a pending reviewer
 * 15.  Clicking "Mark as Reviewed" calls onMarkAsReviewed with the contract id
 * 16.  "Mark as Reviewed" button is NOT visible for a reviewer who already reviewed
 * 17.  "Mark as Reviewed" button is NOT visible for a reviewer who already forwarded
 *
 * Approver action buttons (inside Popover)
 * 18.  "Approve Contract" button is visible when all reviewers are done and approver is pending
 * 19.  Clicking "Approve Contract" calls onApprove with the contract id
 * 20.  "Approve Contract" button is NOT visible when reviews are incomplete
 * 21.  "Approve Contract" button is NOT visible when contract is already approved
 *
 * View button
 * 22.  Clicking "View Contract" calls onView with the contract id
 *
 * Rejection flow
 * 23.  Clicking "Reject Contract" in Popover shows the rejection textarea
 * 24.  Submitting the rejection with an empty reason triggers window.alert
 * 25.  Submitting with a valid reason calls onReject with contract.id and the message
 * 26.  "Cancel" in rejection input hides the textarea and clears the comment
 */

// ─── Mocks (must precede imports) ─────────────────────────────────────────────

const CURRENT_USER_EMAIL = 'reviewer@example.com';

jest.mock('@/services/authService', () => ({
    authService: {
        getCurrentUser: () => ({
            email: CURRENT_USER_EMAIL,
            isAdmin: false,
            lastLogin: '2026-01-01T00:00:00Z',
        }),
    },
}));

jest.mock('@mui/material', () => ({
    ...jest.requireActual('@mui/material'),
    useTheme: () => ({
        palette: {
            mode: 'light',
            primary: { main: '#1976d2' },
            info:    { main: '#0288d1' },
            text:    { secondary: '#666666' },
            error:   { main: '#d32f2f' },
        },
        breakpoints: { down: () => '(max-width:599.95px)' },
    }),
}));

// ─── Imports ──────────────────────────────────────────────────────────────────

import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import ReviewApprovalCard from '@/components/contracts/ReviewApprovalCard';
import { ContractStatus } from '@/types/contract';

// ─── Fixtures ─────────────────────────────────────────────────────────────────

const CONTRACT_ID = 'contract_001';

function makeContract(overrides: Record<string, any> = {}) {
    return {
        id: CONTRACT_ID,
        title: 'Service Agreement',
        status: ContractStatus.IN_REVIEW,
        createdBy: 'initiator@example.com',
        createdAt: '2026-01-01T00:00:00Z',
        updatedAt: '2026-01-01T00:00:00Z',
        reviewers: [{
            email: CURRENT_USER_EMAIL,
            status: 'pending',
            sentBy: 'initiator@example.com',
            sentAt: '2026-01-01T10:00:00Z',
            submissionMessage: 'Please review by Friday',
        }],
        approver: {
            email: 'approver@example.com',
            status: 'pending',
            sentBy: 'initiator@example.com',
            sentAt: '2026-01-01T10:00:00Z',
        },
        client: 'Acme Corp',
        ...overrides,
    } as unknown as any;
}

const onView          = jest.fn();
const onMarkAsReviewed = jest.fn();
const onApprove       = jest.fn();
const onReject        = jest.fn();

function renderCard(contract: any, userRole: 'reviewer' | 'approver' = 'reviewer') {
    return render(
        <ReviewApprovalCard
            contract={contract}
            userRole={userRole}
            onView={onView}
            onMarkAsReviewed={onMarkAsReviewed}
            onApprove={onApprove}
            onReject={onReject}
        />
    );
}

function openPopover() {
    const moreVertButton = screen.getByTestId('MoreVertIcon').closest('button')!;
    fireEvent.click(moreVertButton);
}

beforeEach(() => jest.clearAllMocks());

// =============================================================================
// 1–4. Rendering
// =============================================================================

describe('ReviewApprovalCard — rendering', () => {

    it('renders the (truncated) contract title', () => {
        renderCard(makeContract());
        // title "Service Agreement" is 17 chars — not truncated
        expect(screen.getByText('Service Agreement')).toBeInTheDocument();
    });

    it('renders "From:" with the sender email', () => {
        renderCard(makeContract());
        expect(screen.getByText(/From:.*initiator@example\.com/)).toBeInTheDocument();
    });

    it('renders the sent date/time when sentAt is present', () => {
        renderCard(makeContract());
        // formatDateTime('2026-01-01T10:00:00Z') → "01/01/2026, 10:00" (UTC)
        expect(screen.getByText(/01\/01\/2026/)).toBeInTheDocument();
    });

    it('renders the submission message when present', () => {
        renderCard(makeContract());
        expect(screen.getByText(/"Please review by Friday"/)).toBeInTheDocument();
    });
});

// =============================================================================
// 5–8. Status chip — reviewer role
// =============================================================================

describe('ReviewApprovalCard — reviewer status chip', () => {

    it('shows "Pending Review" when reviewer status is pending', () => {
        renderCard(makeContract({ reviewers: [{ email: CURRENT_USER_EMAIL, status: 'pending' }] }));
        expect(screen.getByText('Pending Review')).toBeInTheDocument();
    });

    it('shows "Reviewed" when reviewer status is "reviewed"', () => {
        renderCard(makeContract({ reviewers: [{ email: CURRENT_USER_EMAIL, status: 'reviewed' }] }));
        expect(screen.getByText('Reviewed')).toBeInTheDocument();
    });

    it('shows "Reviewed" when reviewer status is "forwarded"', () => {
        renderCard(makeContract({ reviewers: [{ email: CURRENT_USER_EMAIL, status: 'forwarded' }] }));
        expect(screen.getByText('Reviewed')).toBeInTheDocument();
    });

    it('shows "Rejected" when reviewer status is "rejected"', () => {
        renderCard(makeContract({ reviewers: [{ email: CURRENT_USER_EMAIL, status: 'rejected' }] }));
        expect(screen.getByText('Rejected')).toBeInTheDocument();
    });
});

// =============================================================================
// 9–12. Status chip — approver role
// =============================================================================

describe('ReviewApprovalCard — approver status chip', () => {

    it('shows "Awaiting Reviews" when not all reviewers are done', () => {
        const contract = makeContract({
            reviewers: [{ email: 'other@example.com', status: 'pending' }],
            approver: { email: 'approver@example.com', status: 'pending' },
            status: ContractStatus.IN_REVIEW,
        });
        renderCard(contract, 'approver');
        expect(screen.getByText('Awaiting Reviews')).toBeInTheDocument();
    });

    it('shows "Pending Approval" when all reviewers are done and approver is pending', () => {
        const contract = makeContract({
            reviewers: [{ email: 'other@example.com', status: 'reviewed' }],
            approver: { email: 'approver@example.com', status: 'pending' },
            status: ContractStatus.IN_APPROVAL,
        });
        renderCard(contract, 'approver');
        expect(screen.getByText('Pending Approval')).toBeInTheDocument();
    });

    it('shows "Approved" when approver status is "approved"', () => {
        const contract = makeContract({
            reviewers: [{ email: 'other@example.com', status: 'reviewed' }],
            approver: { email: 'approver@example.com', status: 'approved' },
        });
        renderCard(contract, 'approver');
        expect(screen.getByText('Approved')).toBeInTheDocument();
    });

    it('shows "Rejected" when approver status is "rejected"', () => {
        const contract = makeContract({
            reviewers: [{ email: 'other@example.com', status: 'reviewed' }],
            approver: { email: 'approver@example.com', status: 'rejected' },
        });
        renderCard(contract, 'approver');
        expect(screen.getByText('Rejected')).toBeInTheDocument();
    });
});

// =============================================================================
// 13–17. Reviewer action buttons (inside Popover)
// =============================================================================

describe('ReviewApprovalCard — reviewer action buttons', () => {

    it('popover opens when the MoreVert button is clicked', async () => {
        renderCard(makeContract());
        openPopover();
        await waitFor(() => {
            expect(screen.getByRole('button', { name: 'View Contract' })).toBeInTheDocument();
        });
    });

    it('"Mark as Reviewed" button is visible for a pending reviewer', async () => {
        renderCard(makeContract({ reviewers: [{ email: CURRENT_USER_EMAIL, status: 'pending' }] }));
        openPopover();
        await waitFor(() => {
            expect(screen.getByRole('button', { name: 'Mark as Reviewed' })).toBeInTheDocument();
        });
    });

    it('clicking "Mark as Reviewed" calls onMarkAsReviewed with the contract id', async () => {
        renderCard(makeContract({ reviewers: [{ email: CURRENT_USER_EMAIL, status: 'pending' }] }));
        openPopover();
        await waitFor(() => screen.getByRole('button', { name: 'Mark as Reviewed' }));
        fireEvent.click(screen.getByRole('button', { name: 'Mark as Reviewed' }));
        expect(onMarkAsReviewed).toHaveBeenCalledWith(CONTRACT_ID);
    });

    it('"Mark as Reviewed" button is NOT visible for a reviewer who already reviewed', async () => {
        renderCard(makeContract({ reviewers: [{ email: CURRENT_USER_EMAIL, status: 'reviewed' }] }));
        openPopover();
        await waitFor(() => screen.getByRole('button', { name: 'View Contract' }));
        expect(screen.queryByRole('button', { name: 'Mark as Reviewed' })).not.toBeInTheDocument();
    });

    it('"Mark as Reviewed" button is NOT visible for a reviewer who forwarded', async () => {
        renderCard(makeContract({ reviewers: [{ email: CURRENT_USER_EMAIL, status: 'forwarded' }] }));
        openPopover();
        await waitFor(() => screen.getByRole('button', { name: 'View Contract' }));
        expect(screen.queryByRole('button', { name: 'Mark as Reviewed' })).not.toBeInTheDocument();
    });
});

// =============================================================================
// 18–21. Approver action buttons (inside Popover)
// =============================================================================

describe('ReviewApprovalCard — approver action buttons', () => {

    it('"Approve Contract" button is visible when all reviewers are done and approver is pending', async () => {
        const contract = makeContract({
            reviewers: [{ email: 'other@example.com', status: 'reviewed' }],
            approver: { email: 'approver@example.com', status: 'pending' },
        });
        renderCard(contract, 'approver');
        openPopover();
        await waitFor(() => {
            expect(screen.getByRole('button', { name: 'Approve Contract' })).toBeInTheDocument();
        });
    });

    it('clicking "Approve Contract" calls onApprove with the contract id', async () => {
        const contract = makeContract({
            reviewers: [{ email: 'other@example.com', status: 'reviewed' }],
            approver: { email: 'approver@example.com', status: 'pending' },
        });
        renderCard(contract, 'approver');
        openPopover();
        await waitFor(() => screen.getByRole('button', { name: 'Approve Contract' }));
        fireEvent.click(screen.getByRole('button', { name: 'Approve Contract' }));
        expect(onApprove).toHaveBeenCalledWith(CONTRACT_ID);
    });

    it('"Approve Contract" button is NOT visible when reviews are still incomplete', async () => {
        const contract = makeContract({
            reviewers: [{ email: 'other@example.com', status: 'pending' }],
            approver: { email: 'approver@example.com', status: 'pending' },
        });
        renderCard(contract, 'approver');
        openPopover();
        await waitFor(() => screen.getByRole('button', { name: 'View Contract' }));
        expect(screen.queryByRole('button', { name: 'Approve Contract' })).not.toBeInTheDocument();
    });

    it('"Approve Contract" button is NOT visible when contract is already approved', async () => {
        const contract = makeContract({
            reviewers: [{ email: 'other@example.com', status: 'reviewed' }],
            approver: { email: 'approver@example.com', status: 'approved' },
        });
        renderCard(contract, 'approver');
        openPopover();
        await waitFor(() => screen.getByRole('button', { name: 'View Contract' }));
        expect(screen.queryByRole('button', { name: 'Approve Contract' })).not.toBeInTheDocument();
    });
});

// =============================================================================
// 22. View button
// =============================================================================

describe('ReviewApprovalCard — view button', () => {

    it('clicking "View Contract" calls onView with the contract id', async () => {
        renderCard(makeContract());
        openPopover();
        await waitFor(() => screen.getByRole('button', { name: 'View Contract' }));
        fireEvent.click(screen.getByRole('button', { name: 'View Contract' }));
        expect(onView).toHaveBeenCalledWith(CONTRACT_ID);
    });
});

// =============================================================================
// 23–26. Rejection flow
// =============================================================================

describe('ReviewApprovalCard — rejection flow', () => {

    let alertSpy: jest.SpyInstance;

    beforeEach(() => {
        alertSpy = jest.spyOn(window, 'alert').mockImplementation(() => {});
    });

    afterEach(() => {
        alertSpy.mockRestore();
    });

    it('clicking "Reject Contract" in the Popover shows the rejection textarea', async () => {
        renderCard(makeContract({ reviewers: [{ email: CURRENT_USER_EMAIL, status: 'pending' }] }));
        openPopover();
        await waitFor(() => screen.getByRole('button', { name: 'Reject Contract' }));
        fireEvent.click(screen.getByRole('button', { name: 'Reject Contract' }));
        expect(screen.getByPlaceholderText(/enter rejection reason/i)).toBeInTheDocument();
    });

    it('submitting with an empty rejection reason triggers window.alert', async () => {
        renderCard(makeContract({ reviewers: [{ email: CURRENT_USER_EMAIL, status: 'pending' }] }));
        openPopover();
        await waitFor(() => screen.getByRole('button', { name: 'Reject Contract' }));
        fireEvent.click(screen.getByRole('button', { name: 'Reject Contract' }));

        // Click "Reject" without entering a reason
        fireEvent.click(screen.getByRole('button', { name: /^reject$/i }));

        expect(alertSpy).toHaveBeenCalledWith('Please enter a rejection reason');
        expect(onReject).not.toHaveBeenCalled();
    });

    it('submitting with a valid reason calls onReject with contract.id and the message', async () => {
        renderCard(makeContract({ reviewers: [{ email: CURRENT_USER_EMAIL, status: 'pending' }] }));
        openPopover();
        await waitFor(() => screen.getByRole('button', { name: 'Reject Contract' }));
        fireEvent.click(screen.getByRole('button', { name: 'Reject Contract' }));

        fireEvent.change(
            screen.getByPlaceholderText(/enter rejection reason/i),
            { target: { value: 'Missing compliance section' } }
        );
        fireEvent.click(screen.getByRole('button', { name: /^reject$/i }));

        expect(onReject).toHaveBeenCalledWith(CONTRACT_ID, 'Missing compliance section');
    });

    it('"Cancel" in the rejection input hides the textarea and clears the comment', async () => {
        renderCard(makeContract({ reviewers: [{ email: CURRENT_USER_EMAIL, status: 'pending' }] }));
        openPopover();
        await waitFor(() => screen.getByRole('button', { name: 'Reject Contract' }));
        fireEvent.click(screen.getByRole('button', { name: 'Reject Contract' }));

        const textarea = screen.getByPlaceholderText(/enter rejection reason/i);
        fireEvent.change(textarea, { target: { value: 'Some reason' } });

        fireEvent.click(screen.getByRole('button', { name: /^cancel$/i }));

        expect(screen.queryByPlaceholderText(/enter rejection reason/i)).not.toBeInTheDocument();
        expect(onReject).not.toHaveBeenCalled();
    });
});
