import { Contract, ReviewerInfo, ApproverInfo, ModificationRequest, ContractStatus } from '@/types/contract';
import {
    submitForExternalSignature as submitExternal,
    checkSignatureStatus
} from './externalSignatureService';

const CONTRACTS_STORAGE_KEY = 'cms_contracts';

class ContractService {
    /**
     * Initialize default contracts if not exists
     */
    private initializeContracts(): void {
        if (typeof window === 'undefined') return;

        const existing = localStorage.getItem(CONTRACTS_STORAGE_KEY);
        if (!existing) {
            localStorage.setItem(CONTRACTS_STORAGE_KEY, JSON.stringify([]));
        }
    }

    /**
     * Update contract statuses based on date logic
     */
    private updateContractStatuses(contracts: Contract[]): Contract[] {
        const today = new Date().toISOString().split('T')[0];

        return contracts.map(c => {
            // Only run logic on these final states
            if (![ContractStatus.SIGNED, ContractStatus.ACTIVE, ContractStatus.EXPIRING].includes(c.status)) {
                return c;
            }

            let newStatus = c.status;

            // 1. Signed -> Active (Start Date Passed)
            if (c.status === ContractStatus.SIGNED) {
                if (c.startDate && c.startDate <= today) newStatus = ContractStatus.ACTIVE;
            }

            // 2. Active -> Expiring (7 Days Rule)
            if (newStatus === ContractStatus.ACTIVE && c.endDate) {
                const endDate = new Date(c.endDate);
                const warningDate = new Date(endDate);
                warningDate.setDate(endDate.getDate() - 7); // 7 DAYS WARNING
                const warningStr = warningDate.toISOString().split('T')[0];

                if (today >= warningStr) newStatus = ContractStatus.EXPIRING;
            }

            // 3. Any -> Expired
            if (c.endDate && today > c.endDate) newStatus = ContractStatus.EXPIRED;

            return newStatus !== c.status ? { ...c, status: newStatus } : c;
        });
    }

    /**
     * Get all contracts from localStorage
     */
    getAllContracts(): Contract[] {
        if (typeof window === 'undefined') return [];

        this.initializeContracts();
        const contractsData = localStorage.getItem(CONTRACTS_STORAGE_KEY);
        let contracts = contractsData ? JSON.parse(contractsData) : [];

        // Run status updates logic
        contracts = this.updateContractStatuses(contracts);

        return contracts;
    }

    /**
     * Get contracts created by specific user
     */
    getContractsCreatedByUser(email: string): Contract[] {
        const allContracts = this.getAllContracts();
        return allContracts.filter(c => c.createdBy === email);
    }

    /**
     * Save all contracts to localStorage
     */
    private saveContracts(contracts: Contract[]): void {
        if (typeof window === 'undefined') return;

        localStorage.setItem(CONTRACTS_STORAGE_KEY, JSON.stringify(contracts));
    }

    /**
     * Generate unique contract ID
     */
    private generateContractId(): string {
        return `contract_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    }

    /**
     * Create new contract
     */
    async createContract(data: Omit<Contract, 'id' | 'createdAt' | 'updatedAt'>): Promise<{
        success: boolean;
        message: string;
        contract?: Contract;
    }> {
        // Simulate API delay
        await new Promise(resolve => setTimeout(resolve, 500));

        try {
            const newContract: Contract = {
                ...data,
                status: ContractStatus.DRAFT,
                id: this.generateContractId(),
                createdAt: new Date().toISOString(),
            };

            const contracts = this.getAllContracts();
            contracts.unshift(newContract); // Add to beginning
            this.saveContracts(contracts);

            return {
                success: true,
                message: 'Contract created successfully',
                contract: newContract,
            };
        } catch (error) {
            return {
                success: false,
                message: 'Failed to create contract. Please try again.',
            };
        }
    }

    /**
     * Get contract by ID
     */
    getContractById(id: string): Contract | undefined {
        const contracts = this.getAllContracts();
        return contracts.find(contract => contract.id === id);
    }

    /**
     * Update contract
     */
    async updateContract(id: string, updates: Partial<Contract>): Promise<{
        success: boolean;
        message: string;
        contract?: Contract;
    }> {
        await new Promise(resolve => setTimeout(resolve, 300));

        const contracts = this.getAllContracts();
        const index = contracts.findIndex(c => c.id === id);

        if (index === -1) {
            return {
                success: false,
                message: 'Contract not found',
            };
        }

        const updatedContract = {
            ...contracts[index],
            ...updates,
            updatedAt: new Date().toISOString(),
        };

        contracts[index] = updatedContract;
        this.saveContracts(contracts);

        return {
            success: true,
            message: 'Contract updated successfully',
            contract: updatedContract,
        };
    }

    /**
     * Update contract XFDF data (for client signatures)
     */
    async updateContractXfdf(id: string, xfdfString: string): Promise<{
        success: boolean;
        message: string;
        contract?: Contract;
    }> {
        await new Promise(resolve => setTimeout(resolve, 300));

        const contracts = this.getAllContracts();
        const index = contracts.findIndex(c => c.id === id);

        if (index === -1) {
            return {
                success: false,
                message: 'Contract not found',
            };
        }

        const updatedContract = {
            ...contracts[index],
            xfdfString, // Update XFDF data with client signature
            updatedAt: new Date().toISOString(),
        };

        contracts[index] = updatedContract;
        this.saveContracts(contracts);

        return {
            success: true,
            message: 'Signature saved successfully',
            contract: updatedContract,
        };
    }

    /**
     * Delete contract
     */
    async deleteContract(id: string): Promise<{ success: boolean; message: string }> {
        await new Promise(resolve => setTimeout(resolve, 300));

        const contracts = this.getAllContracts();
        const index = contracts.findIndex(c => c.id === id);

        if (index === -1) {
            return {
                success: false,
                message: 'Contract not found',
            };
        }

        contracts.splice(index, 1);
        this.saveContracts(contracts);

        return {
            success: true,
            message: 'Contract deleted successfully',
        };
    }

    /**
     * Submit contract for review and approval
     * @param contractId - ID of the contract
     * @param reviewers - Array of reviewer email addresses
     * @param approver - Approver email address
     */
    async submitForReview(
        contractId: string,
        reviewers: string[],
        approver: string
    ): Promise<{ success: boolean; message: string; contract?: Contract }> {
        await new Promise(resolve => setTimeout(resolve, 500));

        const contracts = this.getAllContracts();
        const index = contracts.findIndex(c => c.id === contractId);

        if (index === -1) {
            return {
                success: false,
                message: 'Contract not found',
            };
        }

        // Create reviewer info objects
        const reviewerInfo = reviewers.map(email => ({
            email,
            status: 'pending' as const,
        }));

        // Create approver info object
        const approverInfo = approver ? {
            email: approver,
            status: 'pending' as const,
        } : undefined;

        // Update contract with review/approval tracking
        const updatedContract: Contract = {
            ...contracts[index],
            status: ContractStatus.REVIEW_APPROVAL,
            reviewers: reviewerInfo.length > 0 ? reviewerInfo : undefined,
            approver: approverInfo,
            reviewStatus: reviewers.length > 0 ? 'pending' : undefined,
            approvalStatus: approver ? 'pending' : undefined,
            updatedAt: new Date().toISOString(),
        };

        contracts[index] = updatedContract;
        this.saveContracts(contracts);

        return {
            success: true,
            message: 'Contract submitted for review and approval',
            contract: updatedContract,
        };
    }

    /**
     * Mark contract as reviewed by a specific reviewer
     * @param contractId - ID of the contract
     * @param reviewerEmail - Email of the reviewer
     */
    async markAsReviewed(
        contractId: string,
        reviewerEmail: string
    ): Promise<{ success: boolean; message: string; contract?: Contract }> {
        await new Promise(resolve => setTimeout(resolve, 300));

        const contracts = this.getAllContracts();
        const index = contracts.findIndex(c => c.id === contractId);

        if (index === -1) {
            return {
                success: false,
                message: 'Contract not found',
            };
        }

        const contract = contracts[index];

        // Find reviewer in the reviewers list
        if (!contract.reviewers) {
            return {
                success: false,
                message: 'No reviewers assigned to this contract',
            };
        }

        const reviewerIndex = contract.reviewers.findIndex(r => r.email === reviewerEmail);

        if (reviewerIndex === -1) {
            return {
                success: false,
                message: 'You are not assigned as a reviewer for this contract',
            };
        }

        // Update reviewer status
        const updatedReviewers = [...contract.reviewers];
        updatedReviewers[reviewerIndex] = {
            ...updatedReviewers[reviewerIndex],
            status: 'reviewed' as const,
            reviewedAt: new Date().toISOString(),
        };

        // Check if all reviewers have reviewed
        const allReviewed = updatedReviewers.every(r => r.status === 'reviewed');

        const updatedContract: Contract = {
            ...contract,
            reviewers: updatedReviewers,
            status: allReviewed ? ContractStatus.REVIEWED : contract.status, 
            reviewStatus: allReviewed ? 'reviewed' : 'in_review',
            updatedAt: new Date().toISOString(),
        };

        contracts[index] = updatedContract;
        this.saveContracts(contracts);

        return {
            success: true,
            message: allReviewed
                ? 'All reviews complete! Contract ready for approval.'
                : 'Contract marked as reviewed',
            contract: updatedContract,
        };
    }

    /**
     * Request modification for a contract
     * @param contractId - ID of the contract
     * @param requesterEmail - Email of the user requesting changes
     * @param requesterRole - Role of the user ('reviewer' | 'approver')
     * @param comments - Modification comments
     */
    async requestModification(
        contractId: string,
        requesterEmail: string,
        requesterRole: 'reviewer' | 'approver',
        comments: string
    ): Promise<{ success: boolean; message: string; contract?: Contract }> {
        await new Promise(resolve => setTimeout(resolve, 500));

        const contracts = this.getAllContracts();
        const index = contracts.findIndex(c => c.id === contractId);

        if (index === -1) {
            return {
                success: false,
                message: 'Contract not found',
            };
        }

        const contract = contracts[index];

        // Create new modification request
        const newHelperAttempt: ModificationRequest = {
            requestedBy: requesterEmail,
            role: requesterRole,
            comments,
            requestedAt: new Date().toISOString(),
        };

        // Update contract status and add modification request
        const updatedContract: Contract = {
            ...contract,
            status: ContractStatus.DRAFT, // Return to draft
            reviewStatus: 'changes_requested',
            // Add to existing requests or create new array
            modificationRequests: [
                ...(contract.modificationRequests || []),
                newHelperAttempt,
            ],
            // Keep legacy comments for backward compatibility
            modificationComments: comments,
            // Clear current reviewers and approver as the process will restart
            reviewers: undefined,
            approver: undefined,
            approvalStatus: undefined,
            updatedAt: new Date().toISOString(),
        };

        contracts[index] = updatedContract;
        this.saveContracts(contracts);

        return {
            success: true,
            message: 'Modification requested. Contract returned to initiator.',
            contract: updatedContract,
        };
    }

    /**
     * Approve contract (updated to check reviewers and change status to waiting_for_signature)
     * @param contractId - ID of the contract
     * @param approverEmail - Email of the approver
     */
    async approveContract(
        contractId: string,
        approverEmail?: string
    ): Promise<{ success: boolean; message: string; contract?: Contract }> {
        await new Promise(resolve => setTimeout(resolve, 300));

        const contracts = this.getAllContracts();
        const index = contracts.findIndex(c => c.id === contractId);

        if (index === -1) {
            return {
                success: false,
                message: 'Contract not found',
            };
        }

        const contract = contracts[index];

        // Check if all reviewers have reviewed (if reviewers exist)
        if (contract.reviewers && contract.reviewers.length > 0) {
            const allReviewed = contract.reviewers.every(r => r.status === 'reviewed');

            if (!allReviewed) {
                return {
                    success: false,
                    message: 'Cannot approve: Not all reviewers have completed their review',
                };
            }
        }

        // Update approver status if approver email is provided
        let updatedApprover = contract.approver;
        if (approverEmail && contract.approver && contract.approver.email === approverEmail) {
            updatedApprover = {
                ...contract.approver,
                status: 'approved' as const,
                approvedAt: new Date().toISOString(),
            };
        }

        // Update contract to waiting_for_signature status
        const updatedContract: Contract = {
            ...contract,
            status: ContractStatus.APPROVED,
            approver: updatedApprover,
            approvalStatus: 'approved',
            updatedAt: new Date().toISOString(),
        };

        contracts[index] = updatedContract;
        this.saveContracts(contracts);

        return {
            success: true,
            message: 'Contract approved! Now waiting for signature.',
            contract: updatedContract,
        };
    }

    /**
     * Submit contract for further review with additional reviewers
     * This allows a reviewer to add more reviewers after marking as reviewed
     * @param contractId - ID of the contract
     * @param additionalReviewers - Array of additional reviewer email addresses
     * @param submittedBy - Email of the user submitting for further review
     */
    async submitForFurtherReview(
        contractId: string,
        additionalReviewers: string[],
        submittedBy: string
    ): Promise<{ success: boolean; message: string; contract?: Contract }> {
        await new Promise(resolve => setTimeout(resolve, 500));

        const contracts = this.getAllContracts();
        const index = contracts.findIndex(c => c.id === contractId);

        if (index === -1) {
            return {
                success: false,
                message: 'Contract not found',
            };
        }

        const contract = contracts[index];

        // Create new reviewer info objects for additional reviewers
        const newReviewers = additionalReviewers.map(email => ({
            email,
            status: 'pending' as const,
        }));

        // Combine existing reviewers with new ones
        const updatedReviewers = [
            ...(contract.reviewers || []),
            ...newReviewers,
        ];

        // Update contract with additional reviewers
        const updatedContract: Contract = {
            ...contract,
            reviewers: updatedReviewers,
            reviewStatus: 'in_review', // Reset to in_review since new reviewers added
            updatedAt: new Date().toISOString(),
        };

        contracts[index] = updatedContract;
        this.saveContracts(contracts);

        return {
            success: true,
            message: `Contract sent to ${additionalReviewers.length} additional reviewer${additionalReviewers.length > 1 ? 's' : ''} for review`,
            contract: updatedContract,
        };
    }

    /**
     * Get contracts assigned to a user for review or approval
     * @param userEmail - Email of the user
     * @returns Array of contracts where user is reviewer or approver
     */
    getContractsForReview(userEmail: string): Contract[] {
        const allContracts = this.getAllContracts();

        return allContracts.filter(contract => {
            const isReviewer = contract.reviewers?.some(r => r.email === userEmail);
            const isApprover = contract.approver?.email === userEmail;
            // ALLOW BOTH 'REVIEW_APPROVAL' AND 'REVIEWED'
            // Reviewers work on 'REVIEW_APPROVAL'
            // Approvers need to see 'REVIEWED' (Ready for Approval)
            const isValidStatus = 
                contract.status === ContractStatus.REVIEW_APPROVAL || 
                contract.status === ContractStatus.REVIEWED;
            return (isReviewer || isApprover) && isValidStatus;
        });
    }

    /**
     * Clear all contracts (for testing)
     */
    clearAllContracts(): void {
        if (typeof window === 'undefined') return;
        localStorage.removeItem(CONTRACTS_STORAGE_KEY);
    }
    /**
     * Submit contract for signature
     * STAGE: Approved -> Waiting for Signature
     */
    async submitForSignature(
        contractId: string,
        signerEmail: string
    ): Promise<{ success: boolean; message: string; contract?: Contract }> {
        await new Promise(resolve => setTimeout(resolve, 500));
        const contracts = this.getAllContracts();
        const index = contracts.findIndex(c => c.id === contractId);
        if (index === -1) {
            return {
                success: false,
                message: 'Contract not found',
            };
        }
        const contract = contracts[index];
        // --- STRICT CHECK START ---
        // Only allow sending if the contract is fully APPROVED.
        if (contract.status !== ContractStatus.APPROVED) {
            return {
                success: false,
                message: `Cannot send for signature. Contract status is '${contract.status}', but must be '${ContractStatus.APPROVED}'.`,
            };
        }
        // --- STRICT CHECK END ---
        const updatedContract: Contract = {
            ...contract,
            status: ContractStatus.WAITING_FOR_SIGNATURE, // Explicit Transition
            signer: {
                email: signerEmail,
                status: 'pending',
            },
            updatedAt: new Date().toISOString(),
        };
        contracts[index] = updatedContract;
        this.saveContracts(contracts);
        return {
            success: true,
            message: 'Contract submitted for signature',
            contract: updatedContract,
        };
    }

    /**
     * Get contracts for signature for a specific user
     */
    getContractsForSignature(userEmail: string): Contract[] {
        const allContracts = this.getAllContracts();
        return allContracts.filter(c =>
            c.status === ContractStatus.WAITING_FOR_SIGNATURE &&
            c.signer?.email === userEmail &&
            c.signer?.status === 'pending'
        );
    }

    /**
     * Sign a contract
     */
    async signContract(
        contractId: string,
        signerEmail: string,
        signatureImage?: string
    ): Promise<{ success: boolean; message: string; contract?: Contract }> {
        await new Promise(resolve => setTimeout(resolve, 500));

        const contracts = this.getAllContracts();
        const index = contracts.findIndex(c => c.id === contractId);

        if (index === -1) {
            return {
                success: false,
                message: 'Contract not found',
            };
        }

        const contract = contracts[index];

        if (contract.signer?.email !== signerEmail) {
            return {
                success: false,
                message: 'You are not authorized to sign this contract',
            };
        }

        const updatedContract: Contract = {
            ...contract,
            status: ContractStatus.SIGNED, // or 'active' depending on final workflow
            signer: {
                ...contract.signer,
                status: 'signed',
                signedAt: new Date().toISOString(),
                signatureImage,
            },
            updatedAt: new Date().toISOString(),
        };

        contracts[index] = updatedContract;
        this.saveContracts(contracts);

        return {
            success: true,
            message: 'Contract successfully signed!',
            contract: updatedContract,
        };
    }

    /**
     * Submit contract for external signature via email.
     * This sends an email to the client with a signing link.
     * The client can sign without logging into the system.
     */
    async submitForExternalSignature(
        contractId: string,
        signerEmail: string,
        senderName: string
    ): Promise<{ success: boolean; message: string; signingUrl?: string }> {
        console.log('📝 [ContractService] Submitting for external signature...');
        console.log('📝 [ContractService] Contract ID:', contractId);
        console.log('📝 [ContractService] Signer Email:', signerEmail);

        // Get the contract
        const contract = this.getContractById(contractId);

        if (!contract) {
            console.error('❌ [ContractService] Contract not found:', contractId);
            return { success: false, message: 'Contract not found' };
        }

        // Validate contract status
        if (contract.status !== ContractStatus.APPROVED) {
            console.error('❌ [ContractService] Contract not in APPROVED status:', contract.status);
            return {
                success: false,
                message: 'Contract must be approved before requesting signature'
            };
        }

        // Submit for external signature using the external signature service
        const result = await submitExternal(contract, signerEmail, senderName);

        if (!result.success) {
            console.error('❌ [ContractService] External signature submission failed:', result.error);
            return { success: false, message: result.error || 'Failed to submit for signature' };
        }

        // Update contract with external signing info
        console.log('💾 [ContractService] Updating contract with external signing info...');

        const contracts = this.getAllContracts();
        const index = contracts.findIndex(c => c.id === contractId);

        if (index !== -1) {
            contracts[index] = {
                ...contracts[index],
                status: ContractStatus.WAITING_FOR_SIGNATURE,
                signer: {
                    email: signerEmail,
                    status: 'pending',
                },
                externalSigningToken: result.token,
                externalSigningBinId: result.binId,
                externalSigningUrl: result.signingUrl,
                externalSigningSentAt: new Date().toISOString(),
                updatedAt: new Date().toISOString(),
            };

            this.saveContracts(contracts);
            console.log('✅ [ContractService] Contract updated successfully');
        }

        return {
            success: true,
            message: 'Signature request sent successfully!',
            signingUrl: result.signingUrl,
        };
    }

    /**
     * Poll for external signature completion.
     * Call this periodically to check if client has signed.
     * When signature is detected, updates the local contract automatically.
     */
    async checkExternalSignatureStatus(
        contractId: string
    ): Promise<{
        success: boolean;
        signed: boolean;
        signedXfdf?: string;
        error?: string;
    }> {
        console.log('🔄 [ContractService] Checking external signature status...');

        const contract = this.getContractById(contractId);

        if (!contract?.externalSigningBinId) {
            console.error('❌ [ContractService] No external signing info found');
            return { success: false, signed: false, error: 'No external signing info' };
        }

        const result = await checkSignatureStatus(contract.externalSigningBinId);

        if (!result.success) {
            return { success: false, signed: false, error: result.error };
        }

        // If signed, update local contract
        if (result.status === 'signed' && result.signedXfdf) {
            console.log('🎉 [ContractService] Signature detected! Updating contract...');

            const contracts = this.getAllContracts();
            const index = contracts.findIndex(c => c.id === contractId);

            if (index !== -1) {
                contracts[index] = {
                    ...contracts[index],
                    status: ContractStatus.SIGNED,
                    xfdfString: result.signedXfdf,  // Update with signed XFDF
                    signer: {
                        ...contracts[index].signer!,
                        status: 'signed',
                        signedAt: result.signedAt,
                    },
                    updatedAt: new Date().toISOString(),
                };

                this.saveContracts(contracts);
                console.log('✅ [ContractService] Contract marked as SIGNED');
            }

            return { success: true, signed: true, signedXfdf: result.signedXfdf };
        }

        console.log('⏳ [ContractService] Not yet signed, status:', result.status);
        return { success: true, signed: false };
    }
}

// Export singleton instance
export const contractService = new ContractService();