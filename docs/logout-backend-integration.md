# Logout — Backend Integration


## Table of Contents

1. [Overview](#1-overview)
2. [What Changed](#2-what-changed)
3. [Architecture](#3-architecture)
4. [Backend Endpoint Contract](#4-backend-endpoint-contract)
5. [File Reference](#5-file-reference)
6. [Data Flow](#6-data-flow)
7. [Error Handling](#7-error-handling)
8. [Security Considerations](#8-security-considerations)
9. [Test Coverage](#9-test-coverage)
10. [Troubleshooting](#10-troubleshooting)

---

## 1. Overview

Prior to this integration, logout was a purely client-side operation: clicking Logout cleared the `cms_current_user` key from `sessionStorage` and redirected the user to `/login`. The JWT token remained valid on the backend until its natural expiry.

This integration adds a **server-side token blacklisting** step. On logout, the frontend calls `POST /auth/logout` with the current Bearer token. The backend extracts the JWT's JTI (JWT ID) claim and writes it to a `revoked_tokens` collection in MongoDB. Subsequent requests that carry this token are rejected with `401`, even if the token has not yet expired.

The local `sessionStorage` entry is **always cleared** regardless of whether the backend call succeeds, ensuring the user can never be trapped in a logged-in state due to a network failure.

---

## 2. What Changed

| Concern | Before | After |
|---|---|---|
| Logout action | Synchronous — cleared sessionStorage only | Asynchronous — calls backend, then clears sessionStorage |
| Token validity after logout | Valid until JWT expiry (no revocation) | Immediately invalid — JTI blacklisted in MongoDB |
| `authService.logout()` signature | `logout(): void` | `logout(): Promise<void>` |
| `Header.handleLogout` | Synchronous function | `async` function — awaits `authService.logout()` |
| Backend call on logout | None | `POST /auth/logout` with `Authorization: Bearer <token>` |
| Failure behaviour | N/A | Session still cleared locally; user is signed out |

---

## 3. Architecture

```
User clicks Logout
        │
        ▼
Header.handleLogout() (async)
        │
        ▼
authService.logout()  ──────────────────────────────────┐
        │                                               │
        ▼                                               │
httpClient.post('/auth/logout', {})                     │
  • Reads JWT from sessionStorage automatically         │
  • Attaches Authorization: Bearer <token>              │
  • Routes to backend via Next.js rewrite proxy         │
        │                                               │
        ▼                                               │
Spring Boot — POST /auth/logout                         │
  • Validates Bearer token                              │
  • Extracts JTI claim from JWT                         │
  • Inserts JTI into revoked_tokens (MongoDB)           │
  • Returns 200 OK                                      │
        │                                               │
  [success] ◄──────────────────────────────────────────┘
  [failure: network / server error → catch block]
        │
        ▼
sessionStorage.removeItem('cms_current_user')   ← always runs
        │
        ▼
router.push('/login')
```

---

## 4. Backend Endpoint Contract

### `POST /auth/logout`

**Purpose:** Revoke the caller's JWT by persisting its JTI in the `revoked_tokens` collection so that no further requests using this token are accepted.

#### Request

| Field | Value |
|---|---|
| Method | `POST` |
| Path | `/auth/logout` |
| Auth | `Authorization: Bearer <jwt>` (required) |
| Body | Empty object `{}` |
| Content-Type | `application/json` |

#### Success Response

```json
HTTP 200 OK
{
  "ok": true,
  "message": "Logged out successfully"
}
```

#### Error Responses

| Status | Condition | Behaviour |
|---|---|---|
| `401 Unauthorized` | Token missing, malformed, or already expired | Frontend catches this in the try/catch; sessionStorage is still cleared |
| `500 Internal Server Error` | Backend error during blacklist write | Frontend catches this; sessionStorage is still cleared |

> **Key guarantee:** The frontend never surfaces logout errors to the user. Any backend or network failure is swallowed in the `catch` block, and the local session is always destroyed.

---

## 5. File Reference

### `src/services/authService.ts`

The only file where `logout()` logic lives.

```typescript
/**
 * Logout user — revokes the JWT on the backend (JTI blacklist) then
 * clears the local session. Session is always cleared even if the
 * backend call fails, so the user is never stuck logged-in locally.
 */
async logout(): Promise<void> {
    if (typeof window === 'undefined') return;
    try {
        // httpClient attaches the stored Bearer token automatically.
        // Backend adds the JTI to the revoked_tokens collection so the
        // token cannot be reused even before it expires.
        await httpClient.post('/auth/logout', {});
    } catch {
        // Network / server errors must not prevent local sign-out.
    }
    sessionStorage.removeItem(CURRENT_USER_STORAGE_KEY);
}
```

**Key points:**
- `typeof window === 'undefined'` guard prevents SSR crashes (Next.js server components have no `window`).
- `httpClient.post` automatically reads the JWT from `sessionStorage` and attaches the `Authorization: Bearer` header — no manual token retrieval needed.
- The `try/catch` wraps only the backend call. `sessionStorage.removeItem` is outside the `try` block and runs unconditionally.

---

### `src/components/layout/Header.tsx`

The only UI entry point that calls `authService.logout()`.

```typescript
const handleLogout = async () => {
    await authService.logout();
    router.push('/login');
};
```

**Key points:**
- `handleLogout` is `async` so it can `await` the backend revocation before redirecting. Without `await`, the redirect could race with the backend call.
- Both the desktop logout button and the mobile overflow menu (MoreVert) call this same handler.

---

### `src/lib/httpClient.ts` (unchanged — for reference)

`httpClient` reads the JWT from sessionStorage and injects it as a Bearer token on every non-public request. The logout endpoint is **not** marked `skipAuth: true`, so the token is automatically attached.

```typescript
// Pseudocode of what httpClient does on each request:
const session = JSON.parse(sessionStorage.getItem('cms_current_user'));
headers['Authorization'] = `Bearer ${session.token}`;
```

The `skipAuth: true` option is used only for the login endpoint (which runs before any token exists).

---

## 6. Data Flow

### Step-by-step

1. **User triggers logout** — Desktop: clicks the `LogoutOutlinedIcon` button. Mobile: opens MoreVert menu, clicks Logout.

2. **`Header.handleLogout()` is called** — Marked `async`. Execution suspends at `await authService.logout()`.

3. **`authService.logout()` runs**:
   - SSR guard: returns immediately if `window` is not defined.
   - Calls `httpClient.post('/auth/logout', {})`.
   - `httpClient` reads `cms_current_user` from `sessionStorage`, extracts the `token`, and attaches `Authorization: Bearer <token>`.

4. **Backend processes the request**:
   - Spring Boot validates the JWT signature and expiry.
   - Extracts the `jti` (JWT ID) claim.
   - Writes `{ jti, revokedAt: now }` to the `revoked_tokens` MongoDB collection.
   - Returns `200 OK`.

5. **Session cleared** — `sessionStorage.removeItem('cms_current_user')` runs (or ran already if the backend call was skipped/failed in catch).

6. **Redirect** — `router.push('/login')` takes the user to the login page.

7. **Subsequent requests blocked** — If anything (another tab, a cached request) tries to use the same token, Spring Boot checks the `revoked_tokens` collection on every request and returns `401`. `httpClient` handles `401` by clearing the session and redirecting to `/login`.

---

## 7. Error Handling

### Failure matrix

| Failure point | What happens | User experience |
|---|---|---|
| Network timeout / offline | `httpClient.post` throws → caught by `catch {}` | Logout succeeds locally; user redirected to `/login`; token remains valid on backend until natural expiry |
| Backend `401` (token already expired) | Response `ok=false` → but `httpClient.post` resolves (not throws) for non-network errors | Same as above — session cleared, redirected |
| Backend `500` | Response resolves with `ok=false` → `httpClient.post` resolves | Same as above |
| `httpClient` throws on non-2xx | `catch {}` swallows | Same as above |
| `window` is undefined (SSR) | Early return at top of `logout()` | No-op — correct for server-side rendering |

### Design rationale

The `catch {}` block is intentionally empty. Any logout path — success or failure — must end with the local session being destroyed. Logging or re-throwing inside `catch` risks the `sessionStorage.removeItem` line being skipped.

---

## 8. Security Considerations

| Concern | Mitigation |
|---|---|
| Token reuse after logout | Backend blacklists JTI immediately — token is invalid even before expiry |
| Network failure leaves token valid | Acceptable trade-off; short JWT expiry (configured on Spring Boot) limits the window |
| Multiple tabs | Clearing sessionStorage only affects the current tab; other tabs retain the session object in their own sessionStorage until they make a request that returns 401 |
| Race condition on redirect | `await authService.logout()` ensures the backend call completes before `router.push('/login')` — no race |
| Stale sessionStorage after redirect | `sessionStorage.removeItem` runs before redirect so the `/login` page sees no active session |
| CSRF | Not applicable — the request body is empty `{}` and the token is in the `Authorization` header, not a cookie |

---

## 9. Test Coverage

Tests are in `src/__tests__/unit/authService.test.ts` (scenarios 14–17).

| # | Test | What it verifies |
|---|---|---|
| 14 | `calls POST /auth/logout to revoke the token on the backend` | `httpClient.post('/auth/logout', {})` is called with the correct endpoint and empty body |
| 15 | `removes the session from sessionStorage after revoking the token` | `sessionStorage.getItem('cms_current_user')` is `null` after logout; `getCurrentUser()` returns `null` |
| 16 | `still clears the local session when the backend call fails` | Even when `httpClient.post` rejects with a network error, `sessionStorage` is cleared |
| 17 | `does not throw when called without an active session` | `logout()` resolves without throwing when sessionStorage is already empty |

### Running the tests

```bash
npx jest src/__tests__/unit/authService.test.ts --no-coverage
```

Expected: **21 tests pass** (scenarios 1–13 are login/session tests; 14–17 are the logout tests; 18–21 are updateSessionUser and getAllRegisteredUsers).

---

## 10. Troubleshooting

### Logout redirects but token still works on the backend

**Cause:** The `POST /auth/logout` call failed silently (network error, backend down).  
**Fix:** Confirm Spring Boot is running at `http://localhost:8080`. Check the browser DevTools Network tab for the `/api/backend/auth/logout` request status.

### `handleLogout is not a function` / `logout is not async`

**Cause:** An older cached module is being used.  
**Fix:** Restart the Next.js dev server (`npm run dev`).

### `401` returned on logout call

**Cause:** The JWT has already expired by the time the user clicks Logout.  
**Behaviour:** This is expected and handled — `httpClient` resolves with `{ ok: false }`, the `catch {}` is not entered, and `sessionStorage.removeItem` still runs.

### User is not redirected after logout

**Cause:** `handleLogout` might not be `async`, or `await` is missing before `authService.logout()`.  
**Verify:** Check `Header.tsx` — `handleLogout` must be `async` and `authService.logout()` must be `await`ed.

### Mobile logout does not work

**Cause:** The mobile MoreVert menu item calls `handleMoreClose(); handleLogout()` without awaiting.  
**Note:** This is intentional — `handleMoreClose()` is synchronous (closes the menu immediately for UX), and `handleLogout()` returns a Promise that the onClick handler does not need to await since the redirect happens inside the async function.
