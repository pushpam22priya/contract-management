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
 * External signer for multi-party signature flow
 */
export interface ExternalSigner {
    email: string;             // Signer's email
    name?: string;             // Signer's name (optional)
    partyId: string;           // Which party they are assigned to fill (single party)
    partyLabel: string;        // Party label for display
    order: number;             // Signing order (1, 2, 3, etc.)
    token: string;             // Unique signing token
    status: 'pending' | 'unlocked' | 'viewed' | 'completed';
    sentAt: string;            // When the signing request was sent
    unlockedAt?: string;       // When their turn was unlocked
    viewedAt?: string;         // When they first opened the link
    completedAt?: string;      // When they submitted their changes
}

/**
 * Internal signer for multi-party signature flow
 * Internal users sign through the Signatures page, not via email link
 */
export interface InternalSigner {
    userId?: string;           // User ID in the system (optional)
    email: string;             // Internal user's email
    name?: string;             // User's name
    partyId: string;           // Which party they are assigned to fill (single party)
    partyLabel: string;        // Party label for display
    order: number;             // Signing order (1, 2, 3, etc.)
    status: 'pending' | 'unlocked' | 'completed';
    assignedAt: string;        // When assigned
    unlockedAt?: string;       // When their turn was unlocked
    completedAt?: string;      // When they completed
}

/**
 * Signer assignment for the assignment dialog
 */
export interface SignerAssignment {
    id: string;                // Unique ID for UI tracking
    partyId: string;           // Which party
    partyLabel: string;        // Party label
    type: 'internal' | 'external';  // Type of signer
    email?: string;            // Email (required for external, optional for internal)
    name?: string;             // Name
    userId?: string;           // User ID (for internal users)
    order: number;             // Signing order
}

/**
 * Signature status for multi-party flow
 */
export type SignatureFlowStatus =
    | 'draft'                  // Contract created, not sent for signatures
    | 'pending_signatures'     // Sent to external parties, waiting for completions
    | 'all_completed'          // All parties have completed their fields
    | 'finalized';             // Contractor has finalized and emails sent

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
    DRAFT = 'DRAFT',
    IN_REVIEW = 'IN_REVIEW',
    IN_APPROVAL = 'IN_APPROVAL',
    REVIEW_APPROVAL = 'REVIEW_APPROVAL',
    REVIEWED = 'REVIEWED',
    APPROVED = 'APPROVED',
    READY_FOR_SIGNATURE = 'READY_FOR_SIGNATURE',
    WAITING_FOR_SIGNATURE = 'WAITING_FOR_SIGNATURE',
    SIGNED_BY_EVERYONE = 'SIGNED_BY_EVERYONE',
    SIGNED = 'SIGNED',
    ACTIVE = 'ACTIVE',
    EXPIRING = 'EXPIRING',
    EXPIRED = 'EXPIRED',
    TERMINATED = 'TERMINATED',
    REJECTED = 'REJECTED',
    REJECTED_BY_REVIEWER = 'REJECTED_BY_REVIEWER',
    REJECTED_BY_APPROVER = 'REJECTED_BY_APPROVER'
}

export interface Contract {
    // Card display fields (from Step 2 - Basic Information)
    id: string;
    name: string;                // Contract name (alias for title)
    title: string;
    description: string;
    client: string;
    category: string;
    expiresInDays: number;
    status: ContractStatus;
    fileData?: string;           // Base64-encoded PDF with filled values (legacy MongoDB storage)
    fileUrl?: string;            // URL to fetch PDF from API (e.g., /api/file/[id])
    fileUploaded?: boolean;      // true once PDF has been successfully uploaded to MinIO (Spring Boot)
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

    // External signature tracking (legacy - single signer)
    externalSigningToken?: string;      // Token used in signing URL (for quick lookup)
    externalSigningUrl?: string;        // Full signing URL sent to client
    externalSigningSentAt?: string;     // When the signature request was sent

    // Consolidated signing request (replaces separate signature_requests collection)
    signingRequest?: SigningRequest;

    // ═══════════════════════════════════════════════════════════════════════════
    // MULTI-PARTY SIGNATURE FLOW
    // ═══════════════════════════════════════════════════════════════════════════

    // Multi-party flow status
    signatureFlowStatus?: SignatureFlowStatus;

    // Version number for optimistic locking (prevents concurrent edit conflicts)
    version?: number;

    // External signers (one per party that's assigned to an external client)
    externalSigners?: ExternalSigner[];

    // Internal signers (one per party that's assigned to an internal user)
    internalSigners?: InternalSigner[];

    // Current signing order being processed (for sequential signing flow)
    currentSigningOrder?: number;

    // Which party/parties the contractor fills (if any)
    contractorParty?: string | string[];

    // Party configurations (copied from template)
    parties?: PartyConfiguration[];

    // Track which parties have completed their fields
    partyCompletions?: {
        partyId: string;
        partyLabel: string;
        order?: number;              // Signing order
        assigneeType?: 'internal' | 'external' | 'contractor';  // Type of assignee
        assigneeEmail?: string;      // Email of assignee
        status: 'pending' | 'unlocked' | 'completed';
        completedBy?: string;        // Email of who completed
        completedByName?: string;    // Name of who completed
        completedAt?: string;        // When completed
        isContractor?: boolean;      // True if completed by contractor
    }[];

    // When the contract was finalized (all signatures complete, emails sent)
    finalizedAt?: string;
    finalizedBy?: string;

    // Team (folder) this contract belongs to
    teamId?: string | null;

    // Renewal tracking (linked-list pattern)
    renewedFromId?: string;        // ID of the contract this was renewed from (set on renewal)
    renewalStatus?: 'in_progress'; // Set on original when renewal draft is created; cleared when renewal goes active
    renewedContractId?: string;    // ID of the in-progress renewal draft (set on original)
    renewalStartDate?: string;     // ISO date — start date of the pending renewal (for card tooltip)

    // Termination tracking (one-way, irreversible)
    terminatedAt?: string;         // ISO datetime — when the contract was terminated
    terminatedBy?: string;         // email of the user who performed the termination
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