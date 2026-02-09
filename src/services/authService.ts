import { User, LoggedInUser, LoginCredentials, AuthResponse } from '@/types/auth';
 
const CURRENT_USER_STORAGE_KEY = 'cms_current_user';
 
class AuthService {
    /**
     * Save logged-in user to sessionStorage
     */
    private saveCurrentUser(user: LoggedInUser): void {
        if (typeof window === 'undefined') return;
 
        sessionStorage.setItem(CURRENT_USER_STORAGE_KEY, JSON.stringify(user));
    }
 
    /**
     * Get current logged-in user from sessionStorage
     */
    getCurrentUser(): LoggedInUser | null {
        if (typeof window === 'undefined') return null;
 
        const userData = sessionStorage.getItem(CURRENT_USER_STORAGE_KEY);
        return userData ? JSON.parse(userData) : null;
    }
 
    /**
     * Check if user is authenticated
     */
    isAuthenticated(): boolean {
        return this.getCurrentUser() !== null;
    }
 
    /**
     * Login user - calls the /api/users endpoint
     * Creates new user if email doesn't exist, validates password if exists
     */
    async login(credentials: LoginCredentials): Promise<AuthResponse> {
        if (!credentials.email || !credentials.password) {
            return {
                success: false,
                message: 'Email and password are required',
            };
        }
 
        try {
            const res = await fetch('/api/users', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    email: credentials.email,
                    password: credentials.password,
                }),
            });
 
            const data = await res.json();
 
            if (data.success && data.user) {
                // Save to sessionStorage
                this.saveCurrentUser(data.user);
            }
 
            return {
                success: data.success,
                message: data.message,
                user: data.user,
            };
        } catch (error) {
            console.error('Login failed:', error);
            return {
                success: false,
                message: 'An unexpected error occurred. Please try again.',
            };
        }
    }
 
    /**
     * Logout user
     */
    logout(): void {
        if (typeof window === 'undefined') return;
 
        sessionStorage.removeItem(CURRENT_USER_STORAGE_KEY);
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