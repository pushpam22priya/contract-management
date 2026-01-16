/**
 * PDF Form Field Definition
 * Stores metadata about form fields created in the template form builder
 */
export interface FormFieldDefinition {
    name: string;              // Field identifier (e.g., "client_name", "contract_date")
    type: 'text' | 'signature' | 'checkbox' | 'radio' | 'dropdown' | 'date';
    x: number;                 // X position on page (in PDF coordinates)
    y: number;                 // Y position on page (in PDF coordinates)
    width: number;             // Field width
    height: number;            // Field height
    pageNumber: number;        // Which page the field is on (1-indexed)
    required: boolean;         // Is this field required to fill?
    placeholder?: string;      // Placeholder text for text fields
    options?: string[];        // Options for dropdown/radio fields
    flags?: FormFieldFlags;    // Additional field properties
    label?: string;            // Human-readable label
}

/**
 * PDF Form Field Flags
 * Additional properties for form fields
 */
export interface FormFieldFlags {
    readOnly?: boolean;        // Field cannot be edited
    multiline?: boolean;       // Text field allows multiple lines
    password?: boolean;        // Text field masks input
    noExport?: boolean;        // Field value not exported
    doNotSpellCheck?: boolean; // Disable spell check
    comb?: boolean;            // Text field with character combs
}

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
    docxBase64?: string; // Original DOCX file as base64
    formFields?: FormFieldDefinition[]; // PDF form fields created in form builder
    hasFormFields?: boolean;   // Quick check if template has form fields
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
