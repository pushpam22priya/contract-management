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
    annotationId?: string;     // Unique annotation ID for tracking updates

    // Widget Flags (Apryse standard properties)
    required: boolean;         // Is this field required to fill?
    readOnly?: boolean;        // Field cannot be edited
    lockedBy?: 'contractor' | 'client';  // Who locked this field (for field-level locking)
    multiline?: boolean;       // Text field allows multiple lines (text fields only)
    doNotScroll?: boolean;     // Do not scroll text (text fields only)
    doNotSpellCheck?: boolean; // Disable spell check (text fields only)

    // Value properties (Phase 2)
    defaultValue?: string;     // Default value to pre-fill field
    placeholder?: string;      // Placeholder text for text fields

    // Appearance properties (Phase 2)
    appearance?: string;       // Base64 image for signature placeholder

    // Other properties
    options?: string[];        // Options for dropdown/radio fields
    label?: string;            // Human-readable label

    // Multi-party assignment (Phase 3)
    assignedParty?: string;    // Party ID: "party_1", "party_2", etc. or "unassigned"
    partyLabel?: string;       // Human-readable party label: "Buyer", "Seller", "Witness"

    // Autofill mapping (Phase 4)
    // The LoggedInUser key whose value should autofill this field (e.g. 'name', 'department').
    // string (not a literal union) so future profile fields work without a type change here.
    profileKey?: string | null;
}

/**
 * Party Configuration
 * Defines a party that can be assigned to fill specific fields
 */
export interface PartyConfiguration {
    id: string;                // Unique party ID: "party_1", "party_2", etc.
    label: string;             // Human-readable label: "Buyer", "Seller", "Witness"
    color: string;             // Hex color for visual distinction: "#4CAF50"
    order: number;             // Signing order (1 = first to sign, 2 = second, etc.)
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
    createdAt: string;           // ISO date string
    fileData?: string;           // Base64-encoded PDF data
    xfdfData?: string;           // XFDF annotation data (form fields, widgets)
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

    // Multi-party configuration
    parties?: PartyConfiguration[];  // Defined parties for this template

    // Set client-side after migration: true = binary lives in MinIO, use getTemplateViewUrl()
    fileUploaded?: boolean;
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
    file: File | Blob;
    // Optional fields for pre-processed data
    fileName: string;
    xfdfData?: string;
    formFields?: any[];
    // Multi-party configuration
    parties?: PartyConfiguration[];
    // Progress callback — called with 0-100 during chunked uploads
    onProgress?: (progress: number) => void;
}

export interface CreateCategoryData {
    name: string;
}