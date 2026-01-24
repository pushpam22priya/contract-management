import { Template, UploadTemplateData, FormFieldDefinition } from '@/types/template';

const TEMPLATES_STORAGE_KEY = 'cms_templates';

/**
 * MockApiService for Template Management
 * 
 * Simulates a real backend API for template operations.
 * Currently uses localStorage but structured to easily swap to real API.
 */
class MockApiService {
    /**
     * Simulate API delay
     */
    private async simulateDelay(ms: number = 800): Promise<void> {
        await new Promise(resolve => setTimeout(resolve, ms));
    }

    /**
     * Upload template with form fields
     */
    async uploadTemplate(data: {
        name: string;
        description: string;
        category: string;
        file: File;
        uploadedBy: string;
        formFields?: FormFieldDefinition[];
    }): Promise<{ success: boolean; message: string; template?: Template }> {
        console.log('📤 MockAPI: uploadTemplate called');
        console.log('  - Template name:', data.name);
        console.log('  - Form fields:', data.formFields?.length || 0);

        // Simulate API delay
        await this.simulateDelay();

        try {
            // Validate
            if (!data.name || !data.category || !data.file) {
                return {
                    success: false,
                    message: 'Missing required fields'
                };
            }

            // Read file as base64
            const fileUrl = await this.fileToBase64(data.file);

            // Extract base64 without data URL prefix (for docxtemplater)
            const docxBase64 = await new Promise<string>((resolve, reject) => {
                const reader = new FileReader();
                reader.onload = () => {
                    const base64 = (reader.result as string).split(',')[1];
                    resolve(base64);
                };
                reader.onerror = reject;
                reader.readAsDataURL(data.file);
            });

            // Create new template
            const newTemplate: Template = {
                id: `temp_${Date.now()}`,
                name: data.name,
                description: data.description,
                category: data.category,
                fileName: data.file.name,
                fileUrl: fileUrl,
                fileType: data.file.type.includes('pdf') ? 'pdf' : 'docx',
                timesUsed: 0,
                lastUsed: 'Never',
                uploadedBy: data.uploadedBy,
                uploadedAt: new Date().toISOString(),
                docxBase64: docxBase64,
                formFields: data.formFields || [],
                hasFormFields: (data.formFields && data.formFields.length > 0) || false,
            };

            // Get existing templates from localStorage
            const existing = this.getTemplatesFromStorage();

            // Add new template
            existing.push(newTemplate);

            // Save to localStorage
            this.saveTemplatesToStorage(existing);

            console.log('✅ MockAPI: Template uploaded successfully');
            console.log('  - Template ID:', newTemplate.id);
            console.log('  - Form fields saved:', newTemplate.formFields?.length || 0);

            return {
                success: true,
                message: 'Template uploaded successfully',
                template: newTemplate
            };

        } catch (error) {
            console.error('❌ MockAPI: Upload failed:', error);
            return {
                success: false,
                message: 'Failed to upload template'
            };
        }
    }

    /**
     * Get template by ID
     */
    async getTemplateById(id: string): Promise<{ success: boolean; template?: Template; message?: string }> {
        console.log('📥 MockAPI: getTemplateById called');
        console.log('  - Template ID:', id);

        // Simulate API delay
        await this.simulateDelay(300);

        try {
            // Get from localStorage
            const templates = this.getTemplatesFromStorage();
            const template = templates.find(t => t.id === id);

            if (template) {
                console.log('✅ MockAPI: Template found');
                console.log('  - Name:', template.name);
                console.log('  - Has form fields:', template.hasFormFields || false);
                console.log('  - Field count:', template.formFields?.length || 0);

                return {
                    success: true,
                    template: template
                };
            }

            console.log('❌ MockAPI: Template not found');
            return {
                success: false,
                message: 'Template not found'
            };
        } catch (error) {
            console.error('❌ MockAPI: Error fetching template:', error);
            return {
                success: false,
                message: 'Failed to fetch template'
            };
        }
    }

    /**
     * Helper: Convert file to base64
     */
    private async fileToBase64(file: File): Promise<string> {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = () => resolve(reader.result as string);
            reader.onerror = reject;
            reader.readAsDataURL(file);
        });
    }

    /**
     * Helper: Get templates from localStorage
     */
    private getTemplatesFromStorage(): Template[] {
        try {
            const stored = localStorage.getItem(TEMPLATES_STORAGE_KEY);
            return stored ? JSON.parse(stored) : [];
        } catch (error) {
            console.error('Error reading templates from storage:', error);
            return [];
        }
    }

    /**
     * Helper: Save templates to localStorage
     */
    private saveTemplatesToStorage(templates: Template[]): void {
        try {
            localStorage.setItem(TEMPLATES_STORAGE_KEY, JSON.stringify(templates));
        } catch (error) {
            console.error('Error saving templates to storage:', error);
            throw error;
        }
    }

    /**
* Get extended contract details (mock)
*/
    async getContractDetails(id: string): Promise<{
        success: boolean;
        details?: {
            description: string;
            keyTerms: string[];
            documents: any[];
            activities: any[];
        };
        message?: string;
    }> {
        console.log('📥 MockAPI: getContractDetails called', id);
        await this.simulateDelay(500);

        try {
            // Try to find the contract in localStorage to get real title/client
            const storedContracts = localStorage.getItem('cms_contracts');
            const contracts = storedContracts ? JSON.parse(storedContracts) : [];
            const contract = contracts.find((c: any) => c.id === id);

            if (!contract) {
                return { success: false, message: 'Contract not found' };
            }

            // Generate mock details based on the contract
            const details = {
                description: contract.description || 'This is a standard service agreement outlining the terms of engagement, scope of work, and payment deliverables.',
                keyTerms: [
                    'Payment Terms: Net 30',
                    'Jurisdiction: Delhi',
                    'Confidentiality: 2 Years',
                    'Liability Cap: 1x Fees'
                ],
                documents: [
                    {
                        id: contract.id, // Main contract file
                        name: `${contract.title}.pdf`,
                        size: '2.4 MB',
                        uploadDate: new Date(contract.createdAt).toLocaleDateString(),
                        // Use the fileUrl if available, otherwise try to construct from base64
                        url: contract.fileUrl || (contract.templateDocxBase64 ? `data:application/pdf;base64,${contract.templateDocxBase64}` : null)
                    }
                ],
                activities: [
                    {
                        id: 'act_1',
                        title: 'Contract Created',
                        user: contract.createdBy || 'Admin User',
                        date: new Date(contract.createdAt).toLocaleString()
                    },
                    {
                        id: 'act_2',
                        title: 'Sent for Review',
                        user: contract.createdBy || 'Admin User',
                        date: new Date(Date.now() - 86400000).toLocaleString()
                    },
                    {
                        id: 'act_3',
                        title: 'Viewed by Client',
                        user: contract.client,
                        date: new Date().toLocaleString()
                    }
                ]
            };

            return {
                success: true,
                details
            };
        } catch (error) {
            console.error('Error fetching contract details:', error);
            return {
                success: false,
                message: 'Failed to fetch details'
            };
        }
    }
}

// Export singleton instance
export const mockApiService = new MockApiService();
