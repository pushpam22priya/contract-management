/**
 * UNIT TESTS — ProfileService
 * (src/services/profileService.ts)
 *
 * httpClient and authService are mocked at the module boundary.
 *
 * Scenarios covered:
 *
 * getProfile()
 *  1.  Returns { success: true, data: ProfileForm } on a successful GET /profile
 *  2.  Maps all backend null fields to empty strings in the returned ProfileForm
 *  3.  Calls GET /profile (correct endpoint)
 *  4.  Returns { success: false, message } when the response is not ok
 *  5.  Returns { success: false } when response.data is null even if ok=true
 *
 * updateProfile(form)
 *  6.  Calls PUT /profile with only the non-empty fields (empty fields are omitted)
 *  7.  Does NOT include empty-string fields in the PUT body
 *  8.  Returns { success: true, message } on a successful PUT
 *  9.  Uses "Profile updated successfully" fallback when response.message is empty
 * 10.  Calls authService.updateSessionUser with the complete form after success
 * 11.  Passes ALL form fields (including empty ones) to updateSessionUser
 * 12.  Returns { success: false, message } when PUT is not ok
 * 13.  Does NOT call authService.updateSessionUser when the response is not ok
 */

// ─── httpClient mock ──────────────────────────────────────────────────────────

const mockGet = jest.fn();
const mockPut = jest.fn();

jest.mock('@/lib/httpClient', () => ({
    httpClient: {
        get: (...args: any[]) => mockGet(...args),
        put: (...args: any[]) => mockPut(...args),
    },
}));

// ─── authService mock ─────────────────────────────────────────────────────────

const mockUpdateSessionUser = jest.fn();

jest.mock('@/services/authService', () => ({
    authService: {
        updateSessionUser: (...args: any[]) => mockUpdateSessionUser(...args),
    },
}));

import { profileService } from '@/services/profileService';
import type { BackendProfileResponse } from '@/types/profile';

// ─── Fixtures ─────────────────────────────────────────────────────────────────

const BACKEND_PROFILE: BackendProfileResponse = {
    email:            'alice@example.com',
    fullName:         'Alice Johnson',
    department:       'Engineering',
    organization:     'Acme Corp',
    dateOfBirth:      '1990-06-15',
    gender:           'FEMALE',
    permanentAddress: '123 Main St',
    panCardNumber:    'ABCDE1234F',
    aadharCardNumber: '123456789012',
    profileComplete:  true,
};

const FULL_FORM = {
    fullName:         'Alice Johnson',
    department:       'Engineering',
    organization:     'Acme Corp',
    dateOfBirth:      '1990-06-15',
    gender:           'FEMALE',
    permanentAddress: '123 Main St',
    panCardNumber:    'ABCDE1234F',
    aadharCardNumber: '123456789012',
};

const ok   = (data: any, message = 'Success')           => ({ ok: true,  data, status: 200, message });
const fail = (status: number, message = 'Server error') => ({ ok: false, data: null, status, message });

// ─────────────────────────────────────────────────────────────────────────────

beforeEach(() => jest.clearAllMocks());

// =============================================================================
// getProfile()
// =============================================================================

describe('profileService.getProfile()', () => {

    it('calls GET /profile', async () => {
        mockGet.mockResolvedValueOnce(ok(BACKEND_PROFILE));

        await profileService.getProfile();

        expect(mockGet).toHaveBeenCalledWith('/profile');
    });

    it('returns { success: true, data } with all backend fields mapped to a ProfileForm', async () => {
        mockGet.mockResolvedValueOnce(ok(BACKEND_PROFILE));

        const result = await profileService.getProfile();

        expect(result.success).toBe(true);
        expect(result.data).toEqual(FULL_FORM);
    });

    it('maps null backend fields to empty strings in the returned ProfileForm', async () => {
        const nullProfile: BackendProfileResponse = {
            email:            'bob@example.com',
            fullName:         null,
            department:       null,
            organization:     null,
            dateOfBirth:      null,
            gender:           null,
            permanentAddress: null,
            panCardNumber:    null,
            aadharCardNumber: null,
            profileComplete:  false,
        };
        mockGet.mockResolvedValueOnce(ok(nullProfile));

        const result = await profileService.getProfile();

        expect(result.success).toBe(true);
        expect(result.data).toEqual({
            fullName:         '',
            department:       '',
            organization:     '',
            dateOfBirth:      '',
            gender:           '',
            permanentAddress: '',
            panCardNumber:    '',
            aadharCardNumber: '',
        });
    });

    it('returns { success: false, message } when the response is not ok', async () => {
        mockGet.mockResolvedValueOnce(fail(401, 'Unauthorized'));

        const result = await profileService.getProfile();

        expect(result.success).toBe(false);
        expect(result.message).toBe('Unauthorized');
        expect(result.data).toBeUndefined();
    });

    it('returns { success: false } when response.data is null even if ok=true', async () => {
        mockGet.mockResolvedValueOnce(ok(null));

        const result = await profileService.getProfile();

        expect(result.success).toBe(false);
    });
});

// =============================================================================
// updateProfile()
// =============================================================================

describe('profileService.updateProfile()', () => {

    it('calls PUT /profile with only the non-empty form fields', async () => {
        mockPut.mockResolvedValueOnce(ok(BACKEND_PROFILE));

        const partialForm = {
            fullName:         'Bob Smith',
            department:       '',     // empty → omitted from body
            organization:     '',     // empty → omitted from body
            dateOfBirth:      '',
            gender:           '',
            permanentAddress: '',
            panCardNumber:    '',
            aadharCardNumber: '',
        };

        await profileService.updateProfile(partialForm);

        expect(mockPut).toHaveBeenCalledWith('/profile', { fullName: 'Bob Smith' });
    });

    it('sends all fields when the full form is populated', async () => {
        mockPut.mockResolvedValueOnce(ok(BACKEND_PROFILE));

        await profileService.updateProfile(FULL_FORM);

        expect(mockPut).toHaveBeenCalledWith('/profile', {
            fullName:         'Alice Johnson',
            department:       'Engineering',
            organization:     'Acme Corp',
            dateOfBirth:      '1990-06-15',
            gender:           'FEMALE',
            permanentAddress: '123 Main St',
            panCardNumber:    'ABCDE1234F',
            aadharCardNumber: '123456789012',
        });
    });

    it('sends an empty body object when all form fields are empty', async () => {
        mockPut.mockResolvedValueOnce(ok(BACKEND_PROFILE));

        const emptyForm = {
            fullName: '', department: '', organization: '', dateOfBirth: '',
            gender: '', permanentAddress: '', panCardNumber: '', aadharCardNumber: '',
        };

        await profileService.updateProfile(emptyForm);

        expect(mockPut).toHaveBeenCalledWith('/profile', {});
    });

    it('returns { success: true, message } on a successful PUT', async () => {
        mockPut.mockResolvedValueOnce(ok(BACKEND_PROFILE, 'Profile updated'));

        const result = await profileService.updateProfile(FULL_FORM);

        expect(result).toEqual({ success: true, message: 'Profile updated' });
    });

    it('uses "Profile updated successfully" fallback when response.message is empty', async () => {
        mockPut.mockResolvedValueOnce(ok(BACKEND_PROFILE, ''));

        const result = await profileService.updateProfile(FULL_FORM);

        expect(result).toEqual({ success: true, message: 'Profile updated successfully' });
    });

    it('calls authService.updateSessionUser with the complete form after success', async () => {
        mockPut.mockResolvedValueOnce(ok(BACKEND_PROFILE));

        await profileService.updateProfile(FULL_FORM);

        expect(mockUpdateSessionUser).toHaveBeenCalledTimes(1);
        expect(mockUpdateSessionUser).toHaveBeenCalledWith({
            fullName:         'Alice Johnson',
            department:       'Engineering',
            organization:     'Acme Corp',
            dateOfBirth:      '1990-06-15',
            gender:           'FEMALE',
            permanentAddress: '123 Main St',
            panCardNumber:    'ABCDE1234F',
            aadharCardNumber: '123456789012',
        });
    });

    it('passes ALL form fields to updateSessionUser — including empty ones', async () => {
        mockPut.mockResolvedValueOnce(ok(BACKEND_PROFILE));

        const partialForm = {
            fullName: 'Bob', department: '', organization: '', dateOfBirth: '',
            gender: '', permanentAddress: '', panCardNumber: '', aadharCardNumber: '',
        };

        await profileService.updateProfile(partialForm);

        // updateSessionUser receives the full form, not just the non-empty fields
        expect(mockUpdateSessionUser).toHaveBeenCalledWith({
            fullName: 'Bob', department: '', organization: '', dateOfBirth: '',
            gender: '', permanentAddress: '', panCardNumber: '', aadharCardNumber: '',
        });
    });

    it('returns { success: false, message } when the PUT response is not ok', async () => {
        mockPut.mockResolvedValueOnce(fail(400, 'Validation failed'));

        const result = await profileService.updateProfile(FULL_FORM);

        expect(result).toEqual({ success: false, message: 'Validation failed' });
    });

    it('does NOT call authService.updateSessionUser when the response is not ok', async () => {
        mockPut.mockResolvedValueOnce(fail(500, 'Server error'));

        await profileService.updateProfile(FULL_FORM);

        expect(mockUpdateSessionUser).not.toHaveBeenCalled();
    });
});
