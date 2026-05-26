# History, Termination & Terminated Page — UI Documentation

## Overview

This document covers the complete feature set for contract history tracking, contract termination, the terminated contracts page, and the shimmer loading system used across the app.

---

## 1. Contract History Panel

**File:** [src/components/contracts/ContractHistoryPanel.tsx](src/components/contracts/ContractHistoryPanel.tsx)

### What it does

The `ContractHistoryPanel` shows the full renewal chain for a contract — past versions, the current version, and any upcoming/in-progress renewals — in a lightweight popup. Users open it from the History button on a contract card.

### Responsive behavior

| Breakpoint | Renders as |
|---|---|
| Desktop (`sm` and above) | MUI `Popover` anchored to the History button (360px wide, max 520px tall) |
| Mobile (below `sm`) | MUI `Drawer` from the bottom (85vh, rounded top corners) |

### Props

```typescript
interface ContractHistoryPanelProps {
    open: boolean;                          // Whether the panel is visible
    anchorEl: HTMLElement | null;           // Anchor element for the popover (desktop only)
    onClose: () => void;                    // Called when the panel should close
    contractId: string;                    // The contract whose chain to load
    currentContractId: string;             // Used to highlight the "current" entry
    onSelectEntry: (entry: HistoryEntry) => void; // Called when user clicks "View details"
}
```

### HistoryEntry interface (exported)

```typescript
export interface HistoryEntry {
    id: string;
    title: string;
    startDate: string | null;
    endDate: string | null;
    status: string;
    createdAt: string | null;
    finalizedAt: string | null;
    renewedFromId: string | null;
    renewedContractId: string | null;
    renewalStatus: string | null;
    renewalStartDate: string | null;
    renewalNotes: string | null;
    client: string;
    category: string;
    templateName: string;
    createdBy: string;
    externalSigners: { email: string; partyLabel: string; status: string; completedAt: string | null }[];
    internalSigners: { email: string; partyLabel: string; status: string; completedAt: string | null }[];
}
```

### Data fetching

When `open` becomes `true`, the panel calls `GET /api/contracts/{contractId}/history`. The result is the full bidirectional chain of contract versions sorted by `startDate` ascending. Loading state shows a MUI `Skeleton` list (3 placeholder rows: circular icon + text lines).

### Entry classification (`classifyEntry`)

Each chain entry is classified as one of three states:

| State | Badge label | Condition |
|---|---|---|
| `current` | `● Current` | `entry.id === currentContractId`, OR the entry is the chain head (`no renewedContractId`) and is `terminated` |
| `upcoming` | `◷ Upcoming` | Status is in `[draft, in_review, in_approval, approved, ready_for_signature, waiting_for_signature, signed, signed_by_everyone]`, OR `startDate` is in the future |
| `past` | `○ Past` | Everything else |

### Status chip colors

The panel uses two color maps (`STATUS_CONFIG_LIGHT` / `STATUS_CONFIG_DARK`) to theme each status chip. The theme is detected via `theme.palette.mode`. All statuses present in the system are mapped:

| Status | Light mode color | Dark mode color |
|---|---|---|
| `active` | Green | Translucent green |
| `expiring` | Amber | Translucent amber |
| `expired` | Red | Translucent red |
| `signed` / `signed_by_everyone` | Blue | Translucent blue |
| `waiting_for_signature` | Purple | Translucent purple |
| `ready_for_signature` | Light blue | Translucent light blue |
| `approved` | Green | Translucent green |
| `in_review` / `in_approval` | Amber | Translucent amber |
| `draft` | Gray | Translucent gray |
| `terminated` | Slate | Translucent slate |

### Entry card interaction

Each entry in the chain renders as a card row with:
- Kind badge (current / upcoming / past) in the top-left
- Status chip in the top-right
- Contract title (Renewal suffix stripped via regex)
- Date range (`DD/MM/YYYY → DD/MM/YYYY`)
- `View details` link (opens `ContractHistoryDialog`)

Clicking anywhere on the row, or the "View details" link, calls `onSelectEntry(entry)` and closes the panel.

**Visual distinction for current entry:** highlighted border using the theme primary color; slightly tinted background.

### Loading / error / empty states

| State | What renders |
|---|---|
| Loading | 3 MUI `Skeleton` rows (circular + text blocks) |
| Error | Centered error message in `color="error"` |
| Empty | `EmptyState` component (compact) with `HistoryIcon` and "No history yet." |

---

## 2. Contract History Dialog

**File:** [src/components/contracts/ContractHistoryDialog.tsx](src/components/contracts/ContractHistoryDialog.tsx)

### What it does

`ContractHistoryDialog` is a modal dialog that shows the full details for a single history chain entry selected from the panel. It also lets the user open the contract's PDF in a full-screen viewer.

### Props

```typescript
interface ContractHistoryDialogProps {
    open: boolean;
    onClose: () => void;
    entry: HistoryEntry | null;    // null causes the dialog to render nothing
    currentContractId: string;     // Used to compute the version label
}
```

### Version label

The dialog header strips the `(Renewal N)` suffix from the title and computes a kind label:

| Condition | Kind label |
|---|---|
| `entry.id === currentContractId` | `Current Version` |
| Status is in the upcoming list | `Upcoming Version` |
| Otherwise | `Past Version` |

### Dialog layout

1. **Header** — Gradient background (`primary.dark → primary.main`), contract title, close button
2. **Period banner** — Date range (`startDate → endDate`) with calendar icon
3. **Details row** — Client, Category, Finalization date shown in an `InfoRow` grid with a tinted background
4. **Renewal notes** — Shown if present
5. **Signers section** — All internal + external signers combined into one list. Each signer row shows:
   - Green `CheckCircleIcon` (completed) or amber `HourglassEmptyIcon` (pending)
   - Email and party label
   - Completion date (if present)
6. **Document section** — Clickable PDF card that opens the full-screen `DocumentViewerDialog`

### PDF viewer

Uses `DocumentViewerDialog` (lazily loaded via `next/dynamic`, SSR disabled). The file is fetched from `/api/file/{entry.id}?type=contract`. The viewer opens in `readOnly` mode with `currentUserRole="contractor"`.

---

## 3. Terminate Contract Dialog

**File:** [src/components/contracts/TerminateContractDialog.tsx](src/components/contracts/TerminateContractDialog.tsx)

### What it does

A confirmation dialog that permanently archives a contract as `terminated`. Only available for `expired` contracts.

### Props

```typescript
interface TerminateContractDialogProps {
    open: boolean;
    onClose: () => void;
    contractId: string;
    contractTitle: string;   // Clean base title — no Renewal suffix
    onSuccess: () => void;   // Called after successful termination
}
```

### Dialog content

- Intro text: `"You are about to permanently terminate: [contractTitle]"`
- Warning box (red-tinted) with `WarningAmberRoundedIcon`:
  > "This action cannot be undone. The contract will be permanently archived as terminated."
- MUI `Alert` shown only if the API call returns an error

### Actions

| Button | Behavior |
|---|---|
| Cancel (outlined) | Closes dialog; disabled while `loading` |
| Terminate (red contained) | Calls the terminate API; shows "Terminating…" while in progress |

The dialog cannot be closed (backdrop click or Cancel) while the API request is in progress (`disableBackdropClick={loading}`).

### API call

```
POST /api/contracts/{contractId}/terminate
Body: { terminatedBy: string }   // current user email from authService
```

On success, calls `onSuccess()` then closes. On API error, shows the error message inline.

### Theme-aware colors

| Mode | Terminate button color | Hover color |
|---|---|---|
| Light | `#dc2626` | `#b91c1c` |
| Dark | `#7f1d1d` | `#991b1b` |

---

## 4. Terminated Contracts Page

**File:** [src/app/terminated/page.tsx](src/app/terminated/page.tsx)

### What it does

Displays a filterable, searchable grid of all terminated contracts owned by the currently logged-in user.

### Smart filtering logic

Only top-level terminated contracts are shown. If a renewal contract is terminated but its parent is also terminated, only the parent appears. Implementation:

```typescript
const terminated = allContracts.filter(c => {
    if (c.createdBy !== currentUser.email) return false;
    if (c.status !== ContractStatus.TERMINATED) return false;
    if (c.renewedFromId) {
        const parentStatus = statusById.get(c.renewedFromId);
        return parentStatus !== ContractStatus.TERMINATED;
    }
    return true;
});
```

### Filters

Implemented via the `CompactFilter` component:

| Filter | Type | Notes |
|---|---|---|
| Search | Text input | Matches `title` and `client` (case-insensitive) |
| Category | Multi-select | Options from `categoryService.getAllCategories()` |
| Termination date range | Date range picker | Filters by `contract.terminatedAt`; toggled by "Advanced Filters" |

The active filter badge shows `{filteredCount} / {totalCount} contracts`.

### Loading state

While `loading === true`, renders `<ShimmerCardGrid count={8} variant="contract" />` — 8 animated shimmer placeholder cards in the same grid layout.

### Empty state

| Condition | Title | Description |
|---|---|---|
| No contracts (no filters) | `t('noContracts')` | `t('appearHere')` |
| No contracts (filters active) | `t('noContractsFiltered')` | `t('tryAdjusting')` |

Uses `EmptyState` component with `BlockOutlinedIcon`.

### Card layout

Responsive grid:

| Breakpoint | Columns |
|---|---|
| `xs` | 1 |
| `sm` | 2 |
| `lg` | 4 |

### Dialogs wired up

| Dialog | Trigger |
|---|---|
| `ContractHistoryPanel` | `onHistory` callback from `ContractCard` (variant="terminated") |
| `ContractHistoryDialog` | `onSelectEntry` from panel — stores selected `HistoryEntry` in state |
| `DeleteContractDialog` | `onDelete` callback from `ContractCard` |

---

## 5. Terminate API Route

**File:** [src/app/api/contracts/[id]/terminate/route.ts](src/app/api/contracts/[id]/terminate/route.ts)

**Endpoint:** `POST /api/contracts/{id}/terminate`

### Request body

```typescript
{ terminatedBy: string }   // email of user performing termination
```

### Validation rules (in order)

| Rule | HTTP status if violated |
|---|---|
| Valid ObjectId format | 400 |
| Valid JSON body | 400 |
| `terminatedBy` is a non-empty string | 400 |
| Contract must exist | 404 |
| Already terminated → idempotent success | 200 (`alreadyTerminated: true`) |
| Contract status must be `expired` | 400 |
| No active renewal in progress (`renewalStatus !== 'in_progress'`) | 409 |

### What gets written to MongoDB

```javascript
$set: {
    status: 'terminated',
    terminatedAt: now,        // ISO timestamp
    terminatedBy: email,
    updatedAt: now,
}
$unset: {
    renewalStatus: '',        // prevents stale "Renewal in Progress" bleed
    renewedContractId: '',
}
```

### Success response

```json
{ "success": true }
```
HTTP 201.

---

## 6. History API Route

**File:** [src/app/api/contracts/[id]/history/route.ts](src/app/api/contracts/[id]/history/route.ts)

**Endpoint:** `GET /api/contracts/{id}/history`

### What it returns

The full bidirectional renewal chain for a contract, sorted by `startDate` ascending. Drafts/upcoming versions (no `startDate`) are sorted to the end.

### Chain walking algorithm

Starting from the given contract ID:

1. **Walk backward** — follow `renewedFromId` links until there is no more parent or a cycle is detected (`visited` set)
2. **Walk forward** — follow `renewedContractId` links until there is no more child or a cycle is detected

Both directions use the same `visited` set to prevent infinite loops.

### Lightweight projection

To keep responses fast, these fields are excluded from every document fetched:

```
pdf, fileData, formFields, fieldValues, xfdfData, signedPdfBase64, templateDocxBase64, content
```

### Effective status computation

Raw status is adjusted for `signed`, `active`, `expiring`, and `expired` statuses based on today's date:

| Condition | Effective status |
|---|---|
| `endDate` is in the past | `expired` |
| `endDate` is within 60 days | `expiring` |
| `startDate` has passed | `active` |
| `startDate` is in the future | `signed` |

Non-date-driven statuses (`draft`, `in_review`, `terminated`, etc.) are returned as-is.

### Response shape

```typescript
{
    success: true,
    chain: HistoryEntry[]   // sorted by startDate ASC; no-date entries last
}
```

---

## 7. Shimmer Loading System

**File:** [src/components/common/ShimmerCard.tsx](src/components/common/ShimmerCard.tsx)

### What it does

Provides animated skeleton placeholder cards used while contract/template data is loading. Uses a horizontal gradient sweep animation (`shimmer` keyframes) driven by theme tokens.

### Animation

```css
@keyframes shimmer {
    0%   { background-position: -400px 0; }
    100% { background-position:  400px 0; }
}
```

Applied as a `linear-gradient(90deg, base 25%, highlight 50%, base 75%)` with `backgroundSize: 800px` and `animation: 1.5s ease-in-out infinite`.

Theme tokens used: `theme.shimmer.base` (the resting color) and `theme.shimmer.highlight` (the sweep highlight).

### ShimmerBlock (internal primitive)

All shimmer cards are built from `ShimmerBlock`, a single animated block:

```typescript
ShimmerBlock({ width, height, borderRadius, mb })
```

### Exported components

| Export | Usage |
|---|---|
| `ShimmerCard` | Single card; `variant="contract"` (default) or `variant="template"` |
| `ShimmerCardGrid` | Grid of `count` cards (default 8); same `variant` prop — **used by Terminated page** |
| `ReviewApprovalShimmerGrid` | Grid for review/approval list page |
| `ContractDetailShimmer` | Full-page skeleton for the contract detail view |

### ContractShimmer layout (variant="contract")

Mimics the real `ContractCard` layout:
- Row: wide title block + narrow status chip
- One full-width description line
- 3-column grid of label+value pairs

### How the Terminated page uses it

```tsx
{loading ? (
    <ShimmerCardGrid count={8} variant="contract" />
) : ...}
```

8 shimmer cards render in the same 1/2/4-column responsive grid as the real cards, so the layout does not shift when data arrives.

---

## 8. Sidebar

**File:** [src/components/layout/Sidebar.tsx](src/components/layout/Sidebar.tsx)

### What it does

The application's primary navigation rail. Collapsible on desktop; a temporary overlay drawer on mobile.

### Props

```typescript
interface SidebarProps {
    open: boolean;           // Desktop expanded/collapsed state
    onToggle: () => void;    // Toggle desktop collapse
    mobileOpen: boolean;     // Mobile drawer open state
    onMobileToggle: () => void;
}
```

### Menu items

| Item | Icon | Path | Visibility |
|---|---|---|---|
| Overview | `GridViewOutlinedIcon` | `/overview` | Always |
| Inbox | `DraftsIcon` | `/inbox` | Always |
| Template | `DescriptionOutlinedIcon` | `/template` | Admin only |

Several items are commented out (dashboard, all-contracts, contracts, signatures, review-approval) but their icons are still imported.

### Dimensions

| State | Width |
|---|---|
| Desktop collapsed | 56px |
| Desktop expanded | 220px |
| Mobile drawer | 220px |

Width transition uses `theme.transitions.create('width', sharp, enteringScreen)`.

### Persistence

`open` state is written to `localStorage` key `sidebarOpen` on every change so the expanded/collapsed preference survives page reloads.

### Theme-aware styling

The sidebar detects two "modes":

- **Dashboard mode** (`pathname === '/dashboard'`): uses `palette` tokens — translucent primary tints for selected items, `background.default` for the rail
- **Sidebar mode** (all other pages): uses `theme.sidebar.*` design tokens for background, selected/hover/unselected colors, font weights, and gradients

In **dark mode**, the sidebar always renders in dashboard mode for visual consistency (`effectiveIsDashboard = isDashboard || isDarkMode`).

### Active item styling

A selected menu item gets:
- Background: `selectedBg` (tinted primary or sidebar token)
- Left accent bar (3px wide, `::before` pseudo-element) using `accentBarBg`
- On dark sidebar theme: shine sweep animation on hover (`::after` pseudo-element, `left: -75% → 130%` on hover)

### Responsive variants

| Mode | MUI Drawer variant | Breakpoint |
|---|---|---|
| Mobile | `temporary` | `xs → md` |
| Desktop | `permanent` | `md+` |

The mobile drawer sits below the app topbar (`top: 40px`, `height: calc(100% - 40px)`). It closes automatically after navigating (`handleNavigation` calls `onMobileToggle` on mobile).

Collapsed items show a MUI `Tooltip` on the right with the item label as the only text.

---

## Component Interaction Map

```
TerminatedContractsPage
├── CompactFilter              ← search, category, date range filters
├── ShimmerCardGrid            ← loading skeleton (8 cards, contract variant)
├── ContractCard (terminated)
│   ├── onHistory callback     → opens ContractHistoryPanel
│   └── onDelete callback      → opens DeleteContractDialog
├── ContractHistoryPanel       ← popover / bottom drawer
│   └── onSelectEntry callback → opens ContractHistoryDialog
├── ContractHistoryDialog      ← entry detail modal
│   └── DocumentViewerDialog   ← full-screen PDF viewer
└── DeleteContractDialog       ← permanent deletion confirmation

ContractCard (contract variant, main contracts page)
└── Terminate button           → opens TerminateContractDialog
    └── POST /api/contracts/{id}/terminate

ContractHistoryPanel
└── GET /api/contracts/{id}/history

Sidebar
└── Persistent nav (localStorage sidebarOpen)
```

---

## Key Data Fields on the `Contract` Document

| Field | Type | Set by |
|---|---|---|
| `status` | string | Workflow; set to `'terminated'` by terminate API |
| `terminatedAt` | ISO string | Terminate API |
| `terminatedBy` | string (email) | Terminate API |
| `renewedFromId` | ObjectId string | Renewal creation |
| `renewedContractId` | ObjectId string | Renewal creation; unset by terminate API |
| `renewalStatus` | string | Renewal workflow; unset by terminate API |
