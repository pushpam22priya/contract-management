/**
 * INTEGRATION TESTS — RenameTeamDialog
 * (src/components/teams/RenameTeamDialog.tsx)
 *
 * httpClient is mocked so no network I/O occurs.
 * useTheme and useMediaQuery are mocked because BaseDialog requires them.
 *
 * Scenarios covered:
 *
 * Rendering
 *  1.  Pre-fills the Team Name input with the current team name
 *  2.  Updates the pre-filled name when the team prop changes
 *
 * Button state
 *  3.  "Save" button is disabled when the name is empty
 *  4.  "Save" button is disabled when the name matches the current team name (no change)
 *  5.  "Save" button is enabled when a different (non-empty) name is typed
 *
 * Successful rename
 *  6.  Calls httpClient.put with /teams/{id} and the new trimmed name
 *  7.  Calls onRenamed with the team object returned from the backend
 *  8.  Falls back to a synthesized team (old team + new name) when response.data is null
 *  9.  Calls onClose after a successful rename
 *
 * Error handling
 * 10.  Displays the API error message when the request fails
 * 11.  Falls back to "Failed to rename team" when response.message is empty
 *
 * Loading state
 * 12.  Shows "Saving…" button label while request is in-flight
 * 13.  Disables the submit button while request is in-flight
 *
 * Edge cases
 * 14.  Does NOT call httpClient.put when team prop is null
 *
 * Cancel
 * 15.  Cancel button calls onClose without calling httpClient.put
 */

// ─── Mocks (must precede imports) ────────────────────────────────────────────

const mockPut = jest.fn();
jest.mock('@/lib/httpClient', () => ({
    httpClient: { put: (...args: any[]) => mockPut(...args) },
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
import RenameTeamDialog from '@/components/teams/RenameTeamDialog';
import type { Team } from '@/types/team';

// ─── Fixtures ─────────────────────────────────────────────────────────────────

const TEAM: Team = {
    id: 'team_1',
    name: 'Legal',
    createdBy: 'user@example.com',
    createdAt: '2026-01-01T00:00:00Z',
};

const TEAM_B: Team = {
    id: 'team_2',
    name: 'Finance',
    createdBy: 'user@example.com',
    createdAt: '2026-02-01T00:00:00Z',
};

const ok   = (data: any, message = 'Success') => ({ ok: true,  data, status: 200, message });
const fail = (status: number, message = '')   => ({ ok: false, data: null, status, message });

function deferPut() {
    let resolve!: (v: any) => void;
    const promise = new Promise(r => { resolve = r; });
    mockPut.mockReturnValueOnce(promise);
    return { resolve };
}

const onClose   = jest.fn();
const onRenamed = jest.fn();

function renderDialog(team: Team | null = TEAM) {
    return render(
        <RenameTeamDialog open={true} team={team} onClose={onClose} onRenamed={onRenamed} />
    );
}

beforeEach(() => jest.clearAllMocks());

// =============================================================================
// 1–2. Rendering
// =============================================================================

describe('RenameTeamDialog — rendering', () => {

    it('pre-fills the Team Name input with the current team name', async () => {
        renderDialog(TEAM);
        await waitFor(() => {
            expect(screen.getByLabelText('Team Name')).toHaveValue('Legal');
        });
    });

    it('updates the pre-filled name when the team prop changes', async () => {
        const { rerender } = renderDialog(TEAM);
        await waitFor(() => {
            expect(screen.getByLabelText('Team Name')).toHaveValue('Legal');
        });

        rerender(
            <RenameTeamDialog open={true} team={TEAM_B} onClose={onClose} onRenamed={onRenamed} />
        );
        await waitFor(() => {
            expect(screen.getByLabelText('Team Name')).toHaveValue('Finance');
        });
    });
});

// =============================================================================
// 3–5. Button state
// =============================================================================

describe('RenameTeamDialog — button state', () => {

    it('"Save" button is disabled when the name is empty', async () => {
        renderDialog(TEAM);
        const input = screen.getByLabelText('Team Name');
        fireEvent.change(input, { target: { value: '' } });
        expect(screen.getByRole('button', { name: /save/i })).toBeDisabled();
    });

    it('"Save" button is disabled when the name matches the current team name (no change)', async () => {
        renderDialog(TEAM);
        await waitFor(() => {
            expect(screen.getByLabelText('Team Name')).toHaveValue('Legal');
        });
        // Name is still "Legal" — same as current team name
        expect(screen.getByRole('button', { name: /save/i })).toBeDisabled();
    });

    it('"Save" button is enabled when a different non-empty name is typed', async () => {
        renderDialog(TEAM);
        const input = screen.getByLabelText('Team Name');
        fireEvent.change(input, { target: { value: 'Compliance' } });
        expect(screen.getByRole('button', { name: /save/i })).not.toBeDisabled();
    });
});

// =============================================================================
// 6–9. Successful rename
// =============================================================================

describe('RenameTeamDialog — successful rename', () => {

    it('calls httpClient.put with /teams/{id} and the new trimmed name', async () => {
        const updatedTeam = { ...TEAM, name: 'Compliance' };
        mockPut.mockResolvedValueOnce(ok(updatedTeam));
        renderDialog(TEAM);

        const input = screen.getByLabelText('Team Name');
        fireEvent.change(input, { target: { value: '  Compliance  ' } });
        await act(async () => {
            fireEvent.click(screen.getByRole('button', { name: /save/i }));
        });

        await waitFor(() => {
            expect(mockPut).toHaveBeenCalledWith('/teams/team_1', { name: 'Compliance' });
        });
    });

    it('calls onRenamed with the team object returned from the backend', async () => {
        const updatedTeam = { ...TEAM, name: 'Compliance' };
        mockPut.mockResolvedValueOnce(ok(updatedTeam));
        renderDialog(TEAM);

        fireEvent.change(screen.getByLabelText('Team Name'), { target: { value: 'Compliance' } });
        await act(async () => {
            fireEvent.click(screen.getByRole('button', { name: /save/i }));
        });

        await waitFor(() => {
            expect(onRenamed).toHaveBeenCalledWith(updatedTeam);
        });
    });

    it('falls back to a synthesized team when response.data is null', async () => {
        mockPut.mockResolvedValueOnce(ok(null));
        renderDialog(TEAM);

        fireEvent.change(screen.getByLabelText('Team Name'), { target: { value: 'Compliance' } });
        await act(async () => {
            fireEvent.click(screen.getByRole('button', { name: /save/i }));
        });

        await waitFor(() => {
            expect(onRenamed).toHaveBeenCalledWith(
                expect.objectContaining({ id: 'team_1', name: 'Compliance' })
            );
        });
    });

    it('calls onClose after a successful rename', async () => {
        mockPut.mockResolvedValueOnce(ok({ ...TEAM, name: 'Compliance' }));
        renderDialog(TEAM);

        fireEvent.change(screen.getByLabelText('Team Name'), { target: { value: 'Compliance' } });
        await act(async () => {
            fireEvent.click(screen.getByRole('button', { name: /save/i }));
        });

        await waitFor(() => {
            expect(onClose).toHaveBeenCalledTimes(1);
        });
    });
});

// =============================================================================
// 10–11. Error handling
// =============================================================================

describe('RenameTeamDialog — error handling', () => {

    it('displays the API error message when the request fails', async () => {
        mockPut.mockResolvedValueOnce(fail(400, 'A team with this name already exists'));
        renderDialog(TEAM);

        fireEvent.change(screen.getByLabelText('Team Name'), { target: { value: 'Finance' } });
        await act(async () => {
            fireEvent.click(screen.getByRole('button', { name: /save/i }));
        });

        await waitFor(() => {
            expect(screen.getByText('A team with this name already exists')).toBeInTheDocument();
        });
    });

    it('falls back to "Failed to rename team" when response.message is empty', async () => {
        mockPut.mockResolvedValueOnce(fail(500, ''));
        renderDialog(TEAM);

        fireEvent.change(screen.getByLabelText('Team Name'), { target: { value: 'Finance' } });
        await act(async () => {
            fireEvent.click(screen.getByRole('button', { name: /save/i }));
        });

        await waitFor(() => {
            expect(screen.getByText('Failed to rename team')).toBeInTheDocument();
        });
    });
});

// =============================================================================
// 12–13. Loading state
// =============================================================================

describe('RenameTeamDialog — loading state', () => {

    it('shows "Saving…" button label while request is in-flight', async () => {
        const { resolve } = deferPut();
        renderDialog(TEAM);

        fireEvent.change(screen.getByLabelText('Team Name'), { target: { value: 'Compliance' } });
        await act(async () => {
            fireEvent.click(screen.getByRole('button', { name: /save/i }));
        });

        expect(screen.getByRole('button', { name: /saving/i })).toBeInTheDocument();

        await act(async () => { resolve(ok({ ...TEAM, name: 'Compliance' })); });
    });

    it('disables the submit button while request is in-flight', async () => {
        const { resolve } = deferPut();
        renderDialog(TEAM);

        fireEvent.change(screen.getByLabelText('Team Name'), { target: { value: 'Compliance' } });
        await act(async () => {
            fireEvent.click(screen.getByRole('button', { name: /save/i }));
        });

        expect(screen.getByRole('button', { name: /saving/i })).toBeDisabled();

        await act(async () => { resolve(ok({ ...TEAM, name: 'Compliance' })); });
    });
});

// =============================================================================
// 14. Edge case — null team
// =============================================================================

describe('RenameTeamDialog — null team', () => {

    it('does NOT call httpClient.put when team prop is null', async () => {
        render(
            <RenameTeamDialog open={true} team={null} onClose={onClose} onRenamed={onRenamed} />
        );

        const input = screen.getByLabelText('Team Name');
        fireEvent.change(input, { target: { value: 'Something' } });
        await act(async () => {
            fireEvent.click(screen.getByRole('button', { name: /save/i }));
        });

        expect(mockPut).not.toHaveBeenCalled();
    });
});

// =============================================================================
// 15. Cancel
// =============================================================================

describe('RenameTeamDialog — cancel', () => {

    it('Cancel button calls onClose without calling httpClient.put', () => {
        renderDialog(TEAM);
        fireEvent.click(screen.getByRole('button', { name: /cancel/i }));
        expect(onClose).toHaveBeenCalledTimes(1);
        expect(mockPut).not.toHaveBeenCalled();
    });
});
