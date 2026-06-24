# Folder Integration

**Document Type:** Technical Integration Reference
**System:** Contract Management System (CMS)
**Module:** Folder Management
**Stack:** Next.js 16 · React 19 · TypeScript · MongoDB (native driver) · MUI v7
**Status:** Production

---

## Table of Contents

1. [Overview](#1-overview)
2. [Architecture](#2-architecture)
3. [Data Models](#3-data-models)
   - 3.1 [MongoDB Schema](#31-mongodb-schema)
   - 3.2 [TypeScript Interface](#32-typescript-interface)
   - 3.3 [Contract Linkage](#33-contract-linkage)
4. [API Reference](#4-api-reference)
   - 4.1 [List Folders](#41-list-folders)
   - 4.2 [Create Folder](#42-create-folder)
   - 4.3 [Rename Folder](#43-rename-folder)
   - 4.4 [Delete Folder](#44-delete-folder)
5. [Frontend Components](#5-frontend-components)
   - 5.1 [FolderCard](#51-foldercard)
   - 5.2 [CreateFolderDialog](#52-createfolderdialog)
   - 5.3 [RenameFolderDialog](#53-renamefolderdialog)
6. [Page Integration](#6-page-integration)
   - 6.1 [URL-Based Navigation](#61-url-based-navigation)
   - 6.2 [State Management](#62-state-management)
   - 6.3 [Data Loading](#63-data-loading)
   - 6.4 [Filter Behaviour](#64-filter-behaviour)
   - 6.5 [Header & Action Button Behaviour](#65-header--action-button-behaviour)
   - 6.6 [Event Handlers](#66-event-handlers)
7. [User Flows](#7-user-flows)
   - 7.1 [Create Folder](#71-create-folder)
   - 7.2 [Rename Folder](#72-rename-folder)
   - 7.3 [Delete Folder](#73-delete-folder)
   - 7.4 [Navigate Into a Folder](#74-navigate-into-a-folder)
8. [Validation Rules](#8-validation-rules)
9. [Error Handling](#9-error-handling)
10. [Business Rules & Constraints](#10-business-rules--constraints)
11. [Known Behaviours & Quirks](#11-known-behaviours--quirks)
12. [File Reference](#12-file-reference)

---

## 1. Overview

The **Folder** module provides a grouping mechanism for contracts within the CMS. Each folder is:

- Owned exclusively by the user who created it — no cross-user sharing.
- Used as a navigation layer on the Contracts page: the root view shows a folder grid; selecting a folder filters contracts to that folder.
- Backed by a dedicated `folders` collection in MongoDB and four REST API routes in the Next.js App Router.

Folders are managed entirely through the Contracts page (`/overview`). There is no standalone folders page. Contracts are assigned to a folder at creation time via a `folderId` field on the contract document.

---

## 2. Architecture

```
┌───────────────────────────────────────────────────────────────┐
│                        Browser / React                        │
│                                                               │
│  src/components/contracts/ContractsContent.tsx                │
│    │                                                          │
│    ├── FolderCard.tsx          (grid card per folder)         │
│    ├── CreateFolderDialog.tsx  (create flow)                  │
│    ├── RenameFolderDialog.tsx  (rename flow)                  │
│    └── ConfirmationDialog      (delete confirmation)          │
│              │                                                │
│              ▼                                                │
│         httpClient.ts          (wraps fetch, base: /api)      │
└──────────────────────┬────────────────────────────────────────┘
                       │  HTTP  (Next.js App Router)
┌──────────────────────▼────────────────────────────────────────┐
│                     API Routes                                │
│                                                               │
│  GET    /api/folders              → route.ts (GET handler)    │
│  POST   /api/folders              → route.ts (POST handler)   │
│  PATCH  /api/folders/[id]         → [id]/route.ts (PATCH)     │
│  DELETE /api/folders/[id]         → [id]/route.ts (DELETE)    │
└──────────────────────┬────────────────────────────────────────┘
                       │  MongoDB native driver
┌──────────────────────▼────────────────────────────────────────┐
│                     MongoDB                                   │
│                                                               │
│   Collection: folders     Collection: contracts               │
│   ─────────────────       ────────────────────────────        │
│   _id, name,              _id, folderId (→ folders._id),      │
│   createdBy,              title, status, …                    │
│   createdAt, updatedAt                                        │
└───────────────────────────────────────────────────────────────┘
```

---

## 3. Data Models

### 3.1 MongoDB Schema

**Collection:** `folders`

| Field       | BSON Type | Required | Description                                         |
|-------------|-----------|----------|-----------------------------------------------------|
| `_id`       | ObjectId  | yes      | Auto-generated primary key                          |
| `name`      | string    | yes      | Folder name; 1–50 chars, unique per `createdBy`     |
| `createdBy` | string    | yes      | Email address of the owning user                    |
| `createdAt` | string    | yes      | ISO 8601 creation timestamp                         |
| `updatedAt` | string    | yes      | ISO 8601 timestamp; updated on every rename         |

**Index recommendation:** `{ createdBy: 1, name: 1 }` (unique) to enforce name uniqueness at the database level and accelerate owner-scoped queries.

### 3.2 TypeScript Interface

**Source:** [src/types/folder.ts](../src/types/folder.ts)

```typescript
export interface Folder {
    id: string;        // _id.toString() — converted by the API layer
    name: string;
    createdBy: string;
    createdAt: string;
    updatedAt?: string;
}
```

> **ID mapping:** MongoDB stores `_id` as an `ObjectId`. Every API handler calls `_id.toString()` before sending the response, so the frontend always receives a plain string `id`.

### 3.3 Contract Linkage

Contracts reference their folder via a `folderId` field stored on each contract document in the `contracts` collection.

```
contracts document
{
  _id:      ObjectId,
  folderId: string | undefined,   // folders._id.toString(); absent = unassigned
  title:    string,
  status:   string,
  …
}
```

Filtering contracts by folder is done entirely on the client side from the already-loaded contracts array:

```typescript
const folderContracts = activeFolderId
    ? contracts.filter(c => c.folderId === activeFolderId)
    : contracts;
```

---

## 4. API Reference

All endpoints are served by the Next.js App Router. Base path: `/api/folders`.

---

### 4.1 List Folders

Fetches all folders owned by the authenticated user, sorted newest first.

```
GET /api/folders?createdBy={email}
```

**Source:** [src/app/api/folders/route.ts](../src/app/api/folders/route.ts)

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

| Status | Body                                      | Condition              |
|--------|-------------------------------------------|------------------------|
| `400`  | `{ "error": "createdBy is required" }`    | Missing query param    |
| `500`  | `{ "error": "Failed to fetch folders" }`  | Database error         |

---

### 4.2 Create Folder

Creates a new folder for the specified user.

```
POST /api/folders
Content-Type: application/json
```

**Source:** [src/app/api/folders/route.ts](../src/app/api/folders/route.ts)

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
  "folder": {
    "_id": "664abc123def456789abcdef",
    "name": "HR",
    "createdBy": "user@example.com",
    "createdAt": "2024-05-20T10:00:00.000Z",
    "updatedAt": "2024-05-20T10:00:00.000Z"
  }
}
```

**Error Responses**

| Status | Body                                                   | Condition                          |
|--------|--------------------------------------------------------|------------------------------------|
| `400`  | `{ "error": "Folder name is required" }`               | Empty or missing `name`            |
| `400`  | `{ "error": "Folder name must be 50 characters or less" }` | Name exceeds limit             |
| `400`  | `{ "error": "createdBy is required" }`                 | Missing `createdBy`                |
| `400`  | `{ "error": "A folder with this name already exists" }`| Duplicate name for same user       |
| `500`  | `{ "error": "Failed to create folder" }`               | Database error                     |

---

### 4.3 Rename Folder

Updates the `name` and `updatedAt` fields of an existing folder.

```
PATCH /api/folders/{id}
Content-Type: application/json
```

**Source:** [src/app/api/folders/\[id\]/route.ts](../src/app/api/folders/%5Bid%5D/route.ts)

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

| Status | Body                                                   | Condition                              |
|--------|--------------------------------------------------------|----------------------------------------|
| `400`  | `{ "error": "Folder name is required" }`               | Empty or missing `name`                |
| `400`  | `{ "error": "Folder name must be 50 characters or less" }` | Name exceeds limit                 |
| `400`  | `{ "error": "createdBy is required" }`                 | Missing `createdBy`                    |
| `400`  | `{ "error": "A folder with this name already exists" }`| Another folder with same name exists   |
| `500`  | `{ "error": "Failed to rename folder" }`               | Database error                         |

> **Duplicate check:** The uniqueness query excludes the folder being renamed (`_id: { $ne: new ObjectId(id) }`), so saving without changing the name does not trigger a conflict error.

---

### 4.4 Delete Folder

Permanently deletes a folder. Only permitted when the folder contains no contracts.

```
DELETE /api/folders/{id}
```

**Source:** [src/app/api/folders/\[id\]/route.ts](../src/app/api/folders/%5Bid%5D/route.ts)

**Path Parameters**

| Parameter | Type   | Description              |
|-----------|--------|--------------------------|
| `id`      | string | MongoDB `_id` as string  |

**Success Response — `200 OK`**

```json
{ "success": true }
```

**Error Responses**

| Status | Body                                                                | Condition                    |
|--------|---------------------------------------------------------------------|------------------------------|
| `400`  | `{ "error": "Cannot delete: this folder contains 3 contract(s)" }` | Folder has contracts          |
| `500`  | `{ "error": "Failed to delete folder" }`                            | Database error               |

---

## 5. Frontend Components

### 5.1 FolderCard

**Source:** [src/components/folders/FolderCard.tsx](../src/components/folders/FolderCard.tsx)

Renders a single folder as a card in the responsive grid on the Contracts page root view.

#### Props

| Prop            | Type                          | Required | Description                                                |
|-----------------|-------------------------------|----------|------------------------------------------------------------|
| `folder`        | `Folder`                      | yes      | Folder data to render                                      |
| `contractCount` | `number`                      | yes      | Number of contracts assigned to this folder                |
| `onClick`       | `(folderId: string) => void`  | yes      | Navigates into the folder view                             |
| `onRename`      | `(folder: Folder) => void`    | yes      | Opens `RenameFolderDialog` for this folder                 |
| `onDelete`      | `(folder: Folder) => void`    | no       | Opens the delete confirmation dialog; only when `contractCount === 0` |

#### Visual Structure

```
┌──────────────────────────────────────┐  ← hover: top gradient bar animates in
│  [📁]  Folder Name                   │  ← folder icon + name (truncated, tooltip)
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

- Clicking the card body calls `onClick(folder.id)`.
- Action buttons use `e.stopPropagation()` to prevent the card click from also firing.
- The Delete action button is conditionally rendered: it only appears when `contractCount === 0` **and** `onDelete` is provided.
- On mobile (`xs`) the action overlay is always visible (opacity 1); on desktop it appears on hover only.

---

### 5.2 CreateFolderDialog

**Source:** [src/components/folders/CreateFolderDialog.tsx](../src/components/folders/CreateFolderDialog.tsx)

Modal dialog that collects a folder name, validates it, and calls `POST /api/folders`.

#### Props

| Prop        | Type                     | Required | Description                                |
|-------------|--------------------------|----------|--------------------------------------------|
| `open`      | `boolean`                | yes      | Controls dialog visibility                 |
| `onClose`   | `() => void`             | yes      | Called when the user cancels               |
| `onCreated` | `(folder: Folder) => void` | yes    | Called with the created folder on success  |

#### Form Schema (Zod)

```typescript
const folderSchema = z.object({
    name: z.string()
        .min(1, 'Folder name is required')
        .max(50, 'Folder name must be 50 characters or less'),
});
```

#### Behaviour

| Event                  | Action                                                    |
|------------------------|-----------------------------------------------------------|
| Field input            | Live character counter; warning colour at ≥ 40 chars      |
| Enter key              | Submits the form                                          |
| Submit (valid)         | Calls `POST /api/folders`, shows loading state            |
| Submit (success)       | Calls `onCreated(folder)`, resets form, closes dialog     |
| Submit (API error)     | Displays server error message inline below the field      |
| Cancel / backdrop      | Resets form state and calls `onClose`                     |

---

### 5.3 RenameFolderDialog

**Source:** [src/components/folders/RenameFolderDialog.tsx](../src/components/folders/RenameFolderDialog.tsx)

Modal dialog that pre-fills the current folder name and calls `PATCH /api/folders/{id}`.

#### Props

| Prop        | Type                     | Required | Description                                          |
|-------------|--------------------------|----------|------------------------------------------------------|
| `open`      | `boolean`                | yes      | Controls dialog visibility                           |
| `folder`    | `Folder \| null`         | yes      | The folder to rename; used to pre-fill the field     |
| `onClose`   | `() => void`             | yes      | Called when the user cancels                         |
| `onRenamed` | `(folder: Folder) => void` | yes   | Called with the updated folder object on success     |

#### Form Schema (Zod)

```typescript
const renameFolderSchema = z.object({
    name: z.string()
        .min(1, 'Folder name is required')
        .max(50, 'Folder name must be 50 characters or less'),
});
```

#### Behaviour

| Event              | Action                                                                    |
|--------------------|---------------------------------------------------------------------------|
| Dialog opens       | `useEffect` resets form to `folder.name` and clears prior API error       |
| Save button        | Disabled when field is empty or value is unchanged                         |
| Submit (success)   | Merges `response.data` into local state; falls back to optimistic update if API returns no body |
| Submit (API error) | Displays server error inline                                               |

---

## 6. Page Integration

**Source:** [src/components/contracts/ContractsContent.tsx](../src/components/contracts/ContractsContent.tsx)

The Contracts page (`ContractsContent`) is the sole surface for folder management. It operates in three distinct view modes determined by URL search params.

### 6.1 URL-Based Navigation

| URL Pattern                    | View Mode           | Description                               |
|--------------------------------|---------------------|-------------------------------------------|
| `/overview`                    | **Root**            | Grid of all folders owned by the user     |
| `/overview?folder={folderId}`  | **Folder view**     | Grid of contracts inside the folder       |
| `/overview?status={status}`    | **Flat view**       | Cross-folder contract list by status      |

```typescript
const activeFolderId = searchParams.get('folder');   // null at root
const statusFromUrl  = searchParams.get('status');   // null unless deep-linked
const isFlatView     = !activeFolderId && statusFromUrl !== null;
```

Navigation into a folder:

```typescript
const handleFolderClick = (folderId: string) =>
    router.push(`/overview?folder=${folderId}`);
```

Navigation back to root uses `router.push('/overview')`.

### 6.2 State Management

All folder-related state is co-located in `ContractsContent`:

```typescript
// Folder data
const [folders, setFolders]                   = useState<Folder[]>([]);
const [foldersLoading, setFoldersLoading]     = useState(true);

// Dialog control
const [createFolderOpen, setCreateFolderOpen] = useState(false);
const [renameFolderOpen, setRenameFolderOpen] = useState(false);
const [folderToRename, setFolderToRename]     = useState<Folder | null>(null);
const [deleteFolderOpen, setDeleteFolderOpen] = useState(false);
const [folderToDelete, setFolderToDelete]     = useState<Folder | null>(null);
const [deletingFolder, setDeletingFolder]     = useState(false);
```

### 6.3 Data Loading

Folders are fetched once on component mount alongside contracts and categories:

```typescript
useEffect(() => {
    loadContracts();
    loadFolders();
    loadCategories();
}, []);
```

`loadFolders` calls `GET /api/folders` via `httpClient` and writes the result to `folders` state. It does not refetch after mutations — individual handlers update local state optimistically instead.

### 6.4 Filter Behaviour

The filter bar (`CompactFilter`) adapts based on the current view mode:

| View mode     | Search placeholder    | Dropdown filter              | Date filter label                |
|---------------|-----------------------|------------------------------|----------------------------------|
| Root          | "Search folders"      | Folder multi-select          | Filter by Folder Creation Date   |
| Folder view   | "Search contracts"    | Status + Category            | Filter by Contract Date Range    |
| Flat view     | "Search contracts"    | Status (locked) + Category   | Filter by Contract Date Range    |

Folder grid filtering:

```typescript
const filteredFolders = folders.filter(f => {
    const matchesSearch = f.name.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesFilter = folderFilterValue.some(fv => fv.value === 'all')
        || folderFilterValue.some(fv => fv.value === f.id);
    // Optional date range against f.createdAt
    return matchesSearch && matchesFilter && matchesDate;
});
```

### 6.5 Header & Action Button Behaviour

| View mode     | Page title                      | Primary action button              |
|---------------|---------------------------------|------------------------------------|
| Root          | "Contracts" (i18n key)          | `CreateNewFolderIcon` → opens `CreateFolderDialog` |
| Folder view   | Active folder name + breadcrumb | `NoteAddIcon` → opens `CreateContractDialog` |
| Flat view     | Status label (e.g. "Active Contracts") | Button hidden                 |

### 6.6 Event Handlers

| Handler                     | Trigger                              | Action                                                            |
|-----------------------------|--------------------------------------|-------------------------------------------------------------------|
| `handleFolderClick`         | `FolderCard` click / Open button     | `router.push('/overview?folder={id}')`                            |
| `handleRenameFolder`        | Rename button on `FolderCard`        | Sets `folderToRename`, opens `RenameFolderDialog`                 |
| `handleFolderRenamed`       | `RenameFolderDialog.onRenamed`       | Replaces folder in `folders` array via `map`; shows success snackbar |
| `handleFolderCreated`       | `CreateFolderDialog.onCreated`       | Prepends new folder to `folders` array; shows success snackbar    |
| `handleDeleteFolderClick`   | Delete button on `FolderCard`        | Sets `folderToDelete`, opens `ConfirmationDialog`                 |
| `handleConfirmDeleteFolder` | Confirm in `ConfirmationDialog`      | Calls `DELETE /api/folders/{id}`; filters folder out of state on success |

---

## 7. User Flows

### 7.1 Create Folder

```
User (Root view)
    │
    ├─ Clicks + button (top-right header)
    │
    ▼
CreateFolderDialog opens
    │
    ├─ Types folder name  ────────────────────────── live character counter
    │
    ├─ Presses Enter or clicks "Create Folder"
    │       │
    │       ├─ [Zod invalid] ──→ inline field error shown; stops here
    │       │
    │       └─ [Zod valid]   ──→ POST /api/folders
    │                               │
    │                 ┌─────────────┴─────────────┐
    │                 │ Success                   │ Error
    │                 ▼                           ▼
    │         onCreated(folder)         inline API error shown
    │         folder prepended to list
    │         dialog resets & closes
    │         snackbar: "Folder created"
    ▼
Root grid updates immediately (optimistic)
```

### 7.2 Rename Folder

```
User (Root view)
    │
    ├─ Hovers FolderCard → clicks Edit (✏) button
    │
    ▼
RenameFolderDialog opens  (pre-filled with current name)
    │
    ├─ Edits name
    │
    ├─ Clicks "Save"
    │       │
    │       ├─ [Unchanged / empty] ──→ Save button is disabled; no request sent
    │       │
    │       └─ [Changed + valid]   ──→ PATCH /api/folders/{id}
    │                                       │
    │                         ┌─────────────┴─────────────┐
    │                         │ Success                   │ Error
    │                         ▼                           ▼
    │                 onRenamed(updatedFolder)  inline API error shown
    │                 folder updated in list
    │                 dialog closes
    │                 snackbar: "Folder renamed to …"
    ▼
Root grid updates immediately (optimistic)
```

### 7.3 Delete Folder

```
User (Root view — card with 0 contracts)
    │
    ├─ Hovers FolderCard → clicks Delete (🗑) button
    │   [Button is hidden when contractCount > 0]
    │
    ▼
ConfirmationDialog opens
    │
    ├─ Clicks "Confirm"
    │       │
    │       └─ DELETE /api/folders/{id}
    │               │
    │   ┌───────────┴───────────┐
    │   │ Success               │ Error
    │   ▼                       ▼
    │   folder removed from list  snackbar: error message
    │   snackbar: "Folder deleted"
    │
    ├─ Clicks "Cancel" ──→ dialog closes, no action taken
    ▼
```

### 7.4 Navigate Into a Folder

```
User (Root view)
    │
    ├─ Clicks FolderCard body  (or Open 👁 button)
    │
    ▼
router.push('/overview?folder={folderId}')
    │
    ▼
Page re-renders with activeFolderId = folderId
    │
    ├─ Header: shows folder name + breadcrumb + contract count chip
    ├─ + button: changes to "Create Contract" (NoteAddIcon)
    ├─ Filter bar: switches to Status + Category dropdowns
    └─ Grid: shows only contracts where contract.folderId === activeFolderId
```

---

## 8. Validation Rules

| Rule                   | Enforced at             | Detail                                              |
|------------------------|-------------------------|-----------------------------------------------------|
| Name required          | Client (Zod) + Server   | Empty or whitespace-only name rejected              |
| Name max length        | Client (Zod) + Server   | 50 characters; client clips input at the limit      |
| Name uniqueness        | Server only             | Case-sensitive, scoped per `createdBy`; checked before insert/update |
| Delete guard           | Server only             | Counts `contracts` where `folderId === id`; rejects if > 0 |
| Delete button hidden   | Client (UI)             | `FolderCard` renders delete button only when `contractCount === 0` |
| Save button disabled   | Client (UI)             | `RenameFolderDialog` disables Save when value is empty or unchanged |

---

## 9. Error Handling

### API-level errors

All route handlers wrap database operations in `try/catch`. Errors are returned as JSON with an appropriate HTTP status code. No stack traces are exposed to the client.

```typescript
// Pattern used across all folder route handlers
} catch (e) {
    console.error('Failed to …:', e);
    return NextResponse.json({ error: 'Failed to …' }, { status: 500 });
}
```

### Client-level errors

| Component               | Error source         | Display mechanism                                |
|-------------------------|----------------------|--------------------------------------------------|
| `CreateFolderDialog`    | Zod validation       | Inline `helperText` below the text field         |
| `CreateFolderDialog`    | API response error   | `apiError` state → inline `helperText`           |
| `RenameFolderDialog`    | Zod validation       | Inline `helperText` below the text field         |
| `RenameFolderDialog`    | API response error   | `apiError` state → inline `helperText`           |
| `ContractsContent` delete | API response error | `NotificationSnackbar` with `severity="error"`   |

### HTTP client errors

`httpClient` normalises failed requests into a typed `ApiResponse<T>` object. Components check `response.ok` and read `response.message` for the error text — no uncaught promise rejections.

---

## 10. Business Rules & Constraints

1. **User scoping** — Folders are scoped to their creator. The `createdBy` field is the partition key; no cross-user visibility or sharing is supported.
2. **Name uniqueness** — Folder names must be unique per user (case-sensitive). The same name may be used by different users.
3. **Name length** — Maximum 50 characters. The client truncates input at this limit and shows a live character counter.
4. **Immutable ownership** — `createdBy` is set on creation and never changed. There is no folder transfer or admin-override mechanism.
5. **Delete protection** — A folder cannot be deleted while it contains contracts. The API checks the `contracts` collection before deleting. The UI suppresses the delete button when `contractCount > 0`.
6. **Contract assignment** — Contracts are linked to a folder via `folderId` set at creation time. There is no bulk reassignment UI; a contract cannot be moved to a different folder after creation.
7. **Rename does not affect contract references** — Contracts reference their folder by `folderId` (the MongoDB `ObjectId` string), not by name. Renaming a folder does not require any update to contract documents.
8. **No nested folders** — The folder structure is flat; folders cannot contain sub-folders.

---

## 11. Known Behaviours & Quirks

- **No server-side refetch after mutations** — Create, rename, and delete all update React state directly rather than calling `loadFolders()` again. This avoids a round-trip but means the list order after creation always places new folders first (prepend), regardless of the server's sort order (`createdAt DESC`).

- **Contract count is client-computed** — `contractCountByFolder(folderId)` filters the already-loaded `contracts` array on the client. It reflects only the contracts visible to the current user. It is not fetched from the server independently.

- **Mobile delete button always visible** — On `xs` breakpoints the action overlay is always shown (opacity 1) rather than appearing on hover, meaning the delete button (if present) is permanently visible on mobile.

- **`PUT` vs `PATCH` in httpClient** — `RenameFolderDialog` calls `httpClient.put(...)` rather than `httpClient.patch(...)`. The server handler is defined as `PATCH`. This works if `httpClient.put` issues an HTTP `PUT` request — the Next.js route handler must accept `PUT` or the `httpClient` must internally map to `PATCH`. Verify if the rename ever fails silently in environments with strict method routing.

- **`createdBy` sent from the client** — Currently both `POST` and `PATCH` include `createdBy` in the request body, sourced from the client. This is an authentication gap: a malicious client could supply any email. When JWT-based middleware is introduced, `createdBy` should be derived from the token server-side and removed from the request body.

---

## 12. File Reference

| File | Role |
|------|------|
| [src/types/folder.ts](../src/types/folder.ts) | `Folder` TypeScript interface |
| [src/components/folders/FolderCard.tsx](../src/components/folders/FolderCard.tsx) | Folder grid card component |
| [src/components/folders/CreateFolderDialog.tsx](../src/components/folders/CreateFolderDialog.tsx) | Create folder modal |
| [src/components/folders/RenameFolderDialog.tsx](../src/components/folders/RenameFolderDialog.tsx) | Rename folder modal |
| [src/app/api/folders/route.ts](../src/app/api/folders/route.ts) | `GET` and `POST` handlers |
| [src/app/api/folders/\[id\]/route.ts](../src/app/api/folders/%5Bid%5D/route.ts) | `PATCH` and `DELETE` handlers |
| [src/components/contracts/ContractsContent.tsx](../src/components/contracts/ContractsContent.tsx) | Contracts page — folder navigation, dialogs, event handlers |
| [src/lib/httpClient.ts](../src/lib/httpClient.ts) | HTTP client used by all folder components |
