# PDFTron Viewer — UX Feature Documentation

**Version:** 1.0
**Date:** 2026-05-11
**Status:** Implemented
**File:** `src/components/viewer/PDFViewerContainer.tsx`

---

## Table of Contents

1. [Autofill Scroll-to-Field](#1-autofill-scroll-to-field)
2. [Signature Dialog Default Name](#2-signature-dialog-default-name)

---

## 1. Autofill Scroll-to-Field

### 1.1 Overview

When the autofill operation completes, the viewer automatically navigates to and highlights the first field that was filled. This gives the user immediate visual confirmation of where in the document the autofill took effect, particularly useful in long multi-page documents.

### 1.2 Where It Runs

This logic runs at the end of the `autofillFields` method, which is exposed on the `PDFViewerHandle` ref.

```
PDFViewerHandle.autofillFields(partyId, profileData) → number
```

The method fills all matching fields synchronously, then fires the scroll navigation asynchronously (fire-and-forget IIFE) so the return value (filled field count) is available immediately to the caller.

### 1.3 How the Target Field Is Identified

During the field-filling loop, the first widget to be filled is tracked as `firstFilledWidget`. For each subsequent filled widget, the position is compared:

```
Page number ascending → then Y coordinate ascending (within the same page)
```

```typescript
if (!firstFilledWidget) {
    firstFilledWidget = widgets[0];
} else {
    if (
        widgets[0].PageNumber < firstFilledWidget.PageNumber ||
        (widgets[0].PageNumber === firstFilledWidget.PageNumber &&
         widgets[0].Y < firstFilledWidget.Y)
    ) {
        firstFilledWidget = widgets[0];
    }
}
```

**Result:** `firstFilledWidget` holds the widget on the earliest page with the smallest Y value among all filled widgets.

### 1.4 Navigation Sequence

Once all fields are filled, if at least one was successfully filled:

| Step | Action | Timing |
|---|---|---|
| 1 | Set `scrollBehavior = 'smooth'` on the scroll container | Immediate |
| 2 | Deselect all annotations | Immediate |
| 3 | If viewer is not on the target page → `setCurrentPage(target.PageNumber)` | Immediate |
| 4 | Wait for page render | 250 ms delay |
| 5 | Select the target annotation | Immediate |
| 6 | Short settle delay | 50 ms delay |
| 7 | `jumpToAnnotation(firstFilledWidget)` — scrolls viewport to the field | Immediate |
| 8 | `flashHighlight(Core, firstFilledWidget)` — brief highlight pulse | Immediate |
| 9 | Reset `scrollBehavior = 'auto'` | 600 ms after step 7 |

The page-change step (step 3–4) is skipped entirely if the target field is already on the current page, saving 250 ms.

### 1.5 Flash Highlight

`flashHighlight` is imported from `PDFNavigationButton`:

```typescript
import PDFNavigationButton, { getFormFieldAnnotations, flashHighlight }
    from './pdfViewer/PDFNavigationButton';
```

It applies a brief visual pulse to the annotation so the user's eye is drawn to the exact field, even after the scroll has settled.

### 1.6 Error Handling

The entire navigation block is wrapped in a `try/catch`. Any failure in page navigation or `jumpToAnnotation` is caught and logged as a warning — it does not affect the filled count returned to the caller or any other viewer state.

```
⚠️ [AUTOFILL] Failed to navigate to first filled field: <error>
```

### 1.7 Conditions for Scroll to Fire

Scroll only fires when **both** of the following are true:
- `firstFilledWidget` is not null (at least one widget was successfully filled)
- `filledCount > 0`

If autofill finds no matching fields, no navigation is attempted.

### 1.8 Data Flow

```
autofillFields(partyId, profileData) called
        │
        ├─ Loop over all form fields
        │       │
        │       ├─ Skip: signature, read-only, already-filled, wrong party, no profileKey
        │       │
        │       └─ Match found → field.setValue(matchedValue)
        │                        annotationManager.redrawAnnotation(widget)
        │                        track firstFilledWidget (page/Y comparison)
        │                        onFieldChange callback
        │                        filledCount++
        │
        ├─ return filledCount  ← synchronous, immediate
        │
        └─ (async IIFE fires independently)
                │
                ├─ scrollBehavior = 'smooth'
                ├─ deselectAllAnnotations()
                ├─ [if wrong page] setCurrentPage → wait 250ms
                ├─ selectAnnotation → wait 50ms
                ├─ jumpToAnnotation
                ├─ flashHighlight
                └─ [after 600ms] scrollBehavior = 'auto'
```

---

## 2. Signature Dialog Default Name

### 2.1 Overview

When a user opens the Create Signature dialog in the PDFTron viewer, the **Type** tab is pre-populated with a display name. The name is resolved through a priority chain: saved profile name first, then email-derived fallback.

### 2.2 Where It Runs

This logic executes inside the `signatureModal` event handler, which fires every time the signature dialog opens. It runs after the dialog tab is set to "Type":

```typescript
UI.setSelectedTab('signatureModal', 'textSignaturePanelButton');
// ↑ Type tab selected, then name is set below
Core.annotationManager.setCurrentUser(signatureName);
```

`setCurrentUser` sets the default text shown in the "Type your signature" input of the Apryse signature dialog.

### 2.3 Name Resolution Priority

The logic follows a three-tier priority:

```
Priority 1 — Saved profile name (sessionStorage)
Priority 2 — Email local part (sessionStorage email or prop)
Priority 3 — currentUserEmail prop local part (external signer fallback)
```

**Detailed flow:**

```typescript
const raw = sessionStorage.getItem('cms_current_user');
const parsedUser = raw ? JSON.parse(raw) : null;

if (parsedUser?.name) {
    // Priority 1: user has a saved name in their profile
    signatureName = parsedUser.name;
} else {
    // Priority 2: derive from email
    const emailForSignature = currentUserEmail || parsedUser?.email;
    if (emailForSignature) {
        signatureName = emailForSignature.split('@')[0];
    }
}
```

If `sessionStorage` is unavailable or throws (e.g. in a sandboxed iframe):

```typescript
catch {
    // Priority 3: use the currentUserEmail prop directly
    if (currentUserEmail) {
        signatureName = currentUserEmail.split('@')[0];
    }
}
```

### 2.4 User Types and Their Paths

| User Type | Session Available | Has Saved Name | Resolved Name |
|---|---|---|---|
| Internal user, name saved in profile | Yes | Yes | Full name from `parsedUser.name` |
| Internal user, no name set | Yes | No | Local part of `parsedUser.email` |
| External signer (signing page) | No | No | Local part of `currentUserEmail` prop |
| Sandboxed context (sessionStorage throws) | — | — | Local part of `currentUserEmail` prop |

### 2.5 The `currentUserEmail` Prop

```typescript
currentUserEmail?: string;
// Pre-populate typed signature with this email (for external signers who have no session)
```

This prop is passed to `PDFViewerContainer` specifically to support external signers who arrive via the `/sign/[token]` page and have no session in `sessionStorage`. Without this prop, external signers would see an empty signature input.

### 2.6 Effect on the Viewer

`Core.annotationManager.setCurrentUser(signatureName)` sets the display name for the current annotation session. In the Apryse WebViewer v11 signature dialog, this value is pre-filled in the "Type" tab's text input, so the user sees their name already typed and can sign immediately without extra input.

### 2.7 Name Resolution Flow Diagram

```
Signature dialog opens
        │
        ▼
UI.setSelectedTab → 'Type' tab active
        │
        ▼
Read sessionStorage('cms_current_user')
        │
        ├─ Parse success
        │       │
        │       ├─ parsedUser.name exists?
        │       │       └─ YES → signatureName = parsedUser.name   [Profile name]
        │       │
        │       └─ NO → emailForSignature = currentUserEmail ?? parsedUser.email
        │                       └─ signatureName = email.split('@')[0]   [Email local part]
        │
        └─ Parse throws (sessionStorage unavailable)
                └─ currentUserEmail exists?
                        └─ YES → signatureName = currentUserEmail.split('@')[0]   [Prop fallback]
        │
        ▼
Core.annotationManager.setCurrentUser(signatureName)
        │
        ▼
Signature dialog "Type" tab shows pre-filled name
```

---

## Feature Interaction

These two features are independent — autofill scroll fires after form fields are filled, while the signature dialog name fires when the signature modal opens. They do not share state or interfere with each other. Both are contained within `PDFViewerContainer.tsx` and use the same `sessionStorage` key (`cms_current_user`) to read user data.
