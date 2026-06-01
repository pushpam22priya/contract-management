# Category Integration

**Document Type:** Technical Integration Reference  
**System:** Contract Management System (CMS)  
**Module:** Category Management  
**Stack:** Next.js 16 · React 19 · TypeScript · Spring Boot (backend) · MUI v7  
**Status:** Production  
**Last Updated:** 2026-05-29

---

## Table of Contents

1. [Overview](#1-overview)
2. [Architecture](#2-architecture)
3. [Data Models](#3-data-models)
4. [Authentication](#4-authentication)
5. [API Reference](#5-api-reference)
   - 5.1 [List Categories](#51-list-categories)
   - 5.2 [Create Category](#52-create-category)
   - 5.3 [Delete Category](#53-delete-category)
6. [Service Layer](#6-service-layer)
7. [Frontend Component Integration](#7-frontend-component-integration)
   - 7.1 [Upload Template Dialog](#71-upload-template-dialog)
   - 7.2 [Edit Template Dialog](#72-edit-template-dialog)
   - 7.3 [Template List Page — Filtering](#73-template-list-page--filtering)
   - 7.4 [Contract Pages — Filtering](#74-contract-pages--filtering)
   - 7.5 [Template Card — Display](#75-template-card--display)
8. [Data Flow](#8-data-flow)
9. [Validation Rules](#9-validation-rules)
10. [Error Handling](#10-error-handling)
11. [Known Behaviours & Quirks](#11-known-behaviours--quirks)
12. [File Reference](#12-file-reference)

---

## 1. Overview

The **Category** module provides a flat taxonomy for organising templates and contracts within the CMS. A category is a named label (e.g., *"Employment Contracts"*, *"NDA"*, *"Service Agreements"*) that is:

- Created and deleted through the template upload/edit workflow or standalone UI.
- Stored as a **name string** on each template — not as a foreign-key ID.
- Used across the template list and all contract views as a multi-select filter.

Categories are managed exclusively through the **Spring Boot backend** (`http://localhost:8080`). The Next.js layer contains no category database logic; it proxies all operations through the HTTP client and exposes them via `categoryService`.

---

## 2. Architecture

```
┌─────────────────────────────────────────────────────────┐
│                     Browser / React                     │
│                                                         │
│  UploadTemplateDialog  ─┐                               │
│  EditTemplateDialog    ─┤─→  categoryService.ts         │
│  template/page.tsx     ─┤         │                     │
│  all-contracts/*       ─┘         │                     │
│                                   ↓                     │
│                           httpClient.ts                 │
│                      (adds JWT Authorization header)    │
└───────────────────────────────────┬─────────────────────┘
                                    │ HTTP/JSON
                                    ▼
                      ┌─────────────────────────┐
                      │   Spring Boot Backend    │
                      │   localhost:8080         │
                      │                          │
                      │  GET    /categories      │
                      │  POST   /categories      │
                      │  DELETE /categories/{id} │
                      └─────────────────────────┘
```

### Responsibilities

| Layer | File | Responsibility |
|---|---|---|
| **Types** | `src/types/template.ts` | `Category`, `CreateCategoryData` interfaces |
| **Service** | `src/services/categoryService.ts` | Business logic, error normalisation, network calls |
| **HTTP Client** | `src/lib/httpClient.ts` | JWT injection, response normalisation, error surfacing |
| **UI — Management** | `UploadTemplateDialog.tsx`, `EditTemplateDialog.tsx` | Inline category create/delete; category selection |
| **UI — Filtering** | `template/page.tsx`, contract pages | Multi-select category filter |
| **UI — Display** | `TemplateCard.tsx` | Category badge on each card |

---

## 3. Data Models

### 3.1 `Category`

Returned by `GET /categories` and `POST /categories`.

```typescript
export interface Category {
    id: string;        // Opaque identifier assigned by the backend (e.g. MongoDB ObjectId)
    name: string;      // Unique display name (e.g. "Service Agreements")
    createdAt: string; // ISO 8601 timestamp: "2026-01-15T10:30:00Z"
    createdBy: string; // Email address of the user who created the category
}
```

### 3.2 `CreateCategoryData`

Sent as the request body to `POST /categories`.

```typescript
export interface CreateCategoryData {
    name: string; // Required. Must be non-empty after trimming.
}
```

### 3.3 Category on a `Template`

Templates do **not** store a category ID. They store the category **name** as a plain string:

```typescript
export interface Template {
    // ...
    category: string; // e.g. "Service Agreements"
    // ...
}
```

> **Implication:** If a category is renamed on the backend (outside this UI), existing templates retain the old name string. The frontend filter will still show the old name from existing templates.

---

## 4. Authentication

All category endpoints require a valid **JWT Bearer token**.

The token is retrieved from `sessionStorage`:

```typescript
// src/lib/httpClient.ts (internal)
const raw = sessionStorage.getItem('cms_current_user');
const user = raw ? JSON.parse(raw) : null;
const token = user?.token;

headers['Authorization'] = `Bearer ${token}`;
```

| Session Key | `cms_current_user` |
|---|---|
| Storage | `sessionStorage` (tab-scoped, cleared on tab close) |
| Value | JSON-serialised user object with a `token` property |
| Token expiry | Enforced by the backend; a 401 response redirects to `/login` |

No client-side token refresh is implemented. An expired session causes a hard redirect to the login page.

---

## 5. API Reference

All endpoints are relative to the Spring Boot base URL configured in `httpClient.ts`.  
All requests and responses use `Content-Type: application/json`.

---

### 5.1 List Categories

Retrieves all categories available in the system.

#### Request

```
GET /categories
Authorization: Bearer <token>
```

#### Response — 200 OK

```json
[
  {
    "id": "664a1f2e3b0000000000001a",
    "name": "Employment Contracts",
    "createdAt": "2026-01-15T10:30:00Z",
    "createdBy": "admin@company.com"
  },
  {
    "id": "664a1f2e3b0000000000001b",
    "name": "Service Agreements",
    "createdAt": "2026-01-14T09:15:00Z",
    "createdBy": "user@company.com"
  }
]
```

#### Response — Error

On any non-2xx status the `httpClient` wrapper returns:

```typescript
{ ok: false, status: <HTTP code>, data: null, message: "<reason>" }
```

`categoryService.getAllCategories()` catches this and returns `[]` (empty array) — pages render without crashing.

---

### 5.2 Create Category

Creates a new category with a unique name.

#### Request

```
POST /categories
Authorization: Bearer <token>
Content-Type: application/json

{
  "name": "NDA"
}
```

| Field | Type | Required | Constraints |
|---|---|---|---|
| `name` | string | Yes | Non-empty after trim; unique (case-insensitive, enforced by backend) |

#### Response — 201 Created

```json
{
  "id": "664a1f2e3b0000000000001c",
  "name": "NDA",
  "createdAt": "2026-05-29T08:00:00Z",
  "createdBy": "user@company.com"
}
```

#### Response — Duplicate Name

> **API Quirk:** The backend returns **HTTP 401** (not 409) when a category name already exists. `categoryService` maps this to a user-facing "Category already exists" message.

```
HTTP 401 Unauthorized
```

```json
{
  "message": "Category already exists"
}
```

#### Response — Validation Error

```
HTTP 400 Bad Request
```

---

### 5.3 Delete Category

Deletes a category by its opaque ID.

#### Request

```
DELETE /categories/{id}
Authorization: Bearer <token>
```

| Path Parameter | Type | Description |
|---|---|---|
| `id` | string | The `id` field from the `Category` object |

#### Response — 204 No Content

Empty body. Category has been removed.

#### Response — Not Found

> **API Quirk:** The backend returns **HTTP 401** (not 404) when the category ID does not exist.

```
HTTP 401
```

```json
{
  "message": "Category not found"
}
```

> **Important:** Deleting a category does **not** cascade to templates. Templates that already reference the deleted category name continue to store that string. They will no longer match any filter option but remain otherwise intact.

---

## 6. Service Layer

**File:** `src/services/categoryService.ts`

`categoryService` is a singleton object exposing five methods. It owns all network calls and error normalisation; components never call `httpClient` directly for category operations.

```typescript
export const categoryService = {
    getAllCategories,
    createCategory,
    deleteCategory,
    getCategoryById,    // synchronous utility (no network)
    getCategoryByName,  // synchronous utility (no network)
};
```

### 6.1 `getAllCategories()`

```typescript
async function getAllCategories(): Promise<Category[]>
```

- Calls `GET /categories`.
- Returns the full array on success.
- Returns `[]` on any failure — callers get a safe empty list without needing try/catch.

### 6.2 `createCategory(data, userEmail)`

```typescript
async function createCategory(
    data: CreateCategoryData,
    userEmail: string
): Promise<{ success: boolean; message: string; category?: Category }>
```

- Guards against empty `data.name` before making a network call.
- Maps HTTP 401 from the backend to the message `"Category already exists"`.
- Returns the created `Category` object on success so the caller can immediately add it to local state and auto-select it.

### 6.3 `deleteCategory(id)`

```typescript
async function deleteCategory(
    id: string
): Promise<{ success: boolean; message: string }>
```

- Calls `DELETE /categories/{id}`.
- Maps HTTP 401 to `"Category not found"`.

### 6.4 `getCategoryById(id, categories)` *(synchronous)*

```typescript
function getCategoryById(id: string, categories: Category[]): Category | undefined
```

Performs a local array lookup — no network call. Use when you already have the categories loaded.

### 6.5 `getCategoryByName(name, categories)` *(synchronous)*

```typescript
function getCategoryByName(name: string, categories: Category[]): Category | undefined
```

Case-insensitive name lookup in a pre-fetched array.

---

## 7. Frontend Component Integration

### 7.1 Upload Template Dialog

**File:** `src/components/template/UploadTemplateDialog.tsx`

Categories are managed in **Step 1 (Basic Information)** of the two-step upload wizard.

#### Load on Open

```typescript
useEffect(() => {
    if (!open) return;
    const loadCategories = async () => {
        const allCategories = await categoryService.getAllCategories();
        setCategories(allCategories);
    };
    loadCategories();
}, [open]);
```

Categories are fetched fresh every time the dialog opens.

#### Selection UI

An MUI `Autocomplete` renders the category list. The selected value is stored as a name string in the React Hook Form field `category`.

```typescript
<Autocomplete
    options={categories}
    value={categories.find(c => c.name === selectedCategory) || null}
    onChange={(_, newValue) => {
        setValue('category', newValue ? newValue.name : '');
    }}
    getOptionLabel={(option) => option.name}
    renderOption={(props, option) => (
        // Each option renders the name + a delete IconButton
    )}
/>
```

#### Inline Category Creation

Toggling **"New"** reveals a text input. On submit:

1. `categoryService.createCategory({ name }, userEmail)` is called.
2. On success, the new `Category` object is appended to local state.
3. The new category is auto-selected (`setValue('category', result.category.name)`).

#### Inline Category Deletion

Each option in the dropdown has a delete button:

1. `categoryService.deleteCategory(categoryId)` is called.
2. On success, the category is removed from local state.
3. If the deleted category was currently selected, the form field is cleared (`setValue('category', '')`).

#### Submission

On Step 2 completion the category name is included in the template metadata payload:

```typescript
// Sent to POST /templates
{
    name: templateName,
    category: selectedCategory,  // e.g. "NDA"
    // ...
}
```

---

### 7.2 Edit Template Dialog

**File:** `src/components/template/EditTemplateDialog.tsx`

Identical category management to `UploadTemplateDialog` with one addition: the form is pre-filled with the template's current category on open.

```typescript
reset({
    templateName: template.name,
    description: template.description || '',
    category: template.category,  // pre-filled from existing template
});
```

On save, the (possibly updated) category name is sent to `PUT /templates/{id}`.

---

### 7.3 Template List Page — Filtering

**File:** `src/app/template/page.tsx`

#### Load Categories for Filter

```typescript
useEffect(() => {
    const loadCategories = async () => {
        const allCategories = await categoryService.getAllCategories();
        setCategories(allCategories.map(cat => cat.name));
    };
    loadCategories();
}, []);
```

Only category **names** are needed for the filter; the ID is discarded.

#### Filter Options

```typescript
const filterOptions = [
    { label: 'All Categories', value: 'all' },
    ...categories.map(c => ({ label: c, value: c })),
];
```

#### Filter Logic

```typescript
const filteredTemplates = templates.filter(template => {
    const matchesCategory =
        selectedCategory.some(f => f.value === 'all') ||
        selectedCategory.some(f => f.value === template.category);

    const matchesSearch =
        template.name.toLowerCase().includes(searchQuery.toLowerCase());

    return matchesCategory && matchesSearch;
});
```

- Filter is applied **client-side** on the already-loaded template list.
- Multi-select: selecting multiple categories shows templates matching **any** of them.
- Selecting **"All Categories"** bypasses the category check entirely.
- Category filter is combined with the text search using logical AND.

---

### 7.4 Contract Pages — Filtering

The following contract views load and apply category filters identically to the template list:

| File | View |
|---|---|
| `src/app/all-contracts/ContractsTab.tsx` | All Contracts |
| `src/app/all-contracts/DraftTab.tsx` | Drafts |
| `src/app/all-contracts/SignaturesTab.tsx` | Signatures |
| `src/app/contracts/page.tsx` | Contracts |
| `src/app/draft/page.tsx` | Drafts |
| `src/app/signatures/page.tsx` | Signatures |
| `src/app/terminated/page.tsx` | Terminated |
| `src/components/contracts/ContractsContent.tsx` | Contracts content component |

Contracts inherit `category` from the template they were created from. The filter logic is the same as the template list.

---

### 7.5 Template Card — Display

**File:** `src/components/template/TemplateCard.tsx`

The category name is rendered as a styled chip below the template title.

```typescript
<Tooltip title={category} arrow placement="top">
    <Box
        component="span"
        sx={{
            display: 'inline-block',
            px: 0.6, py: 0.2,
            borderRadius: '4px',
            bgcolor: alpha(chipColor, 0.12),
            border: `1px solid ${alpha(chipColor, 0.40)}`,
            color: chipColor,
            fontSize: '0.6rem',
            fontWeight: 500,
        }}
    >
        {truncateText(category, 18)}
    </Box>
</Tooltip>
```

- Long names are truncated to **18 characters** with ellipsis.
- The full name is accessible on hover via a `Tooltip`.
- Chip colour is derived from a deterministic colour map keyed on the category name (consistent colour per category across sessions).

---

## 8. Data Flow

### 8.1 Create Category and Upload Template

```
User opens UploadTemplateDialog
        │
        ▼
GET /categories  ───────────────────────────────→  Backend returns category list
        │
        ▼
[User clicks "New"]
        │
        ▼
User types category name → clicks "Add"
        │
        ▼
categoryService.createCategory({ name }, email)
        │
        ▼
POST /categories { "name": "NDA" }
        │
        ├── 201 Created → append to local state, auto-select
        │
        └── 401 (duplicate) → show "Category already exists" error
        │
        ▼  (on success)
form.category = "NDA"
        │
        ▼
User fills template name, clicks "Next: Edit Form Fields"
        │
        ▼
User builds form fields in PDF viewer → clicks "Update Template"
        │
        ▼
POST /templates
{
  "name": "Offer Letter",
  "category": "NDA",        ← category name stored on template
  "fileName": "offer.pdf",
  "formFields": [...],
  "parties": [...]
}
        │
        ├── 201 Created → GET template ID
        │
        ▼
PUT /templates/{id}/file   (binary PDF upload)
        │
        ▼
onSuccess() → reload template list
```

### 8.2 Delete Category

```
User opens dropdown in UploadTemplateDialog / EditTemplateDialog
        │
        ▼
Clicks delete icon on "NDA" option
        │
        ▼
categoryService.deleteCategory("664a1f2e3b0000000000001c")
        │
        ▼
DELETE /categories/664a1f2e3b0000000000001c
        │
        ├── 204 No Content
        │       │
        │       ▼
        │   Remove from local state
        │   If "NDA" was selected → clear form field
        │
        └── 401 (not found) → show "Category not found" error
```

### 8.3 Filter Templates by Category

```
template/page.tsx mounts
        │
        ▼
GET /categories  +  GET /templates  (parallel)
        │
        ▼
setCategories(names)   setTemplates(list)
        │
        ▼
User selects ["NDA", "Service Agreements"] in CompactFilter
        │
        ▼
filteredTemplates = templates.filter(t =>
    selectedCategory.some(f => f.value === t.category)
)
        │
        ▼
Re-render template grid with filtered results
```

---

## 9. Validation Rules

### Client-Side (React / Zod)

| Field | Rule | Schema |
|---|---|---|
| New category name | Required, non-empty after trim | `categoryService.createCategory` guard |
| Template `category` | Required, min 1 character | `templateStep1Schema` (Zod) |
| Template `category` | Must be selected before proceeding to Step 2 | `trigger(['templateName', 'category'])` |

**Zod schema extract:**

```typescript
// src/schemas/templateSchema.ts
export const templateStep1Schema = z.object({
    templateName: z.string()
        .min(1, 'Please enter a template name')
        .max(50, 'Template name must be 50 characters or less'),
    description: z.string()
        .max(200, 'Description must be 200 characters or less'),
    category: z.string()
        .min(1, 'Please select a category'),
});
```

### Server-Side (Spring Boot)

| Rule | HTTP Status |
|---|---|
| Category name must be unique (case-insensitive) | 401 (see §11) |
| Category ID must exist on delete | 401 (see §11) |
| `name` field required on create | 400 |

---

## 10. Error Handling

### `categoryService` Error Normalisation

All methods follow this pattern: network/HTTP errors are caught, logged, and converted into structured return values that components can act on without try/catch.

```typescript
// getAllCategories
on error → return []

// createCategory
on empty name   → return { success: false, message: 'Category name is required' }
on HTTP 401     → return { success: false, message: 'Category already exists' }
on other error  → return { success: false, message: <error text> }

// deleteCategory
on HTTP 401     → return { success: false, message: 'Category not found' }
on other error  → return { success: false, message: <error text> }
```

### Component-Level Handling

| Scenario | UI Response |
|---|---|
| `getAllCategories` fails | Empty dropdown (no crash). User cannot filter by category. |
| `createCategory` duplicate | Inline error message below the new category input. |
| `createCategory` other error | Inline error message. |
| `deleteCategory` not found | Inline error message. Local state unchanged. |
| Template save with category fails | Error alert in dialog. |
| Session expired (401 on any call) | `httpClient` redirects to `/login`. |

---

## 11. Known Behaviours & Quirks

### 11.1 Backend Uses HTTP 401 for Business Logic Errors

The Spring Boot backend returns **HTTP 401** for both:
- Duplicate category name on `POST /categories`
- Category not found on `DELETE /categories/{id}`

HTTP 401 conventionally means *Unauthorised*. The `categoryService` explicitly maps this status to user-friendly messages in the context of these endpoints. A genuine authentication failure on these same routes would also return 401 and be indistinguishable — but in practice, a missing/invalid token causes a redirect before the service logic executes.

### 11.2 Category Stored as Name, Not ID

Templates store `category: string` (the name), not a category ID. Consequences:

- **Renaming a category** on the backend (if ever supported) will not update existing templates — they keep the old name.
- **Deleting a category** leaves orphaned name strings on templates. Those templates remain accessible; they simply do not match any active filter option.
- Category matching in filters is **exact string equality** (case-sensitive).

### 11.3 No Server-Side Category Filter

All category filtering is performed **client-side** after fetching the full template/contract list. There is no `GET /templates?category=NDA` endpoint; the frontend fetches all records and filters in memory.

### 11.4 Categories Are Global

There is no per-user or per-organisation scoping. All users see and can create/delete all categories.

### 11.5 No Category Edit Operation

There is no `PUT /categories/{id}` endpoint. To rename a category, a user must delete the old one and create a new one (with the above consequences for existing templates).

---

## 12. File Reference

| File | Role |
|---|---|
| `src/types/template.ts` | `Category`, `CreateCategoryData`, `Template` type definitions |
| `src/services/categoryService.ts` | Service layer — all category network calls and error normalisation |
| `src/services/apiService.ts` | Template upload/update — sends `category` name in metadata payload |
| `src/lib/httpClient.ts` | HTTP client — JWT injection, response normalisation |
| `src/schemas/templateSchema.ts` | Zod schema — enforces category is required on template form |
| `src/components/template/UploadTemplateDialog.tsx` | Category select/create/delete in upload wizard |
| `src/components/template/EditTemplateDialog.tsx` | Category select/create/delete in edit wizard |
| `src/components/template/TemplateCard.tsx` | Category chip display on template cards |
| `src/app/template/page.tsx` | Template list — category filter |
| `src/app/all-contracts/ContractsTab.tsx` | All contracts — category filter |
| `src/app/all-contracts/DraftTab.tsx` | Drafts tab — category filter |
| `src/app/all-contracts/SignaturesTab.tsx` | Signatures tab — category filter |
| `src/app/contracts/page.tsx` | Contracts page — category filter |
| `src/app/draft/page.tsx` | Drafts page — category filter |
| `src/app/signatures/page.tsx` | Signatures page — category filter |
| `src/app/terminated/page.tsx` | Terminated page — category filter |
| `src/components/contracts/ContractsContent.tsx` | Contracts content — category filter |
