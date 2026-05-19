import { z } from 'zod';

export const contractStep1Schema = z.object({
    contractTitle: z.string()
        .min(1, 'Contract title is required')
        .max(50, 'Contract title must be 50 characters or less'),
    clientName: z.string()
        .min(1, 'Client name is required')
        .max(50, 'Client name must be 50 characters or less'),
    description: z.string()
        .max(500, 'Description must be 500 characters or less'),
});

export type ContractStep1Form = z.infer<typeof contractStep1Schema>;

export const renewContractSchema = z.object({
    notes: z.string()
        .max(300, 'Notes must be 300 characters or less'),
});

export type RenewContractForm = z.infer<typeof renewContractSchema>;
