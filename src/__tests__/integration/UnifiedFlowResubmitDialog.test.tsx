/**
 * INTEGRATION TESTS — UnifiedFlowResubmitDialog
 * (src/components/unified-flow/UnifiedFlowResubmitDialog.tsx)
 *
 * Two modes: approver rejection (reviewers locked) and reviewer rejection (full reset).
 * unifiedFlowService and userService are mocked.
 *
 * Scenarios covered:
 *  1.  APPROVER rejection — shows preserved (locked) reviewer chips
 *  2.  APPROVER rejection — approver rows are editable
 *  3.  APPROVER rejection — builds assignments with preserved reviewers + new approvers
 *  4.  REVIEWER rejection — does NOT show locked reviewer section
 *  5.  REVIEWER rejection — only approver assignments sent (full reset)
 *  6.  Shows rejection reason banner with commenter's email
 *  7.  Shows validation error when submitted with no approver email
 *  8.  Calls onSubmitted after successful resubmission
 *  9.  Shows backend error when submitFlow returns ok: false
 */

import React from 'react';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import UnifiedFlowResubmitDialog from '@/components/unified-flow/UnifiedFlowResubmitDialog';
import type { WorkflowParticipant } from '@/types/unifiedFlow';

const mockSubmitFlow = jest.fn();
const mockGetAllUsers = jest.fn();

jest.mock('@/services/unifiedFlowService', () => ({
    unifiedFlowService: {
        submitFlow: (...args: any[]) => mockSubmitFlow(...args),
    },
}));

jest.mock('@/services/userService', () => ({
    userService: { getAllUsers: (...args: any[]) => mockGetAllUsers(...args) },
    User: {},
}));

jest.mock('@/services/authService', () => ({
    authService: {
        getCurrentUser: jest.fn().mockReturnValue({ email: 'owner@company.com' }),
    },
}));

const REVIEWER_PARTICIPANT: WorkflowParticipant = {
    email: 'reviewer@co.com',
    role: 'REVIEWER',
    order: 1,
    status: 'completed',
};

const APPROVER_REJECTED: WorkflowParticipant = {
    email: 'approver@co.com',
    role: 'APPROVER',
    order: 2,
    status: 'rejected',
    comments: 'Needs legal review first.',
};

const REVIEWER_REJECTED: WorkflowParticipant = {
    email: 'reviewer@co.com',
    role: 'REVIEWER',
    order: 1,
    status: 'rejected',
    comments: 'Scope is not clear.',
};

function renderDialog(participants: WorkflowParticipant[], overrides: any = {}) {
    const props = {
        open: true,
        onClose: jest.fn(),
        onSubmitted: jest.fn(),
        contractId: 'c-rsb',
        contractTitle: 'Resub Contract',
        participants,
        ...overrides,
    };
    render(<UnifiedFlowResubmitDialog {...props} />);
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

test('1. APPROVER rejection — shows preserved reviewer section header', async () => {
    renderDialog([REVIEWER_PARTICIPANT, APPROVER_REJECTED]);
    await waitFor(() => {
        expect(screen.getByText('Reviewers (preserved — locked)')).toBeInTheDocument();
    });
    expect(screen.getByText('reviewer@co.com')).toBeInTheDocument();
});

test('2. APPROVER rejection — approver autocomplete input is present', async () => {
    renderDialog([REVIEWER_PARTICIPANT, APPROVER_REJECTED]);
    await waitFor(() => {
        expect(screen.getByPlaceholderText(/search approver/i)).toBeInTheDocument();
    });
});

test('3. APPROVER rejection — sends preserved reviewers + new approvers', async () => {
    renderDialog([REVIEWER_PARTICIPANT, APPROVER_REJECTED]);
    await waitFor(() => screen.getByPlaceholderText(/search approver/i));

    const input = screen.getByPlaceholderText(/search approver/i);
    fireEvent.change(input, { target: { value: 'bob@co.com' } });

    await userEvent.click(screen.getByRole('button', { name: /resubmit/i }));
    await waitFor(() => {
        expect(mockSubmitFlow).toHaveBeenCalledWith(
            'c-rsb',
            expect.arrayContaining([
                expect.objectContaining({ email: 'reviewer@co.com', role: 'REVIEWER' }),
                expect.objectContaining({ email: 'bob@co.com', role: 'APPROVER' }),
            ]),
            false,
        );
    });
});

test('4. REVIEWER rejection — does not show locked reviewer section', async () => {
    renderDialog([REVIEWER_REJECTED]);
    // Wait for the approver section header (exact "Approvers" label in reviewer-rejection mode)
    await waitFor(() => screen.getByText('Approvers'));
    expect(screen.queryByText('Reviewers (preserved — locked)')).not.toBeInTheDocument();
});

test('5. REVIEWER rejection — sends only approver assignments (full reset)', async () => {
    renderDialog([REVIEWER_REJECTED]);
    await waitFor(() => screen.getByPlaceholderText(/search approver/i));

    const input = screen.getByPlaceholderText(/search approver/i);
    fireEvent.change(input, { target: { value: 'alice@co.com' } });

    await userEvent.click(screen.getByRole('button', { name: /resubmit/i }));
    await waitFor(() => {
        const callArgs = mockSubmitFlow.mock.calls[0][1] as any[];
        expect(callArgs.every((a: any) => a.role === 'APPROVER')).toBe(true);
        expect(callArgs.some((a: any) => a.role === 'REVIEWER')).toBe(false);
    });
});

test('6. shows rejection reason banner with rejector email', async () => {
    renderDialog([REVIEWER_PARTICIPANT, APPROVER_REJECTED]);
    await waitFor(() => {
        expect(screen.getByText(/approver@co.com/i)).toBeInTheDocument();
        expect(screen.getByText(/needs legal review first/i)).toBeInTheDocument();
    });
});

test('7. shows validation error when submitted with no approver email', async () => {
    renderDialog([REVIEWER_REJECTED]);
    await waitFor(() => screen.getByRole('button', { name: /resubmit/i }));
    await userEvent.click(screen.getByRole('button', { name: /resubmit/i }));
    await waitFor(() => {
        expect(screen.getByText(/email/i)).toBeInTheDocument();
    });
    expect(mockSubmitFlow).not.toHaveBeenCalled();
});

test('8. calls onSubmitted after successful resubmission', async () => {
    const props = renderDialog([REVIEWER_REJECTED]);
    await waitFor(() => screen.getByPlaceholderText(/search approver/i));

    fireEvent.change(screen.getByPlaceholderText(/search approver/i), { target: { value: 'alice@co.com' } });
    await userEvent.click(screen.getByRole('button', { name: /resubmit/i }));
    await waitFor(() => {
        expect(props.onSubmitted).toHaveBeenCalledTimes(1);
    });
});

test('9. shows backend error when submitFlow returns ok: false', async () => {
    mockSubmitFlow.mockResolvedValue({ ok: false, message: 'Flow already active.' });
    renderDialog([REVIEWER_REJECTED]);
    await waitFor(() => screen.getByPlaceholderText(/search approver/i));

    fireEvent.change(screen.getByPlaceholderText(/search approver/i), { target: { value: 'alice@co.com' } });
    await userEvent.click(screen.getByRole('button', { name: /resubmit/i }));
    await waitFor(() => {
        expect(screen.getByText(/flow already active/i)).toBeInTheDocument();
    });
});
