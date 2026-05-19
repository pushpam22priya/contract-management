# Overview Page — Technical Documentation

**Route:** `/overview`  
**Version:** 2.0  
**Last updated:** 2026-05-15  
**Status:** Production

---

## Table of Contents

1. [Purpose & Scope](#1-purpose--scope)
2. [File Structure](#2-file-structure)
3. [Architecture Overview](#3-architecture-overview)
4. [Component Reference](#4-component-reference)
   - 4.1 [page.tsx — Route Entry Point](#41-pagetsx--route-entry-point)
   - 4.2 [OverviewContent — Layout Orchestrator](#42-overviewcontent--layout-orchestrator)
   - 4.3 [OverviewSideTabs — Edge Tab Triggers](#43-overviewsidetabs--edge-tab-triggers)
   - 4.4 [OverviewDrawer — Side Panel](#44-overviewdrawer--side-panel)
   - 4.5 [useOverviewStats — Data Hook](#45-useoverviewstats--data-hook)
   - 4.6 [ContractsContent — Shared Contracts UI](#46-contractscontent--shared-contracts-ui)
5. [Data Flow](#5-data-flow)
6. [Layout & Responsive Behavior](#6-layout--responsive-behavior)
7. [Navigation & Routing](#7-navigation--routing)
8. [Theming & Styling](#8-theming--styling)
9. [Internationalisation](#9-internationalisation)
10. [Sidebar Integration](#10-sidebar-integration)
11. [Type Definitions](#11-type-definitions)
12. [Key Design Decisions](#12-key-design-decisions)
13. [Known Constraints & Extension Points](#13-known-constraints--extension-points)

---

## 1. Purpose & Scope

The Overview page (`/overview`) is a unified workspace that gives users a complete operational view of their contract portfolio without switching pages. It combines:

- The full **Contracts & Teams management UI** (team grid → contract list → contract detail navigation)
- A **contextual side panel** (drawer) for at-a-glance dashboard stats, active contracts, and expiring contracts — all accessible without leaving the contracts view

The page was designed to eliminate the context-switching cost of moving between the `/dashboard` and `/contracts` routes. Neither of those two existing pages was modified in terms of functionality; the Overview page is an independently maintained route that reuses their shared logic.

---

## 2. File Structure

```
src/
├── app/
│   └── overview/
│       └── page.tsx                      ← Next.js App Router route entry point
│
├── components/
│   ├── contracts/
│   │   └── ContractsContent.tsx          ← Shared full contracts UI (used by both
│   │                                        /contracts and /overview)
│   └── overview/
│       ├── OverviewContent.tsx           ← Layout orchestrator; owns tab/drawer state
│       ├── OverviewSideTabs.tsx          ← Icon-only edge trigger buttons
│       ├── OverviewDrawer.tsx            ← Sliding side panel (stats / active / expiring)
│       └── useOverviewStats.ts           ← Single-fetch stats hook + contract arrays
│
└── components/layout/
    └── Sidebar.tsx                       ← Added "Overview" nav entry

translations/
├── en.json                               ← nav.overview = "Overview"
└── hi.json                               ← nav.overview = "अवलोकन"

docs/
└── overview-page.md                      ← This document
```

---

## 3. Architecture Overview

### High-level layout (desktop)

```
┌─ AppLayout (header + sidebar) ─────────────────────────────────────────┐
│                                                                         │
│  ┌─ OverviewContent (display: flex, height: 100%) ──────────────────┐  │
│  │                                                                   │  │
│  │  ┌─ ContractsContent (flex: 1) ──────────────────────┐           │  │
│  │  │                                                    │           │  │
│  │  │   Teams grid / Contract list / Filters / Dialogs  │           │  │
│  │  │                                                    │  ┌──────┐ │  │
│  │  │                          [position: absolute]──────┼─►│ Tab  │ │  │
│  │  │                          OverviewSideTabs          │  │ Tab  │ │  │
│  │  │                          (right: 0, zIndex: 2)     │  │ Tab  │ │  │
│  │  └────────────────────────────────────────────────────┘  └──────┘ │  │
│  │                                                                   │  │
│  │  ┌─ OverviewDrawer (width: 0 → 260px, flex child) ─┐             │  │
│  │  │  Header | Tab switcher bar | Scrollable content  │             │  │
│  │  └──────────────────────────────────────────────────┘             │  │
│  └───────────────────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────────────┘
```

### State machine

```
activeTab: null
  │
  ├─ user clicks tab button (OverviewSideTabs)
  │     activeTab = 'stats' | 'active' | 'expiring'
  │     → tab buttons hidden
  │     → OverviewDrawer expands (width 0 → 260px)
  │     → contracts area shrinks via flex
  │
  ├─ user switches tab inside drawer (OverviewDrawer tab bar)
  │     activeTab changes but drawer stays open
  │
  └─ user clicks close (×) or backdrop (mobile)
        activeTab = null
        → OverviewDrawer collapses (width 260px → 0)
        → tab buttons reappear
        → contracts area returns to full width
```

---

## 4. Component Reference

### 4.1 `page.tsx` — Route Entry Point

**Path:** `src/app/overview/page.tsx`

A minimal Next.js App Router page. Its only responsibility is applying `AppLayout` (the shared header + sidebar shell) and rendering `OverviewContent` as the sole child. No logic or state lives here.

```tsx
export default function OverviewPage() {
    return (
        <AppLayout>
            <OverviewContent />
        </AppLayout>
    );
}
```

**Notes:**
- The `'use client'` directive is required because `OverviewContent` and its children are client components.
- `AppLayout` does **not** accept a `fullHeight` prop — do not add it.

---

### 4.2 `OverviewContent` — Layout Orchestrator

**Path:** `src/components/overview/OverviewContent.tsx`

The root component of the feature. It owns the single piece of shared state (`activeTab`) and composes the three sub-components into a flex-row layout.

#### State

| State | Type | Default | Description |
|-------|------|---------|-------------|
| `activeTab` | `TabId \| null` | `null` | Which drawer panel is open. `null` means the drawer is closed. |

#### Derived values

| Variable | Derivation | Purpose |
|----------|-----------|---------|
| `isDrawerOpen` | `activeTab !== null` | Controls tab button visibility and mobile backdrop |
| `isMobile` | `useMediaQuery(theme.breakpoints.down('md'))` | Switches between push-drawer (desktop) and overlay-drawer (mobile) |

#### Layout structure

```tsx
<Box display="flex" height="100%" overflow="hidden">

  {/* 1. Contracts layer */}
  <Box flex={1} overflow="hidden" position="relative">
    <ContractsContent basePath="/overview" />

    {/* 2. Tab trigger buttons — absolutely positioned, hidden when drawer is open */}
    {!isDrawerOpen && (
      <Box position="absolute" right={0} top="50%" zIndex={2}>
        <OverviewSideTabs ... />
      </Box>
    )}
  </Box>

  {/* 3. Mobile backdrop */}
  {isMobile && <Backdrop open={isDrawerOpen} onClick={close} />}

  {/* 4. Drawer — flex child on desktop, absolute on mobile */}
  <OverviewDrawer activeTab={activeTab} onClose={close} onTabChange={setActiveTab} ... />

</Box>
```

#### Behaviour by breakpoint

| Breakpoint | Drawer mode | Tab buttons position |
|------------|-------------|----------------------|
| `≥ md` (desktop) | Flex child — pushes `ContractsContent` left | `position: absolute` inside the contracts Box |
| `< md` (mobile) | `position: absolute` right edge — overlays content | Same; hidden when drawer is open |

---

### 4.3 `OverviewSideTabs` — Edge Tab Triggers

**Path:** `src/components/overview/OverviewSideTabs.tsx`

Renders three icon-only pill buttons anchored to the right edge of the contracts area. They are the entry point for opening the drawer. When the drawer is open, these buttons are unmounted — navigation between panels is handled by the tab bar inside the drawer instead.

#### Exported types

```ts
export type TabId = 'stats' | 'active' | 'expiring';
```

`TabId` is exported from this file and imported by both `OverviewContent` and `OverviewDrawer` to share a single source of truth for the union type.

#### Props

| Prop | Type | Required | Description |
|------|------|----------|-------------|
| `activeTab` | `TabId \| null` | Yes | Currently active tab (used for active styling) |
| `stats` | `OverviewStats` | Yes | Provides counts (currently unused in buttons; available for future badge use) |
| `onTabChange` | `(tab: TabId \| null) => void` | Yes | Called with the tab id on click; passes `null` if the active tab is clicked again (toggle close) |

#### Tab definitions

| Tab id | Icon | Color |
|--------|------|-------|
| `stats` | `BarChartIcon` | `theme.palette.primary.main` (adapts to active theme) |
| `active` | `BoltOutlinedIcon` | `#10b981` (emerald) |
| `expiring` | `WarningAmberIcon` | `#f59e0b` (amber) |

Labels come from `useTranslations('dashboard')`:  `t('title')`, `t('activeContracts')`, `t('expiringSoon')`. Labels are only shown in the MUI `Tooltip` — not rendered in the button itself.

#### Visual behaviour

- **Shape:** `borderRadius: '8px 0 0 8px'` — rounded on the left (protruding into the content area), flush with the right edge (no right border, `borderRight: 'none'`).
- **Hover:** translates 4px left (`transform: translateX(-4px)`) and increases box shadow — gives a tactile "pull-out" feel.
- **Active state:** filled with the tab's accent color; `color: #fff`; elevated shadow.
- **Inactive state (light):** `alpha(color, 0.09)` tinted background; colored border at 30% opacity.
- **Inactive state (dark):** `alpha(color, 0.14)` tinted background.

---

### 4.4 `OverviewDrawer` — Side Panel

**Path:** `src/components/overview/OverviewDrawer.tsx`

A flex-child panel that slides in from the right by animating its `width` property. It contains three sections of content switchable via an internal tab bar.

#### Constants

```ts
const DRAWER_WIDTH = 260; // px
```

#### Props

| Prop | Type | Required | Description |
|------|------|----------|-------------|
| `activeTab` | `TabId \| null` | Yes | Determines which content panel is shown. `null` collapses the drawer to `width: 0`. |
| `stats` | `OverviewStats` | Yes | Provides all counts and contract arrays for display |
| `onClose` | `() => void` | Yes | Called when the × button is clicked |
| `onTabChange` | `(tab: TabId) => void` | Yes | Called by the internal tab switcher bar to change the active panel |

#### Width transition

```css
width: isOpen ? 260px : 0;
transition: width 0.35s cubic-bezier(0.4, 0, 0.2, 1);  /* Material standard ease */
overflow: hidden;
```

`minWidth: DRAWER_WIDTH` is set on all internal rows (header, tab bar, scroll body) so content does not collapse or wrap during the width transition — it is clipped cleanly by the outer `overflow: hidden`.

#### Internal structure

```
OverviewDrawer (Box, width-animated)
│
├── Header row
│     ├── Active tab label (Typography)
│     └── Close button (IconButton → CloseIcon)
│
├── Tab switcher bar (3 equal-width columns)
│     ├── Dashboard tab  (BarChartIcon + label + underline indicator)
│     ├── Active tab     (BoltOutlinedIcon + badge count + label)
│     └── Expiring tab   (WarningAmberIcon + badge count + label)
│
└── Scrollable content (flex: 1, overflowY: auto)
      ├── [stats]    8 stat rows
      ├── [active]   Active contract list
      └── [expiring] Expiring contract list
```

#### Content panels

**Stats panel (`activeTab === 'stats'`)**

Renders 8 rows, one per contract lifecycle stage:

| Row | Label key | Color | Navigation target |
|-----|-----------|-------|-------------------|
| Draft | `dashboard.draft` | `#57a8de` | `/draft?status=draft` |
| In Progress | `dashboard.inProgress` | `#ed3a88` | `/draft?title=In+Progress&status=...` |
| Send for Signature | `dashboard.sendForSignature` | `#7c3aed` | `/contracts?status=waiting_for_signature` |
| Waiting for My Signature | `dashboard.waitingForMySignature` | `#e1781d` | `/signatures?status=pending` |
| Signed Contracts | `dashboard.signedContracts` | `#2563eb` | `/contracts?status=signed_by_everyone` |
| Active Contracts | `dashboard.activeContracts` | `#10b981` | `/contracts?status=active` |
| Expiring Soon | `dashboard.expiringSoon` | `#f59e0b` | `/contracts?status=expiring` |
| Expired | `dashboard.expired` | `#ef4444` | `/contracts?status=expired` |

Each row: `28×28px` rounded icon badge + label + count. On hover, the row background tints to the row's color and the count number adopts the same color (via the `.overview-count` CSS class target).

**Active panel (`activeTab === 'active'`)**

Renders `stats.activeContracts` as a scrollable list of `ContractListItem` components with an emerald (`#10b981`) accent. Shows an empty-state illustration if the array is empty. Clicking an item navigates to `/contracts/[id]`.

**Expiring panel (`activeTab === 'expiring'`)**

Identical structure to the Active panel but renders `stats.expiringContracts` with an amber (`#f59e0b`) accent.

#### `ContractListItem` (internal sub-component)

Each contract card in the Active and Expiring panels renders:
- `contract.title` — bold, truncated
- `contract.client` — secondary caption, truncated (omitted if empty)
- `contract.expiresInDays` — compact coloured badge (e.g. "14d left"); omitted if `undefined`
- A 3px left accent bar in the panel's accent color

#### Shadow

```css
/* Light mode */
box-shadow: -4px 0 12px rgba(0, 0, 0, 0.06);

/* Dark mode */
box-shadow: -4px 0 16px rgba(0, 0, 0, 0.4);
```

Shadow is applied only when `isOpen === true` and casts leftward (negative x-offset) to give the drawer visual separation from the contracts content beneath it.

---

### 4.5 `useOverviewStats` — Data Hook

**Path:** `src/components/overview/useOverviewStats.ts`

A custom React hook that performs a single call to `contractService.getAllContracts()` on mount, computes 9 counters and 2 contract arrays from the result, and exposes them through a stable interface. It is called once in `OverviewContent` and the result is passed as props to all child components — no child makes its own API call.

#### Interface

```ts
export interface OverviewStats {
    // Counters (creator-scoped)
    draftCount:          number;
    underReviewCount:    number;
    underApprovalCount:  number;
    activeCount:         number;
    expiringCount:       number;
    expiredCount:        number;
    requestedCount:      number;
    receivedSignedCount: number;
    waitingForSigCount:  number;

    // Contract arrays (for Active and Expiring drawer panels)
    activeContracts:     Contract[];
    expiringContracts:   Contract[];

    // Meta
    loading:  boolean;
    refresh:  () => void;  // Re-runs the API call and recomputes all values
}
```

#### Counting rules

A contract is included in the counts only if the current authenticated user is one of:

- **Creator** — `contract.createdBy === currentUser.email`
- **Unlocked internal signer** — present in `contract.internalSigners[]` with `status === 'unlocked'`
- **Legacy single signer** — `contract.signer?.email === currentUser.email`

**Counter breakdown:**

| Counter | Condition |
|---------|-----------|
| `draftCount` | Creator; status `DRAFT` |
| `underReviewCount` | Creator; status `IN_REVIEW` or `REVIEW_APPROVAL` |
| `underApprovalCount` | Creator; status `IN_APPROVAL` or `REVIEWED` |
| `activeCount` | Creator; status `ACTIVE` |
| `expiringCount` | Creator; status `EXPIRING` |
| `expiredCount` | Creator; status `EXPIRED` **and** not superseded (see below) |
| `requestedCount` | Creator; status `WAITING_FOR_SIGNATURE` |
| `receivedSignedCount` | Creator; status `SIGNED_BY_EVERYONE` |
| `waitingForSigCount` | Unlocked internal signer **or** legacy signer while status `WAITING_FOR_SIGNATURE` |

**Superseded-chain exclusion (expiredCount):**  
An expired contract is excluded from `expiredCount` when it has a `renewedContractId` whose status has progressed beyond draft — specifically any of: `APPROVED`, `READY_FOR_SIGNATURE`, `WAITING_FOR_SIGNATURE`, `SIGNED_BY_EVERYONE`, `SIGNED`, `ACTIVE`, `EXPIRING`, `EXPIRED`, `TERMINATED`. This mirrors the identical logic on the `/dashboard` and `/contracts` pages.

**`activeContracts` and `expiringContracts` arrays:**  
Collected for any contract where the user is creator, an unlocked internal signer, or a legacy signer with a valid signed/active/expiring/expired status — broader than the creator-only counting scope, to ensure signers see their own relevant contracts in these lists.

#### Loading state

`loading` is `true` until the first API call completes. The hook silently swallows errors (stats are non-critical; a failed fetch leaves all counters at `0`).

#### `refresh()`

Calling `stats.refresh()` re-executes `loadStats`, re-fetching from the API and recomputing all counters and arrays. Useful after mutations (contract creation, status change).

---

### 4.6 `ContractsContent` — Shared Contracts UI

**Path:** `src/components/contracts/ContractsContent.tsx`

The complete contracts page UI extracted into a standalone component. It contains all state, handlers, filters, dialogs, team grid, and contract card list that exist on the `/contracts` page. It is used by both `OverviewContent` (via `basePath="/overview"`) and `src/app/contracts/page.tsx` (via the default `basePath="/contracts"`).

#### Props added for Overview integration

| Prop | Type | Default | Description |
|------|------|---------|-------------|
| `basePath` | `string` | `'/contracts'` | Base URL used for internal navigation. Overriding this ensures team clicks, back buttons, and breadcrumbs navigate within the current route rather than jumping to `/contracts`. |

#### Navigation calls that respect `basePath`

| UI action | Navigation before | Navigation now (overview) |
|-----------|------------------|--------------------------|
| Click a team card | `router.push('/contracts?team=xxx')` | `router.push('/overview?team=xxx')` |
| Click back arrow (from team view) | `router.push('/contracts')` | `router.push('/overview')` |
| Click breadcrumb "Contracts" (team view) | `router.push('/contracts')` | `router.push('/overview')` |
| Click breadcrumb "Contracts" (flat view) | `router.push('/contracts')` | `router.push('/overview')` |

**Contract detail navigation** (`router.push('/contracts/[id]')`) is intentionally **not** overridden — it navigates to the standalone contract detail page regardless of which base page the user came from.

#### URL parameter handling

`ContractsContent` reads `?team=` and `?status=` from the URL via `useSearchParams()`. Since `/overview` supports these parameters, all deep-link navigation works identically on the overview route:

- `/overview?team=abc123` — opens team `abc123` directly
- `/overview?status=active` — opens the flat active-contracts view directly

---

## 5. Data Flow

```
OverviewContent
│
├── useOverviewStats()
│     └── contractService.getAllContracts()   [single API call on mount]
│           ↓ returns OverviewStats
│           { counts×9, activeContracts[], expiringContracts[], loading, refresh }
│
├── activeTab state: TabId | null
│
├── ContractsContent
│     └── basePath="/overview"
│           ├── own data: contractService.getAllContracts()  [independent call]
│           ├── own data: fetch /api/teams
│           └── all internal state (search, filters, dialogs, etc.)
│
├── OverviewSideTabs
│     ├── receives: activeTab, stats, onTabChange
│     └── emits:   onTabChange(TabId | null)
│
└── OverviewDrawer
      ├── receives: activeTab, stats, onClose, onTabChange
      ├── Stats panel → router.push(stat.path)
      ├── Active panel → router.push('/contracts/[id]')
      └── Expiring panel → router.push('/contracts/[id]')
```

> **Note:** `useOverviewStats` and `ContractsContent` both call `contractService.getAllContracts()` independently. This is intentional — they serve different consumers with different filtering needs and different update cycles. A shared cache layer (e.g. SWR or React Query) could consolidate these in a future iteration.

---

## 6. Layout & Responsive Behavior

### Desktop (`≥ md`, i.e. `≥ 900px`)

```
Default (drawer closed):
┌──────────────────────────────────────────────┬──┐
│                                              │  │ ← OverviewSideTabs
│   ContractsContent  (flex: 1, 100% width)   │  │   position: absolute
│                                              │  │   right: 0, zIndex: 2
└──────────────────────────────────────────────┴──┘

Drawer open:
┌─────────────────────────┬──────────────────────┐
│                         │                      │
│  ContractsContent       │   OverviewDrawer     │
│  (flex: 1, shrinks)     │   (width: 260px)     │
│                         │                      │
└─────────────────────────┴──────────────────────┘
```

The `ContractsContent` container is `flex: 1` and has `minWidth: 0`. When the drawer expands, the contracts area shrinks naturally via flexbox — no JavaScript width calculation needed. The drawer is a regular flex sibling.

### Mobile (`< md`, i.e. `< 900px`)

```
Default (drawer closed):
┌──────────────────────────────┬──┐
│                              │  │ ← OverviewSideTabs (absolute)
│   ContractsContent (100%)    │  │
│                              │  │
└──────────────────────────────┴──┘

Drawer open:
┌──────────────────────────────────┐
│   ContractsContent (dimmed)      │ ← Backdrop (rgba 0,0,0,0.35)
│    ┌────────────────────────┐    │
│    │   OverviewDrawer       │    │ ← position: absolute, right: 0
│    │   (width: 260px)       │    │   zIndex: 6
│    └────────────────────────┘    │
└──────────────────────────────────┘
```

On mobile the drawer is rendered inside an `absolute`-positioned wrapper (right: 0) and overlays the contracts content. A `Backdrop` with `position: absolute` sits at `zIndex: 5` between the contracts content and the drawer. Clicking the backdrop closes the drawer.

### Overflow strategy

The root `OverviewContent` Box has `overflow: hidden`. The `ContractsContent` wrapper has `overflow: hidden` too. All scrolling happens inside `ContractsContent` itself and inside the drawer's `flex: 1 / overflowY: auto` body. This prevents any layout-breaking scroll bleed during width transitions.

---

## 7. Navigation & Routing

### URL parameter support

`/overview` supports the same URL parameters as `/contracts`:

| Parameter | Example | Effect |
|-----------|---------|--------|
| `?team=<id>` | `/overview?team=abc123` | Opens the contract list for that team directly |
| `?status=<value>` | `/overview?status=active` | Opens flat filtered view for that status |
| `?search=<query>` | `/overview?search=nda` | Pre-fills the search field |

These are read by `ContractsContent` via `useSearchParams()` and applied on mount.

### Stats panel navigation targets

Clicking a row in the Stats drawer panel navigates **away** from the overview page to the relevant filtered list page. This is intentional — the deep-link target pages (Draft, Signatures, Contracts) have their own dedicated UI for those specific views.

| Panel row | Destination |
|-----------|-------------|
| Draft | `/draft?status=draft` |
| In Progress | `/draft?title=In+Progress&status=draft,in_review,...` |
| Send for Signature | `/contracts?status=waiting_for_signature` |
| Waiting for My Signature | `/signatures?status=pending` |
| Signed Contracts | `/contracts?status=signed_by_everyone` |
| Active Contracts | `/contracts?status=active` |
| Expiring Soon | `/contracts?status=expiring` |
| Expired | `/contracts?status=expired` |

### Contract detail navigation

Clicking a contract in the Active or Expiring panels navigates to `/contracts/[id]` — the standalone contract detail page. This is consistent regardless of the origin page because the detail page is a full-page dedicated route.

---

## 8. Theming & Styling

### MUI theme compliance

All colors, spacing, typography, and border tokens are sourced from the MUI theme via `useTheme()` and the `sx` prop. Hard-coded hex values are used only for the semantic accent colors that are fixed across all themes (emerald `#10b981`, amber `#f59e0b`, and the per-stat-row colors that mirror the dashboard page).

### Dark mode

| Element | Light mode | Dark mode |
|---------|-----------|-----------|
| Drawer background | `background.paper` | `background.paper` |
| Drawer shadow | `rgba(0,0,0,0.06)` | `rgba(0,0,0,0.4)` |
| Tab button bg (inactive) | `alpha(color, 0.09)` | `alpha(color, 0.14)` |
| Stat row hover | `alpha(color, 0.06)` | `alpha(color, 0.10)` |
| Icon badge bg | `alpha(color, 0.10)` | `alpha(color, 0.16)` |
| Contract item hover | `alpha(color, 0.06)` | `alpha(color, 0.10)` |
| Contract item badge bg | `alpha(color, 0.10)` | `alpha(color, 0.18)` |

The `alpha()` opacity values are consistently higher in dark mode to maintain sufficient contrast against dark surfaces, following the same convention used throughout the application.

### Animation timing

| Interaction | Duration | Easing |
|-------------|----------|--------|
| Drawer open/close (width) | `0.35s` | `cubic-bezier(0.4, 0, 0.2, 1)` (Material standard) |
| Tab button hover transform | `0.2s` | `ease` |
| Stat row / contract item hover bg | `0.15s` | `ease` |
| Drawer tab switcher color change | `0.18s` | `ease` |

### Tab button shape

```css
border-radius: 8px 0 0 8px;  /* rounded left, flush right */
border-right: none;           /* no seam at the viewport edge */
```

This creates the visual effect of the button being "attached" to the right wall of the page, with the left side protruding into the content area.

---

## 9. Internationalisation

All user-facing strings use `next-intl`. No string literals are hardcoded in the overview components except the empty-state messages ("No active contracts", "No expiring contracts") — these are candidates for future extraction.

### Translation keys used

| Component | Namespace | Keys |
|-----------|-----------|------|
| `OverviewSideTabs` | `dashboard` | `title`, `activeContracts`, `expiringSoon` |
| `OverviewDrawer` — tab labels | `dashboard` | `title`, `activeContracts`, `expiringSoon` |
| `OverviewDrawer` — stat rows | `dashboard` | `draft`, `inProgress`, `sendForSignature`, `waitingForMySignature`, `signedContracts`, `activeContracts`, `expiringSoon`, `expired` |
| `ContractsContent` | `contracts`, `filters`, `tooltips` | (unchanged from contracts page) |
| `Sidebar` | `nav` | `overview` |

### Sidebar translation additions

| File | Key path | Value |
|------|----------|-------|
| `translations/en.json` | `nav.overview` | `"Overview"` |
| `translations/hi.json` | `nav.overview` | `"अवलोकन"` |

---

## 10. Sidebar Integration

**File:** `src/components/layout/Sidebar.tsx`

One nav item was added to the `menuItems` array, positioned between Dashboard and Contracts:

```ts
{
    text: t('overview'),
    icon: <GridViewOutlinedIcon sx={{ fontSize: 20 }} />,
    path: '/overview',
}
```

The active-state highlight, collapsed-mode tooltip, and left accent bar all work automatically because the item follows the same pattern as every other nav entry. No other changes to `Sidebar.tsx` were required.

---

## 11. Type Definitions

### `TabId`

```ts
// src/components/overview/OverviewSideTabs.tsx
export type TabId = 'stats' | 'active' | 'expiring';
```

Exported from `OverviewSideTabs.tsx` and imported by `OverviewContent.tsx` and `OverviewDrawer.tsx`. Single source of truth — do not redefine it.

### `OverviewStats`

```ts
// src/components/overview/useOverviewStats.ts
export interface OverviewStats {
    draftCount:          number;
    underReviewCount:    number;
    underApprovalCount:  number;
    activeCount:         number;
    expiringCount:       number;
    expiredCount:        number;
    requestedCount:      number;
    receivedSignedCount: number;
    waitingForSigCount:  number;
    activeContracts:     Contract[];
    expiringContracts:   Contract[];
    loading:             boolean;
    refresh:             () => void;
}
```

### `OverviewDrawerProps`

```ts
interface OverviewDrawerProps {
    activeTab:    TabId | null;
    stats:        OverviewStats;
    onClose:      () => void;
    onTabChange:  (tab: TabId) => void;
}
```

### `OverviewSideTabsProps`

```ts
interface OverviewSideTabsProps {
    activeTab:    TabId | null;
    stats:        OverviewStats;
    onTabChange:  (tab: TabId | null) => void;
}
```

Note: `onTabChange` in `OverviewSideTabs` accepts `TabId | null` (clicking an active tab closes the drawer). In `OverviewDrawer`, `onTabChange` only accepts `TabId` — you cannot close the drawer from within the drawer's own tab switcher; only the × button can close it.

### `ContractsContentProps`

```ts
interface ContractsContentProps {
    basePath?: string;  // defaults to '/contracts'
}
```

---

## 12. Key Design Decisions

| Decision | Rationale |
|----------|-----------|
| **Tab buttons as overlays, not flex children** | Eliminates a permanent 40px layout shift on load. The contracts area occupies full width until a tab is clicked; no space is wasted when the drawer is closed. |
| **Tab buttons unmounted when drawer is open** | Avoids two competing navigation surfaces. Once the drawer is open, the internal tab switcher bar handles section switching — having both visible simultaneously would be redundant and confusing. |
| **Width transition on the drawer Box** | Provides a smooth push animation that matches how the app sidebar behaves. Using CSS `transform: translateX()` would have been an overlay effect; `width` change is a true push that gives physical weight to the interaction. |
| **`minWidth: DRAWER_WIDTH` on inner rows** | Content inside the drawer retains its intended width during the 0→260px animation — it is clipped by the outer `overflow: hidden` rather than collapsing or wrapping. |
| **Single `useOverviewStats` call at `OverviewContent` level** | Both `OverviewDrawer` and `OverviewSideTabs` need the same numbers. Lifting the fetch to the parent prevents duplicate API calls and ensures all consumers update simultaneously on `refresh()`. |
| **`basePath` prop on `ContractsContent`** | Allows the shared component to navigate correctly regardless of which page it is embedded in, without any conditional logic inside `ContractsContent` itself. The contracts page passes no prop (defaulting to `/contracts`); the overview page passes `/overview`. |
| **Mobile overlay vs. desktop push** | On small screens a push drawer would squeeze the contracts UI to an unusable width. The `useMediaQuery` check switches the drawer to an absolute-positioned overlay with a dimming backdrop on mobile, consistent with standard mobile UX patterns. |
| **Stats panel navigates away from `/overview`** | The target pages (Draft, Signatures, Contracts) each have full dedicated UIs that the overview drawer cannot replicate. It is more useful to deep-link the user to the correct filtered page than to show a partial view inside the drawer. |

---

## 13. Known Constraints & Extension Points

### Constraints

- **Dual API call:** `useOverviewStats` and `ContractsContent` both call `contractService.getAllContracts()` independently. If API performance becomes a concern, a shared cache (SWR, React Query) should be introduced to deduplicate the fetch.
- **Empty-state strings not translated:** "No active contracts" and "No expiring contracts" inside `OverviewDrawer` are currently hard-coded English strings. They should be added to `translations/*.json` if Hindi or other locale support is required for these messages.
- **Drawer width is a constant:** `DRAWER_WIDTH = 260` is defined as a module-level constant in `OverviewDrawer.tsx`. It is not themeable or responsive at runtime. If a user-resizable drawer is needed, this constant must be replaced with state.
- **`?team=` and `?status=` URL params live on the current route:** When the user clicks a stat row in the drawer (e.g. "Active Contracts"), they navigate to `/contracts?status=active`, not `/overview?status=active`. This is intentional but means the overview URL does not reflect the drawer's stats navigation.

### Extension points

| Feature | How to add |
|---------|-----------|
| **Additional drawer panel** | Add a new `TabId` value to the union in `OverviewSideTabs.tsx`, add the corresponding tab definition in both `OverviewSideTabs` and `OverviewDrawer`, and add a content branch in the drawer's scrollable body. |
| **Badge counts on side-tab buttons** | `OverviewSideTabsProps` already receives `stats`. Add `badgeContent` from `stats.activeCount` / `stats.expiringCount` to the respective tab button `Box` using MUI `Badge`. |
| **Refresh after contract mutation** | Call `stats.refresh()` in `ContractsContent` after any operation that changes contract status. `stats.refresh` is available to any component that receives the `OverviewStats` object. |
| **Persisting the open tab across navigation** | Replace `useState<TabId \| null>(null)` in `OverviewContent` with a URL-param-backed approach (e.g. `?panel=stats`) so the drawer survives browser back/forward navigation. |
| **User-resizable drawer** | Replace `DRAWER_WIDTH` constant with a `drawerWidth` state variable. Add a drag handle at the left edge of the drawer and update `drawerWidth` on `mousemove`. |
