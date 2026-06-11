import { Contract, ContractStatus, WorkflowMode } from '@/types/contract';
import { apiService } from './apiService';
import { httpClient } from '@/lib/httpClient';
import { submitForExternalSignature } from './externalSignatureService';

class ContractService {

    /**
     * Get all contracts from API
     */
    async getAllContracts(): Promise<Contract[]> {
        return apiService.getContracts();
    }

    /**
     * Get contract by ID
     */
    async getContractById(id: string): Promise<Contract | undefined> {
        const contracts = await this.getAllContracts();
        return contracts.find(c => c.id === id);
    }

    /**
     * Get contracts where current user is assigned as reviewer or approver (inbox).
     */
    async getInboxContracts(): Promise<Contract[]> {
        return apiService.getInboxContracts();
    }

    /**
     * Get contracts created by a specific user
     */
    async getContractsCreatedByUser(email: string): Promise<Contract[]> {
        const contracts = await this.getAllContracts();
        // Filter by createdBy field
        return contracts.filter(c => c.createdBy === email);
    }

    /**
     * Create new contract via API
     */
    async createContract(data: Omit<Contract, 'id' | 'createdAt' | 'updatedAt'>): Promise<{
        success: boolean;
        message: string;
        contract?: Contract;
    }> {
        const result = await apiService.createContract(data);
        if (result.success) {
            return { success: true, message: 'Contract created', contract: { ...data, id: result.id! } as Contract };
        }
        return { success: false, message: result.message || 'Failed to create contract' };
    }

    /**
     * Update contract signed PDF — uploads to MinIO via Spring Boot, then persists XFDF.
     *
     * Upload path: < 30 MB → single-shot PUT /contracts/{id}/file
     *              ≥ 30 MB → chunked multipart (initiate → presign → PUT → complete)
     *
     * XFDF is always saved via internal PATCH so annotations survive when the
     * document is reopened. Without this the binary is stored but the XFDF
     * sidecar (signature appearances, field values) would be silently dropped.
     */
    async updateContractSignedPdf(id: string, pdfData: Blob | string, xfdfData?: string): Promise<{
        success: boolean;
        message: string;
        contract?: Contract;
    }> {
        try {
            // ── 1. Normalise to Blob ──────────────────────────────────────────
            let blob: Blob;
            if (typeof pdfData === 'string') {
                console.log(`[ContractService] updateContractSignedPdf | id="${id}" | input=base64 string — converting to Blob`);
                const byteCharacters = atob(pdfData);
                const byteArray = new Uint8Array(byteCharacters.length);
                for (let i = 0; i < byteCharacters.length; i++) {
                    byteArray[i] = byteCharacters.charCodeAt(i);
                }
                blob = new Blob([byteArray], { type: 'application/pdf' });
            } else {
                blob = pdfData;
            }
            console.log(`[ContractService] updateContractSignedPdf | id="${id}" | blob=${(blob.size / 1024).toFixed(0)}KB | hasXfdf=${!!xfdfData}`);

            // ── 2. Upload PDF to MinIO ────────────────────────────────────────
            const uploadResult = await apiService.saveContractPdf(id, blob);
            if (!uploadResult.success) {
                console.error(`[ContractService] updateContractSignedPdf ✗ PDF upload failed | id="${id}"`, uploadResult.message);
                return { success: false, message: uploadResult.message || 'Failed to upload PDF' };
            }
            console.log(`[ContractService] updateContractSignedPdf ✓ PDF uploaded to MinIO | id="${id}"`);

            // ── 3. Persist XFDF sidecar via Spring Boot PATCH ────────────────
            // Must use updateContractDocument (Spring Boot) — NOT updateContractMetadata
            // (internal Next.js). Contracts created via Spring Boot live in its DB
            // context; the internal route returns 404 for them.
            if (xfdfData) {
                console.log(`[ContractService] updateContractSignedPdf | persisting XFDF via Spring Boot | id="${id}" | length=${xfdfData.length}`);
                const xfdfResult = await apiService.updateContractDocument(id, { xfdfData });
                if (!xfdfResult.success) {
                    console.warn(`[ContractService] updateContractSignedPdf ⚠ XFDF persist failed | id="${id}"`, xfdfResult.message);
                } else {
                    console.log(`[ContractService] updateContractSignedPdf ✓ XFDF persisted | id="${id}"`);
                }
            }

            return { success: true, message: 'PDF saved' };
        } catch (e: any) {
            console.error(`[ContractService] updateContractSignedPdf ✗ unexpected error | id="${id}"`, e);
            return { success: false, message: e?.message || 'Failed to save PDF' };
        }
    }

    // ... Workflow methods ...

    /**
     * Submit contract for review and/or approval workflow via Spring Boot backend.
     * Handles both initial submission and resubmission after rejection.
     * Supports three workflow modes: ONLY_REVIEW, ONLY_APPROVE, or REVIEW_AND_APPROVE.
     */
    async submitForWorkflow(
        contractId: string,
        mode: WorkflowMode,
        reviewerEmails: string[],
        approverEmail: string,
        reviewerMessage?: string,
        approverMessage?: string,
    ): Promise<{ success: boolean; message: string }> {
        try {
            const body: Record<string, any> = { mode };
            if (reviewerEmails.length > 0) body.reviewerEmails = reviewerEmails;
            if (approverEmail) body.approverEmail = approverEmail;
            if (reviewerMessage) body.reviewerMessage = reviewerMessage;
            if (approverMessage) body.approverMessage = approverMessage;

            const res = await httpClient.post<any>(`/contracts/${contractId}/submit`, body);
            if (res.ok) {
                return { success: true, message: res.message || 'Contract submitted successfully' };
            }
            return { success: false, message: res.message || 'Failed to submit contract' };
        } catch (error) {
            console.error('Submit for review failed:', error);
            return { success: false, message: 'Failed to submit contract' };
        }
    }

    /**
     * Forward contract to additional reviewers — POST /contracts/{id}/review/forward
     * Marks the caller as "forwarded" and adds new reviewers in one step.
     */
    async addAdditionalReviewers(contractId: string, additionalReviewerEmails: string[], message?: string): Promise<{
        success: boolean;
        message: string;
    }> {
        try {
            const body: Record<string, any> = { additionalReviewerEmails };
            if (message) body.message = message;
            const res = await httpClient.post<any>(`/contracts/${contractId}/review/forward`, body);
            return res.ok
                ? { success: true, message: `Forwarded to ${additionalReviewerEmails.length} additional reviewer(s)` }
                : { success: false, message: res.message || 'Failed to forward for review' };
        } catch {
            return { success: false, message: 'Failed to forward for review' };
        }
    }

    /**
     * Mark contract as reviewed — POST /contracts/{id}/review/complete
     * Actor identity is resolved from JWT; no email needed.
     */
    async markAsReviewed(contractId: string, _email: string, comments?: string): Promise<{ success: boolean; message: string; contract?: any }> {
        try {
            const res = await httpClient.post<any>(`/contracts/${contractId}/review/complete`, { comments });
            return res.ok
                ? { success: true, message: 'Marked as reviewed successfully', contract: res.data }
                : { success: false, message: res.message || 'Failed to mark as reviewed' };
        } catch {
            return { success: false, message: 'Failed to mark as reviewed' };
        }
    }
    /**
     * Request modification — delegates to the appropriate reject endpoint.
     * On the backend, rejection and "request modification" are the same operation:
     * reject with a message, which gets recorded in modificationRequests[].
     */
    async requestModification(
        contractId: string,
        email: string,
        role: 'reviewer' | 'approver',
        comments: string
    ): Promise<{ success: boolean; message: string }> {
        return role === 'reviewer'
            ? this.rejectByReviewer(contractId, email, comments)
            : this.rejectByApprover(contractId, email, comments);
    }

    /**
     * Approve contract — POST /contracts/{id}/approval/approve
     * Actor identity resolved from JWT; no email needed.
     */
    async approveContract(contractId: string, _email: string, comments?: string): Promise<{ success: boolean; message: string; contract?: any }> {
        try {
            const res = await httpClient.post<any>(`/contracts/${contractId}/approval/approve`, { comments });
            return res.ok
                ? { success: true, message: 'Contract approved successfully', contract: res.data }
                : { success: false, message: res.message || 'Failed to approve contract' };
        } catch {
            return { success: false, message: 'Failed to approve contract' };
        }
    }
    /**
     * Reject contract as reviewer — POST /contracts/{id}/review/reject
     * message is required by the backend (400 if blank).
     */
    async rejectByReviewer(contractId: string, _email: string, message: string): Promise<{ success: boolean; message: string; contract?: any }> {
        try {
            const res = await httpClient.post<any>(`/contracts/${contractId}/review/reject`, { message });
            return res.ok
                ? { success: true, message: 'Contract rejected', contract: res.data }
                : { success: false, message: res.message || 'Failed to reject contract' };
        } catch {
            return { success: false, message: 'Failed to reject contract' };
        }
    }

    /**
     * Reject contract as approver — POST /contracts/{id}/approval/reject
     * message is required by the backend (400 if blank).
     */
    async rejectByApprover(contractId: string, _email: string, message: string): Promise<{ success: boolean; message: string; contract?: any }> {
        try {
            const res = await httpClient.post<any>(`/contracts/${contractId}/approval/reject`, { message });
            return res.ok
                ? { success: true, message: 'Contract rejected', contract: res.data }
                : { success: false, message: res.message || 'Failed to reject contract' };
        } catch {
            return { success: false, message: 'Failed to reject contract' };
        }
    }

    /**
     * Submit contract for external signature
     */
    async submitForSignature(contractId: string, signerEmail: string, senderName?: string): Promise<{
        success: boolean;
        message: string;
        signingUrl?: string; // Return URL for immediate use if needed
    }> {
        try {
            // 1. Get contract details
            const contract = await this.getContractById(contractId);
            if (!contract) {
                return { success: false, message: 'Contract not found' };
            }

            // 2. Determine sender name if not provided
            const finalSenderName = senderName || contract.createdBy || 'Contract System';

            // 3. Call external signature service
            const result = await submitForExternalSignature(contract, signerEmail, finalSenderName);

            if (result.success) {
                // 4. Update contract status to IN_SIGNATURE

                const updateData = {
                    status: ContractStatus.IN_SIGNATURE,
                    externalSigningToken: result.token,
                    externalSigningUrl: result.signingUrl,
                    externalSigningSentAt: new Date().toISOString(),
                    // Update signer info
                    signer: {
                        email: signerEmail,
                        status: 'pending' as const
                    }
                };

                await apiService.updateContractMetadata(contractId, updateData);

                return {
                    success: true,
                    message: 'Signature request sent successfully',
                    signingUrl: result.signingUrl
                };
            } else {
                return { success: false, message: result.error || 'Failed to send signature request' };
            }

        } catch (error) {
            console.error('Submit signature error:', error);
            return { success: false, message: 'An error occurred' };
        }
    }

    async signContract(_id: string, _email: string, _signatureImage?: string) {
        // Logic handled by updateContractSignedPdf mostly
        return { success: true, message: "Mock signed" };
    }

    async checkExternalSignatureStatus(id: string) {
        // Check if external signature has been completed
        const contract = await this.getContractById(id);
        return {
            success: true,
            signed: contract?.status === ContractStatus.SIGNED ||
                contract?.status === ContractStatus.SIGNED_BY_EVERYONE,
            updatedAt: contract?.updatedAt,
            currentSigningOrder: contract?.currentSigningOrder,
            contract
        };
    }

    /**
     * Delete contract
     */
    async deleteContract(id: string): Promise<{ success: boolean; message: string }> {
        return apiService.deleteContract(id);
    }

}

export const contractService = new ContractService();