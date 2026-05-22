import { httpClient } from '@/lib/httpClient';
import { BackendProfileResponse, UpdateProfilePayload } from '@/types/profile';
import { ProfileForm } from '@/schemas/profileSchema';
import { authService } from '@/services/authService';

class ProfileService {
    async getProfile(): Promise<{ success: boolean; data?: ProfileForm; message: string }> {
        const response = await httpClient.get<BackendProfileResponse>('/profile');

        if (response.ok && response.data) {
            const d = response.data;
            const data: ProfileForm = {
                fullName:         d.fullName         ?? '',
                department:       d.department       ?? '',
                organization:     d.organization     ?? '',
                dateOfBirth:      d.dateOfBirth      ?? '',
                gender:           d.gender           ?? '',
                permanentAddress: d.permanentAddress ?? '',
                panCardNumber:    d.panCardNumber    ?? '',
                aadharCardNumber: d.aadharCardNumber ?? '',
            };
            return { success: true, data, message: response.message };
        }

        return { success: false, message: response.message };
    }

    async updateProfile(form: ProfileForm): Promise<{ success: boolean; message: string }> {
        const body: UpdateProfilePayload = {
            ...(form.fullName         && { fullName:         form.fullName }),
            ...(form.department       && { department:       form.department }),
            ...(form.organization     && { organization:     form.organization }),
            ...(form.dateOfBirth      && { dateOfBirth:      form.dateOfBirth }),
            ...(form.gender           && { gender:           form.gender as 'MALE' | 'FEMALE' | 'OTHER' }),
            ...(form.permanentAddress && { permanentAddress: form.permanentAddress }),
            ...(form.panCardNumber    && { panCardNumber:    form.panCardNumber }),
            ...(form.aadharCardNumber && { aadharCardNumber: form.aadharCardNumber }),
        };

        const response = await httpClient.put<BackendProfileResponse>('/profile', body);

        if (response.ok) {
            authService.updateSessionUser({
                fullName:         form.fullName,
                department:       form.department,
                organization:     form.organization,
                dateOfBirth:      form.dateOfBirth,
                gender:           form.gender,
                permanentAddress: form.permanentAddress,
                panCardNumber:    form.panCardNumber,
                aadharCardNumber: form.aadharCardNumber,
            });
            return { success: true, message: response.message || 'Profile updated successfully' };
        }

        return { success: false, message: response.message };
    }
}

export const profileService = new ProfileService();
