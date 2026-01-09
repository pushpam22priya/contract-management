import { Template, UploadTemplateData } from '@/types/template';

const TEMPLATES_STORAGE_KEY = 'cms_templates';

// Default templates for demo
const DEFAULT_TEMPLATES: Template[] = [
    {
        id: 'temp_1',
        name: 'Employment Contract Template',
        description: 'Standard employment agreement for full-time employees',
        category: 'Employment',
        fileName: 'employment_contract.pdf',
        fileUrl: '/templates/employment_contract.pdf',
        fileType: 'pdf',
        timesUsed: 45,
        lastUsed: '2 days ago',
        uploadedBy: 'admin@demo.com',
        uploadedAt: new Date('2024-01-15').toISOString(),
    },
    {
        id: 'temp_2',
        name: 'Service Agreement',
        description: 'Professional services contract template',
        category: 'Service',
        fileName: 'service_agreement.docx',
        fileUrl: '/templates/service_agreement.docx',
        fileType: 'docx',
        timesUsed: 32,
        lastUsed: '5 days ago',
        uploadedBy: 'admin@demo.com',
        uploadedAt: new Date('2024-01-10').toISOString(),
    },
    {
        id: 'temp_3',
        name: 'NDA Template',
        description: 'Non-disclosure agreement for confidential information',
        category: 'NDA',
        fileName: 'nda_template.pdf',
        fileUrl: '/templates/nda_template.pdf',
        fileType: 'pdf',
        timesUsed: 67,
        lastUsed: '1 day ago',
        uploadedBy: 'admin@demo.com',
        uploadedAt: new Date('2024-01-20').toISOString(),
    },
    {
        id: 'temp_4',
        name: 'Sales Contract',
        description: 'Template for product or service sales agreements',
        category: 'Sales',
        fileName: 'sales_contract.pdf',
        fileUrl: '/templates/sales_contract.pdf',
        fileType: 'pdf',
        timesUsed: 28,
        lastUsed: '3 days ago',
        uploadedBy: 'admin@demo.com',
        uploadedAt: new Date('2024-01-12').toISOString(),
    },
    {
        id: 'temp_5',
        name: 'Lease Agreement',
        description: 'Residential or commercial property lease template',
        category: 'Lease',
        fileName: 'lease_agreement.docx',
        fileUrl: '/templates/lease_agreement.docx',
        fileType: 'docx',
        timesUsed: 19,
        lastUsed: '1 week ago',
        uploadedBy: 'admin@demo.com',
        uploadedAt: new Date('2024-01-08').toISOString(),
    },
];

class TemplateService {
    /**
     * Initialize default templates if not exists
     */
    private initializeTemplates(): void {
        if (typeof window === 'undefined') return;

        const existing = localStorage.getItem(TEMPLATES_STORAGE_KEY);
        if (!existing) {
            localStorage.setItem(TEMPLATES_STORAGE_KEY, JSON.stringify(DEFAULT_TEMPLATES));
        }
    }

    /**
     * Get all templates from localStorage
     */
    getAllTemplates(): Template[] {
        if (typeof window === 'undefined') return DEFAULT_TEMPLATES;

        this.initializeTemplates();
        const templatesData = localStorage.getItem(TEMPLATES_STORAGE_KEY);
        return templatesData ? JSON.parse(templatesData) : DEFAULT_TEMPLATES;
    }

    /**
     * Save all templates to localStorage
     */
    private saveTemplates(templates: Template[]): void {
        if (typeof window === 'undefined') return;

        localStorage.setItem(TEMPLATES_STORAGE_KEY, JSON.stringify(templates));
    }

    /**
     * Generate unique template ID
     */
    private generateTemplateId(): string {
        return `temp_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    }

    /**
     * Get file type from file extension
     */
    private getFileType(fileName: string): 'pdf' | 'docx' | 'doc' {
        const ext = fileName.split('.').pop()?.toLowerCase();
        if (ext === 'pdf') return 'pdf';
        if (ext === 'docx') return 'docx';
        if (ext === 'doc') return 'doc';
        return 'pdf';
    }

    /**
     * Convert file to base64 (for mock storage)
     */
    private async fileToBase64(file: File): Promise<string> {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.readAsDataURL(file);
            reader.onload = () => resolve(reader.result as string);
            reader.onerror = error => reject(error);
        });
    }

    /**
     * Upload new template
     */
    async uploadTemplate(data: UploadTemplateData, userEmail: string): Promise<{ success: boolean; message: string; template?: Template }> {
        // Simulate API delay
        await new Promise(resolve => setTimeout(resolve, 800));

        // Validation
        if (!data.name || data.name.trim().length === 0) {
            return {
                success: false,
                message: 'Template name is required',
            };
        }

        if (!data.category || data.category.trim().length === 0) {
            return {
                success: false,
                message: 'Category is required',
            };
        }

        if (!data.file) {
            return {
                success: false,
                message: 'File is required',
            };
        }

        // Validate file type
        const allowedTypes = ['application/pdf', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', 'application/msword'];
        if (!allowedTypes.includes(data.file.type)) {
            return {
                success: false,
                message: 'Only PDF, DOCX, and DOC files are allowed',
            };
        }

        // Validate file size (max 10MB)
        const maxSize = 10 * 1024 * 1024; // 10MB
        if (data.file.size > maxSize) {
            return {
                success: false,
                message: 'File size must be less than 10MB',
            };
        }

        try {
            // Convert file to base64 for storage (in real app, you'd upload to a server)
            const fileUrl = await this.fileToBase64(data.file);

            const newTemplate: Template = {
                id: this.generateTemplateId(),
                name: data.name.trim(),
                description: data.description?.trim() || '',
                category: data.category,
                fileName: data.file.name,
                fileUrl: fileUrl,
                fileType: this.getFileType(data.file.name),
                timesUsed: 0,
                lastUsed: 'Never',
                uploadedBy: userEmail,
                uploadedAt: new Date().toISOString(),
            };

            const templates = this.getAllTemplates();
            templates.unshift(newTemplate); // Add to beginning
            this.saveTemplates(templates);

            return {
                success: true,
                message: 'Template uploaded successfully',
                template: newTemplate,
            };
        } catch (error) {
            return {
                success: false,
                message: 'Failed to upload template. Please try again.',
            };
        }
    }

    /**
     * Get templates by category
     */
    getTemplatesByCategory(category: string): Template[] {
        const templates = this.getAllTemplates();
        return templates.filter(template => template.category === category);
    }

    /**
     * Get template by ID
     */
    getTemplateById(id: string): Template | undefined {
        const templates = this.getAllTemplates();
        return templates.find(template => template.id === id);
    }

    /**
     * Update template usage
     */
    updateTemplateUsage(id: string): void {
        const templates = this.getAllTemplates();
        const templateIndex = templates.findIndex(template => template.id === id);

        if (templateIndex !== -1) {
            templates[templateIndex].timesUsed += 1;
            templates[templateIndex].lastUsed = 'Just now';
            this.saveTemplates(templates);
        }
    }

    /**
     * Update template
     */
    async updateTemplate(
        id: string,
        data: { name: string; description?: string; category: string; file?: File },
        userEmail: string
    ): Promise<{ success: boolean; message: string; template?: Template }> {
        // Simulate API delay
        await new Promise(resolve => setTimeout(resolve, 500));

        // Validation
        if (!data.name || data.name.trim().length === 0) {
            return {
                success: false,
                message: 'Template name is required',
            };
        }

        if (!data.category || data.category.trim().length === 0) {
            return {
                success: false,
                message: 'Category is required',
            };
        }

        const templates = this.getAllTemplates();
        const templateIndex = templates.findIndex(template => template.id === id);

        if (templateIndex === -1) {
            return {
                success: false,
                message: 'Template not found',
            };
        }

        try {
            const existingTemplate = templates[templateIndex];

            // If new file is provided, validate and convert it
            let fileUrl = existingTemplate.fileUrl;
            let fileName = existingTemplate.fileName;
            let fileType = existingTemplate.fileType;

            if (data.file) {
                // Validate file type
                const allowedTypes = ['application/pdf', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', 'application/msword'];
                if (!allowedTypes.includes(data.file.type)) {
                    return {
                        success: false,
                        message: 'Only PDF, DOCX, and DOC files are allowed',
                    };
                }

                // Validate file size (max 10MB)
                const maxSize = 10 * 1024 * 1024;
                if (data.file.size > maxSize) {
                    return {
                        success: false,
                        message: 'File size must be less than 10MB',
                    };
                }

                fileUrl = await this.fileToBase64(data.file);
                fileName = data.file.name;
                fileType = this.getFileType(data.file.name);
            }

            const updatedTemplate: Template = {
                ...existingTemplate,
                name: data.name.trim(),
                description: data.description?.trim() || '',
                category: data.category,
                fileName,
                fileUrl,
                fileType,
                uploadedBy: userEmail,
                uploadedAt: new Date().toISOString(),
            };

            templates[templateIndex] = updatedTemplate;
            this.saveTemplates(templates);

            return {
                success: true,
                message: 'Template updated successfully',
                template: updatedTemplate,
            };
        } catch (error) {
            return {
                success: false,
                message: 'Failed to update template. Please try again.',
            };
        }
    }

    /**
     * Delete template
     */
    async deleteTemplate(id: string): Promise<{ success: boolean; message: string }> {
        // Simulate API delay
        await new Promise(resolve => setTimeout(resolve, 300));

        const templates = this.getAllTemplates();
        const templateIndex = templates.findIndex(template => template.id === id);

        if (templateIndex === -1) {
            return {
                success: false,
                message: 'Template not found',
            };
        }

        templates.splice(templateIndex, 1);
        this.saveTemplates(templates);

        return {
            success: true,
            message: 'Template deleted successfully',
        };
    }

    /**
     * Clear all templates (for testing)
     */
    clearAllTemplates(): void {
        if (typeof window === 'undefined') return;

        localStorage.removeItem(TEMPLATES_STORAGE_KEY);
    }
}

// Export singleton instance
export const templateService = new TemplateService();
