/**
* Information about the signer
*/
export interface SignerInfo {
    email: string;
    name?: string;                    // Signer's name
    status: 'pending' | 'signed' | 'rejected';
    signedAt?: string;
    signatureImage?: string;          // Base64 data URL of the signature
}

/**
 * Party Configuration (imported from template)
 */
export interface PartyConfiguration {
    id: string;                // Unique party ID: "party_1", "party_2", etc.
    label: string;             // Human-readable label: "Buyer", "Seller", "Witness"
    color: string;             // Hex color for visual distinction
    order: number;             // Signing order
}

/**
 * Status of fields filled by a specific party
 */
export interface PartyFilledStatus {
    partyId: string;           // Party ID
    filledBy?: string;         // Email of who filled
    filledByName?: string;     // Name of who filled
    filledAt?: string;         // When filled (ISO date string)
    isComplete: boolean;       // All fields for this party are filled
    fieldCount: number;        // Total fields assigned to this party
    filledCount: number;       // Number of fields filled
}

/**
 * Signing sequence entry for multi-party signing
 */
export interface SigningSequenceEntry {
    partyId: string;           // Party ID
    partyLabel: string;        // Party label for display
    signerEmail: string;       // Email of the signer for this party
    signerName?: string;       // Name of the signer
    status: 'pending' | 'sent' | 'in_progress' | 'completed';
    token?: string;            // Signing token if sent
    sentAt?: string;           // When signing request was sent
    completedAt?: string;      // When signing was completed
}

/**
 * Status of a signing request
 */
export type SigningRequestStatus = 'pending' | 'viewed' | 'signed' | 'expired' | 'cancelled';

/**
 * Event tracking for signing request
 */
export interface SigningEvent {
    type: 'created' | 'viewed' | 'signed' | 'expired' | 'cancelled';
    at: string;
}

/**
 * Embedded signing request data (consolidated from signature_requests collection)
 * This is now stored directly in the contract document
 */
export interface SigningRequest {
    token: string;                        // Unique signing token
    signerEmail: string;                  // Email of external signer
    signerName?: string;                  // Name of signer
    senderName?: string;                  // Name of contractor who sent
    status: SigningRequestStatus;         // Current status
    createdAt: string;                    // When request was created
    expiresAt: string;                    // When link expires
    signedAt?: string;                    // When signed
    signedXfdf?: string;                  // XFDF with signature from signer
    events: SigningEvent[];               // Event tracking
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
    REJECTED = 'rejected',
    REJECTED_BY_REVIEWER = 'rejected_by_reviewer',
    REJECTED_BY_APPROVER = 'rejected_by_approver'
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

    // External signature tracking
    externalSigningToken?: string;      // Token used in signing URL (for quick lookup)
    externalSigningUrl?: string;        // Full signing URL sent to client
    externalSigningSentAt?: string;     // When the signature request was sent

    // Consolidated signing request (replaces separate signature_requests collection)
    signingRequest?: SigningRequest;
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
    status: 'pending' | 'reviewed' | 'requested_changes' | 'rejected';  // Review status
    reviewedAt?: string;                                         // Timestamp when reviewed
    rejectedAt?: string;                                         // Timestamp when rejected
    comments?: string;                                           // Comments from reviewer
    submissionMessage?: string;                                  // Message sent when submitting for review
    sentAt?: string;                                             // Timestamp when review request was sent
    sentBy?: string;                                             // Email of sender who requested review
}

/**
* Information about the approver assigned to a contract
*/
export interface ApproverInfo {
    email: string;                                               // Approver's email
    status: 'pending' | 'approved' | 'rejected';                // Approval status
    approvedAt?: string;                                         // Timestamp when approved
    comments?: string;                                           // Comments from approver
    submissionMessage?: string;                                  // Message sent when submitting for approval
    sentAt?: string;                                             // Timestamp when approval request was sent
    sentBy?: string;                                             // Email of sender who requested approval
}