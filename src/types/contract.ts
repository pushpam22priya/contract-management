/**
* Information about the signer
*/
export interface SignerInfo {
    email: string;
    status: 'pending' | 'signed' | 'rejected';
    signedAt?: string;
    signatureImage?: string; // Base64 data URL of the signature
}

export enum ContractStatus {
    DRAFT = 'draft',
    REVIEW_APPROVAL = 'review_approval',
    REVIEWED = 'reviewed',       // Reviews done, waiting for approval
    APPROVED = 'approved',       // Gate: Approved, ready for signature
    WAITING_FOR_SIGNATURE = 'waiting_for_signature',
    SIGNED = 'signed',           // Signed (future start date)
    ACTIVE = 'active',           // Signed + Started
    EXPIRING = 'expiring',       // Active + fading
    EXPIRED = 'expired',
    REJECTED = 'rejected'
}

export interface Contract {
    // Card display fields (from Step 2 - Basic Information)
    id: string;
    name: string;                // Contract name (alias for title)
    title: string;
    description: string;
    client: string;
    value: string;
    category: string;
    expiresInDays: number;
    status: ContractStatus;
    fileData?: string;           // Base64-encoded PDF with filled values
    fileUrl?: string;            // URL to fetch PDF from API (e.g., /api/file/[id])
    xfdfData?: string;           // XFDF annotation data with field values
    // Review & Approval Workflow tracking
    reviewers?: ReviewerInfo[];      // Multiple reviewers can be assigned
    approver?: ApproverInfo;         // Single approver
    signer?: SignerInfo;             // Single signer
    reviewStatus?: 'pending' | 'in_review' | 'reviewed' | 'changes_requested';
    approvalStatus?: 'pending' | 'approved' | 'rejected';
    modificationComments?: string;   // Comments when changes are requested (legacy)
    modificationRequests?: ModificationRequest[];  // NEW: Detailed modification requests

    // Template info
    templateId: string;
    templateName: string;

    // Template DOCX for regeneration
    templateDocxBase64?: string;
    templateFileName?: string;

    // Contract content (for PDF viewer - includes Step 3 dynamic fields)
    content: string;              // Populated template content
    fieldValues: Record<string, string>;  // The values user filled in Step 3

    // PDFTron WebViewer data
    xfdfString?: string;          // XFDF annotations and form data from PDFTron (legacy)
    formFields?: any[];           // Form field definitions with flags (readOnly, required, lockedBy etc.)
    signedPdfBase64?: string;     // Full signed PDF with embedded signatures (base64) - preserves form fields
    hasFormFields?: boolean;      // Quick check if contract has form fields

    // Dates
    startDate?: string;
    endDate?: string;

    // Metadata
    createdAt: string;
    createdBy: string;
    updatedAt?: string;

    // External signature tracking (ADD THESE NEW FIELDS)
    externalSigningToken?: string;      // Token used in signing URL
    externalSigningBinId?: string;      // JSONBin ID for this signature request
    externalSigningUrl?: string;        // Full signing URL sent to client
    externalSigningSentAt?: string;     // When the signature request was sent

}

/**
* Information about a modification request
*/
export interface ModificationRequest {
    requestedBy: string;                    // Email of requester
    role: 'reviewer' | 'approver';         // Role of requester
    comments: string;                       // Modification comments
    requestedAt: string;                    // Timestamp
}

/**
* Information about a reviewer assigned to a contract
*/
export interface ReviewerInfo {
    email: string;                                               // Reviewer's email
    status: 'pending' | 'reviewed' | 'requested_changes';       // Review status
    reviewedAt?: string;                                         // Timestamp when reviewed
    comments?: string;                                           // Comments from reviewer
}

/**
* Information about the approver assigned to a contract
*/
export interface ApproverInfo {
    email: string;                                               // Approver's email
    status: 'pending' | 'approved' | 'rejected';                // Approval status
    approvedAt?: string;                                         // Timestamp when approved
    comments?: string;                                           // Comments from approver
}