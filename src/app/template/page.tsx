'use client';

import { useState, useEffect } from 'react';
import { Box, Typography, Button, TextField, InputAdornment, Paper, Autocomplete, Tooltip, IconButton, Dialog, DialogTitle, DialogContent, DialogActions, DialogContentText } from '@mui/material';
import AppLayout from '@/components/layout/AppLayout';
import UploadIcon from '@mui/icons-material/Upload';
import AddIcon from '@mui/icons-material/Add';
import SearchIcon from '@mui/icons-material/Search';
import TemplateCard from '@/components/template/TemplateCard';
import UploadTemplateDialog from '@/components/template/UploadTemplateDialog';
import EditTemplateDialog from '@/components/template/EditTemplateDialog';
import CreateContractWizard from '@/components/contracts/CreateContractWizard';
import DocumentViewerDialog from '@/components/viewer/DocumentViewerDialog';
import { templateService } from '@/services/templateService';
import { categoryService } from '@/services/categoryService';
import { authService } from '@/services/authService';
import { Template } from '@/types/template';

export default function TemplatePage() {
    const [uploadDialogOpen, setUploadDialogOpen] = useState(false);
    const [editDialogOpen, setEditDialogOpen] = useState(false);
    const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
    const [wizardOpen, setWizardOpen] = useState(false);
    const [selectedTemplateForUse, setSelectedTemplateForUse] = useState<string | undefined>(undefined);
    const [templates, setTemplates] = useState<Template[]>([]);
    const [categories, setCategories] = useState<string[]>([]);
    const [selectedCategory, setSelectedCategory] = useState<string>('All Categories');
    const [searchQuery, setSearchQuery] = useState('');
    const [isAdmin, setIsAdmin] = useState(false);

    // Separate state for each dialog to prevent UI conflicts
    const [viewerOpen, setViewerOpen] = useState(false);
    const [templateToView, setTemplateToView] = useState<Template | null>(null);
    const [templateToEdit, setTemplateToEdit] = useState<Template | null>(null);
    const [templateToDelete, setTemplateToDelete] = useState<Template | null>(null);
    const [deleting, setDeleting] = useState(false);

    // Load data on mount
    useEffect(() => {
        loadTemplates();
        loadCategories();
        checkAdminStatus();
    }, []);

    const loadTemplates = () => {
        const allTemplates = templateService.getAllTemplates();
        setTemplates(allTemplates);
    };

    const loadCategories = () => {
        const allCategories = categoryService.getAllCategories();
        setCategories(['All Categories', ...allCategories.map(cat => cat.name)]);
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

    const handleViewTemplate = (templateId: string) => {
        const template = templates.find(t => t.id === templateId);
        if (template) {
            setTemplateToView(template);
            setViewerOpen(true);
        }
    };

    const handleCloseViewer = () => {
        setViewerOpen(false);
        setTemplateToView(null);
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
            // Call the service to delete from localStorage
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

    // Filter templates
    const filteredTemplates = templates.filter(template => {
        const matchesCategory = selectedCategory === 'All Categories' || template.category === selectedCategory;
        const matchesSearch = template.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
            template.description?.toLowerCase().includes(searchQuery.toLowerCase());
        return matchesCategory && matchesSearch;
    });

    return (
        <AppLayout>
            <Box>
                {/* Header Section */}
                <Box
                    sx={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: { xs: 'flex-start', md: 'center' },
                        flexDirection: { xs: 'column', md: 'row' },
                        gap: { xs: 3, md: 2 },
                        mb: 1,
                    }}
                >
                    {/* Title and Subtitle */}
                    <Box>
                        <Typography
                            // variant="h3"
                            fontWeight={600}
                            sx={{
                                color: 'primary.main',
                                fontSize: { xs: '1.75rem', sm: '2rem', md: '20px' },
                            }}
                        >
                            Contract Templates
                        </Typography>
                        <Typography
                            variant="body2"
                            sx={{
                                color: 'text.secondary',
                                // fontSize: { xs: '0.95rem', sm: '1rem' },
                            }}
                        >
                            Manage and create reusable contract templates
                        </Typography>
                    </Box>

                    {/* Action Buttons - Only show for admin */}
                    {isAdmin && (
                        <Box
                            sx={{
                                display: 'flex',
                                gap: 1.5,
                                width: { xs: '100%', sm: 'auto' },
                                justifyContent: { xs: 'flex-end', sm: 'flex-start' },
                            }}
                        >
                            <Tooltip title="Upload Template" arrow>
                                <IconButton
                                    onClick={() => setUploadDialogOpen(true)}
                                    sx={{
                                        bgcolor: 'white',
                                        border: '1px solid',
                                        borderColor: 'rgba(0, 0, 0, 0.23)',
                                        color: 'text.primary',
                                        width: 44,
                                        height: 44,
                                        transition: 'all 0.3s',
                                        '&:hover': {
                                            bgcolor: 'rgba(15, 118, 110, 0.04)',
                                            borderColor: 'primary.main',
                                            transform: 'translateY(-2px)',
                                            boxShadow: '0 4px 8px rgba(0, 0, 0, 0.1)',
                                        },
                                    }}
                                >
                                    <UploadIcon />
                                </IconButton>
                            </Tooltip>
                        </Box>
                    )}
                </Box>

                {/* Search and Filters Section */}
                <Paper
                    elevation={0}
                    sx={{
                        mb: 1.5,
                        p: 1,
                        bgcolor: '#fff',
                        borderRadius: 2,
                        border: '1px solid',
                        borderColor: 'rgba(0, 0, 0, 0.06)',
                    }}
                >
                    <Box
                        sx={{
                            display: 'flex',
                            gap: 2,
                            alignItems: 'center',
                            flexDirection: { xs: 'column', md: 'row' },
                        }}
                    >
                        {/* Search Bar */}
                        <TextField
                            fullWidth
                            placeholder="Search templates..."
                            variant="outlined"
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                            InputProps={{
                                startAdornment: (
                                    <InputAdornment position="start">
                                        <SearchIcon sx={{ color: 'text.secondary', fontSize: 20 }} />
                                    </InputAdornment>
                                ),
                            }}
                            sx={{
                                flex: { md: 1 },
                                '& .MuiOutlinedInput-root': {
                                    borderRadius: 2,
                                    bgcolor: '#fafafa',
                                    border: 'none',
                                    '& fieldset': {
                                        border: '1px solid',
                                        borderColor: 'rgba(0, 0, 0, 0.1)',
                                    },
                                    '&:hover': {
                                        '& fieldset': {
                                            borderColor: 'rgba(0, 0, 0, 0.2)',
                                        },
                                    },
                                    '&.Mui-focused': {
                                        '& fieldset': {
                                            borderColor: 'primary.main',
                                            borderWidth: 2,
                                        },
                                    },
                                },
                                '& .MuiOutlinedInput-input': {
                                    py: 1.25,
                                    fontSize: '0.95rem',
                                },
                            }}
                        />

                        {/* Filters Container */}
                        <Box
                            sx={{
                                display: 'flex',
                                gap: 2,
                                width: { xs: '100%', md: 'auto' },
                                flexDirection: { xs: 'column', sm: 'row' },
                            }}
                        >
                            {/* Category Filter */}
                            <Autocomplete
                                options={categories}
                                value={selectedCategory}
                                onChange={(event, newValue) => setSelectedCategory(newValue || 'All Categories')}
                                disableClearable
                                sx={{
                                    minWidth: { xs: '100%', sm: 220 },
                                }}
                                renderInput={(params) => (
                                    <TextField
                                        {...params}
                                        placeholder="All Categories"
                                        sx={{
                                            '& .MuiOutlinedInput-root': {
                                                borderRadius: 2,
                                                padding: 0.5,
                                                bgcolor: '#fafafa',
                                                '& fieldset': {
                                                    border: '1px solid',
                                                    borderColor: 'rgba(0, 0, 0, 0.1)',
                                                },
                                                '&:hover': {
                                                    '& fieldset': {
                                                        borderColor: 'rgba(0, 0, 0, 0.2)',
                                                    },
                                                },
                                                '&.Mui-focused': {
                                                    '& fieldset': {
                                                        borderColor: 'primary.main',
                                                        borderWidth: 2,
                                                    },
                                                },
                                            },
                                            '& .MuiOutlinedInput-input': {
                                                // py: 1.25,
                                                fontSize: '0.95rem',
                                                fontWeight: 500,
                                            },
                                        }}
                                    />
                                )}
                            />
                        </Box>
                    </Box>
                </Paper>

                {/* Template Cards Grid */}
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
                    {filteredTemplates.length > 0 ? (
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
                                No templates found
                            </Typography>
                            <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
                                {searchQuery ? 'Try adjusting your search or filters' : 'Upload a template to get started'}
                            </Typography>
                        </Box>
                    )}
                </Box>

                {/* Upload Template Dialog */}
                <UploadTemplateDialog
                    open={uploadDialogOpen}
                    onClose={() => setUploadDialogOpen(false)}
                    onSuccess={handleUploadSuccess}
                />

                {/* Create Contract Wizard */}
                <CreateContractWizard
                    open={wizardOpen}
                    onClose={handleCloseWizard}
                    initialTemplate={selectedTemplateForUse}
                />

                {/* Document Viewer Dialog */}
                {templateToView && (
                    <DocumentViewerDialog
                        open={viewerOpen}
                        onClose={handleCloseViewer}
                        fileUrl={templateToView.fileUrl}
                        fileName={templateToView.fileName}
                        title={templateToView.name}
                        readOnly={true}
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
                            setEditDialogOpen(false);
                            setTemplateToEdit(null);
                        }}
                    />
                )}

                {/* Delete Confirmation Dialog */}
                <Dialog
                    open={deleteDialogOpen}
                    onClose={() => !deleting && setDeleteDialogOpen(false)}
                    maxWidth="sm"
                    fullWidth
                >
                    <DialogTitle sx={{ fontWeight: 600, color: 'error.main' }}>
                        Delete Template
                    </DialogTitle>
                    <DialogContent>
                        <DialogContentText>
                            Are you sure you want to delete the template <strong>"{templateToDelete?.name}"</strong>?
                            This action cannot be undone.
                        </DialogContentText>
                    </DialogContent>
                    <DialogActions sx={{ p: 2, gap: 1 }}>
                        <Button
                            onClick={() => setDeleteDialogOpen(false)}
                            disabled={deleting}
                            sx={{
                                textTransform: 'none',
                                color: 'text.secondary',
                            }}
                        >
                            Cancel
                        </Button>
                        <Button
                            onClick={confirmDelete}
                            variant="contained"
                            color="error"
                            disabled={deleting}
                            sx={{
                                textTransform: 'none',
                                minWidth: 100,
                            }}
                        >
                            {deleting ? 'Deleting...' : 'Delete'}
                        </Button>
                    </DialogActions>
                </Dialog>
            </Box>
        </AppLayout>
    );
}
