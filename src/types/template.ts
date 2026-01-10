export interface Template {
    id: string;
    name: string;
    description?: string;
    category: string;
    fileName: string;
    fileUrl: string;
    fileType: 'pdf' | 'docx' | 'doc';
    timesUsed: number;
    lastUsed: string;
    uploadedBy: string;
    uploadedAt: string;
    content?: string; // The actual text content of the template
    docxBase64?: string; // ← ADD THIS: Original DOCX file as base64
}

export interface Category {
    id: string;
    name: string;
    createdAt: string;
    createdBy: string;
}

export interface UploadTemplateData {
    name: string;
    description?: string;
    category: string;
    file: File;
}

export interface CreateCategoryData {
    name: string;
}
