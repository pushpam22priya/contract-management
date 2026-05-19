# Auto-Fill on Document Load Architecture

**System:** Contract Management System  
**Module:** PDF Form Field Auto-Fill  
**Scope:** CreateContractDialog · RenewContractDialog · DocumentViewerDialog

---

## 1. Overview

The auto-fill system automatically populates PDF form fields with the currently logged-in user's profile data when a document editor opens. Fields are populated without any user interaction immediately after the document loads (`onDocumentLoaded` event). This occurs only where a **profile key mapping** has been pre-configured on the template, and only into **empty, non-read-only text fields** that belong to the correct party.

---

## 2. Prerequisites

Two conditions must be met before auto-fill can produce results:

### 2.1 Template Field Mapping
Each text field in the PDF template must have a `profileKey` value saved in its `FormFieldDefinition`. This mapping is set by the template author. Unmapped fields (no `profileKey`) are skipped unconditionally.

Available profile keys and their labels are defined in `src/utils/profileKeyOptions.ts`:

```
name            → Full Name
email           → Email
department      → Department
organization    → Organization
dateOfBirth     → Date of Birth
gender          → Gender
permanentAddress → Permanent Address
panCard         → PAN Card Number
aadharCard      → Aadhar Card Number
```

### 2.2 User Profile Data
The logged-in user must have filled in their profile in **Profile Settings**. Profile data is read from `sessionStorage` via `authService.getCurrentUser()` and converted to a flat `Record<string, string>` by `buildProfileData()`.

```typescript
// src/utils/profileKeyOptions.ts
export function buildProfileData(user: LoggedInUser): Record<string, string> {
    const options = getProfileKeyOptions(user);
    const data: Record<string, string> = {};
    options.forEach(opt => {
        const raw = (user as unknown as Record<string, unknown>)[opt.value];
        data[opt.value] = raw != null ? String(raw).trim() : '';
    });
    return data;
}
```

All profile fields are included in the login API response (`/api/users` POST) so auto-fill works on first login without requiring the user to re-save their profile.

---

## 3. Auto-Fill on Document Load Execution

### 3.1 One-Shot Guard

Each editor component declares a ref that prevents auto-fill from running more than once per dialog session:

```typescript
const hasAutoFilledRef = useRef(false);
```

The ref is reset to `false` whenever the dialog resets (close, or `open` state change to `false`), so every new editor session triggers auto-fill exactly once upon document load.

### 3.2 `onDocumentLoaded` Callback

The `PDFViewerContainer` fires `onDocumentLoaded` after the PDF and all form fields are ready. Each editor hooks into this event to trigger the filling process without clicking any button:

**CreateContractDialog** and **RenewContractDialog:**

```typescript
onDocumentLoaded={() => {
    setDocumentLoaded(true);
    if (!hasAutoFilledRef.current) {
        hasAutoFilledRef.current = true;
        handleAutofillClick(true);   // silent = true triggers auto-fill without manual clicks
    }
}}
```

**DocumentViewerDialog:**

```typescript
onDocumentLoaded={(!readOnly && (assignedPartyId || currentUserRole === 'contractor')) ? () => {
    if (assignedPartyId) {
        setTimeout(() => {
            pdfViewerRef.current?.navigateToFirstPartyField([assignedPartyId]);
        }, 500);
    }
    if (!hasAutoFilledRef.current) {
        hasAutoFilledRef.current = true;
        handleAutofill(true);        // silent = true triggers auto-fill without manual clicks
    }
} : undefined}
```

In `DocumentViewerDialog`, auto-fill on load is only activated when:
- `readOnly` is `false` (editor is in editable mode), **and**
- the viewer is opened by an internal signer (`assignedPartyId` is set) **or** a contractor (`currentUserRole === 'contractor'`).

Read-only viewers (reviewers, approvers, observers) never trigger auto-fill on load.

### 3.3 Silent Mode Execution

The auto-fill functions are invoked with a `silent = true` flag during the document load event:
- The **"No fillable fields found"** snackbar is suppressed.
- The **"Please log in"** and **"Please complete your profile"** snackbars are suppressed.

This design ensures the auto-load path is invisible to the user unless it actually fills at least one field, in which case the success snackbar is always shown.

---

## 4. Core Engine — `autofillFields`

The low-level auto-fill logic lives entirely in `PDFViewerContainer` and is exposed through the imperative handle:

```typescript
// src/components/viewer/PDFViewerContainer.tsx
autofillFields: (partyId: string | null, profileData: Record<string, string>): number
```

### 4.1 Field Filtering Rules

For each PDF form field the engine applies these guards in order. A field is skipped if **any** guard triggers:
1. **Signature field** — `field.type === 'Sig'` or `SignatureWidgetAnnotation` instance.
2. **Read-only** — `field.flags.ReadOnly` or `field.isReadOnly()`.
3. **Already filled** — `field.getValue()` returns a non-empty string.
4. **Wrong party** — when `partyId !== null`, the field's `assignedParty` must match `partyId` exactly.
5. **No profile key** — `fieldDef.profileKey` is absent.
6. **No matching profile value** — `profileData[profileKey]` is empty or whitespace.

### 4.2 Fill Sequence and Post-Fill Navigation

For each field that passes all guards:
1. `field.setValue(matchedValue)` — writes the value into the PDF field.
2. `capturedFieldValuesRef.current.set(fieldName, matchedValue)` — persists the value.
3. `annotationManager.redrawAnnotation(widget)` — forces a visual repaint.
4. `onFieldChangeRef.current(fieldName, matchedValue)` — notifies the parent component.
5. The first filled widget is tracked for scroll navigation.

After all fields are processed, if at least one field was filled during the automatic document load, the viewer smoothly scrolls and flashes a highlight on the first filled field to draw the user's attention.

---

## 5. Party Resolution During Auto-Load

Before fields are automatically filled, the correct `partyId` must be resolved.

- **CreateContractDialog & RenewContractDialog:** The contractor automatically fills their mapped fields. If exactly 1 contractor party with fields exists, it is selected automatically and auto-fill proceeds. (If multiple exist without commitment, it will present the `AutofillPartyDialog` before filling).
- **DocumentViewerDialog:** For internal signers, the `assignedPartyId` is already known and filled automatically through `runAutofill(assignedPartyId)`.

---

## 6. Data Flow Diagram (Auto-Load)

```
User opens editor
       │
       ▼
PDFViewerContainer loads document
       │
       ▼
onDocumentLoaded fires
       │
       ├── setDocumentLoaded(true)
       │
       └── hasAutoFilledRef.current === false?
                 │ YES
                 ▼
           hasAutoFilledRef.current = true
                 │
                 ▼
         Auto-trigger with silent=true
                 │
                 ▼
         Party resolution
                 │
                 ▼
         buildProfileData(currentUser)
                 │
                 ▼
         pdfViewerRef.autofillFields(partyId, profileData)
                 │
            for each field:
            ├─ skip unmapped/filled/read-only fields
            └─ setValue → redraw → onFieldChange → track first widget
                 │
                 ▼
         Scroll to first filled field
                 │
                 ▼
         Snackbar: "N fields filled from your profile"
```

---

## 7. Error Handling (Silent Mode)

Since this runs on document load without user interaction, errors are handled gracefully:

| Scenario | Behaviour in Auto-Load (`silent=true`) |
|---|---|
| User not logged in | **Suppressed** |
| Profile is entirely empty | **Suppressed** |
| No mappable fields in document | **Suppressed** |
| Fields found but none match profile | Warning snackbar shown |
| `autofillFields` throws | Error snackbar shown |
