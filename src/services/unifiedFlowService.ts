import { httpClient } from '@/lib/httpClient';
import type {
    FlowStatusResponse,
    FlowCompletePayload,
    FlowUploadInitiateResponse,
    FlowPresignResponse,
    FlowFileUrlResponse,
    FlowSignerAssignment,
    ParticipantAssignment,
    ExternalSignerSubmitInput,
} from '@/types/unifiedFlow';
import type { Contract } from '@/types/contract';

// All unified flow API calls go through the existing httpClient (JWT-authenticated).
// Endpoints: /contracts/{id}/flow/... and /contracts/flow/inbox
// This file is intentionally isolated — never imported by legacy flow code.

const base = (contractId: string) => `/contracts/${contractId}/flow`;

export const unifiedFlowService = {
    /**
     * Submit a contract into the unified review/approve flow.
     * Case A (externalSigningIncluded=false): participants only — owner manually sends for signature later.
     * Case B (externalSigningIncluded=true): also provide externalSigners[] + senderName upfront;
     *   the backend auto-triggers signature emails after the last approver completes.
     */
    async submitFlow(
        contractId: string,
        participants: ParticipantAssignment[],
        externalSigningIncluded: boolean,
        externalSigners?: ExternalSignerSubmitInput[],
        senderName?: string,
    ) {
        return httpClient.post(`${base(contractId)}/submit`, {
            participants,
            externalSigningIncluded,
            ...(externalSigningIncluded && externalSigners?.length ? { externalSigners, senderName } : {}),
        });
    },

    /** Reviewer: mark complete (no upload). Approver: mark complete with upload parts. */
    async markFlowComplete(contractId: string, payload: FlowCompletePayload) {
        return httpClient.post(`${base(contractId)}/complete`, payload);
    },

    /** Reject the contract (reviewer or approver) */
    async rejectFlow(contractId: string, message: string) {
        return httpClient.post(`${base(contractId)}/reject`, { message });
    },

    /** Initiate a multipart upload for an approver's signed PDF */
    async initiateFlowUpload(contractId: string) {
        return httpClient.post<FlowUploadInitiateResponse>(
            `${base(contractId)}/upload/initiate`,
            {},
        );
    },

    /** Get a presigned PUT URL for a single upload chunk */
    async getFlowPresignedUrl(contractId: string, uploadId: string, partNumber: number) {
        return httpClient.get<FlowPresignResponse>(
            `${base(contractId)}/upload/presign?uploadId=${encodeURIComponent(uploadId)}&partNumber=${partNumber}`,
        );
    },

    /** Abort an in-progress multipart upload (called on any chunk failure) */
    async abortFlowUpload(contractId: string, uploadId: string) {
        return httpClient.post(
            `${base(contractId)}/upload/abort?uploadId=${encodeURIComponent(uploadId)}`,
            {},
        );
    },

    /**
     * Get the URL of the contract PDF for a participant.
     * Returns the latest signed PDF if a previous approver has already uploaded one,
     * otherwise returns the original contract PDF.
     */
    async getParticipantFileUrl(contractId: string) {
        return httpClient.get<FlowFileUrlResponse>(`${base(contractId)}/file-url`);
    },

    // ─── Owner working-copy save ──────────────────────────────────────────
    // The owner edits the single canonical working copy (contracts/{id}_signed.pdf) — the
    // same object reviewers/approvers/signers read and write. Uses a parallel set of
    // /contracts/{id}/working-copy/* endpoints (owner-authorized, allowed until finalized).

    /** Owner: initiate a multipart upload of the working-copy PDF */
    async initiateWorkingCopyUpload(contractId: string) {
        return httpClient.post<FlowUploadInitiateResponse>(
            `/contracts/${contractId}/working-copy/upload/initiate`,
            {},
        );
    },

    /** Owner: get a presigned PUT URL for a single working-copy upload chunk */
    async getWorkingCopyPresignedUrl(contractId: string, uploadId: string, partNumber: number) {
        return httpClient.get<FlowPresignResponse>(
            `/contracts/${contractId}/working-copy/upload/presign?uploadId=${encodeURIComponent(uploadId)}&partNumber=${partNumber}`,
        );
    },

    /** Owner: abort an in-progress working-copy multipart upload */
    async abortWorkingCopyUpload(contractId: string, uploadId: string) {
        return httpClient.post(
            `/contracts/${contractId}/working-copy/upload/abort?uploadId=${encodeURIComponent(uploadId)}`,
            {},
        );
    },

    /** Owner: finalize the working-copy save — overwrites _signed.pdf and persists field edits */
    async completeWorkingCopy(contractId: string, payload: FlowCompletePayload) {
        return httpClient.post(`/contracts/${contractId}/working-copy/complete`, payload);
    },

    /** Owner: manually send the contract to external signers (Case A, or Case B auto-trigger fallback) */
    async sendForSignatureUnified(
        contractId: string,
        assignments: FlowSignerAssignment[],
        senderName?: string,
    ) {
        return httpClient.post(`${base(contractId)}/send-for-signature`, {
            assignments: assignments.map((a) => ({ ...a, type: 'external' })),
            senderName,
        });
    },

    /** Get live flow status for a contract (participants, org-gate, current order) */
    async getFlowStatus(contractId: string) {
        return httpClient.get<FlowStatusResponse>(`${base(contractId)}/status`);
    },

    /** Get all contracts where the current user is an active unified-flow participant */
    async getFlowInbox() {
        return httpClient.get<Contract[]>('/contracts/flow/inbox');
    },

    /** Get contracts where the current user is a completed participant (read-only Sent tab) */
    async getFlowSent() {
        return httpClient.get<Contract[]>('/contracts/flow/sent');
    },
};
