/**
 * INTEGRATION TESTS — ReviewConfirmationDialog
 * (src/components/contracts/ReviewConfirmationDialog.tsx)
 *
 * No API calls are made by this component — it delegates to prop callbacks.
 * useTheme and useMediaQuery are mocked because BaseDialog requires them.
 *
 * Scenarios covered:
 *
 * Rendering
 *  1.  Renders dialog title "REVIEW CONFIRMATION"
 *  2.  Displays the contract title
 *  3.  Shows the optional message text field
 *  4.  Shows "0/500" character counter on initial render
 *  5.  Updates character counter as the user types
 *
 * "Mark as Reviewed" option
 *  6.  Calls onMarkAsReviewed with the trimmed comment when clicked
 *  7.  Calls onMarkAsReviewed with undefined when message is empty
 *  8.  Calls onMarkAsReviewed with undefined when message is whitespace-only
 *  9.  Calls onClose after clicking "Mark as Reviewed"
 *
 * "Mark as Reviewed & Send for Further Review" option
 * 10.  Calls onMarkAndSendForFurtherReview with the trimmed comment when clicked
 * 11.  Calls onMarkAndSendForFurtherReview with undefined when message is empty
 * 12.  Calls onClose after clicking the further review option
 *
 * Cancel
 * 13.  Cancel button calls onClose
 * 14.  Cancel does NOT call either action handler
 */

// ─── Mocks (must precede imports) ─────────────────────────────────────────────

jest.mock('@mui/material', () => ({
    ...jest.requireActual('@mui/material'),
    useTheme: () => ({
        palette: {
            mode: 'light',
            primary: { main: '#1976d2' },
            info: { main: '#0288d1' },
            text: { secondary: '#666' },
        },
        breakpoints: { down: () => '(max-width:599.95px)' },
    }),
    useMediaQuery: () => false,
}));

// ─── Imports ──────────────────────────────────────────────────────────────────

import { render, screen, fireEvent } from '@testing-library/react';
import ReviewConfirmationDialog from '@/components/contracts/ReviewConfirmationDialog';

// ─── Fixtures & helpers ───────────────────────────────────────────────────────

const onClose                      = jest.fn();
const onMarkAsReviewed             = jest.fn();
const onMarkAndSendForFurtherReview = jest.fn();

function renderDialog() {
    return render(
        <ReviewConfirmationDialog
            open={true}
            onClose={onClose}
            contractTitle="Service Agreement"
            onMarkAsReviewed={onMarkAsReviewed}
            onMarkAndSendForFurtherReview={onMarkAndSendForFurtherReview}
        />
    );
}

beforeEach(() => jest.clearAllMocks());

// =============================================================================
// 1–5. Rendering
// =============================================================================

describe('ReviewConfirmationDialog — rendering', () => {

    it('renders the dialog title "REVIEW CONFIRMATION"', () => {
        renderDialog();
        expect(screen.getByText('REVIEW CONFIRMATION')).toBeInTheDocument();
    });

    it('displays the contract title', () => {
        renderDialog();
        expect(screen.getByText('Service Agreement')).toBeInTheDocument();
    });

    it('shows the optional message text field', () => {
        renderDialog();
        expect(screen.getByLabelText(/message \(optional\)/i)).toBeInTheDocument();
    });

    it('shows "0/500" character counter on initial render', () => {
        renderDialog();
        expect(screen.getByText('0/500')).toBeInTheDocument();
    });

    it('updates the character counter as the user types', () => {
        renderDialog();
        const input = screen.getByLabelText(/message \(optional\)/i);
        fireEvent.change(input, { target: { value: 'Hello' } });
        expect(screen.getByText('5/500')).toBeInTheDocument();
    });
});

// =============================================================================
// 6–9. "Mark as Reviewed" option
// =============================================================================

describe('ReviewConfirmationDialog — "Mark as Reviewed"', () => {

    it('calls onMarkAsReviewed with the trimmed comment when clicked', () => {
        renderDialog();
        const input = screen.getByLabelText(/message \(optional\)/i);
        fireEvent.change(input, { target: { value: '  Looks good  ' } });

        fireEvent.click(screen.getByText('Mark as Reviewed'));

        expect(onMarkAsReviewed).toHaveBeenCalledWith('Looks good');
    });

    it('calls onMarkAsReviewed with undefined when message is empty', () => {
        renderDialog();
        fireEvent.click(screen.getByText('Mark as Reviewed'));
        expect(onMarkAsReviewed).toHaveBeenCalledWith(undefined);
    });

    it('calls onMarkAsReviewed with undefined when message is whitespace-only', () => {
        renderDialog();
        const input = screen.getByLabelText(/message \(optional\)/i);
        fireEvent.change(input, { target: { value: '   ' } });

        fireEvent.click(screen.getByText('Mark as Reviewed'));

        expect(onMarkAsReviewed).toHaveBeenCalledWith(undefined);
    });

    it('calls onClose after clicking "Mark as Reviewed"', () => {
        renderDialog();
        fireEvent.click(screen.getByText('Mark as Reviewed'));
        expect(onClose).toHaveBeenCalledTimes(1);
    });
});

// =============================================================================
// 10–12. "Mark as Reviewed & Send for Further Review" option
// =============================================================================

describe('ReviewConfirmationDialog — "Send for Further Review"', () => {

    it('calls onMarkAndSendForFurtherReview with the trimmed comment when clicked', () => {
        renderDialog();
        const input = screen.getByLabelText(/message \(optional\)/i);
        fireEvent.change(input, { target: { value: 'Please check section 3' } });

        fireEvent.click(screen.getByText('Mark as Reviewed & Send for Further Review'));

        expect(onMarkAndSendForFurtherReview).toHaveBeenCalledWith('Please check section 3');
    });

    it('calls onMarkAndSendForFurtherReview with undefined when message is empty', () => {
        renderDialog();
        fireEvent.click(screen.getByText('Mark as Reviewed & Send for Further Review'));
        expect(onMarkAndSendForFurtherReview).toHaveBeenCalledWith(undefined);
    });

    it('calls onClose after clicking the further review option', () => {
        renderDialog();
        fireEvent.click(screen.getByText('Mark as Reviewed & Send for Further Review'));
        expect(onClose).toHaveBeenCalledTimes(1);
    });
});

// =============================================================================
// 13–14. Cancel
// =============================================================================

describe('ReviewConfirmationDialog — cancel', () => {

    it('Cancel button calls onClose', () => {
        renderDialog();
        fireEvent.click(screen.getByRole('button', { name: /cancel/i }));
        expect(onClose).toHaveBeenCalledTimes(1);
    });

    it('Cancel does NOT call either action handler', () => {
        renderDialog();
        fireEvent.click(screen.getByRole('button', { name: /cancel/i }));
        expect(onMarkAsReviewed).not.toHaveBeenCalled();
        expect(onMarkAndSendForFurtherReview).not.toHaveBeenCalled();
    });
});
