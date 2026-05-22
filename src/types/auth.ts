export interface User {
    id: string;
    email: string;
    password: string;
    createdAt: string;
    lastLogin: string;
}

export interface LoggedInUser {
    id?: string;
    email: string;
    lastLogin: string;
    isAdmin: boolean;
    fullName?: string;
    department?: string;
    organization?: string;
    dateOfBirth?: string;
    gender?: string;
    permanentAddress?: string;
    panCardNumber?: string;
    aadharCardNumber?: string;
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

// Shape stored in sessionStorage under cms_current_user
export interface StoredSession {
    token: string;
    user: LoggedInUser;
}

// Raw response from POST /auth/login on the backend
export interface BackendLoginResponse {
    token: string;
    email: string;
    role: string;
    newUser: boolean;
}
