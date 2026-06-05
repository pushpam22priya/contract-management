import { User, LoggedInUser, LoginCredentials, AuthResponse, StoredSession, BackendLoginResponse } from '@/types/auth';
import { httpClient } from '@/lib/httpClient';

const CURRENT_USER_STORAGE_KEY = 'cms_current_user';

class AuthService {
    private saveSession(user: LoggedInUser, token: string): void {
        if (typeof window === 'undefined') return;
        const session: StoredSession = { user, token };
        sessionStorage.setItem(CURRENT_USER_STORAGE_KEY, JSON.stringify(session));
    }

    getCurrentUser(): LoggedInUser | null {
        if (typeof window === 'undefined') return null;
        const raw = sessionStorage.getItem(CURRENT_USER_STORAGE_KEY);
        if (!raw) return null;
        try {
            const parsed = JSON.parse(raw);
            // Support both old flat shape and new { user, token } shape
            return parsed.user ?? parsed;
        } catch {
            return null;
        }
    }
 
    /**
     * Check if user is authenticated
     */
    isAuthenticated(): boolean {
        return this.getCurrentUser() !== null;
    }
 
    async login(credentials: LoginCredentials): Promise<AuthResponse> {
        if (!credentials.email || !credentials.password) {
            return { success: false, message: 'Email and password are required' };
        }

        const response = await httpClient.post<BackendLoginResponse>(
            '/auth/login',
            { email: credentials.email, password: credentials.password },
            { skipAuth: true }
        );

        if (response.ok && response.data) {
            const { token, email, role } = response.data;
            const user: LoggedInUser = {
                email,
                isAdmin: role === 'ADMIN',
                lastLogin: new Date().toISOString(),
            };
            this.saveSession(user, token);

            // Eagerly cache profile fields so autofill works immediately after
            // login without requiring the user to open the profile dialog first.
            try {
                const profileRes = await httpClient.get<any>('/profile');
                if (profileRes.ok && profileRes.data) {
                    const d = profileRes.data;
                    this.updateSessionUser({
                        fullName:         d.fullName         || '',
                        department:       d.department       || '',
                        organization:     d.organization     || '',
                        dateOfBirth:      d.dateOfBirth      || '',
                        gender:           d.gender           || '',
                        permanentAddress: d.permanentAddress || '',
                        panCardNumber:    d.panCardNumber    || '',
                        aadharCardNumber: d.aadharCardNumber || '',
                    });
                }
            } catch {
                // Profile fetch failure must not block login
            }

            return { success: true, message: 'Login successful', user };
        }

        return { success: false, message: response.message };
    }
 
    /**
     * Logout user
     */
    logout(): void {
        if (typeof window === 'undefined') return;
 
        sessionStorage.removeItem(CURRENT_USER_STORAGE_KEY);
    }
 
    updateSessionUser(updates: Partial<LoggedInUser>): void {
        if (typeof window === 'undefined') return;
        const raw = sessionStorage.getItem(CURRENT_USER_STORAGE_KEY);
        if (!raw) return;
        try {
            const parsed: StoredSession = JSON.parse(raw);
            const updated: StoredSession = { ...parsed, user: { ...parsed.user, ...updates } };
            sessionStorage.setItem(CURRENT_USER_STORAGE_KEY, JSON.stringify(updated));
        } catch {
            // nothing
        }
    }

    /**
     * Get all registered users from MongoDB (without passwords)
     */
    async getAllRegisteredUsers(): Promise<Omit<User, 'password'>[]> {
        try {
            const res = await fetch('/api/users', { cache: 'no-store' });
            if (!res.ok) throw new Error('Failed to fetch users');
            return res.json();
        } catch (error) {
            console.error('Failed to fetch registered users:', error);
            return [];
        }
    }
}
 
// Export singleton instance
export const authService = new AuthService();