# Team Integration

**Document Type:** Technical Integration Reference
**System:** Contract Management System (CMS)
**Module:** Team Management
**Stack:** Next.js 16 · React 19 · TypeScript · MongoDB (native driver) · MUI v7
**Status:** Production
**Last Updated:** 2026-06-02

---

## Table of Contents

1. [Overview](#1-overview)
2. [Architecture](#2-architecture)
3. [Data Models](#3-data-models)
   - 3.1 [MongoDB Schema](#31-mongodb-schema)
   - 3.2 [TypeScript Interface](#32-typescript-interface)
   - 3.3 [Contract Linkage](#33-contract-linkage)
4. [API Reference](#4-api-reference)
   - 4.1 [List Teams](#41-list-teams)
   - 4.2 [Create Team](#42-create-team)
   - 4.3 [Rename Team](#43-rename-team)
   - 4.4 [Delete Team](#44-delete-team)
5. [Frontend Components](#5-frontend-components)
   - 5.1 [TeamCard](#51-teamcard)
   - 5.2 [CreateTeamDialog](#52-createteamdialog)
   - 5.3 [RenameTeamDialog](#53-renameteamdialog)
6. [Page Integration](#6-page-integration)
   - 6.1 [URL-Based Navigation](#61-url-based-navigation)
   - 6.2 [State Management](#62-state-management)
   - 6.3 [Data Loading](#63-data-loading)
   - 6.4 [Filter Behaviour](#64-filter-behaviour)
   - 6.5 [Header & Action Button Behaviour](#65-header--action-button-behaviour)
   - 6.6 [Event Handlers](#66-event-handlers)
7. [User Flows](#7-user-flows)
   - 7.1 [Create Team](#71-create-team)
   - 7.2 [Rename Team](#72-rename-team)
   - 7.3 [Delete Team](#73-delete-team)
   - 7.4 [Navigate Into a Team](#74-navigate-into-a-team)
8. [Validation Rules](#8-validation-rules)
9. [Error Handling](#9-error-handling)
10. [Business Rules & Constraints](#10-business-rules--constraints)
11. [Known Behaviours & Quirks](#11-known-behaviours--quirks)
12. [File Reference](#12-file-reference)

---

## 1. Overview

The **Team** module provides a folder-like grouping mechanism for contracts within the CMS. Each team is:

- Owned exclusively by the user who created it — no cross-user sharing.
- Used as a navigation layer on the Contracts page: the root view shows a team grid; selecting a team filters contracts to that team.
- Backed by a dedicated `teams` collection in MongoDB and four REST API routes in the Next.js App Router.

Teams are managed entirely through the Contracts page (`/contracts`). There is no standalone teams page. Contracts are assigned to a team at creation time via a `teamId` field on the contract document.

---

## 2. Architecture

```
┌───────────────────────────────────────────────────────────────┐
│                        Browser / React                        │
│                                                               │
│  src/app/contracts/page.tsx  (ContractsPage)                  │
│    │                                                          │
│    ├── TeamCard.tsx          (grid card per team)             │
│    ├── CreateTeamDialog.tsx  (create flow)                    │
│    ├── RenameTeamDialog.tsx  (rename flow)                    │
│    └── ConfirmationDialog    (delete confirmation)            │
│              │                                                │
│              ▼                                                │
│         httpClient.ts        (wraps fetch, base: /api)        │
└──────────────────────┬────────────────────────────────────────┘
                       │  HTTP  (Next.js App Router)
┌──────────────────────▼────────────────────────────────────────┐
│                     API Routes                                │
│                                                               │
│  GET    /api/teams              → route.ts (GET handler)      │
│  POST   /api/teams              → route.ts (POST handler)     │
│  PATCH  /api/teams/[id]         → [id]/route.ts (PATCH)       │
│  DELETE /api/teams/[id]         → [id]/route.ts (DELETE)      │
└──────────────────────┬────────────────────────────────────────┘
                       │  MongoDB native driver
┌──────────────────────▼────────────────────────────────────────┐
│                     MongoDB                                   │
│                                                               │
│   Collection: teams       Collection: contracts               │
│   ─────────────────       ────────────────────────────        │
│   _id, name,              _id, teamId (→ teams._id),          │
│   createdBy,              title, status, …                    │
│   createdAt, updatedAt                                        │
└───────────────────────────────────────────────────────────────┘
```

---

## 3. Data Models

### 3.1 MongoDB Schema

**Collection:** `teams`

| Field       | BSON Type | Required | Description                                       |
|-------------|-----------|----------|---------------------------------------------------|
| `_id`       | ObjectId  | yes      | Auto-generated primary key                        |
| `name`      | string    | yes      | Team name; 1–50 chars, unique per `createdBy`     |
| `createdBy` | string    | yes      | Email address of the owning user                  |
| `createdAt` | string    | yes      | ISO 8601 creation timestamp                       |
| `updatedAt` | string    | yes      | ISO 8601 timestamp; updated on every rename       |

**Index recommendation:** `{ createdBy: 1, name: 1 }` (unique) to enforce name uniqueness at the database level and accelerate owner-scoped queries.

### 3.2 TypeScript Interface

**Source:** [src/types/team.ts](../src/types/team.ts)

```typescript
export interface Team {
    id: string;        // _id.toString() — converted by the API layer
    name: string;
    createdBy: string;
    createdAt: string;
    updatedAt?: string;
}
```

> **ID mapping:** MongoDB stores `_id` as an `ObjectId`. Every API handler calls `_id.toString()` before sending the response, so the frontend always receives a plain string `id`.

### 3.3 Contract Linkage

Contracts reference their team via a `teamId` field stored on each contract document in the `contracts` collection.

```
contracts document
{
  _id:     ObjectId,
  teamId:  string | undefined,   // teams._id.toString(); absent = unassigned
  title:   string,
  status:  string,
  …
}
```

Filtering contracts by team is done entirely on the client side from the already-loaded contracts array:

```typescript
const teamContracts = activeTeamId
    ? contracts.filter(c => c.teamId === activeTeamId)
    : contracts;
```

---

## 4. API Reference

All endpoints are served by the Next.js App Router. Base path: `/api/teams`.

---

### 4.1 List Teams

Fetches all teams owned by the authenticated user, sorted newest first.

```
GET /api/teams?createdBy={email}
```

**Source:** [src/app/api/teams/route.ts](../src/app/api/teams/route.ts)

**Query Parameters**

| Parameter   | Type   | Required | Description              |
|-------------|--------|----------|--------------------------|
| `createdBy` | string | yes      | Owner's email address    |

**Success Response — `200 OK`**

```json
[
  {
    "_id": "664abc123def456789abcdef",
    "name": "Legal",
    "createdBy": "user@example.com",
    "createdAt": "2024-05-20T10:00:00.000Z",
    "updatedAt": "2024-05-20T10:00:00.000Z"
  }
]
```

**Error Responses**

| Status | Body                                    | Condition              |
|--------|-----------------------------------------|------------------------|
| `400`  | `{ "error": "createdBy is required" }`  | Missing query param    |
| `500`  | `{ "error": "Failed to fetch teams" }`  | Database error         |

---

### 4.2 Create Team

Creates a new team for the specified user.

```
POST /api/teams
Content-Type: application/json
```

**Source:** [src/app/api/teams/route.ts](../src/app/api/teams/route.ts)

**Request Body**

```json
{
  "name": "HR",
  "createdBy": "user@example.com"
}
```

| Field       | Type   | Required | Constraints                           |
|-------------|--------|----------|---------------------------------------|
| `name`      | string | yes      | Non-empty after trim; max 50 chars    |
| `createdBy` | string | yes      | Owner's email address                 |

**Success Response — `200 OK`**

```json
{
  "success": true,
  "id": "664abc123def456789abcdef",
  "team": {
    "_id": "664abc123def456789abcdef",
    "name": "HR",
    "createdBy": "user@example.com",
    "createdAt": "2024-05-20T10:00:00.000Z",
    "updatedAt": "2024-05-20T10:00:00.000Z"
  }
}
```

**Error Responses**

| Status | Body                                                 | Condition                          |
|--------|------------------------------------------------------|------------------------------------|
| `400`  | `{ "error": "Team name is required" }`               | Empty or missing `name`            |
| `400`  | `{ "error": "Team name must be 50 characters or less" }` | Name exceeds limit             |
| `400`  | `{ "error": "createdBy is required" }`               | Missing `createdBy`                |
| `400`  | `{ "error": "A team with this name already exists" }`| Duplicate name for same user       |
| `500`  | `{ "error": "Failed to create team" }`               | Database error                     |

---

### 4.3 Rename Team

Updates the `name` and `updatedAt` fields of an existing team.

```
PATCH /api/teams/{id}
Content-Type: application/json
```

**Source:** [src/app/api/teams/\[id\]/route.ts](../src/app/api/teams/%5Bid%5D/route.ts)

**Path Parameters**

| Parameter | Type   | Description              |
|-----------|--------|--------------------------|
| `id`      | string | MongoDB `_id` as string  |

**Request Body**

```json
{
  "name": "Legal & Compliance",
  "createdBy": "user@example.com"
}
```

**Success Response — `200 OK`**

```json
{ "success": true }
```

**Error Responses**

| Status | Body                                                 | Condition                              |
|--------|------------------------------------------------------|----------------------------------------|
| `400`  | `{ "error": "Team name is required" }`               | Empty or missing `name`                |
| `400`  | `{ "error": "Team name must be 50 characters or less" }` | Name exceeds limit                 |
| `400`  | `{ "error": "createdBy is required" }`               | Missing `createdBy`                    |
| `400`  | `{ "error": "A team with this name already exists" }`| Another team with same name exists     |
| `500`  | `{ "error": "Failed to rename team" }`               | Database error                         |

> **Duplicate check:** The uniqueness query excludes the team being renamed (`_id: { $ne: new ObjectId(id) }`), so saving without changing the name does not trigger a conflict error.

---

### 4.4 Delete Team

Permanently deletes a team. Only permitted when the team contains no contracts.

```
DELETE /api/teams/{id}
```

**Source:** [src/app/api/teams/\[id\]/route.ts](../src/app/api/teams/%5Bid%5D/route.ts)

**Path Parameters**

| Parameter | Type   | Description              |
|-----------|--------|--------------------------|
| `id`      | string | MongoDB `_id` as string  |

**Success Response — `200 OK`**

```json
{ "success": true }
```

**Error Responses**

| Status | Body                                                              | Condition                   |
|--------|-------------------------------------------------------------------|-----------------------------|
| `400`  | `{ "error": "Cannot delete: this team contains 3 contract(s)" }` | Team has contracts           |
| `500`  | `{ "error": "Failed to delete team" }`                            | Database error               |

---

## 5. Frontend Components

### 5.1 TeamCard

**Source:** [src/components/teams/TeamCard.tsx](../src/components/teams/TeamCard.tsx)

Renders a single team as a card in the responsive grid on the Contracts page root view.

#### Props

| Prop            | Type                       | Required | Description                                              |
|-----------------|----------------------------|----------|----------------------------------------------------------|
| `team`          | `Team`                     | yes      | Team data to render                                      |
| `contractCount` | `number`                   | yes      | Number of contracts assigned to this team                |
| `onClick`       | `(teamId: string) => void` | yes      | Navigates into the team view                             |
| `onRename`      | `(team: Team) => void`     | yes      | Opens `RenameTeamDialog` for this team                   |
| `onDelete`      | `(team: Team) => void`     | no       | Opens the delete confirmation dialog; only when `contractCount === 0` |

#### Visual Structure

```
┌──────────────────────────────────────┐  ← hover: top gradient bar animates in
│  [📁]  Team Name                     │  ← folder icon + name (truncated, tooltip)
│                                      │
│  3 contracts                         │  ← coloured when > 0; muted when 0
│  Created 20/05/2024                  │  ← formatted with dayjs DD/MM/YYYY
│                                      │
│ ┌──────────────────────────────────┐ │  ← action overlay (opacity 0 → 1 on hover)
│ │  [👁]   [✏]   [🗑]              │ │  ← delete shown only when contractCount = 0
│ └──────────────────────────────────┘ │
└──────────────────────────────────────┘
```

#### Key Behaviours

- Clicking the card body calls `onClick(team.id)`.
- Action buttons use `e.stopPropagation()` to prevent the card click from also firing.
- The Delete action button is conditionally rendered: it only appears when `contractCount === 0` **and** `onDelete` is provided.
- On mobile (`xs`) the action overlay is always visible (opacity 1); on desktop it appears on hover only.

---

### 5.2 CreateTeamDialog

**Source:** [src/components/teams/CreateTeamDialog.tsx](../src/components/teams/CreateTeamDialog.tsx)

Modal dialog that collects a team name, validates it, and calls `POST /api/teams`.

#### Props

| Prop        | Type                   | Required | Description                              |
|-------------|------------------------|----------|------------------------------------------|
| `open`      | `boolean`              | yes      | Controls dialog visibility               |
| `onClose`   | `() => void`           | yes      | Called when the user cancels             |
| `onCreated` | `(team: Team) => void` | yes      | Called with the created team on success  |

#### Form Schema (Zod)

```typescript
const teamSchema = z.object({
    name: z.string()
        .min(1, 'Team name is required')
        .max(50, 'Team name must be 50 characters or less'),
});
```

#### Behaviour

| Event                  | Action                                                    |
|------------------------|-----------------------------------------------------------|
| Field input            | Live character counter; warning colour at ≥ 40 chars      |
| Enter key              | Submits the form                                          |
| Submit (valid)         | Calls `POST /api/teams`, shows loading state              |
| Submit (success)       | Calls `onCreated(team)`, resets form, closes dialog       |
| Submit (API error)     | Displays server error message inline below the field      |
| Cancel / backdrop      | Resets form state and calls `onClose`                     |

---

### 5.3 RenameTeamDialog

**Source:** [src/components/teams/RenameTeamDialog.tsx](../src/components/teams/RenameTeamDialog.tsx)

Modal dialog that pre-fills the current team name and calls `PATCH /api/teams/{id}`.

#### Props

| Prop        | Type                   | Required | Description                                        |
|-------------|------------------------|----------|----------------------------------------------------|
| `open`      | `boolean`              | yes      | Controls dialog visibility                         |
| `team`      | `Team \| null`         | yes      | The team to rename; used to pre-fill the field     |
| `onClose`   | `() => void`           | yes      | Called when the user cancels                       |
| `onRenamed` | `(team: Team) => void` | yes      | Called with the updated team object on success     |

#### Form Schema (Zod)

```typescript
const renameTeamSchema = z.object({
    name: z.string()
        .min(1, 'Team name is required')
        .max(50, 'Team name must be 50 characters or less'),
});
```

#### Behaviour

| Event              | Action                                                             |
|--------------------|--------------------------------------------------------------------|
| Dialog opens       | `useEffect` resets form to `team.name` and clears prior API error |
| Save button        | Disabled when field is empty or value is unchanged                 |
| Submit (success)   | Merges `response.data` into local state; falls back to optimistic update if API returns no body |
| Submit (API error) | Displays server error inline                                       |

---

## 6. Page Integration

**Source:** [src/app/contracts/page.tsx](../src/app/contracts/page.tsx)

The Contracts page (`ContractsPage`) is the sole surface for team management. It operates in three distinct view modes determined by URL search params.

### 6.1 URL-Based Navigation

| URL Pattern                  | View Mode         | Description                             |
|------------------------------|-------------------|-----------------------------------------|
| `/contracts`                 | **Root**          | Grid of all teams owned by the user     |
| `/contracts?team={teamId}`   | **Team view**     | Grid of contracts inside the team       |
| `/contracts?status={status}` | **Flat view**     | Cross-team contract list by status      |

```typescript
const activeTeamId  = searchParams.get('team');    // null at root
const statusFromUrl = searchParams.get('status');  // null unless deep-linked
const isFlatView    = !activeTeamId && statusFromUrl !== null;
```

Navigation into a team:

```typescript
const handleTeamClick = (teamId: string) =>
    router.push(`/contracts?team=${teamId}`);
```

Navigation back to root uses `router.push('/contracts')`.

### 6.2 State Management

All team-related state is co-located in `ContractsPage`:

```typescript
// Team data
const [teams, setTeams]               = useState<Team[]>([]);
const [teamsLoading, setTeamsLoading] = useState(true);

// Dialog control
const [createTeamOpen, setCreateTeamOpen]     = useState(false);
const [renameTeamOpen, setRenameTeamOpen]     = useState(false);
const [teamToRename, setTeamToRename]         = useState<Team | null>(null);
const [deleteTeamOpen, setDeleteTeamOpen]     = useState(false);
const [teamToDelete, setTeamToDelete]         = useState<Team | null>(null);
const [deletingTeam, setDeletingTeam]         = useState(false);
```

### 6.3 Data Loading

Teams are fetched once on component mount alongside contracts and categories:

```typescript
useEffect(() => {
    loadContracts();
    loadTeams();
    loadCategories();
}, []);
```

`loadTeams` calls `GET /api/teams` via `httpClient` and writes the result to `teams` state. It does not refetch after mutations — individual handlers update local state optimistically instead.

### 6.4 Filter Behaviour

The filter bar (`CompactFilter`) adapts based on the current view mode:

| View mode   | Search placeholder    | Dropdown filter              | Date filter label              |
|-------------|-----------------------|------------------------------|--------------------------------|
| Root        | "Search teams"        | Team multi-select            | Filter by Team Creation Date   |
| Team view   | "Search contracts"    | Status + Category            | Filter by Contract Date Range  |
| Flat view   | "Search contracts"    | Status (locked) + Category   | Filter by Contract Date Range  |

Team grid filtering:

```typescript
const filteredTeams = teams.filter(t => {
    const matchesSearch = t.name.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesFilter = teamFilterValue.some(f => f.value === 'all')
        || teamFilterValue.some(f => f.value === t.id);
    // Optional date range against t.createdAt
    return matchesSearch && matchesFilter && matchesDate;
});
```

### 6.5 Header & Action Button Behaviour

| View mode   | Page title                     | Primary action button          |
|-------------|--------------------------------|--------------------------------|
| Root        | "Contracts" (i18n key)         | `CreateNewFolderIcon` → opens `CreateTeamDialog` |
| Team view   | Active team name + breadcrumb  | `NoteAddIcon` → opens `CreateContractDialog` |
| Flat view   | Status label (e.g. "Active Contracts") | Button hidden              |

### 6.6 Event Handlers

| Handler                    | Trigger                            | Action                                                          |
|----------------------------|------------------------------------|-----------------------------------------------------------------|
| `handleTeamClick`          | `TeamCard` click / Open button     | `router.push('/contracts?team={id}')`                           |
| `handleRenameTeam`         | Rename button on `TeamCard`        | Sets `teamToRename`, opens `RenameTeamDialog`                   |
| `handleTeamRenamed`        | `RenameTeamDialog.onRenamed`       | Replaces team in `teams` array via `map`; shows success snackbar|
| `handleTeamCreated`        | `CreateTeamDialog.onCreated`       | Prepends new team to `teams` array; shows success snackbar      |
| `handleDeleteTeamClick`    | Delete button on `TeamCard`        | Sets `teamToDelete`, opens `ConfirmationDialog`                 |
| `handleConfirmDeleteTeam`  | Confirm in `ConfirmationDialog`    | Calls `DELETE /api/teams/{id}`; filters team out of state on success |

---

## 7. User Flows

### 7.1 Create Team

```
User (Root view)
    │
    ├─ Clicks + button (top-right header)
    │
    ▼
CreateTeamDialog opens
    │
    ├─ Types team name  ────────────────────────── live character counter
    │
    ├─ Presses Enter or clicks "Create Team"
    │       │
    │       ├─ [Zod invalid] ──→ inline field error shown; stops here
    │       │
    │       └─ [Zod valid]   ──→ POST /api/teams
    │                               │
    │                 ┌─────────────┴─────────────┐
    │                 │ Success                   │ Error
    │                 ▼                           ▼
    │         onCreated(team)           inline API error shown
    │         team prepended to list
    │         dialog resets & closes
    │         snackbar: "Team created"
    ▼
Root grid updates immediately (optimistic)
```

### 7.2 Rename Team

```
User (Root view)
    │
    ├─ Hovers TeamCard → clicks Edit (✏) button
    │
    ▼
RenameTeamDialog opens  (pre-filled with current name)
    │
    ├─ Edits name
    │
    ├─ Clicks "Save"
    │       │
    │       ├─ [Unchanged / empty] ──→ Save button is disabled; no request sent
    │       │
    │       └─ [Changed + valid]   ──→ PATCH /api/teams/{id}
    │                                       │
    │                         ┌─────────────┴─────────────┐
    │                         │ Success                   │ Error
    │                         ▼                           ▼
    │                 onRenamed(updatedTeam)    inline API error shown
    │                 team updated in list
    │                 dialog closes
    │                 snackbar: "Team renamed to …"
    ▼
Root grid updates immediately (optimistic)
```

### 7.3 Delete Team

```
User (Root view — card with 0 contracts)
    │
    ├─ Hovers TeamCard → clicks Delete (🗑) button
    │   [Button is hidden when contractCount > 0]
    │
    ▼
ConfirmationDialog opens
    │
    ├─ Clicks "Confirm"
    │       │
    │       └─ DELETE /api/teams/{id}
    │               │
    │   ┌───────────┴───────────┐
    │   │ Success               │ Error
    │   ▼                       ▼
    │   team removed from list  snackbar: error message
    │   snackbar: "Team deleted"
    │
    ├─ Clicks "Cancel" ──→ dialog closes, no action taken
    ▼
```

### 7.4 Navigate Into a Team

```
User (Root view)
    │
    ├─ Clicks TeamCard body  (or Open 👁 button)
    │
    ▼
router.push('/contracts?team={teamId}')
    │
    ▼
Page re-renders with activeTeamId = teamId
    │
    ├─ Header: shows team name + breadcrumb + contract count chip
    ├─ + button: changes to "Create Contract" (NoteAddIcon)
    ├─ Filter bar: switches to Status + Category dropdowns
    └─ Grid: shows only contracts where contract.teamId === activeTeamId
```

---

## 8. Validation Rules

| Rule                   | Enforced at             | Detail                                            |
|------------------------|-------------------------|---------------------------------------------------|
| Name required          | Client (Zod) + Server   | Empty or whitespace-only name rejected            |
| Name max length        | Client (Zod) + Server   | 50 characters; client clips input at the limit    |
| Name uniqueness        | Server only             | Case-sensitive, scoped per `createdBy`; checked before insert/update |
| Delete guard           | Server only             | Counts `contracts` where `teamId === id`; rejects if > 0 |
| Delete button hidden   | Client (UI)             | `TeamCard` renders delete button only when `contractCount === 0` |
| Save button disabled   | Client (UI)             | `RenameTeamDialog` disables Save when value is empty or unchanged |

---

## 9. Error Handling

### API-level errors

All route handlers wrap database operations in `try/catch`. Errors are returned as JSON with an appropriate HTTP status code. No stack traces are exposed to the client.

```typescript
// Pattern used across all team route handlers
} catch (e) {
    console.error('Failed to …:', e);
    return NextResponse.json({ error: 'Failed to …' }, { status: 500 });
}
```

### Client-level errors

| Component              | Error source         | Display mechanism                                |
|------------------------|----------------------|--------------------------------------------------|
| `CreateTeamDialog`     | Zod validation       | Inline `helperText` below the text field         |
| `CreateTeamDialog`     | API response error   | `apiError` state → inline `helperText`           |
| `RenameTeamDialog`     | Zod validation       | Inline `helperText` below the text field         |
| `RenameTeamDialog`     | API response error   | `apiError` state → inline `helperText`           |
| `ContractsPage` delete | API response error   | `NotificationSnackbar` with `severity="error"`   |

### HTTP client errors

`httpClient` normalises failed requests into a typed `ApiResponse<T>` object. Components check `response.ok` and read `response.message` for the error text — no uncaught promise rejections.

---

## 10. Business Rules & Constraints

1. **User scoping** — Teams are scoped to their creator. The `createdBy` field is the partition key; no cross-user visibility or sharing is supported.
2. **Name uniqueness** — Team names must be unique per user (case-sensitive). The same name may be used by different users.
3. **Name length** — Maximum 50 characters. The client truncates input at this limit and shows a live character counter.
4. **Immutable ownership** — `createdBy` is set on creation and never changed. There is no team transfer or admin-override mechanism.
5. **Delete protection** — A team cannot be deleted while it contains contracts. The API checks the `contracts` collection before deleting. The UI suppresses the delete button when `contractCount > 0`.
6. **Contract assignment** — Contracts are linked to a team via `teamId` set at creation time. There is no bulk reassignment UI; a contract cannot be moved to a different team after creation.
7. **Rename does not affect contract references** — Contracts reference their team by `teamId` (the MongoDB `ObjectId` string), not by name. Renaming a team does not require any update to contract documents.
8. **No nested teams** — The team structure is flat; teams cannot contain sub-teams.

---

## 11. Known Behaviours & Quirks

- **No server-side refetch after mutations** — Create, rename, and delete all update React state directly rather than calling `loadTeams()` again. This avoids a round-trip but means the list order after creation always places new teams first (prepend), regardless of the server's sort order (`createdAt DESC`).

- **Contract count is client-computed** — `contractCountByTeam(teamId)` filters the already-loaded `contracts` array on the client. It reflects only the contracts visible to the current user (those they created or were assigned to sign). It is not fetched from the server independently.

- **Mobile delete button always visible** — On `xs` breakpoints the action overlay is always shown (opacity 1) rather than appearing on hover, meaning the delete button (if present) is permanently visible on mobile.

- **`PUT` vs `PATCH` in httpClient** — `RenameTeamDialog` calls `httpClient.put(...)` rather than `httpClient.patch(...)`. The server handler is defined as `PATCH`. This works if `httpClient.put` issues an HTTP `PUT` request — the Next.js route handler must accept `PUT` or the `httpClient` must internally map to `PATCH`. Verify if the rename ever fails silently in environments with strict method routing.

- **`createdBy` sent from the client** — Currently both `POST` and `PATCH` include `createdBy` in the request body, sourced from the client. This is an authentication gap: a malicious client could supply any email. When JWT-based middleware is introduced, `createdBy` should be derived from the token server-side and removed from the request body.

---

## 12. File Reference

| File | Role |
|------|------|
| [src/types/team.ts](../src/types/team.ts) | `Team` TypeScript interface |
| [src/components/teams/TeamCard.tsx](../src/components/teams/TeamCard.tsx) | Team grid card component |
| [src/components/teams/CreateTeamDialog.tsx](../src/components/teams/CreateTeamDialog.tsx) | Create team modal |
| [src/components/teams/RenameTeamDialog.tsx](../src/components/teams/RenameTeamDialog.tsx) | Rename team modal |
| [src/app/api/teams/route.ts](../src/app/api/teams/route.ts) | `GET` and `POST` handlers |
| [src/app/api/teams/\[id\]/route.ts](../src/app/api/teams/%5Bid%5D/route.ts) | `PATCH` and `DELETE` handlers |
| [src/app/contracts/page.tsx](../src/app/contracts/page.tsx) | Contracts page — team navigation, dialogs, event handlers |
| [src/lib/httpClient.ts](../src/lib/httpClient.ts) | HTTP client used by all team components |
