import { Template, UploadTemplateData } from '@/types/template';
import { Contract } from '@/types/contract';

// Use environment variable for base URL or default to relative path
const API_BASE = '/api';

export const apiService = {
    /**
     * Fetch all templates (metadata only)
     */
    async getTemplates(): Promise<Template[]> {
        const res = await fetch(`${API_BASE}/templates`, { cache: 'no-store' });
        if (!res.ok) throw new Error('Failed to fetch templates');
        const templates = await res.json();
        return templates.map((t: any) => ({
            ...t,
            // If legacy fileUrl/fileData exists, use it? Or prefer binary endpoint?
            // We'll fallback to binary endpoint if legacy is missing
            fileUrl: t.fileUrl || t.fileData || `${API_BASE}/file/${t.id}?type=template`
        }));
    },

    /**
     * Upload a new template
     * Uses 2-step process: 
     * 1. POST metadata -> Get ID
     * 2. PUT binary file -> /api/file/[id]
     */
    async uploadTemplate(data: UploadTemplateData): Promise<{ success: boolean; id?: string; message: string }> {
        try {
            // Step 1: Create Metadata
            const metadata = {
                name: data.name,
                description: data.description,
                category: data.category,
                fileName: data.fileName,
                fileType: data.fileName.endsWith('.docx') ? 'docx' : 'pdf',
                uploadedBy: 'user', // Replace with real user info if available
                xfdfData: data.xfdfData,
                formFields: data.formFields,
            };

            const metaRes = await fetch(`${API_BASE}/templates`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify(metadata),
            });

            if (!metaRes.ok) {
                throw new Error('Failed to create template metadata');
            }

            const { id } = await metaRes.json();

            // Step 2: Upload Binary
            const fileType = data.fileName.endsWith('.docx') ? 'docx' : 'pdf';
            const uploadRes = await fetch(`${API_BASE}/file/${id}?type=template&format=${fileType}`, {
                method: 'PUT',
                // Send raw binary body - NO JSON, NO FormData wrapper
                body: data.file,
                headers: {
                    // Let browser set Content-Type if possible, or set it explicitly
                    // 'Content-Type': data.file.type 
                    // Actually, for raw streams, standard fetch handles Blob/File correctly
                }
            });

            if (!uploadRes.ok) {
                throw new Error('Failed to upload binary content');
            }

            return { success: true, id, message: 'Template uploaded successfully' };

        } catch (error: any) {
            console.error('Upload failed:', error);
            return { success: false, message: error.message || 'Upload failed' };
        }
    },

    /**
     * Get template by ID
     */
    async getTemplateById(id: string): Promise<Template | null> {
        // We can just fetch from the list endpoint filtering, or reuse the list 
        // ideally we would have a specific endpoint but for now we might fetch all?
        // Let's implement a specific fetch if needed, but our route returns list. 
        // Let's modify route to support /api/templates/[id]? No, let's filter client side for now OR fetch list.
        // Actually, usually we want a single fetch. 
        // I'll assume for this migration we fit into the existing patterns. 
        // The previous mock reused local array. 
        // Let's stick to getTemplates() and find() for now to save route creation time, 
        // OR create a helper to fetch list.

        // Better: GET /api/templates returns all.
        const templates = await this.getTemplates();
        return templates.find(t => t.id === id) || null;
    },

    /**
     * Fetch all contracts
     */
    async getContracts(): Promise<any[]> {
        const res = await fetch(`${API_BASE}/contracts`, { cache: 'no-store' });
        if (!res.ok) throw new Error('Failed to fetch contracts');
        return res.json();
    },

    /**
     * Get contract details
     */
    async getContractDetails(id: string): Promise<any | null> {
        const contracts = await this.getContracts();
        return contracts.find((c: any) => c.id === id) || null;
    },

    /**
     * Save a contract (binary update)
     * used for signing or saving updates
     */
    async saveContractPdf(id: string, pdfBlob: Blob): Promise<{ success: boolean }> {
        try {
            const res = await fetch(`${API_BASE}/file/${id}?type=contract`, {
                method: 'PUT',
                body: pdfBlob
            });
            if (!res.ok) throw new Error('Failed to save PDF');
            return { success: true };
        } catch (error) {
            console.error('Save failed:', error);
            return { success: false };
        }
    },

    /**
     * Update contract metadata (including XFDF data, reviewers, status, etc.)
     */
    async updateContractMetadata(id: string, updates: {
        xfdfData?: string;
        formFields?: any[];
        [key: string]: any;
    }): Promise<{ success: boolean; message?: string }> {
        try {
            const res = await fetch(`${API_BASE}/contracts/${id}`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(updates)
            });
            if (!res.ok) throw new Error('Failed to update contract metadata');
            const data = await res.json();
            return { success: true, message: data.message };
        } catch (error) {
            console.error('Update contract metadata failed:', error);
            return { success: false, message: 'Failed to update contract metadata' };
        }
    },

    /**
     * Create a new contract
     */
    async createContract(contractData: any): Promise<{ success: boolean; id?: string }> {
        try {
            const res = await fetch(`${API_BASE}/contracts`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(contractData)
            });
            if (!res.ok) throw new Error('Failed to create contract');
            const data = await res.json();
            return { success: true, id: data.id };
        } catch (error) {
            console.error('Create contract failed:', error);
            return { success: false };
        }
    },

    /**
     * Update template metadata and optional binary
     */
    async updateTemplate(id: string, data: any): Promise<{ success: boolean; message: string; template?: any }> {
        try {
            // Step 1: Update Metadata
            // Extract metadata fields
            const metadata = { ...data };
            // Remove binary fields from metadata payload
            delete metadata.file;
            delete metadata.fileData; // Legacy base64
            delete metadata.fileUrl; // Legacy url

            const metaRes = await fetch(`${API_BASE}/templates/${id}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(metadata),
            });

            if (!metaRes.ok) throw new Error('Failed to update template metadata');

            // Step 2: Upload Binary (if provided as Blob/File)
            if (data.file && (data.file instanceof Blob || data.file instanceof File)) {
                const fileName = data.fileName || 'template.pdf';
                const fileType = fileName.endsWith('.docx') ? 'docx' : 'pdf';

                const uploadRes = await fetch(`${API_BASE}/file/${id}?type=template&format=${fileType}`, {
                    method: 'PUT',
                    body: data.file
                });

                if (!uploadRes.ok) throw new Error('Failed to update binary content');
            }

            return { success: true, message: 'Template updated successfully' };
        } catch (error: any) {
            console.error('Update failed:', error);
            return { success: false, message: error.message || 'Update failed' };
        }
    },

    /**
     * Delete template
     */
    async deleteTemplate(id: string): Promise<{ success: boolean; message: string }> {
        try {
            const res = await fetch(`${API_BASE}/templates/${id}`, { method: 'DELETE' });
            if (!res.ok) throw new Error('Failed to delete template');
            return { success: true, message: 'Template deleted' };
        } catch (error: any) {
            console.error('Delete failed:', error);
            return { success: false, message: error.message };
        }
    },

    /**
     * Delete contract
     */
    async deleteContract(id: string): Promise<{ success: boolean; message: string }> {
        try {
            const res = await fetch(`${API_BASE}/contracts/${id}`, { method: 'DELETE' });
            if (!res.ok) throw new Error('Failed to delete contract');
            return { success: true, message: 'Contract deleted' };
        } catch (error: any) {
            console.error('Delete failed:', error);
            return { success: false, message: error.message };
        }
    }
};
