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
        return { success: false, message: 'Failed to create contract' };
    }

    /**
     * Update contract signed PDF
     */
    async updateContractSignedPdf(id: string, pdfData: Blob | string, xfdfData?: string): Promise<{
        success: boolean;
        message: string;
        contract?: Contract;
    }> {
        try {
            let blob: Blob;
            if (typeof pdfData === 'string') {
                // Fallback for string input - try to avoid if possible
                // But if caller sends base64, we must convert to Blob to send to API
                const byteCharacters = atob(pdfData);
                const byteNumbers = new Array(byteCharacters.length);
                for (let i = 0; i < byteCharacters.length; i++) {
                    byteNumbers[i] = byteCharacters.charCodeAt(i);
                }
                const byteArray = new Uint8Array(byteNumbers);
                blob = new Blob([byteArray], { type: 'application/pdf' });
            } else {
                blob = pdfData;
            }

            await apiService.saveContractPdf(id, blob);

            // CRITICAL: Also persist XFDF data so annotations survive when
            // the document is reopened. Without this, the PDF binary is saved
            // but the XFDF sidecar (containing signature appearances and
            // field values) is silently dropped.
            if (xfdfData) {
                await apiService.updateContractMetadata(id, { xfdfData });
            }

            return { success: true, message: 'PDF saved' };
        } catch (e) {
            console.error(e);
            return { success: false, message: 'Failed to save PDF' };
        }
    }

    // ... Workflow methods ...

    /**
     * Submit contract for review and approval
     */
    async submitForReview(contractId: string, reviewers: string[], approver: string): Promise<{
        success: boolean;
        message: string;
    }> {
        try {
            // Build reviewer objects with pending status
            const reviewerInfos: ReviewerInfo[] = reviewers.map(email => ({
                email,
                status: 'pending'
            }));

            // Build approver object
            const approverInfo: ApproverInfo = {
                email: approver,
                status: 'pending'
            };

            // Update contract with reviewers, approver, and change status
            const updateData = {
                reviewers: reviewerInfos,
                approver: approverInfo,
                status: ContractStatus.REVIEW_APPROVAL,
                reviewStatus: 'pending' as const,
                approvalStatus: 'pending' as const
            };

            const result = await apiService.updateContractMetadata(contractId, updateData);

            if (result.success) {
                return { success: true, message: 'Contract submitted for review and approval' };
            } else {
                return { success: false, message: result.message || 'Failed to submit for review' };
            }
        } catch (error) {
            console.error('Submit for review failed:', error);
            return { success: false, message: 'Failed to submit for review' };
        }
    }

    /**
     * Add additional reviewers to a contract (for "Send for Further Review" flow)
     * Preserves existing reviewer statuses and keeps the existing approver
     */
    async addAdditionalReviewers(contractId: string, additionalReviewerEmails: string[]): Promise<{
        success: boolean;
        message: string;
    }> {
        try {
            const contract = await this.getContractById(contractId);
            if (!contract) return { success: false, message: 'Contract not found' };

            // Get existing reviewers (preserve their statuses)
            const existingReviewers = contract.reviewers || [];
            const existingEmails = new Set(existingReviewers.map(r => r.email));

            // Only add reviewers that don't already exist
            const newReviewerInfos: ReviewerInfo[] = additionalReviewerEmails
                .filter(email => !existingEmails.has(email))
                .map(email => ({
                    email,
                    status: 'pending' as const
                }));

            if (newReviewerInfos.length === 0) {
                return { success: false, message: 'All selected reviewers are already assigned' };
            }

            // Merge: keep existing reviewers with their statuses + add new ones as pending
            const mergedReviewers = [...existingReviewers, ...newReviewerInfos];

            const updateData: Record<string, any> = {
                reviewers: mergedReviewers,
                status: ContractStatus.REVIEW_APPROVAL,
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

            // If all reviewed, update contract reviewStatus and status
            if (allReviewed) {
                updates.reviewStatus = 'reviewed';
                // Also update main status to REVIEWED explicitly so Approver sees it as "READY FOR APPROVAL"
                updates.status = ContractStatus.REVIEWED;
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
                status: ContractStatus.APPROVED
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
            signed: contract?.status === ContractStatus.SIGNED,
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