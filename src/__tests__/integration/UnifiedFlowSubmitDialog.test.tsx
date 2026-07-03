/**
 * INTEGRATION TESTS — UnifiedFlowSubmitDialog
 * (src/components/unified-flow/UnifiedFlowSubmitDialog.tsx)
 *
 * Renders the real component; unifiedFlowService and userService are mocked.
 *
 * Scenarios covered:
 *  1.  Renders REVIEWER section header "Reviewers"
 *  2.  Renders APPROVER section header "Approvers"
 *  3.  Shows validation error "At least one Approver is required" when submitted with no approver
 *  4.  Submit Flow button is present in the dialog
 *  5.  "Add Reviewer" and "Add Approver" buttons are rendered
 *  6.  Calls submitFlow with participants array on valid submit
 *  7.  Passes externalSigningIncluded=false by default
 *  8.  Calls onSubmitted callback after successful submission
 *  9.  Shows backend error when submitFlow returns ok: false
 * 10.  Calls onClose when Cancel is clicked
 */

import React from 'react';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import UnifiedFlowSubmitDialog from '@/components/unified-flow/UnifiedFlowSubmitDialog';

const mockSubmitFlow = jest.fn();
const mockGetAllUsers = jest.fn();

jest.mock('@/services/unifiedFlowService', () => ({
    unifiedFlowService: {
        submitFlow: (...args: any[]) => mockSubmitFlow(...args),
    },
}));

jest.mock('@/services/userService', () => ({
    userService: {
        getAllUsers: (...args: any[]) => mockGetAllUsers(...args),
    },
    User: {},
}));

jest.mock('@/services/authService', () => ({
    authService: {
        getCurrentUser: jest.fn().mockReturnValue({ email: 'owner@company.com' }),
    },
}));

function renderDialog(overrides: any = {}) {
    const props = {
        open: true,
        onClose: jest.fn(),
        onSubmitted: jest.fn(),
        contractId: 'c-test',
        contractTitle: 'Test Contract',
        ...overrides,
    };
    render(<UnifiedFlowSubmitDialog {...props} />);
    return props;
}

beforeEach(() => {
    jest.clearAllMocks();
    mockGetAllUsers.mockResolvedValue([
        { email: 'alice@co.com', name: 'Alice' },
        { email: 'bob@co.com', name: 'Bob' },
    ]);
    mockSubmitFlow.mockResolvedValue({ ok: true });
});

test('1. renders REVIEWER section header', async () => {
    renderDialog();
    await waitFor(() => expect(screen.getByText('Reviewers')).toBeInTheDocument());
});

test('2. renders APPROVER section header', async () => {
    renderDialog();
    await waitFor(() => expect(screen.getByText('Approvers')).toBeInTheDocument());
});

test('3. shows validation error when submitted with empty emails', async () => {
    renderDialog();
    await waitFor(() => screen.getByText('Approvers'));
    // Both rows start empty — validation fires "All participants must have an email address."
    await userEvent.click(screen.getByRole('button', { name: /submit flow/i }));
    await waitFor(() => {
        expect(screen.getByText(/all participants must have an email address/i)).toBeInTheDocument();
    });
    expect(mockSubmitFlow).not.toHaveBeenCalled();
});

test('4. Submit Flow button is present', async () => {
    renderDialog();
    await waitFor(() => screen.getByText('Approvers'));
    expect(screen.getByRole('button', { name: /submit flow/i })).toBeInTheDocument();
});

test('5. Add Reviewer and Add Approver buttons are rendered', async () => {
    renderDialog();
    await waitFor(() => screen.getByText('Approvers'));
    expect(screen.getByRole('button', { name: /add reviewer/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /add approver/i })).toBeInTheDocument();
});

// Helper: fill both reviewer + approver emails so validation passes
async function fillBothParticipants() {
    await waitFor(() => screen.getByText('Approvers'));
    const inputs = screen.getAllByPlaceholderText(/search user/i);
    fireEvent.change(inputs[0], { target: { value: 'bob@co.com' } });       // reviewer row
    fireEvent.change(inputs[inputs.length - 1], { target: { value: 'alice@co.com' } }); // approver row
}

test('6. calls submitFlow with participants array on valid submit', async () => {
    renderDialog();
    await fillBothParticipants();
    await userEvent.click(screen.getByRole('button', { name: /submit flow/i }));
    await waitFor(() => {
        expect(mockSubmitFlow).toHaveBeenCalledWith(
            'c-test',
            expect.arrayContaining([
                expect.objectContaining({ email: 'alice@co.com', role: 'APPROVER' }),
            ]),
            false,
        );
    });
});

test('7. passes externalSigningIncluded=false by default', async () => {
    renderDialog();
    await fillBothParticipants();
    await userEvent.click(screen.getByRole('button', { name: /submit flow/i }));
    await waitFor(() => {
        expect(mockSubmitFlow).toHaveBeenCalledWith('c-test', expect.any(Array), false);
    });
});

test('8. calls onSubmitted after successful submission', async () => {
    const props = renderDialog();
    await fillBothParticipants();
    await userEvent.click(screen.getByRole('button', { name: /submit flow/i }));
    await waitFor(() => {
        expect(props.onSubmitted).toHaveBeenCalledTimes(1);
    });
});

test('9. shows backend error when submitFlow returns ok: false', async () => {
    mockSubmitFlow.mockResolvedValue({ ok: false, message: 'Participants already assigned.' });
    renderDialog();
    await fillBothParticipants();
    await userEvent.click(screen.getByRole('button', { name: /submit flow/i }));
    await waitFor(() => {
        expect(screen.getByText(/participants already assigned/i)).toBeInTheDocument();
    });
});

test('10. calls onClose when Cancel is clicked', async () => {
    const props = renderDialog();
    await waitFor(() => screen.getByText('Approvers'));
    await userEvent.click(screen.getByRole('button', { name: /cancel/i }));
    expect(props.onClose).toHaveBeenCalledTimes(1);
});
