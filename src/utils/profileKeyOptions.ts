import { LoggedInUser } from '@/types/auth';

// Reserved key used to map a form field to the current date at autofill time.
// Never shown in the profile-key dropdown; handled separately in ProfileFieldMappingDialog.
export const DATE_TODAY_KEY = '__date_today__';

// Human-readable labels for known profile keys.
// When a new field is added to LoggedInUser, add its label here too.
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


export interface ProfileKeyOption {
    value: string; // the actual key name in LoggedInUser, e.g. 'name', 'department'
    label: string; // display label shown in the dropdown, e.g. 'Full Name'
}

/**
 * Returns the full list of mappable profile keys, derived from PROFILE_KEY_LABELS.
 * Always returns all known keys so the mapping dropdown is complete regardless of
 * whether the current user has filled in every profile field.
 */
export function getProfileKeyOptions(_user?: LoggedInUser): ProfileKeyOption[] {
    return Object.entries(PROFILE_KEY_LABELS).map(([value, label]) => ({ value, label }));
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
    // Inject today's date so fields mapped to DATE_TODAY_KEY are filled at autofill time
    const d = new Date();
    const pad = (n: number) => String(n).padStart(2, '0');
    data[DATE_TODAY_KEY] = `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()}`;
    return data;
}
