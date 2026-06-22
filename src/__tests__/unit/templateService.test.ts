/**
 * UNIT TESTS — TemplateService
 * (src/services/templateService.ts)
 *
 * TemplateService is a thin class that delegates every call to apiService.
 * Tests verify the delegation contract — correct method called, correct args
 * forwarded, return values passed through unchanged.
 *
 * Scenarios covered:
 *  1.  getAllTemplates() — delegates to apiService.getTemplates(), returns the list
 *  2.  getAllTemplates() — returns empty array when apiService returns []
 *  3.  getTemplateById() — delegates to apiService.getTemplateById(id)
 *  4.  getTemplateById() — maps null response to undefined (typed as Template | undefined)
 *  5.  getTemplateById() — passes through a found template unchanged
 *  6.  saveTemplate() — delegates to apiService.uploadTemplate() with data only (ignores userEmail)
 *  7.  saveTemplate() — returns success response from apiService
 *  8.  saveTemplate() — returns failure response from apiService on error
 *  9.  updateTemplate() — delegates to apiService.updateTemplate() with updatedBy merged
 * 10.  updateTemplate() — merges userEmail as updatedBy into the data object
 * 11.  updateTemplate() — returns success response from apiService
 * 12.  updateTemplate() — returns failure response from apiService on error
 * 13.  deleteTemplate() — delegates to apiService.deleteTemplate(id)
 * 14.  deleteTemplate() — returns success response
 * 15.  deleteTemplate() — returns failure response when apiService fails
 */

// ─── Mock apiService BEFORE import ───────────────────────────────────────────

const mockGetTemplates       = jest.fn();
const mockGetTemplateById    = jest.fn();
const mockUploadTemplate     = jest.fn();
const mockUpdateTemplate     = jest.fn();
const mockDeleteTemplate     = jest.fn();

jest.mock('@/services/apiService', () => ({
    apiService: {
        getTemplates:    (...args: any[]) => mockGetTemplates(...args),
        getTemplateById: (...args: any[]) => mockGetTemplateById(...args),
        uploadTemplate:  (...args: any[]) => mockUploadTemplate(...args),
        updateTemplate:  (...args: any[]) => mockUpdateTemplate(...args),
        deleteTemplate:  (...args: any[]) => mockDeleteTemplate(...args),
    },
}));

import { templateService } from '@/services/templateService';
import type { Template, UploadTemplateData } from '@/types/template';

// ─── Fixtures ─────────────────────────────────────────────────────────────────

const TEMPLATE_FIXTURE: Template = {
    id:          'tpl_001',
    name:        'NDA Agreement',
    category:    'Legal',
    fileName:    'nda.pdf',
    fileUrl:     'https://minio.example.com/tpl_001.pdf',
    fileType:    'pdf',
    timesUsed:   3,
    lastUsed:    '2026-05-01T00:00:00Z',
    uploadedBy:  'alice@example.com',
    uploadedAt:  '2026-01-01T00:00:00Z',
    createdAt:   '2026-01-01T00:00:00Z',
};

const UPLOAD_DATA: UploadTemplateData = {
    name:     'Employment Contract',
    category: 'HR',
    fileName: 'employment.pdf',
    file:     new Blob(['%PDF'], { type: 'application/pdf' }),
};

// ─────────────────────────────────────────────────────────────────────────────

beforeEach(() => {
    jest.clearAllMocks();
});

// =============================================================================
// getAllTemplates()
// =============================================================================

describe('templateService.getAllTemplates()', () => {

    it('delegates to apiService.getTemplates() and returns the list', async () => {
        mockGetTemplates.mockResolvedValueOnce([TEMPLATE_FIXTURE]);

        const result = await templateService.getAllTemplates();

        expect(mockGetTemplates).toHaveBeenCalledTimes(1);
        expect(result).toEqual([TEMPLATE_FIXTURE]);
    });

    it('returns an empty array when apiService returns []', async () => {
        mockGetTemplates.mockResolvedValueOnce([]);

        const result = await templateService.getAllTemplates();

        expect(result).toEqual([]);
    });
});

// =============================================================================
// getTemplateById()
// =============================================================================

describe('templateService.getTemplateById()', () => {

    it('delegates to apiService.getTemplateById() with the correct id', async () => {
        mockGetTemplateById.mockResolvedValueOnce(TEMPLATE_FIXTURE);

        await templateService.getTemplateById('tpl_001');

        expect(mockGetTemplateById).toHaveBeenCalledWith('tpl_001');
    });

    it('returns the template when found', async () => {
        mockGetTemplateById.mockResolvedValueOnce(TEMPLATE_FIXTURE);

        const result = await templateService.getTemplateById('tpl_001');

        expect(result).toEqual(TEMPLATE_FIXTURE);
    });

    it('returns undefined when apiService returns null (not found)', async () => {
        mockGetTemplateById.mockResolvedValueOnce(null);

        const result = await templateService.getTemplateById('nonexistent');

        expect(result).toBeUndefined();
    });
});

// =============================================================================
// saveTemplate()
// =============================================================================

describe('templateService.saveTemplate()', () => {

    it('delegates to apiService.uploadTemplate() with the upload data', async () => {
        mockUploadTemplate.mockResolvedValueOnce({ success: true, id: 'tpl_new', message: 'ok' });

        await templateService.saveTemplate(UPLOAD_DATA, 'alice@example.com');

        expect(mockUploadTemplate).toHaveBeenCalledWith(UPLOAD_DATA);
    });

    it('does NOT pass userEmail to apiService.uploadTemplate (email from session, not param)', async () => {
        mockUploadTemplate.mockResolvedValueOnce({ success: true, id: 'tpl_new', message: 'ok' });

        await templateService.saveTemplate(UPLOAD_DATA, 'alice@example.com');

        // apiService.uploadTemplate should receive only data — no second argument
        expect(mockUploadTemplate).toHaveBeenCalledWith(UPLOAD_DATA);
        expect(mockUploadTemplate).not.toHaveBeenCalledWith(UPLOAD_DATA, expect.anything());
    });

    it('returns the success response from apiService', async () => {
        const apiResponse = { success: true, id: 'tpl_new', message: 'Template uploaded successfully' };
        mockUploadTemplate.mockResolvedValueOnce(apiResponse);

        const result = await templateService.saveTemplate(UPLOAD_DATA, 'alice@example.com');

        expect(result).toEqual(apiResponse);
    });

    it('returns the failure response from apiService on error', async () => {
        const apiResponse = { success: false, message: 'File upload failed' };
        mockUploadTemplate.mockResolvedValueOnce(apiResponse);

        const result = await templateService.saveTemplate(UPLOAD_DATA, 'alice@example.com');

        expect(result).toEqual(apiResponse);
    });
});

// =============================================================================
// updateTemplate()
// =============================================================================

describe('templateService.updateTemplate()', () => {

    const updateData = { name: 'Updated NDA', category: 'Legal' };

    it('delegates to apiService.updateTemplate() with the correct id', async () => {
        mockUpdateTemplate.mockResolvedValueOnce({ success: true, message: 'ok' });

        await templateService.updateTemplate('tpl_001', updateData, 'alice@example.com');

        expect(mockUpdateTemplate).toHaveBeenCalledWith('tpl_001', expect.any(Object));
    });

    it('merges updatedBy from userEmail into the data passed to apiService', async () => {
        mockUpdateTemplate.mockResolvedValueOnce({ success: true, message: 'ok' });

        await templateService.updateTemplate('tpl_001', updateData, 'bob@example.com');

        expect(mockUpdateTemplate).toHaveBeenCalledWith('tpl_001', {
            ...updateData,
            updatedBy: 'bob@example.com',
        });
    });

    it('returns the success response from apiService', async () => {
        const apiResponse = { success: true, message: 'Template updated successfully' };
        mockUpdateTemplate.mockResolvedValueOnce(apiResponse);

        const result = await templateService.updateTemplate('tpl_001', updateData, 'alice@example.com');

        expect(result).toEqual(apiResponse);
    });

    it('returns the failure response from apiService on error', async () => {
        const apiResponse = { success: false, message: 'Failed to update template metadata' };
        mockUpdateTemplate.mockResolvedValueOnce(apiResponse);

        const result = await templateService.updateTemplate('tpl_001', updateData, 'alice@example.com');

        expect(result).toEqual(apiResponse);
    });
});

// =============================================================================
// deleteTemplate()
// =============================================================================

describe('templateService.deleteTemplate()', () => {

    it('delegates to apiService.deleteTemplate() with the correct id', async () => {
        mockDeleteTemplate.mockResolvedValueOnce({ success: true, message: 'Template deleted successfully' });

        await templateService.deleteTemplate('tpl_001');

        expect(mockDeleteTemplate).toHaveBeenCalledWith('tpl_001');
    });

    it('returns the success response from apiService', async () => {
        mockDeleteTemplate.mockResolvedValueOnce({ success: true, message: 'Template deleted successfully' });

        const result = await templateService.deleteTemplate('tpl_001');

        expect(result).toEqual({ success: true, message: 'Template deleted successfully' });
    });

    it('returns the failure response from apiService when deletion fails', async () => {
        mockDeleteTemplate.mockResolvedValueOnce({ success: false, message: 'Template not found' });

        const result = await templateService.deleteTemplate('nonexistent');

        expect(result).toEqual({ success: false, message: 'Template not found' });
    });
});
