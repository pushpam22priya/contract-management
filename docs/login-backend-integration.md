# Login — Backend Integration

**Version:** 1.0.0
**Date:** 2026-05-20
**Scope:** Authentication layer — login flow, HTTP client, session management

---

## Table of Contents

1. [Overview](#1-overview)
2. [Architecture](#2-architecture)
3. [Configuration](#3-configuration)
4. [File Reference](#4-file-reference)
5. [Data Flow](#5-data-flow)
6. [Type Reference](#6-type-reference)
7. [HTTP Client API](#7-http-client-api)
8. [Error Handling](#8-error-handling)
9. [Session Management](#9-session-management)
10. [Adding New Backend Endpoints](#10-adding-new-backend-endpoints)
11. [Security Considerations](#11-security-considerations)
12. [Troubleshooting](#12-troubleshooting)

---

## 1. Overview

Prior to this integration, the login flow called a Next.js API route (`/api/users`) which read directly from MongoDB. This has been replaced with a call to the external backend service running at `http://localhost:8080`.

**What changed:**

| Concern | Before | After |
|---|---|---|
| Login endpoint | `POST /api/users` (Next.js) | `POST /auth/login` (backend) |
| Token storage | Not applicable | JWT stored in `sessionStorage` |
| Auth header | Not applicable | `Authorization: Bearer <token>` on all requests |
| Session shape | `LoggedInUser` (flat) | `{ user: LoggedInUser, token: string }` |
| 401 handling | Not applicable | Global redirect to `/login` |

---

## 2. Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                        Browser (Next.js)                        │
│                                                                 │
│  ┌──────────────┐    ┌─────────────────┐    ┌───────────────┐  │
│  │  Login Page  │───▶│  authService    │───▶│  httpClient   │  │
│  │  (UI layer)  │    │  (business      │    │  (transport   │  │
│  │              │◀───│   logic)        │◀───│   layer)      │  │
│  └──────────────┘    └────────┬────────┘    └───────┬───────┘  │
│                               │                     │           │
│                        sessionStorage          fetch()           │
│                      { user, token }                │           │
└──────────────────────────────────────────────────── │ ──────────┘
                                                       │
                                              ┌────────▼────────┐
                                              │  Backend API    │
                                              │  :8080          │
                                              │  POST /auth/    │
                                              │       login     │
                                              └─────────────────┘
```

### Layer responsibilities

| Layer | File | Responsibility |
|---|---|---|
| UI | `src/app/login/page.tsx` | Form rendering, validation, user feedback |
| Business Logic | `src/services/authService.ts` | Orchestrates login, maps response, manages session |
| Transport | `src/lib/httpClient.ts` | HTTP execution, token injection, global error handling |
| Types | `src/types/auth.ts` | Shared interfaces across all layers |

---

## 3. Configuration

### Environment Variables

| Variable | Required | Default | Description |
|---|---|---|---|
| `NEXT_PUBLIC_BACKEND_URL` | Yes | `http://localhost:8080` | Base URL of the backend API |

### Setup

Add to `.env.local` for local development:

```env
NEXT_PUBLIC_BACKEND_URL=http://localhost:8080
```

Add to `.env.production` for production:

```env
NEXT_PUBLIC_BACKEND_URL=https://api.your-domain.com
```

> **Note:** The `NEXT_PUBLIC_` prefix is required for the variable to be accessible in browser-side code (Next.js requirement). Server-only variables should omit this prefix.

---

## 4. File Reference

### `src/lib/httpClient.ts`
Central HTTP client. All calls to the backend go through this file — never use `fetch()` directly against the backend URL.

### `src/services/authService.ts`
Singleton service (`authService`) that handles login, logout, session read/write, and profile updates. Consumed by UI components and other services.

### `src/types/auth.ts`
TypeScript interfaces for all authentication-related shapes: `LoggedInUser`, `LoginCredentials`, `AuthResponse`, `StoredSession`, `BackendLoginResponse`.

### `src/app/login/page.tsx`
Login UI. Uses `react-hook-form` + `zod` for validation. Calls `authService.login()` on submit. **No direct knowledge of the backend or httpClient.**

---

## 5. Data Flow

### Successful Login

```
User submits form
       │
       ▼
LoginPage.onSubmit(data)
       │  calls
       ▼
authService.login({ email, password })
       │  validates fields locally
       │  calls
       ▼
httpClient.post('/auth/login', body, { skipAuth: true })
       │  builds request
       │  skips Authorization header (public endpoint)
       │  calls
       ▼
fetch('http://localhost:8080/auth/login', { method: 'POST', body })
       │
       ▼
Backend returns HTTP 200
{ token, email, role, newUser }
       │
       ▼
httpClient parses JSON, returns
{ ok: true, data: { token, email, role, newUser }, status: 200 }
       │
       ▼
authService maps response → LoggedInUser
authService.saveSession(user, token)
       │  writes to sessionStorage:
       │  { user: { id, email, isAdmin, lastLogin }, token }
       │
       ▼
authService returns { success: true, user }
       │
       ▼
LoginPage shows success alert
router.push('/dashboard')  [after 800ms]
```

### Failed Login (Invalid Credentials)

```
Backend returns HTTP 401
{ error: "Invalid password", status: 401 }
       │
       ▼
httpClient detects 401
       │  skipAuth: true → does NOT redirect (bad credentials, not session expiry)
       │  reads data.message || data.error
       │
       ▼
returns { ok: false, status: 401, message: "Invalid password" }
       │
       ▼
authService returns { success: false, message: "Invalid password" }
       │
       ▼
LoginPage sets apiError state → Alert shown to user
```

### Expired Session (Authenticated Request)

```
Any httpClient call (skipAuth: false, default)
       │
       ▼
Backend returns HTTP 401
       │  skipAuth: false → handleUnauthorized()
       │  clears sessionStorage
       │  window.location.href = '/login'
       │
       ▼
User is redirected to login page
```

---

## 6. Type Reference

### `BackendLoginResponse`
Raw shape returned by `POST /auth/login`.

```typescript
interface BackendLoginResponse {
    token: string;    // JWT token
    email: string;    // Authenticated user's email
    role: string;     // e.g. "USER" | "ADMIN"
    newUser: boolean; // true if this is the user's first login
}
```

### `LoggedInUser`
Normalised user object stored in session and used across the application.

```typescript
interface LoggedInUser {
    id: string;           // Mapped from email (backend does not return id on login)
    email: string;
    isAdmin: boolean;     // Derived from role === 'ADMIN'
    lastLogin: string;    // ISO timestamp, set client-side at login time
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

### `StoredSession`
Shape written to `sessionStorage` under the key `cms_current_user`.

```typescript
interface StoredSession {
    token: string;
    user: LoggedInUser;
}
```

### `ApiResponse<T>`
Uniform return type from every `httpClient` call.

```typescript
interface ApiResponse<T = unknown> {
    data: T | null;   // Parsed response body on success, null on error
    ok: boolean;      // true if HTTP status is 2xx
    status: number;   // HTTP status code (0 = network error)
    message: string;  // Human-readable message for UI display
}
```

---

## 7. HTTP Client API

**Import:**
```typescript
import { httpClient } from '@/lib/httpClient';
```

### Methods

All methods return `Promise<ApiResponse<T>>`.

```typescript
httpClient.get<T>(path, options?)
httpClient.post<T>(path, body, options?)
httpClient.put<T>(path, body, options?)
httpClient.patch<T>(path, body, options?)
httpClient.delete<T>(path, options?)
```

### `RequestOptions`

| Option | Type | Default | Description |
|---|---|---|---|
| `skipAuth` | `boolean` | `false` | When `true`, omits the `Authorization` header. Use for public endpoints (login, register, etc.) |
| `headers` | `Record<string, string>` | `{}` | Additional headers to merge into the request |

### Automatic Behaviours

| Behaviour | Detail |
|---|---|
| Base URL | Prepended from `NEXT_PUBLIC_BACKEND_URL` env var |
| Content-Type | Always `application/json` |
| Auth header | `Authorization: Bearer <token>` injected automatically from `sessionStorage` |
| JSON parsing | Response body parsed only if `Content-Type: application/json` is present |
| Error normalisation | `data?.message` → `data?.error` → fallback string |

---

## 8. Error Handling

### HTTP Status Handling

| Status | `skipAuth: false` (authenticated) | `skipAuth: true` (public) |
|---|---|---|
| `2xx` | Returns `{ ok: true, data }` | Returns `{ ok: true, data }` |
| `4xx` (non-401) | Returns `{ ok: false, message }` | Returns `{ ok: false, message }` |
| `401` | Clears session + redirects to `/login` | Returns `{ ok: false, message }` — **no redirect** |
| `5xx` | Returns `{ ok: false, message }` | Returns `{ ok: false, message }` |
| Network error | Returns `{ ok: false, status: 0, message: 'Network error...' }` | Same |

### Error Message Resolution

The client resolves the human-readable error message in this priority order:

```
1. data.message   (standard REST convention)
2. data.error     (this backend's convention for error responses)
3. `Request failed with status ${status}`  (final fallback)
```

This means the backend's error text (e.g. `"Invalid password"`) is always surfaced to the UI without any manual mapping.

---

## 9. Session Management

### Storage Key
`cms_current_user` in `sessionStorage`.

### Session Shape
```json
{
  "token": "eyJhbGci...",
  "user": {
    "id": "user@gmail.com",
    "email": "user@gmail.com",
    "isAdmin": false,
    "lastLogin": "2026-05-20T11:38:00.000Z"
  }
}
```

### `authService` Methods

| Method | Description |
|---|---|
| `authService.login(credentials)` | Calls backend, saves session, returns `AuthResponse` |
| `authService.logout()` | Removes `cms_current_user` from sessionStorage |
| `authService.getCurrentUser()` | Returns `LoggedInUser` or `null` |
| `authService.isAuthenticated()` | Returns `true` if a session exists |
| `authService.updateSessionUser(updates)` | Merges partial updates into the stored user object |

### Backward Compatibility
`getCurrentUser()` handles both the old flat storage shape (`LoggedInUser` directly) and the new `{ user, token }` shape, so existing sessions degrade gracefully after upgrade.

---

## 10. Adding New Backend Endpoints

Follow this pattern for every new backend integration.

### Step 1 — Define the response type in `src/types/`

```typescript
// src/types/contract.ts (or the relevant domain type file)
export interface BackendContractResponse {
    id: string;
    title: string;
    status: string;
    // ... fields as returned by backend
}
```

### Step 2 — Call `httpClient` in the relevant service

```typescript
// src/services/contractService.ts
import { httpClient } from '@/lib/httpClient';
import { BackendContractResponse } from '@/types/contract';

export const contractService = {
    getAll: () =>
        httpClient.get<BackendContractResponse[]>('/contracts'),

    getById: (id: string) =>
        httpClient.get<BackendContractResponse>(`/contracts/${id}`),

    create: (data: NewContractPayload) =>
        httpClient.post<BackendContractResponse>('/contracts', data),

    update: (id: string, data: Partial<NewContractPayload>) =>
        httpClient.patch<BackendContractResponse>(`/contracts/${id}`, data),

    delete: (id: string) =>
        httpClient.delete(`/contracts/${id}`),
};
```

### Step 3 — Consume in the component

```typescript
const response = await contractService.getAll();

if (response.ok && response.data) {
    setContracts(response.data);
} else {
    setError(response.message);
}
```

> **Rule:** Never import `httpClient` directly in a page or component. Always go through a service. This keeps the transport layer decoupled from UI.

---

## 11. Security Considerations

| Concern | Current Approach | Note |
|---|---|---|
| Token storage | `sessionStorage` | Cleared on tab close. Not accessible across tabs. |
| Token transmission | `Authorization: Bearer` header | Sent only over HTTPS in production. |
| CSRF | Not applicable | Token-based auth (stateless); no cookies used. |
| XSS exposure | `sessionStorage` is accessible to JS | Acceptable trade-off for this architecture. For higher security, migrate to `httpOnly` cookie via a Next.js proxy route. |
| Backend URL | `NEXT_PUBLIC_BACKEND_URL` in env | Never hardcode. Do not commit `.env.local` to version control. |
| Public endpoints | `{ skipAuth: true }` | Explicitly marks endpoints that should not carry tokens. |

---

## 12. Troubleshooting

### Login button causes a full page reload

**Cause:** A `401` response from the backend was triggering `handleUnauthorized()` → `window.location.href = '/login'` even during the login request itself.

**Fix applied:** `handleUnauthorized()` is now only called when `skipAuth: false`. Login uses `skipAuth: true`, so a `401` returns an error message without any navigation.

---

### Error message shows blank / generic text in the UI

**Cause:** Backend error responses use the field name `error` (e.g. `{ "error": "Invalid password" }`), but the client was only reading `data.message`.

**Fix applied:** Error resolution checks `data.message || data.error || fallback`.

---

### `CORS` error in browser console

**Symptom:** `Access-Control-Allow-Origin` error in the browser network tab.

**Fix:** The backend must allow the frontend origin. For local development, the backend should permit `http://localhost:3000`. This is a backend configuration change, not a frontend one.

---

### Token not being sent on requests

**Check:**
1. Confirm the user has an active session — `authService.getCurrentUser()` should not return `null`.
2. Confirm `sessionStorage` contains `cms_current_user` with a `token` field (Application tab → Session Storage in DevTools).
3. Confirm `skipAuth` is not accidentally set to `true` on an authenticated endpoint.
