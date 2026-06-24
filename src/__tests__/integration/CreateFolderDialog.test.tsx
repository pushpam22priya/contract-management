/**
 * INTEGRATION TESTS — CreateFolderDialog
 * (src/components/folders/CreateFolderDialog.tsx)
 *
 * httpClient is mocked so no network I/O occurs.
 * useTheme and useMediaQuery are mocked because BaseDialog requires them.
 *
 * Scenarios covered:
 *
 * Rendering
 *  1.  Renders dialog with title "Create Folder"
 *  2.  Renders the Folder Name text field
 *  3.  Shows character remaining helper text
 *
 * Button state
 *  4.  "Create Folder" button is disabled when name is empty
 *  5.  "Create Folder" button is disabled when name is whitespace-only
 *  6.  "Create Folder" button is enabled when a valid name is typed
 *
 * Successful creation
 *  7.  Calls httpClient.post with /folders and the trimmed name on submit
 *  8.  Calls onCreated with the returned folder on success
 *  9.  Calls onClose after successful creation
 * 10.  Form name is reset to empty after successful creation
 *
 * Error handling
 * 11.  Displays API error message when the request fails
 * 12.  Falls back to "Failed to create folder" when response.message is empty
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
import CreateFolderDialog from '@/components/folders/CreateFolderDialog';
import type { Folder } from '@/types/folder';

// ─── Fixtures ─────────────────────────────────────────────────────────────────

const FOLDER: Folder = {
    id: 'folder_1',
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
        <CreateFolderDialog open={open} onClose={onClose} onCreated={onCreated} />
    );
}

beforeEach(() => jest.clearAllMocks());

// =============================================================================
// 1–3. Rendering
// =============================================================================

describe('CreateFolderDialog — rendering', () => {

    it('renders the dialog with title "Create Folder"', () => {
        renderDialog();
        expect(screen.getByRole('heading', { level: 2 })).toHaveTextContent('Create Folder');
    });

    it('renders the Folder Name text field', () => {
        renderDialog();
        expect(screen.getByLabelText('Folder Name')).toBeInTheDocument();
    });

    it('shows the character remaining helper text', () => {
        renderDialog();
        expect(screen.getByText(/characters remaining/i)).toBeInTheDocument();
    });
});

// =============================================================================
// 4–6. Button state
// =============================================================================

describe('CreateFolderDialog — button state', () => {

    it('"Create Folder" button is disabled when name is empty', () => {
        renderDialog();
        const button = screen.getByRole('button', { name: /create folder/i });
        expect(button).toBeDisabled();
    });

    it('"Create Folder" button is disabled when name is whitespace-only', async () => {
        renderDialog();
        const input = screen.getByLabelText('Folder Name');
        fireEvent.change(input, { target: { value: '   ' } });
        const button = screen.getByRole('button', { name: /create folder/i });
        expect(button).toBeDisabled();
    });

    it('"Create Folder" button is enabled when a valid name is typed', async () => {
        renderDialog();
        const input = screen.getByLabelText('Folder Name');
        fireEvent.change(input, { target: { value: 'Legal' } });
        const button = screen.getByRole('button', { name: /create folder/i });
        expect(button).not.toBeDisabled();
    });
});

// =============================================================================
// 7–10. Successful creation
// =============================================================================

describe('CreateFolderDialog — successful creation', () => {

    it('calls httpClient.post with /folders and the trimmed name', async () => {
        mockPost.mockResolvedValueOnce(ok(FOLDER));
        renderDialog();

        fireEvent.change(screen.getByLabelText('Folder Name'), { target: { value: '  Legal  ' } });
        await act(async () => {
            fireEvent.click(screen.getByRole('button', { name: /create folder/i }));
        });

        await waitFor(() => {
            expect(mockPost).toHaveBeenCalledWith('/folders', { name: 'Legal' });
        });
    });

    it('calls onCreated with the returned folder on success', async () => {
        mockPost.mockResolvedValueOnce(ok(FOLDER));
        renderDialog();

        fireEvent.change(screen.getByLabelText('Folder Name'), { target: { value: 'Legal' } });
        await act(async () => {
            fireEvent.click(screen.getByRole('button', { name: /create folder/i }));
        });

        await waitFor(() => {
            expect(onCreated).toHaveBeenCalledWith(FOLDER);
        });
    });

    it('calls onClose after successful creation', async () => {
        mockPost.mockResolvedValueOnce(ok(FOLDER));
        renderDialog();

        fireEvent.change(screen.getByLabelText('Folder Name'), { target: { value: 'Legal' } });
        await act(async () => {
            fireEvent.click(screen.getByRole('button', { name: /create folder/i }));
        });

        await waitFor(() => {
            expect(onClose).toHaveBeenCalledTimes(1);
        });
    });

    it('resets the form name to empty after successful creation', async () => {
        mockPost.mockResolvedValueOnce(ok(FOLDER));
        const { rerender } = renderDialog();

        fireEvent.change(screen.getByLabelText('Folder Name'), { target: { value: 'Legal' } });
        await act(async () => {
            fireEvent.click(screen.getByRole('button', { name: /create folder/i }));
        });
        await waitFor(() => expect(onCreated).toHaveBeenCalled());

        // Reopen the dialog to verify the form was reset
        rerender(<CreateFolderDialog open={true} onClose={onClose} onCreated={onCreated} />);
        expect(screen.getByLabelText('Folder Name')).toHaveValue('');
    });
});

// =============================================================================
// 11–13. Error handling
// =============================================================================

describe('CreateFolderDialog — error handling', () => {

    it('displays the API error message when the request fails', async () => {
        mockPost.mockResolvedValueOnce(fail(400, 'A folder with this name already exists'));
        renderDialog();

        fireEvent.change(screen.getByLabelText('Folder Name'), { target: { value: 'Legal' } });
        await act(async () => {
            fireEvent.click(screen.getByRole('button', { name: /create folder/i }));
        });

        await waitFor(() => {
            expect(screen.getByText('A folder with this name already exists')).toBeInTheDocument();
        });
    });

    it('falls back to "Failed to create folder" when response.message is empty', async () => {
        mockPost.mockResolvedValueOnce(fail(500, ''));
        renderDialog();

        fireEvent.change(screen.getByLabelText('Folder Name'), { target: { value: 'Legal' } });
        await act(async () => {
            fireEvent.click(screen.getByRole('button', { name: /create folder/i }));
        });

        await waitFor(() => {
            expect(screen.getByText('Failed to create folder')).toBeInTheDocument();
        });
    });

    it('clears the error when a new submission begins', async () => {
        mockPost.mockResolvedValueOnce(fail(400, 'A folder with this name already exists'));
        mockPost.mockResolvedValueOnce(ok(FOLDER));
        renderDialog();

        // First submission — produces an error
        fireEvent.change(screen.getByLabelText('Folder Name'), { target: { value: 'Legal' } });
        await act(async () => {
            fireEvent.click(screen.getByRole('button', { name: /create folder/i }));
        });
        await waitFor(() => {
            expect(screen.getByText('A folder with this name already exists')).toBeInTheDocument();
        });

        // Second submission — error is cleared at the start of onSubmit
        await act(async () => {
            fireEvent.click(screen.getByRole('button', { name: /create folder/i }));
        });
        await waitFor(() => {
            expect(screen.queryByText('A folder with this name already exists')).not.toBeInTheDocument();
        });
    });
});

// =============================================================================
// 14–15. Loading state
// =============================================================================

describe('CreateFolderDialog — loading state', () => {

    it('shows "Creating…" button label while request is in-flight', async () => {
        const { resolve } = deferPost();
        renderDialog();

        fireEvent.change(screen.getByLabelText('Folder Name'), { target: { value: 'Legal' } });
        await act(async () => {
            fireEvent.click(screen.getByRole('button', { name: /create folder/i }));
        });

        expect(screen.getByRole('button', { name: /creating/i })).toBeInTheDocument();

        await act(async () => { resolve(ok(FOLDER)); });
    });

    it('disables the submit button while request is in-flight', async () => {
        const { resolve } = deferPost();
        renderDialog();

        fireEvent.change(screen.getByLabelText('Folder Name'), { target: { value: 'Legal' } });
        await act(async () => {
            fireEvent.click(screen.getByRole('button', { name: /create folder/i }));
        });

        expect(screen.getByRole('button', { name: /creating/i })).toBeDisabled();

        await act(async () => { resolve(ok(FOLDER)); });
    });
});

// =============================================================================
// 16–17. Cancel
// =============================================================================

describe('CreateFolderDialog — cancel', () => {

    it('Cancel button calls onClose', async () => {
        renderDialog();
        fireEvent.click(screen.getByRole('button', { name: /cancel/i }));
        expect(onClose).toHaveBeenCalledTimes(1);
    });

    it('does NOT call httpClient.post when Cancel is clicked', async () => {
        renderDialog();
        fireEvent.change(screen.getByLabelText('Folder Name'), { target: { value: 'Legal' } });
        fireEvent.click(screen.getByRole('button', { name: /cancel/i }));
        expect(mockPost).not.toHaveBeenCalled();
    });
});
