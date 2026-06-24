/**
 * INTEGRATION TESTS — RenameFolderDialog
 * (src/components/folders/RenameFolderDialog.tsx)
 *
 * httpClient is mocked so no network I/O occurs.
 * useTheme and useMediaQuery are mocked because BaseDialog requires them.
 *
 * Scenarios covered:
 *
 * Rendering
 *  1.  Pre-fills the Folder Name input with the current folder name
 *  2.  Updates the pre-filled name when the folder prop changes
 *
 * Button state
 *  3.  "Save" button is disabled when the name is empty
 *  4.  "Save" button is disabled when the name matches the current folder name (no change)
 *  5.  "Save" button is enabled when a different (non-empty) name is typed
 *
 * Successful rename
 *  6.  Calls httpClient.put with /folders/{id} and the new trimmed name
 *  7.  Calls onRenamed with the folder object returned from the backend
 *  8.  Falls back to a synthesized folder (old folder + new name) when response.data is null
 *  9.  Calls onClose after a successful rename
 *
 * Error handling
 * 10.  Displays the API error message when the request fails
 * 11.  Falls back to "Failed to rename folder" when response.message is empty
 *
 * Loading state
 * 12.  Shows "Saving…" button label while request is in-flight
 * 13.  Disables the submit button while request is in-flight
 *
 * Edge cases
 * 14.  Does NOT call httpClient.put when folder prop is null
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
import RenameFolderDialog from '@/components/folders/RenameFolderDialog';
import type { Folder } from '@/types/folder';

// ─── Fixtures ─────────────────────────────────────────────────────────────────

const FOLDER: Folder = {
    id: 'folder_1',
    name: 'Legal',
    createdBy: 'user@example.com',
    createdAt: '2026-01-01T00:00:00Z',
};

const FOLDER_B: Folder = {
    id: 'folder_2',
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

function renderDialog(folder: Folder | null = FOLDER) {
    return render(
        <RenameFolderDialog open={true} folder={folder} onClose={onClose} onRenamed={onRenamed} />
    );
}

beforeEach(() => jest.clearAllMocks());

// =============================================================================
// 1–2. Rendering
// =============================================================================

describe('RenameFolderDialog — rendering', () => {

    it('pre-fills the Folder Name input with the current folder name', async () => {
        renderDialog(FOLDER);
        await waitFor(() => {
            expect(screen.getByLabelText('Folder Name')).toHaveValue('Legal');
        });
    });

    it('updates the pre-filled name when the folder prop changes', async () => {
        const { rerender } = renderDialog(FOLDER);
        await waitFor(() => {
            expect(screen.getByLabelText('Folder Name')).toHaveValue('Legal');
        });

        rerender(
            <RenameFolderDialog open={true} folder={FOLDER_B} onClose={onClose} onRenamed={onRenamed} />
        );
        await waitFor(() => {
            expect(screen.getByLabelText('Folder Name')).toHaveValue('Finance');
        });
    });
});

// =============================================================================
// 3–5. Button state
// =============================================================================

describe('RenameFolderDialog — button state', () => {

    it('"Save" button is disabled when the name is empty', async () => {
        renderDialog(FOLDER);
        const input = screen.getByLabelText('Folder Name');
        fireEvent.change(input, { target: { value: '' } });
        expect(screen.getByRole('button', { name: /save/i })).toBeDisabled();
    });

    it('"Save" button is disabled when the name matches the current folder name (no change)', async () => {
        renderDialog(FOLDER);
        await waitFor(() => {
            expect(screen.getByLabelText('Folder Name')).toHaveValue('Legal');
        });
        // Name is still "Legal" — same as current folder name
        expect(screen.getByRole('button', { name: /save/i })).toBeDisabled();
    });

    it('"Save" button is enabled when a different non-empty name is typed', async () => {
        renderDialog(FOLDER);
        const input = screen.getByLabelText('Folder Name');
        fireEvent.change(input, { target: { value: 'Compliance' } });
        expect(screen.getByRole('button', { name: /save/i })).not.toBeDisabled();
    });
});

// =============================================================================
// 6–9. Successful rename
// =============================================================================

describe('RenameFolderDialog — successful rename', () => {

    it('calls httpClient.put with /folders/{id} and the new trimmed name', async () => {
        const updatedFolder = { ...FOLDER, name: 'Compliance' };
        mockPut.mockResolvedValueOnce(ok(updatedFolder));
        renderDialog(FOLDER);

        const input = screen.getByLabelText('Folder Name');
        fireEvent.change(input, { target: { value: '  Compliance  ' } });
        await act(async () => {
            fireEvent.click(screen.getByRole('button', { name: /save/i }));
        });

        await waitFor(() => {
            expect(mockPut).toHaveBeenCalledWith('/folders/folder_1', { name: 'Compliance' });
        });
    });

    it('calls onRenamed with the folder object returned from the backend', async () => {
        const updatedFolder = { ...FOLDER, name: 'Compliance' };
        mockPut.mockResolvedValueOnce(ok(updatedFolder));
        renderDialog(FOLDER);

        fireEvent.change(screen.getByLabelText('Folder Name'), { target: { value: 'Compliance' } });
        await act(async () => {
            fireEvent.click(screen.getByRole('button', { name: /save/i }));
        });

        await waitFor(() => {
            expect(onRenamed).toHaveBeenCalledWith(updatedFolder);
        });
    });

    it('falls back to a synthesized folder when response.data is null', async () => {
        mockPut.mockResolvedValueOnce(ok(null));
        renderDialog(FOLDER);

        fireEvent.change(screen.getByLabelText('Folder Name'), { target: { value: 'Compliance' } });
        await act(async () => {
            fireEvent.click(screen.getByRole('button', { name: /save/i }));
        });

        await waitFor(() => {
            expect(onRenamed).toHaveBeenCalledWith(
                expect.objectContaining({ id: 'folder_1', name: 'Compliance' })
            );
        });
    });

    it('calls onClose after a successful rename', async () => {
        mockPut.mockResolvedValueOnce(ok({ ...FOLDER, name: 'Compliance' }));
        renderDialog(FOLDER);

        fireEvent.change(screen.getByLabelText('Folder Name'), { target: { value: 'Compliance' } });
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

describe('RenameFolderDialog — error handling', () => {

    it('displays the API error message when the request fails', async () => {
        mockPut.mockResolvedValueOnce(fail(400, 'A folder with this name already exists'));
        renderDialog(FOLDER);

        fireEvent.change(screen.getByLabelText('Folder Name'), { target: { value: 'Finance' } });
        await act(async () => {
            fireEvent.click(screen.getByRole('button', { name: /save/i }));
        });

        await waitFor(() => {
            expect(screen.getByText('A folder with this name already exists')).toBeInTheDocument();
        });
    });

    it('falls back to "Failed to rename folder" when response.message is empty', async () => {
        mockPut.mockResolvedValueOnce(fail(500, ''));
        renderDialog(FOLDER);

        fireEvent.change(screen.getByLabelText('Folder Name'), { target: { value: 'Finance' } });
        await act(async () => {
            fireEvent.click(screen.getByRole('button', { name: /save/i }));
        });

        await waitFor(() => {
            expect(screen.getByText('Failed to rename folder')).toBeInTheDocument();
        });
    });
});

// =============================================================================
// 12–13. Loading state
// =============================================================================

describe('RenameFolderDialog — loading state', () => {

    it('shows "Saving…" button label while request is in-flight', async () => {
        const { resolve } = deferPut();
        renderDialog(FOLDER);

        fireEvent.change(screen.getByLabelText('Folder Name'), { target: { value: 'Compliance' } });
        await act(async () => {
            fireEvent.click(screen.getByRole('button', { name: /save/i }));
        });

        expect(screen.getByRole('button', { name: /saving/i })).toBeInTheDocument();

        await act(async () => { resolve(ok({ ...FOLDER, name: 'Compliance' })); });
    });

    it('disables the submit button while request is in-flight', async () => {
        const { resolve } = deferPut();
        renderDialog(FOLDER);

        fireEvent.change(screen.getByLabelText('Folder Name'), { target: { value: 'Compliance' } });
        await act(async () => {
            fireEvent.click(screen.getByRole('button', { name: /save/i }));
        });

        expect(screen.getByRole('button', { name: /saving/i })).toBeDisabled();

        await act(async () => { resolve(ok({ ...FOLDER, name: 'Compliance' })); });
    });
});

// =============================================================================
// 14. Edge case — null folder
// =============================================================================

describe('RenameFolderDialog — null folder', () => {

    it('does NOT call httpClient.put when folder prop is null', async () => {
        render(
            <RenameFolderDialog open={true} folder={null} onClose={onClose} onRenamed={onRenamed} />
        );

        const input = screen.getByLabelText('Folder Name');
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

describe('RenameFolderDialog — cancel', () => {

    it('Cancel button calls onClose without calling httpClient.put', () => {
        renderDialog(FOLDER);
        fireEvent.click(screen.getByRole('button', { name: /cancel/i }));
        expect(onClose).toHaveBeenCalledTimes(1);
        expect(mockPut).not.toHaveBeenCalled();
    });
});
