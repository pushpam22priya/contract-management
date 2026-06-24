/**
 * UNIT TESTS — FolderCard
 * (src/components/folders/FolderCard.tsx)
 *
 * useTheme is mocked with all custom theme properties the component reads.
 * useTranslations (next-intl) is mocked to return the translation key.
 * dayjs is used as-is — the expected date is computed in each test.
 *
 * Scenarios covered:
 *
 * Rendering
 *  1.  Renders the folder name
 *  2.  Displays "1 contract" (singular) when contractCount is 1
 *  3.  Displays "3 contracts" (plural) when contractCount is 3
 *  4.  Displays "0 contracts" when contractCount is 0
 *  5.  Shows the creation date formatted as DD/MM/YYYY
 *
 * Card click
 *  6.  Clicking the card body calls onClick with folder.id
 *  7.  Clicking the view (visibility) button calls onClick with folder.id
 *
 * Rename action
 *  8.  Clicking the rename button calls onRename with the folder object
 *
 * Delete button visibility
 *  9.  Delete button is NOT rendered when contractCount > 0
 * 10.  Delete button IS rendered when contractCount is 0 and onDelete is provided
 * 11.  Delete button is NOT rendered when onDelete prop is absent (even if contractCount is 0)
 *
 * Delete interaction
 * 12.  Clicking delete calls onDelete with the folder object
 * 13.  Clicking delete does NOT propagate to the card's onClick handler
 */

// ─── Mocks (must precede imports) ────────────────────────────────────────────

jest.mock('@mui/material', () => ({
    ...jest.requireActual('@mui/material'),
    useTheme: () => ({
        palette: {
            mode: 'light',
            primary: { main: '#1976d2' },
            text:    { secondary: '#666666' },
            error:   { main: '#d32f2f' },
        },
        sidebar: { cardHoverGradient: 'linear-gradient(90deg, #1976d2, #42a5f5)' },
        card:    { actionOverlay: 'rgba(0,0,0,0.04)' },
        breakpoints: { down: () => '(max-width:599.95px)' },
    }),
}));

jest.mock('next-intl', () => ({
    useTranslations: () => (key: string) => key,
}));

// ─── Imports ──────────────────────────────────────────────────────────────────

import { render, screen, fireEvent } from '@testing-library/react';
import FolderCard from '@/components/folders/FolderCard';
import type { Folder } from '@/types/folder';
import dayjs from 'dayjs';

// ─── Fixtures ─────────────────────────────────────────────────────────────────

const FOLDER: Folder = {
    id: 'folder_1',
    name: 'Legal',
    createdBy: 'user@example.com',
    createdAt: '2026-01-15T10:00:00Z',
};

const onClick  = jest.fn();
const onRename = jest.fn();
const onDelete = jest.fn();

// Pass null to omit the onDelete prop entirely (undefined triggers the JS default)
function renderCard(contractCount = 3, deleteHandler: ((f: Folder) => void) | null = onDelete) {
    return render(
        <FolderCard
            folder={FOLDER}
            contractCount={contractCount}
            onClick={onClick}
            onRename={onRename}
            {...(deleteHandler !== null ? { onDelete: deleteHandler } : {})}
        />
    );
}

beforeEach(() => jest.clearAllMocks());

// =============================================================================
// 1–5. Rendering
// =============================================================================

describe('FolderCard — rendering', () => {

    it('renders the folder name', () => {
        renderCard();
        expect(screen.getAllByText('Legal').length).toBeGreaterThan(0);
    });

    it('displays "1 contract" (singular) when contractCount is 1', () => {
        renderCard(1);
        expect(screen.getByText('1 contract')).toBeInTheDocument();
    });

    it('displays "3 contracts" (plural) when contractCount is 3', () => {
        renderCard(3);
        expect(screen.getByText('3 contracts')).toBeInTheDocument();
    });

    it('displays "0 contracts" when contractCount is 0', () => {
        renderCard(0);
        expect(screen.getByText('0 contracts')).toBeInTheDocument();
    });

    it('shows the creation date formatted as DD/MM/YYYY', () => {
        renderCard();
        const expected = dayjs(FOLDER.createdAt).format('DD/MM/YYYY');
        expect(screen.getByText(`Created ${expected}`)).toBeInTheDocument();
    });
});

// =============================================================================
// 6–7. Card click & view button
// =============================================================================

describe('FolderCard — card click', () => {

    it('clicking the card body calls onClick with folder.id', () => {
        renderCard();
        // The outer Box has onClick — click the folder name as a proxy for the card body
        fireEvent.click(screen.getAllByText('Legal')[0]);
        expect(onClick).toHaveBeenCalledWith('folder_1');
    });

    it('clicking the view (visibility) button calls onClick with folder.id', () => {
        renderCard();
        const viewButton = screen.getByRole('button', { name: 'openFolder' });
        fireEvent.click(viewButton);
        expect(onClick).toHaveBeenCalledWith('folder_1');
    });
});

// =============================================================================
// 8. Rename action
// =============================================================================

describe('FolderCard — rename action', () => {

    it('clicking the rename button calls onRename with the folder object', () => {
        renderCard();
        const renameButton = screen.getByRole('button', { name: 'renameFolder' });
        fireEvent.click(renameButton);
        expect(onRename).toHaveBeenCalledWith(FOLDER);
    });
});

// =============================================================================
// 9–11. Delete button visibility
// =============================================================================

describe('FolderCard — delete button visibility', () => {

    it('does NOT render the delete button when contractCount > 0', () => {
        renderCard(2);
        expect(screen.queryByTitle('Delete folder')).not.toBeInTheDocument();
    });

    it('renders the delete button when contractCount is 0 and onDelete is provided', () => {
        renderCard(0, onDelete);
        expect(screen.getByRole('button', { name: 'Delete folder' })).toBeInTheDocument();
    });

    it('does NOT render the delete button when onDelete is absent (even if contractCount is 0)', () => {
        renderCard(0, null);
        expect(screen.queryByRole('button', { name: 'Delete folder' })).not.toBeInTheDocument();
    });
});

// =============================================================================
// 12–13. Delete interaction
// =============================================================================

describe('FolderCard — delete interaction', () => {

    it('clicking delete calls onDelete with the folder object', () => {
        renderCard(0);
        fireEvent.click(screen.getByRole('button', { name: 'Delete folder' }));
        expect(onDelete).toHaveBeenCalledWith(FOLDER);
    });

    it('clicking delete does NOT propagate to the card\'s onClick handler', () => {
        renderCard(0);
        fireEvent.click(screen.getByRole('button', { name: 'Delete folder' }));
        expect(onClick).not.toHaveBeenCalled();
    });
});
