# Profile — Backend Integration

**Version:** 1.0.0
**Date:** 2026-05-21
**Scope:** User profile — fetch, display, and update via backend API

---

## Table of Contents

1. [Overview](#1-overview)
2. [Architecture](#2-architecture)
3. [Configuration](#3-configuration)
4. [File Reference](#4-file-reference)
5. [Data Flow](#5-data-flow)
6. [Type Reference](#6-type-reference)
7. [Field Reference](#7-field-reference)
8. [Validation Rules](#8-validation-rules)
9. [profileService API](#9-profileservice-api)
10. [Error Handling](#10-error-handling)
11. [Session Sync](#11-session-sync)
12. [Adding New Profile Fields](#12-adding-new-profile-fields)
13. [Troubleshooting](#13-troubleshooting)

---

## 1. Overview

Profile is a **separate service** from authentication. The backend exposes two protected endpoints — `GET /profile` and `PUT /profile` — both requiring a Bearer token. The frontend mirrors this separation: `profileService` is entirely independent of `authService`, with the only bridge being a session sync call after a successful save.

**What changed from the previous MongoDB-direct approach:**

| Concern | Before | After |
|---|---|---|
| Fetch profile | `GET /api/users/profile?email=...` (Next.js → MongoDB) | `GET /profile` (backend, Bearer token) |
| Update profile | `PATCH /api/users/profile` (Next.js → MongoDB) | `PUT /profile` (backend, Bearer token) |
| Field names | `name`, `panCard`, `aadharCard` | `fullName`, `panCardNumber`, `aadharCardNumber` |
| Auth | email passed in query/body | Bearer token auto-injected by `httpClient` |
| Service | `authService.updateProfile()` | `profileService.getProfile()` / `updateProfile()` |

---

## 2. Architecture

```
┌──────────────────────────────────────────────────────────────────┐
│                         Browser (Next.js)                        │
│                                                                  │
│  ┌─────────────────────┐    ┌──────────────────┐                 │
│  │ ProfileSettings     │───▶│ profileService   │                 │
│  │ Dialog.tsx          │    │ (business logic) │                 │
│  │                     │◀───│                  │                 │
│  │  react-hook-form    │    └────────┬─────────┘                 │
│  │  + zod validation   │             │ on save                   │
│  └─────────────────────┘             │ updateSessionUser()        │
│                                      ▼                           │
│                             ┌──────────────────┐                 │
│                             │  authService     │                 │
│                             │  (session sync)  │                 │
│                             └────────┬─────────┘                 │
│                                      │                           │
│                             ┌────────▼─────────┐                 │
│                             │   httpClient     │                 │
│                             │  (transport)     │                 │
│                             └────────┬─────────┘                 │
└──────────────────────────────────────┼──────────────────────────┘
                                       │ Bearer token auto-injected
                              ┌────────▼──────────┐
                              │   Backend API      │
                              │   :8080            │
                              │   GET  /profile    │
                              │   PUT  /profile    │
                              └────────────────────┘
```

### Layer responsibilities

| Layer | File | Responsibility |
|---|---|---|
| UI | `ProfileSettingsDialog.tsx` | Form rendering, validation feedback, loading/saving states |
| Business Logic | `profileService.ts` | API calls, null→empty conversion, session sync trigger |
| Transport | `httpClient.ts` | HTTP execution, Bearer token injection, error normalisation |
| Validation | `profileSchema.ts` | Zod schema — field rules enforced before any API call |
| Types | `types/profile.ts` | Backend shapes; `types/auth.ts` — session user shape |

---

## 3. Configuration

Profile endpoints are protected. The Bearer token is injected automatically by `httpClient` from `sessionStorage`. No additional configuration is required beyond what is set up for login.

**Required environment variable** (already set during login integration):
```env
NEXT_PUBLIC_BACKEND_URL=http://localhost:8080
```

---

## 4. File Reference

### `src/types/profile.ts`
Two backend-facing types:
- `BackendProfileResponse` — exact shape returned by `GET /profile` and `PUT /profile`
- `UpdateProfilePayload` — request body for `PUT /profile` (all fields optional)

### `src/schemas/profileSchema.ts`
Zod schema (`makeProfileSchema`) that validates the form before submission. Exports `ProfileForm` — the single type used by both the form and `profileService`. Field names match the backend exactly.

### `src/services/profileService.ts`
Singleton (`profileService`) with two methods:
- `getProfile()` — fetches profile from backend, converts `null` → `''` for form compatibility
- `updateProfile(form)` — sends only non-empty fields to backend, then syncs sessionStorage

### `src/components/layout/ProfileSettingsDialog.tsx`
Profile UI dialog. Calls `profileService` exclusively — no direct API calls. Opened from the app sidebar/header.

### `src/utils/profileKeyOptions.ts`
Maps `LoggedInUser` field keys to human-readable labels. Used by the template autofill system to let users map PDF form fields to their profile data.

---

## 5. Data Flow

### Fetch Profile (dialog opens)

```
User opens Profile Settings dialog
        │
        ▼
ProfileSettingsDialog useEffect fires
        │
        ▼
profileService.getProfile()
        │
        ▼
httpClient.get('/profile')
        │  Authorization: Bearer <token>  ← auto-injected from sessionStorage
        │
        ▼
Backend returns HTTP 200
{
  "email": "user@example.com",
  "fullName": "Priya Sharma",
  "department": "Legal",
  "organization": "CostaCloud",
  "dateOfBirth": "1998-05-15",
  "gender": "FEMALE",
  "permanentAddress": "123 Main Street",
  "panCardNumber": "ABCDE1234F",
  "aadharCardNumber": "123456789012",
  "profileComplete": true
}
        │
        ▼
profileService converts null → '' for unfilled fields
Returns ProfileForm (matches schema field names exactly)
        │
        ▼
reset(values) — form fields populated
DatePicker synced via setDobValue()
```

### Fetch Failure (network error or 401)

```
getProfile() returns { success: false }
        │
        ▼
Fallback: form populated from sessionStorage cache
(currentUser from authService.getCurrentUser())
```

### Update Profile (user clicks Save)

```
User clicks "Save Changes"
        │
        ▼
handleSubmit() — zod validates all fields
        │  fails? → field-level errors shown, API not called
        │  passes ↓
onSubmit(data: ProfileForm)
setSaving(true)
        │
        ▼
profileService.updateProfile(form)
        │  builds UpdateProfilePayload — omits empty fields
        │
        ▼
httpClient.put('/profile', body)
        │  Authorization: Bearer <token>  ← auto-injected
        │
        ▼
Backend returns HTTP 200
(same BackendProfileResponse shape as GET)
        │
        ▼
authService.updateSessionUser(...)
        │  updates sessionStorage cache so sidebar/header
        │  reflects new name without a page reload
        │
        ▼
{ success: true, message: 'Profile updated successfully' }
        │
        ▼
Snackbar shown → dialog closes after 1.2s
```

### Update Failure

```
Backend returns 4xx / network error
        │
        ▼
{ success: false, message: '<backend error text>' }
        │
        ▼
Snackbar shown with error message
Dialog stays open — user can correct and retry
sessionStorage is NOT updated
```

---

## 6. Type Reference

### `BackendProfileResponse`

Exact shape returned by `GET /profile` and `PUT /profile`.

```typescript
interface BackendProfileResponse {
    email: string;
    fullName: string | null;         // null when user hasn't filled it yet
    department: string | null;
    organization: string | null;
    dateOfBirth: string | null;      // format: YYYY-MM-DD
    gender: 'MALE' | 'FEMALE' | 'OTHER' | null;
    permanentAddress: string | null;
    panCardNumber: string | null;    // format: ABCDE1234F
    aadharCardNumber: string | null; // exactly 12 digits
    profileComplete: boolean;        // true when all fields are filled
}
```

### `UpdateProfilePayload`

Request body sent to `PUT /profile`. All fields are optional — only non-empty fields are sent.

```typescript
interface UpdateProfilePayload {
    fullName?: string;
    department?: string;
    organization?: string;
    dateOfBirth?: string;
    gender?: 'MALE' | 'FEMALE' | 'OTHER';
    permanentAddress?: string;
    panCardNumber?: string;
    aadharCardNumber?: string;
}
```

### `ProfileForm`

Derived from the zod schema. Used as the form data type in `ProfileSettingsDialog` and as the parameter/return type in `profileService`. Empty string `''` represents an unfilled optional field.

```typescript
type ProfileForm = {
    fullName: string;
    department: string;
    organization: string;
    dateOfBirth: string;
    gender: '' | 'MALE' | 'FEMALE' | 'OTHER';
    permanentAddress: string;
    panCardNumber: string;
    aadharCardNumber: string;
}
```

### `LoggedInUser` (relevant fields)

The session cache in `sessionStorage` stores these profile fields so the UI can display them without an extra API call.

```typescript
interface LoggedInUser {
    email: string;
    fullName?: string;
    department?: string;
    organization?: string;
    dateOfBirth?: string;
    gender?: string;
    permanentAddress?: string;
    panCardNumber?: string;
    aadharCardNumber?: string;
    // ...auth fields
}
```

---

## 7. Field Reference

All field names are consistent across the backend, frontend form, session cache, and autofill system.

| Field | Backend key | Form key | Display label | Required |
|---|---|---|---|---|
| Full Name | `fullName` | `fullName` | Full Name | No |
| Department | `department` | `department` | Department | No |
| Organization | `organization` | `organization` | Organization | No |
| Date of Birth | `dateOfBirth` | `dateOfBirth` | Date of Birth | No |
| Gender | `gender` | `gender` | Gender | No |
| Permanent Address | `permanentAddress` | `permanentAddress` | Permanent Address | No |
| PAN Card | `panCardNumber` | `panCardNumber` | PAN Card Number | No |
| Aadhar Card | `aadharCardNumber` | `aadharCardNumber` | Aadhar Card Number | No |

> **Note:** `email` and `profileComplete` are returned by the backend but are read-only — they are never sent in `PUT /profile`.

---

## 8. Validation Rules

Validation runs client-side via zod before the API is called. The backend also validates and returns errors in `{ status, error, message }` shape.

| Field | Rule | Example |
|---|---|---|
| `fullName` | 2–100 chars, letters/spaces/`.`/`-`/`'` only | `Priya Sharma` |
| `department` | max 100 chars | `Legal` |
| `organization` | max 150 chars | `CostaCloud` |
| `dateOfBirth` | valid date, must be in the past, max 120 years ago, format `YYYY-MM-DD` | `1998-05-15` |
| `gender` | one of `MALE`, `FEMALE`, `OTHER`, or empty | `FEMALE` |
| `permanentAddress` | max 500 chars | `123 Main Street` |
| `panCardNumber` | regex `/^[A-Z]{5}[0-9]{4}[A-Z]{1}$/` — 5 uppercase, 4 digits, 1 uppercase | `ABCDE1234F` |
| `aadharCardNumber` | exactly 12 numeric digits | `123456789012` |

### Backend error response shape
```json
{
  "status": 400,
  "error": "Bad Request",
  "message": "Invalid PAN card format. Example: ABCDE1234F"
}
```
The `message` field is surfaced directly in the UI snackbar via `httpClient`'s error resolution (`data.message || data.error`).

---

## 9. profileService API

**Import:**
```typescript
import { profileService } from '@/services/profileService';
```

### `getProfile()`

Fetches the current user's profile from the backend.

```typescript
profileService.getProfile(): Promise<{
    success: boolean;
    data?: ProfileForm;   // populated on success; undefined on error
    message: string;
}>
```

**Behaviour:**
- Calls `GET /profile` — Bearer token injected automatically
- Converts `null` fields from backend to `''` for form compatibility
- On failure, returns `{ success: false, message }` — caller falls back to sessionStorage cache

### `updateProfile(form)`

Sends updated profile data to the backend and syncs the session.

```typescript
profileService.updateProfile(form: ProfileForm): Promise<{
    success: boolean;
    message: string;
}>
```

**Behaviour:**
- Builds `UpdateProfilePayload` — only includes fields with non-empty values (empty strings are omitted)
- Calls `PUT /profile` — Bearer token injected automatically
- On success, calls `authService.updateSessionUser()` to sync `sessionStorage` cache
- On failure, sessionStorage is **not** updated

---

## 10. Error Handling

| Scenario | Behaviour |
|---|---|
| Network error on `getProfile` | Falls back to sessionStorage cache; form shows last-known values |
| `401` on `getProfile` | `httpClient` clears session + redirects to `/login` |
| `400` validation error on `updateProfile` | Backend message shown in snackbar; dialog stays open |
| `401` on `updateProfile` | `httpClient` clears session + redirects to `/login` |
| Network error on `updateProfile` | Error snackbar shown; sessionStorage unchanged |

---

## 11. Session Sync

After a successful `PUT /profile`, `profileService` calls:

```typescript
authService.updateSessionUser({
    fullName, department, organization,
    dateOfBirth, gender, permanentAddress,
    panCardNumber, aadharCardNumber,
});
```

This writes the updated values into `sessionStorage` under `cms_current_user.user`. Any component that reads `authService.getCurrentUser()` — such as the sidebar name display or the profile dialog avatar — will reflect the new values immediately without a page reload or additional API call.

**The session is a cache, not the source of truth.** The backend database is always authoritative. On the next dialog open, `getProfile()` re-fetches from the backend.

---

## 12. Adding New Profile Fields

Follow these steps when the backend adds a new field to `GET /profile` / `PUT /profile`.

### Step 1 — Add to `BackendProfileResponse` and `UpdateProfilePayload`

```typescript
// src/types/profile.ts
interface BackendProfileResponse {
    // ...existing fields
    linkedIn: string | null;  // ← new field
}

interface UpdateProfilePayload {
    // ...existing fields
    linkedIn?: string;
}
```

### Step 2 — Add to `LoggedInUser`

```typescript
// src/types/auth.ts
interface LoggedInUser {
    // ...existing fields
    linkedIn?: string;
}
```

### Step 3 — Add to the zod schema

```typescript
// src/schemas/profileSchema.ts
linkedIn: z.string()
    .refine(v => !v || v.startsWith('https://linkedin.com/'), {
        message: 'Must be a valid LinkedIn URL'
    }),
```

### Step 4 — Add to `profileService` null-conversion and payload

```typescript
// getProfile() — null conversion
linkedIn: d.linkedIn ?? '',

// updateProfile() — payload builder
...(form.linkedIn && { linkedIn: form.linkedIn }),

// updateSessionUser() call
linkedIn: form.linkedIn,
```

### Step 5 — Add to `profileKeyOptions.ts`

```typescript
const PROFILE_KEY_LABELS: Record<string, string> = {
    // ...existing
    linkedIn: 'LinkedIn Profile',
};
```

### Step 6 — Add the Controller to `ProfileSettingsDialog`

```tsx
<Controller
    name="linkedIn"
    control={control}
    render={({ field, fieldState }) => (
        <TextField
            {...field}
            label="LinkedIn"
            size="small"
            fullWidth
            error={!!fieldState.error}
            helperText={fieldState.error?.message}
        />
    )}
/>
```

---

## 13. Troubleshooting

### Profile form loads with empty fields even though data exists in the backend

**Check:** Open DevTools → Network tab → look for `GET /profile`. Confirm:
1. The request is sent with `Authorization: Bearer <token>` header
2. The response returns the expected fields

If the request is missing the auth header, the user's session may be missing the token. Confirm `sessionStorage → cms_current_user` contains a `token` field.

---

### Saved profile doesn't reflect immediately in the sidebar/header

**Cause:** `authService.updateSessionUser()` was not called, or failed silently.

**Check:** `profileService.updateProfile()` only calls `updateSessionUser()` when `response.ok === true`. If the backend returned an error, the session is not updated. Confirm the `PUT /profile` response is `200` in the Network tab.

---

### Backend returns `400` with `"Invalid PAN card format"`

Client-side zod validation uses the same regex `/^[A-Z]{5}[0-9]{4}[A-Z]{1}$/`. If zod passed but the backend rejected it, confirm the value was uppercased before submission. The form does this in `onSubmit`:

```typescript
panCardNumber: data.panCardNumber.toUpperCase()
```

---

### `profileComplete: false` even after filling all fields

`profileComplete` is computed by the backend. The frontend does not calculate or store it. If it stays `false` after a save, the backend's completeness check may require fields the frontend didn't send (empty fields are omitted from `PUT /profile`). Confirm all required fields have values before saving.
