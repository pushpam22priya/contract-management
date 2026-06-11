import { httpClient } from '@/lib/httpClient';

export interface User {
    id: string;
    email: string;
    name?: string;
    role?: string;
}

class UserService {
    /**
     * Get all users from Spring Boot backend.
     */
    async getAllUsers(): Promise<User[]> {
        try {
            const response = await httpClient.get<any[]>('/users');
            if (!response.ok || !Array.isArray(response.data)) {
                console.error('[UserService] getAllUsers ✗', response.status, response.message);
                return [];
            }
            return response.data.map((user: any) => ({
                id: user.id || user._id,
                email: user.email,
                name: user.name || this.extractNameFromEmail(user.email),
                role: user.role || 'User',
            }));
        } catch (error) {
            console.error('Failed to fetch users:', error);
            return [];
        }
    }

    private extractNameFromEmail(email: string): string {
        const localPart = email.split('@')[0];
        const nameParts = localPart.split(/[._-]/);
        return nameParts
            .map(part => part.charAt(0).toUpperCase() + part.slice(1))
            .join(' ');
    }

    async searchUsers(query: string): Promise<User[]> {
        const allUsers = await this.getAllUsers();
        const lowercaseQuery = query.toLowerCase();
        return allUsers.filter(user =>
            user.email.toLowerCase().includes(lowercaseQuery) ||
            (user.name && user.name.toLowerCase().includes(lowercaseQuery))
        );
    }

    async getUserByEmail(email: string): Promise<User | undefined> {
        const allUsers = await this.getAllUsers();
        return allUsers.find(user => user.email === email);
    }
}

export const userService = new UserService();
