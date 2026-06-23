/**
 * UNIT TESTS — Profile Zod Schema
 * (src/schemas/profileSchema.ts)
 *
 * makeProfileSchema(t) builds the schema; a simple identity translator
 * `t = (key) => key` is used so error messages are the raw translation keys,
 * making assertions stable against future copy changes.
 *
 * Scenarios covered:
 *
 * Valid data
 *  1.  Fully populated valid form passes
 *  2.  All-empty form passes (every field is optional)
 *
 * fullName
 *  3.  Empty string passes (optional field)
 *  4.  Whitespace-only string passes (treated as empty after trim)
 *  5.  Minimum valid name (2 characters) passes
 *  6.  Single character name fails with errorNameMin
 *  7.  Name with exactly 100 characters passes
 *  8.  Name with 101 characters fails with errorNameMax
 *  9.  Name containing digits fails with errorNameChars
 * 10.  Name with apostrophe and hyphen (e.g. "O'Brien-Smith") passes
 * 11.  Name with a dot (e.g. "Dr. Smith") passes
 *
 * department
 * 12.  Non-empty value passes
 * 13.  Empty string passes (optional)
 * 14.  String of 101 characters fails with errorDepartmentMax
 *
 * organization
 * 15.  Non-empty value passes
 * 16.  Empty string passes (optional)
 * 17.  String of 151 characters fails with errorOrganizationMax
 *
 * dateOfBirth
 * 18.  Valid past ISO date string passes
 * 19.  Empty string passes (optional)
 * 20.  Future date fails with errorDobFuture
 * 21.  Non-date string fails with errorDobInvalid
 * 22.  Date more than 120 years ago fails with errorDobInvalid
 *
 * gender
 * 23.  "MALE" passes
 * 24.  "FEMALE" passes
 * 25.  "OTHER" passes
 * 26.  "" (empty) passes
 * 27.  Lowercase "male" fails (not in the enum)
 *
 * permanentAddress
 * 28.  Non-empty value passes
 * 29.  Empty string passes (optional)
 * 30.  String of 501 characters fails with errorAddressMax
 *
 * panCardNumber
 * 31.  Valid PAN "ABCDE1234F" passes
 * 32.  Empty string passes (optional)
 * 33.  Lowercase PAN fails with errorPanFormat
 * 34.  PAN with wrong structure fails with errorPanFormat
 *
 * aadharCardNumber
 * 35.  Exactly 12 digits passes
 * 36.  Empty string passes (optional)
 * 37.  11-digit string fails with errorAadharLength
 * 38.  13-digit string fails with errorAadharLength
 */

import { makeProfileSchema } from '@/schemas/profileSchema';

// ─── Setup ────────────────────────────────────────────────────────────────────
// Identity translator: error messages in tests equal the translation key,
// which keeps tests independent of the actual UI copy.

const t = (key: string) => key;
const schema = makeProfileSchema(t);

// ─── Helpers ──────────────────────────────────────────────────────────────────

const valid = {
    fullName:         'Alice Johnson',
    department:       'Engineering',
    organization:     'Acme Corp',
    dateOfBirth:      '1990-06-15',
    gender:           'FEMALE' as const,
    permanentAddress: '123 Main Street, Bangalore',
    panCardNumber:    'ABCDE1234F',
    aadharCardNumber: '123456789012',
};

const empty = {
    fullName: '', department: '', organization: '', dateOfBirth: '',
    gender: '' as const, permanentAddress: '', panCardNumber: '', aadharCardNumber: '',
};

/** Returns the first error message for the given field, or undefined if valid. */
function errorFor(data: object, field: string): string | undefined {
    const result = schema.safeParse(data);
    if (result.success) return undefined;
    return result.error.issues.find(i => i.path[0] === field)?.message;
}

// =============================================================================
// 1–2. Valid data
// =============================================================================

describe('profileSchema — valid data', () => {

    it('passes for a fully populated valid form', () => {
        expect(schema.safeParse(valid).success).toBe(true);
    });

    it('passes when all fields are empty strings (all fields are optional)', () => {
        expect(schema.safeParse(empty).success).toBe(true);
    });
});

// =============================================================================
// 3–11. fullName
// =============================================================================

describe('profileSchema — fullName', () => {

    it('passes for an empty string (optional field)', () => {
        expect(schema.safeParse({ ...valid, fullName: '' }).success).toBe(true);
    });

    it('passes for a whitespace-only string (treated as empty after trim)', () => {
        expect(schema.safeParse({ ...valid, fullName: '   ' }).success).toBe(true);
    });

    it('passes for a 2-character name (minimum valid length)', () => {
        expect(schema.safeParse({ ...valid, fullName: 'Al' }).success).toBe(true);
    });

    it('fails for a single-character name with errorNameMin', () => {
        expect(errorFor({ ...valid, fullName: 'A' }, 'fullName')).toBe('errorNameMin');
    });

    it('passes for a name of exactly 100 characters', () => {
        expect(schema.safeParse({ ...valid, fullName: 'A'.repeat(100) }).success).toBe(true);
    });

    it('fails for a name of 101 characters with errorNameMax', () => {
        expect(errorFor({ ...valid, fullName: 'A'.repeat(101) }, 'fullName')).toBe('errorNameMax');
    });

    it('fails when name contains digits', () => {
        expect(errorFor({ ...valid, fullName: 'Alice123' }, 'fullName')).toBe('errorNameChars');
    });

    it('passes for a name with apostrophe and hyphen ("O\'Brien-Smith")', () => {
        expect(schema.safeParse({ ...valid, fullName: "O'Brien-Smith" }).success).toBe(true);
    });

    it('passes for a name with a dot ("Dr. Smith")', () => {
        expect(schema.safeParse({ ...valid, fullName: 'Dr. Smith' }).success).toBe(true);
    });
});

// =============================================================================
// 12–14. department
// =============================================================================

describe('profileSchema — department', () => {

    it('passes for a valid non-empty department', () => {
        expect(schema.safeParse({ ...valid, department: 'Engineering' }).success).toBe(true);
    });

    it('passes for an empty string (optional field)', () => {
        expect(schema.safeParse({ ...valid, department: '' }).success).toBe(true);
    });

    it('fails for a string of 101 characters with errorDepartmentMax', () => {
        expect(errorFor({ ...valid, department: 'D'.repeat(101) }, 'department')).toBe('errorDepartmentMax');
    });
});

// =============================================================================
// 15–17. organization
// =============================================================================

describe('profileSchema — organization', () => {

    it('passes for a valid non-empty organization', () => {
        expect(schema.safeParse({ ...valid, organization: 'Acme Corp' }).success).toBe(true);
    });

    it('passes for an empty string (optional field)', () => {
        expect(schema.safeParse({ ...valid, organization: '' }).success).toBe(true);
    });

    it('fails for a string of 151 characters with errorOrganizationMax', () => {
        expect(errorFor({ ...valid, organization: 'O'.repeat(151) }, 'organization')).toBe('errorOrganizationMax');
    });
});

// =============================================================================
// 18–22. dateOfBirth
// =============================================================================

describe('profileSchema — dateOfBirth', () => {

    it('passes for a valid past ISO date string', () => {
        expect(schema.safeParse({ ...valid, dateOfBirth: '1990-06-15' }).success).toBe(true);
    });

    it('passes for an empty string (optional field)', () => {
        expect(schema.safeParse({ ...valid, dateOfBirth: '' }).success).toBe(true);
    });

    it('fails for a future date with errorDobFuture', () => {
        const futureDate = new Date();
        futureDate.setFullYear(futureDate.getFullYear() + 1);
        const futureDateStr = futureDate.toISOString().split('T')[0];

        expect(errorFor({ ...valid, dateOfBirth: futureDateStr }, 'dateOfBirth')).toBe('errorDobFuture');
    });

    it('fails for a non-date string with errorDobInvalid', () => {
        expect(errorFor({ ...valid, dateOfBirth: 'not-a-date' }, 'dateOfBirth')).toBe('errorDobInvalid');
    });

    it('fails for a date more than 120 years ago with errorDobInvalid', () => {
        const oldYear = new Date().getFullYear() - 121;
        expect(errorFor({ ...valid, dateOfBirth: `${oldYear}-01-01` }, 'dateOfBirth')).toBe('errorDobInvalid');
    });
});

// =============================================================================
// 23–27. gender
// =============================================================================

describe('profileSchema — gender', () => {

    it('passes for "MALE"', () => {
        expect(schema.safeParse({ ...valid, gender: 'MALE' }).success).toBe(true);
    });

    it('passes for "FEMALE"', () => {
        expect(schema.safeParse({ ...valid, gender: 'FEMALE' }).success).toBe(true);
    });

    it('passes for "OTHER"', () => {
        expect(schema.safeParse({ ...valid, gender: 'OTHER' }).success).toBe(true);
    });

    it('passes for "" (empty — no gender selected)', () => {
        expect(schema.safeParse({ ...valid, gender: '' }).success).toBe(true);
    });

    it('fails for lowercase "male" (not in the enum)', () => {
        const result = schema.safeParse({ ...valid, gender: 'male' });
        expect(result.success).toBe(false);
    });
});

// =============================================================================
// 28–30. permanentAddress
// =============================================================================

describe('profileSchema — permanentAddress', () => {

    it('passes for a valid address', () => {
        expect(schema.safeParse({ ...valid, permanentAddress: '123 Main Street' }).success).toBe(true);
    });

    it('passes for an empty string (optional field)', () => {
        expect(schema.safeParse({ ...valid, permanentAddress: '' }).success).toBe(true);
    });

    it('fails for a string of 501 characters with errorAddressMax', () => {
        expect(errorFor({ ...valid, permanentAddress: 'A'.repeat(501) }, 'permanentAddress')).toBe('errorAddressMax');
    });
});

// =============================================================================
// 31–34. panCardNumber
// =============================================================================

describe('profileSchema — panCardNumber', () => {

    it('passes for a valid PAN number "ABCDE1234F"', () => {
        expect(schema.safeParse({ ...valid, panCardNumber: 'ABCDE1234F' }).success).toBe(true);
    });

    it('passes for an empty string (optional field)', () => {
        expect(schema.safeParse({ ...valid, panCardNumber: '' }).success).toBe(true);
    });

    it('fails for a lowercase PAN with errorPanFormat', () => {
        expect(errorFor({ ...valid, panCardNumber: 'abcde1234f' }, 'panCardNumber')).toBe('errorPanFormat');
    });

    it('fails for a PAN with wrong structure with errorPanFormat', () => {
        expect(errorFor({ ...valid, panCardNumber: 'ABC123' }, 'panCardNumber')).toBe('errorPanFormat');
    });

    it('fails for a PAN with numbers in the wrong position with errorPanFormat', () => {
        // First 5 must be letters — "12345ABCDF" is invalid
        expect(errorFor({ ...valid, panCardNumber: '12345ABCDF' }, 'panCardNumber')).toBe('errorPanFormat');
    });
});

// =============================================================================
// 35–38. aadharCardNumber
// =============================================================================

describe('profileSchema — aadharCardNumber', () => {

    it('passes for an exactly 12-digit string', () => {
        expect(schema.safeParse({ ...valid, aadharCardNumber: '123456789012' }).success).toBe(true);
    });

    it('passes for an empty string (optional field)', () => {
        expect(schema.safeParse({ ...valid, aadharCardNumber: '' }).success).toBe(true);
    });

    it('fails for an 11-digit string with errorAadharLength', () => {
        expect(errorFor({ ...valid, aadharCardNumber: '12345678901' }, 'aadharCardNumber')).toBe('errorAadharLength');
    });

    it('fails for a 13-digit string with errorAadharLength', () => {
        expect(errorFor({ ...valid, aadharCardNumber: '1234567890123' }, 'aadharCardNumber')).toBe('errorAadharLength');
    });
});
