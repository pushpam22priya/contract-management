# Profile Settings — Technical Documentation

**Version:** 1.0  
**Date:** 2026-05-11  
**Status:** Implemented

---

## Table of Contents

1. [Overview](#1-overview)
2. [Entry Point & Dialog Structure](#2-entry-point--dialog-structure)
3. [Avatar Banner](#3-avatar-banner)
4. [Sections & Fields](#4-sections--fields)
5. [Input Behaviours & Constraints](#5-input-behaviours--constraints)
6. [Validation](#6-validation)
7. [Data Loading](#7-data-loading)
8. [Save Flow](#8-save-flow)
9. [Data Model](#9-data-model)
10. [API Reference](#10-api-reference)
11. [Session Management](#11-session-management)
12. [Internationalization](#12-internationalization)
13. [Data Flow Diagram](#13-data-flow-diagram)

---

## 1. Overview

Profile Settings is a dialog that allows a logged-in user to view and update their personal information. It is accessible from the application header. All changes are persisted to MongoDB and simultaneously synced to the user's active session in `sessionStorage`.

**File:** `src/components/layout/ProfileSettingsDialog.tsx`

The dialog contains:
- A read-only avatar banner showing the user's identity
- Three editable sections with a total of **8 editable fields**
- Inline field-level validation with error messages
- A save action that writes to the database and updates the session

---

## 2. Entry Point & Dialog Structure

**Component:** `ProfileSettingsDialog`  
**Props:**

```typescript
interface ProfileSettingsDialogProps {
    open: boolean;
    onClose: () => void;
}
```

**Dialog properties:**
- Built on `BaseDialog` (the application's shared dialog wrapper)
- `maxWidth="sm"`, `noPadding` enabled
- Content area scrolls when form height exceeds the viewport
- Two action buttons in the footer: **Cancel** and **Save Changes**

**Sub-components defined within the file:**

| Component | Purpose |
|---|---|
| `SectionHeader` | Renders a colored left-bar, an icon, and an uppercase section label |
| `SectionBox` | A bordered, subtly-shaded container that wraps each section's fields |

**`SectionHeader` appearance:**
- 3px wide vertical colored bar (`primary.main`)
- Icon in `primary.main` color
- Label in `text.secondary`, uppercase, `0.68rem`, `letterSpacing: 0.9`, `fontWeight: 700`

**`SectionBox` appearance:**
- `border: 1px solid divider`
- `borderRadius: 2`
- Background: `rgba(255,255,255,0.03)` in dark mode, `rgba(0,0,0,0.015)` in light mode
- `gap: 1.5` between fields, `padding: 1.5`

---

## 3. Avatar Banner

The banner sits at the top of the dialog content, above the form sections.

**Appearance:**
- Gradient background: `linear-gradient(135deg, primary.dark → primary.main)` — opacities adjusted for dark mode
- Decorative semi-transparent circles overlaid for depth (purely visual, `pointerEvents: none`)
- Centered column layout with `gap: 1.25`

**Elements displayed:**

| Element | Value |
|---|---|
| Avatar circle | Initials derived from the user's profile (see logic below) |
| Display name | `name` if set; otherwise the local part of the login email (before `@`) |
| Email | Login email, always shown |

**Initials logic (`getInitials`):**
1. If `name` is set and non-empty → return first character of `name`, uppercased
2. Otherwise, take the local part of the email (before `@`) and split on `.`, `_`, or `-`
3. If two or more parts exist → combine first character of part[0] and part[1], uppercased
4. Otherwise → take first two characters of the local part, uppercased

**Avatar styling:** `width: 68, height: 68`, `fontSize: 1.5rem`, `fontWeight: 700`, white text on `rgba(255,255,255,0.22)` background, `2.5px solid rgba(255,255,255,0.5)` border, box shadow.

---

## 4. Sections & Fields

### 4.1 Section — Work Information

**Section icon:** `WorkOutlineIcon`  
**Translation key:** `sectionWork`

| Field | Label key | Type | Editable | Notes |
|---|---|---|---|---|
| Email | `email` | Text | No | Displays `currentUser.email`; always disabled |
| Full Name | `fullName` | Text | Yes | Free text |
| Department | `department` | Text | Yes | Free text |
| Organization | `organization` | Text | Yes | Free text |

**Layout:**
- Email — full width, single row
- Full Name — full width, single row
- Department + Organization — 2-column grid (`1fr 1fr`), shared row

**Icons used (as start adornments):**
- Email: `EmailOutlinedIcon` (color: `text.disabled`)
- Full Name: `PersonOutlinedIcon`
- Department: `BusinessOutlinedIcon`
- Organization: `CorporateFareOutlinedIcon`

---

### 4.2 Section — Personal Details

**Section icon:** `PersonPinOutlinedIcon`  
**Translation key:** `sectionPersonal`

| Field | Label key | Type | Editable | Notes |
|---|---|---|---|---|
| Date of Birth | `dateOfBirth` | Date | Yes | `type="date"`, `inputLabel.shrink: true` |
| Gender | `gender` | Select | Yes | MUI `Select` with 4 options |
| Permanent Address | `permanentAddress` | Text | Yes | Multiline, `rows={2}` |

**Layout:**
- Date of Birth + Gender — 2-column grid (`1fr 1fr`), shared row
- Permanent Address — full width, below the grid row

**Gender select options:**

| Value | Label key |
|---|---|
| `""` (empty) | Placeholder `"Select"` — styled with reduced opacity |
| `"Male"` | `genderMale` |
| `"Female"` | `genderFemale` |
| `"Other"` | `genderOther` |
| `"Prefer not to say"` | `genderPreferNot` |

The Select uses `displayEmpty`, `notched`, and `shrink` label so the placeholder renders correctly when no value is selected.

**Icons used:**
- Date of Birth: `CakeOutlinedIcon`
- Gender: `WcOutlinedIcon` (inside `startAdornment`, `ml: 0.5`)
- Permanent Address: `HomeOutlinedIcon` (`alignSelf: flex-start, mt: 1` to align with multiline top)

---

### 4.3 Section — Identity Information

**Section icon:** `BadgeOutlinedIcon`  
**Translation key:** `sectionIdentity`

| Field | Label key | Type | Editable | Notes |
|---|---|---|---|---|
| PAN Card Number | `panCard` | Text | Yes | Auto-uppercase on change; max 10 chars |
| Aadhar Card Number | `aadharCard` | Text | Yes | Digits only; max 12 chars |

**Layout:**
- PAN Card + Aadhar Card — 2-column grid (`1fr 1fr`), shared row

**Icons used:**
- PAN Card: `CreditCardOutlinedIcon`
- Aadhar Card: `FingerprintOutlinedIcon`

---

## 5. Input Behaviours & Constraints

| Field | onChange behaviour | Constraint |
|---|---|---|
| Full Name | `setName(value)` + `clearError('name')` | None |
| Department | `setDepartment(value)` | None |
| Organization | `setOrganization(value)` | None |
| Date of Birth | `setDateOfBirth(value)` + `clearError('dateOfBirth')` | Native date picker limits |
| Gender | `setGender(value)` | Select — enforces listed options |
| Permanent Address | `setPermanentAddress(value)` | None |
| PAN Card | `setPanCard(value.toUpperCase())` + `clearError('panCard')` | `slotProps.htmlInput.maxLength: 10` |
| Aadhar Card | `setAadharCard(value.replace(/\D/g, '').slice(0, 12))` + `clearError('aadharCard')` | `slotProps.htmlInput.maxLength: 12`; non-digit characters are stripped on every keystroke |

**`clearError` function:**

```typescript
const clearError = (key: keyof ProfileErrors) =>
    setErrors(prev => { const n = { ...prev }; delete n[key]; return n; });
```

Errors are cleared field-by-field as soon as the user starts editing that field. Other field errors remain visible until the next save attempt.

**Shared field `sx`:**

```typescript
const fieldSx = { '& .MuiInputBase-root': { borderRadius: 2 } };
```

Applied to every `TextField` and `FormControl` for consistent rounded corners.

---

## 6. Validation

Validation runs only when the user clicks **Save Changes**. All fields are optional — validation only triggers if a field has been filled in.

**Error type:**

```typescript
type ProfileErrors = Partial<Record<
    'name' | 'dateOfBirth' | 'panCard' | 'aadharCard',
    string
>>;
```

### Validation Rules

| Field | Condition checked | Error message key |
|---|---|---|
| `name` | If filled and `length < 2` | `errorNameMin` |
| `name` | If filled and does not match `/^[a-zA-Z\s.\-']+$/` | `errorNameChars` |
| `dateOfBirth` | If filled and `isNaN(new Date(value))` | `errorDobInvalid` |
| `dateOfBirth` | If filled and date is in the future | `errorDobFuture` |
| `dateOfBirth` | If filled and age > 120 years | `errorDobInvalid` |
| `panCard` | If filled and does not match `/^[A-Z]{5}[0-9]{4}[A-Z]{1}$/` | `errorPanFormat` |
| `aadharCard` | If filled and `length !== 12` | `errorAadharLength` |

**`validate()` returns `true` if no errors are found; `false` if any errors exist.**  
On failure, `setErrors(e)` is called and `handleSave` returns early without making any API call.

### Error Display

When a field has an error:
- `error={!!errors.fieldKey}` turns the `TextField` border red
- `helperText={errors.fieldKey}` shows the error message below the field
- The field's start adornment icon color changes to `error.main`:
  ```tsx
  color: errors.name ? 'error.main' : 'text.secondary'
  ```

### Errors Reset on Dialog Open

```typescript
useEffect(() => {
    if (!open || !currentUser?.email) return;
    setErrors({});   // ← all errors cleared when dialog opens
    // ... fetch
}, [open]);
```

---

## 7. Data Loading

When the dialog opens (`open` changes to `true`), a `fetch` call is made to load the user's latest profile data from the database.

```typescript
fetch(`/api/users/profile?email=${encodeURIComponent(currentUser.email)}`, {
    signal: controller.signal,
})
```

**On success:** All 8 state fields are populated from the API response.

**On error (non-abort):** Fields fall back to `currentUser.*` values from sessionStorage — ensuring the dialog is never empty even if the network call fails.

**On abort** (dialog closed before fetch completes): The error is swallowed silently (`if (err.name === 'AbortError') return`).

**Cleanup:** An `AbortController` is used. The fetch is aborted if the `open` dependency changes before completion (i.e. the dialog is closed mid-fetch).

**Loading state:** While the fetch is in progress, `fetching === true` and the entire form area is replaced with a centered `CircularProgress` spinner (`size={32}`). The **Save Changes** button is also disabled (`disabled={fetching || saving}`).

---

## 8. Save Flow

Triggered when the user clicks **Save Changes**.

```
handleSave()
    │
    ├─ validate() → false  →  setErrors(e) → return (no API call)
    │
    └─ validate() → true
            │
            ├─ setSaving(true)
            │   (Save button shows CircularProgress spinner, label changes to "Saving...")
            │
            ├─ authService.updateProfile({
            │       name, department, organization,
            │       dateOfBirth, gender, permanentAddress,
            │       panCard: panCard.toUpperCase(),
            │       aadharCard,
            │   })
            │
            ├─ setSaving(false)
            │
            ├─ result.success === true
            │       └─ show success snackbar
            │          setTimeout(onClose, 1200)   ← dialog auto-closes after 1.2s
            │
            └─ result.success === false
                    └─ show error snackbar with result.message or fallback 'saveError'
```

**Save button states:**

| State | Label | Icon |
|---|---|---|
| Normal | `t('saveChanges')` | None |
| Saving | `t('saving')` | `CircularProgress size={14}` |
| Disabled | — | When `fetching` or `saving` is true |

**Feedback:** A `NotificationSnackbar` renders outside the `BaseDialog` (at the same level in the fragment) and shows the save result.

---

## 9. Data Model

### `LoggedInUser` — `src/types/auth.ts`

```typescript
export interface LoggedInUser {
    // System fields — set by the auth layer, not editable in profile settings
    id: string;
    email: string;
    lastLogin: string;
    isAdmin: boolean;

    // Profile fields — editable via Profile Settings
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

All profile fields are optional. `email` is part of `LoggedInUser` and is shown in the dialog as a read-only field, but it is not editable through this dialog.

---

## 10. API Reference

### GET `/api/users/profile`

**File:** `src/app/api/users/profile/route.ts`

**Query parameter:** `?email=<encoded email>`

**MongoDB query:**
```typescript
db.collection('users').findOne(
    { email: { $regex: /^<escaped_email>$/i } },
    { projection: {
        name: 1, department: 1, organization: 1,
        dateOfBirth: 1, gender: 1, permanentAddress: 1,
        panCard: 1, aadharCard: 1, email: 1,
        _id: 0,
    }}
)
```

Email matching is **case-insensitive** via regex.

**Response (200):**
```json
{
    "email": "user@example.com",
    "name": "",
    "department": "",
    "organization": "",
    "dateOfBirth": "",
    "gender": "",
    "permanentAddress": "",
    "panCard": "",
    "aadharCard": ""
}
```

If no user document is found, the same shape is returned with all fields as empty strings (not a 404).

**Error responses:**
- `400` — `email` query param is missing
- `500` — unexpected database error

---

### PATCH `/api/users/profile`

**Request body:**
```json
{
    "email": "user@example.com",
    "name": "Pushpam Priya",
    "department": "Engineering",
    "organization": "Appolo Systems",
    "dateOfBirth": "1995-04-12",
    "gender": "Female",
    "permanentAddress": "42 MG Road, Bangalore",
    "panCard": "ABCDE1234F",
    "aadharCard": "234958493827"
}
```

**MongoDB update:**
```typescript
db.collection('users').updateOne(
    { email: { $regex: /^<escaped_email>$/i } },
    { $set: {
        name:             name?.trim()                  || '',
        department:       department?.trim()            || '',
        organization:     organization?.trim()          || '',
        dateOfBirth:      dateOfBirth?.trim()           || '',
        gender:           gender?.trim()                || '',
        permanentAddress: permanentAddress?.trim()      || '',
        panCard:          panCard?.trim().toUpperCase() || '',
        aadharCard:       aadharCard?.trim()            || '',
        profileUpdatedAt: new Date().toISOString(),
    }}
)
```

All values are trimmed server-side. `panCard` is uppercased server-side as an additional safety measure (the client also uppercases it before sending). `profileUpdatedAt` is always stamped on every successful update.

**Response (200):**
```json
{
    "success": true,
    "message": "Profile updated successfully",
    "profile": {
        "name": "...",
        "department": "...",
        "organization": "...",
        "dateOfBirth": "...",
        "gender": "...",
        "permanentAddress": "...",
        "panCard": "...",
        "aadharCard": "..."
    }
}
```

**Error responses:**
- `400` — `email` field missing in request body
- `404` — no user document matched the email
- `500` — unexpected database error

---

## 11. Session Management

The application stores the logged-in user in `sessionStorage` under the key `cms_current_user`. This is managed by `authService` in `src/services/authService.ts`.

### Methods Used by Profile Settings

**`authService.getCurrentUser(): LoggedInUser | null`**  
Reads and JSON-parses `cms_current_user` from `sessionStorage`. Returns `null` if not present or if running server-side.

**`authService.updateProfile(profile): Promise<{ success, message }>`**  
1. Reads `currentUser` from session
2. Calls `PATCH /api/users/profile` with `{ email: currentUser.email, ...profile }`
3. On success, calls `updateSessionUser(profile)` to sync the session
4. Returns `{ success, message }` from the API response

**`authService.updateSessionUser(updates: Partial<LoggedInUser>): void`**  
Merges `updates` onto the existing `currentUser` object and writes the result back to `sessionStorage`. This ensures the rest of the application sees up-to-date profile values without requiring a page reload or re-login.

```typescript
updateSessionUser(updates: Partial<LoggedInUser>): void {
    const currentUser = this.getCurrentUser();
    if (!currentUser) return;
    this.saveCurrentUser({ ...currentUser, ...updates });
}
```

---

## 12. Internationalization

The dialog is fully translated using `next-intl`. The translation hook is called at the top of the component:

```typescript
const t = useTranslations('profileSettings');
```

### Translation Keys — `profileSettings` namespace

#### Labels & Placeholders

| Key | English Value |
|---|---|
| `title` | Profile Settings |
| `email` | Email |
| `fullName` | Full Name |
| `fullNamePlaceholder` | Enter your full name |
| `department` | Department |
| `departmentPlaceholder` | e.g. Legal, Finance, Operations |
| `organization` | Organization |
| `organizationPlaceholder` | Enter your organization name |
| `dateOfBirth` | Date of Birth |
| `gender` | Gender |
| `genderMale` | Male |
| `genderFemale` | Female |
| `genderOther` | Other |
| `genderPreferNot` | Prefer not to say |
| `permanentAddress` | Permanent Address |
| `permanentAddressPlaceholder` | Enter your permanent address |
| `panCard` | PAN Card Number |
| `panCardPlaceholder` | e.g. ABCDE1234F |
| `aadharCard` | Aadhar Card Number |
| `aadharCardPlaceholder` | 12-digit Aadhar number |

#### Section Headers

| Key | English Value |
|---|---|
| `sectionWork` | Work Information |
| `sectionPersonal` | Personal Details |
| `sectionIdentity` | Identity Information |

#### Actions & Status

| Key | English Value |
|---|---|
| `saveChanges` | Save Changes |
| `saving` | Saving... |
| `cancel` | Cancel |
| `saveSuccess` | Profile updated successfully |
| `saveError` | Failed to update profile |
| `admin` | Admin |
| `user` | User |

#### Validation Error Messages

| Key | English Value |
|---|---|
| `errorNameMin` | Name must be at least 2 characters |
| `errorNameChars` | Name can only contain letters, spaces, hyphens and dots |
| `errorDobFuture` | Date of birth cannot be in the future |
| `errorDobInvalid` | Please enter a valid date of birth |
| `errorPanFormat` | Invalid PAN format (e.g. ABCDE1234F) |
| `errorAadharLength` | Aadhar number must be exactly 12 digits |

Both `translations/en.json` and `translations/hi.json` contain all of the above keys under the `profileSettings` namespace.

---

## 13. Data Flow Diagram

```
USER OPENS PROFILE SETTINGS DIALOG
            │
            ▼
    useEffect fires  (dependency: [open])
            │
            ├─ setErrors({})         ← clear any prior validation errors
            │
            └─ GET /api/users/profile?email=<currentUser.email>
                        │
                        ├─ Pending  →  fetching = true
                        │              form hidden, CircularProgress shown
                        │
                        ├─ Success  →  populate 8 state fields from response
                        │              fetching = false
                        │
                        ├─ AbortError  →  silently ignored
                        │
                        └─ Other error →  populate from sessionStorage fallback
                                          fetching = false

USER VIEWS AND EDITS FIELDS
            │
            ├─ Text field    →  setState(value)
            ├─ PAN field     →  setState(value.toUpperCase())
            ├─ Aadhar field  →  setState(value.replace(/\D/g,'').slice(0,12))
            ├─ Gender Select →  setState(value)
            │
            └─ For name / dateOfBirth / panCard / aadharCard:
               also calls clearError(fieldKey) to clear that field's error

USER CLICKS "Save Changes"
            │
            ▼
    validate() runs
            │
            ├─ Errors found
            │       └─ setErrors(e)
            │          Affected fields show red border + helper text
            │          handleSave returns — NO API call made
            │
            └─ No errors
                    │
                    ├─ setSaving(true)
                    │  Button shows spinner + "Saving..."
                    │
                    ├─ authService.updateProfile({ 8 fields })
                    │       │
                    │       ├─ PATCH /api/users/profile
                    │       │       │
                    │       │       ├─ 404  →  { success: false, message: 'User not found' }
                    │       │       ├─ 500  →  { success: false, message: 'Failed...' }
                    │       │       └─ 200  →  { success: true, message: '...' }
                    │       │
                    │       └─ On success: updateSessionUser(profile)
                    │          (merges new values into sessionStorage)
                    │
                    ├─ setSaving(false)
                    │
                    ├─ result.success === true
                    │       └─ NotificationSnackbar: "Profile updated successfully"
                    │          setTimeout(onClose, 1200)
                    │
                    └─ result.success === false
                            └─ NotificationSnackbar: error message (severity: error)
```