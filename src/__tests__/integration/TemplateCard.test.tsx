/**
 * INTEGRATION TESTS — TemplateCard component
 * (src/components/template/TemplateCard.tsx)
 *
 * Renders the real component with MUI useTheme and next-intl useTranslations
 * mocked. Tests verify rendered content, tooltip data, truncation, action
 * button visibility by role, and callback invocations.
 *
 * Scenarios covered:
 *
 * Rendering
 *  1.  Title is visible on the card
 *  2.  Category badge is visible
 *  3.  Description is visible
 *  4.  Title is truncated to 22 characters + "..."
 *  5.  Description is truncated to 60 characters + "..."
 *  6.  Category is truncated to 18 characters + "..."
 *  7.  Short text (below limit) is not truncated
 *
 * Action buttons — non-admin user
 *  8.  View button is visible for regular users
 *  9.  Edit button is NOT visible for regular users
 * 10.  Delete button is NOT visible for regular users
 *
 * Action buttons — admin user
 * 11.  View button is visible for admins
 * 12.  Edit button is visible for admins
 * 13.  Delete button is visible for admins
 *
 * Callbacks
 * 14.  onView is called with the template id when View button is clicked
 * 15.  onEdit is called with the template id when Edit button is clicked
 * 16.  onDelete is called with the template id when Delete button is clicked
 * 17.  Clicking the card body does not trigger onEdit or onDelete
 * 18.  onView, onEdit, onDelete are never called when not provided (no crash)
 */

import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

// ─── MUI useTheme mock ─────────────────────────────────────────────────────────
// TemplateCard accesses theme.palette.primary.main, theme.palette.mode,
// theme.card.actionOverlay (custom token), and theme.palette.text.secondary.

jest.mock('@mui/material', () => {
    const actual = jest.requireActual('@mui/material');
    return {
        ...actual,
        useTheme: () => ({
            palette: {
                primary:  { main: '#2563eb' },
                mode:     'light',
                text:     { secondary: '#64748b' },
                divider:  '#e2e8f0',
            },
            card: {
                actionOverlay: 'rgba(255,255,255,0.95)',
            },
        }),
    };
});

// ─── next-intl mock ────────────────────────────────────────────────────────────

jest.mock('next-intl', () => ({
    useTranslations: (namespace: string) => {
        const map: Record<string, Record<string, string>> = {
            tooltips: {
                viewTemplate:   'View Template',
                editTemplate:   'Edit Template',
                deleteTemplate: 'Delete Template',
            },
        };
        return (key: string) => map[namespace]?.[key] ?? key;
    },
}));

// ─── Component under test ─────────────────────────────────────────────────────

import TemplateCard from '@/components/template/TemplateCard';

// ─── Fixtures ─────────────────────────────────────────────────────────────────

const BASE_PROPS = {
    id:          'tpl_001',
    category:    'Legal',
    title:       'NDA Agreement',
    description: 'A standard non-disclosure agreement for internal use.',
    timesUsed:   5,
    lastUsed:    '2026-05-01',
};

// ─── Helper ───────────────────────────────────────────────────────────────────

function renderCard(overrides: Partial<typeof BASE_PROPS & {
    isAdmin?: boolean;
    onView?:   (id: string) => void;
    onEdit?:   (id: string) => void;
    onDelete?: (id: string) => void;
    index?:    number;
}> = {}) {
    const props = { ...BASE_PROPS, ...overrides };
    return render(<TemplateCard {...props} />);
}

// =============================================================================
// 1–7. Rendering
// =============================================================================

describe('TemplateCard — rendering', () => {

    it('renders the template title', () => {
        renderCard();
        expect(screen.getByText('NDA Agreement')).toBeInTheDocument();
    });

    it('renders the category badge', () => {
        renderCard();
        expect(screen.getByText('Legal')).toBeInTheDocument();
    });

    it('renders the description', () => {
        renderCard();
        expect(screen.getByText(/standard non-disclosure/i)).toBeInTheDocument();
    });

    it('truncates the title to 22 characters + "..." for long titles', () => {
        const longTitle = 'Comprehensive Master Services Agreement Template';
        renderCard({ title: longTitle });
        // truncateText cuts at 22 and appends "..."
        const truncated = longTitle.slice(0, 22) + '...';
        expect(screen.getByText(truncated)).toBeInTheDocument();
    });

    it('does NOT truncate a title that is 22 characters or shorter', () => {
        const exactTitle = 'A'.repeat(22);
        renderCard({ title: exactTitle });
        expect(screen.getByText(exactTitle)).toBeInTheDocument();
        expect(screen.queryByText(exactTitle + '...')).not.toBeInTheDocument();
    });

    it('truncates the description to 60 characters + "..." for long descriptions', () => {
        const longDesc = 'This is a very detailed and comprehensive description of the template that exceeds the limit.';
        renderCard({ description: longDesc });
        const truncated = longDesc.slice(0, 60) + '...';
        expect(screen.getByText(truncated)).toBeInTheDocument();
    });

    it('truncates the category to 18 characters + "..." for long categories', () => {
        const longCategory = 'Human Resources and Administration';
        renderCard({ category: longCategory });
        const truncated = longCategory.slice(0, 18) + '...';
        expect(screen.getByText(truncated)).toBeInTheDocument();
    });
});

// =============================================================================
// 8–13. Action button visibility
// =============================================================================

describe('TemplateCard — action buttons (non-admin)', () => {

    it('shows the View button for a regular (non-admin) user', () => {
        renderCard({ isAdmin: false, onView: jest.fn() });
        expect(screen.getByRole('button', { name: /view template/i })).toBeInTheDocument();
    });

    it('does NOT show the Edit button for a regular user', () => {
        renderCard({ isAdmin: false });
        expect(screen.queryByRole('button', { name: /edit template/i })).not.toBeInTheDocument();
    });

    it('does NOT show the Delete button for a regular user', () => {
        renderCard({ isAdmin: false });
        expect(screen.queryByRole('button', { name: /delete template/i })).not.toBeInTheDocument();
    });
});

describe('TemplateCard — action buttons (admin)', () => {

    it('shows the View button for an admin', () => {
        renderCard({ isAdmin: true, onView: jest.fn() });
        expect(screen.getByRole('button', { name: /view template/i })).toBeInTheDocument();
    });

    it('shows the Edit button for an admin', () => {
        renderCard({ isAdmin: true, onEdit: jest.fn() });
        expect(screen.getByRole('button', { name: /edit template/i })).toBeInTheDocument();
    });

    it('shows the Delete button for an admin', () => {
        renderCard({ isAdmin: true, onDelete: jest.fn() });
        expect(screen.getByRole('button', { name: /delete template/i })).toBeInTheDocument();
    });
});

// =============================================================================
// 14–18. Callbacks
// =============================================================================

describe('TemplateCard — callbacks', () => {

    it('calls onView with the template id when the View button is clicked', async () => {
        const onView = jest.fn();
        const user = userEvent.setup();
        renderCard({ isAdmin: false, onView });

        await user.click(screen.getByRole('button', { name: /view template/i }));

        expect(onView).toHaveBeenCalledWith('tpl_001');
    });

    it('calls onEdit with the template id when the Edit button is clicked', async () => {
        const onEdit = jest.fn();
        const user = userEvent.setup();
        renderCard({ isAdmin: true, onEdit });

        await user.click(screen.getByRole('button', { name: /edit template/i }));

        expect(onEdit).toHaveBeenCalledWith('tpl_001');
    });

    it('calls onDelete with the template id when the Delete button is clicked', async () => {
        const onDelete = jest.fn();
        const user = userEvent.setup();
        renderCard({ isAdmin: true, onDelete });

        await user.click(screen.getByRole('button', { name: /delete template/i }));

        expect(onDelete).toHaveBeenCalledWith('tpl_001');
    });

    it('does not throw when onView is not provided and the View button is clicked', async () => {
        const user = userEvent.setup();
        // No onView prop — should gracefully do nothing
        renderCard({ isAdmin: false });

        await expect(
            user.click(screen.getByRole('button', { name: /view template/i }))
        ).resolves.not.toThrow();
    });

    it('does not call onEdit or onDelete when only the card body is clicked', async () => {
        const onEdit   = jest.fn();
        const onDelete = jest.fn();
        const user = userEvent.setup();
        renderCard({ isAdmin: true, onEdit, onDelete });

        // Click the title text — not a button
        await user.click(screen.getByText('NDA Agreement'));

        expect(onEdit).not.toHaveBeenCalled();
        expect(onDelete).not.toHaveBeenCalled();
    });
});
