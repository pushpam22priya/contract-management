import { z } from 'zod';

export const makeLoginSchema = (t: (key: string) => string) =>
    z.object({
        email: z.string()
            .min(1, { message: t('errorEmailRequired') })
            .email({ message: t('errorEmailInvalid') }),
        password: z.string()
            .min(1, { message: t('errorPasswordRequired') }),
    });

export type LoginForm = z.infer<ReturnType<typeof makeLoginSchema>>;
