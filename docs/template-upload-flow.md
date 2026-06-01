# Template Upload — Complete Flow Documentation

**Version:** 1.1.0
**Date:** 2026-05-22
**Scope:** Template creation — from basic details to final save, including PDF form builder, party configuration, field assignment, and profile field mapping

> **Access Control:** Template creation and editing is restricted to **admin users** (`isAdmin === true`). Regular users can only use (read) existing templates when creating contracts. The `UploadTemplateDialog` is only accessible to admins. This must be enforced on both the frontend and backend.

---

## Table of Contents

1. [Overview](#1-overview)
2. [Architecture](#2-architecture)
3. [Data Types](#3-data-types)
4. [Step 1 — Basic Details & File Upload](#4-step-1--basic-details--file-upload)
   - 4a. [Category Management](#4a-category-management)
5. [Step 2 — PDF Form Builder](#5-step-2--pdf-form-builder)
6. [Party Configuration](#6-party-configuration)
7. [Field-to-Party Assignment](#7-field-to-party-assignment)
8. [Profile Field Mapping](#8-profile-field-mapping)
9. [Save Flow (End-to-End)](#9-save-flow-end-to-end)
10. [Current API Contracts (Frontend → MongoDB)](#10-current-api-contracts-frontend--mongodb)
11. [MongoDB Document Shape](#11-mongodb-document-shape)
12. [Field Reference](#12-field-reference)
13. [Validation Rules](#13-validation-rules)
14. [Party Color Reference](#14-party-color-reference)
15. [Apryse API Reference](#15-apryse-api-reference)
16. [Backend Implementation Guide](#16-backend-implementation-guide)

---

## 1. Overview

A template is a reusable PDF document with embedded form fields that multiple parties fill and sign. The template upload wizard is a two-step process:

| Step | What Happens |
|---|---|
| **Step 1** | User provides template name, description, category, and uploads a PDF file |
| **Step 2** | Full-screen PDF form builder — user places form fields on the PDF, configures parties, assigns fields to parties, and optionally maps fields to user profile data |

When the user clicks **Save Template**, the system:
1. Exports the XFDF annotation data from the PDF viewer
2. Exports the form field metadata with party assignments
3. Merges profile key mappings into the field metadata
4. Opens the **Profile Field Mapping dialog** (if any text fields exist)
5. Sends the complete data to the backend in **two API calls**: first metadata (JSON), then the raw PDF binary

---

## 2. Architecture

```
┌─────────────────────────────────────────────────────────────────────┐
│                         Browser (Next.js)                           │
│                                                                     │
│  ┌────────────────────────────────────────────────────────────────┐ │
│  │ UploadTemplateDialog.tsx (2-step wizard)                       │ │
│  │                                                                │ │
│  │  Step 1:                          Step 2 (full-screen):        │ │
│  │  ┌──────────────────────┐         ┌────────────────────────┐   │ │
│  │  │ react-hook-form      │         │ PDFViewerContainer.tsx │   │ │
│  │  │ + zod schema         │──Next──▶│ (Apryse Forms mode)   │   │ │
│  │  │ (name, desc,         │         └────────────────────────┘   │ │
│  │  │  category, file)     │                    │                  │ │
│  │  └──────────────────────┘                    │                  │ │
│  │                                   ┌──────────▼────────────┐    │ │
│  │                                   │ PartyAssignmentPanel  │    │ │
│  │                                   │ (right sidebar)       │    │ │
│  │                                   │ - Party management    │    │ │
│  │                                   │ - Field assignment    │    │ │
│  │                                   └──────────┬────────────┘    │ │
│  │                                              │                  │ │
│  │  ┌────────────────────────────────────────────▼──────────────┐ │ │
│  │  │ ProfileFieldMappingDialog.tsx (shown before final save)   │ │ │
│  │  │ - Maps text fields to user profile keys                   │ │ │
│  │  │ - Maps date fields to today's date                        │ │ │
│  │  └────────────────────────────────────────────┬──────────────┘ │ │
│  └──────────────────────────────────────────────-┼────────────────┘ │
│                                                  │                   │
│  ┌───────────────────────────────────────────────▼───────────────┐  │
│  │ templateService.saveTemplate()                                 │  │
│  │   → apiService.uploadTemplate()                                │  │
│  └───────────────────────────────────────────────┬───────────────┘  │
└──────────────────────────────────────────────────┼──────────────────┘
                                                   │
                     ┌─────────────────────────────▼──────────────────┐
                     │  Step A: POST /api/templates                    │
                     │    Body: JSON metadata (no binary)             │
                     │    Response: { id: string }                    │
                     │                                                 │
                     │  Step B: PUT /api/file/{id}?type=template      │
                     │    Body: raw PDF binary (no JSON wrapper)      │
                     │    Response: 200 OK                             │
                     └────────────────────────────────────────────────┘
```

### Layer Responsibilities

| Layer | File | Responsibility |
|---|---|---|
| Wizard UI | `UploadTemplateDialog.tsx` | 2-step wizard, submit orchestration |
| PDF Viewer | `PDFViewerContainer.tsx` | Apryse WebViewer (field creation, XFDF export) |
| Party Sidebar | `PartyAssignmentPanel.tsx` | Party management, field-to-party assignment |
| Party Dialog | `PartyConfigDialog.tsx` | Add/edit party form (label, color, order) |
| Mapping Dialog | `ProfileFieldMappingDialog.tsx` | Maps fields to profile keys or today's date |
| Category Service | `categoryService.ts` | Fetch, create, and delete template categories |
| Service | `templateService.ts` | Thin wrapper calling `apiService` |
| API Client | `apiService.ts` | Two-step HTTP calls (metadata JSON + binary PUT) |
| Validation | `partyValidation.ts` | `groupFieldsByParty()`, `validatePartyFields()` |
| Types | `types/template.ts` | `FormFieldDefinition`, `PartyConfiguration`, `Template`, `UploadTemplateData` |

---

## 3. Data Types

### `FormFieldDefinition`

The core metadata object for each form field placed on the PDF.

```typescript
interface FormFieldDefinition {
    // Identity
    name: string;           // Field identifier, e.g. "client_name", "signature_1"
    type: 'text' | 'signature' | 'checkbox' | 'radio' | 'dropdown' | 'date';
    label?: string;         // Human-readable label shown in UI

    // Position (PDF coordinates)
    x: number;
    y: number;
    width: number;
    height: number;
    pageNumber: number;     // 1-indexed

    // Apryse tracking
    annotationId?: string;  // Unique Apryse annotation ID

    // Field behaviour
    required: boolean;      // Defaults to true
    readOnly?: boolean;
    multiline?: boolean;    // Text fields only
    doNotScroll?: boolean;
    doNotSpellCheck?: boolean;

    // Options
    defaultValue?: string;
    placeholder?: string;
    options?: string[];     // Dropdown/radio choices
    appearance?: string;    // Base64 image for signature placeholder

    // Multi-party assignment (set during Step 2)
    assignedParty?: string;  // "party_1", "party_2", ... or "unassigned"
    partyLabel?: string;     // "Buyer", "Seller", etc. (denormalized label)

    // Profile autofill mapping (set in ProfileFieldMappingDialog)
    profileKey?: string | null;  // LoggedInUser field key, e.g. "fullName", "department"
                                  // or DATE_TODAY_KEY = "__date_today__" for today's date
                                  // null means no mapping
}
```

### `PartyConfiguration`

A signing party — a role that is assigned fields to fill and sign.

```typescript
interface PartyConfiguration {
    id: string;      // "party_1", "party_2", "party_3", ... (auto-generated)
    label: string;   // "Buyer", "Seller", "Witness", etc. (user-defined)
    color: string;   // Hex color for visual distinction, e.g. "#4CAF50"
    order: number;   // Display/sort order within the template builder.
                     // NOT the contract signing sequence — that is set at contract creation.
}
```

### `UploadTemplateData`

The payload assembled by the wizard before calling `apiService.uploadTemplate()`.

```typescript
interface UploadTemplateData {
    name: string;
    description?: string;
    category: string;
    file: File | Blob;       // Raw PDF binary — sent separately in Step B
    fileName: string;        // Original filename, e.g. "contract_template.pdf"
    xfdfData?: string;       // XFDF XML string exported from Apryse
    formFields?: FormFieldDefinition[];  // All fields with party and profile assignments
    parties?: PartyConfiguration[];      // All configured parties
}
```

### `Template` (stored shape after save)

```typescript
interface Template {
    id: string;
    name: string;
    description?: string;
    category: string;
    fileName: string;
    fileUrl: string;           // URL to fetch the binary: /api/file/{id}?type=template
    fileType: 'pdf' | 'docx' | 'doc';
    uploadedBy: string;
    uploadedAt: string;        // ISO date string
    createdAt: string;
    timesUsed: number;
    lastUsed: string;
    xfdfData?: string;         // XFDF annotation data
    formFields?: FormFieldDefinition[];
    hasFormFields?: boolean;   // true when formFields.length > 0
    parties?: PartyConfiguration[];
}
```

---

## 4. Step 1 — Basic Details & File Upload

**Component:** `UploadTemplateDialog.tsx` (initial state, not full-screen)

### Fields

| Field | Type | Required | Rules |
|---|---|---|---|
| Template Name | Text input | Yes | 1–50 characters |
| Description | Textarea | No | Optional free text |
| Category | Dropdown | Yes | Must select from existing categories |
| File | File picker | Yes | PDF files only (for form builder); `.pdf` extension enforced |

### Zod Schema (`templateStep1Schema`)

```typescript
const templateStep1Schema = z.object({
    templateName: z.string()
        .min(1, 'Template name is required')
        .max(50, 'Template name must be at most 50 characters'),
    description: z.string().optional(),
    category: z.string().min(1, 'Category is required'),
});
```

> **Note:** File validation is performed outside the zod schema (checked on the `File` object directly — MIME type and extension).

### User Flow

```
User opens "Upload Template" dialog
        │
        ▼
Fills in: Template Name, Description (optional), Category
        │
        ▼
Selects a PDF file from disk
(File picker enforces .pdf only)
        │
        ▼
Clicks "Next Step"
        │  zod validates name, category
        │  file checked: must be selected, must be PDF
        │  fails? → field errors shown, stays on Step 1
        │  passes ↓
Transitions to Step 2 (full-screen dialog)
```

---

## 4a. Category Management

**Service:** `categoryService.ts` (currently uses `localStorage`; must be migrated to a backend API)

Categories are separate, independently managed entities. They are used to classify templates (e.g., "Legal", "HR", "Finance"). They are **not** baked into the template at creation time — only the category name string is stored on the template document.

### Category Type

```typescript
interface Category {
    id: string;       // Unique ID, e.g. "cat_1684756800000_abc123def"
    name: string;     // Display name, e.g. "Legal"
    createdAt: string; // ISO date string
    createdBy: string; // Email of the user who created it
}
```

### When Categories Are Loaded

When Step 1 opens, the wizard immediately calls `categoryService.getAllCategories()` to populate the category dropdown. This is a `GET` call — it must return all available categories.

```
User opens "Upload Template" dialog
        │
        ▼
useEffect fires → categoryService.getAllCategories()
        │  GET /api/categories  (currently from localStorage)
        │
        ▼
Category dropdown populated with the returned list
```

### Creating a Category Inline (from Step 1)

The admin does not need to leave Step 1 to create a new category. There is an inline "Add category" input directly in the category field:

```
Admin types a new category name in the "Add category" input
        │
        ▼
Clicks the "Add" button
        │
        ▼
categoryService.createCategory({ name: 'New Category' }, userEmail)
        │  POST /api/categories  (currently localStorage write)
        │
        ▼
On success:
  - New category appended to the local list
  - New category auto-selected in the form
  - Input field cleared and hidden
        │
On failure (e.g. duplicate name):
  - Error shown inline: "Category already exists"
```

**Duplicate prevention:** Category names are checked case-insensitively. A category named "Legal" cannot be created if "legal" already exists.

### Deleting a Category (from Step 1)

Each category in the dropdown has a delete icon. Clicking it calls:

```
categoryService.deleteCategory(categoryId)
        │  DELETE /api/categories/{id}  (currently localStorage write)
        │
        ▼
On success:
  - Category removed from the dropdown list
  - If the deleted category was currently selected → selection cleared
        │
On failure:
  - Error shown in the dialog
```

### Category API Contracts (Backend to Implement)

| Method | Path | Purpose |
|---|---|---|
| `GET` | `/categories` | List all categories |
| `POST` | `/categories` | Create a new category |
| `DELETE` | `/categories/{id}` | Delete a category |

**`GET /categories` Response:**
```json
[
  { "id": "cat_123", "name": "Legal", "createdAt": "2026-05-22T10:00:00.000Z", "createdBy": "admin@company.com" },
  { "id": "cat_456", "name": "HR",    "createdAt": "2026-05-22T10:05:00.000Z", "createdBy": "admin@company.com" }
]
```

**`POST /categories` Request:**
```json
{ "name": "Finance", "createdBy": "admin@company.com" }
```

**`POST /categories` Response (201):**
```json
{ "success": true, "category": { "id": "cat_789", "name": "Finance", "createdAt": "...", "createdBy": "admin@company.com" } }
```

**`POST /categories` Error (409 — duplicate):**
```json
{ "success": false, "message": "Category already exists" }
```

**`DELETE /categories/{id}` Response (200):**
```json
{ "success": true, "message": "Category deleted successfully" }
```

> **Note:** Only admins should be allowed to create and delete categories. Regular users can only read them.

---

## 5. Step 2 — PDF Form Builder

**Component:** `UploadTemplateDialog.tsx` (full-screen) + `PDFViewerContainer.tsx` + `PartyAssignmentPanel.tsx`

The dialog expands to full screen. Layout:

```
┌─────────────────────────────────────────────────────────────────────┐
│  Toolbar: [Back] [Template name] [Save Template]                     │
├────────────────────────────────────────┬────────────────────────────┤
│                                        │  Party Panel (right)        │
│  Apryse PDF Viewer                     │  ┌──────────────────────┐  │
│  (Forms toolbar mode)                  │  │ Party 1 — Buyer      │  │
│                                        │  │   • Field A          │  │
│  User drags and drops form             │  │   • Field B          │  │
│  field widgets directly onto           │  ├──────────────────────┤  │
│  the PDF pages:                        │  │ Party 2 — Seller     │  │
│  - Text field                          │  │   • Field C          │  │
│  - Signature field                     │  ├──────────────────────┤  │
│  - Checkbox                            │  │ [+ Add Party]        │  │
│  - Date field                          │  └──────────────────────┘  │
│  - Dropdown                            │                             │
│                                        │  Unassigned fields listed   │
│                                        │  below party cards          │
└────────────────────────────────────────┴────────────────────────────┘
```

### Apryse WebViewer Configuration

- **Mode:** `toolbarGroup-Forms` — Apryse's built-in form creation toolbar is shown
- **Permitted tools:** Form field creation tools (text widget, signature, checkbox, radio, dropdown)
- **Annotation change listener:** Each time the user adds, modifies, or removes a field, a listener fires and updates the React state (`formFields` array) to stay in sync with the viewer

### Field Export (on Save)

When the user clicks **Save Template**, the viewer:

1. **Switches to view mode** (`switchToViewMode()`) — disables form editing so annotations can be read cleanly
2. **Exports XFDF** (`exportAnnotations()`) — returns the full XFDF XML string representing all annotations and widget positions
3. **Exports field metadata** (`exportFormFieldsWithParty()`) — reads each widget annotation and builds a `FormFieldDefinition[]`, copying the `assignedParty` from React state (because party assignment is stored in React state, not in the PDF/XFDF)

> **Important:** `profileKey` is **not** stored in the XFDF or the PDF file. It is stored only in React component state and merged into `FormFieldDefinition[]` just before save. The XFDF only contains field names, types, and positions.

---

## 6. Party Configuration

**Component:** `PartyConfigDialog.tsx` (opened from `PartyAssignmentPanel`)

### What Is a Party?

A party represents a signing role. Examples: "Buyer", "Seller", "Witness", "Guarantor". Each party:
- Has a unique ID (`party_1`, `party_2`, ...)
- Is assigned a color for visual distinction in the UI
- Has an `order` field (used for sorting within the template builder UI)
- Can be assigned multiple form fields (text and signature)

> **Important — Signing Order:** The `order` field stored on the template's `PartyConfiguration` is a **display/sorting hint set during template creation**, not the final signing sequence. The actual signing order is determined and enforced when a **contract is created from this template**. At contract creation time, the admin/user can define which party signs first, second, etc. The `order` stored in the template is carried over as a default suggestion but can be overridden.

### Adding / Editing a Party

When the user clicks **Add Party** or the edit icon on an existing party:

```
PartyConfigDialog opens
        │
        ▼
User fills:
  - Label: "Buyer" (free text, required)
  - Color: selected from a preset palette of 10 colors
  - Order: numeric (1, 2, 3...) — display/sort order in the template builder
            (NOT the final signing sequence; that is set at contract creation)
        │
        ▼
Clicks Save
        │
        ▼
New party pushed to parties[] state with:
  - id: "party_N" where N = parties.length + 1
  - label: user input
  - color: selected hex color
  - order: user input
```

### Party ID Generation

```typescript
const newPartyId = `party_${parties.length + 1}`;
```

IDs are sequential and never reused within a session. If a party is deleted and a new one added, the counter continues from the current length.

### Default Party Colors

| Party ID | Color | Hex |
|---|---|---|
| party_1 | Green | `#4CAF50` |
| party_2 | Blue | `#2196F3` |
| party_3 | Orange | `#FF9800` |
| party_4 | Purple | `#9C27B0` |
| party_5 | Pink | `#E91E63` |
| unassigned | Grey | `#9E9E9E` |

---

## 7. Field-to-Party Assignment

**Component:** `PartyAssignmentPanel.tsx`

### Three Assignment Methods

#### Method 1: Click Assignment
1. User clicks a field card in the Unassigned list
2. A party picker appears (dropdown or inline buttons)
3. User selects a party
4. Field moves to that party's section, card color changes to match party color

#### Method 2: Checkbox Multi-Select
1. User checks one or more field checkboxes in the panel
2. An "Assign to Party" action button appears
3. User selects a party → all checked fields assigned at once

#### Method 3: Drag-and-Drop
1. User drags a field card from the unassigned list
2. Drops it onto a party card in the panel
3. Field is immediately assigned to that party

### Assignment State

Party assignment is stored in React component state as a `Record<string, string>`:
```
{ "field_name": "party_1", "signature_1": "party_2", ... }
```

This map is merged into each `FormFieldDefinition.assignedParty` during the export phase.

### Unassigning a Field

User can drag a field back to the unassigned area, or use the field's context menu to set it to "unassigned".

### Visual Feedback

- Each field card displays the party's color as a left border or background tint
- The party panel shows each party's field count: "Buyer (3 fields)"
- Signature fields are visually distinguished from text fields (icon indicator)

---

## 8. Profile Field Mapping

**Component:** `ProfileFieldMappingDialog.tsx`

### Purpose

Profile field mapping allows fields on the PDF to be pre-filled automatically when a user applies autofill during signing. For example, a "Full Name" text field can be mapped to the `fullName` key from the signer's `LoggedInUser` profile — when they click Autofill, the value is inserted without manual typing.

### When It Appears

After clicking **Save Template**, before the actual API call, if any **non-signature** fields exist, this dialog opens automatically.

```
User clicks "Save Template"
        │
        ▼
exportAnnotations() → xfdfData
exportFormFieldsWithParty() → exportedFormFields[]
        │
        ▼
Any mappable fields? (type !== 'signature' AND type !== 'Sig')
  No → skip dialog, proceed directly to API call
  Yes ↓
ProfileFieldMappingDialog opens
        │
        ▼
User maps fields → clicks "Save Mappings"
        │
        ▼
API call proceeds with updated formFields
```

### Dialog Layout

Fields are grouped by their assigned party. Each party is shown as a labeled `fieldset` with the party's color as the border:

```
┌─ BUYER ──────────────────────────────────────┐
│  client_name          [Full Name          ▼] │
│  contract_date        [Date of Birth      ▼] │
│  department_field     [Department         ▼] │
└──────────────────────────────────────────────┘

┌─ SELLER ─────────────────────────────────────┐
│  seller_name          [— None —           ▼] │
│  pan_number           [PAN Card Number    ▼] │
└──────────────────────────────────────────────┘

┌─ UNASSIGNED ─────────────────────────────────┐
│  witness_name         [— None —           ▼] │
└──────────────────────────────────────────────┘

┌─ 📅 MAP TO TODAY'S DATE ─────────────────────┐
│  Fields filled with current date (DD/MM/YYYY) │
│  [Select fields...                          ] │
│   ✕ contract_date                             │
└──────────────────────────────────────────────┘
```

### Profile Key Options

These are the available `LoggedInUser` keys that a field can be mapped to:

| Display Label | profileKey Value |
|---|---|
| Full Name | `fullName` |
| Email | `email` |
| Department | `department` |
| Organization | `organization` |
| Date of Birth | `dateOfBirth` |
| Gender | `gender` |
| Permanent Address | `permanentAddress` |
| PAN Card Number | `panCardNumber` |
| Aadhar Card Number | `aadharCardNumber` |

### Today's Date Mapping

A special mapping (`DATE_TODAY_KEY = "__date_today__"`) fills the field with the current date in `DD/MM/YYYY` format when autofill runs. This is separate from the profile key dropdown — it uses a multi-select Autocomplete.

**Mutual exclusivity:** A field can have either a profile key OR a today's date mapping, never both. Setting one clears the other.

### Mapping Result

When the user clicks **Save Mappings**, the dialog calls `onSave(updatedFields: FormFieldDefinition[])` with:

- Signature fields: unchanged (profileKey not applicable)
- Text/other fields with a profile key selected: `profileKey = "fullName"` (or whichever key)
- Text/other fields mapped to today's date: `profileKey = "__date_today__"`
- Text/other fields with no mapping: `profileKey = null`

---

## 9. Save Flow (End-to-End)

### Complete Sequence

```
User clicks "Save Template"
        │
        ▼
[1] switchToViewMode()
    Apryse transitions from edit to view mode
    Ensures all annotation changes are committed
        │
        ▼
[2] exportAnnotations()
    Returns: xfdfData (XFDF XML string)
    Contains: all field widget positions, types, names
    Does NOT contain: party assignments or profileKey
        │
        ▼
[3] exportFormFieldsWithParty()
    For each Apryse widget annotation:
      - Reads: name, type, x, y, width, height, pageNumber
      - Reads: annotationId
      - Copies: assignedParty from React state map
    Returns: FormFieldDefinition[] (without profileKey yet)
        │
        ▼
[4] Merge profileKey from React state
    For each field in exportedFormFields:
      field.profileKey = profileKeyState[field.name] ?? null
    (profileKeyState is updated by ProfileFieldMappingDialog)
        │
        ▼
[5] Check for mappable fields
    mappableFields = exportedFormFields.filter(
      f => f.type !== 'signature' && f.type !== 'Sig'
    )
        │
        ├── No mappable fields → skip to [7]
        │
        └── Has mappable fields ↓
[6] ProfileFieldMappingDialog opens
    User assigns profile keys or date mappings to fields
    User clicks "Save Mappings"
    → onSave(updatedFormFields) called
    finalFormFields = updatedFormFields (with profileKey set)
        │
        ▼
[7] executeSave(finalFormFields)
    Assemble UploadTemplateData:
    {
      name:        templateName (from Step 1 form)
      description: description (from Step 1 form)
      category:    category (from Step 1 form)
      fileName:    file.name (original filename)
      file:        file (File/Blob — raw PDF binary)
      xfdfData:    xfdfData (XFDF XML string)
      formFields:  finalFormFields (FormFieldDefinition[])
      parties:     parties[] (PartyConfiguration[])
    }
        │
        ▼
templateService.saveTemplate(data, userEmail)
        │
        ▼
apiService.uploadTemplate(data)
        │
        ├── [8a] POST /api/templates
        │   Body (JSON):
        │   {
        │     name, description, category, fileName,
        │     fileType: 'pdf',
        │     uploadedBy: 'user',
        │     xfdfData: string,
        │     formFields: FormFieldDefinition[],
        │     parties: PartyConfiguration[]
        │   }
        │   Response: { success: true, id: "<mongodb-id>", message: string }
        │
        └── [8b] PUT /api/file/{id}?type=template&format=pdf
            Body: raw File/Blob binary (no JSON, no FormData wrapper)
            Response: 200 OK
        │
        ▼
{ success: true, id: string, message: 'Template uploaded successfully' }
        │
        ▼
Dialog closes
Template appears in the template list
```

### Save Failure

```
Any step fails (network, validation, etc.)
        │
        ▼
{ success: false, message: string }
        │
        ▼
Error snackbar shown
Dialog stays open — user can retry
```

---

## 10. Current API Contracts (Frontend → MongoDB)

> **Context for backend team:** These are the API routes currently implemented in the Next.js frontend calling MongoDB directly. The backend will replace these with its own implementations. The request/response shapes documented here are what the frontend currently produces and expects.

### `POST /api/templates` — Create Template Metadata

**Request body (JSON):**

```json
{
  "name": "NDA Agreement",
  "description": "Standard non-disclosure agreement template",
  "category": "Legal",
  "fileName": "nda_template.pdf",
  "fileType": "pdf",
  "uploadedBy": "user",
  "xfdfData": "<?xml version=\"1.0\"...>...",
  "formFields": [
    {
      "name": "client_name",
      "type": "text",
      "x": 100,
      "y": 200,
      "width": 200,
      "height": 30,
      "pageNumber": 1,
      "required": true,
      "assignedParty": "party_1",
      "partyLabel": "Buyer",
      "profileKey": "fullName"
    },
    {
      "name": "signature_1",
      "type": "signature",
      "x": 100,
      "y": 700,
      "width": 150,
      "height": 60,
      "pageNumber": 1,
      "required": true,
      "assignedParty": "party_1",
      "partyLabel": "Buyer",
      "profileKey": null
    }
  ],
  "parties": [
    { "id": "party_1", "label": "Buyer",  "color": "#4CAF50", "order": 1 },
    { "id": "party_2", "label": "Seller", "color": "#2196F3", "order": 2 }
  ]
}
```

**Response (200):**

```json
{
  "success": true,
  "id": "6649a1b2c3d4e5f6a7b8c9d0",
  "message": "Template metadata created. Please upload binary."
}
```

**Validation:**
- `name` and `category` are required; returns `400` if missing
- `formFields` and `parties` can be empty arrays but must be present

---

### `PUT /api/file/{id}?type=template&format=pdf` — Upload Binary

**Request:**
- Method: `PUT`
- URL params: `type=template`, `format=pdf`
- Body: raw `File` or `Blob` — **no JSON wrapper, no FormData**
- Content-Type: `application/pdf` (browser sets this automatically for `File` objects)

**Response (200):**

```json
{ "success": true }
```

The binary is stored in the `pdf` field of the template document as a MongoDB Binary/Buffer.

---

### `GET /api/templates` — List All Templates

**Response (200):** Array of `Template` objects — binary fields (`pdf`, `docx`, `fileData`) are **excluded** from the list response for performance.

```json
[
  {
    "id": "6649a1b2c3d4e5f6a7b8c9d0",
    "name": "NDA Agreement",
    "category": "Legal",
    "fileName": "nda_template.pdf",
    "fileType": "pdf",
    "fileUrl": "/api/file/6649a1b2c3d4e5f6a7b8c9d0?type=template",
    "uploadedBy": "user",
    "createdAt": "2026-05-22T10:30:00.000Z",
    "updatedAt": "2026-05-22T10:30:00.000Z",
    "timesUsed": 0,
    "hasFormFields": true,
    "xfdfData": "<?xml version...",
    "formFields": [...],
    "parties": [...]
  }
]
```

---

### `GET /api/file/{id}?type=template` — Fetch Binary PDF

Returns the raw binary PDF file. Used by Apryse to load the template into the viewer.

---

### `PUT /api/templates/{id}` — Update Template Metadata

Same body shape as the POST, but targets an existing template. Binary is updated via a separate `PUT /api/file/{id}` call if the file was changed.

---

### `DELETE /api/templates/{id}` — Delete Template

**Response (200):**
```json
{ "success": true, "message": "Template deleted" }
```

---

## 11. MongoDB Document Shape

The template is stored in the `templates` collection. This is the complete document shape the backend should mirror:

```json
{
  "_id": ObjectId("6649a1b2c3d4e5f6a7b8c9d0"),
  "name": "NDA Agreement",
  "description": "Standard non-disclosure agreement template",
  "category": "Legal",
  "fileName": "nda_template.pdf",
  "fileType": "pdf",
  "uploadedBy": "user@example.com",
  "createdAt": "2026-05-22T10:30:00.000Z",
  "updatedAt": "2026-05-22T10:30:00.000Z",
  "timesUsed": 0,
  "hasFormFields": true,
  "xfdfData": "<?xml version=\"1.0\" encoding=\"UTF-8\"?>...",
  "formFields": [
    {
      "name": "client_name",
      "type": "text",
      "label": "Client Name",
      "x": 100,
      "y": 200,
      "width": 200,
      "height": 30,
      "pageNumber": 1,
      "annotationId": "ann_abc123",
      "required": true,
      "readOnly": false,
      "multiline": false,
      "assignedParty": "party_1",
      "partyLabel": "Buyer",
      "profileKey": "fullName"
    },
    {
      "name": "signature_buyer",
      "type": "signature",
      "x": 100,
      "y": 700,
      "width": 150,
      "height": 60,
      "pageNumber": 1,
      "required": true,
      "assignedParty": "party_1",
      "partyLabel": "Buyer",
      "profileKey": null
    },
    {
      "name": "contract_date",
      "type": "text",
      "x": 400,
      "y": 100,
      "width": 120,
      "height": 30,
      "pageNumber": 1,
      "required": true,
      "assignedParty": "party_1",
      "partyLabel": "Buyer",
      "profileKey": "__date_today__"
    }
  ],
  "parties": [
    { "id": "party_1", "label": "Buyer",  "color": "#4CAF50", "order": 1 },
    { "id": "party_2", "label": "Seller", "color": "#2196F3", "order": 2 }
  ],
  "pdf": Binary(/* raw PDF bytes */),
  "docx": null
}
```

> **List endpoint behavior:** When returning templates in a list, omit `pdf`, `docx`, `fileData`, and `docxBase64` from the response. These are large binary fields — serve them only via the dedicated `/file/{id}` endpoint.

---

## 12. Field Reference

### `FormFieldDefinition` — Field-by-Field

| Field | Type | Set By | Description |
|---|---|---|---|
| `name` | `string` | Apryse | Unique widget name. Must be unique within the template |
| `type` | `string` | Apryse | `text`, `signature`, `checkbox`, `radio`, `dropdown`, `date` |
| `label` | `string?` | Apryse | Human-readable label on the field. Falls back to `name` in UI |
| `x` | `number` | Apryse | X coordinate in PDF points |
| `y` | `number` | Apryse | Y coordinate in PDF points |
| `width` | `number` | Apryse | Width in PDF points |
| `height` | `number` | Apryse | Height in PDF points |
| `pageNumber` | `number` | Apryse | Page number, 1-indexed |
| `annotationId` | `string?` | Apryse | Internal Apryse annotation ID |
| `required` | `boolean` | Apryse/default | Default `true`. If `false`, field is optional |
| `readOnly` | `boolean?` | Apryse | Field is read-only |
| `multiline` | `boolean?` | Apryse | Text field accepts multiple lines |
| `options` | `string[]?` | Apryse | Choices for dropdown/radio fields |
| `assignedParty` | `string?` | React state | Party ID (`party_1`) or `unassigned` |
| `partyLabel` | `string?` | React state | Denormalized party label (`Buyer`) |
| `profileKey` | `string\|null?` | ProfileFieldMappingDialog | `LoggedInUser` key, `__date_today__`, or `null` |

### `PartyConfiguration` — Field-by-Field

| Field | Type | Set By | Description |
|---|---|---|---|
| `id` | `string` | Auto-generated | `party_1`, `party_2`, ... — never changes after creation |
| `label` | `string` | User input | `Buyer`, `Seller`, `Witness`, etc. |
| `color` | `string` | User selection | Hex color. Default: mapped by `party_N` index |
| `order` | `number` | User input | Display/sort order in the template builder. **Not** the signing sequence — signing order is set at contract creation time. |

---

## 13. Validation Rules

### Step 1 Form

| Field | Rule |
|---|---|
| `name` | Required. 1–50 characters |
| `category` | Required. Must select from list |
| `file` | Required. Must be a `.pdf` file |

### Party Configuration

| Field | Rule |
|---|---|
| `label` | Required. Non-empty string |
| `color` | Required. Must be a valid hex color from the preset palette |
| `order` | Required. Positive integer. Must be unique among parties |

### Profile Key Assignment

- Each field can have at most one mapping: either a `profileKey` or the `__date_today__` mapping — never both
- Signature fields (`type === 'signature'` or `type === 'Sig'`) cannot have a `profileKey`
- If no mapping is desired, `profileKey` should be `null`

### Party Assignment

- A field can be assigned to exactly one party (or `unassigned`)
- Multiple fields can be assigned to the same party
- When a party is deleted, its fields become `unassigned`

---

## 14. Party Color Reference

These default colors are used when parties are created. The frontend assigns them automatically based on the party ID, but users can override the color in `PartyConfigDialog`.

| Party ID | Color Name | Hex |
|---|---|---|
| `party_1` | Green | `#4CAF50` |
| `party_2` | Blue | `#2196F3` |
| `party_3` | Orange | `#FF9800` |
| `party_4` | Purple | `#9C27B0` |
| `party_5` | Pink | `#E91E63` |
| `unassigned` | Grey | `#9E9E9E` |

---

## 15. Apryse API Reference

> **For the backend team:** All Apryse APIs listed here are **frontend-only, browser-only** calls to the Apryse WebViewer SDK (`@pdftron/webviewer`). The backend never calls Apryse directly. What the backend stores is the **output** of these calls: the XFDF string, the `FormFieldDefinition[]` array, and the raw PDF binary. This section exists so the backend team can clearly distinguish which actions happen inside the browser versus which data gets persisted to the server.

### PDFViewerContainer Handle Methods

These are methods exposed by `PDFViewerContainer.tsx` via `useImperativeHandle`. They are called by the parent (`UploadTemplateDialog`) to orchestrate the export process.

| Method | Signature | When Called | What It Does |
|---|---|---|---|
| `switchToViewMode` | `() => Promise<boolean>` | First thing on "Save Template" click | Switches Apryse from Forms editing mode to View/Pan mode. Ensures all in-progress annotation edits are committed before export. |
| `exportAnnotations` | `(fieldValues?, options?) => Promise<{ blob: Blob, xfdfString: string } \| null>` | After `switchToViewMode` succeeds | Exports all annotations as an XFDF XML string and a PDF Blob. The `xfdfString` is stored in the database; the `blob` is the PDF binary sent via the file upload call. |
| `exportFormFieldsWithParty` | `() => Promise<FormFieldDefinitionWithParty[]>` | After `exportAnnotations` | Reads each widget annotation from the viewer and returns a structured array of field metadata including the `assignedParty` from React state. This is the `formFields[]` array stored in the database. |
| `exportFormFields` | `() => Promise<any[]>` | Fallback if `exportFormFieldsWithParty` fails | Same as above but without party data. Used as a fallback only. |
| `getAllFieldPartyAssignments` | `() => Record<string, { partyId, partyLabel }>` | Logged after export for debug | Returns the in-memory map of fieldName → party assignment. Not sent to the backend directly — party data is already in the `exportFormFieldsWithParty()` result. |
| `assignFieldToParty` | `(fieldName, partyId, partyLabel, partyColor) => boolean` | When user assigns a field in the panel | Updates the field's visual appearance in the viewer (border color, background tint) and updates in-memory party assignment state. Returns `true` if successful. |
| `highlightPartyFields` | `(partyId \| null) => void` | When user hovers/focuses a party in the panel | Highlights all fields belonging to the specified party in the viewer. Pass `null` to clear highlights. |
| `setToolbarGroup` | `(group: string) => void` | During save and initialization | Switches the active toolbar ribbon. Values: `'toolbarGroup-Forms'` (editing), `'toolbarGroup-View'` (view/read-only). |
| `setToolMode` | `(mode: string) => void` | After switching to view mode | Sets the active annotation tool. `'Pan'` is used to enter read-only pan mode. |
| `autofillFields` | `(partyId, profileData) => number` | During contract signing (not template creation) | Fills all fields assigned to the given party with values from the user's profile data. Returns the count of fields filled. |

### Underlying Apryse Core APIs (used inside PDFViewerContainer)

These are called directly against the Apryse SDK internals, not exposed via the handle.

**Initialization:**
```typescript
WebViewer({ path: '/webviewer/lib', initialDoc: url, ... }, divElement)
// Returns: { Core, UI }
// The Core/UI objects are the root of all Apryse operations
```

**UI namespace — toolbar control:**
```typescript
UI.setActiveRibbonItem('toolbarGroup-Forms')  // WebViewer 11+ Modular UI
UI.setToolbarGroup('toolbarGroup-Forms')       // Legacy UI fallback
UI.setToolMode('Pan')                          // Set active tool
```

**Core.annotationManager — annotation operations:**
```typescript
annotationManager.getAnnotationsList()          // Returns all annotations on the document
annotationManager.deselectAllAnnotations()      // Deselect all (used before export to commit pending edits)
annotationManager.getFieldManager()             // Returns the FieldManager for form fields
annotationManager.exportAnnotations()           // Returns XFDF XML string (async)
annotationManager.importAnnotations(xfdf)       // Load XFDF into the document (async)
```

**FieldManager — form field operations:**
```typescript
fieldManager.getFields()                        // Returns all Field objects in the document
```

**Field (individual form field object):**
```typescript
field.name                                      // Field name string (same as FormFieldDefinition.name)
field.getValue()                                // Current field value
field.setValue(value)                           // Set field value
field.commit(value, widget?)                    // Force-commit a value change into the PDF data
field.widgets                                   // Array of WidgetAnnotation objects linked to this field
```

**Annotation classes used for type checking:**
```typescript
Core.Annotations.SignatureWidgetAnnotation      // Signature field widget
Core.Annotations.WidgetAnnotation              // Base class for all form field widgets
Core.Annotations.FreeHandAnnotation            // Freehand/ink drawn signature
Core.Annotations.StampAnnotation               // Image/stamp signature
```

### What the Backend Receives

To be clear — after all the Apryse operations complete, the backend receives **only**:

| Data | Format | How It Got There |
|---|---|---|
| `xfdfData` | XML string | `annotationManager.exportAnnotations()` via `exportAnnotations()` handle method |
| `formFields[]` | `FormFieldDefinition[]` JSON | `exportFormFieldsWithParty()` handle method — reads widget annotations and merges React state |
| `parties[]` | `PartyConfiguration[]` JSON | Pure React state — never touches Apryse directly |
| PDF binary | Raw `Blob` / `File` | `exportAnnotations()` also returns a PDF `blob` containing the annotated document |

The backend does **not** need to parse XFDF, interpret annotations, or call any Apryse SDK. It stores the XFDF as an opaque string and returns it verbatim when a client loads the template.

---

## 16. Backend Implementation Guide

This section summarizes what the backend needs to implement to replace the current MongoDB-direct routes.

### Access Control

| Operation | Who Can Do It |
|---|---|
| Create template | Admin only (`isAdmin === true`) |
| Edit template | Admin only |
| Delete template | Admin only |
| List templates | All authenticated users |
| View/use template (read) | All authenticated users |
| Create category | Admin only |
| Delete category | Admin only |
| List categories | All authenticated users |

### Endpoints Required

**Templates:**

| Method | Path | Purpose |
|---|---|---|
| `POST` | `/templates` | Create template metadata; return `{ id }` — admin only |
| `PUT` | `/templates/{id}/file` | Upload raw PDF binary — admin only |
| `GET` | `/templates` | List all templates (no binary fields) — all authenticated users |
| `GET` | `/templates/{id}` | Get single template metadata — all authenticated users |
| `GET` | `/templates/{id}/file` | Serve raw PDF binary — all authenticated users |
| `PUT` | `/templates/{id}` | Update template metadata — admin only |
| `DELETE` | `/templates/{id}` | Delete template — admin only |

**Categories:**

| Method | Path | Purpose |
|---|---|---|
| `GET` | `/categories` | List all categories — all authenticated users |
| `POST` | `/categories` | Create a new category — admin only |
| `DELETE` | `/categories/{id}` | Delete a category — admin only |

> **Note:** The frontend currently uses `/api/file/{id}?type=template` for the binary endpoint. The backend can define its own path — update `apiService.ts` to point to the new URL.

### Critical Data Considerations

1. **Two-step save must be atomic from the user's perspective.** If the metadata POST succeeds but the binary PUT fails, the template record exists but has no PDF. The backend should handle partial uploads (e.g., mark the template as `incomplete` and clean up orphaned records).

2. **`xfdfData` is the source of truth for field positions.** It is an XFDF XML string. The `formFields[]` array is a parsed/structured representation — both should be stored. Apryse uses `xfdfData` to re-render fields; the backend/contract system uses `formFields[]` for field metadata queries.

3. **`profileKey` is metadata-only.** It is stored in `formFields[].profileKey` and never in the XFDF. When the contract is created from a template, the frontend reads this key to autofill values from the current user's profile.

4. **`parties[]` ordering.** The `order` field on the template's `PartyConfiguration` is a **display/sort hint set during template creation**, not the final enforced signing sequence. The actual signing order (who signs before whom) is configured when a **contract is created from this template**. Store the `order` value as-is — it is carried over as a default suggestion at contract creation time and can be overridden there.

5. **Binary storage:** The PDF binary should be stored in a blob/object store (S3, GCS, etc.) or database binary field. The list endpoint **must not** include the binary in responses — only metadata. Provide a separate endpoint to stream the binary.

6. **`timesUsed` counter:** Increment this counter each time a contract is created from this template.

### Request/Response Shape Summary

#### `POST /templates` Request
```json
{
  "name": "string (required, 1-50 chars)",
  "description": "string (optional)",
  "category": "string (required)",
  "fileName": "string (required)",
  "fileType": "pdf",
  "uploadedBy": "string (user email or ID)",
  "xfdfData": "string (XFDF XML)",
  "formFields": [/* FormFieldDefinition[] */],
  "parties": [/* PartyConfiguration[] */]
}
```

#### `POST /templates` Response
```json
{ "id": "string", "message": "string" }
```

#### `PUT /templates/{id}/file` Request
- Raw binary body (`application/pdf`)
- No JSON wrapper

#### `PUT /templates/{id}/file` Response
```json
{ "success": true }
```

#### `GET /templates` Response
```json
[
  {
    "id": "string",
    "name": "string",
    "description": "string",
    "category": "string",
    "fileName": "string",
    "fileType": "pdf",
    "fileUrl": "string (URL to fetch binary)",
    "uploadedBy": "string",
    "createdAt": "ISO date string",
    "updatedAt": "ISO date string",
    "timesUsed": 0,
    "hasFormFields": true,
    "xfdfData": "string",
    "formFields": [/* FormFieldDefinition[] */],
    "parties": [/* PartyConfiguration[] */]
  }
]
```
