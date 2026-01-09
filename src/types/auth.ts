export interface User {
    id: string;
    email: string;
    password: string;
    createdAt: string;
    lastLogin: string;
}

export interface LoggedInUser {
    id: string;
    email: string;
    lastLogin: string;
    isAdmin: boolean;
}

export interface LoginCredentials {
    email: string;
    password: string;
}

export interface AuthResponse {
    success: boolean;
    message: string;
    user?: LoggedInUser;
}
