import { z } from 'zod';

export const templateStep1Schema = z.object({
    templateName: z.string()
        .min(1, 'Please enter a template name')
        .max(50, 'Template name must be 50 characters or less'),
    description: z.string()
        .max(200, 'Description must be 200 characters or less'),
    category: z.string()
        .min(1, 'Please select a category'),
});

export type TemplateStep1Form = z.infer<typeof templateStep1Schema>;
