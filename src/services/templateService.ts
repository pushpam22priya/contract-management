import { Template, UploadTemplateData } from '@/types/template';
import { apiService } from './apiService';

class TemplateService {

    /**
     * Get all templates from API
     */
    async getAllTemplates(): Promise<Template[]> {
        return apiService.getTemplates();
    }

    /**
     * Get template by ID
     */
    async getTemplateById(id: string): Promise<Template | undefined> {
        return (await apiService.getTemplateById(id)) || undefined;
    }

    /**
     * Save a new template (Upload)
     * Wraps apiService.uploadTemplate
     */
    async saveTemplate(data: UploadTemplateData, userEmail: string): Promise<{ success: boolean; message: string; template?: Template }> {
        return apiService.uploadTemplate(data);
    }

    // Legacy support methods (deprecated or removed)
    // We remove local storage methods entirely to satisfy requirements.

    /**
     * Delete template
     */
    /**
     * Update template
     */
    async updateTemplate(id: string, data: any, userEmail: string): Promise<{ success: boolean; message: string; template?: Template }> {
        // Merge updater info if needed, but apiService handles the main logic
        return apiService.updateTemplate(id, { ...data, updatedBy: userEmail });
    }

    /**
     * Delete template
     */
    async deleteTemplate(id: string): Promise<{ success: boolean; message: string }> {
        return apiService.deleteTemplate(id);
    }
}

export const templateService = new TemplateService();
