/**
 * UNIT TESTS — profileKeyOptions utilities
 * (src/utils/profileKeyOptions.ts)
 *
 * Pure functions — no mocks required.
 *
 * Scenarios covered:
 *
 * getProfileKeyOptions(user?)
 *  1.  Returns an array of 9 profile key options
 *  2.  Every option has a non-empty string "value" and "label"
 *  3.  Includes "fullName" option with label "Full Name"
 *  4.  Includes "email" option with label "Email"
 *  5.  Includes all 9 expected keys
 *  6.  Returns the same list regardless of the user argument (parameter is unused)
 *  7.  Returns the same list when called with no argument (undefined user)
 *
 * buildProfileData(user)
 *  8.  Returns a record containing all 9 profile keys
 *  9.  Maps user field values to their string representation
 * 10.  Trims leading and trailing whitespace from values
 * 11.  Maps undefined user fields to empty strings
 * 12.  Maps null user field values to empty strings
 * 13.  Includes DATE_TODAY_KEY in the returned record
 * 14.  DATE_TODAY_KEY value matches DD/MM/YYYY format with today's date
 * 15.  DATE_TODAY_KEY value has correct day, month, and year for today
 */

import {
    getProfileKeyOptions,
    buildProfileData,
    DATE_TODAY_KEY,
    type ProfileKeyOption,
} from '@/utils/profileKeyOptions';
import type { LoggedInUser } from '@/types/auth';

// ─── Fixtures ─────────────────────────────────────────────────────────────────

const FULL_USER: LoggedInUser = {
    email:            'alice@example.com',
    isAdmin:          false,
    lastLogin:        '2026-06-22T10:00:00Z',
    fullName:         'Alice Johnson',
    department:       'Engineering',
    organization:     'Acme Corp',
    dateOfBirth:      '1990-06-15',
    gender:           'FEMALE',
    permanentAddress: '123 Main Street',
    panCardNumber:    'ABCDE1234F',
    aadharCardNumber: '123456789012',
};

const EMPTY_USER: LoggedInUser = {
    email:     'bob@example.com',
    isAdmin:   false,
    lastLogin: '2026-06-22T10:00:00Z',
    // All optional profile fields absent
};

const EXPECTED_KEYS = [
    'fullName', 'email', 'department', 'organization',
    'dateOfBirth', 'gender', 'permanentAddress', 'panCardNumber', 'aadharCardNumber',
];

// =============================================================================
// getProfileKeyOptions()
// =============================================================================

describe('getProfileKeyOptions()', () => {

    it('returns an array of exactly 9 profile key options', () => {
        const options = getProfileKeyOptions(FULL_USER);
        expect(options).toHaveLength(9);
    });

    it('returns options where every item has a non-empty string value and label', () => {
        const options = getProfileKeyOptions(FULL_USER);
        options.forEach((opt: ProfileKeyOption) => {
            expect(typeof opt.value).toBe('string');
            expect(opt.value.length).toBeGreaterThan(0);
            expect(typeof opt.label).toBe('string');
            expect(opt.label.length).toBeGreaterThan(0);
        });
    });

    it('includes "fullName" with label "Full Name"', () => {
        const options = getProfileKeyOptions(FULL_USER);
        const found = options.find((o: ProfileKeyOption) => o.value === 'fullName');
        expect(found).toBeDefined();
        expect(found?.label).toBe('Full Name');
    });

    it('includes "email" with label "Email"', () => {
        const options = getProfileKeyOptions(FULL_USER);
        const found = options.find((o: ProfileKeyOption) => o.value === 'email');
        expect(found).toBeDefined();
        expect(found?.label).toBe('Email');
    });

    it('returns all 9 expected keys', () => {
        const values = getProfileKeyOptions(FULL_USER).map((o: ProfileKeyOption) => o.value);
        EXPECTED_KEYS.forEach(key => {
            expect(values).toContain(key);
        });
    });

    it('returns the same list regardless of the user argument', () => {
        const withUser    = getProfileKeyOptions(FULL_USER);
        const withoutUser = getProfileKeyOptions(EMPTY_USER);
        expect(withUser).toEqual(withoutUser);
    });

    it('returns the same list when called with no argument (undefined)', () => {
        const withUser    = getProfileKeyOptions(FULL_USER);
        const withUndefined = getProfileKeyOptions(undefined);
        expect(withUser).toEqual(withUndefined);
    });
});

// =============================================================================
// buildProfileData()
// =============================================================================

describe('buildProfileData()', () => {

    it('returns a record containing all 9 profile keys', () => {
        const data = buildProfileData(FULL_USER);
        EXPECTED_KEYS.forEach(key => {
            expect(data).toHaveProperty(key);
        });
    });

    it('maps user field values to their string representation', () => {
        const data = buildProfileData(FULL_USER);
        expect(data.fullName).toBe('Alice Johnson');
        expect(data.email).toBe('alice@example.com');
        expect(data.department).toBe('Engineering');
        expect(data.organization).toBe('Acme Corp');
        expect(data.panCardNumber).toBe('ABCDE1234F');
        expect(data.aadharCardNumber).toBe('123456789012');
    });

    it('trims leading and trailing whitespace from values', () => {
        const paddedUser: LoggedInUser = {
            ...FULL_USER,
            fullName:   '  Alice Johnson  ',
            department: '\tEngineering\t',
        };
        const data = buildProfileData(paddedUser);
        expect(data.fullName).toBe('Alice Johnson');
        expect(data.department).toBe('Engineering');
    });

    it('maps undefined profile fields to empty strings', () => {
        const data = buildProfileData(EMPTY_USER);
        expect(data.fullName).toBe('');
        expect(data.department).toBe('');
        expect(data.organization).toBe('');
        expect(data.dateOfBirth).toBe('');
        expect(data.gender).toBe('');
        expect(data.permanentAddress).toBe('');
        expect(data.panCardNumber).toBe('');
        expect(data.aadharCardNumber).toBe('');
    });

    it('maps explicit null values to empty strings', () => {
        const nullUser = {
            ...FULL_USER,
            fullName: null as any,
            department: null as any,
        };
        const data = buildProfileData(nullUser);
        expect(data.fullName).toBe('');
        expect(data.department).toBe('');
    });

    it('includes the DATE_TODAY_KEY in the returned record', () => {
        const data = buildProfileData(FULL_USER);
        expect(data).toHaveProperty(DATE_TODAY_KEY);
    });

    it('DATE_TODAY_KEY value matches DD/MM/YYYY format', () => {
        const data = buildProfileData(FULL_USER);
        expect(data[DATE_TODAY_KEY]).toMatch(/^\d{2}\/\d{2}\/\d{4}$/);
    });

    it('DATE_TODAY_KEY value is today\'s date in DD/MM/YYYY', () => {
        const data = buildProfileData(FULL_USER);
        const now = new Date();
        const pad = (n: number) => String(n).padStart(2, '0');
        const expected = `${pad(now.getDate())}/${pad(now.getMonth() + 1)}/${now.getFullYear()}`;
        expect(data[DATE_TODAY_KEY]).toBe(expected);
    });
});
