# Autofill Profile Feature — Technical Documentation

**Version:** 1.0  
**Last Updated:** 2026-05-08  
**Status:** Implemented

---

## Table of Contents

1. [Overview](#1-overview)
2. [Architecture](#2-architecture)
3. [Data Model](#3-data-model)
4. [Components & Files](#4-components--files)
5. [Phase 1 — Template Setup: Field Mapping](#5-phase-1--template-setup-field-mapping)
6. [Phase 2 — Contract Creation: Autofill Execution](#6-phase-2--contract-creation-autofill-execution)
7. [Phase 3 — Contract Signing: Autofill Execution](#7-phase-3--contract-signing-autofill-execution)
8. [Core Engine: `autofillFields()`](#8-core-engine-autofillfields)
9. [Party Selection Logic](#9-party-selection-logic)
10. [Profile Data Pipeline](#10-profile-data-pipeline)
11. [Feedback & Error States](#11-feedback--error-states)
12. [Edge Cases](#12-edge-cases)
13. [Extending the Feature](#13-extending-the-feature)
14. [Full Data Flow Diagram](#14-full-data-flow-diagram)

---

## 1. Overview

The Autofill feature allows users (contractors and internal signers) to automatically populate PDF form fields with data from their saved profile — name, email, department, organization, date of birth, gender, address, PAN, and Aadhar number.

### Problem the Feature Solves

Previously, autofill worked by matching field names against keywords (e.g. a field named `client_name` would match the keyword `name`). This had a critical flaw: **PDF form fields must have unique names**, so if a template needed two separate "Name" fields for the same party, both could not share the same name — and only one would ever be found by keyword matching.

### Solution: Explicit Profile Key Mapping

The template creator **explicitly maps** each form field to a profile key during template setup. Multiple fields with different names can map to the same profile key. Fields with no mapping are never autofilled.

**Example:**
| Field Name | Assigned Party | Profile Key |
|---|---|---|
| `buyer_full_name` | Party 1 — Buyer | `name` |
| `buyer_company` | Party 1 — Buyer | `organization` |
| `seller_name` | Party 2 — Seller | `name` |
| `notes_box` | Party 2 — Seller | _(none)_ |

When the Buyer autofills, `buyer_full_name` and `buyer_company` are filled. `seller_name` is skipped (different party). `notes_box` is skipped (no profile key mapped).

---

## 2. Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                     AUTOFILL ARCHITECTURE                       │
├──────────────────────┬──────────────────────────────────────────┤
│   TEMPLATE PHASE     │             CONTRACT PHASE               │
│                      │                                          │
│  UploadTemplateDialog│   CreateContractDialog                   │
│  EditTemplateDialog  │   RenewContractDialog    ──────► PDF     │
│         │            │   DocumentViewerDialog                   │
│         ▼            │          │                               │
│  ProfileFieldMapping │          ▼                               │
│  Dialog              │   AutofillPartyDialog                    │
│         │            │          │                               │
│         ▼            │          ▼                               │
│   template.formFields│   PDFViewerContainer                     │
│   [].profileKey ─────┼──► autofillFields()                      │
│   persisted in DB    │                                          │
└──────────────────────┴──────────────────────────────────────────┘
                               │
                        profileKeyOptions.ts
                     ┌─────────┴─────────┐
                     │  getProfileKeyOptions()  │
                     │  buildProfileData()      │
                     └──────────────────────────┘
                               │
                         LoggedInUser
                     (authService.getCurrentUser)
```

**Key Design Principles:**

- **Explicit over implicit** — no heuristic keyword matching; every field-to-profile-key link is created by the template author.
- **Dynamic, not hardcoded** — available profile keys are derived at runtime from the `LoggedInUser` object. Adding a new profile field automatically makes it appear in the mapping dropdown with zero code changes to the dialog.
- **Non-destructive** — autofill never overwrites a field that already has a value.
- **Party-scoped** — each autofill operation is restricted to one party's fields, preventing one user from filling another party's fields.

---

## 3. Data Model

### 3.1 `FormFieldDefinition` — `src/types/template.ts`

The core addition is a single optional field on `FormFieldDefinition`:

```typescript
interface FormFieldDefinition {
    name: string;
    type: 'text' | 'checkbox' | 'radio' | 'dropdown' | 'date' | 'signature';
    
    // Multi-party assignment
    assignedParty?: string;      // e.g. "party_abc123"
    partyLabel?: string;         // e.g. "Buyer"
    partyColor?: string;         // e.g. "#4f46e5"
    
    // Autofill mapping
    profileKey?: string | null;  // e.g. "name", "email", "department"
                                 // string (not a union) so future profile fields work
                                 // without a type change
}
```

`profileKey` is intentionally typed as `string | null` — not a union like `'name' | 'email' | 'department'`. This ensures any future field added to `LoggedInUser` works automatically without a type change here.

### 3.2 `LoggedInUser` — `src/types/auth.ts`

```typescript
interface LoggedInUser {
    // System keys — never exposed as autofill options
    id: string;
    email: string;          // Email IS a profile key (not system-only)
    lastLogin: string;
    isAdmin: boolean;
    
    // Profile keys — available for autofill mapping
    name?: string;
    department?: string;
    organization?: string;
    dateOfBirth?: string;
    gender?: string;
    permanentAddress?: string;
    panCard?: string;
    aadharCard?: string;
}
```

### 3.3 `ProfileKeyOption` — `src/utils/profileKeyOptions.ts`

The shape returned by `getProfileKeyOptions()`:

```typescript
interface ProfileKeyOption {
    value: string;  // the key name in LoggedInUser, e.g. 'name'
    label: string;  // display label, e.g. 'Full Name'
}
```

---

## 4. Components & Files

| File | Type | Role |
|---|---|---|
| `src/utils/profileKeyOptions.ts` | Utility | Derives profile keys from `LoggedInUser`; builds profile data for autofill |
| `src/types/template.ts` | Type | `FormFieldDefinition.profileKey` field definition |
| `src/types/auth.ts` | Type | `LoggedInUser` — source of all autofillable data |
| `src/components/template/ProfileFieldMappingDialog.tsx` | Component | Template-time UI to map form fields → profile keys |
| `src/components/template/UploadTemplateDialog.tsx` | Component | Triggers mapping dialog on template save; persists `profileKey` to DB |
| `src/components/template/EditTemplateDialog.tsx` | Component | Same as UploadTemplateDialog for the edit flow |
| `src/components/viewer/PDFViewerContainer.tsx` | Component | Core `autofillFields()` engine; applies profile keys to PDF widgets |
| `src/components/contracts/AutofillPartyDialog.tsx` | Component | Party picker shown when multiple parties have mapped fields |
| `src/components/contracts/CreateContractDialog.tsx` | Component | Autofill entry point during contract creation (contractor) |
| `src/components/contracts/RenewContractDialog.tsx` | Component | Autofill entry point during contract renewal (same pattern as Create) |
| `src/components/viewer/DocumentViewerDialog.tsx` | Component | Autofill entry point during signing / editing (contractor + internal signers) |
| `translations/en.json` | i18n | English strings for `autofill.*` and `profileMapping.*` keys |
| `translations/hi.json` | i18n | Hindi translations for the same keys |

---

## 5. Phase 1 — Template Setup: Field Mapping

This phase is completed **once** by the template creator. The mappings are stored on the template and carried forward to every contract created from it.

### 5.1 Entry Point — `UploadTemplateDialog` / `EditTemplateDialog`

When the template creator clicks the final **Upload Template** / **Save Template** button:

1. The dialog checks whether there are any mappable (non-signature) text fields.
2. If none exist → save the template immediately with no prompt.
3. If mappable fields exist → a small confirmation prompt appears:

```
┌──────────────────────────────────────────┐
│  Map Fields to Profile Data?         [×] │
├──────────────────────────────────────────┤
│  Would you like to map form fields to    │
│  profile keys so contractors and signers │
│  can autofill their information?         │
│                                          │
│                    [Skip] [Configure ──] │
└──────────────────────────────────────────┘
```

- **Skip** → saves template with `profileKey: null` on all fields.
- **Configure Mapping** → opens `ProfileFieldMappingDialog`.

**Merging profileKeys on save** (`UploadTemplateDialog.tsx`):
```typescript
exportedFormFields = exportedFormFields.map((ef) => {
    const stateField = formFields.find((sf) => sf.name === ef.name);
    return stateField?.profileKey != null
        ? { ...ef, profileKey: stateField.profileKey }
        : ef;
});
```

### 5.2 `ProfileFieldMappingDialog`

**File:** `src/components/template/ProfileFieldMappingDialog.tsx`

**Props:**
```typescript
interface ProfileFieldMappingDialogProps {
    open: boolean;
    onClose: () => void;
    onSave: (updatedFields: FormFieldDefinition[]) => void;
    formFields: FormFieldDefinition[];
    parties: PartyConfiguration[];
    profileKeyOptions: ProfileKeyOption[];  // passed by parent — dialog is purely presentational
}
```

**Internal state:**
```typescript
// fieldName → profileKey ('', or 'name', 'email', etc.)
const [mappings, setMappings] = useState<Record<string, string>>(() =>
    Object.fromEntries(formFields.map(f => [f.name, f.profileKey || '']))
);
```

Pre-populated from existing `formFields[].profileKey` when re-editing a template.

**Layout:**

Fields are grouped by party. Each group shows a section header with the party's color:

```
── Party 1 — Buyer ──────────────────────────────────────────
  buyer_full_name      ● Buyer    [ Full Name         ▼ ]
  buyer_company        ● Buyer    [ Organization      ▼ ]
── Party 2 — Seller ─────────────────────────────────────────
  seller_name          ● Seller   [ Full Name         ▼ ]
  notes_box            ● Seller   [ — None —          ▼ ]
── Unassigned ───────────────────────────────────────────────
  misc_field                      [ — None —          ▼ ]
```

The **Profile Key dropdown** options come directly from `profileKeyOptions` prop — not hardcoded:
```typescript
<MenuItem value="">— None —</MenuItem>
{profileKeyOptions.map(opt => (
    <MenuItem key={opt.value} value={opt.value}>{opt.label}</MenuItem>
))}
```

**On Save:**
```typescript
const updatedFields = formFields.map(f => ({
    ...f,
    profileKey: mappings[f.name] || null,
}));
onSave(updatedFields);
```

---

## 6. Phase 2 — Contract Creation: Autofill Execution

### 6.1 Entry Points

Autofill during contract creation/renewal is available in:
- `src/components/contracts/CreateContractDialog.tsx`
- `src/components/contracts/RenewContractDialog.tsx`

Both follow the same pattern.

### 6.2 Handler Flow — `handleAutofillClick`

```typescript
const handleAutofillClick = () => {
    const parties = selectedTemplate?.parties || [];
    const formFields = selectedTemplate?.formFields || [];

    // Count only fields that HAVE a profileKey mapping (not all text fields)
    const getMappedFieldCount = (partyId: string) =>
        formFields.filter(
            (f) => f.assignedParty === partyId &&
                   f.type !== 'Sig' &&
                   f.type !== 'signature' &&
                   !!f.profileKey
        ).length;

    const partiesWithMappedFields = parties.filter((p) => getMappedFieldCount(p.id) > 0);

    if (partiesWithMappedFields.length === 0) {
        // No mappings configured on this template
        showWarningToast('No autofill mappings found. Edit the template to configure autofill.');
        return;
    }

    if (partiesWithMappedFields.length === 1) {
        // Single party — skip picker, fill directly
        handleAutofillConfirm(partiesWithMappedFields[0].id);
        return;
    }

    // Multiple parties — show party picker
    setAutofillPartyDialogOpen(true);
};
```

### 6.3 Handler Flow — `handleAutofillConfirm`

```typescript
const handleAutofillConfirm = (partyId: string) => {
    const currentUser = authService.getCurrentUser();
    const profileData = buildProfileData(currentUser);  // Record<string, string>

    if (Object.values(profileData).every(v => !v.trim())) {
        showWarningToast('Please complete your profile in Settings first');
        return;
    }

    const count = pdfViewerRef.current?.autofillFields(partyId, profileData) ?? 0;

    if (count === 0) {
        showInfoToast('No matching fields found for your profile data');
    } else {
        showSuccessToast(`${count} field(s) filled from your profile`);
    }
};
```

### 6.4 Autofill Button Visibility

The button is shown/hidden based on:

| Condition | Button State |
|---|---|
| Document still loading | Disabled |
| No form fields in document | Hidden |
| `readOnly === true` | Hidden |
| Contract is `finalized` or `all_completed` | Hidden |
| Save in progress | Disabled |

---

## 7. Phase 3 — Contract Signing: Autofill Execution

### 7.1 Entry Point

`src/components/viewer/DocumentViewerDialog.tsx`

This dialog is used by both **contractors** (filling their party's fields during the workflow) and **internal signers** (filling their assigned party's fields before signing).

### 7.2 Three-Tier Decision Logic — `handleAutofill`

```
handleAutofill()
│
├─ Is user logged in? → No → show "Please log in" warning
│
├─ Is profile data completely empty? → Yes → show "Complete your profile" warning
│
├─ Is `assignedPartyId` set? (Internal signer)
│     → Yes → runAutofill(assignedPartyId)   [no party selection needed]
│
├─ Are there contractor parties available?
│     → No → runAutofill(null)   [fill all matched fields regardless of party]
│
├─ Has contractor already committed to a party?
│     → Yes → runAutofill(contractorCommittedPartyId)
│
├─ Only 1 contractor party available?
│     → Yes → commit to it → runAutofill(party.id)
│
└─ Multiple contractor parties, none selected yet
      → setShowAutofillPartyPicker(true)
```

### 7.3 Party Commitment for Contractors

When a contractor fills any field manually, they are implicitly **committed** to that field's party (`contractorCommittedPartyId`). All subsequent autofill operations use that committed party. This prevents one contractor from accidentally filling fields belonging to the opposing party.

### 7.4 After Party Selection — `handleAutofillPartySelected`

```typescript
const handleAutofillPartySelected = (partyId: string) => {
    setShowAutofillPartyPicker(false);
    contractorCommittedPartyIdRef.current = partyId;
    setContractorCommittedPartyId(partyId);
    runAutofill(partyId);
};
```

---

## 8. Core Engine: `autofillFields()`

**File:** `src/components/viewer/PDFViewerContainer.tsx`

**Signature:**
```typescript
autofillFields: (partyId: string | null, profileData: Record<string, string>) => number;
```

**Parameters:**

| Parameter | Type | Description |
|---|---|---|
| `partyId` | `string \| null` | Party to restrict fill to. `null` fills all matched fields regardless of party. |
| `profileData` | `Record<string, string>` | Flat map of profile key → value (from `buildProfileData()`). |

**Returns:** Number of fields actually filled.

### 8.1 Algorithm

```
For each field in PDF (via fieldManager.getFields()):

  SKIP IF any of:
  ─ field.type === 'Sig' or widget instanceof SignatureWidgetAnnotation
  ─ field.flags.ReadOnly === true
  ─ field already has a non-empty value          [never overwrite]
  ─ partyId is set AND field's assignedParty ≠ partyId
  ─ field has no profileKey (null / '' / undefined)

  RESOLVE profileKey:
  ─ Look in formFieldsRef.current (React state, most up-to-date)
  ─ Fallback: widget.getCustomData('profileKey')

  RESOLVE value:
  ─ value = profileData[profileKey]?.trim()
  ─ SKIP IF value is empty or undefined

  FILL:
  ─ field.setValue(value)
  ─ capturedFieldValuesRef.current.set(fieldName, value)    [persistence]
  ─ redraw widget annotation                                 [visual update]
  ─ onFieldChangeRef.current(fieldName, value)              [sync React state]
  ─ filledCount++

Return filledCount
```

### 8.2 How `profileKey` Reaches the Engine

There are two paths:

**Path 1 — `formFieldsRef`** (primary): When a contract is opened, `PDFViewerContainer` receives `formFields` as a prop and stores them in `formFieldsRef`. The `profileKey` from the template is already on each field object.

**Path 2 — Widget custom data** (fallback): During field rendering, each widget is stamped with its profileKey:
```typescript
widget.setCustomData('profileKey', field.profileKey || '');
```
This ensures `autofillFields()` can read the mapping even if `formFieldsRef` is stale.

---

## 9. Party Selection Logic

### `AutofillPartyDialog`

**File:** `src/components/contracts/AutofillPartyDialog.tsx`

**Props:**
```typescript
interface AutofillPartyDialogProps {
    open: boolean;
    onClose: () => void;
    onConfirm: (partyId: string) => void;
    parties: PartyConfiguration[];
    formFields: FormFieldDefinition[];
}
```

**Filtering logic — only parties with mappable fields are shown:**
```typescript
const getMappedFieldCount = (partyId: string) =>
    formFields.filter(
        (f) => f.assignedParty === partyId &&
               f.type !== 'Sig' &&
               f.type !== 'signature' &&
               !!f.profileKey
    ).length;

const partiesWithFields = parties.filter(p => getMappedFieldCount(p.id) > 0);
```

Each party entry in the dialog shows:
- Party color indicator
- Party label (e.g. "Buyer", "Seller")
- A chip with the count of mapped fields (e.g. "3 fields")

The **Autofill** button inside the dialog is disabled until the user selects a party.

---

## 10. Profile Data Pipeline

### `src/utils/profileKeyOptions.ts`

This file is the single source of truth for which profile keys are available and how they are labeled.

### 10.1 `getProfileKeyOptions(user: LoggedInUser): ProfileKeyOption[]`

Derives the list of mappable profile keys from a `LoggedInUser` object at runtime.

```typescript
const PROFILE_SYSTEM_KEYS = new Set(['id', 'lastLogin', 'isAdmin', 'password']);

const PROFILE_KEY_LABELS: Record<string, string> = {
    name:             'Full Name',
    email:            'Email',
    department:       'Department',
    organization:     'Organization',
    dateOfBirth:      'Date of Birth',
    gender:           'Gender',
    permanentAddress: 'Permanent Address',
    panCard:          'PAN Card Number',
    aadharCard:       'Aadhar Card Number',
};
```

Any key NOT in `PROFILE_KEY_LABELS` gets auto-formatted via `formatKey()`:
- `phoneNumber` → `"Phone Number"`
- `job_title` → `"Job Title"`

This means adding a new field to `LoggedInUser` automatically makes it available in the mapping dropdown — no dialog changes needed.

### 10.2 `buildProfileData(user: LoggedInUser): Record<string, string>`

Builds the flat data object used by `autofillFields()`:

```typescript
// Example output:
{
    name:             'Pushpam Priya',
    email:            'pushpam@appolosys.com',
    department:       'Engineering',
    organization:     'Appolo Systems',
    dateOfBirth:      '1995-04-12',
    gender:           'Female',
    permanentAddress: '42 MG Road, Bangalore',
    panCard:          'ABCDE1234F',
    aadharCard:       '234958493827',
}
```

- System keys (`id`, `lastLogin`, `isAdmin`) are excluded.
- All values are converted to strings and trimmed.
- Undefined/null profile fields become empty strings (callers skip empty values).

---

## 11. Feedback & Error States

All user-facing feedback is shown via `NotificationSnackbar`.

### 11.1 Autofill Result Messages

| Situation | Severity | Message |
|---|---|---|
| Fields filled successfully | `success` | _"{n} field(s) filled from your profile"_ |
| Fields filled but profile incomplete | `success` | _"{n} field(s) filled. Complete your profile for more matches."_ |
| All mapped fields already had values | `info` | _"All mapped fields are already filled"_ |
| No profileKey mappings on any field | `warning` | _"No autofill mappings found. Edit the template to configure autofill."_ |
| Profile is completely empty | `warning` | _"Please complete your profile in Settings first"_ |
| User is not logged in | `warning` | _"Please log in to use autofill"_ |
| Apryse/PDF engine throws | `error` | _"Something went wrong during autofill. Please try manually."_ |

### 11.2 Button States

| Condition | State |
|---|---|
| PDF still loading | Disabled |
| Save / upload in progress | Disabled |
| `readOnly === true` | Hidden |
| Contract `finalized` or `all_completed` | Hidden |
| No `assignedPartyId` and not a contractor | Hidden |
| Ready | Enabled |

---

## 12. Edge Cases

| Case | Behaviour |
|---|---|
| Two fields both mapped to `name` (e.g. F1→name, F2→name) | Both filled — this is the primary purpose of explicit mapping over keyword matching |
| Field already has a value | Skipped — autofill is non-destructive |
| Autofill called twice | Second call silently skips all already-filled fields |
| Profile field value is empty/whitespace | That specific field is skipped; other fields with non-empty values still fill |
| `profileKey` references a key not in `profileData` | `profileData[key]` returns `undefined` → field skipped silently |
| Contract renewed — does `profileKey` carry over? | Yes — `formFields[]` is copied to the renewal contract including `profileKey` |
| Template has no parties | `ProfileFieldMappingDialog` shows fields in a flat list; `autofillFields(null, ...)` fills all matched fields without party filtering |
| Internal signer's assigned party has no mapped fields | Button still shows; on click, `autofillFields()` returns 0 → "No matching fields" toast |
| Template saved with `profileKey: 'phone'` before `phone` field is added to `LoggedInUser` | `buildProfileData()` won't include `phone` → `profileData['phone']` is undefined → field skipped silently. No error. |
| `org_name` field — old keyword approach ambiguity | No longer relevant; mapping is explicit. `org_name` maps to exactly the key the template author chose. |
| Field type is `Sig` / signature | Unconditionally skipped — signature fields can never be autofilled |
| `pdfViewerRef` is null when button clicked | Button's `disabled` condition prevents the click from reaching `autofillFields` |
| `field.setValue()` throws inside loop | `console.warn`, skip that field, continue loop — does not abort other fields |

---

## 13. Extending the Feature

### Adding a New Profile Field

To add a new autofillable field (e.g. `phoneNumber`):

**Step 1 — Add to `LoggedInUser`** (`src/types/auth.ts`):
```typescript
phoneNumber?: string;
```

**Step 2 — Add label** (`src/utils/profileKeyOptions.ts`):
```typescript
const PROFILE_KEY_LABELS: Record<string, string> = {
    // existing keys...
    phoneNumber: 'Phone Number',   // ← add this line
};
```
> This step is optional. If omitted, `formatKey('phoneNumber')` auto-produces `"Phone Number"`.

**Step 3 — Add to Profile Settings UI** (`src/components/layout/ProfileSettingsDialog.tsx`):  
Add the input field and wire it to the save/load flow.

**Step 4 — Add to API** (`src/app/api/users/profile/route.ts`):  
Include in the `$set` projection (GET and PATCH).

**That's it.** The new field automatically appears in the `ProfileFieldMappingDialog` dropdown. No changes to `autofillFields()`, `AutofillPartyDialog`, or any contract component.

### Adding Autofill to a New Form/Dialog

To add autofill support to a new dialog (e.g. a bulk contract creation wizard):

1. Accept `formFields: FormFieldDefinition[]` and a `PDFViewerContainer` ref.
2. Copy the `handleAutofillClick` / `handleAutofillConfirm` pattern from `CreateContractDialog`.
3. Use `buildProfileData(authService.getCurrentUser())` to get profile data.
4. Call `pdfViewerRef.current?.autofillFields(partyId, profileData)`.
5. Show a `NotificationSnackbar` with the returned count.

---

## 14. Full Data Flow Diagram

```
┌─────────────────────────────────────────────────────────────┐
│                    TEMPLATE CREATION                        │
│                                                             │
│  UploadTemplateDialog / EditTemplateDialog                  │
│       │                                                     │
│       │  User clicks "Upload Template"                      │
│       ▼                                                     │
│  Has mappable text fields?                                  │
│       ├── No  → Save immediately (profileKey: null)         │
│       └── Yes → Show confirmation prompt                    │
│                      │                                      │
│                      ├── Skip → Save (profileKey: null)     │
│                      └── Configure Mapping                  │
│                              │                              │
│                              ▼                              │
│               ProfileFieldMappingDialog                     │
│               (receives profileKeyOptions                   │
│               from getProfileKeyOptions(currentUser))       │
│               │                                             │
│               │  F1 → name, F2 → org, F3 → none            │
│               ▼                                             │
│          onSave(updatedFields) called                       │
│          formFields[].profileKey saved to MongoDB           │
└─────────────────────────────────────────────────────────────┘
                    │
                    │  Contract created from template
                    │  profileKey carried forward to
                    │  contract.formFields[]
                    ▼
┌─────────────────────────────────────────────────────────────┐
│                    USER OPENS CONTRACT                      │
│                                                             │
│  CreateContractDialog    RenewContractDialog                │
│  DocumentViewerDialog                                       │
│       │                                                     │
│       │  User clicks "Autofill" button                      │
│       ▼                                                     │
│                                                             │
│  ┌─────────────── handleAutofill() ─────────────────┐       │
│  │                                                   │       │
│  │  Is user logged in? ──── No ──► show warning      │       │
│  │         │                                         │       │
│  │  Is profile empty? ──── Yes ──► show warning      │       │
│  │         │                                         │       │
│  │  assignedPartyId set?  (Internal Signer)          │       │
│  │  ──── Yes ──────────────────► runAutofill(id)     │       │
│  │         │                                         │       │
│  │  No contractor parties?                           │       │
│  │  ──── Yes ──────────────────► runAutofill(null)   │       │
│  │         │                                         │       │
│  │  Already committed to a party?                    │       │
│  │  ──── Yes ──────────────────► runAutofill(id)     │       │
│  │         │                                         │       │
│  │  Only 1 contractor party?                         │       │
│  │  ──── Yes ──► commit ──────► runAutofill(id)      │       │
│  │         │                                         │       │
│  │  Multiple parties → AutofillPartyDialog           │       │
│  │         │           (shows only parties with      │       │
│  │         │            mapped fields)               │       │
│  │         │                                         │       │
│  │  User picks party ─────────► runAutofill(id)      │       │
│  └─────────────── runAutofill(partyId) ───────────────┘       │
│                      │                                      │
│                      ▼                                      │
│          buildProfileData(currentUser)                      │
│          → { name: '...', email: '...', dept: '...' }       │
│                      │                                      │
│                      ▼                                      │
│          pdfViewerRef.autofillFields(partyId, profileData)  │
│                      │                                      │
│          For each PDF field:                                │
│          ─ Skip: Sig, readOnly, already filled,             │
│                  wrong party, no profileKey                  │
│          ─ Fill: field.setValue(profileData[profileKey])    │
│          ─ Sync: onFieldChange → React state                │
│          Returns: filledCount                               │
│                      │                                      │
│                      ▼                                      │
│          NotificationSnackbar                               │
│          "{n} field(s) filled from your profile"            │
└─────────────────────────────────────────────────────────────┘
```
