/**
 * INTEGRATION TESTS — CreateTeamDialog
 * (src/components/teams/CreateTeamDialog.tsx)
 *
 * httpClient is mocked so no network I/O occurs.
 * useTheme and useMediaQuery are mocked because BaseDialog requires them.
 *
 * Scenarios covered:
 *
 * Rendering
 *  1.  Renders dialog with title "Create Team"
 *  2.  Renders the Team Name text field
 *  3.  Shows character remaining helper text
 *
 * Button state
 *  4.  "Create Team" button is disabled when name is empty
 *  5.  "Create Team" button is disabled when name is whitespace-only
 *  6.  "Create Team" button is enabled when a valid name is typed
 *
 * Successful creation
 *  7.  Calls httpClient.post with /teams and the trimmed name on submit
 *  8.  Calls onCreated with the returned team on success
 *  9.  Calls onClose after successful creation
 * 10.  Form name is reset to empty after successful creation
 *
 * Error handling
 * 11.  Displays API error message when the request fails
 * 12.  Falls back to "Failed to create team" when response.message is empty
 * 13.  Clears previous error message when the user starts typing again
 *
 * Loading state
 * 14.  Shows "Creating…" button label while request is in-flight
 * 15.  Disables the submit button while request is in-flight
 *
 * Cancel
 * 16.  Cancel button calls onClose
 * 17.  Does NOT call httpClient.post when Cancel is clicked
 */

// ─── Mocks (must precede imports) ────────────────────────────────────────────

const mockPost = jest.fn();
jest.mock('@/lib/httpClient', () => ({
    httpClient: { post: (...args: any[]) => mockPost(...args) },
}));

jest.mock('@mui/material', () => ({
    ...jest.requireActual('@mui/material'),
    useTheme: () => ({
        palette: { mode: 'light', primary: { main: '#1976d2' }, text: { secondary: '#666' } },
        breakpoints: { down: () => '(max-width:599.95px)' },
    }),
    useMediaQuery: () => false,
}));

// ─── Imports ──────────────────────────────────────────────────────────────────

import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import CreateTeamDialog from '@/components/teams/CreateTeamDialog';
import type { Team } from '@/types/team';

// ─── Fixtures ─────────────────────────────────────────────────────────────────

const TEAM: Team = {
    id: 'team_1',
    name: 'Legal',
    createdBy: 'user@example.com',
    createdAt: '2026-01-01T00:00:00Z',
};

const ok   = (data: any, message = 'Success') => ({ ok: true,  data, status: 200, message });
const fail = (status: number, message = '')   => ({ ok: false, data: null, status, message });

function deferPost() {
    let resolve!: (v: any) => void;
    const promise = new Promise(r => { resolve = r; });
    mockPost.mockReturnValueOnce(promise);
    return { resolve };
}

const onClose   = jest.fn();
const onCreated = jest.fn();

function renderDialog(open = true) {
    return render(
        <CreateTeamDialog open={open} onClose={onClose} onCreated={onCreated} />
    );
}

beforeEach(() => jest.clearAllMocks());

// =============================================================================
// 1–3. Rendering
// =============================================================================

describe('CreateTeamDialog — rendering', () => {

    it('renders the dialog with title "Create Team"', () => {
        renderDialog();
        // The dialog title <h2> and the submit button both contain "Create Team" —
        // assert the heading specifically
        expect(screen.getByRole('heading', { level: 2 })).toHaveTextContent('Create Team');
    });

    it('renders the Team Name text field', () => {
        renderDialog();
        expect(screen.getByLabelText('Team Name')).toBeInTheDocument();
    });

    it('shows the character remaining helper text', () => {
        renderDialog();
        expect(screen.getByText(/characters remaining/i)).toBeInTheDocument();
    });
});

// =============================================================================
// 4–6. Button state
// =============================================================================

describe('CreateTeamDialog — button state', () => {

    it('"Create Team" button is disabled when name is empty', () => {
        renderDialog();
        const button = screen.getByRole('button', { name: /create team/i });
        expect(button).toBeDisabled();
    });

    it('"Create Team" button is disabled when name is whitespace-only', async () => {
        renderDialog();
        const input = screen.getByLabelText('Team Name');
        fireEvent.change(input, { target: { value: '   ' } });
        const button = screen.getByRole('button', { name: /create team/i });
        expect(button).toBeDisabled();
    });

    it('"Create Team" button is enabled when a valid name is typed', async () => {
        renderDialog();
        const input = screen.getByLabelText('Team Name');
        fireEvent.change(input, { target: { value: 'Legal' } });
        const button = screen.getByRole('button', { name: /create team/i });
        expect(button).not.toBeDisabled();
    });
});

// =============================================================================
// 7–10. Successful creation
// =============================================================================

describe('CreateTeamDialog — successful creation', () => {

    it('calls httpClient.post with /teams and the trimmed name', async () => {
        mockPost.mockResolvedValueOnce(ok(TEAM));
        renderDialog();

        fireEvent.change(screen.getByLabelText('Team Name'), { target: { value: '  Legal  ' } });
        await act(async () => {
            fireEvent.click(screen.getByRole('button', { name: /create team/i }));
        });

        await waitFor(() => {
            expect(mockPost).toHaveBeenCalledWith('/teams', { name: 'Legal' });
        });
    });

    it('calls onCreated with the returned team on success', async () => {
        mockPost.mockResolvedValueOnce(ok(TEAM));
        renderDialog();

        fireEvent.change(screen.getByLabelText('Team Name'), { target: { value: 'Legal' } });
        await act(async () => {
            fireEvent.click(screen.getByRole('button', { name: /create team/i }));
        });

        await waitFor(() => {
            expect(onCreated).toHaveBeenCalledWith(TEAM);
        });
    });

    it('calls onClose after successful creation', async () => {
        mockPost.mockResolvedValueOnce(ok(TEAM));
        renderDialog();

        fireEvent.change(screen.getByLabelText('Team Name'), { target: { value: 'Legal' } });
        await act(async () => {
            fireEvent.click(screen.getByRole('button', { name: /create team/i }));
        });

        await waitFor(() => {
            expect(onClose).toHaveBeenCalledTimes(1);
        });
    });

    it('resets the form name to empty after successful creation', async () => {
        mockPost.mockResolvedValueOnce(ok(TEAM));
        const { rerender } = renderDialog();

        fireEvent.change(screen.getByLabelText('Team Name'), { target: { value: 'Legal' } });
        await act(async () => {
            fireEvent.click(screen.getByRole('button', { name: /create team/i }));
        });
        await waitFor(() => expect(onCreated).toHaveBeenCalled());

        // Reopen the dialog to verify the form was reset
        rerender(<CreateTeamDialog open={true} onClose={onClose} onCreated={onCreated} />);
        expect(screen.getByLabelText('Team Name')).toHaveValue('');
    });
});

// =============================================================================
// 11–13. Error handling
// =============================================================================

describe('CreateTeamDialog — error handling', () => {

    it('displays the API error message when the request fails', async () => {
        mockPost.mockResolvedValueOnce(fail(400, 'A team with this name already exists'));
        renderDialog();

        fireEvent.change(screen.getByLabelText('Team Name'), { target: { value: 'Legal' } });
        await act(async () => {
            fireEvent.click(screen.getByRole('button', { name: /create team/i }));
        });

        await waitFor(() => {
            expect(screen.getByText('A team with this name already exists')).toBeInTheDocument();
        });
    });

    it('falls back to "Failed to create team" when response.message is empty', async () => {
        mockPost.mockResolvedValueOnce(fail(500, ''));
        renderDialog();

        fireEvent.change(screen.getByLabelText('Team Name'), { target: { value: 'Legal' } });
        await act(async () => {
            fireEvent.click(screen.getByRole('button', { name: /create team/i }));
        });

        await waitFor(() => {
            expect(screen.getByText('Failed to create team')).toBeInTheDocument();
        });
    });

    it('clears the error when a new submission begins', async () => {
        mockPost.mockResolvedValueOnce(fail(400, 'A team with this name already exists'));
        mockPost.mockResolvedValueOnce(ok(TEAM));
        renderDialog();

        // First submission — produces an error
        fireEvent.change(screen.getByLabelText('Team Name'), { target: { value: 'Legal' } });
        await act(async () => {
            fireEvent.click(screen.getByRole('button', { name: /create team/i }));
        });
        await waitFor(() => {
            expect(screen.getByText('A team with this name already exists')).toBeInTheDocument();
        });

        // Second submission — error is cleared at the start of onSubmit
        await act(async () => {
            fireEvent.click(screen.getByRole('button', { name: /create team/i }));
        });
        await waitFor(() => {
            expect(screen.queryByText('A team with this name already exists')).not.toBeInTheDocument();
        });
    });
});

// =============================================================================
// 14–15. Loading state
// =============================================================================

describe('CreateTeamDialog — loading state', () => {

    it('shows "Creating…" button label while request is in-flight', async () => {
        const { resolve } = deferPost();
        renderDialog();

        fireEvent.change(screen.getByLabelText('Team Name'), { target: { value: 'Legal' } });
        await act(async () => {
            fireEvent.click(screen.getByRole('button', { name: /create team/i }));
        });

        expect(screen.getByRole('button', { name: /creating/i })).toBeInTheDocument();

        await act(async () => { resolve(ok(TEAM)); });
    });

    it('disables the submit button while request is in-flight', async () => {
        const { resolve } = deferPost();
        renderDialog();

        fireEvent.change(screen.getByLabelText('Team Name'), { target: { value: 'Legal' } });
        await act(async () => {
            fireEvent.click(screen.getByRole('button', { name: /create team/i }));
        });

        expect(screen.getByRole('button', { name: /creating/i })).toBeDisabled();

        await act(async () => { resolve(ok(TEAM)); });
    });
});

// =============================================================================
// 16–17. Cancel
// =============================================================================

describe('CreateTeamDialog — cancel', () => {

    it('Cancel button calls onClose', async () => {
        renderDialog();
        fireEvent.click(screen.getByRole('button', { name: /cancel/i }));
        expect(onClose).toHaveBeenCalledTimes(1);
    });

    it('does NOT call httpClient.post when Cancel is clicked', async () => {
        renderDialog();
        fireEvent.change(screen.getByLabelText('Team Name'), { target: { value: 'Legal' } });
        fireEvent.click(screen.getByRole('button', { name: /cancel/i }));
        expect(mockPost).not.toHaveBeenCalled();
    });
});
