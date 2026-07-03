/**
 * INTEGRATION TESTS — UnifiedFlowInboxCard
 * (src/components/unified-flow/UnifiedFlowInboxCard.tsx)
 *
 * Renders the real card; authService and unifiedFlowService are mocked.
 *
 * Scenarios covered:
 *  1.  Shows "Unified" badge
 *  2.  Shows Reviewer in role chip for reviewer participant
 *  3.  Shows Approver in role chip for approver participant
 *  4.  Shows "Your Turn" status when participant is unlocked
 *  5.  Shows sender info (sentBy) when present on participant
 *  6.  "Open & Review" button shown when reviewer status is unlocked
 *  7.  "Open & Sign" button shown when approver status is unlocked
 *  8.  No open button rendered when status is completed
 *  9.  Calls onOpen with contractId and role when open button clicked
 * 10.  Reject dialog opens and calls onReloaded after successful rejection
 */

import React from 'react';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import UnifiedFlowInboxCard from '@/components/unified-flow/UnifiedFlowInboxCard';
import type { Contract } from '@/types/contract';
import type { WorkflowParticipant } from '@/types/unifiedFlow';

const mockRejectFlow = jest.fn();

jest.mock('@/services/unifiedFlowService', () => ({
    unifiedFlowService: {
        rejectFlow: (...args: any[]) => mockRejectFlow(...args),
    },
}));

jest.mock('@/services/authService', () => ({
    authService: {
        getCurrentUser: jest.fn().mockReturnValue({ email: 'reviewer@co.com' }),
    },
}));

const REVIEWER_UNLOCKED: WorkflowParticipant = {
    email: 'reviewer@co.com',
    role: 'REVIEWER',
    order: 1,
    status: 'unlocked',
    sentBy: 'owner@co.com',
    sentAt: new Date().toISOString(),
};

const APPROVER_UNLOCKED: WorkflowParticipant = {
    email: 'reviewer@co.com',
    role: 'APPROVER',
    order: 2,
    status: 'unlocked',
};

const REVIEWER_COMPLETED: WorkflowParticipant = {
    ...REVIEWER_UNLOCKED,
    status: 'completed',
};

function makeContract(participant: WorkflowParticipant): Contract {
    return {
        id: 'c-inbox-1',
        title: 'Demo Contract',
        status: 'IN_REVIEW' as any,
        participants: [participant],
        createdAt: new Date().toISOString(),
        createdBy: 'owner@co.com',
        client: 'Acme Corp',
    } as any;
}

function renderCard(participant: WorkflowParticipant = REVIEWER_UNLOCKED) {
    const props = {
        contract: makeContract(participant),
        onOpen: jest.fn(),
        onComplete: jest.fn(),
        onReloaded: jest.fn(),
    };
    const result = render(<UnifiedFlowInboxCard {...props} />);
    return { ...props, ...result };
}

beforeEach(() => {
    jest.clearAllMocks();
    mockRejectFlow.mockResolvedValue({ ok: true });
});

test('1. shows "Unified" badge', () => {
    renderCard();
    expect(screen.getByText('Unified')).toBeInTheDocument();
});

test('2. shows Reviewer in role chip', () => {
    renderCard(REVIEWER_UNLOCKED);
    expect(screen.getByText(/reviewer/i)).toBeInTheDocument();
});

test('3. shows Approver in role chip', () => {
    renderCard(APPROVER_UNLOCKED);
    expect(screen.getByText(/approver/i)).toBeInTheDocument();
});

test('4. shows "Your Turn" status when participant is unlocked', () => {
    renderCard(REVIEWER_UNLOCKED);
    expect(screen.getByText('Your Turn')).toBeInTheDocument();
});

test('5. shows sender info when sentBy is present', () => {
    renderCard(REVIEWER_UNLOCKED);
    expect(screen.getByText(/owner@co.com/i)).toBeInTheDocument();
});

test('6. "Open & Review" button shown for reviewer when unlocked', () => {
    renderCard(REVIEWER_UNLOCKED);
    expect(screen.getByRole('button', { name: /open & review/i })).toBeInTheDocument();
});

test('7. "Open & Sign" button shown for approver when unlocked', () => {
    renderCard(APPROVER_UNLOCKED);
    expect(screen.getByRole('button', { name: /open & sign/i })).toBeInTheDocument();
});

test('8. no open button when status is completed', () => {
    renderCard(REVIEWER_COMPLETED);
    expect(screen.queryByRole('button', { name: /open &/i })).not.toBeInTheDocument();
});

test('9. calls onOpen with contractId and REVIEWER role when button clicked', async () => {
    const props = renderCard(REVIEWER_UNLOCKED);
    await userEvent.click(screen.getByRole('button', { name: /open & review/i }));
    expect(props.onOpen).toHaveBeenCalledWith('c-inbox-1', 'REVIEWER');
});

test('10. reject dialog opens via MoreVert and onReloaded called after rejection', async () => {
    const props = renderCard(REVIEWER_UNLOCKED);

    // Open the MoreVert popover — the MoreVert SVG has data-testid="MoreVertIcon"
    const moreVertIcon = props.container.querySelector('[data-testid="MoreVertIcon"]');
    expect(moreVertIcon).not.toBeNull();
    const moreBtn = moreVertIcon!.closest('button')!;
    await userEvent.click(moreBtn);

    // In the popover, the reject button wraps a Cancel icon (data-testid="CancelIcon")
    const cancelIcon = await screen.findByTestId('CancelIcon');
    const rejectBtn = cancelIcon.closest('button')!;
    await userEvent.click(rejectBtn);

    // Reject dialog textarea should appear
    const textarea = await screen.findByRole('textbox');
    fireEvent.change(textarea, { target: { value: 'This contract has serious issues that need addressing.' } });
    await userEvent.click(screen.getByRole('button', { name: /reject contract/i }));

    await waitFor(() => {
        expect(mockRejectFlow).toHaveBeenCalledWith('c-inbox-1', expect.any(String));
        expect(props.onReloaded).toHaveBeenCalledTimes(1);
    });
});
