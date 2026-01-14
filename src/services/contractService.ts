import { Contract, ReviewerInfo, ApproverInfo, ModificationRequest } from '@/types/contract';

const CONTRACTS_STORAGE_KEY = 'cms_contracts';

// Default demo contracts
const DEFAULT_CONTRACTS: Contract[] = [
    // {
    //     // Card display fields
    //     id: 'contract_1',
    //     title: 'Software Development Agreement',
    //     client: 'TechCorp Inc.',
    //     description: 'Custom software development project',
    //     value: '150000',
    //     category: 'Service',
    //     expiresInDays: 245,
    //     status: 'active',

    //     // Template info
    //     templateId: 'temp_2',
    //     templateName: 'Service Agreement',

    //     // Content
    //     content: 'Populated contract content...',
    //     fieldValues: {},

    //     // Dates
    //     startDate: '2024-01-15',
    //     endDate: '2024-12-31',

    //     // Metadata
    //     createdAt: new Date('2024-01-15').toISOString(),
    //     createdBy: 'admin@demo.com',
    // },
    // {
    //     id: 'contract_2',
    //     title: 'Employee NDA',
    //     client: 'John Smith',
    //     description: 'Non-disclosure agreement for new hire',
    //     value: '',
    //     category: 'NDA',
    //     expiresInDays: 380,
    //     status: 'active',

    //     templateId: 'temp_3',
    //     templateName: 'NDA Template',
    //     content: 'Populated NDA content...',
    //     fieldValues: {},
    //     startDate: '2024-02-01',
    //     endDate: '2025-02-01',
    //     createdAt: new Date('2024-02-01').toISOString(),
    //     createdBy: 'admin@demo.com',
    // },
    // {
    //     id: 'contract_3',
    //     title: 'Office Lease Agreement',
    //     client: 'ABC Properties Ltd.',
    //     description: 'Commercial office space rental',
    //     value: '50000',
    //     category: 'Lease',
    //     expiresInDays: 20,
    //     status: 'review_approval',

    //     templateId: 'temp_5',
    //     templateName: 'Lease Agreement',
    //     content: 'Populated lease content...',
    //     fieldValues: {},
    //     startDate: '2024-01-01',
    //     endDate: '2024-12-31',
    //     createdAt: new Date('2024-01-01').toISOString(),
    //     createdBy: 'admin@demo.com',
    // },
];

class ContractService {
    /**
     * Initialize default contracts if not exists
     */
    private initializeContracts(): void {
        if (typeof window === 'undefined') return;

        const existing = localStorage.getItem(CONTRACTS_STORAGE_KEY);
        if (!existing) {
            localStorage.setItem(CONTRACTS_STORAGE_KEY, JSON.stringify(DEFAULT_CONTRACTS));
        }
    }

    /**
     * Update contract statuses based on date logic
     */
    private updateContractStatuses(contracts: Contract[]): Contract[] {
        const today = new Date().toISOString().split('T')[0];
        let hasChanges = false;

        const updatedContracts = contracts.map(contract => {
            let newStatus = contract.status;

            // 1. Signed -> Active (if start date reached)
            if (contract.status === 'signed' && contract.startDate && contract.startDate <= today) {
                newStatus = 'active';
            }

            // 2. Active -> Expiring (if within 30 days of end date)
            if (contract.status === 'active' && contract.endDate) {
                const endDate = new Date(contract.endDate);
                const warningDate = new Date(endDate);
                warningDate.setDate(endDate.getDate() - 30);
                const warningDateString = warningDate.toISOString().split('T')[0];

                if (today >= warningDateString && today <= contract.endDate) {
                    newStatus = 'expiring';
                }
            }

            // 3. active/expiring/signed -> Expired (if end date passed)
            if ((contract.status === 'active' || contract.status === 'expiring' || contract.status === 'signed') && contract.endDate) {
                if (today > contract.endDate) {
                    newStatus = 'expired';
                }
            }

            if (newStatus !== contract.status) {
                hasChanges = true;
                return { ...contract, status: newStatus };
            }
            return contract;
        });

        if (hasChanges && typeof window !== 'undefined') {
            localStorage.setItem(CONTRACTS_STORAGE_KEY, JSON.stringify(updatedContracts));
        }

        return updatedContracts;
    }

    /**
     * Get all contracts from localStorage
     */
    getAllContracts(): Contract[] {
        if (typeof window === 'undefined') return DEFAULT_CONTRACTS;

        this.initializeContracts();
        const contractsData = localStorage.getItem(CONTRACTS_STORAGE_KEY);
        let contracts = contractsData ? JSON.parse(contractsData) : DEFAULT_CONTRACTS;

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
            status: 'review_approval' as const,
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
            status: 'draft', // Return to draft
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
            status: 'waiting_for_signature' as const,
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
            // Check if user is a reviewer
            const isReviewer = contract.reviewers?.some(r => r.email === userEmail);

            // Check if user is the approver
            const isApprover = contract.approver?.email === userEmail;

            // Return contracts where user is involved and status is review_approval
            return (isReviewer || isApprover) && contract.status === 'review_approval';
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

        const updatedContract: Contract = {
            ...contract,
            status: 'waiting_for_signature',
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
            c.status === 'waiting_for_signature' &&
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
            status: 'signed', // or 'active' depending on final workflow
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
}

// Export singleton instance
export const contractService = new ContractService();