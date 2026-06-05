import { Contract, ReviewerInfo, ApproverInfo, ModificationRequest, ContractStatus } from '@/types/contract';
import { apiService } from './apiService';
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
     * Submit contract for review and approval
     * - Preserves existing reviewers with their data (messages, status)
     * - Only adds NEW reviewers with the new message
     * - Does NOT update approver if one already exists
     */
    async submitForReview(
        contractId: string,
        newReviewerEmails: string[],
        approver: string,
        reviewerMessage?: string,
        approverMessage?: string,
        senderEmail?: string
    ): Promise<{
        success: boolean;
        message: string;
    }> {
        try {
            // Fetch existing contract to preserve data
            const contract = await this.getContractById(contractId);
            if (!contract) {
                return { success: false, message: 'Contract not found' };
            }

            // Use provided sender email or fallback to contract creator
            const sentBy = senderEmail || contract.createdBy;
            const sentAt = new Date().toISOString();

            // Get existing reviewers (preserve their data)
            const existingReviewers = contract.reviewers || [];
            const existingReviewerEmails = new Set(existingReviewers.map(r => r.email));

            // Only create new reviewer objects for emails that don't already exist
            const newReviewerInfos: ReviewerInfo[] = newReviewerEmails
                .filter(email => !existingReviewerEmails.has(email))
                .map(email => ({
                    email,
                    status: 'pending' as const,
                    sentAt,
                    sentBy,
                    ...(reviewerMessage && { submissionMessage: reviewerMessage })
                }));

            // Merge: keep existing reviewers unchanged + add new ones
            const mergedReviewers = [...existingReviewers, ...newReviewerInfos];

            // Determine if an approver will be set after this submission
            const willHaveApprover = (contract.approver && contract.approver.email)
                || (approver && approver !== '');

            // Determine correct status:
            // - Has reviewer(s) → IN_REVIEW
            // - No reviewers, has approver → IN_APPROVAL
            // - Neither → DRAFT (validation should prevent this)
            const willHaveReviewers = mergedReviewers.length > 0;
            let newStatus: ContractStatus;
            if (willHaveReviewers) {
                newStatus = ContractStatus.IN_REVIEW;
            } else if (willHaveApprover) {
                newStatus = ContractStatus.IN_APPROVAL;
            } else {
                newStatus = ContractStatus.DRAFT;
            }

            // Build update data
            const updateData: Record<string, any> = {
                reviewers: mergedReviewers,
                status: newStatus,
                reviewStatus: 'pending' as const,
            };

            // Only set approver if one doesn't already exist AND a valid email is provided
            if (!contract.approver && approver && approver !== '') {
                updateData.approver = {
                    email: approver,
                    status: 'pending' as const,
                    sentAt,
                    sentBy,
                    ...(approverMessage && { submissionMessage: approverMessage })
                } as ApproverInfo;
                updateData.approvalStatus = 'pending' as const;
            }

            const result = await apiService.updateContractMetadata(contractId, updateData);

            if (result.success) {
                const message = newReviewerInfos.length > 0
                    ? `Added ${newReviewerInfos.length} new reviewer(s)`
                    : 'Contract submitted for review and approval';
                return { success: true, message };
            } else {
                return { success: false, message: result.message || 'Failed to submit for review' };
            }
        } catch (error) {
            console.error('Submit for review failed:', error);
            return { success: false, message: 'Failed to submit for review' };
        }
    }

    /**
     * Remove a reviewer from a contract
     */
    async removeReviewer(contractId: string, reviewerEmail: string): Promise<{
        success: boolean;
        message: string;
    }> {
        try {
            const contract = await this.getContractById(contractId);
            if (!contract) return { success: false, message: 'Contract not found' };

            const existingReviewers = contract.reviewers || [];
            const updatedReviewers = existingReviewers.filter(r => r.email !== reviewerEmail);

            if (updatedReviewers.length === existingReviewers.length) {
                return { success: false, message: 'Reviewer not found' };
            }

            const updateData: Record<string, any> = {
                reviewers: updatedReviewers,
            };

            // If no reviewers left, clear reviewStatus
            if (updatedReviewers.length === 0) {
                updateData.reviewStatus = null; // Use null to actually clear the field

                // If no approver either, reset to draft status and clear approvalStatus
                if (!contract.approver) {
                    updateData.status = ContractStatus.DRAFT;
                    updateData.approvalStatus = null;
                }
            }

            const result = await apiService.updateContractMetadata(contractId, updateData);

            if (result.success) {
                return { success: true, message: 'Reviewer removed successfully' };
            } else {
                return { success: false, message: result.message || 'Failed to remove reviewer' };
            }
        } catch (error) {
            console.error('Remove reviewer failed:', error);
            return { success: false, message: 'Failed to remove reviewer' };
        }
    }

    /**
     * Remove the approver from a contract
     */
    async removeApprover(contractId: string): Promise<{
        success: boolean;
        message: string;
    }> {
        try {
            const contract = await this.getContractById(contractId);
            if (!contract) return { success: false, message: 'Contract not found' };

            if (!contract.approver) {
                return { success: false, message: 'No approver assigned' };
            }

            const updateData: Record<string, any> = {
                approver: null,
                approvalStatus: null, // Use null to actually clear the field
            };

            // If no reviewers either, reset to draft status and clear reviewStatus
            if (!contract.reviewers || contract.reviewers.length === 0) {
                updateData.status = ContractStatus.DRAFT;
                updateData.reviewStatus = null;
            }

            const result = await apiService.updateContractMetadata(contractId, updateData);

            if (result.success) {
                return { success: true, message: 'Approver removed successfully' };
            } else {
                return { success: false, message: result.message || 'Failed to remove approver' };
            }
        } catch (error) {
            console.error('Remove approver failed:', error);
            return { success: false, message: 'Failed to remove approver' };
        }
    }

    /**
     * Add additional reviewers to a contract (for "Send for Further Review" flow)
     * Preserves existing reviewer statuses and keeps the existing approver
     */
    async addAdditionalReviewers(contractId: string, additionalReviewerEmails: string[], senderEmail?: string): Promise<{
        success: boolean;
        message: string;
    }> {
        try {
            const contract = await this.getContractById(contractId);
            if (!contract) return { success: false, message: 'Contract not found' };

            // Use provided sender email or fallback to contract creator
            const sentBy = senderEmail || contract.createdBy;
            const sentAt = new Date().toISOString();

            // Get existing reviewers (preserve their statuses)
            const existingReviewers = contract.reviewers || [];
            const existingEmails = new Set(existingReviewers.map(r => r.email));

            // Only add reviewers that don't already exist
            const newReviewerInfos: ReviewerInfo[] = additionalReviewerEmails
                .filter(email => !existingEmails.has(email))
                .map(email => ({
                    email,
                    status: 'pending' as const,
                    sentAt,
                    sentBy
                }));

            if (newReviewerInfos.length === 0) {
                return { success: false, message: 'All selected reviewers are already assigned' };
            }

            // Merge: keep existing reviewers with their statuses + add new ones as pending
            const mergedReviewers = [...existingReviewers, ...newReviewerInfos];

            const updateData: Record<string, any> = {
                reviewers: mergedReviewers,
                status: ContractStatus.IN_REVIEW,
                reviewStatus: 'pending' as const,
                // Keep existing approver unchanged
            };

            const result = await apiService.updateContractMetadata(contractId, updateData);

            if (result.success) {
                return { success: true, message: `Added ${newReviewerInfos.length} additional reviewer(s)` };
            } else {
                return { success: false, message: result.message || 'Failed to add reviewers' };
            }
        } catch (error) {
            console.error('Add additional reviewers failed:', error);
            return { success: false, message: 'Failed to add additional reviewers' };
        }
    }

    /**
     * Mark contract as reviewed by a specific reviewer
     */
    async markAsReviewed(contractId: string, email: string): Promise<{ success: boolean; message: string }> {
        try {
            const contract = await this.getContractById(contractId);
            if (!contract) return { success: false, message: 'Contract not found' };

            // Find reviewer
            if (!contract.reviewers) return { success: false, message: 'No reviewers assigned' };

            const reviewerIndex = contract.reviewers.findIndex(r => r.email === email);
            if (reviewerIndex === -1) return { success: false, message: 'Reviewer not found in this contract' };

            // Update reviewer status
            const updatedReviewers = [...contract.reviewers];
            updatedReviewers[reviewerIndex] = {
                ...updatedReviewers[reviewerIndex],
                status: 'reviewed',
                reviewedAt: new Date().toISOString()
            };

            // Check if all reviewers have reviewed
            const allReviewed = updatedReviewers.every(r => r.status === 'reviewed');

            // Build update object
            const updates: any = {
                reviewers: updatedReviewers
            };

            // If all reviewed, auto-transition to the correct next status
            if (allReviewed) {
                updates.reviewStatus = 'reviewed';
                if (contract.approver && contract.approver.email) {
                    // Case 3: Has approver — auto-transition to IN_APPROVAL
                    updates.status = ContractStatus.IN_APPROVAL;
                } else {
                    // Case 1: No approver — auto-transition directly to READY_FOR_SIGNATURE
                    updates.status = ContractStatus.READY_FOR_SIGNATURE;
                    updates.approvalStatus = 'approved';
                }
            }

            // Save updates
            const result = await apiService.updateContractMetadata(contractId, updates);

            if (result.success) {
                return { success: true, message: 'Marked as reviewed successfully' };
            } else {
                return { success: false, message: result.message || 'Failed to update contract' };
            }

        } catch (error) {
            console.error('Mark as reviewed error:', error);
            return { success: false, message: 'An error occurred' };
        }
    }
    /**
     * Request modification
     */
    async requestModification(
        contractId: string,
        email: string,
        role: 'reviewer' | 'approver',
        comments: string
    ): Promise<{ success: boolean; message: string }> {
        try {
            const contract = await this.getContractById(contractId);
            if (!contract) return { success: false, message: 'Contract not found' };

            const updates: any = {};

            // Add new modification request
            const newRequest: ModificationRequest = {
                requestedBy: email,
                role,
                comments,
                requestedAt: new Date().toISOString()
            };
            const modRequests = contract.modificationRequests || [];
            updates.modificationRequests = [...modRequests, newRequest];

            // Update individual status
            if (role === 'reviewer') {
                if (!contract.reviewers) return { success: false, message: 'No reviewers found' };
                const idx = contract.reviewers.findIndex(r => r.email === email);
                if (idx === -1) return { success: false, message: 'Reviewer not found' };

                const updatedReviewers = [...contract.reviewers];
                updatedReviewers[idx] = {
                    ...updatedReviewers[idx],
                    status: 'requested_changes',
                    comments
                };
                updates.reviewers = updatedReviewers;
                updates.reviewStatus = 'changes_requested';

            } else {
                // Approver
                if (contract.approver?.email !== email) return { success: false, message: 'Approver mismatch' };
                updates.approver = {
                    ...contract.approver,
                    status: 'rejected',
                    comments
                };
                updates.approvalStatus = 'rejected';
            }

            const result = await apiService.updateContractMetadata(contractId, updates);
            if (result.success) {
                return { success: true, message: 'Modification requested' };
            } else {
                return { success: false, message: result.message || 'Failed to request modification' };
            }

        } catch (error) {
            console.error('Request modification error:', error);
            return { success: false, message: 'An error occurred' };
        }
    }

    /**
     * Approve contract
     */
    async approveContract(contractId: string, email: string): Promise<{ success: boolean; message: string }> {
        try {
            const contract = await this.getContractById(contractId);
            if (!contract) return { success: false, message: 'Contract not found' };

            // Check if user is the approver
            if (contract.approver?.email !== email) {
                return { success: false, message: 'You are not the assigned approver' };
            }

            // Update approver status
            const approverUpdate: ApproverInfo = {
                ...contract.approver,
                status: 'approved',
                approvedAt: new Date().toISOString()
            };

            const updates = {
                approver: approverUpdate,
                approvalStatus: 'approved',
                status: ContractStatus.READY_FOR_SIGNATURE
            };

            const result = await apiService.updateContractMetadata(contractId, updates);
            if (result.success) {
                return { success: true, message: 'Contract approved successfully' };
            } else {
                return { success: false, message: result.message || 'Failed to approve contract' };
            }

        } catch (error) {
            console.error('Approve error:', error);
            return { success: false, message: 'An error occurred' };
        }
    }
    /**
     * Reject contract by reviewer
     */
    async rejectByReviewer(contractId: string, email: string): Promise<{ success: boolean; message: string }> {
        try {
            const contract = await this.getContractById(contractId);
            if (!contract) return { success: false, message: 'Contract not found' };

            // Find reviewer
            if (!contract.reviewers) return { success: false, message: 'No reviewers assigned' };

            const reviewerIndex = contract.reviewers.findIndex(r => r.email === email);
            if (reviewerIndex === -1) return { success: false, message: 'Reviewer not found in this contract' };

            // Update reviewer status to rejected
            const updatedReviewers = [...contract.reviewers];
            updatedReviewers[reviewerIndex] = {
                ...updatedReviewers[reviewerIndex],
                status: 'rejected',
                rejectedAt: new Date().toISOString()
            };

            // Build update object - contract status changes to REJECTED_BY_REVIEWER
            const updates: any = {
                reviewers: updatedReviewers,
                status: ContractStatus.REJECTED_BY_REVIEWER,
                reviewStatus: 'rejected'
            };

            // Save updates
            const result = await apiService.updateContractMetadata(contractId, updates);

            if (result.success) {
                return { success: true, message: 'Contract rejected by reviewer' };
            } else {
                return { success: false, message: result.message || 'Failed to reject contract' };
            }

        } catch (error) {
            console.error('Reject by reviewer error:', error);
            return { success: false, message: 'An error occurred' };
        }
    }

    /**
     * Reject contract by approver
     */
    async rejectByApprover(contractId: string, email: string): Promise<{ success: boolean; message: string }> {
        try {
            const contract = await this.getContractById(contractId);
            if (!contract) return { success: false, message: 'Contract not found' };

            // Check if user is the approver
            if (contract.approver?.email !== email) {
                return { success: false, message: 'You are not the assigned approver' };
            }

            // Update approver status to rejected
            const approverUpdate: ApproverInfo = {
                ...contract.approver,
                status: 'rejected',
                approvedAt: new Date().toISOString() // Using approvedAt for rejection timestamp
            };

            const updates = {
                approver: approverUpdate,
                approvalStatus: 'rejected',
                status: ContractStatus.REJECTED_BY_APPROVER
            };

            const result = await apiService.updateContractMetadata(contractId, updates);
            if (result.success) {
                return { success: true, message: 'Contract rejected by approver' };
            } else {
                return { success: false, message: result.message || 'Failed to reject contract' };
            }

        } catch (error) {
            console.error('Reject by approver error:', error);
            return { success: false, message: 'An error occurred' };
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
                // 4. Update contract status to WAITING_FOR_SIGNATURE locally if needed
                // The service might not update the contract status automatically? 
                // externalSignatureService creates a request but doesn't explicitly update contract status to WAITING_FOR_SIGNATURE
                // We should probably do that here.

                const updateData = {
                    status: ContractStatus.WAITING_FOR_SIGNATURE,
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

    async signContract(id: string, email: string, signatureImage?: string) {
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