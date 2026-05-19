# Party Selection Dialog — Back-Navigation Fix

**Date:** 2026-05-15  
**Affected files:**
- `src/components/contracts/CreateContractDialog.tsx`
- `src/components/contracts/RenewContractDialog.tsx`

---

## Problem

Two bugs manifested when a user navigated back from Step 2 (Edit Document) to Step 1 (Contract Details) and then returned to Step 2 again, in both the Create Contract and Renew Contract flows.

### Bug 1 — Party selection dialog did not reappear

**Steps to reproduce:**
1. Open Create Contract or Renew Contract dialog.
2. Proceed to Step 2. The party selection dialog ("Select Your Party") appears on document load.
3. Select a party (e.g. P2) and click **Autofill**. Fields are filled.
4. Click **Back to Details** — return to Step 1.
5. Click **Next: Edit Document** — return to Step 2. PDF reloads.
6. **Expected:** Party selection dialog appears again.  
   **Actual:** Dialog does not appear. No party is selected. Fields remain empty and unlocked.

### Bug 2 — "Single Party Restriction" warning on fresh party selection

**Steps to reproduce (continuation of Bug 1 after fix):**
1. After the party dialog reappears on re-entry to Step 2, select a **different** party (e.g. P1 instead of the original P2).
2. **Expected:** P1's fields are autofilled cleanly.  
   **Actual:** "Single Party Restriction" warning appears — *"You have already started filling P2 fields. You can only fill one party's fields."* — even though the user has not manually filled anything.

---

## Root Cause

### Bug 1 — `hasAutoFilledRef` not reset on back-navigation

`hasAutoFilledRef` is a `useRef` that persists for the entire lifetime of the mounted dialog component. Its purpose is to ensure the party dialog fires only once per Step 2 entry. The sequence:

```
Step 2 (first entry)
  onDocumentLoaded fires
  hasAutoFilledRef.current === false  →  show party dialog
  User selects party  →  hasAutoFilledRef.current = true

Back to Step 1
  (hasAutoFilledRef is NOT reset here)

Step 2 (second entry)
  onDocumentLoaded fires
  hasAutoFilledRef.current === true   →  skip party dialog  ← BUG
```

The ref was only reset in the full dialog-close handler (line 455 / 561), not on step navigation.

### Bug 2 — `filledFieldValues` not cleared on back-navigation

`filledFieldValues` is a `useState` object that accumulates every field value entered in Step 2. It also persists across step navigation because only the PDF viewer unmounts — the parent dialog stays mounted.

When the user returns to Step 2 and selects a new party (P1), `partyValidationWarning` — a `useMemo` that scans `filledFieldValues` — detects that P2's fields are still populated from the first visit. It then raises the "Single Party Restriction" warning before the user has touched anything.

Additionally, `validationTriggered`, `showWrongPartyWarning`, and `documentLoaded` were left in their Step 2 states, causing stale UI (disabled buttons, lingering warning overlay) on re-entry.

---

## Fix

Both `CreateContractDialog` and `RenewContractDialog` had their "Back to Details" `onClick` handler updated to perform a full Step 2 state reset before navigating to Step 1.

### Before

```tsx
// CreateContractDialog
onClick={() => { hasAutoFilledRef.current = false; setCurrentStep(1); }}

// RenewContractDialog
onClick={() => { hasAutoFilledRef.current = false; setStep(1); }}
```

### After

```tsx
// CreateContractDialog
onClick={() => {
    hasAutoFilledRef.current = false;
    setFilledFieldValues({});
    setValidationTriggered(false);
    setShowWrongPartyWarning(false);
    setDocumentLoaded(false);
    setCurrentStep(1);
}}

// RenewContractDialog
onClick={() => {
    hasAutoFilledRef.current = false;
    setFilledFieldValues({});
    setValidationTriggered(false);
    setShowWrongPartyWarning(false);
    setDocumentLoaded(false);
    setStep(1);
}}
```

### Reset rationale

| State | Reset value | Reason |
|-------|-------------|--------|
| `hasAutoFilledRef.current` | `false` | Allows `onDocumentLoaded` to trigger the party dialog again on the next Step 2 entry |
| `filledFieldValues` | `{}` | Removes stale autofilled values from the previous visit; prevents `partyValidationWarning` from falsely detecting a committed party |
| `validationTriggered` | `false` | Clears any save-attempt validation so no error highlights appear on the fresh Step 2 load |
| `showWrongPartyWarning` | `false` | Dismisses any lingering "Single Party Restriction" overlay |
| `documentLoaded` | `false` | Returns Autofill / Save buttons to their disabled state until the PDF finishes reloading |

---

## Scope & Safety

- Only the "Back to Details" button handler was modified in each file.
- All other Step 2 logic is untouched: autofill, field-change tracking, single-party enforcement, save, review, and signature flows behave identically to before.
- The full dialog-close reset paths (existing lines 455 / 561) were not changed.
- The fix applies symmetrically to both Create Contract and Renew Contract dialogs.
