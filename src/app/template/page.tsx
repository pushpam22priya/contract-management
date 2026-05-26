'use client';


import { useState, useEffect } from 'react';
import { Box, Typography, Tooltip, IconButton, useTheme } from '@mui/material';
import AppLayout from '@/components/layout/AppLayout';
import AppButton from '@/components/common/AppButton';
import UploadIcon from '@mui/icons-material/Upload';
import TemplateCard from '@/components/template/TemplateCard';
import UploadTemplateDialog from '@/components/template/UploadTemplateDialog';
import EditTemplateDialog from '@/components/template/EditTemplateDialog';
import DocumentViewerDialog from '@/components/viewer/DocumentViewerDialog';
import CreateContractDialog from '@/components/contracts/CreateContractDialog';
import BaseDialog from '@/components/common/BaseDialog';
import { templateService } from '@/services/templateService';
import { categoryService } from '@/services/categoryService';
import { authService } from '@/services/authService';
import { Template } from '@/types/template';
// import ReusableFilter from '@/components/common/ReusableFilter';
import CompactFilter from '@/components/common/CompactFilter';
import { ShimmerCardGrid } from '@/components/common/ShimmerCard';
import { useTranslations } from 'next-intl';
import { fetchTemplateBlobUrl } from '@/utils/fetchTemplateBlobUrl';

export default function TemplatePage() {
    const theme = useTheme();
    const isDark = theme.palette.mode === 'dark';
    const t = useTranslations('template');
    const tFilters = useTranslations('filters');
    const [uploadDialogOpen, setUploadDialogOpen] = useState(false);
    const [editDialogOpen, setEditDialogOpen] = useState(false);
    const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
    const [wizardOpen, setWizardOpen] = useState(false);
    const [selectedTemplateForUse, setSelectedTemplateForUse] = useState<string | undefined>(undefined);
    const [templates, setTemplates] = useState<Template[]>([]);
    const [categories, setCategories] = useState<string[]>([]);
    const [selectedCategory, setSelectedCategory] = useState<{ label: string; value: string }[]>([{ label: tFilters('allCategories'), value: 'all' }]);
    const [searchQuery, setSearchQuery] = useState('');
    const [isAdmin, setIsAdmin] = useState(false);
    const [loading, setLoading] = useState(true);

    // Separate state for each dialog to prevent UI conflicts
    const [viewerOpen, setViewerOpen] = useState(false);
    const [templateToView, setTemplateToView] = useState<Template | null>(null);
    const [templateToEdit, setTemplateToEdit] = useState<Template | null>(null);
    const [templateToDelete, setTemplateToDelete] = useState<Template | null>(null);
    const [deleting, setDeleting] = useState(false);

    // Blob URL for the viewer — fetched from MinIO with JWT, passed to Apryse
    const [viewerBlobUrl, setViewerBlobUrl] = useState<string | null>(null);
    const [fetchingViewerPdf, setFetchingViewerPdf] = useState(false);

    // Load data on mount
    useEffect(() => {
        loadTemplates();
        loadCategories();
        checkAdminStatus();
    }, []);

    const loadTemplates = async () => {
        setLoading(true);
        try {
            const allTemplates = await templateService.getAllTemplates();
            setTemplates(allTemplates);
        } finally {
            setLoading(false);
        }
    };

    const loadCategories = async () => {
        console.log('[TemplatePage] Loading categories from backend');
        try {
            const allCategories = await categoryService.getAllCategories();
            setCategories(allCategories.map(cat => cat.name));
            console.log(`[TemplatePage] Categories loaded: ${allCategories.length}`);
        } catch (err) {
            console.error('[TemplatePage] Failed to load categories:', err);
        }
    };

    const checkAdminStatus = () => {
        const currentUser = authService.getCurrentUser();
        setIsAdmin(currentUser?.isAdmin || false);
    };

    const handleUseTemplate = (templateTitle: string) => {
        setSelectedTemplateForUse(templateTitle);
        setWizardOpen(true);
    };

    const handleCloseWizard = () => {
        setWizardOpen(false);
        setSelectedTemplateForUse(undefined);
    };

    const handleUploadSuccess = () => {
        loadTemplates();
        loadCategories();
    };

    const handleViewTemplate = async (templateId: string) => {
        console.log('[TemplatePage] handleViewTemplate → id:', templateId);
        setFetchingViewerPdf(true);

        try {
            const fetchedTemplate = await templateService.getTemplateById(templateId);
            if (!fetchedTemplate) {
                console.error('[TemplatePage] handleViewTemplate ✗ template not found');
                return;
            }
            console.log(`[TemplatePage] handleViewTemplate ✓ name="${fetchedTemplate.name}" | fileUploaded=${fetchedTemplate.fileUploaded}`);

            if (fetchedTemplate.fileUploaded) {
                // Template binary is in MinIO — fetch with JWT → blob URL for Apryse
                console.log('[TemplatePage] handleViewTemplate: fetching blob URL from MinIO...');
                const url = await fetchTemplateBlobUrl(fetchedTemplate.id);
                if (!url) {
                    console.error('[TemplatePage] handleViewTemplate ✗ failed to get blob URL');
                    return;
                }
                setViewerBlobUrl(url);
            } else {
                // Legacy path: template was saved before MinIO migration
                const legacyUrl = fetchedTemplate.fileData || fetchedTemplate.fileUrl || null;
                console.log(`[TemplatePage] handleViewTemplate: using legacy URL (fileUploaded=false)`);
                setViewerBlobUrl(legacyUrl);
            }

            setTemplateToView(fetchedTemplate);
            setViewerOpen(true);
        } catch (error) {
            console.error('[TemplatePage] handleViewTemplate ✗ unexpected error:', error);
        } finally {
            setFetchingViewerPdf(false);
        }
    };

    const handleCloseViewer = () => {
        setViewerOpen(false);
        setTemplateToView(null);
        // Revoke blob URL to free browser memory
        if (viewerBlobUrl?.startsWith('blob:')) {
            console.log('[TemplatePage] handleCloseViewer: revoking blob URL');
            URL.revokeObjectURL(viewerBlobUrl);
        }
        setViewerBlobUrl(null);
    };

    const handleEditTemplate = (templateId: string) => {
        const template = templates.find(t => t.id === templateId);
        if (template) {
            setTemplateToEdit(template);
            setEditDialogOpen(true);
        }
    };

    const handleDeleteTemplate = (templateId: string) => {
        const template = templates.find(t => t.id === templateId);
        if (template) {
            setTemplateToDelete(template);
            setDeleteDialogOpen(true);
        }
    };

    const confirmDelete = async () => {
        if (!templateToDelete) return;

        setDeleting(true);
        try {
            // Call the service to delete
            const result = await templateService.deleteTemplate(templateToDelete.id);

            if (result.success) {
                // Remove template from state
                setTemplates(templates.filter(t => t.id !== templateToDelete.id));

                // Close dialog and reset
                setDeleteDialogOpen(false);
                setTemplateToDelete(null);
            } else {
                console.error('Failed to delete template:', result.message);
            }
        } catch (error) {
            console.error('Failed to delete template:', error);
        } finally {
            setDeleting(false);
        }
    };

    const hasActiveFilters = searchQuery !== '' || selectedCategory.every(f => f.value !== 'all');

    const handleClearFilters = () => {
        setSearchQuery('');
        setSelectedCategory([{ label: tFilters('allCategories'), value: 'all' }]);
    };

    // Filter templates
    const filteredTemplates = templates.filter(template => {
        const matchesCategory = selectedCategory.some(f => f.value === 'all') ||
            selectedCategory.some(f => f.value === template.category);
        const matchesSearch = template.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
            template.description?.toLowerCase().includes(searchQuery.toLowerCase());
        return matchesCategory && matchesSearch;
    });

    return (
        <AppLayout>
            <Box sx={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
                {/* Header Section */}
                <Box sx={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    bgcolor: 'background.paper',
                    px: 2,
                    py: 1,
                    borderBottom: '1px solid',
                    borderColor: 'divider',
                }}>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                        <Typography variant="h5">
                            {t('title')}
                        </Typography>
                        <Box sx={{ width: 5, height: 5, borderRadius: '50%', bgcolor: 'text.disabled', flexShrink: 0 }} />
                        <Typography sx={{ color: 'text.secondary', fontSize: '0.78rem' }}>
                            {t('description')}
                        </Typography>
                    </Box>

                    {/* Action Buttons - Only show for admin */}
                    {isAdmin && (
                        <Tooltip title={t('uploadTemplate')} arrow>
                            <IconButton
                                onClick={() => setUploadDialogOpen(true)}
                                size="small"
                                sx={{
                                    p: 0.5,
                                    borderRadius: 1,
                                    bgcolor: 'primary.main',
                                    color: 'white',
                                    transition: 'all 0.2s',
                                    '& svg': { fontSize: '1.1rem' },
                                    '&:hover': {
                                        bgcolor: 'primary.dark',
                                        boxShadow: (theme) => `0 4px 12px ${theme.palette.primary.main}4d`,
                                    },
                                }}
                            >
                                <UploadIcon />
                            </IconButton>
                        </Tooltip>
                    )}
                </Box>

                {/* Search and Filters Section */}
                {/* <ReusableFilter */}
                <CompactFilter
                    searchQuery={searchQuery}
                    onSearchChange={setSearchQuery}
                    searchPlaceholder={tFilters('searchTemplates')}
                    filters={[
                        {
                            label: tFilters('category'),
                            value: selectedCategory,
                            onChange: (newValue) => setSelectedCategory(newValue || [{ label: tFilters('allCategories'), value: 'all' }]),
                            options: [{ label: tFilters('allCategories'), value: 'all' }, ...categories.map(c => ({ label: c, value: c }))],
                            multiple: true,
                        }
                    ]}
                    showCounts={false}
                    hasActiveFilters={hasActiveFilters}
                    onClearFilters={handleClearFilters}
                />

                {/* Template Cards Grid */}
                <Box sx={{ flex: 1, overflowY: 'auto', minHeight: 0, p: 1 }}>
                <Box
                    sx={{
                        display: 'grid',
                        gridTemplateColumns: {
                            xs: '1fr',
                            sm: 'repeat(2, 1fr)',
                            md: 'repeat(4, 1fr)',
                        },
                        gap: 1,
                    }}
                >
                    {loading ? (
                        <ShimmerCardGrid count={12} variant="template" />
                    ) : filteredTemplates.length > 0 ? (
                        filteredTemplates.map((template, index) => (
                            <TemplateCard
                                key={template.id}
                                id={template.id}
                                category={template.category}
                                title={template.name}
                                description={template.description || ''}
                                timesUsed={template.timesUsed}
                                lastUsed={template.lastUsed}
                                index={index}
                                isAdmin={isAdmin}
                                onUse={() => handleUseTemplate(template.name)}
                                onView={handleViewTemplate}
                                onEdit={handleEditTemplate}
                                onDelete={handleDeleteTemplate}
                            />
                        ))
                    ) : (
                        <Box sx={{ gridColumn: '1 / -1', textAlign: 'center', py: 8 }}>
                            <Typography variant="h6" color="text.secondary">
                                {t('noTemplates')}
                            </Typography>
                            <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
                                {searchQuery ? t('tryAdjusting') : t('uploadToStart')}
                            </Typography>
                        </Box>
                    )}
                </Box>
                </Box>

                {/* Upload Template Dialog */}
                <UploadTemplateDialog
                    open={uploadDialogOpen}
                    onClose={() => setUploadDialogOpen(false)}
                    onSuccess={handleUploadSuccess}
                />

                {/* Document Viewer Dialog */}
                {templateToView && viewerBlobUrl && (
                    <DocumentViewerDialog
                        open={viewerOpen}
                        onClose={handleCloseViewer}
                        fileUrl={viewerBlobUrl}
                        fileName={templateToView.fileName}
                        title={templateToView.name}
                        readOnly={true}
                        formFields={templateToView.formFields}
                        initialXfdf={templateToView.xfdfData}
                    />
                )}

                {/* Edit Template Dialog */}
                {templateToEdit && (
                    <EditTemplateDialog
                        open={editDialogOpen}
                        onClose={() => {
                            setEditDialogOpen(false);
                            setTemplateToEdit(null);
                        }}
                        template={templateToEdit}
                        onSuccess={() => {
                            loadTemplates();
                        }}
                    />
                )}

                {/* Delete Confirmation Dialog */}
                <BaseDialog
                    open={deleteDialogOpen}
                    onClose={() => !deleting && setDeleteDialogOpen(false)}
                    title={t('deleteTemplate')}
                    maxWidth="xs"
                    actions={
                        <>
                            <AppButton
                                variant="outlined"
                                onClick={() => setDeleteDialogOpen(false)}
                                disabled={deleting}
                            >
                                {t('cancel')}
                            </AppButton>
                            <AppButton
                                variant="contained"
                                color="error"
                                loading={deleting}
                                onClick={confirmDelete}
                                sx={{
                                    minWidth: 100,
                                    ...(isDark && {
                                        bgcolor: '#7f1d1d',
                                        '&:hover': { bgcolor: '#991b1b' },
                                    }),
                                }}
                            >
                                {deleting ? t('deleting') : t('delete')}
                            </AppButton>
                        </>
                    }
                >
                    <Typography variant="body1" color="text.secondary">
                        {t('deleteConfirm')} <strong>&quot;{templateToDelete?.name}&quot;</strong>?
                        {t('cannotUndo')}
                    </Typography>
                </BaseDialog>

                {/* Create Contract Wizard */}
                <CreateContractDialog
                    open={wizardOpen}
                    onClose={handleCloseWizard}
                    initialTemplateName={selectedTemplateForUse}
                />
            </Box>
        </AppLayout>
    );
}
