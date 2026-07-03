/**
 * INTEGRATION TESTS — UnifiedFlowRejectDialog
 * (src/components/unified-flow/UnifiedFlowRejectDialog.tsx)
 *
 * Renders the real component; only unifiedFlowService is mocked.
 *
 * Scenarios covered:
 *  1.  Renders with correct title for REVIEWER role
 *  2.  Renders with correct title for APPROVER role
 *  3.  Submit button is disabled when textarea is empty
 *  4.  Submit button is disabled when fewer than 10 characters entered
 *  5.  Submit button enables once ≥10 characters are entered
 *  6.  Shows character count as user types
 *  7.  Calls rejectFlow with contractId + comment on submit
 *  8.  Calls onRejected callback after successful rejection
 *  9.  Shows error message when rejectFlow returns ok: false
 * 10.  Does not call onRejected when rejection fails
 */

import React from 'react';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import UnifiedFlowRejectDialog from '@/components/unified-flow/UnifiedFlowRejectDialog';

const mockRejectFlow = jest.fn();

jest.mock('@/services/unifiedFlowService', () => ({
    unifiedFlowService: {
        rejectFlow: (...args: any[]) => mockRejectFlow(...args),
    },
}));

function renderDialog(role: 'REVIEWER' | 'APPROVER' = 'REVIEWER', overrides: any = {}) {
    const props = {
        open: true,
        onClose: jest.fn(),
        onRejected: jest.fn(),
        contractId: 'contract-abc',
        contractTitle: 'Test Contract',
        role,
        ...overrides,
    };
    render(<UnifiedFlowRejectDialog {...props} />);
    return props;
}

beforeEach(() => {
    jest.clearAllMocks();
    mockRejectFlow.mockResolvedValue({ ok: true });
});

test('1. shows REVIEWER in dialog title for REVIEWER role', () => {
    renderDialog('REVIEWER');
    expect(screen.getByText(/reject contract \(reviewer\)/i)).toBeInTheDocument();
});

test('2. shows APPROVER in dialog title for APPROVER role', () => {
    renderDialog('APPROVER');
    expect(screen.getByText(/reject contract \(approver\)/i)).toBeInTheDocument();
});

test('3. Reject Contract button is disabled when textarea is empty', () => {
    renderDialog();
    const submitBtn = screen.getByRole('button', { name: /reject contract/i });
    expect(submitBtn).toBeDisabled();
});

test('4. Reject Contract button disabled with fewer than 10 characters', async () => {
    renderDialog();
    const textarea = screen.getByRole('textbox');
    fireEvent.change(textarea, { target: { value: 'short' } });
    expect(screen.getByRole('button', { name: /reject contract/i })).toBeDisabled();
});

test('5. Reject Contract button enables once ≥10 characters entered', async () => {
    renderDialog();
    const textarea = screen.getByRole('textbox');
    fireEvent.change(textarea, { target: { value: 'This is a valid rejection reason.' } });
    expect(screen.getByRole('button', { name: /reject contract/i })).not.toBeDisabled();
});

test('6. shows character count as user types', async () => {
    renderDialog();
    const textarea = screen.getByRole('textbox');
    fireEvent.change(textarea, { target: { value: 'Hello world' } });
    // Component renders "{reason.length} / 1000"
    expect(screen.getByText('11 / 1000')).toBeInTheDocument();
});

test('7. calls rejectFlow with contractId and trimmed comment on submit', async () => {
    renderDialog();
    const textarea = screen.getByRole('textbox');
    fireEvent.change(textarea, { target: { value: 'This needs major rework.' } });
    await userEvent.click(screen.getByRole('button', { name: /reject contract/i }));
    await waitFor(() => {
        expect(mockRejectFlow).toHaveBeenCalledWith('contract-abc', 'This needs major rework.');
    });
});

test('8. calls onRejected after successful rejection', async () => {
    const props = renderDialog();
    const textarea = screen.getByRole('textbox');
    fireEvent.change(textarea, { target: { value: 'Needs significant changes here.' } });
    await userEvent.click(screen.getByRole('button', { name: /reject contract/i }));
    await waitFor(() => {
        expect(props.onRejected).toHaveBeenCalledTimes(1);
    });
});

test('9. shows error message when rejectFlow returns ok: false', async () => {
    mockRejectFlow.mockResolvedValue({ ok: false, message: 'Server error occurred.' });
    renderDialog();
    const textarea = screen.getByRole('textbox');
    fireEvent.change(textarea, { target: { value: 'This is a rejection comment.' } });
    await userEvent.click(screen.getByRole('button', { name: /reject contract/i }));
    await waitFor(() => {
        expect(screen.getByText(/server error occurred/i)).toBeInTheDocument();
    });
});

test('10. does not call onRejected when rejection fails', async () => {
    mockRejectFlow.mockResolvedValue({ ok: false, message: 'Server error occurred.' });
    const props = renderDialog();
    const textarea = screen.getByRole('textbox');
    fireEvent.change(textarea, { target: { value: 'This is a rejection comment.' } });
    await userEvent.click(screen.getByRole('button', { name: /reject contract/i }));
    await waitFor(() => {
        expect(mockRejectFlow).toHaveBeenCalled();
    });
    expect(props.onRejected).not.toHaveBeenCalled();
});
