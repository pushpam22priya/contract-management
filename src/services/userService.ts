import { authService } from './authService';

/**
 * User Service
 * Handles user-related operations using real users from localStorage
 */

export interface User {
    id: string;
    email: string;
    name?: string; // Optional, derived from email if not present
    role?: string; // Optional
}

const USERS_STORAGE_KEY = 'cms_users';

class UserService {
    /**
     * Get all users from localStorage (via authService)
     * Returns users without passwords for security
     */
    async getAllUsers(): Promise<User[]> {
        // Simulate API delay
        await new Promise(resolve => setTimeout(resolve, 300));

        if (typeof window === 'undefined') return [];

        // Get users from localStorage
        const usersData = localStorage.getItem(USERS_STORAGE_KEY);
        if (!usersData) return [];

        const rawUsers = JSON.parse(usersData);

        // Transform to User type without password and add name from email
        return rawUsers.map((user: any) => ({
            id: user.id,
            email: user.email,
            name: this.extractNameFromEmail(user.email),
            role: user.role || 'User',
        }));
    }

    /**
     * Extract name from email
     * e.g., "john.doe@company.com" => "John Doe"
     */
    private extractNameFromEmail(email: string): string {
        const localPart = email.split('@')[0];
        const nameParts = localPart.split(/[._-]/);
        return nameParts
            .map(part => part.charAt(0).toUpperCase() + part.slice(1))
            .join(' ');
    }

    /**
     * Search users by email or name
     */
    async searchUsers(query: string): Promise<User[]> {
        await new Promise(resolve => setTimeout(resolve, 200));

        const allUsers = await this.getAllUsers();
        const lowercaseQuery = query.toLowerCase();

        return allUsers.filter(user =>
            user.email.toLowerCase().includes(lowercaseQuery) ||
            (user.name && user.name.toLowerCase().includes(lowercaseQuery))
        );
    }

    /**
     * Get user by email
     */
    async getUserByEmail(email: string): Promise<User | undefined> {
        const allUsers = await this.getAllUsers();
        return allUsers.find(user => user.email === email);
    }
}

// Export singleton instance
export const userService = new UserService();
