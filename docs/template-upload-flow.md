# Template Integration

**Document Type:** Technical Integration Reference  
**System:** Contract Management System (CMS)  
**Module:** Template Management  
**Stack:** Next.js 16 · React 19 · TypeScript · Spring Boot · MinIO · Apryse WebViewer v11 · MUI v7  
**Status:** Production  
**Last Updated:** 2026-06-02

---

## Table of Contents

1. [Overview](#1-overview)
2. [Architecture](#2-architecture)
3. [Access Control](#3-access-control)
4. [Data Models](#4-data-models)
   - 4.1 [Template](#41-template)
   - 4.2 [FormFieldDefinition](#42-formfielddefinition)
   - 4.3 [PartyConfiguration](#43-partyconfiguration)
   - 4.4 [UploadTemplateData](#44-uploadtemplatedata)
5. [Template Lifecycle](#5-template-lifecycle)
6. [Upload Wizard — Step 1: Basic Details](#6-upload-wizard--step-1-basic-details)
   - 6.1 [Form Fields & Validation](#61-form-fields--validation)
   - 6.2 [Category Management](#62-category-management)
   - 6.3 [File Upload](#63-file-upload)
   - 6.4 [Step Transition](#64-step-transition)
7. [Upload Wizard — Step 2: PDF Form Builder](#7-upload-wizard--step-2-pdf-form-builder)
   - 7.1 [Viewer Configuration](#71-viewer-configuration)
   - 7.2 [Adding Form Fields](#72-adding-form-fields)
   - 7.3 [Party Configuration](#73-party-configuration)
   - 7.4 [Field-to-Party Assignment](#74-field-to-party-assignment)
   - 7.5 [Profile Field Mapping](#75-profile-field-mapping)
8. [Save Flow — Upload](#8-save-flow--upload)
   - 8.1 [PDF & XFDF Export](#81-pdf--xfdf-export)
   - 8.2 [Binary Upload — Size-Gated Strategy](#82-binary-upload--size-gated-strategy)
   - 8.3 [Chunked Multipart Upload](#83-chunked-multipart-upload)
   - 8.4 [Single-Shot Upload](#84-single-shot-upload)
9. [Edit Template Flow](#9-edit-template-flow)
   - 9.1 [Step 1 — Edit Basic Details](#91-step-1--edit-basic-details)
   - 9.2 [Step 2 — Edit Form Fields](#92-step-2--edit-form-fields)
   - 9.3 [Save Flow — Edit](#93-save-flow--edit)
   - 9.4 [profileKey Preservation](#94-profilekey-preservation)
10. [Template Viewing](#10-template-viewing)
11. [API Reference](#11-api-reference)
    - 11.1 [POST /templates](#111-post-templates)
    - 11.2 [GET /templates](#112-get-templates)
    - 11.3 [GET /templates/{id}](#113-get-templatesid)
    - 11.4 [PUT /templates/{id}](#114-put-templatesid)
    - 11.5 [DELETE /templates/{id}](#115-delete-templatesid)
    - 11.6 [PUT /templates/{id}/file — Single-Shot](#116-put-templatesidfile--single-shot)
    - 11.7 [POST /templates/{id}/file/initiate — Chunked Upload](#117-post-templatesidfileinitiate--chunked-upload)
    - 11.8 [GET /templates/{id}/file/presign — Chunked Upload](#118-get-templatesidfilepresign--chunked-upload)
    - 11.9 [POST /templates/{id}/file/complete — Chunked Upload](#119-post-templatesidfilecomplete--chunked-upload)
    - 11.10 [GET /templates/{id}/file/view-url](#1110-get-templatesidfileview-url)
12. [Service Layer](#12-service-layer)
13. [Validation Reference](#13-validation-reference)
14. [Error Handling](#14-error-handling)
15. [Apryse WebViewer Reference](#15-apryse-webviewer-reference)
16. [Party Color Reference](#16-party-color-reference)
17. [File Reference](#17-file-reference)

---

## 1. Overview

A **Template** is a reusable PDF document with embedded interactive form fields that multiple parties fill and sign. Templates are the foundation of the contract workflow — every contract is derived from a template.

The template management module provides:

- **Upload Wizard** — a two-step flow for creating a new template with a PDF form builder, party configuration, field assignment, and profile field mapping.
- **Edit Wizard** — the same two-step flow for modifying an existing template's metadata and form fields.
- **Viewing** — loading the template PDF into a read-only viewer using MinIO presigned URLs.
- **Deletion** — removing a template record and its binary from storage.

**Binary storage** is handled by **MinIO** (object storage). The Spring Boot backend manages presigned URLs for both upload and download. The Next.js layer never holds the binary in memory beyond the browser — it uploads directly to MinIO using presigned URLs.

---

## 2. Architecture

```
┌──────────────────────────────────────────────────────────────────────────┐
│                          Browser / React                                 │
│                                                                          │
│  template/page.tsx ─────────────────────────────────────────────────┐   │
│  UploadTemplateDialog.tsx (2-step wizard)                            │   │
│  EditTemplateDialog.tsx   (2-step wizard)                            │   │
│  DocumentViewerDialog.tsx (read-only viewer)                         │   │
│                                                                      │   │
│  ┌────────────────────┐  ┌───────────────────┐  ┌─────────────────┐ │   │
│  │  Step 1            │  │  Step 2           │  │  Right Sidebar  │ │   │
│  │  react-hook-form   │  │  PDFViewer        │  │  Party          │ │   │
│  │  + Zod schema      │→ │  Container.tsx    │  │  Assignment     │ │   │
│  │  name, desc,       │  │  (Apryse Forms    │  │  Panel.tsx      │ │   │
│  │  category, file    │  │   mode)           │  │                 │ │   │
│  └────────────────────┘  └───────────────────┘  └─────────────────┘ │   │
│                                     │                                │   │
│                          ProfileFieldMappingDialog.tsx               │   │
│                          (shown before final save)                   │   │
│                                     │                                │   │
│                          templateService.ts                          │   │
│                          apiService.ts                               │   │
└──────────────────────────────────────┬───────────────────────────────┘   │
                                       │ HTTP/JSON + raw binary (PUT)
                        ┌──────────────▼─────────────────────┐
                        │      Spring Boot Backend            │
                        │      localhost:8080                 │
                        │                                     │
                        │  POST /templates          (meta)    │
                        │  PUT  /templates/{id}     (meta)    │
                        │  GET  /templates                    │
                        │  GET  /templates/{id}               │
                        │  DELETE /templates/{id}             │
                        │                                     │
                        │  PUT  /templates/{id}/file    ──────┼──→ MinIO
                        │  POST /templates/{id}/file/        │     (small files)
                        │       initiate                ──────┼──→ MinIO
                        │  GET  /templates/{id}/file/        │     (chunked)
                        │       presign                 ──────┼──→ MinIO presign
                        │  POST /templates/{id}/file/        │
                        │       complete                ──────┼──→ MinIO complete
                        │  GET  /templates/{id}/file/        │
                        │       view-url                ──────┼──→ MinIO presigned
                        └────────────────────────────────────┘     GET URL
```

### Layer Responsibilities

| Layer | File | Responsibility |
|---|---|---|
| **Page** | `src/app/template/page.tsx` | Template list, filters, card grid, action triggers |
| **Upload Wizard** | `src/components/template/UploadTemplateDialog.tsx` | 2-step upload wizard |
| **Edit Wizard** | `src/components/template/EditTemplateDialog.tsx` | 2-step edit wizard |
| **Viewer Dialog** | `src/components/viewer/DocumentViewerDialog.tsx` | Read-only PDF viewer |
| **PDF Viewer** | `src/components/viewer/PDFViewerContainer.tsx` | Apryse WebViewer v11 wrapper |
| **Party Sidebar** | `src/components/template/PartyAssignmentPanel.tsx` | Party display & field-to-party assignment |
| **Party Dialog** | `src/components/template/PartyConfigDialog.tsx` | Add/edit party (label, color, order) |
| **Mapping Dialog** | `src/components/template/ProfileFieldMappingDialog.tsx` | Map fields to profile keys or today's date |
| **Template Card** | `src/components/template/TemplateCard.tsx` | Card display in the template grid |
| **Category Service** | `src/services/categoryService.ts` | Fetch, create, delete categories |
| **Template Service** | `src/services/templateService.ts` | Thin wrapper over `apiService` |
| **API Client** | `src/services/apiService.ts` | HTTP calls: metadata JSON + binary upload (size-gated) |
| **View URL Util** | `src/utils/getTemplateViewUrl.ts` | Fetch MinIO presigned view URL |
| **Types** | `src/types/template.ts` | All template-related TypeScript interfaces |
| **Schema** | `src/schemas/templateSchema.ts` | Zod validation schema for Step 1 |

---

## 3. Access Control

Template management is restricted to **admin users** (`isAdmin === true`). Regular (non-admin) users may only read and use templates when creating contracts.

| Operation | Admin | Regular User |
|---|---|---|
| Upload new template | ✓ | ✗ |
| Edit template | ✓ | ✗ |
| Delete template | ✓ | ✗ |
| List templates | ✓ | ✓ |
| View template (read-only) | ✓ | ✓ |
| Use template in contract | ✓ | ✓ |
| Create category | ✓ | ✗ |
| Delete category | ✓ | ✗ |
| List categories | ✓ | ✓ |

The `UploadTemplateDialog` and edit controls on `TemplateCard` are conditionally rendered only when `currentUser.isAdmin === true`. The backend enforces the same rules on every mutating endpoint.

---

## 4. Data Models

### 4.1 Template

**File:** `src/types/template.ts`

The full template object as returned by `GET /templates` and stored after creation.

```typescript
interface Template {
    id: string;                        // Opaque backend ID
    name: string;                      // Display name, max 50 chars
    description?: string;              // Optional description, max 200 chars
    category: string;                  // Category name string (not ID)
    fileName: string;                  // Original uploaded filename, e.g. "nda.pdf"
    fileUrl: string;                   // URL to fetch binary (served by backend or MinIO)
    fileType: 'pdf' | 'docx' | 'doc'; // File type; only "pdf" supports the form builder
    uploadedBy: string;                // Email of the admin who created the template
    uploadedAt: string;                // ISO 8601 timestamp of upload
    createdAt: string;                 // ISO 8601 creation timestamp
    updatedAt?: string;                // ISO 8601 last-update timestamp
    timesUsed: number;                 // Count of contracts created from this template
    lastUsed: string;                  // ISO 8601 timestamp of most recent contract creation
    xfdfData?: string;                 // XFDF XML string exported from Apryse (field positions/annotations)
    formFields?: FormFieldDefinition[];// Structured form field metadata with party & profile assignments
    hasFormFields?: boolean;           // Quick boolean: true when formFields.length > 0
    parties?: PartyConfiguration[];    // Signing party configurations
    fileUploaded?: boolean;            // true = binary stored in MinIO; false = legacy/incomplete upload
    fileData?: string;                 // Legacy: base64 PDF (pre-MinIO); used as fallback viewer source
    docxBase64?: string;               // Base64 DOCX for DOCX-type templates
    content?: string;                  // Extracted text content
}
```

### 4.2 FormFieldDefinition

The metadata object for each interactive form field placed on the PDF.

```typescript
interface FormFieldDefinition {
    // Identity
    name: string;           // Unique field identifier, e.g. "client_name", "signature_1"
    type: 'text' | 'signature' | 'checkbox' | 'radio' | 'dropdown' | 'date';
    label?: string;         // Human-readable label; falls back to `name` in UI

    // Position (PDF coordinate space)
    x: number;              // X coordinate in PDF points
    y: number;              // Y coordinate in PDF points
    width: number;          // Width in PDF points
    height: number;         // Height in PDF points
    pageNumber: number;     // 1-indexed page number

    // Apryse tracking
    annotationId?: string;  // Internal Apryse annotation ID

    // Field behaviour
    required: boolean;      // Defaults to true
    readOnly?: boolean;
    multiline?: boolean;    // Text fields only — allows multi-line input
    doNotScroll?: boolean;
    doNotSpellCheck?: boolean;

    // Value properties
    defaultValue?: string;
    placeholder?: string;
    options?: string[];     // Choices for dropdown / radio fields

    // Multi-party assignment (set in PartyAssignmentPanel, stored in React state)
    assignedParty?: string;  // "party_1", "party_2", ... or "unassigned"
    partyLabel?: string;     // Denormalised label, e.g. "Buyer"
    partyColor?: string;     // Denormalised hex color, e.g. "#4CAF50"

    // Profile autofill mapping (set in ProfileFieldMappingDialog)
    // string key from LoggedInUser profile, "__date_today__" for today's date, or null
    profileKey?: string | null;
}
```

> **Important:** `assignedParty`, `partyLabel`, and `profileKey` are **never** stored inside the XFDF or the PDF binary. They live in React component state and are merged into the exported `FormFieldDefinition[]` array just before the API call. The backend stores them as JSON alongside the XFDF string.

### 4.3 PartyConfiguration

A named signing role with a colour for visual identification.

```typescript
interface PartyConfiguration {
    id: string;      // "party_1", "party_2", ... (auto-generated, sequential)
    label: string;   // User-defined role name: "Buyer", "Seller", "Witness"
    color: string;   // Hex color for visual distinction, e.g. "#4CAF50"
    order: number;   // Display/sort order within the template builder UI
                     // NOT the contract signing sequence — that is set at contract creation
}
```

> **Signing order note:** The `order` on `PartyConfiguration` is a display hint set during template design. The actual enforced signing sequence is configured when a contract is created from this template and can differ from the template's `order` values.

### 4.4 UploadTemplateData

The payload assembled by the wizard before calling `apiService.uploadTemplate()`.

```typescript
interface UploadTemplateData {
    name: string;
    description?: string;
    category: string;
    file: File | Blob;           // Raw PDF binary — sent separately after metadata POST
    fileName: string;            // Original filename, e.g. "contract_template.pdf"
    xfdfData?: string;           // XFDF XML string exported from Apryse
    formFields?: FormFieldDefinition[];
    parties?: PartyConfiguration[];
    onProgress?: (progress: number) => void; // 0–100; only used for chunked uploads
}
```

---

## 5. Template Lifecycle

```
Admin uploads template
        │
        ▼
Template stored in DB (metadata) + MinIO (binary PDF)
        │
        ├── Admin edits template
        │       → metadata updated via PUT /templates/{id}
        │       → new binary uploaded if file changed
        │
        ├── User views template
        │       → GET /templates/{id}/file/view-url
        │       → presigned MinIO URL returned
        │       → Apryse loads PDF directly from MinIO
        │
        ├── User creates contract from template
        │       → template.formFields copied to contract
        │       → template.parties copied to contract
        │       → template.xfdfData loaded in PDF viewer
        │       → template.timesUsed incremented
        │
        └── Admin deletes template
                → DELETE /templates/{id}
                → record removed; MinIO object removed
```

---

## 6. Upload Wizard — Step 1: Basic Details

**Component:** `src/components/template/UploadTemplateDialog.tsx`

Step 1 is a standard-width dialog. The user fills template metadata and selects the PDF file.

### 6.1 Form Fields & Validation

Form state is managed by **React Hook Form** with a **Zod** schema.

| UI Field | Form Key | Type | Required | Constraints |
|---|---|---|---|---|
| Template Name | `templateName` | `string` | Yes | 1–50 characters |
| Description | `description` | `string` | No | Max 200 characters |
| Category | `category` | `string` | Yes | Must select from existing list |
| File | file state | `File` | Yes | `.pdf` extension only |

**Zod schema** (`src/schemas/templateSchema.ts`):

```typescript
export const templateStep1Schema = z.object({
    templateName: z.string()
        .min(1, 'Template name is required')
        .max(50, 'Template name must be at most 50 characters'),
    description: z.string()
        .max(200, 'Description must be at most 200 characters')
        .optional(),
    category: z.string()
        .min(1, 'Category is required'),
});
```

File type validation is performed outside the Zod schema, directly on the `File` object:

```typescript
if (selectedFile.type !== 'application/pdf') {
    setError('Please upload a PDF file to use the form builder');
    return;
}
```

### 6.2 Category Management

Categories are independent entities managed via `categoryService`. They classify templates (e.g., "Legal", "HR", "Finance"). Only the category **name string** is stored on the template — not an ID.

**Loading on open:**

```typescript
useEffect(() => {
    if (!open) return;
    const allCategories = await categoryService.getAllCategories();
    setCategories(allCategories);
}, [open]);
```

**Inline category creation:**

The admin can create a new category without leaving Step 1. Clicking **"New"** reveals a text input:

1. Admin types a category name → clicks **"Add"**.
2. `categoryService.createCategory({ name }, userEmail)` → `POST /categories`.
3. On success: new category appended to list, auto-selected in the form.
4. On duplicate: inline error — *"Category already exists"*.

**Inline category deletion:**

Each option in the category dropdown has a delete icon:

1. `categoryService.deleteCategory(categoryId)` → `DELETE /categories/{id}`.
2. On success: category removed from dropdown.
3. If the deleted category was currently selected → form field cleared.

### 6.3 File Upload

The file input accepts only `.pdf` files (`accept=".pdf"`). The user can:

- **Click the drop zone** → opens the file picker.
- **Drag and drop** a file onto the drop zone.

The selected file is stored in local React state as a `File` object. No upload occurs at Step 1 — the binary is only sent after Step 2 is complete.

To replace the selected file, the user clicks the **×** icon to remove it and selects a new one.

### 6.4 Step Transition

Clicking **"Next: Edit Form Fields"** triggers `handleNext()`:

1. Zod validation runs on `templateName`, `description`, `category`.
2. File presence and type checked.
3. If all pass: a blob URL is created from the file (`URL.createObjectURL(selectedFile)`) and passed to the PDF viewer. `currentStep` → `2`.

---

## 7. Upload Wizard — Step 2: PDF Form Builder

**Components:** `PDFViewerContainer.tsx` + `PartyAssignmentPanel.tsx`

The dialog expands to full screen. The layout is:

```
┌─────────────────────────────────────────────────────────────────────────┐
│  [Back]  Edit Template — Step 2: Edit Form Fields  [Configure Parties]  [Save Template] │
├──────────────────────────────────────────────┬──────────────────────────┤
│                                              │  Party Panel (right)     │
│  Apryse PDF Viewer (Forms toolbar mode)      │                          │
│                                              │  ┌────────────────────┐  │
│  Admin places form field widgets onto the   │  │ P1 — Buyer         │  │
│  PDF directly:                              │  │   • client_name    │  │
│   • Text field                              │  │   • signature_1    │  │
│   • Signature field                         │  ├────────────────────┤  │
│   • Checkbox                                │  │ P2 — Seller        │  │
│   • Date                                    │  │   • seller_name    │  │
│   • Dropdown                                │  ├────────────────────┤  │
│                                              │  │ [+ Configure]      │  │
│                                              │  └────────────────────┘  │
│                                              │  Unassigned fields below  │
└──────────────────────────────────────────────┴──────────────────────────┘
```

### 7.1 Viewer Configuration

```typescript
<PDFViewerContainer
    ref={pdfViewerRef}
    documentUrl={documentUrl}           // blob URL from selectedFile
    isReadOnly={false}                  // Allow field creation
    canAddFormFields={true}             // Form field tools enabled
    initialToolbarGroup="toolbarGroup-Forms"
    onDocumentModified={() => {
        setPdfModified(true);
        refreshFormFields();            // Sync React state on every change
    }}
    onDocumentLoaded={() => {
        setDocumentLoaded(true);
        setTimeout(refreshFormFields, 500);
    }}
    parties={parties}
    enablePartyAssignment={parties.length > 0}
    onFieldChange={handleFieldChange}
    onPartyAssigned={(fieldName, partyId, partyLabel) => refreshFormFields()}
    onFieldsWithPartyExported={(fields) => {
        // Merge, preserving profileKey from existing state
        setFormFields(prev => mergeWithProfileKey(prev, fields));
    }}
/>
```

The viewer starts in **Forms toolbar mode** — Apryse's built-in form creation ribbon is shown, exposing text field, signature, checkbox, radio, dropdown, and date widget tools.

### 7.2 Adding Form Fields

The admin drags form field widgets from the Apryse toolbar and drops them directly onto the PDF pages. Each widget creation fires `onDocumentModified`, which calls `refreshFormFields()`:

```typescript
const refreshFormFields = async () => {
    const fields = await pdfViewerRef.current.exportFormFieldsWithParty();
    if (fields.length === 0) return;
    setFormFields(prev => {
        const prevMap = new Map(prev.map(f => [f.name, f]));
        return fields.map(f => ({
            ...f,
            profileKey: prevMap.get(f.name)?.profileKey ?? f.profileKey ?? null,
        }));
    });
};
```

`profileKey` is deliberately preserved from the previous state because it lives only in React state, not in the PDF viewer.

### 7.3 Party Configuration

**Component:** `src/components/template/PartyConfigDialog.tsx`  
Opened via the **"Configure Parties"** button in the Step 2 toolbar or from the party panel.

**Adding a party:**

| Field | Type | Required | Constraint |
|---|---|---|---|
| Label | `string` | Yes | Non-empty (e.g., "Buyer", "Seller") |
| Color | `string` (hex) | Yes | Selected from preset palette of 10 colours |
| Order | `number` | Yes | Positive integer; display/sort hint (not signing order) |

Party IDs are auto-generated sequentially:

```typescript
const newPartyId = `party_${parties.length + 1}`;
```

IDs are never reused within a session. If party 2 is deleted and a new one added, it receives ID `party_3` (based on the current length at that moment).

When a party is deleted: all fields assigned to it revert to `assignedParty: 'unassigned'`.

### 7.4 Field-to-Party Assignment

**Component:** `src/components/template/PartyAssignmentPanel.tsx`

Party assignment is stored in React state as a `Record<string, { partyId, partyLabel }>`. It is merged into `FormFieldDefinition.assignedParty` during export.

Three assignment methods are available:

#### Method 1 — Click Assignment
1. Click a field card in the **Unassigned** list in the panel.
2. Select a party from the party picker that appears.
3. Field moves to that party's section; card border turns the party's colour.

#### Method 2 — Checkbox Multi-Select
1. Check multiple field checkboxes in the panel.
2. An **"Assign to Party"** action appears.
3. Select a target party → all checked fields assigned at once.

#### Method 3 — In-Panel Unassign
Select "Unassign" from the field's context menu in the panel → field returns to the unassigned list.

**Visual feedback:**
- Field cards display the party's hex colour as a left border.
- Each party section heading shows a count: `"Buyer (3 fields)"`.
- Signature fields are visually distinguished from text fields with a pen icon.

### 7.5 Profile Field Mapping

**Component:** `src/components/template/ProfileFieldMappingDialog.tsx`  
Opens automatically after clicking **Save Template**, before any API call, if any non-signature fields exist.

#### Purpose

Profile field mapping allows PDF fields to be pre-filled automatically from the signing user's profile data. For example, a *"Full Name"* field mapped to `fullName` is auto-inserted when the user clicks **Autofill** during contract signing.

#### Dialog Layout

Fields are grouped by their assigned party (each group rendered as a labelled `fieldset` with the party's border colour):

```
┌─ BUYER ──────────────────────────────────────────┐
│  client_name      [ Full Name              ▼ ]   │
│  department       [ Department             ▼ ]   │
└──────────────────────────────────────────────────┘

┌─ SELLER ─────────────────────────────────────────┐
│  seller_name      [ — None —               ▼ ]   │
│  pan_number       [ PAN Card Number        ▼ ]   │
└──────────────────────────────────────────────────┘

┌─ 📅 MAP TO TODAY'S DATE ─────────────────────────┐
│  Fill selected fields with current date (DD/MM/YYYY) │
│  [ Select fields...                          ]   │
└──────────────────────────────────────────────────┘
```

#### Profile Key Options

(`src/utils/profileKeyOptions.ts`)

| Display Label | `profileKey` Value |
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

#### Today's Date Mapping

Special key: `DATE_TODAY_KEY = "__date_today__"`.  
Fills the field with the current date in `DD/MM/YYYY` format when autofill runs.

**Mutual exclusivity:** A field may have either a `profileKey` or a today's-date mapping — never both. Setting one clears the other.

#### Result

When **Save Mappings** is clicked:

| Field condition | `profileKey` value stored |
|---|---|
| Signature field | unchanged (not mappable) |
| Mapped to profile key | e.g. `"fullName"` |
| Mapped to today's date | `"__date_today__"` |
| No mapping | `null` |

---

## 8. Save Flow — Upload

### 8.1 PDF & XFDF Export

Clicking **"Save Template"** begins the export sequence:

```
[1] setToolbarGroup('toolbarGroup-View')
    setToolMode('Pan')
    await 500ms pause
    → Ensures all in-progress annotation edits are committed

[2] exportAnnotations()
    → Returns: { blob: Blob, xfdfString: string }
    → xfdfString: XFDF XML containing all field widget positions and names
    → blob: PDF binary with annotations embedded
    Note: does NOT contain party assignments or profileKey

[3] exportFormFields()
    → Returns: raw Apryse field array (name, type, x, y, width, height, page)

[4] Merge party assignments
    partyAssignments = pdfViewerRef.current.getAllFieldPartyAssignments()
    exportedFormFields = exportedFormFields.map(field => ({
        ...field,
        assignedParty: partyAssignments[field.name]?.partyId,
        partyLabel: partyAssignments[field.name]?.partyLabel,
        partyColor: parties.find(p => p.id === assignment.partyId)?.color,
    }))

[5] Count mappable fields
    mappableCount = exportedFormFields.filter(
        f => f.type !== 'Sig' && f.type !== 'signature'
    ).length

    If mappableCount > 0:
        → Store { exportedFormFields, xfdfData, fileToUpload } in pendingExportRef
        → setShowMappingDialog(true)
        → Wait for ProfileFieldMappingDialog.onSave(updatedFields)
    Else:
        → Skip mapping dialog, proceed to executeSave()

[6] executeSave(finalFormFields, xfdfData, fileToUpload)
    → Assemble UploadTemplateData
    → Call apiService.uploadTemplate(data)
```

### 8.2 Binary Upload — Size-Gated Strategy

The binary PDF is uploaded after the metadata POST. Upload strategy is gated by file size:

| File size | Strategy | Threshold |
|---|---|---|
| < 30 MB | Single-shot PUT to `/templates/{id}/file` | `CHUNKED_THRESHOLD = 30 * 1024 * 1024` |
| ≥ 30 MB | Chunked multipart upload via MinIO presigned URLs | Same threshold |

```typescript
// src/services/apiService.ts — uploadTemplate()
if (data.file.size >= CHUNKED_THRESHOLD) {
    await chunkedUpload(id, data.file, data.onProgress);
} else {
    await singleShotUpload(id, data.file);
}
```

### 8.3 Chunked Multipart Upload

For files ≥ 30 MB, the frontend orchestrates a three-phase MinIO multipart upload.

**Chunk size:** 10 MB per part (`CHUNK_SIZE = 10 * 1024 * 1024`).  
MinIO requires a minimum of 5 MB per part (except the last part).

#### Phase 1 — Initiate

```
POST /templates/{id}/file/initiate
Body: {}
Response: { uploadId: string }
```

The backend starts a MinIO multipart upload and returns the `uploadId`.

#### Phase 2 — Upload Parts (repeated per chunk)

For each 10 MB chunk:

```
GET /templates/{id}/file/presign?uploadId={uploadId}&partNumber={n}
Response: { url: string, partNumber: number }
```

The backend returns a presigned PUT URL for the chunk. The frontend then uploads the chunk **directly to MinIO** — bypassing the backend entirely:

```typescript
// Direct PUT to MinIO presigned URL — no Authorization header
await fetch(presignedUrl, {
    method: 'PUT',
    body: chunk,
    headers: { 'Content-Type': 'application/octet-stream' },
});
// ETag returned in response header — stripped of surrounding quotes
const eTag = partRes.headers.get('ETag').replace(/"/g, '');
```

> **Critical:** Do NOT include an `Authorization` header when PUT-ing directly to a MinIO presigned URL. MinIO rejects presigned requests that also carry an Authorization header.

Progress is reported after each part via `onProgress` callback:

```typescript
onProgress?.(Math.round((partNumber / totalParts) * 100));
```

#### Phase 3 — Complete

```
POST /templates/{id}/file/complete
Body: { uploadId: string, parts: [{ partNumber: number, eTag: string }] }
Response: { success: true }
```

The backend finalises the multipart upload in MinIO. Parts must be sent in ascending `partNumber` order.

### 8.4 Single-Shot Upload

For files < 30 MB, the binary is sent in a single PUT:

```
PUT /templates/{id}/file
Content-Type: application/octet-stream
Body: raw PDF bytes
Response: { success: true }
```

---

## 9. Edit Template Flow

**Component:** `src/components/template/EditTemplateDialog.tsx`

The edit wizard is structurally identical to the upload wizard but pre-populates all fields from the existing template. The dialog opens when the admin clicks the edit icon on a `TemplateCard`.

```typescript
// template/page.tsx
const handleEditTemplate = (templateId: string) => {
    const template = templates.find(t => t.id === templateId);
    if (template) {
        setTemplateToEdit(template);
        setEditDialogOpen(true);
    }
};
```

> **Important:** The `templates` list loaded by `GET /templates` is metadata-only — it does not include full `formFields` with `profileKey` (binary-excluded response). The full record must be fetched separately when entering Step 2.

### 9.1 Step 1 — Edit Basic Details

On dialog open, the form is pre-filled:

```typescript
useEffect(() => {
    if (!open) return;
    reset({
        templateName: template.name,
        description: template.description || '',
        category: template.category,
    });
    setParties(template.parties || []);
    setFormFields(template.formFields || []);  // May be empty from list endpoint
}, [open, template, reset]);
```

The user may:
- Change the template name, description, or category.
- Optionally upload a **replacement file** (shown as an optional drag-drop area labelled *"Replace File (Optional)"*). If no replacement is selected, the existing binary is retained.

### 9.2 Step 2 — Edit Form Fields

#### Loading the existing PDF

When the user clicks **"Next: Edit Form Fields"**:

1. **File type check** (case-insensitive):
   ```typescript
   const isPdf =
       template.fileType?.toLowerCase() === 'pdf' ||
       template.fileName?.toLowerCase().endsWith('.pdf');
   ```

2. **Fetch full template record** to restore `formFields` with `profileKey`:
   ```typescript
   const full = await templateService.getTemplateById(template.id);
   if (full?.formFields?.length > 0) {
       setFormFields(full.formFields);
       if (full.parties?.length > 0) setParties(full.parties);
   }
   ```
   This is necessary because the template list endpoint returns metadata without the full `formFields` array. Without this fetch, all `profileKey` mappings would be lost on re-edit.

3. **Fetch presigned view URL** (if `template.fileUploaded === true`):
   ```typescript
   const url = await getTemplateViewUrl(template.id);
   // GET /templates/{id}/file/view-url → presigned MinIO URL
   setDocumentUrl(url);
   ```

4. **Legacy fallback** (if `template.fileUploaded === false`):
   ```typescript
   const legacyUrl = template.fileData || template.fileUrl;
   setDocumentUrl(legacyUrl);
   ```

5. If a **replacement file** was selected in Step 1:
   ```typescript
   const url = URL.createObjectURL(selectedFile);
   setDocumentUrl(url);
   // Note: formFields start empty for a brand-new file
   ```

### 9.3 Save Flow — Edit

`handleSubmit()` in `EditTemplateDialog`:

```
[1] Switch viewer to view mode + 500ms pause

[2] exportAnnotations() → { blob, xfdfString }

[3] exportFormFields()
    → merge party assignments from pdfViewerRef.current.getAllFieldPartyAssignments()

[4] Merge profileKey from formFields state
    exportedFormFields = exportedFormFields.map(ef => {
        const stateField = formFields.find(sf => sf.name === ef.name);
        return stateField?.profileKey != null
            ? { ...ef, profileKey: stateField.profileKey }
            : ef;
    });

[5] If mappable fields exist → show ProfileFieldMappingDialog

[6] executeSave(finalFormFields, xfdfData, fileToUpload)
    PUT /templates/{id}   (metadata)
    PUT /templates/{id}/file  (binary, only if file changed)
```

**`pdfModified` flag:**  
`pdfModified` is set to `true` the first time `onDocumentModified` fires (field added, moved, or deleted). If the flag is `false` at save time (user only changed Step 1 metadata), the existing binary in MinIO is retained and no file upload is performed:

```typescript
if (pdfModified) {
    fileToUpload = exportResult.blob;  // Use re-exported blob
} else {
    fileToUpload = null;               // No binary change
}
```

### 9.4 profileKey Preservation

`profileKey` flows through multiple state transitions during editing. The preservation chain is:

```
1. getTemplateById() → full.formFields[].profileKey       (source)
          ↓
2. setFormFields(full.formFields)                         (React state)
          ↓
3. onDocumentLoaded → refreshFormFields()
   setFormFields(prev => mergeWithProfileKey(prev, newFields))  (preserve from prev)
          ↓
4. onFieldsWithPartyExported → same merge                 (preserve from prev)
          ↓
5. handleSubmit() → manual merge before ProfileFieldMappingDialog
   stateField?.profileKey != null → apply to exportedFormFields
          ↓
6. ProfileFieldMappingDialog.useEffect([open, formFields])
   reads profileKey from formFields to pre-fill dropdowns  (display)
          ↓
7. executeSave() → PUT /templates/{id} with profileKeys    (persist)
```

At every step, the merge function checks `prevField?.profileKey ?? f.profileKey ?? null` — Apryse-exported fields never carry `profileKey`, so the value must always come from the React state map.

---

## 10. Template Viewing

**Component:** `src/components/viewer/DocumentViewerDialog.tsx`  
**Utility:** `src/utils/getTemplateViewUrl.ts`

When the admin or user clicks the **eye icon** on a `TemplateCard`, the template PDF is opened in a read-only viewer.

**URL resolution:**

```typescript
// getTemplateViewUrl.ts
export async function getTemplateViewUrl(templateId: string): Promise<string | null> {
    const response = await httpClient.get<{ viewUrl: string }>(
        `/templates/${templateId}/file/view-url`
    );
    return response.ok ? response.data.viewUrl : null;
}
```

`GET /templates/{id}/file/view-url` returns a **MinIO presigned GET URL** with a short expiry (typically 15 minutes). The URL supports HTTP range requests (`206 Partial Content`), so Apryse can progressively stream large PDFs without downloading the entire file first.

The presigned URL is passed directly to `PDFViewerContainer` as `documentUrl`. No blob is created; no `URL.createObjectURL` is called. No `revokeObjectURL` cleanup is needed.

```typescript
<PDFViewerContainer
    documentUrl={presignedUrl}   // Direct MinIO presigned URL
    isReadOnly={true}
    canAddFormFields={false}
    formFields={template.formFields}
    initialXfdf={template.xfdfData}
/>
```

---

## 11. API Reference

All endpoints are on the Spring Boot backend (`localhost:8080`). All requests require a valid **JWT Bearer token** in the `Authorization` header.

---

### 11.1 POST /templates

Creates a new template metadata record. Binary PDF is uploaded separately.

#### Request

```
POST /templates
Authorization: Bearer <token>
Content-Type: application/json
```

```json
{
    "name": "NDA Agreement",
    "description": "Standard non-disclosure agreement template",
    "category": "Legal",
    "fileName": "nda_template.pdf",
    "fileType": "pdf",
    "uploadedBy": "admin@company.com",
    "xfdfData": "<?xml version=\"1.0\" encoding=\"UTF-8\"?>...",
    "formFields": [
        {
            "name": "client_name",
            "type": "text",
            "label": "Client Name",
            "x": 100, "y": 200, "width": 200, "height": 30,
            "pageNumber": 1,
            "required": true,
            "assignedParty": "party_1",
            "partyLabel": "Buyer",
            "partyColor": "#4CAF50",
            "profileKey": "fullName"
        },
        {
            "name": "signature_buyer",
            "type": "signature",
            "x": 100, "y": 700, "width": 150, "height": 60,
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

| Field | Required | Notes |
|---|---|---|
| `name` | Yes | 1–50 chars |
| `category` | Yes | Must match an existing category name |
| `fileName` | Yes | Original filename with extension |
| `fileType` | Yes | `"pdf"`, `"docx"`, or `"doc"` |
| `uploadedBy` | Yes | Authenticated user's email |
| `xfdfData` | No | XFDF XML string; empty string if no form fields |
| `formFields` | No | Array; empty array if no form fields |
| `parties` | No | Array; empty array if no parties |

#### Response — 201 Created

```json
{
    "id": "664a1f2e3b0000000000001a",
    "message": "Template metadata created."
}
```

#### Response — 400 Bad Request

```json
{ "message": "name and category are required" }
```

---

### 11.2 GET /templates

Returns all templates. **Binary fields are excluded** for performance — the list is metadata-only.

#### Request

```
GET /templates
Authorization: Bearer <token>
```

#### Response — 200 OK

```json
[
    {
        "id": "664a1f2e3b0000000000001a",
        "name": "NDA Agreement",
        "description": "Standard non-disclosure agreement",
        "category": "Legal",
        "fileName": "nda_template.pdf",
        "fileType": "pdf",
        "fileUrl": "/templates/664a1f2e3b0000000000001a/file",
        "uploadedBy": "admin@company.com",
        "createdAt": "2026-05-01T10:30:00Z",
        "updatedAt": "2026-05-15T14:00:00Z",
        "timesUsed": 5,
        "lastUsed": "2026-05-28T09:00:00Z",
        "hasFormFields": true,
        "fileUploaded": true,
        "xfdfData": "<?xml version=\"1.0\"?>...",
        "formFields": [ { ... } ],
        "parties": [ { ... } ]
    }
]
```

> `pdf`, `docxBase64`, and `fileData` (binary fields) are **never** included in this response.

---

### 11.3 GET /templates/{id}

Returns a single template by ID. Same shape as the list response item, but may include additional detail. Binary fields excluded.

#### Request

```
GET /templates/664a1f2e3b0000000000001a
Authorization: Bearer <token>
```

#### Response — 200 OK

Single template object (same shape as list item).

---

### 11.4 PUT /templates/{id}

Updates template metadata. Binary is updated via a separate file endpoint only if the file changed.

#### Request

```
PUT /templates/664a1f2e3b0000000000001a
Authorization: Bearer <token>
Content-Type: application/json
```

Same body shape as `POST /templates`. All fields are optional — only include fields being changed.

#### Response — 200 OK

```json
{ "success": true, "message": "Template updated." }
```

---

### 11.5 DELETE /templates/{id}

Deletes the template record and its associated binary from MinIO.

#### Request

```
DELETE /templates/664a1f2e3b0000000000001a
Authorization: Bearer <token>
```

#### Response — 200 OK

```json
{ "success": true, "message": "Template deleted." }
```

---

### 11.6 PUT /templates/{id}/file — Single-Shot

Uploads the raw PDF binary in a single request. Used for files < 30 MB.

#### Request

```
PUT /templates/664a1f2e3b0000000000001a/file
Authorization: Bearer <token>
Content-Type: application/octet-stream

<raw PDF bytes>
```

#### Response — 200 OK

```json
{ "success": true }
```

The backend stores the binary in MinIO and sets `fileUploaded: true` on the template record.

---

### 11.7 POST /templates/{id}/file/initiate — Chunked Upload

Initiates a MinIO multipart upload session. Called for files ≥ 30 MB.

#### Request

```
POST /templates/664a1f2e3b0000000000001a/file/initiate
Authorization: Bearer <token>
Content-Type: application/json

{}
```

#### Response — 200 OK

```json
{ "uploadId": "2~xyzABCDEFG..." }
```

---

### 11.8 GET /templates/{id}/file/presign — Chunked Upload

Returns a presigned PUT URL for a single chunk. Called once per 10 MB chunk.

#### Request

```
GET /templates/664a1f2e3b0000000000001a/file/presign?uploadId=2~xyz...&partNumber=1
Authorization: Bearer <token>
```

#### Response — 200 OK

```json
{
    "url": "https://minio.internal/bucket/templates/664a.../nda.pdf?X-Amz-Algorithm=...&partNumber=1&uploadId=2~xyz...",
    "partNumber": 1
}
```

The frontend PUTs each chunk **directly to this URL** — the backend is not involved in the data transfer. No `Authorization` header should be included in the MinIO PUT request.

---

### 11.9 POST /templates/{id}/file/complete — Chunked Upload

Completes the multipart upload by assembling all parts in MinIO.

#### Request

```
POST /templates/664a1f2e3b0000000000001a/file/complete
Authorization: Bearer <token>
Content-Type: application/json

{
    "uploadId": "2~xyzABCDEFG...",
    "parts": [
        { "partNumber": 1, "eTag": "abc123def456" },
        { "partNumber": 2, "eTag": "789ghi012jkl" },
        { "partNumber": 3, "eTag": "mno345pqr678" }
    ]
}
```

Parts must be in ascending `partNumber` order. `eTag` values are the raw ETag strings returned by MinIO in part upload response headers (quotes stripped).

#### Response — 200 OK

```json
{ "success": true }
```

---

### 11.10 GET /templates/{id}/file/view-url

Returns a short-lived MinIO presigned GET URL for viewing the template PDF.

#### Request

```
GET /templates/664a1f2e3b0000000000001a/file/view-url
Authorization: Bearer <token>
```

#### Response — 200 OK

```json
{
    "viewUrl": "https://minio.internal/bucket/templates/664a.../nda.pdf?X-Amz-Algorithm=...&X-Amz-Expires=900"
}
```

- Expiry: typically 15 minutes (`X-Amz-Expires=900`).
- Supports HTTP range requests (`Accept-Ranges: bytes`) — Apryse streams large PDFs efficiently.
- The URL is passed directly as `documentUrl` to `PDFViewerContainer`.

---

## 12. Service Layer

### 12.1 `templateService`

**File:** `src/services/templateService.ts`  
A thin wrapper over `apiService`.

| Method | Calls | Returns |
|---|---|---|
| `getAllTemplates()` | `apiService.getTemplates()` | `Template[]` |
| `getTemplateById(id)` | `apiService.getTemplateById(id)` | `Template \| undefined` |
| `saveTemplate(data, email)` | `apiService.uploadTemplate(data)` | `{ success, id?, message }` |
| `updateTemplate(id, data, email)` | `apiService.updateTemplate(id, data)` | `{ success, message, template? }` |
| `deleteTemplate(id, email)` | `apiService.deleteTemplate(id)` | `{ success, message }` |

### 12.2 `apiService` — Template Methods

**File:** `src/services/apiService.ts`

#### `getTemplates()` → `GET /templates`
Returns full template array. Maps `t.id || t._id` and forces `fileUploaded` to boolean.

#### `getTemplateById(id)` → `GET /templates/{id}`
Returns single template or `null`. Used in edit flow to restore full `formFields` with `profileKey`.

#### `uploadTemplate(data)` → Two-step
1. `POST /templates` (metadata JSON) → receives `{ id }`.
2. Size-gated binary upload:
   - `< 30 MB` → `singleShotUpload(id, file)` → `PUT /templates/{id}/file`
   - `≥ 30 MB` → `chunkedUpload(id, file, onProgress)` → 3-phase MinIO multipart

#### `updateTemplate(id, data)` → Two-step
1. `PUT /templates/{id}` (metadata JSON, binary fields stripped).
2. If `data.file` is a `Blob` or `File` → same size-gated binary upload.

#### `deleteTemplate(id)` → `DELETE /templates/{id}`

### 12.3 `getTemplateViewUrl(templateId)`

**File:** `src/utils/getTemplateViewUrl.ts`

```typescript
export async function getTemplateViewUrl(templateId: string): Promise<string | null>
```

Calls `GET /templates/{id}/file/view-url`. Returns the presigned URL string or `null` on failure.

---

## 13. Validation Reference

### Step 1 — Form Validation

| Field | Rule | Error Message |
|---|---|---|
| Template Name | Required, 1–50 chars | "Template name is required" / "...must be at most 50 characters" |
| Description | Optional, max 200 chars | "Description must be at most 200 characters" |
| Category | Required | "Category is required" |
| File | Required, must be `.pdf` | "Please upload a PDF file to use the form builder" |

### Party Configuration

| Field | Rule |
|---|---|
| Label | Required; non-empty string |
| Color | Required; valid hex from preset palette |
| Order | Required; positive integer; unique among parties |

### Profile Key Mapping

| Rule |
|---|
| Each field can have at most one mapping (profile key OR today's date — never both) |
| Signature fields cannot have a `profileKey` |
| `profileKey: null` means no autofill mapping |

### Party Assignment

| Rule |
|---|
| A field can be assigned to exactly one party (or left `unassigned`) |
| Multiple fields can share the same party |
| Deleting a party sets all its fields to `unassigned` |
| `fileType` must be `'pdf'` to use the form builder (DOCX templates get no Step 2) |

---

## 14. Error Handling

### Upload Failure

If `POST /templates` (metadata) succeeds but the binary upload fails, an orphaned template record exists in the database with `fileUploaded: false`. The backend should mark such records and provide a cleanup mechanism. On the frontend:

- Error snackbar: *"Metadata updated but file upload failed"*
- Dialog stays open; user can retry.

### Edit Save Failure

Same behaviour — error snackbar, dialog stays open, `updating` state cleared.

### Presigned URL Failure

If `GET /templates/{id}/file/view-url` fails:

```typescript
if (!url) {
    setError('Failed to load template PDF. Please try again.');
    return;
}
```

Step 2 is not entered; the user remains on Step 1 with an error alert.

### profileKey Loss Prevention

See [§9.4 profileKey Preservation](#94-profilekey-preservation). The `getTemplateById` call in `handleNext` of `EditTemplateDialog` is specifically designed to prevent `profileKey` loss caused by the list endpoint returning metadata-only formFields.

---

## 15. Apryse WebViewer Reference

> All Apryse APIs listed here are **browser-only** calls to `@pdftron/webviewer`. The backend never calls Apryse. What the backend stores is the **output** of these calls: the XFDF string, the `FormFieldDefinition[]` array, and the raw PDF binary.

### Handle Methods (exposed via `useImperativeHandle`)

These are called by `UploadTemplateDialog` / `EditTemplateDialog` to orchestrate the export.

| Method | Signature | Called When | Effect |
|---|---|---|---|
| `setToolbarGroup` | `(group: string) => void` | Before export | Switches toolbar: `'toolbarGroup-Forms'` (edit) or `'toolbarGroup-View'` (view) |
| `setToolMode` | `(mode: string) => void` | Before export | Sets active tool. `'Pan'` for read-only mode |
| `exportAnnotations` | `(fieldValues?, opts?) => Promise<{blob, xfdfString} \| null>` | On save | Exports XFDF XML + PDF blob with annotations embedded |
| `exportFormFieldsWithParty` | `() => Promise<FormFieldDefinition[]>` | On save | Reads widget annotations + merges party assignments from React state |
| `exportFormFields` | `() => Promise<any[]>` | Fallback | Exports fields without party data (fallback only) |
| `getAllFieldPartyAssignments` | `() => Record<string, {partyId, partyLabel}>` | On save | Returns in-memory party assignment map for merge |
| `assignFieldToParty` | `(name, partyId, label, color) => boolean` | On panel assignment | Updates field's visual appearance in viewer; returns `true` on success |
| `highlightPartyFields` | `(partyId \| null) => void` | On panel hover | Highlights all fields for a party; `null` clears highlights |
| `refreshFormFields` | `async () => void` | On modification | Re-reads all fields from viewer, merges with React state (preserves profileKey) |

### What the Backend Receives

| Data | Format | Origin |
|---|---|---|
| `xfdfData` | XFDF XML string | `annotationManager.exportAnnotations()` via handle |
| `formFields[]` | `FormFieldDefinition[]` JSON | `exportFormFieldsWithParty()` + React state merge |
| `parties[]` | `PartyConfiguration[]` JSON | Pure React state; never touches Apryse |
| PDF binary | Raw `Blob` | `exportAnnotations()` return value |

The backend stores `xfdfData` as an opaque string and returns it verbatim when a client loads the template. No XFDF parsing is required on the backend.

---

## 16. Party Color Reference

Default colours assigned sequentially by party index. Users can override any colour in `PartyConfigDialog`.

| Party ID | Color Name | Hex |
|---|---|---|
| `party_1` | Green | `#4CAF50` |
| `party_2` | Blue | `#2196F3` |
| `party_3` | Orange | `#FF9800` |
| `party_4` | Purple | `#9C27B0` |
| `party_5` | Pink | `#E91E63` |
| `unassigned` | Grey | `#9E9E9E` |

---

## 17. File Reference

| File | Role |
|---|---|
| `src/app/template/page.tsx` | Template list page — grid, filters, action triggers |
| `src/components/template/UploadTemplateDialog.tsx` | 2-step upload wizard |
| `src/components/template/EditTemplateDialog.tsx` | 2-step edit wizard |
| `src/components/template/TemplateCard.tsx` | Template card display |
| `src/components/template/PartyAssignmentPanel.tsx` | Party display & field-to-party assignment |
| `src/components/template/PartyConfigDialog.tsx` | Add/edit party dialog |
| `src/components/template/ProfileFieldMappingDialog.tsx` | Field → profile key mapping dialog |
| `src/components/viewer/PDFViewerContainer.tsx` | Apryse WebViewer v11 wrapper |
| `src/components/viewer/DocumentViewerDialog.tsx` | Read-only template viewer dialog |
| `src/types/template.ts` | `Template`, `FormFieldDefinition`, `PartyConfiguration`, `UploadTemplateData`, `Category` |
| `src/schemas/templateSchema.ts` | Zod schema for Step 1 form |
| `src/services/templateService.ts` | Template service (thin wrapper) |
| `src/services/categoryService.ts` | Category CRUD service |
| `src/services/apiService.ts` | Raw HTTP calls: all template + chunked upload endpoints |
| `src/utils/getTemplateViewUrl.ts` | Fetch MinIO presigned view URL |
| `src/lib/httpClient.ts` | HTTP client — JWT injection, response normalisation |
