export interface Contract {
    // Card display fields (from Step 2 - Basic Information)
    id: string;
    title: string;
    description: string;
    client: string;
    value: string;
    category: string;
    expiresInDays: number;
    status: 'active' | 'expiring' | 'expired' | 'review_approval' | 'draft';

    // Template info
    templateId: string;
    templateName: string;

    // Template DOCX for regeneration
    templateDocxBase64?: string;
    templateFileName?: string;

    // Contract content (for PDF viewer - includes Step 3 dynamic fields)
    content: string;              // Populated template content
    fieldValues: Record<string, string>;  // The values user filled in Step 3

    // Dates
    startDate?: string;
    endDate?: string;

    // Metadata
    createdAt: string;
    createdBy: string;
    updatedAt?: string;
}