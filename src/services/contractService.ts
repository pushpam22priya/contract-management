import { Contract } from '@/types/contract';

const CONTRACTS_STORAGE_KEY = 'cms_contracts';

// Default demo contracts
const DEFAULT_CONTRACTS: Contract[] = [
    {
        // Card display fields
        id: 'contract_1',
        title: 'Software Development Agreement',
        client: 'TechCorp Inc.',
        description: 'Custom software development project',
        value: '150000',
        category: 'Service',
        expiresInDays: 245,
        status: 'active',

        // Template info
        templateId: 'temp_2',
        templateName: 'Service Agreement',

        // Content
        content: 'Populated contract content...',
        fieldValues: {},

        // Dates
        startDate: '2024-01-15',
        endDate: '2024-12-31',

        // Metadata
        createdAt: new Date('2024-01-15').toISOString(),
        createdBy: 'admin@demo.com',
    },
    {
        id: 'contract_2',
        title: 'Employee NDA',
        client: 'John Smith',
        description: 'Non-disclosure agreement for new hire',
        value: '',
        category: 'NDA',
        expiresInDays: 380,
        status: 'active',

        templateId: 'temp_3',
        templateName: 'NDA Template',
        content: 'Populated NDA content...',
        fieldValues: {},
        startDate: '2024-02-01',
        endDate: '2025-02-01',
        createdAt: new Date('2024-02-01').toISOString(),
        createdBy: 'admin@demo.com',
    },
    {
        id: 'contract_3',
        title: 'Office Lease Agreement',
        client: 'ABC Properties Ltd.',
        description: 'Commercial office space rental',
        value: '50000',
        category: 'Lease',
        expiresInDays: 20,
        status: 'review_approval',

        templateId: 'temp_5',
        templateName: 'Lease Agreement',
        content: 'Populated lease content...',
        fieldValues: {},
        startDate: '2024-01-01',
        endDate: '2024-12-31',
        createdAt: new Date('2024-01-01').toISOString(),
        createdBy: 'admin@demo.com',
    },
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
     * Get all contracts from localStorage
     */
    getAllContracts(): Contract[] {
        if (typeof window === 'undefined') return DEFAULT_CONTRACTS;

        this.initializeContracts();
        const contractsData = localStorage.getItem(CONTRACTS_STORAGE_KEY);
        return contractsData ? JSON.parse(contractsData) : DEFAULT_CONTRACTS;
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
     * Approve contract (change status from review_approval to active)
     */
    async approveContract(id: string): Promise<{ success: boolean; message: string; contract?: Contract }> {
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
            status: 'active' as const,
            updatedAt: new Date().toISOString(),
        };

        contracts[index] = updatedContract;
        this.saveContracts(contracts);

        return {
            success: true,
            message: 'Contract approved and moved to active contracts',
            contract: updatedContract,
        };
    }

    /**
     * Clear all contracts (for testing)
     */
    clearAllContracts(): void {
        if (typeof window === 'undefined') return;
        localStorage.removeItem(CONTRACTS_STORAGE_KEY);
    }
}

// Export singleton instance
export const contractService = new ContractService();