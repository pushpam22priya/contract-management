import { User, LoggedInUser, LoginCredentials, AuthResponse } from '@/types/auth';

const USERS_STORAGE_KEY = 'cms_users';
const CURRENT_USER_STORAGE_KEY = 'cms_current_user';
const ADMIN_EMAIL = 'admin@demo.com';

class AuthService {
    /**
     * Check if email is admin
     */
    private isAdminEmail(email: string): boolean {
        return email.toLowerCase() === ADMIN_EMAIL.toLowerCase();
    }
    /**
     * Get all users from localStorage
     */
    private getAllUsers(): User[] {
        if (typeof window === 'undefined') return [];

        const usersData = localStorage.getItem(USERS_STORAGE_KEY);
        return usersData ? JSON.parse(usersData) : [];
    }

    /**
     * Save all users to localStorage
     */
    private saveAllUsers(users: User[]): void {
        if (typeof window === 'undefined') return;

        localStorage.setItem(USERS_STORAGE_KEY, JSON.stringify(users));
    }

    /**
     * Find user by email
     */
    private findUserByEmail(email: string): User | undefined {
        const users = this.getAllUsers();
        return users.find(user => user.email.toLowerCase() === email.toLowerCase());
    }

    /**
     * Generate unique user ID
     */
    private generateUserId(): string {
        return `user_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    }

    /**
     * Create new user
     */
    private createUser(credentials: LoginCredentials): User {
        const newUser: User = {
            id: this.generateUserId(),
            email: credentials.email,
            password: credentials.password,
            createdAt: new Date().toISOString(),
            lastLogin: new Date().toISOString(),
        };

        const users = this.getAllUsers();
        users.push(newUser);
        this.saveAllUsers(users);

        return newUser;
    }

    /**
     * Update user's last login time
     */
    private updateUserLastLogin(userId: string): void {
        const users = this.getAllUsers();
        const userIndex = users.findIndex(user => user.id === userId);

        if (userIndex !== -1) {
            users[userIndex].lastLogin = new Date().toISOString();
            this.saveAllUsers(users);
        }
    }

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
     * Login user - Create new user if email doesn't exist, validate password if exists
     */
    async login(credentials: LoginCredentials): Promise<AuthResponse> {
        // Simulate API delay
        await new Promise(resolve => setTimeout(resolve, 500));

        if (!credentials.email || !credentials.password) {
            return {
                success: false,
                message: 'Email and password are required',
            };
        }

        // Email validation
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!emailRegex.test(credentials.email)) {
            return {
                success: false,
                message: 'Please enter a valid email address',
            };
        }

        // Password validation (minimum 4 characters for demo purposes)
        if (credentials.password.length < 4) {
            return {
                success: false,
                message: 'Password must be at least 4 characters long',
            };
        }

        const existingUser = this.findUserByEmail(credentials.email);

        if (existingUser) {
            // Existing user - validate password
            if (existingUser.password !== credentials.password) {
                return {
                    success: false,
                    message: 'Incorrect password. Please try again.',
                };
            }

            // Update last login
            this.updateUserLastLogin(existingUser.id);

            // Create logged-in user object (without password)
            const loggedInUser: LoggedInUser = {
                id: existingUser.id,
                email: existingUser.email,
                lastLogin: new Date().toISOString(),
                isAdmin: this.isAdminEmail(existingUser.email),
            };

            // Save to sessionStorage
            this.saveCurrentUser(loggedInUser);

            return {
                success: true,
                message: 'Welcome back! Login successful.',
                user: loggedInUser,
            };
        } else {
            // New user - create account
            const newUser = this.createUser(credentials);

            // Create logged-in user object (without password)
            const loggedInUser: LoggedInUser = {
                id: newUser.id,
                email: newUser.email,
                lastLogin: newUser.lastLogin,
                isAdmin: this.isAdminEmail(newUser.email),
            };

            // Save to sessionStorage
            this.saveCurrentUser(loggedInUser);

            return {
                success: true,
                message: 'Account created successfully! Welcome aboard.',
                user: loggedInUser,
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
     * Get all registered users (for admin/debug purposes)
     */
    getAllRegisteredUsers(): Omit<User, 'password'>[] {
        const users = this.getAllUsers();
        return users.map(({ password, ...user }) => user);
    }

    /**
     * Clear all users (for testing/reset purposes)
     */
    clearAllUsers(): void {
        if (typeof window === 'undefined') return;

        localStorage.removeItem(USERS_STORAGE_KEY);
        sessionStorage.removeItem(CURRENT_USER_STORAGE_KEY);
    }
}

// Export singleton instance
export const authService = new AuthService();
