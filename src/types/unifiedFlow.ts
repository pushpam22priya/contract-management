// ─── Unified Workflow Types ────────────────────────────────────────────────────
// All types for the parallel unified review/approve/signature flow.
// These are separate from the legacy ReviewerInfo / ApproverInfo types.

export type ParticipantRole = 'REVIEWER' | 'APPROVER';

export type ParticipantStatus =
    | 'pending'
    | 'unlocked'
    | 'in_progress'
    | 'completed'
    | 'rejected';

export type PartyType = 'INTERNAL' | 'EXTERNAL';

export interface WorkflowParticipant {
    email: string;
    name?: string;
    role: ParticipantRole;
    order: number;
    status: ParticipantStatus;
    sentBy?: string;
    sentAt?: string;
    unlockedAt?: string;
    completedAt?: string;
    rejectedAt?: string;
    comments?: string;
}

/** Shape used when building the participant list in the submit dialog */
export interface ParticipantAssignment {
    email: string;
    name?: string;
    role: ParticipantRole;
    order: number;
}

/** Response shape from GET /contracts/{id}/flow/status */
export interface FlowStatusResponse {
    contractId: string;
    status: string;
    currentParticipantOrder: number | null;
    participants: WorkflowParticipant[];
    externalSigningIncluded: boolean;
    orgFieldsComplete: boolean;
    unfilledOrgFields: string[];
    /** Party configurations with INTERNAL/EXTERNAL type — used to compute editable parties */
    parties?: Array<{ id: string; label: string; color: string; order: number; type?: 'INTERNAL' | 'EXTERNAL' | null }>;
    /** External signers stored at submit time — returned by the backend so owners can see who will receive signature emails */
    externalSigners?: ExternalSignerSubmitInput[];
    /** Form fields with assignedParty — most reliable source for EXTERNAL field detection */
    formFields?: Array<{ name: string; assignedParty?: string; type?: string; value?: string; partyLabel?: string; profileKey?: string | null }>;
    /** Stored XFDF from the last participant save — pass as initialXfdf to restore annotations in the viewer */
    xfdfData?: string;
}

/** One uploaded chunk's metadata — collected and sent to markFlowComplete for approvers */
export interface FlowUploadPart {
    partNumber: number;
    etag: string;
}

/** Body sent to POST /contracts/{id}/flow/complete (same shape for both REVIEWER and APPROVER) */
export interface FlowCompletePayload {
    comments?: string;
    uploadId?: string;
    parts?: FlowUploadPart[];
    formFields?: any[];
    fieldValues?: Record<string, string>;
    xfdfData?: string;
}

/** External signer assignment for the send-for-signature dialog */
export interface FlowSignerAssignment {
    email: string;
    name?: string;
    order: number;
    partyId?: string;
    partyLabel?: string;
}

/** External signer provided upfront at submit time (externalSigningIncluded=true, Case B) */
export interface ExternalSignerSubmitInput {
    email: string;
    name?: string;
    partyId?: string;
    partyLabel?: string;
    order: number;
}

/** Response from POST /contracts/{id}/flow/upload/initiate */
export interface FlowUploadInitiateResponse {
    uploadId: string;
}

/** Response from GET /contracts/{id}/flow/upload/presign */
export interface FlowPresignResponse {
    url: string;
    partNumber: number;
}

/** Response from GET /contracts/{id}/flow/file-url */
export interface FlowFileUrlResponse {
    url: string;
    /** Stored XFDF from previous participant edits — passed as initialXfdf to restore annotations */
    xfdfData?: string;
}
