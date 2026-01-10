export interface Contract {
    // Card display fields (from Step 2 - Basic Information)
    id: string;
    title: string;
    description: string;
    client: string;
    value: string;
    category: string;
    expiresInDays: number;
    status: 'active' | 'expiring' | 'expired' | 'review_approval' | 'waiting_for_signature' | 'draft';

    // Review & Approval Workflow tracking
    reviewers?: ReviewerInfo[];      // Multiple reviewers can be assigned
    approver?: ApproverInfo;         // Single approver
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

    // Dates
    startDate?: string;
    endDate?: string;

    // Metadata
    createdAt: string;
    createdBy: string;
    updatedAt?: string;
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