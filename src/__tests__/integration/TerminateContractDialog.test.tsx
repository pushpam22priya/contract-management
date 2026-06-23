/**
 * INTEGRATION TESTS — TerminateContractDialog
 * (src/components/contracts/TerminateContractDialog.tsx)
 *
 * Renders the real component (including BaseDialog and AppButton) with
 * httpClient mocked at the module boundary.
 *
 * Scenarios covered:
 *
 * Rendering
 *  1.  Renders "Terminate Contract" as the dialog title
 *  2.  Renders the contract title in the body text
 *  3.  Renders the "This action cannot be undone." warning
 *  4.  Renders Cancel and Terminate action buttons
 *  5.  No error alert visible on initial render
 *
 * Successful termination
 *  6.  Calls POST /contracts/{id}/terminate with null body on confirm
 *  7.  Calls onSuccess after a 200 success response
 *  8.  Closes the dialog (calls onClose) after success
 *  9.  Treats alreadyTerminated: true as success — still calls onSuccess
 *
 * Error handling
 * 10.  400 wrong-status response — shows the backend error message
 * 11.  409 renewal-in-progress response — shows the backend error message
 * 12.  404 not-found response — shows "Contract not found"
 * 13.  Network failure (status 0) — shows the network error message
 * 14.  Empty message on failure — falls back to generic error text
 * 15.  Error is cleared when the user retries after a previous failure
 *
 * Loading state
 * 16.  Terminate button text changes to "Terminating…" while in-flight
 * 17.  Terminate button is disabled while in-flight
 * 18.  Cancel button is disabled while in-flight
 *
 * Cancel / close behaviour
 * 19.  Clicking Cancel calls onClose without hitting the API
 * 20.  Clicking the × close icon calls onClose without hitting the API
 * 21.  Error is cleared when Cancel is clicked after a failure
 */

import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

// ─── httpClient mock ──────────────────────────────────────────────────────────
// Define BEFORE import so jest.mock hoisting works correctly.

const mockPost = jest.fn();

jest.mock('@/lib/httpClient', () => ({
    httpClient: {
        post: (...args: any[]) => mockPost(...args),
    },
}));

// ─── MUI mock ────────────────────────────────────────────────────────────────
// TerminateContractDialog uses useTheme for isDark.
// BaseDialog (rendered inside) also uses useTheme + useMediaQuery.
// Spread jest.requireActual so all MUI components (Box, Typography, Alert,
// Dialog, etc.) remain real; only the two hooks are swapped.

jest.mock('@mui/material', () => {
    const actual = jest.requireActual('@mui/material');
    return {
        ...actual,
        useTheme: () => ({
            palette: { mode: 'light' },
            breakpoints: { down: () => '(max-width:599.95px)' },
        }),
        useMediaQuery: () => false, // always desktop — disables BaseDialog full-screen
    };
});

// ─── Component under test ─────────────────────────────────────────────────────

import TerminateContractDialog from '@/components/contracts/TerminateContractDialog';

// ─── Fixtures ─────────────────────────────────────────────────────────────────

const CONTRACT_ID    = 'contract_abc123';
const CONTRACT_TITLE = 'Master Services Agreement';

function okResponse(alreadyTerminated = false) {
    return {
        ok: true,
        data: { success: true, alreadyTerminated },
        status: 200,
        message: 'Success',
    };
}

function errResponse(status: number, message: string) {
    return { ok: false, data: null, status, message };
}

// ─── Helper ───────────────────────────────────────────────────────────────────

function renderDialog(overrides: { onClose?: jest.Mock; onSuccess?: jest.Mock } = {}) {
    const onClose   = overrides.onClose   ?? jest.fn();
    const onSuccess = overrides.onSuccess ?? jest.fn();
    render(
        <TerminateContractDialog
            open
            contractId={CONTRACT_ID}
            contractTitle={CONTRACT_TITLE}
            onClose={onClose}
            onSuccess={onSuccess}
        />
    );
    return { onClose, onSuccess };
}

// Selectors used across multiple tests
const getTerminateButton = () => screen.getByRole('button', { name: /^terminate$/i });
const getCancelButton    = () => screen.getByRole('button', { name: /cancel/i });
const getCloseIcon       = () => screen.getByRole('button', { name: /close/i });

// Returns a deferred promise that the caller can resolve/reject at will.
function deferPost() {
    let resolve!: (v: any) => void;
    const promise = new Promise(r => { resolve = r; });
    mockPost.mockReturnValueOnce(promise);
    return { resolve };
}

// ─────────────────────────────────────────────────────────────────────────────

beforeEach(() => jest.clearAllMocks());

// =============================================================================
// 1–5. Rendering
// =============================================================================

describe('TerminateContractDialog — rendering', () => {

    it('renders "Terminate Contract" as the dialog title', () => {
        renderDialog();
        expect(screen.getByText('Terminate Contract')).toBeInTheDocument();
    });

    it('renders the contract title in the body text', () => {
        renderDialog();
        expect(screen.getByText(`"${CONTRACT_TITLE}"`)).toBeInTheDocument();
    });

    it('renders the "This action cannot be undone." warning', () => {
        renderDialog();
        expect(screen.getByText(/this action cannot be undone/i)).toBeInTheDocument();
    });

    it('renders both Cancel and Terminate action buttons', () => {
        renderDialog();
        expect(getCancelButton()).toBeInTheDocument();
        expect(getTerminateButton()).toBeInTheDocument();
    });

    it('shows no error alert on initial render', () => {
        renderDialog();
        expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    });
});

// =============================================================================
// 6–9. Successful termination
// =============================================================================

describe('TerminateContractDialog — successful termination', () => {

    it('calls POST /contracts/{id}/terminate with null body', async () => {
        mockPost.mockResolvedValueOnce(okResponse());
        const user = userEvent.setup();
        renderDialog();

        await user.click(getTerminateButton());

        expect(mockPost).toHaveBeenCalledWith(`/contracts/${CONTRACT_ID}/terminate`, null);
    });

    it('calls onSuccess after a 200 success response', async () => {
        mockPost.mockResolvedValueOnce(okResponse());
        const user = userEvent.setup();
        const { onSuccess } = renderDialog();

        await user.click(getTerminateButton());

        await waitFor(() => expect(onSuccess).toHaveBeenCalledTimes(1));
    });

    it('calls onClose (closes the dialog) after success', async () => {
        mockPost.mockResolvedValueOnce(okResponse());
        const user = userEvent.setup();
        const { onClose } = renderDialog();

        await user.click(getTerminateButton());

        await waitFor(() => expect(onClose).toHaveBeenCalledTimes(1));
    });

    it('treats alreadyTerminated: true as success — calls onSuccess', async () => {
        mockPost.mockResolvedValueOnce(okResponse(true));
        const user = userEvent.setup();
        const { onSuccess } = renderDialog();

        await user.click(getTerminateButton());

        await waitFor(() => expect(onSuccess).toHaveBeenCalledTimes(1));
    });
});

// =============================================================================
// 10–15. Error handling
// =============================================================================

describe('TerminateContractDialog — error handling', () => {

    it('shows the backend error message on a 400 wrong-status response', async () => {
        const msg = 'Cannot terminate a contract with status "ACTIVE". Only expired contracts can be terminated.';
        mockPost.mockResolvedValueOnce(errResponse(400, msg));
        const user = userEvent.setup();
        renderDialog();

        await user.click(getTerminateButton());

        await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent(msg));
    });

    it('shows the backend error message on a 409 renewal-in-progress response', async () => {
        const msg = 'Cannot terminate a contract that has an active renewal in progress. Cancel or complete the renewal first.';
        mockPost.mockResolvedValueOnce(errResponse(409, msg));
        const user = userEvent.setup();
        renderDialog();

        await user.click(getTerminateButton());

        await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent(msg));
    });

    it('shows "Contract not found" on a 404 response', async () => {
        mockPost.mockResolvedValueOnce(errResponse(404, 'Contract not found'));
        const user = userEvent.setup();
        renderDialog();

        await user.click(getTerminateButton());

        await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent('Contract not found'));
    });

    it('shows the network error message on a status-0 failure', async () => {
        const msg = 'Network error. Please check your connection.';
        mockPost.mockResolvedValueOnce(errResponse(0, msg));
        const user = userEvent.setup();
        renderDialog();

        await user.click(getTerminateButton());

        await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent(msg));
    });

    it('falls back to a generic message when response.message is empty', async () => {
        mockPost.mockResolvedValueOnce(errResponse(500, ''));
        const user = userEvent.setup();
        renderDialog();

        await user.click(getTerminateButton());

        await waitFor(() =>
            expect(screen.getByRole('alert')).toHaveTextContent('Failed to terminate contract. Please try again.')
        );
    });

    it('clears the error when the user retries after a failure', async () => {
        mockPost
            .mockResolvedValueOnce(errResponse(400, 'Cannot terminate: wrong status.'))
            .mockResolvedValueOnce(okResponse());

        const user = userEvent.setup();
        const { onSuccess } = renderDialog();

        // First attempt — error is shown
        await user.click(getTerminateButton());
        await waitFor(() => expect(screen.getByRole('alert')).toBeInTheDocument());

        // Second attempt — error clears, success callback fires
        await user.click(getTerminateButton());
        await waitFor(() => expect(onSuccess).toHaveBeenCalledTimes(1));
        expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    });
});

// =============================================================================
// 16–18. Loading state
// =============================================================================

describe('TerminateContractDialog — loading state', () => {

    it('changes Terminate button text to "Terminating…" while in-flight', async () => {
        const { resolve } = deferPost();
        const user = userEvent.setup();
        renderDialog();

        await user.click(getTerminateButton());

        // Button text has changed — original "Terminate" button is gone
        expect(screen.queryByRole('button', { name: /^terminate$/i })).not.toBeInTheDocument();
        expect(screen.getByRole('button', { name: /terminating/i })).toBeInTheDocument();

        resolve(okResponse());
        await waitFor(() =>
            expect(screen.queryByRole('button', { name: /terminating/i })).not.toBeInTheDocument()
        );
    });

    it('disables the Terminate button while in-flight', async () => {
        const { resolve } = deferPost();
        const user = userEvent.setup();
        renderDialog();

        await user.click(getTerminateButton());

        expect(screen.getByRole('button', { name: /terminating/i })).toBeDisabled();

        resolve(okResponse());
        await waitFor(() =>
            expect(screen.queryByRole('button', { name: /terminating/i })).not.toBeInTheDocument()
        );
    });

    it('disables the Cancel button while in-flight', async () => {
        const { resolve } = deferPost();
        const user = userEvent.setup();
        renderDialog();

        await user.click(getTerminateButton());

        expect(getCancelButton()).toBeDisabled();

        resolve(okResponse());
        await waitFor(() =>
            expect(screen.queryByRole('button', { name: /terminating/i })).not.toBeInTheDocument()
        );
    });
});

// =============================================================================
// 19–21. Cancel / close behaviour
// =============================================================================

describe('TerminateContractDialog — cancel / close behaviour', () => {

    it('clicking Cancel calls onClose without hitting the API', async () => {
        const user = userEvent.setup();
        const { onClose } = renderDialog();

        await user.click(getCancelButton());

        expect(onClose).toHaveBeenCalledTimes(1);
        expect(mockPost).not.toHaveBeenCalled();
    });

    it('clicking the × close icon calls onClose without hitting the API', async () => {
        const user = userEvent.setup();
        const { onClose } = renderDialog();

        await user.click(getCloseIcon());

        expect(onClose).toHaveBeenCalledTimes(1);
        expect(mockPost).not.toHaveBeenCalled();
    });

    it('clears the error when Cancel is clicked after a failure', async () => {
        mockPost.mockResolvedValueOnce(errResponse(409, 'Renewal in progress.'));
        const user = userEvent.setup();
        const { onClose } = renderDialog();

        // Trigger an error first
        await user.click(getTerminateButton());
        await waitFor(() => expect(screen.getByRole('alert')).toBeInTheDocument());

        // Cancel — handleClose clears error state then calls onClose
        await user.click(getCancelButton());

        expect(onClose).toHaveBeenCalledTimes(1);
        // onClose is a jest.fn so dialog stays mounted — error should be gone
        expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    });
});
