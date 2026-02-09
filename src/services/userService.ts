/**
* User Service
* Handles user-related operations using MongoDB via API
*/
 
export interface User {
    id: string;
    email: string;
    name?: string; // Optional, derived from email if not present
    role?: string; // Optional
}
 
class UserService {
    /**
     * Get all users from MongoDB via API
     * Returns users without passwords for security
     */
    async getAllUsers(): Promise<User[]> {
        try {
            const res = await fetch('/api/users', { cache: 'no-store' });
            if (!res.ok) throw new Error('Failed to fetch users');
 
            const rawUsers = await res.json();
 
            // Transform to User type and add name from email
            return rawUsers.map((user: any) => ({
                id: user.id,
                email: user.email,
                name: user.name || this.extractNameFromEmail(user.email),
                role: user.role || 'User',
            }));
        } catch (error) {
            console.error('Failed to fetch users:', error);
            return [];
        }
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