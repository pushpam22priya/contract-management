/**
 * INTEGRATION TESTS — UnifiedFlowResubmitDialog
 * (src/components/unified-flow/UnifiedFlowResubmitDialog.tsx)
 *
 * Two modes driven by which participant was rejected:
 *   Case B (approver rejected): reviewers preserved & locked; only new approver(s) needed.
 *   Case A (reviewer rejected): full reset; new reviewers and approvers both required.
 *
 * The component fetches participants itself via getFlowStatus — there is no participants prop.
 * unifiedFlowService (getFlowStatus + submitFlow) and userService are mocked.
 *
 * Scenarios covered:
 *  1.  APPROVER rejection — shows preserved (locked) reviewer section
 *  2.  APPROVER rejection — approver input row is editable
 *  3.  APPROVER rejection — submitFlow called with only new approver assignments
 *       (backend preserves completed reviewers; frontend does NOT re-send them)
 *  4.  REVIEWER rejection — does NOT show locked reviewer section (full reset)
 *  5.  REVIEWER rejection — full reset sends new reviewer AND approver assignments
 *  6.  Shows rejection reason banner with rejector info and comment
 *  7.  Shows validation error when submitted with an empty approver email
 *  8.  Calls onSubmitted after successful resubmission
 *  9.  Shows backend error when submitFlow returns ok: false
 * 10.  External signing section visible when resubmitting with externalSigningIncluded=true
 */

import React from 'react';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import UnifiedFlowResubmitDialog from '@/components/unified-flow/UnifiedFlowResubmitDialog';
import type { WorkflowParticipant } from '@/types/unifiedFlow';

const mockSubmitFlow = jest.fn();
const mockGetFlowStatus = jest.fn();
const mockGetAllUsers = jest.fn();

jest.mock('@/services/unifiedFlowService', () => ({
    unifiedFlowService: {
        getFlowStatus: (...args: any[]) => mockGetFlowStatus(...args),
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

// ─── Participant fixtures ─────────────────────────────────────────────────────

const REVIEWER_COMPLETED: WorkflowParticipant = {
    email: 'reviewer@co.com',
    name: 'Reviewer',
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
    name: 'Reviewer',
    role: 'REVIEWER',
    order: 1,
    status: 'rejected',
    comments: 'Scope is not clear.',
};

// ─── Helper: build a getFlowStatus response ───────────────────────────────────

function flowStatus(participants: WorkflowParticipant[], extIncluded = false) {
    return {
        ok: true,
        data: {
            participants,
            externalSigningIncluded: extIncluded,
            parties: [],
            externalSigners: extIncluded
                ? [{ email: 'client@ext.com', name: 'Client', order: 1 }]
                : [],
        },
    };
}

// ─── Render helper ────────────────────────────────────────────────────────────

function renderDialog(participants: WorkflowParticipant[], extIncluded = false, overrides: any = {}) {
    mockGetFlowStatus.mockResolvedValueOnce(flowStatus(participants, extIncluded));
    const props = {
        open: true,
        onClose: jest.fn(),
        onSubmitted: jest.fn(),
        contractId: 'c-rsb',
        contractTitle: 'Resub Contract',
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

// ─── Tests ───────────────────────────────────────────────────────────────────

test('1. APPROVER rejection — shows preserved reviewer section header', async () => {
    renderDialog([REVIEWER_COMPLETED, APPROVER_REJECTED]);
    await waitFor(() => {
        expect(screen.getByText('Reviewers (preserved — locked)')).toBeInTheDocument();
    });
    expect(screen.getByText('reviewer@co.com')).toBeInTheDocument();
});

test('2. APPROVER rejection — approver input row is editable', async () => {
    renderDialog([REVIEWER_COMPLETED, APPROVER_REJECTED]);
    // In approver-rejection mode only one "Search user…" input is shown (the new approver row)
    await waitFor(() => {
        expect(screen.getByPlaceholderText(/search user/i)).toBeInTheDocument();
    });
});

test('3. APPROVER rejection — submitFlow called with only new approver (backend preserves reviewers)', async () => {
    renderDialog([REVIEWER_COMPLETED, APPROVER_REJECTED]);
    await waitFor(() => screen.getByPlaceholderText(/search user/i));

    fireEvent.change(screen.getByPlaceholderText(/search user/i), { target: { value: 'bob@co.com' } });

    await userEvent.click(screen.getByRole('button', { name: /resubmit/i }));
    await waitFor(() => {
        const assignments = mockSubmitFlow.mock.calls[0][1] as any[];
        // Only the new approver — frontend does NOT re-send preserved reviewers
        expect(assignments.every((a: any) => a.role === 'APPROVER')).toBe(true);
        expect(assignments.some((a: any) => a.email === 'bob@co.com')).toBe(true);
    });
});

test('4. REVIEWER rejection — does not show locked reviewer section (full reset)', async () => {
    renderDialog([REVIEWER_REJECTED]);
    await waitFor(() => screen.getByText('Approvers'));
    expect(screen.queryByText('Reviewers (preserved — locked)')).not.toBeInTheDocument();
});

test('5. REVIEWER rejection — full reset sends new reviewer and approver assignments', async () => {
    renderDialog([REVIEWER_REJECTED]);
    // Two "Search user…" inputs shown (one for reviewer, one for approver)
    await waitFor(() => {
        expect(screen.getAllByPlaceholderText(/search user/i)).toHaveLength(2);
    });

    const inputs = screen.getAllByPlaceholderText(/search user/i);
    fireEvent.change(inputs[0], { target: { value: 'alice@co.com' } }); // reviewer
    fireEvent.change(inputs[1], { target: { value: 'bob@co.com' } });   // approver

    await userEvent.click(screen.getByRole('button', { name: /resubmit/i }));
    await waitFor(() => {
        expect(mockSubmitFlow).toHaveBeenCalled();
        const assignments = mockSubmitFlow.mock.calls[0][1] as any[];
        expect(assignments.some((a: any) => a.email === 'alice@co.com' && a.role === 'REVIEWER')).toBe(true);
        expect(assignments.some((a: any) => a.email === 'bob@co.com'   && a.role === 'APPROVER')).toBe(true);
    });
});

test('6. shows rejection reason banner with rejector email and comment', async () => {
    renderDialog([REVIEWER_COMPLETED, APPROVER_REJECTED]);
    await waitFor(() => {
        expect(screen.getByText(/approver@co.com/i)).toBeInTheDocument();
        expect(screen.getByText(/needs legal review first/i)).toBeInTheDocument();
    });
});

test('7. shows validation error when submitted with an empty approver email', async () => {
    renderDialog([REVIEWER_REJECTED]);
    await waitFor(() => screen.getByRole('button', { name: /resubmit/i }));
    // Click without filling any inputs
    await userEvent.click(screen.getByRole('button', { name: /resubmit/i }));
    await waitFor(() => {
        expect(screen.getByText(/email/i)).toBeInTheDocument();
    });
    expect(mockSubmitFlow).not.toHaveBeenCalled();
});

test('8. calls onSubmitted after successful resubmission', async () => {
    const props = renderDialog([REVIEWER_REJECTED]);
    await waitFor(() => screen.getAllByPlaceholderText(/search user/i));

    const inputs = screen.getAllByPlaceholderText(/search user/i);
    fireEvent.change(inputs[0], { target: { value: 'alice@co.com' } });
    fireEvent.change(inputs[1], { target: { value: 'bob@co.com' } });

    await userEvent.click(screen.getByRole('button', { name: /resubmit/i }));
    await waitFor(() => {
        expect(props.onSubmitted).toHaveBeenCalledTimes(1);
    });
});

test('9. shows backend error when submitFlow returns ok: false', async () => {
    mockSubmitFlow.mockResolvedValue({ ok: false, message: 'Flow already active.' });
    renderDialog([REVIEWER_REJECTED]);
    await waitFor(() => screen.getAllByPlaceholderText(/search user/i));

    const inputs = screen.getAllByPlaceholderText(/search user/i);
    fireEvent.change(inputs[0], { target: { value: 'alice@co.com' } });
    fireEvent.change(inputs[1], { target: { value: 'bob@co.com' } });
    await userEvent.click(screen.getByRole('button', { name: /resubmit/i }));
    await waitFor(() => {
        expect(screen.getByText(/flow already active/i)).toBeInTheDocument();
    });
});

test('10. external signing section shown when resubmitting with externalSigningIncluded=true', async () => {
    renderDialog([REVIEWER_REJECTED], true);
    await waitFor(() => {
        expect(screen.getByText('External Client Signers')).toBeInTheDocument();
    });
});
