import { LoggedInUser } from '@/types/auth';

// Keys that belong to the system/auth layer and must never appear in the profile mapping dropdown
const PROFILE_SYSTEM_KEYS = new Set(['id', 'lastLogin', 'isAdmin', 'password']);

// Human-readable labels for known profile keys.
// Any key NOT listed here gets auto-formatted via formatKey() as a fallback.
// When a new field is added to LoggedInUser, add its label here for a nicer display.
const PROFILE_KEY_LABELS: Record<string, string> = {
    name: 'Full Name',
    email: 'Email',
    department: 'Department',
    organization: 'Organization',
    dateOfBirth: 'Date of Birth',
    gender: 'Gender',
    permanentAddress: 'Permanent Address',
    panCard: 'PAN Card Number',
    aadharCard: 'Aadhar Card Number',
};

// Converts a camelCase or snake_case key to "Title Case"
// e.g. "phoneNumber" → "Phone Number", "job_title" → "Job Title"
function formatKey(key: string): string {
    return key
        .replace(/_/g, ' ')
        .replace(/([A-Z])/g, ' $1')
        .replace(/^./, s => s.toUpperCase())
        .trim();
}

export interface ProfileKeyOption {
    value: string; // the actual key name in LoggedInUser, e.g. 'name', 'department'
    label: string; // display label shown in the dropdown, e.g. 'Full Name'
}

/**
 * Derives the list of mappable profile keys from the actual LoggedInUser object.
 * Excludes system/internal keys automatically via PROFILE_SYSTEM_KEYS.
 * Returns only keys that exist on the user object (so undefined optional fields are excluded).
 */
export function getProfileKeyOptions(user: LoggedInUser): ProfileKeyOption[] {
    return Object.keys(user)
        .filter(k => !PROFILE_SYSTEM_KEYS.has(k))
        .map(k => ({
            value: k,
            label: PROFILE_KEY_LABELS[k] ?? formatKey(k),
        }));
}

/**
 * Builds a flat Record<string, string> of profile data for use in autofillFields().
 * Only includes non-system keys from the user object, trimmed.
 * Empty/undefined values are included as empty strings (callers skip them).
 */
export function buildProfileData(user: LoggedInUser): Record<string, string> {
    const options = getProfileKeyOptions(user);
    const data: Record<string, string> = {};
    options.forEach(opt => {
        const raw = (user as unknown as Record<string, unknown>)[opt.value];
        data[opt.value] = raw != null ? String(raw).trim() : '';
    });
    return data;
}
