# Edit Contract Flow

**Document Type:** Technical Integration Reference  
**System:** Contract Management System (CMS)  
**Module:** Contract Edit Pipeline  
**Stack:** Next.js 16 · React 19 · TypeScript · Spring Boot · MongoDB · MinIO · Apryse WebViewer v11 · MUI v7  
**Status:** Production  
**Last Updated:** 2026-06-08

---

## Table of Contents

1. [Overview](#1-overview)
2. [Feature Scope and Constraints](#2-feature-scope-and-constraints)
3. [ContractCard Variant System](#3-contractcard-variant-system)
   - 3.1 [Variant Values and Meanings](#31-variant-values-and-meanings)
   - 3.2 [Variant Computation](#32-variant-computation)
   - 3.3 [How Variant Controls Buttons](#33-how-variant-controls-buttons)
4. [ContractStatus Enum — Backend Alignment](#4-contractstatus-enum--backend-alignment)
   - 4.1 [Enum Values](#41-enum-values)
   - 4.2 [Why Uppercase](#42-why-uppercase)
   - 4.3 [DRAFT_STATUSES and CONTRACT_PAGE_STATUSES](#43-draft_statuses-and-contract_page_statuses)
5. [Edit Button — Entry Point](#5-edit-button--entry-point)
   - 5.1 [ContractCard — Action Button Registration](#51-contractcard--action-button-registration)
   - 5.2 [ContractsContent — Handler and State](#52-contractscontent--handler-and-state)
   - 5.3 [Edit Button Visibility Rules](#53-edit-button-visibility-rules)
6. [EditContractDialog — Architecture](#6-editcontractdialog--architecture)
   - 6.1 [Component Props](#61-component-props)
   - 6.2 [Internal State](#62-internal-state)
   - 6.3 [Step Flow](#63-step-flow)
7. [Step 1 — Contract Details](#7-step-1--contract-details)
   - 7.1 [Pre-Population](#71-pre-population)
   - 7.2 [Form Fields](#72-form-fields)
   - 7.3 [Template Selector](#73-template-selector)
   - 7.4 [Template Change Detection](#74-template-change-detection)
   - 7.5 [Validation Rules](#75-validation-rules)
   - 7.6 [Step Transition — Document Loading](#76-step-transition--document-loading)
8. [Step 2 — PDF Editor](#8-step-2--pdf-editor)
   - 8.1 [Viewer Configuration](#81-viewer-configuration)
   - 8.2 [Document Source Resolution](#82-document-source-resolution)
   - 8.3 [Template-Switch Document Loading](#83-template-switch-document-loading)
   - 8.4 [Field Change Tracking](#84-field-change-tracking)
9. [Save Pipeline](#9-save-pipeline)
   - 9.1 [PDF and XFDF Export](#91-pdf-and-xfdf-export)
   - 9.2 [Form Field Export and Party Assignment Merge](#92-form-field-export-and-party-assignment-merge)
   - 9.3 [Metadata Assembly](#93-metadata-assembly)
   - 9.4 [Persist Metadata to Spring Boot](#94-persist-metadata-to-spring-boot)
   - 9.5 [PDF Upload to MinIO](#95-pdf-upload-to-minio)
   - 9.6 [Success and Post-Save State](#96-success-and-post-save-state)
10. [Template Switching — Deep Dive](#10-template-switching--deep-dive)
    - 10.1 [User Interaction](#101-user-interaction)
    - 10.2 [Warning Indicator](#102-warning-indicator)
    - 10.3 [Effect on Save Payload](#103-effect-on-save-payload)
    - 10.4 [Party and Field Assignment Behaviour](#104-party-and-field-assignment-behaviour)
11. [Unsaved Changes Handling](#11-unsaved-changes-handling)
12. [Share Button — Submit for Review (draft variant)](#12-share-button--submit-for-review-draft-variant)
    - 12.1 [Behaviour by Variant](#121-behaviour-by-variant)
    - 12.2 [Review Submission Flow](#122-review-submission-flow)
13. [ContractStatus Fix — Case Alignment with Backend](#13-contractstatus-fix--case-alignment-with-backend)
    - 13.1 [Root Cause](#131-root-cause)
    - 13.2 [Affected Files](#132-affected-files)
    - 13.3 [Translation Key Alignment](#133-translation-key-alignment)
14. [API Reference](#14-api-reference)
    - 14.1 [PATCH /contracts/{id} — Metadata Update](#141-patch-contractsid--metadata-update)
    - 14.2 [PUT /contracts/{id}/file — PDF Upload](#142-put-contractsidfile--pdf-upload)
    - 14.3 [GET /contracts/{id}/file/view-url — Presigned Read URL](#143-get-contractsidfileview-url--presigned-read-url)
    - 14.4 [GET /templates/{id}/file/view-url — Template Presigned Read URL](#144-get-templatesidfileview-url--template-presigned-read-url)
15. [End-to-End Sequence Diagram](#15-end-to-end-sequence-diagram)
16. [File Reference](#16-file-reference)

---

## 1. Overview

The **Edit Contract** feature allows contract owners to modify both the **metadata** (title, client, description, dates, template) and the **PDF document** of any contract in `DRAFT` status — without creating a new contract or disrupting the review/approval workflow.

```
ContractCard (variant='draft')
  └── Hover → Edit icon (pencil)
        └── handleEdit(contractId)
              └── EditContractDialog opens
                    ├── Step 1: Edit metadata + optionally swap template
                    └── Step 2: Edit PDF in Apryse WebViewer
                          └── Save
                                ├── PATCH /contracts/{id}   → Spring Boot (metadata + form fields)
                                └── PUT   /contracts/{id}/file → MinIO (updated PDF binary)
```

The contract's `status` remains `DRAFT` after editing. No workflow state is reset.

---

## 2. Feature Scope and Constraints

| Rule | Detail |
|---|---|
| **Only DRAFT contracts** | The edit button is rendered only when `cardVariant === 'draft'` |
| **Owner only** | Spring Boot's JWT-filtered `GET /contracts` returns only the authenticated user's contracts; the edit button is therefore only visible to the contract owner |
| **Metadata + document** | Both contract metadata fields and the PDF binary can be updated in a single save |
| **Template swap allowed** | The user may switch to a different template; this replaces the PDF base and all template-derived metadata fields |
| **Party assignments preserved** | If the template is NOT changed, all existing party assignments and `profileKey` mappings are carried forward from the stored `formFields` |
| **No status reset** | `contract.status` is never written by the edit save; the contract remains in whatever DRAFT sub-status it was in (e.g. `REJECTED_BY_REVIEWER` stays rejected) |
| **Reviewer/approver fields untouched** | `reviewers`, `approver`, `reviewStatus` fields are not sent in the edit PATCH payload; Spring Boot's merge-update leaves them unchanged |

---

## 3. ContractCard Variant System

### 3.1 Variant Values and Meanings

**File:** [src/components/contracts/ContractCard.tsx](src/components/contracts/ContractCard.tsx)

```typescript
variant?: 'draft' | 'contract' | 'terminated'
```

| Variant | Contract Statuses | Behaviour |
|---|---|---|
| `'draft'` | `DRAFT`, `IN_REVIEW`, `IN_APPROVAL`, `REVIEW_APPROVAL`, `REVIEWED`, `REJECTED_BY_REVIEWER`, `REJECTED_BY_APPROVER` | Shows Edit + Share (submit for review) buttons; eye tooltip = "View" |
| `'contract'` | `APPROVED`, `READY_FOR_SIGNATURE`, `WAITING_FOR_SIGNATURE`, `SIGNED_BY_EVERYONE`, `SIGNED`, `ACTIVE`, `EXPIRING`, `EXPIRED` | Shows Share (submit for signature) for eligible statuses; no Edit; eye tooltip = "View Contract" |
| `'terminated'` | `TERMINATED` | Shows History + Delete only; card visually subdued; no Edit, no Share |

### 3.2 Variant Computation

**File:** [src/components/contracts/ContractsContent.tsx](src/components/contracts/ContractsContent.tsx)

```typescript
const DRAFT_STATUSES: ContractStatus[] = [
    ContractStatus.DRAFT,
    ContractStatus.IN_REVIEW,
    ContractStatus.IN_APPROVAL,
    ContractStatus.REVIEW_APPROVAL,
    ContractStatus.REVIEWED,
    ContractStatus.REJECTED_BY_REVIEWER,
    ContractStatus.REJECTED_BY_APPROVER,
];

const getCardVariant = (status: ContractStatus) => {
    if (DRAFT_STATUSES.includes(status)) return 'draft' as const;
    if (status === ContractStatus.TERMINATED) return 'terminated' as const;
    return 'contract' as const;
};
```

### 3.3 How Variant Controls Buttons

The variant is passed as a prop to `ContractCard`, and the parent (`ContractsContent`) conditionally passes handler functions based on variant:

```typescript
// ContractsContent.tsx — render site
<ContractCard
    variant={cardVariant}
    contract={contract}
    onEdit={cardVariant === 'draft' ? handleEdit : undefined}
    onShare={
        cardVariant === 'draft'     ? handleShare :         // → RequestReviewDialog
        cardVariant === 'contract'  ? handleShareContract : // → SubmitForSignatureDialog
        undefined                                           // terminated: no share
    }
    onView={cardVariant !== 'terminated' ? handleView : undefined}
    onRenew={cardVariant === 'contract' ? handleRenewContract : undefined}
    onTerminate={cardVariant === 'contract' ? handleTerminateContract : undefined}
    onHistory={cardVariant === 'terminated' || contract.renewedFromId ? handleHistory : undefined}
    onDelete={cardVariant === 'terminated' ? handleDeleteContract : undefined}
/>
```

Inside `ContractCard`, buttons are only rendered when their `show` condition is true:

```typescript
// Edit button
{
    title: tTooltips('editContract'),
    show:  variant === 'draft' && !!onEdit,
}

// Share button
{
    title: getShareTooltip(),   // "Submit for review/approval" OR "Submit for signature"
    show:  shouldShowShareButton(),
}
```

`shouldShowShareButton()` returns `true` for all draft cards (when `onShare` is set), and only for specific contract statuses on the contract variant:

```typescript
const shouldShowShareButton = (): boolean => {
    if (!onShare || variant === 'terminated') return false;
    if (variant === 'draft') return true;
    return (
        contract.status === ContractStatus.APPROVED ||
        contract.status === ContractStatus.READY_FOR_SIGNATURE ||
        contract.status === ContractStatus.WAITING_FOR_SIGNATURE ||
        contract.status === ContractStatus.SIGNED_BY_EVERYONE
    );
};
```

---

## 4. ContractStatus Enum — Backend Alignment

### 4.1 Enum Values

**File:** [src/types/contract.ts](src/types/contract.ts)

```typescript
export enum ContractStatus {
    DRAFT                  = 'DRAFT',
    IN_REVIEW              = 'IN_REVIEW',
    IN_APPROVAL            = 'IN_APPROVAL',
    REVIEW_APPROVAL        = 'REVIEW_APPROVAL',
    REVIEWED               = 'REVIEWED',
    APPROVED               = 'APPROVED',
    READY_FOR_SIGNATURE    = 'READY_FOR_SIGNATURE',
    WAITING_FOR_SIGNATURE  = 'WAITING_FOR_SIGNATURE',
    SIGNED_BY_EVERYONE     = 'SIGNED_BY_EVERYONE',
    SIGNED                 = 'SIGNED',
    ACTIVE                 = 'ACTIVE',
    EXPIRING               = 'EXPIRING',
    EXPIRED                = 'EXPIRED',
    TERMINATED             = 'TERMINATED',
    REJECTED               = 'REJECTED',
    REJECTED_BY_REVIEWER   = 'REJECTED_BY_REVIEWER',
    REJECTED_BY_APPROVER   = 'REJECTED_BY_APPROVER',
}
```

### 4.2 Why Uppercase

Spring Boot (Java) serialises enum values to JSON using the enum constant name by default (Jackson `EnumValue` → enum name). This produces uppercase strings: `"DRAFT"`, `"IN_REVIEW"`, etc.

The frontend previously used lowercase values (`'draft'`, `'in_review'`). This caused a silent mismatch: `DRAFT_STATUSES.includes(contract.status)` always evaluated to `false` for draft contracts, because `'DRAFT' !== 'draft'`. As a result, `getCardVariant()` returned `'contract'` for every contract and neither the edit nor the share button was rendered on draft cards.

### 4.3 DRAFT_STATUSES and CONTRACT_PAGE_STATUSES

`DRAFT_STATUSES` is the source of truth for what qualifies as a "draft" card. All statuses in this array produce `cardVariant = 'draft'` and therefore display the edit and review-share buttons.

`CONTRACT_PAGE_STATUSES` drives the navigation decision in `handleView()`: contracts with these statuses are routed to the full detail page (`/contracts/{id}`), while draft contracts open in the inline viewer dialog.

---

## 5. Edit Button — Entry Point

### 5.1 ContractCard — Action Button Registration

**File:** [src/components/contracts/ContractCard.tsx](src/components/contracts/ContractCard.tsx)

The edit button is the second item in the actions array (between View and Download):

```typescript
{
    title:  tTooltips('editContract'),      // i18n key: "Edit Contract"
    icon:   <EditOutlinedIcon sx={{ fontSize: '0.9rem' }} />,
    onClick: () => onEdit?.(contract.id),
    color:  'primary.main',
    shadow: 'rgba(15, 118, 110, 0.2)',
    show:   variant === 'draft' && !!onEdit,
},
```

The button is **only rendered** when both conditions hold:
- `variant === 'draft'` — the contract is in a pre-approval status
- `!!onEdit` — the parent passed an edit handler (only done for draft cards)

The double guard prevents the button from appearing on `'contract'` or `'terminated'` cards even if a handler were accidentally passed.

### 5.2 ContractsContent — Handler and State

**File:** [src/components/contracts/ContractsContent.tsx](src/components/contracts/ContractsContent.tsx)

```typescript
// State
const [editDialogOpen, setEditDialogOpen] = useState(false);
const [contractForEdit, setContractForEdit] = useState<Contract | null>(null);

// Handler — finds the full Contract object from the loaded list
const handleEdit = (id: string) => {
    const contract = contracts.find(c => c.id === id);
    if (!contract) return;
    setContractForEdit(contract);
    setEditDialogOpen(true);
};
```

The full `Contract` object (not just the ID) is stored in state so `EditContractDialog` can pre-populate all form fields and load the existing PDF without an additional fetch.

The dialog is conditionally rendered to avoid mounting before a contract is selected:

```typescript
{contractForEdit && (
    <EditContractDialog
        open={editDialogOpen}
        onClose={() => { setEditDialogOpen(false); setContractForEdit(null); }}
        onSuccess={loadContracts}
        contract={contractForEdit}
    />
)}
```

### 5.3 Edit Button Visibility Rules

| Condition | Edit button shown? | Reason |
|---|---|---|
| `contract.status = 'DRAFT'` | ✓ | In DRAFT_STATUSES → cardVariant = 'draft' |
| `contract.status = 'IN_REVIEW'` | ✓ | In DRAFT_STATUSES |
| `contract.status = 'REJECTED_BY_REVIEWER'` | ✓ | In DRAFT_STATUSES |
| `contract.status = 'APPROVED'` | ✗ | Not in DRAFT_STATUSES → cardVariant = 'contract' |
| `contract.status = 'ACTIVE'` | ✗ | Not in DRAFT_STATUSES → cardVariant = 'contract' |
| `contract.status = 'TERMINATED'` | ✗ | cardVariant = 'terminated' |

---

## 6. EditContractDialog — Architecture

**File:** [src/components/contracts/EditContractDialog.tsx](src/components/contracts/EditContractDialog.tsx)

### 6.1 Component Props

```typescript
interface EditContractDialogProps {
    open:       boolean;
    onClose:    () => void;
    onSuccess?: () => void;    // Called after successful save → triggers loadContracts()
    contract:   Contract;      // Full Contract object — required for pre-population
}
```

### 6.2 Internal State

| State | Type | Purpose |
|---|---|---|
| `currentStep` | `1 \| 2` | Controls which step is rendered |
| `templates` | `Template[]` | Available templates loaded on dialog open |
| `selectedTemplate` | `Template \| null` | Currently selected template; pre-set from `contract.templateId` |
| `loadingTemplates` | `boolean` | Loading indicator for template Autocomplete |
| `documentUrl` | `string \| null` | URL passed to Apryse WebViewer in Step 2 |
| `initialXfdf` | `string \| undefined` | XFDF to restore annotations when viewer loads |
| `initialFormFields` | `any[] \| undefined` | Form field definitions for the viewer |
| `documentLoaded` | `boolean` | Guards the Save button; set by `onDocumentLoaded` callback |
| `loadingDocument` | `boolean` | Shows loading state on the "Next" button |
| `saving` | `boolean` | Shows loading state on the "Save" button |
| `filledFieldValues` | `Record<string, string>` | Live map of field name → current value from viewer |
| `startDate` / `endDate` | `string` | ISO date strings; controlled separately from RHF |
| `showUnsavedDialog` | `boolean` | Triggers the discard-changes confirmation dialog |

### 6.3 Step Flow

```
Dialog opens
  └── useEffect([open]) fires
        ├── reset(RHF) with contract.title, contract.client, contract.description
        ├── setStartDate(contract.startDate)
        ├── setEndDate(contract.endDate)
        ├── setFilledFieldValues(contract.fieldValues)
        └── loadTemplateList()
              └── getAllTemplates()
                    └── pre-select: templates.find(t => t.id === contract.templateId)

Step 1: User edits metadata / optionally selects a different template
  └── Click "Next: Edit Document"
        └── handleNextStep()
              ├── Zod validate: contractTitle, clientName, description
              ├── Resolve document URL (see §7.6)
              └── setCurrentStep(2)

Step 2: User edits PDF in full-screen Apryse viewer
  └── Click "Save Contract"
        └── handleSave()
              ├── Export PDF blob + XFDF from viewer
              ├── Export form fields + merge party assignments
              ├── PATCH /contracts/{id}   → Spring Boot (metadata)
              └── PUT   /contracts/{id}/file → MinIO (PDF binary)

Step 2: User clicks "Back to Details"
  └── setCurrentStep(1); setDocumentLoaded(false)

Close attempt (Step 2, document loaded)
  └── ConfirmationDialog: "Discard Changes?"
        ├── Yes → handleClose() — full state reset
        └── No  → stay on Step 2
```

---

## 7. Step 1 — Contract Details

### 7.1 Pre-Population

When the dialog opens, all fields are pre-filled from the passed `contract` object:

```typescript
useEffect(() => {
    if (!open) return;
    reset({
        contractTitle: contract.title.replace(/\s*\(Renewal\d*\)$/i, ''),
        clientName:    contract.client,
        description:   contract.description || '',
    });
    setStartDate(contract.startDate || '');
    setEndDate(contract.endDate || '');
    setFilledFieldValues(contract.fieldValues || {});
    setCurrentStep(1);
    setDocumentUrl(null);
    setDocumentLoaded(false);
    setError('');
    loadTemplateList();
}, [open]);
```

The `(Renewal\d*)` suffix is stripped from the title on pre-fill to present a clean value to the user (renewal copies append `(Renewal)` programmatically).

### 7.2 Form Fields

| UI Field | Form Key | Pre-filled From | Required | Max Length |
|---|---|---|---|---|
| Contract Title | `contractTitle` | `contract.title` | Yes | 50 chars |
| Client Name | `clientName` | `contract.client` | Yes | 50 chars |
| Description | `description` | `contract.description` | No | 500 chars |
| Start Date | `startDate` (state) | `contract.startDate` | No | — |
| End Date | `endDate` (state) | `contract.endDate` | No | ≥ Start Date |
| Template | `selectedTemplate` (state) | `templates.find(t.id === contract.templateId)` | No | — |

Dates are managed outside of React Hook Form (plain `useState` strings) because MUI DatePicker does not integrate natively with RHF's controlled inputs.

### 7.3 Template Selector

The template selector is an MUI `Autocomplete` component loaded from Spring Boot on dialog open:

```typescript
const loadTemplateList = async () => {
    setLoadingTemplates(true);
    try {
        const allTemplates = await templateService.getAllTemplates();
        // → GET /api/backend/templates → Spring Boot
        setTemplates(allTemplates);
        const found = allTemplates.find(t => t.id === contract.templateId) || null;
        setSelectedTemplate(found);
    } finally {
        setLoadingTemplates(false);
    }
};
```

The template pre-selected on open is the one the contract was originally created from (`contract.templateId`). The user may change this to any available template.

### 7.4 Template Change Detection

```typescript
// True when the user has selected a template different from the contract's original
const templateChanged = selectedTemplate !== null
    && selectedTemplate.id !== contract.templateId;
```

`templateChanged` is used in Step 1 to show a warning indicator, and in `handleNextStep` and `handleSave` to decide which document and field data to use.

### 7.5 Validation Rules

**Zod schema** ([src/schemas/contractSchema.ts](src/schemas/contractSchema.ts)):

```typescript
export const contractStep1Schema = z.object({
    contractTitle: z.string().min(1, 'Contract title is required').max(50),
    clientName:    z.string().min(1, 'Client name is required').max(50),
    description:   z.string().max(500),
});
```

The "Next: Edit Document" button is also disabled client-side when `contractTitle` or `clientName` are empty:

```typescript
disabled={!contractTitle.trim() || !clientName.trim() || loadingDocument}
```

### 7.6 Step Transition — Document Loading

`handleNextStep()` resolves the document URL before switching to Step 2:

```typescript
const handleNextStep = async () => {
    const valid = await trigger(['contractTitle', 'clientName', 'description']);
    if (!valid) return;

    setLoadingDocument(true);
    try {
        if (templateChanged && selectedTemplate) {
            // ── Template switched: load template PDF ──────────────────────────────
            const [fullTemplate, viewUrl] = await Promise.all([
                templateService.getTemplateById(selectedTemplate.id),
                getTemplateViewUrl(selectedTemplate.id),
            ]);
            const tpl = fullTemplate || selectedTemplate;
            const url = viewUrl || tpl.fileData || tpl.fileUrl;
            if (!url) { setError('Failed to load template document.'); return; }

            setDocumentUrl(url);
            setInitialXfdf(tpl.xfdfData);
            setInitialFormFields(tpl.formFields);
        } else {
            // ── Same template: load existing contract PDF ─────────────────────────
            let url: string | null = null;
            if      (contract.fileUploaded) url = await apiService.getContractViewUrl(contract.id);
            else if (contract.fileUrl)      url = contract.fileUrl;
            else if (contract.fileData)     url = `data:application/pdf;base64,${contract.fileData}`;
            else if (contract.signedPdfBase64) url = `data:application/pdf;base64,${contract.signedPdfBase64}`;

            if (!url) { setError('No document found for this contract.'); return; }
            setDocumentUrl(url);
            setInitialXfdf(contract.xfdfData);
            setInitialFormFields(contract.formFields);
        }
        setCurrentStep(2);
    } finally {
        setLoadingDocument(false);
    }
};
```

The "Next" button shows a loading spinner while the document URL is being fetched, preventing double-clicks and providing user feedback.

---

## 8. Step 2 — PDF Editor

### 8.1 Viewer Configuration

**File:** [src/components/viewer/PDFViewerContainer.tsx](src/components/viewer/PDFViewerContainer.tsx)

```typescript
<PDFViewerContainer
    ref={pdfViewerRef}
    documentUrl={documentUrl}
    initialXfdf={initialXfdf}
    formFields={initialFormFields}
    readOnly={false}
    currentUserRole="contractor"
    canAddFormFields={false}
    toolbarMode="forms"
    defaultToolbar="view"
    editableFieldMode="all"        // Any field is editable regardless of party assignment
    showAnnotationNavigation={true}
    onFieldChange={(fieldName, value) => {
        setFilledFieldValues(prev => ({ ...prev, [fieldName]: value?.toString() ?? '' }));
    }}
    onDocumentLoaded={() => setDocumentLoaded(true)}
    onError={(err) => setError(err)}
/>
```

| Prop | Value | Effect |
|---|---|---|
| `editableFieldMode` | `'all'` | All form fields are editable regardless of party assignment — appropriate since the contract owner is editing their own draft |
| `canAddFormFields` | `false` | Field structure is fixed; only values can be changed |
| `currentUserRole` | `'contractor'` | Ensures viewer is not in read-only reviewer mode |
| `toolbarMode` | `'forms'` | Shows form-filling tools; no annotation/insert toolbars |

> **Design note:** Unlike the creation wizard which enforces `editableFieldMode="empty-only"` and single-party restrictions, the edit dialog uses `editableFieldMode="all"` because the contract owner legitimately needs to correct any field — including those pre-filled by autofill or by a different party's intended slot.

### 8.2 Document Source Resolution

When `templateChanged` is `false` (the common case), the existing contract PDF is loaded. The resolution follows a priority chain:

```
1. contract.fileUploaded = true
   └── GET /contracts/{id}/file/view-url → MinIO presigned URL (15 min TTL)
       Used by: Apryse WebViewer (range-request compatible)

2. contract.fileUrl (legacy)
   └── Use URL directly

3. contract.fileData (legacy MongoDB base64)
   └── data:application/pdf;base64,{fileData}

4. contract.signedPdfBase64 (legacy)
   └── data:application/pdf;base64,{signedPdfBase64}
```

The MinIO presigned URL path (`fileUploaded = true`) is the standard path for all contracts created after the Spring Boot integration. The base64 fallback paths exist for contracts created before MinIO storage was introduced.

### 8.3 Template-Switch Document Loading

When `templateChanged` is `true`, the new template's PDF is loaded instead:

```
templateService.getTemplateById(selectedTemplate.id)   // full Template object
getTemplateViewUrl(selectedTemplate.id)                // MinIO presigned URL

Priority:
  viewUrl      (presigned URL from MinIO — preferred for large PDFs)
  tpl.fileData (base64 fallback)
  tpl.fileUrl  (URL fallback)
```

`getTemplateViewUrl()` is called in parallel with `getTemplateById()` to minimise latency. If the presigned URL fails, the template object's own file fields are used as fallback.

### 8.4 Field Change Tracking

Every keystroke or checkbox toggle in the viewer fires `onFieldChange`:

```typescript
onFieldChange={(fieldName, value) => {
    setFilledFieldValues(prev => ({
        ...prev,
        [fieldName]: value?.toString() ?? '',
    }));
}}
```

`filledFieldValues` is the live source of truth used at save time to build `fieldValues` and to override field values during the form field merge step.

---

## 9. Save Pipeline

**File:** [src/components/contracts/EditContractDialog.tsx](src/components/contracts/EditContractDialog.tsx) — `handleSave()`

### 9.1 PDF and XFDF Export

```typescript
const exportResult = await pdfViewerRef.current?.exportAnnotations({}, { flatten: false });
if (!exportResult?.blob) {
    setError('Failed to export document. Please try again.');
    return;
}
const { blob: pdfBlob, xfdfString } = exportResult;
```

`flatten: false` keeps signature and annotation objects as interactive elements so downstream signers can still add their own signatures.

### 9.2 Form Field Export and Party Assignment Merge

```typescript
let exportedFormFields = await pdfViewerRef.current?.exportFormFields();

// Source fields for party/profile metadata
const sourceFields = templateChanged
    ? (selectedTemplate?.formFields || [])   // new template's fields
    : (contract.formFields || []);           // contract's existing fields

if (exportedFormFields && sourceFields.length > 0) {
    const sourceMap = new Map(sourceFields.map((f: any) => [f.name, f]));
    exportedFormFields = exportedFormFields.map(field => {
        const src = sourceMap.get(field.name) as any;
        return {
            ...field,
            value:         filledFieldValues[field.name] ?? field.value ?? '',
            assignedParty: src?.assignedParty || field.assignedParty,
            partyLabel:    src?.partyLabel    || field.partyLabel,
            partyColor:    src?.partyColor    || field.partyColor,
            profileKey:    src?.profileKey    ?? field.profileKey ?? null,
        };
    });
}
```

Apryse's `exportFormFields()` returns field geometry and values but does not preserve party assignments or `profileKey` mappings — those exist only in the CMS data model. The merge step re-attaches them from the source (either the existing contract fields or the new template's fields) so they survive the save and remain usable for signing and autofill.

### 9.3 Metadata Assembly

```typescript
const finalStartDate  = startDate || dayjs().format('YYYY-MM-DD');
const finalEndDate    = endDate   || dayjs(finalStartDate).add(1, 'year').format('YYYY-MM-DD');
const expiresInDays   = dayjs(finalEndDate).diff(dayjs(), 'day');

const updateData: Record<string, any> = {
    name:          contractTitle.trim(),
    title:         contractTitle.trim(),
    client:        clientName.trim(),
    description:   description || contract.description || '',
    expiresInDays,
    startDate:     finalStartDate,
    endDate:       finalEndDate,
    xfdfData:      xfdfString,
    fieldValues:   filledFieldValues,
    formFields:    exportedFormFields,
    hasFormFields: (exportedFormFields?.length ?? 0) > 0,
};

// Additional fields written only when the template was switched
if (templateChanged && selectedTemplate) {
    updateData.templateId         = selectedTemplate.id;
    updateData.templateName       = selectedTemplate.name;
    updateData.content            = selectedTemplate.content || '';
    updateData.templateDocxBase64 = selectedTemplate.docxBase64;
    updateData.templateFileName   = selectedTemplate.fileName;
    updateData.category           = selectedTemplate.category;
    updateData.parties            = selectedTemplate.parties;
}
```

Fields intentionally **not included** in the payload:

| Field | Reason |
|---|---|
| `status` | Status must not be altered by an edit save |
| `reviewers` | Reviewer assignments survive the edit |
| `approver` | Approver assignment survives the edit |
| `reviewStatus` | Review sub-status (e.g. `changes_requested`) survives |
| `createdBy` | Ownership does not change |
| `teamId` | Team assignment is not editable from this dialog |

### 9.4 Persist Metadata to Spring Boot

```typescript
const updateResult = await apiService.updateContractDocument(contract.id, updateData);
// → httpClient.patch('/contracts/{id}', updateData)
// → PATCH /api/backend/contracts/{id} → Spring Boot PATCH /contracts/{id}

if (!updateResult.success) {
    setError(updateResult.message || 'Failed to update contract');
    return;
}
```

This is a PATCH request — Spring Boot performs a merge update, writing only the provided fields and leaving unspecified fields unchanged. `reviewers`, `approver`, and `status` are not in the payload and are therefore not touched.

> **Important:** Always use `apiService.updateContractDocument()` (Spring Boot route), never the internal Next.js `/api/contracts/[id]` route. Spring Boot contracts live in Spring Boot's MongoDB context; the internal route queries a different context and returns 404.

### 9.5 PDF Upload to MinIO

```typescript
const uploadResult = await contractService.updateContractSignedPdf(
    contract.id,
    pdfBlob,    // Blob — exported from Apryse
    xfdfString
);
```

`updateContractSignedPdf()` accepts both `Blob` and `base64 string`. The upload protocol (single-shot vs. chunked) is identical to the creation flow:

```
blob.size < 30 MB  →  PUT /contracts/{id}/file   (single-shot)
blob.size ≥ 30 MB  →  Initiate → Presign → PUT (per chunk) → Complete (chunked multipart)
```

After a successful upload, Spring Boot sets `fileUploaded = true` on the contract record. Subsequent `handleView()` and `handleNextStep()` calls will use `getContractViewUrl()` to fetch a fresh presigned URL.

For the full chunked upload protocol, see the [Contract Creation Flow documentation](contract-creation-flow.md#10-pdf-upload-protocol--single-shot-vs-chunked).

### 9.6 Success and Post-Save State

```typescript
setSnackbar({ open: true, message: 'Contract updated successfully!', severity: 'success' });
onSuccess?.();            // → loadContracts() in ContractsContent — list refreshes
setTimeout(() => handleClose(), 1200);   // Auto-close after snackbar is visible
```

`handleClose()` resets all local state:

```typescript
const handleClose = () => {
    setCurrentStep(1);
    setSelectedTemplate(null);
    reset();
    setStartDate('');
    setEndDate('');
    setDocumentUrl(null);
    setDocumentLoaded(false);
    setError('');
    setFilledFieldValues({});
    pdfViewerRef.current?.dispose();  // Explicitly disposes the Apryse WebViewer instance
    onClose();
};
```

`pdfViewerRef.current?.dispose()` is called explicitly to ensure Apryse releases its WebGL context and event listeners. Omitting this call can cause memory leaks and viewer initialisation failures on subsequent dialog opens.

---

## 10. Template Switching — Deep Dive

### 10.1 User Interaction

1. In Step 1, the user opens the Template autocomplete and selects a different template from the pre-selected one.
2. `setSelectedTemplate(newTemplate)` updates state.
3. `templateChanged` computes to `true` immediately: `selectedTemplate.id !== contract.templateId`.
4. The right-hand info box in Step 1 switches from showing the template name to the warning indicator.
5. The user proceeds to Step 2 and sees the new template's blank PDF loaded in the viewer.

### 10.2 Warning Indicator

When `templateChanged` is true, the template info box renders an amber warning:

```
┌─────────────────────────────────────────────────────────────────────┐
│  ⚠ Template changed                                                │
│  The document will reload with the new template                     │
└─────────────────────────────────────────────────────────────────────┘
```

The warning is informational — it does not block progression to Step 2.

### 10.3 Effect on Save Payload

When saving with a changed template, the following additional fields are written to the contract:

| Field | Source |
|---|---|
| `templateId` | `selectedTemplate.id` |
| `templateName` | `selectedTemplate.name` |
| `templateFileName` | `selectedTemplate.fileName` |
| `templateDocxBase64` | `selectedTemplate.docxBase64` |
| `content` | `selectedTemplate.content` |
| `category` | `selectedTemplate.category` |
| `parties` | `selectedTemplate.parties` |

The `category` and `parties` fields are replaced entirely when the template changes. This is intentional — parties are defined by the template, and mixing party configurations from different templates is not supported.

### 10.4 Party and Field Assignment Behaviour

| Scenario | Field Assignments |
|---|---|
| **Template unchanged** | `assignedParty`, `partyLabel`, `partyColor`, `profileKey` are copied from `contract.formFields` (existing assignments) |
| **Template changed** | `assignedParty`, `partyLabel`, `partyColor`, `profileKey` are copied from the new `selectedTemplate.formFields` |
| **Field name exists in new template** | Assignment from new template applied |
| **Field name absent in new template** | No assignment (field remains unassigned) |

---

## 11. Unsaved Changes Handling

If the user attempts to close the dialog while on Step 2 with a loaded document, a confirmation dialog is shown:

```typescript
const handleCloseAttempt = () => {
    if (currentStep === 2 && documentLoaded) {
        setShowUnsavedDialog(true);
    } else {
        handleClose();
    }
};
```

```
┌─────────────────────────────────────────────────────────────────────┐
│  Discard Changes                                                    │
│  Close without saving? All unsaved edits will be lost.             │
│                                                        [No] [Yes]  │
└─────────────────────────────────────────────────────────────────────┘
```

| Action | Result |
|---|---|
| **Yes** | `setShowUnsavedDialog(false)` → `handleClose()` — all state reset, Apryse disposed |
| **No** | `setShowUnsavedDialog(false)` — returns to Step 2 without closing |

On Step 1 (before the viewer loads), close is immediate with no confirmation.

---

## 12. Share Button — Submit for Review (draft variant)

### 12.1 Behaviour by Variant

The share icon on a `ContractCard` serves two completely different purposes depending on variant:

| Variant | Handler | Dialog Opened | Purpose |
|---|---|---|---|
| `'draft'` | `handleShare(id)` | `RequestReviewDialog` | Submit contract to reviewers and/or an approver |
| `'contract'` | `handleShareContract(id)` | `SubmitForSignatureDialog` or `MultiPartySignatureDialog` | Send contract to signers |
| `'terminated'` | not rendered | — | Not applicable |

The tooltip also changes:

```typescript
const getShareTooltip = (): string =>
    variant === 'draft'
        ? tTooltips('submitForReviewOrApproval')   // "Submit for review or approval"
        : tTooltips('submitForSignature');          // "Submit for signature"
```

### 12.2 Review Submission Flow

**File:** [src/components/contracts/ContractsContent.tsx](src/components/contracts/ContractsContent.tsx)

```typescript
const handleShare = (id: string) => {
    const contract = contracts.find(c => c.id === id);
    if (!contract) return;
    setContractForReview(contract);
    setReviewDialogOpen(true);
};
```

`RequestReviewDialog` accepts reviewer email list, an optional approver email, and optional per-role submission messages. On submit, `contractService.submitForReview()` is called which PATCHes the contract status to `IN_REVIEW` (if reviewers assigned) or `IN_APPROVAL` (if approver only), and sends email notifications via EmailJS.

For the complete review/approval workflow, see [Review & Approval Workflow](review-approval-workflow.md).

---

## 13. ContractStatus Fix — Case Alignment with Backend

### 13.1 Root Cause

Spring Boot serialises Java enum constants using their declared name (uppercase by default in Jackson). The frontend `ContractStatus` enum previously used lowercase string values (`'draft'`, `'in_review'`). This caused `DRAFT_STATUSES.includes(contract.status)` to always return `false` for contracts with backend-provided status strings, making every contract appear as `cardVariant = 'contract'` and hiding both the edit and share buttons.

### 13.2 Affected Files

The following files were updated as part of the fix:

| File | Change |
|---|---|
| [src/types/contract.ts](src/types/contract.ts) | All `ContractStatus` enum values changed to uppercase strings |
| [translations/en.json](translations/en.json) | `contractStatus` namespace keys changed to uppercase (`"DRAFT"`, `"IN_REVIEW"`, etc.) |
| [translations/hi.json](translations/hi.json) | Same key change as `en.json` for Hindi locale |
| [src/components/overview/OverviewDrawer.tsx](src/components/overview/OverviewDrawer.tsx) | URL query params updated: `?status=draft` → `?status=DRAFT`, etc. |
| [src/app/api/contracts/\[id\]/terminate/route.ts](src/app/api/contracts/[id]/terminate/route.ts) | Hardcoded `'terminated'` → `'TERMINATED'` |
| [src/components/contracts/ContractInformation.tsx](src/components/contracts/ContractInformation.tsx) | `'signed'`, `'expired'`, `'expiring'` → uppercase |
| [src/components/contracts/ContractHistoryPanel.tsx](src/components/contracts/ContractHistoryPanel.tsx) | `'terminated'` and `upcomingStatuses` array → uppercase |

**Sub-object statuses were not changed.** Fields such as `approver.status`, `signer.status`, `signRequest.status`, and `reviewStatus` are backend sub-object fields that may use different casing conventions. Only `contract.status` (the top-level status field) was affected by this fix.

### 13.3 Translation Key Alignment

Two components use `tStatus(contract.status)` to look up a translated status label dynamically:

```typescript
// src/app/contracts/[id]/page.tsx
// src/components/dashboard/RecentContracts.tsx
const tStatus = useTranslations('contractStatus');
label={tStatus(contract.status as Parameters<typeof tStatus>[0])}
```

Because `contract.status` is now `'DRAFT'` etc., the `contractStatus` translation namespace keys were updated to match:

```json
// translations/en.json — before
"contractStatus": { "draft": "Draft", "in_review": "In Review", ... }

// translations/en.json — after
"contractStatus": { "DRAFT": "Draft", "IN_REVIEW": "In Review", ... }
```

The `filters` namespace (`"draft"`, `"active"`, etc.) was **not changed** — those keys are used as display labels for filter UI elements, not as dynamic lookups keyed by `contract.status`.

---

## 14. API Reference

All paths are accessed through the Next.js proxy. The browser calls `/api/backend/<path>` which is rewritten to `http://localhost:8080/<path>`.

---

### 14.1 PATCH /contracts/{id} — Metadata Update

Updates contract metadata fields. Uses merge semantics — only provided fields are written; unspecified fields are unchanged.

**Request:**

```
PATCH /api/backend/contracts/664a1f2e3b0000000000003a
Content-Type: application/json
Authorization: Bearer <JWT>

{
    "name":          "Updated Service Agreement",
    "title":         "Updated Service Agreement",
    "client":        "New Client Name",
    "description":   "Updated description",
    "startDate":     "2026-07-01",
    "endDate":       "2027-07-01",
    "expiresInDays": 365,
    "xfdfData":      "<?xml version=\"1.0\"?>...",
    "fieldValues":   { "client_name": "New Client Name" },
    "formFields":    [ { "name": "client_name", "value": "New Client Name", ... } ],
    "hasFormFields": true
}
```

Fields sent only when template was changed (in addition to the above):

```json
{
    "templateId":         "664a1f2e3b0000000000001b",
    "templateName":       "New Template Name",
    "templateFileName":   "new-template.pdf",
    "templateDocxBase64": "...",
    "content":            "",
    "category":           "NDA",
    "parties":            [ { "id": "party_1", "label": "Signer", "color": "#4CAF50", "order": 1 } ]
}
```

**Response — 200 OK:**

```json
{ "message": "Contract updated successfully" }
```

---

### 14.2 PUT /contracts/{id}/file — PDF Upload

Uploads the updated PDF binary. Spring Boot stores it in MinIO and sets `fileUploaded = true`.

**Request:**

```
PUT /api/backend/contracts/664a1f2e3b0000000000003a/file
Content-Type: application/pdf
Authorization: Bearer <JWT>

<raw PDF bytes>
```

**Response — 200 OK:**

```json
{ "message": "File uploaded successfully", "fileUploaded": true }
```

For files ≥ 30 MB, the chunked multipart upload protocol is used instead. See [Contract Creation Flow §10](contract-creation-flow.md#10-pdf-upload-protocol--single-shot-vs-chunked).

---

### 14.3 GET /contracts/{id}/file/view-url — Presigned Read URL

Returns a 15-minute presigned MinIO URL for loading the existing contract PDF into Apryse WebViewer.

**Request:**

```
GET /api/backend/contracts/664a1f2e3b0000000000003a/file/view-url
Authorization: Bearer <JWT>
```

**Response — 200 OK:**

```json
{
    "url": "https://minio-host:9000/contracts/664a...3a.pdf?X-Amz-Expires=900&X-Amz-Signature=..."
}
```

Returns 404 if `fileUploaded = false`.

> **Usage:** Pass the returned `url` directly to Apryse WebViewer as `documentUrl`. Do NOT add an `Authorization` header — credentials are embedded in the URL's query string.

---

### 14.4 GET /templates/{id}/file/view-url — Template Presigned Read URL

Returns a 15-minute presigned MinIO URL for loading a template PDF. Used when the user switches to a different template in Step 1.

**File:** [src/utils/getTemplateViewUrl.ts](src/utils/getTemplateViewUrl.ts)

**Request:**

```
GET /api/backend/templates/664a1f2e3b0000000000001b/file/view-url
Authorization: Bearer <JWT>
```

**Response — 200 OK:**

```json
{
    "url": "https://minio-host:9000/templates/664a...1b.pdf?X-Amz-Expires=900&X-Amz-Signature=..."
}
```

Returns `null` (from `getTemplateViewUrl()`) on failure; the caller falls back to `template.fileData` or `template.fileUrl`.

---

## 15. End-to-End Sequence Diagram

```
User          ContractsContent       EditContractDialog         apiService           Spring Boot / MinIO
 │                   │                       │                       │                      │
 │─[Hover draft card]→│                       │                       │                      │
 │  ← pencil icon appears (variant='draft', onEdit passed)           │                      │
 │                   │                       │                       │                      │
 │─[Click ✏ icon]────→│                       │                       │                      │
 │                   │─handleEdit(id)─────────→ setContractForEdit    │                      │
 │                   │                       │  setEditDialogOpen     │                      │
 │                   │                       │                       │                      │
 │  ┌── DIALOG OPEN ─────────────────────────────────────────────────────────────────────┐  │
 │  │              useEffect([open]) fires   │                       │                   │  │
 │  │              reset(RHF fields)         │                       │                   │  │
 │  │              setDates, setFieldValues  │                       │                   │  │
 │  │                                        │─getAllTemplates()─────→│─→Spring Boot      │  │
 │  │                                        │←templates[]────────────│                   │  │
 │  │              pre-select contract.templateId                    │                   │  │
 │  │                                        │                       │                   │  │
 │  │  ┌── STEP 1 ──────────────────────────────────────────────────────────────────────┐│  │
 │  │  │  User reviews/edits: title, client, description, dates     │                  ││  │
 │  │  │  User may select a different template                       │                  ││  │
 │  │  │  templateChanged = (selected.id !== contract.templateId)    │                  ││  │
 │  │  │                                                             │                  ││  │
 │  │  │  [Next: Edit Document]                                      │                  ││  │
 │  │  │    Zod validate                                             │                  ││  │
 │  │  │    if templateChanged:                                      │                  ││  │
 │  │  │      getTemplateById(id) ──────────────────────────────────→│─→Spring Boot     ││  │
 │  │  │      getTemplateViewUrl(id) ──────────────────────────────→│─→Spring Boot     ││  │
 │  │  │      setDocumentUrl(viewUrl || tpl.fileData || tpl.fileUrl) │                  ││  │
 │  │  │    else:                                                    │                  ││  │
 │  │  │      if fileUploaded: getContractViewUrl(id) ─────────────→│─→Spring Boot     ││  │
 │  │  │      else: use fileUrl / fileData / signedPdfBase64 fallback│                  ││  │
 │  │  │    setCurrentStep(2)                                        │                  ││  │
 │  │  └────────────────────────────────────────────────────────────────────────────────┘│  │
 │  │                                        │                       │                   │  │
 │  │  ┌── STEP 2 ──────────────────────────────────────────────────────────────────────┐│  │
 │  │  │  PDFViewerContainer mounts          │                       │                  ││  │
 │  │  │  Apryse loads documentUrl           │                       │                  ││  │
 │  │  │  onDocumentLoaded → setDocumentLoaded(true) → Save enabled  │                  ││  │
 │  │  │  User edits fields (editableFieldMode='all')                │                  ││  │
 │  │  │  onFieldChange → filledFieldValues{}                        │                  ││  │
 │  │  │                                                             │                  ││  │
 │  │  │  [Save Contract]                                            │                  ││  │
 │  │  │    exportAnnotations() → { blob, xfdfString }              │                  ││  │
 │  │  │    exportFormFields() + merge with source field assignments │                  ││  │
 │  │  │    assemble updateData {}                                   │                  ││  │
 │  │  │                                                             │                  ││  │
 │  │  │    PATCH /contracts/{id} ──────────────────────────────────→│─→MongoDB         ││  │
 │  │  │    ←{ success }──────────────────────────────────────────── │                  ││  │
 │  │  │                                                             │                  ││  │
 │  │  │    ┌── PDF UPLOAD ──────────────────────────────────────────────────────────────┐│  │
 │  │  │    │  if blob < 30MB: PUT /contracts/{id}/file ────────────→│─→MinIO          ││  │
 │  │  │    │  if blob ≥ 30MB: chunked multipart upload             │                  ││  │
 │  │  │    └────────────────────────────────────────────────────────────────────────────┘│  │
 │  │  │                                                             │                  ││  │
 │  │  │    Show "Contract updated successfully!" snackbar          │                  ││  │
 │  │  │    onSuccess() → loadContracts() → card reflects any title/client changes      ││  │
 │  │  │    setTimeout(handleClose, 1200)                           │                  ││  │
 │  │  └────────────────────────────────────────────────────────────────────────────────┘│  │
 │  └────────────────────────────────────────────────────────────────────────────────────┘  │
```

---

## 16. File Reference

| File | Role |
|---|---|
| [src/components/contracts/EditContractDialog.tsx](src/components/contracts/EditContractDialog.tsx) | Main edit dialog — two-step wizard for metadata + PDF editing |
| [src/components/contracts/ContractCard.tsx](src/components/contracts/ContractCard.tsx) | Renders the edit pencil icon button; variant system controls visibility |
| [src/components/contracts/ContractsContent.tsx](src/components/contracts/ContractsContent.tsx) | `handleEdit()` handler; `editDialogOpen` + `contractForEdit` state; passes `onEdit` to draft cards |
| [src/components/viewer/PDFViewerContainer.tsx](src/components/viewer/PDFViewerContainer.tsx) | Apryse WebViewer v11 wrapper; `editableFieldMode="all"` for edit context |
| [src/components/common/BaseDialog.tsx](src/components/common/BaseDialog.tsx) | Dialog shell — provides `noPadding`, `fullScreen`, `disableEnforceFocus` props used in Step 2 |
| [src/components/common/ConfirmationDialog.tsx](src/components/common/ConfirmationDialog.tsx) | "Discard changes?" prompt shown on close from Step 2 |
| [src/services/apiService.ts](src/services/apiService.ts) | `updateContractDocument(id, data)` → PATCH Spring Boot; `getContractViewUrl(id)` → presigned URL |
| [src/services/contractService.ts](src/services/contractService.ts) | `updateContractSignedPdf(id, blob, xfdf)` → single-shot or chunked PDF upload |
| [src/services/templateService.ts](src/services/templateService.ts) | `getAllTemplates()`, `getTemplateById(id)` → template list and detail from Spring Boot |
| [src/utils/getTemplateViewUrl.ts](src/utils/getTemplateViewUrl.ts) | `getTemplateViewUrl(id)` → GET `/templates/{id}/file/view-url` → MinIO presigned URL for template PDF |
| [src/types/contract.ts](src/types/contract.ts) | `Contract` interface; `ContractStatus` enum (uppercase values matching Spring Boot) |
| [src/schemas/contractSchema.ts](src/schemas/contractSchema.ts) | `contractStep1Schema` — Zod validation for Step 1 form fields |
| [src/components/overview/OverviewDrawer.tsx](src/components/overview/OverviewDrawer.tsx) | Navigation URL params updated to uppercase status values |
| [translations/en.json](translations/en.json) | `"editContract"` tooltip key; `contractStatus` namespace keys (uppercase) |
| [translations/hi.json](translations/hi.json) | Hindi locale equivalents of the above |
