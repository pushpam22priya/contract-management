/**
 * INTEGRATION TESTS — FurtherReviewDialog
 * (src/components/teams/FurtherReviewDialog.tsx)
 *
 * userService.getAllUsers is mocked — no real HTTP calls are made.
 * onSubmit is a jest.fn() callback — contractService is not called by the dialog.
 * useTheme and useMediaQuery are mocked because BaseDialog requires them.
 *
 * Scenarios covered:
 *
 * Rendering
 *  1.  Renders dialog title "Forward for Further Review"
 *  2.  Displays the contract title in the info box
 *  3.  Shows the autocomplete reviewer selector
 *  4.  Shows the optional message textarea
 *  5.  "Submit for Further Review" button is disabled when no reviewers are selected
 *
 * User loading
 *  6.  Calls userService.getAllUsers when dialog opens
 *  7.  Shows error alert when user loading fails
 *
 * Reviewer filtering (exclusion logic)
 *  8.  Available options exclude existing reviewer emails
 *  9.  Available options exclude the approver email
 * 10.  Available options exclude the contract initiator email
 *
 * Successful submit
 * 11.  Calls onSubmit with the selected reviewer emails
 * 12.  Calls onSubmit without a message when the message field is empty
 * 13.  Calls onSubmit with trimmed message when provided
 * 14.  Calls onClose after a successful submit
 *
 * Error handling
 * 15.  Shows error alert when no reviewer is selected and submit is clicked
 * 16.  Shows error alert when onSubmit rejects
 *
 * initialMessage prop
 * 17.  Pre-populates the message field from the initialMessage prop
 *
 * Cancel
 * 18.  Cancel button calls onClose without calling onSubmit
 */

// ─── Mocks (must precede imports) ─────────────────────────────────────────────

const mockGetAllUsers = jest.fn();
jest.mock('@/services/userService', () => ({
    userService: { getAllUsers: (...args: any[]) => mockGetAllUsers(...args) },
}));

jest.mock('@mui/material', () => ({
    ...jest.requireActual('@mui/material'),
    useTheme: () => ({
        palette: {
            mode: 'light',
            primary: { main: '#1976d2' },
            text:    { secondary: '#666' },
            action:  { hover: 'rgba(0,0,0,0.04)' },
        },
        breakpoints: { down: () => '(max-width:599.95px)' },
    }),
    useMediaQuery: () => false,
}));

// ─── Imports ──────────────────────────────────────────────────────────────────

import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import FurtherReviewDialog from '@/components/contracts/FurtherReviewDialog';

// ─── Fixtures ─────────────────────────────────────────────────────────────────

const ALL_USERS = [
    { id: 'u1', name: 'Alice Smith',  email: 'alice@example.com' },
    { id: 'u2', name: 'Bob Jones',    email: 'bob@example.com' },
    { id: 'u3', name: 'Carol Brown',  email: 'carol@example.com' },
    { id: 'u4', name: 'Dave Wilson',  email: 'existing@example.com' },  // existing reviewer
    { id: 'u5', name: 'Eve Martin',   email: 'approver@example.com' },  // approver
    { id: 'u6', name: 'Frank Lee',    email: 'initiator@example.com' }, // initiator
];

const DEFAULT_PROPS = {
    open: true,
    contractId: 'contract_001',
    contractTitle: 'Service Agreement',
    existingReviewers: ['existing@example.com'],
    existingApprover: 'approver@example.com',
    contractInitiator: 'initiator@example.com',
};

const onClose  = jest.fn();
const onSubmit = jest.fn();

function renderDialog(overrides: Partial<typeof DEFAULT_PROPS & { initialMessage?: string }> = {}) {
    const props = { ...DEFAULT_PROPS, ...overrides, onClose, onSubmit };
    return render(<FurtherReviewDialog {...props} />);
}

/** Opens the Autocomplete dropdown and selects the first option */
async function selectFirstAvailableUser() {
    const input = screen.getByPlaceholderText(/search and select reviewers/i);
    fireEvent.mouseDown(input);
    await waitFor(() => screen.getByRole('listbox'));
    const options = screen.getAllByRole('option');
    fireEvent.click(options[0]);
}

beforeEach(() => {
    jest.clearAllMocks();
    mockGetAllUsers.mockResolvedValue(ALL_USERS);
});

// =============================================================================
// 1–5. Rendering
// =============================================================================

describe('FurtherReviewDialog — rendering', () => {

    it('renders dialog title "Forward for Further Review"', async () => {
        renderDialog();
        await waitFor(() => expect(mockGetAllUsers).toHaveBeenCalled());
        expect(screen.getByText('Forward for Further Review')).toBeInTheDocument();
    });

    it('displays the contract title in the info box', async () => {
        renderDialog();
        await waitFor(() => expect(mockGetAllUsers).toHaveBeenCalled());
        expect(screen.getByText('Service Agreement')).toBeInTheDocument();
    });

    it('shows the autocomplete reviewer selector', async () => {
        renderDialog();
        await waitFor(() => expect(mockGetAllUsers).toHaveBeenCalled());
        expect(screen.getByPlaceholderText(/search and select reviewers/i)).toBeInTheDocument();
    });

    it('shows the optional message textarea', async () => {
        renderDialog();
        await waitFor(() => expect(mockGetAllUsers).toHaveBeenCalled());
        expect(screen.getByLabelText(/message \(optional\)/i)).toBeInTheDocument();
    });

    it('"Submit for Further Review" button is disabled when no reviewers are selected', async () => {
        renderDialog();
        await waitFor(() => expect(mockGetAllUsers).toHaveBeenCalled());
        expect(screen.getByRole('button', { name: /submit for further review/i })).toBeDisabled();
    });
});

// =============================================================================
// 6–7. User loading
// =============================================================================

describe('FurtherReviewDialog — user loading', () => {

    it('calls userService.getAllUsers when the dialog opens', async () => {
        renderDialog();
        await waitFor(() => expect(mockGetAllUsers).toHaveBeenCalledTimes(1));
    });

    it('shows an error alert when user loading fails', async () => {
        mockGetAllUsers.mockRejectedValueOnce(new Error('Network error'));
        renderDialog();
        await waitFor(() => {
            expect(screen.getByRole('alert')).toBeInTheDocument();
        });
        expect(screen.getByText(/failed to load users/i)).toBeInTheDocument();
    });
});

// =============================================================================
// 8–10. Reviewer filtering (exclusion logic)
// =============================================================================

describe('FurtherReviewDialog — exclusion logic', () => {

    async function getOptionEmails() {
        const input = screen.getByPlaceholderText(/search and select reviewers/i);
        fireEvent.mouseDown(input);
        await waitFor(() => screen.getByRole('listbox'));
        return screen.getAllByRole('option').map(o => o.textContent ?? '');
    }

    it('does NOT include existing reviewer emails in the autocomplete options', async () => {
        renderDialog();
        await waitFor(() => expect(mockGetAllUsers).toHaveBeenCalled());
        const labels = await getOptionEmails();
        expect(labels.some(l => l.includes('existing@example.com'))).toBe(false);
    });

    it('does NOT include the approver email in the autocomplete options', async () => {
        renderDialog();
        await waitFor(() => expect(mockGetAllUsers).toHaveBeenCalled());
        const labels = await getOptionEmails();
        expect(labels.some(l => l.includes('approver@example.com'))).toBe(false);
    });

    it('does NOT include the contract initiator email in the autocomplete options', async () => {
        renderDialog();
        await waitFor(() => expect(mockGetAllUsers).toHaveBeenCalled());
        const labels = await getOptionEmails();
        expect(labels.some(l => l.includes('initiator@example.com'))).toBe(false);
    });
});

// =============================================================================
// 11–14. Successful submit
// =============================================================================

describe('FurtherReviewDialog — successful submit', () => {

    it('calls onSubmit with the selected reviewer emails', async () => {
        onSubmit.mockResolvedValueOnce(undefined);
        renderDialog();
        await waitFor(() => expect(mockGetAllUsers).toHaveBeenCalled());

        await selectFirstAvailableUser();
        await act(async () => {
            fireEvent.click(screen.getByRole('button', { name: /submit for further review/i }));
        });

        await waitFor(() => {
            expect(onSubmit).toHaveBeenCalledWith(
                expect.arrayContaining([expect.any(String)]),
                undefined
            );
        });
    });

    it('calls onSubmit without a message when the message field is empty', async () => {
        onSubmit.mockResolvedValueOnce(undefined);
        renderDialog();
        await waitFor(() => expect(mockGetAllUsers).toHaveBeenCalled());

        await selectFirstAvailableUser();
        await act(async () => {
            fireEvent.click(screen.getByRole('button', { name: /submit for further review/i }));
        });

        await waitFor(() => {
            const [, message] = onSubmit.mock.calls[0];
            expect(message).toBeUndefined();
        });
    });

    it('calls onSubmit with the trimmed message when provided', async () => {
        onSubmit.mockResolvedValueOnce(undefined);
        renderDialog();
        await waitFor(() => expect(mockGetAllUsers).toHaveBeenCalled());

        const msgInput = screen.getByLabelText(/message \(optional\)/i);
        fireEvent.change(msgInput, { target: { value: '  Please focus on section 3  ' } });

        await selectFirstAvailableUser();
        await act(async () => {
            fireEvent.click(screen.getByRole('button', { name: /submit for further review/i }));
        });

        await waitFor(() => {
            const [, message] = onSubmit.mock.calls[0];
            expect(message).toBe('Please focus on section 3');
        });
    });

    it('calls onClose after a successful submit', async () => {
        onSubmit.mockResolvedValueOnce(undefined);
        renderDialog();
        await waitFor(() => expect(mockGetAllUsers).toHaveBeenCalled());

        await selectFirstAvailableUser();
        await act(async () => {
            fireEvent.click(screen.getByRole('button', { name: /submit for further review/i }));
        });

        await waitFor(() => expect(onClose).toHaveBeenCalledTimes(1));
    });
});

// =============================================================================
// 15–16. Error handling
// =============================================================================

describe('FurtherReviewDialog — error handling', () => {

    it('does not call onSubmit when no reviewer is selected and the submit button is disabled', async () => {
        renderDialog();
        await waitFor(() => expect(mockGetAllUsers).toHaveBeenCalled());

        const submitButton = screen.getByRole('button', { name: /submit for further review/i });
        expect(submitButton).toBeDisabled();

        await act(async () => {
            fireEvent.click(submitButton);
        });

        expect(onSubmit).not.toHaveBeenCalled();
        expect(screen.queryByText(/please select at least one additional reviewer/i)).not.toBeInTheDocument();
    });

    it('shows an error alert when onSubmit rejects', async () => {
        onSubmit.mockRejectedValueOnce(new Error('Network error'));
        renderDialog();
        await waitFor(() => expect(mockGetAllUsers).toHaveBeenCalled());

        await selectFirstAvailableUser();
        await act(async () => {
            fireEvent.click(screen.getByRole('button', { name: /submit for further review/i }));
        });

        await waitFor(() => {
            expect(screen.getByText(/failed to submit for further review/i)).toBeInTheDocument();
        });
    });
});

// =============================================================================
// 17. initialMessage prop
// =============================================================================

describe('FurtherReviewDialog — initialMessage', () => {

    it('pre-populates the message field from the initialMessage prop', async () => {
        renderDialog({ initialMessage: 'Pay attention to clause 5' });
        await waitFor(() => expect(mockGetAllUsers).toHaveBeenCalled());
        expect(screen.getByLabelText(/message \(optional\)/i)).toHaveValue('Pay attention to clause 5');
    });
});

// =============================================================================
// 18. Cancel
// =============================================================================

describe('FurtherReviewDialog — cancel', () => {

    it('Cancel button calls onClose without calling onSubmit', async () => {
        renderDialog();
        await waitFor(() => expect(mockGetAllUsers).toHaveBeenCalled());

        fireEvent.click(screen.getByRole('button', { name: /cancel/i }));

        expect(onClose).toHaveBeenCalledTimes(1);
        expect(onSubmit).not.toHaveBeenCalled();
    });
});
