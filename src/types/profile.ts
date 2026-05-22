// Raw shape returned by GET /profile and PUT /profile
export interface BackendProfileResponse {
    email: string;
    fullName: string | null;
    department: string | null;
    organization: string | null;
    dateOfBirth: string | null;
    gender: 'MALE' | 'FEMALE' | 'OTHER' | null;
    permanentAddress: string | null;
    panCardNumber: string | null;
    aadharCardNumber: string | null;
    profileComplete: boolean;
}

// Request body for PUT /profile — all fields optional (send only what changed)
export interface UpdateProfilePayload {
    fullName?: string;
    department?: string;
    organization?: string;
    dateOfBirth?: string;
    gender?: 'MALE' | 'FEMALE' | 'OTHER';
    permanentAddress?: string;
    panCardNumber?: string;
    aadharCardNumber?: string;
}

