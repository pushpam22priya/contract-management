/**
 * UNIT TESTS — AuthService (src/services/authService.ts)
 *
 * Tests the class methods in isolation by mocking httpClient.
 * sessionStorage is provided by the jsdom environment and is reset
 * between each test via beforeEach.
 *
 * Scenarios covered:
 *  1.  login() — calls POST /auth/login with correct payload
 *  2.  login() — saves JWT + user to sessionStorage on success
 *  3.  login() — eagerly fetches profile data and merges it into session
 *  4.  login() — profile fetch failure does NOT block login success
 *  5.  login() — returns { success: false } when backend returns 401
 *  6.  login() — returns { success: false } when email is missing (guard)
 *  7.  login() — returns { success: false } when password is missing (guard)
 *  8.  getCurrentUser() — returns null when sessionStorage is empty
 *  9.  getCurrentUser() — returns user from { user, token } session shape
 * 10.  getCurrentUser() — supports old flat-user shape (backward compat)
 * 11.  getCurrentUser() — returns null for corrupt sessionStorage JSON
 * 12.  isAuthenticated() — returns false when no session
 * 13.  isAuthenticated() — returns true when session exists
 * 14.  logout() — calls POST /auth/logout to revoke the token on the backend
 * 15.  logout() — removes the session from sessionStorage after revoking
 * 16.  logout() — still clears the local session when the backend call fails
 * 17.  logout() — does not throw when called without an active session
 * 18.  updateSessionUser() — merges partial updates into the existing session
 * 19.  updateSessionUser() — is a no-op when there is no existing session
 * 20.  getAllRegisteredUsers() — returns user list from backend
 * 21.  getAllRegisteredUsers() — returns empty array on backend error
 */

// ─── httpClient mock ──────────────────────────────────────────────────────────

const mockPost = jest.fn();
const mockGet  = jest.fn();

jest.mock('@/lib/httpClient', () => ({
    httpClient: {
        post: (...args: any[]) => mockPost(...args),
        get:  (...args: any[]) => mockGet(...args),
    },
}));

// ─── Module under test (imported AFTER mocks are in place) ───────────────────

import { authService } from '@/services/authService';

// ─── Constants matching the implementation ───────────────────────────────────

const SESSION_KEY = 'cms_current_user';

// ─── Shared fixtures ──────────────────────────────────────────────────────────

const BACKEND_LOGIN_SUCCESS = {
    ok:     true,
    status: 200,
    data:   { token: 'jwt_token_abc', email: 'alice@example.com', role: 'USER', newUser: false },
    message: 'Login successful',
};

const BACKEND_LOGIN_ADMIN = {
    ok:     true,
    status: 200,
    data:   { token: 'jwt_admin_xyz', email: 'admin@example.com', role: 'ADMIN', newUser: false },
    message: 'Login successful',
};

const BACKEND_LOGIN_FAILURE = {
    ok:      false,
    status:  401,
    data:    null,
    message: 'Invalid email or password',
};

const PROFILE_RESPONSE = {
    ok:   true,
    data: {
        fullName:         'Alice Smith',
        department:       'Legal',
        organization:     'Acme Corp',
        dateOfBirth:      '1990-05-10',
        gender:           'Female',
        permanentAddress: '123 Main St',
        panCardNumber:    'ABCDE1234F',
        aadharCardNumber: '1234-5678-9012',
    },
    message: 'ok',
};

// ─────────────────────────────────────────────────────────────────────────────

beforeEach(() => {
    sessionStorage.clear();
    jest.clearAllMocks();
});

// =============================================================================
// login()
// =============================================================================

describe('authService.login()', () => {

    it('calls POST /auth/login with the correct payload', async () => {
        mockPost.mockResolvedValueOnce(BACKEND_LOGIN_SUCCESS);
        mockGet.mockResolvedValueOnce({ ok: false, data: null }); // profile — not the focus here

        await authService.login({ email: 'alice@example.com', password: 'secret123' });

        expect(mockPost).toHaveBeenCalledWith(
            '/auth/login',
            { email: 'alice@example.com', password: 'secret123' },
            { skipAuth: true }   // login endpoint is public — must not send a stale token
        );
    });

    it('saves JWT and user into sessionStorage on a successful login', async () => {
        mockPost.mockResolvedValueOnce(BACKEND_LOGIN_SUCCESS);
        mockGet.mockResolvedValueOnce({ ok: false, data: null }); // profile optional

        const result = await authService.login({ email: 'alice@example.com', password: 'secret123' });

        expect(result.success).toBe(true);
        expect(result.message).toBe('Login successful');
        expect(result.user?.email).toBe('alice@example.com');
        expect(result.user?.isAdmin).toBe(false);

        const raw = sessionStorage.getItem(SESSION_KEY);
        expect(raw).not.toBeNull();
        const session = JSON.parse(raw!);
        expect(session.token).toBe('jwt_token_abc');
        expect(session.user.email).toBe('alice@example.com');
        expect(session.user.isAdmin).toBe(false);
        expect(session.user.lastLogin).toBeDefined();
    });

    it('sets isAdmin=true when backend returns role=ADMIN', async () => {
        mockPost.mockResolvedValueOnce(BACKEND_LOGIN_ADMIN);
        mockGet.mockResolvedValueOnce({ ok: false, data: null });

        const result = await authService.login({ email: 'admin@example.com', password: 'admin123' });

        expect(result.user?.isAdmin).toBe(true);
        const session = JSON.parse(sessionStorage.getItem(SESSION_KEY)!);
        expect(session.user.isAdmin).toBe(true);
    });

    it('eagerly fetches and merges profile data into the session after login', async () => {
        mockPost.mockResolvedValueOnce(BACKEND_LOGIN_SUCCESS);
        mockGet.mockResolvedValueOnce(PROFILE_RESPONSE);

        await authService.login({ email: 'alice@example.com', password: 'secret123' });

        // GET /profile must be called once to warm the cache
        expect(mockGet).toHaveBeenCalledWith('/profile');

        const session = JSON.parse(sessionStorage.getItem(SESSION_KEY)!);
        expect(session.user.fullName).toBe('Alice Smith');
        expect(session.user.department).toBe('Legal');
        expect(session.user.organization).toBe('Acme Corp');
        expect(session.user.panCardNumber).toBe('ABCDE1234F');
    });

    it('still returns success when the profile fetch fails', async () => {
        mockPost.mockResolvedValueOnce(BACKEND_LOGIN_SUCCESS);
        mockGet.mockRejectedValueOnce(new Error('Network error'));

        const result = await authService.login({ email: 'alice@example.com', password: 'secret123' });

        // Login must succeed regardless
        expect(result.success).toBe(true);
        // JWT must still be saved
        const session = JSON.parse(sessionStorage.getItem(SESSION_KEY)!);
        expect(session.token).toBe('jwt_token_abc');
    });

    it('returns { success: false } and the error message on a 401 response', async () => {
        mockPost.mockResolvedValueOnce(BACKEND_LOGIN_FAILURE);

        const result = await authService.login({ email: 'wrong@example.com', password: 'badpass' });

        expect(result.success).toBe(false);
        expect(result.message).toBe('Invalid email or password');
        expect(sessionStorage.getItem(SESSION_KEY)).toBeNull();
    });

    it('returns { success: false } without making an HTTP call when email is empty', async () => {
        const result = await authService.login({ email: '', password: 'secret123' });

        expect(result.success).toBe(false);
        expect(result.message).toBe('Email and password are required');
        expect(mockPost).not.toHaveBeenCalled();
    });

    it('returns { success: false } without making an HTTP call when password is empty', async () => {
        const result = await authService.login({ email: 'alice@example.com', password: '' });

        expect(result.success).toBe(false);
        expect(result.message).toBe('Email and password are required');
        expect(mockPost).not.toHaveBeenCalled();
    });
});

// =============================================================================
// getCurrentUser()
// =============================================================================

describe('authService.getCurrentUser()', () => {

    it('returns null when sessionStorage contains no entry', () => {
        expect(authService.getCurrentUser()).toBeNull();
    });

    it('returns the user object from the current { user, token } session shape', () => {
        const session = {
            token: 'jwt_token_abc',
            user:  { email: 'alice@example.com', isAdmin: false, lastLogin: '2026-01-01T00:00:00Z' },
        };
        sessionStorage.setItem(SESSION_KEY, JSON.stringify(session));

        const user = authService.getCurrentUser();

        expect(user).not.toBeNull();
        expect(user!.email).toBe('alice@example.com');
        expect(user!.isAdmin).toBe(false);
    });

    it('falls back to the old flat-user shape for backward compatibility', () => {
        // Old sessions stored the user directly at the top level (no .user wrapper)
        const oldShape = { email: 'legacy@example.com', isAdmin: false, lastLogin: '2025-01-01T00:00:00Z' };
        sessionStorage.setItem(SESSION_KEY, JSON.stringify(oldShape));

        const user = authService.getCurrentUser();

        expect(user).not.toBeNull();
        expect(user!.email).toBe('legacy@example.com');
    });

    it('returns null for corrupt (non-JSON) sessionStorage data', () => {
        sessionStorage.setItem(SESSION_KEY, 'this-is-not-json');

        expect(authService.getCurrentUser()).toBeNull();
    });
});

// =============================================================================
// isAuthenticated()
// =============================================================================

describe('authService.isAuthenticated()', () => {

    it('returns false when there is no active session', () => {
        expect(authService.isAuthenticated()).toBe(false);
    });

    it('returns true when a valid session exists', () => {
        const session = {
            token: 'jwt_token_abc',
            user:  { email: 'alice@example.com', isAdmin: false, lastLogin: '2026-01-01T00:00:00Z' },
        };
        sessionStorage.setItem(SESSION_KEY, JSON.stringify(session));

        expect(authService.isAuthenticated()).toBe(true);
    });
});

// =============================================================================
// logout()
// =============================================================================

const LOGOUT_OK = { ok: true, status: 200, data: null, message: 'Logged out successfully' };

describe('authService.logout()', () => {

    it('calls POST /auth/logout to revoke the token on the backend', async () => {
        mockPost.mockResolvedValueOnce(LOGOUT_OK);
        sessionStorage.setItem(SESSION_KEY, JSON.stringify({
            token: 'jwt_token_abc',
            user:  { email: 'alice@example.com', isAdmin: false, lastLogin: '2026-01-01T00:00:00Z' },
        }));

        await authService.logout();

        expect(mockPost).toHaveBeenCalledWith('/auth/logout', {});
    });

    it('removes the session from sessionStorage after revoking the token', async () => {
        mockPost.mockResolvedValueOnce(LOGOUT_OK);
        sessionStorage.setItem(SESSION_KEY, JSON.stringify({
            token: 'jwt_token_abc',
            user:  { email: 'alice@example.com', isAdmin: false, lastLogin: '2026-01-01T00:00:00Z' },
        }));

        await authService.logout();

        expect(sessionStorage.getItem(SESSION_KEY)).toBeNull();
        expect(authService.getCurrentUser()).toBeNull();
    });

    it('still clears the local session when the backend call fails', async () => {
        mockPost.mockRejectedValueOnce(new Error('Network error'));
        sessionStorage.setItem(SESSION_KEY, JSON.stringify({
            token: 'jwt_token_abc',
            user:  { email: 'alice@example.com', isAdmin: false, lastLogin: '2026-01-01T00:00:00Z' },
        }));

        await authService.logout();

        expect(sessionStorage.getItem(SESSION_KEY)).toBeNull();
        expect(authService.getCurrentUser()).toBeNull();
    });

    it('does not throw when called without an active session', async () => {
        mockPost.mockResolvedValueOnce(LOGOUT_OK);
        await expect(authService.logout()).resolves.toBeUndefined();
        expect(sessionStorage.getItem(SESSION_KEY)).toBeNull();
    });
});

// =============================================================================
// updateSessionUser()
// =============================================================================

describe('authService.updateSessionUser()', () => {

    it('merges partial updates into the user without touching the token', () => {
        const original = {
            token: 'jwt_token_abc',
            user:  { email: 'alice@example.com', isAdmin: false, lastLogin: '2026-01-01T00:00:00Z' },
        };
        sessionStorage.setItem(SESSION_KEY, JSON.stringify(original));

        authService.updateSessionUser({ fullName: 'Alice Smith', department: 'Legal' });

        const updated = JSON.parse(sessionStorage.getItem(SESSION_KEY)!);
        expect(updated.token).toBe('jwt_token_abc');      // token unchanged
        expect(updated.user.email).toBe('alice@example.com');  // existing fields preserved
        expect(updated.user.fullName).toBe('Alice Smith');     // new field added
        expect(updated.user.department).toBe('Legal');         // new field added
    });

    it('does not throw when called without an existing session', () => {
        expect(() => authService.updateSessionUser({ fullName: 'Ghost' })).not.toThrow();
        // sessionStorage still empty
        expect(sessionStorage.getItem(SESSION_KEY)).toBeNull();
    });

    it('overwrites only the provided fields — other user fields are preserved', () => {
        const original = {
            token: 'tok',
            user:  {
                email:       'alice@example.com',
                isAdmin:     false,
                lastLogin:   '2026-01-01T00:00:00Z',
                fullName:    'Old Name',
                department:  'Old Dept',
                organization: 'Old Org',
            },
        };
        sessionStorage.setItem(SESSION_KEY, JSON.stringify(original));

        // Only update fullName
        authService.updateSessionUser({ fullName: 'New Name' });

        const updated = JSON.parse(sessionStorage.getItem(SESSION_KEY)!);
        expect(updated.user.fullName).toBe('New Name');
        expect(updated.user.department).toBe('Old Dept');   // untouched
        expect(updated.user.organization).toBe('Old Org');  // untouched
    });
});

// =============================================================================
// getAllRegisteredUsers()
// =============================================================================

describe('authService.getAllRegisteredUsers()', () => {

    it('returns the list of users from the backend', async () => {
        const users = [
            { email: 'alice@example.com', role: 'USER' },
            { email: 'bob@example.com',   role: 'ADMIN' },
        ];
        mockGet.mockResolvedValueOnce({ ok: true, data: users });

        const result = await authService.getAllRegisteredUsers();

        expect(mockGet).toHaveBeenCalledWith('/users');
        expect(result).toEqual(users);
    });

    it('returns an empty array when the backend call fails', async () => {
        mockGet.mockResolvedValueOnce({ ok: false, data: null, message: 'Server error' });

        const result = await authService.getAllRegisteredUsers();

        expect(result).toEqual([]);
    });

    it('returns an empty array when the network throws', async () => {
        mockGet.mockRejectedValueOnce(new Error('Network timeout'));

        const result = await authService.getAllRegisteredUsers();

        expect(result).toEqual([]);
    });
});
