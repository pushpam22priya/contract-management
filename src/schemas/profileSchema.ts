import { z } from 'zod';

export const makeProfileSchema = (t: (key: string) => string) =>
    z.object({
        fullName: z.string()
            .max(100, { message: t('errorNameMax') })
            .refine(v => !v.trim() || v.trim().length >= 2, { message: t('errorNameMin') })
            .refine(v => !v.trim() || /^[a-zA-Z\s.\-']+$/.test(v.trim()), { message: t('errorNameChars') }),
        department: z.string()
            .max(100, { message: t('errorDepartmentMax') }),
        organization: z.string()
            .max(150, { message: t('errorOrganizationMax') }),
        dateOfBirth: z.string()
            .refine(v => !v || !isNaN(new Date(v).getTime()), { message: t('errorDobInvalid') })
            .refine(v => {
                if (!v) return true;
                const today = new Date(); today.setHours(0, 0, 0, 0);
                return new Date(v) <= today;
            }, { message: t('errorDobFuture') })
            .refine(v => {
                if (!v) return true;
                return new Date().getFullYear() - new Date(v).getFullYear() <= 120;
            }, { message: t('errorDobInvalid') }),
        gender: z.enum(['MALE', 'FEMALE', 'OTHER', '']),
        permanentAddress: z.string()
            .max(500, { message: t('errorAddressMax') }),
        panCardNumber: z.string()
            .refine(v => !v || /^[A-Z]{5}[0-9]{4}[A-Z]{1}$/.test(v), { message: t('errorPanFormat') }),
        aadharCardNumber: z.string()
            .refine(v => !v || v.length === 12, { message: t('errorAadharLength') }),
    });

export type ProfileForm = z.infer<ReturnType<typeof makeProfileSchema>>;
