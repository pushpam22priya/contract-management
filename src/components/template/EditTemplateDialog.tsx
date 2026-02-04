'use client';

import { useState, useEffect, useRef } from 'react';
import {
    Box,
    Button,
    TextField,
    Autocomplete,
    Typography,
    IconButton,
    Chip,
    alpha,
    CircularProgress,
    Alert,
} from '@mui/material';
import BaseDialog from '@/components/common/BaseDialog';
import InsertDriveFileOutlinedIcon from '@mui/icons-material/InsertDriveFileOutlined';
import CloseIcon from '@mui/icons-material/Close';
import AddCircleOutlineIcon from '@mui/icons-material/AddCircleOutline';
import CloudUploadIcon from '@mui/icons-material/CloudUpload';
import ArrowForward from '@mui/icons-material/ArrowForward';
import ArrowBack from '@mui/icons-material/ArrowBack';
import { templateService } from '@/services/templateService';
import { categoryService } from '@/services/categoryService';
import { authService } from '@/services/authService';
import { Template } from '@/types/template';
import PDFViewerContainer, { PDFViewerHandle } from '@/components/viewer/PDFViewerContainer';

interface EditTemplateDialogProps {
    open: boolean;
    onClose: () => void;
    onSuccess?: () => void;
    template: Template;
}

export default function EditTemplateDialog({
    open,
    onClose,
    onSuccess,
    template,
}: EditTemplateDialogProps) {
    // Wizard state
    const [currentStep, setCurrentStep] = useState<1 | 2>(1);
    const pdfViewerRef = useRef<PDFViewerHandle>(null);

    const [templateName, setTemplateName] = useState('');
    const [description, setDescription] = useState('');
    const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
    const [categories, setCategories] = useState<string[]>([]);
    const [newCategory, setNewCategory] = useState('');
    const [showNewCategoryInput, setShowNewCategoryInput] = useState(false);
    const [selectedFile, setSelectedFile] = useState<File | null>(null);
    const [dragActive, setDragActive] = useState(false);
    const [updating, setUpdating] = useState(false);
    const [error, setError] = useState('');
    const [success, setSuccess] = useState('');

    // Document URL for PDF Viewer (either new file blob or existing template URL)
    const [documentUrl, setDocumentUrl] = useState('');
    const [documentLoaded, setDocumentLoaded] = useState(false);

    // Load categories and pre-fill form on mount
    useEffect(() => {
        if (open) {
            const allCategories = categoryService.getAllCategories();
            setCategories(allCategories.map(cat => cat.name));

            // Pre-fill form with template data
            setTemplateName(template.name);
            setDescription(template.description || '');
            setSelectedCategory(template.category);
            setSelectedFile(null);
            setError('');
            setSuccess('');
            setShowNewCategoryInput(false);
            setCurrentStep(1); // Always start at step 1
            setDocumentUrl('');
        }
    }, [open, template]);

    // Handle file upload
    const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
        const file = event.target.files?.[0];
        if (file) {
            setSelectedFile(file);
            setError('');
        }
    };

    // Handle drag events
    const handleDrag = (e: React.DragEvent) => {
        e.preventDefault();
        e.stopPropagation();
        if (e.type === 'dragenter' || e.type === 'dragover') {
            setDragActive(true);
        } else if (e.type === 'dragleave') {
            setDragActive(false);
        }
    };

    // Handle drop
    const handleDrop = (e: React.DragEvent) => {
        e.preventDefault();
        e.stopPropagation();
        setDragActive(false);

        if (e.dataTransfer.files && e.dataTransfer.files[0]) {
            setSelectedFile(e.dataTransfer.files[0]);
        }
    };

    // Remove file
    const handleRemoveFile = () => {
        setSelectedFile(null);
    };

    // Add new category
    const handleAddNewCategory = async () => {
        if (!newCategory.trim()) return;

        setError('');
        const currentUser = authService.getCurrentUser();
        if (!currentUser) {
            setError('You must be logged in to create categories');
            return;
        }

        const result = await categoryService.createCategory(
            { name: newCategory.trim() },
            currentUser.email
        );

        if (result.success) {
            const updatedCategories = [...categories, newCategory.trim()];
            setCategories(updatedCategories);
            setSelectedCategory(newCategory.trim());
            setNewCategory('');
            setShowNewCategoryInput(false);
        } else {
            setError(result.message);
        }
    };

    // Navigate to Step 2
    const handleNext = () => {
        // Validate Step 1
        if (!templateName.trim()) {
            setError('Please enter a template name');
            return;
        }
        if (!selectedCategory) {
            setError('Please select a category');
            return;
        }

        // Determine which file to use
        if (selectedFile) {
            // New file selected
            if (selectedFile.type === 'application/pdf') {
                const url = URL.createObjectURL(selectedFile);
                setDocumentUrl(url);
                setCurrentStep(2);
                setError('');
            } else {
                setError('Please upload a PDF file to use the form builder');
            }
        } else {
            // No new file, use existing template file
            // Prefer fileData (new architecture) over fileUrl (legacy)
            const existingFileUrl = template.fileData || template.fileUrl;
            if (template.fileType === 'pdf' && existingFileUrl) {
                setDocumentUrl(existingFileUrl);
                setCurrentStep(2);
                setError('');
            } else {
                setError('Only PDF templates support the form builder');
            }
        }
    };

    // Go back to Step 1
    const handleBack = () => {
        setCurrentStep(1);
        // Clean up blob URL if it was created from a new file
        if (selectedFile && documentUrl) {
            URL.revokeObjectURL(documentUrl);
            setDocumentUrl('');
        }
        // If using existing fileUrl, we don't revoke it
        if (!selectedFile) {
            setDocumentUrl('');
        }
        setDocumentLoaded(false);
    };

    // State for modification tracking
    const [pdfModified, setPdfModified] = useState(false);

    // Handle submit (Update)
    const handleSubmit = async () => {
        setError('');
        setSuccess('');

        // Validate form
        if (!templateName.trim()) {
            setError('Please enter a template name');
            return;
        }
        if (!selectedCategory) {
            setError('Please select a category');
            return;
        }

        const currentUser = authService.getCurrentUser();
        if (!currentUser) {
            setError('You must be logged in to update templates');
            return;
        }

        setUpdating(true);

        try {
            console.log('📤 Starting template update with new architecture (BINARY-SAFE)...');

            let xfdfData: string = '';
            let formFields: any[] = [];

            // Start with selected file (if new) or null (if keeping existing)
            let fileToUpload: File | Blob | null = selectedFile;

            if (currentStep === 2 && pdfViewerRef.current) {
                console.log('📦 Exporting data from Viewer...');
                try {
                    // 1. Export XFDF & Binary
                    const exportResult = await pdfViewerRef.current.exportAnnotations();

                    if (exportResult) {
                        xfdfData = exportResult.xfdfString;
                        console.log(`  ✓ Extracted XFDF (${xfdfData.length} chars)`);

                       
                        if (pdfModified) {
                            console.log('  ⚠️ PDF was modified, using regenerated binary Blob...');
                            fileToUpload = exportResult.blob;
                            console.log(`  ✓ Switched to binary Blob (${fileToUpload.size} bytes)`);
                        } else {
                            console.log('  ✓ PDF not modified.');
                        }
                    }
                } catch (ex) {
                    console.error('Failed to export annotations:', ex);
                    throw new Error('Failed to prepare document for update.');
                }

                // 3. Export form fields
                try {
                    formFields = await pdfViewerRef.current.exportFormFields();
                    console.log(`  ✓ Extracted ${formFields.length} form fields`);
                } catch (e) {
                    console.warn('Failed to export form fields:', e);
                }
            }

            // Update template using templateService.updateTemplate
            console.log('💾 Updating template via Service...');

            // Build update data
            const updateData: any = {
                name: templateName.trim(),
                description: description.trim(),
                category: selectedCategory,
                formFields: formFields,
                hasFormFields: formFields.length > 0,
                xfdfData: xfdfData
            };

            // Only add file stuff if we have a file to upload (either new selected file OR modified blob)
            if (fileToUpload) {
                updateData.file = fileToUpload;
                // Use new filename if selected, otherwise preserve existing
                updateData.fileName = selectedFile?.name || template.fileName;
                updateData.fileType = 'pdf';
            }

            const result = await templateService.updateTemplate(
                template.id,
                updateData,
                currentUser.email
            );

            if (result.success) {
                console.log('✅ Template updated successfully!', result.template?.id);

                setSuccess(result.message);
                setTimeout(() => {
                    handleClose();
                    onSuccess?.();
                }, 1000);
            } else {
                setError(result.message);
            }
        } catch (err: any) {
            console.error('❌ Error updating template:', err);
            setError('Failed to update template. Please try again.');
        } finally {
            setUpdating(false);
        }
    };

    // Handle close
    const handleClose = () => {
        if (!updating) {
            setTemplateName('');
            setDescription('');
            setSelectedCategory(null);
            setSelectedFile(null);
            setNewCategory('');
            setShowNewCategoryInput(false);
            setError('');
            setSuccess('');

            // Cleanup
            if (selectedFile && documentUrl) {
                URL.revokeObjectURL(documentUrl);
            }
            setDocumentUrl('');
            setDocumentLoaded(false);
            setCurrentStep(1);

            onClose();
        }
    };

    // Dialog Actions
    const step1Actions = (
        <Button
            onClick={handleNext}
            variant="contained"
            endIcon={<ArrowForward />}
            disabled={!templateName || !selectedCategory}
            sx={{
                textTransform: 'none',
                fontWeight: 600,
                px: 3,
                py: 1,
                borderRadius: 2,
                bgcolor: 'primary.main',
                boxShadow: '0 2px 8px rgba(15, 118, 110, 0.25)',
                '&:hover': {
                    bgcolor: 'primary.dark',
                    boxShadow: '0 4px 12px rgba(15, 118, 110, 0.35)',
                },
                '&:disabled': {
                    bgcolor: 'rgba(0, 0, 0, 0.12)',
                    color: 'rgba(0, 0, 0, 0.26)',
                },
            }}
        >
            Next: Edit Form Fields
        </Button>
    );

    const step2Actions = (
        <>
            <Button
                onClick={handleBack}
                startIcon={<ArrowBack />}
                sx={{
                    textTransform: 'none',
                    fontWeight: 600,
                }}
            >
                Back
            </Button>
            <Button
                onClick={handleSubmit}
                variant="contained"
                disabled={updating}
                startIcon={updating ? <CircularProgress size={20} color="inherit" /> : null}
                sx={{
                    textTransform: 'none',
                    fontWeight: 600,
                    px: 3,
                    py: 1,
                    borderRadius: 2,
                    bgcolor: 'primary.main',
                    boxShadow: '0 2px 8px rgba(15, 118, 110, 0.25)',
                    '&:hover': {
                        bgcolor: 'primary.dark',
                        boxShadow: '0 4px 12px rgba(15, 118, 110, 0.35)',
                    },
                }}
            >
                {updating ? 'Updating...' : 'Update Template'}
            </Button>
        </>
    );

    const dialogActions = currentStep === 1 ? step1Actions : step2Actions;

    return (
        <BaseDialog
            open={open}
            onClose={handleClose}
            title={currentStep === 1 ? "Edit Template - Step 1: Basic Information" : "Edit Template - Step 2: Edit Form Fields"}
            actions={dialogActions}
            maxWidth={currentStep === 1 ? 'sm' : 'xl'}
            fullWidth
            customHeight={currentStep === 2 ? '98vh' : undefined}
        >
            {/* STEP 1: Basic Information */}
            {currentStep === 1 && (
                <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                    {/* Error/Success Messages */}
                    {error && (
                        <Alert severity="error" onClose={() => setError('')}>
                            {error}
                        </Alert>
                    )}
                    {success && (
                        <Alert severity="success">
                            {success}
                        </Alert>
                    )}

                    {/* Current File Info */}
                    <Box
                        sx={{
                            bgcolor: alpha('#0f766e', 0.04),
                            border: '1px solid',
                            borderColor: 'rgba(15, 118, 110, 0.2)',
                            borderRadius: 2,
                            p: 1.5,
                        }}
                    >
                        <Typography
                            variant="body2"
                            sx={{
                                fontWeight: 600,
                                color: 'text.primary',
                                mb: 0.5,
                            }}
                        >
                            Current File
                        </Typography>
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                            <InsertDriveFileOutlinedIcon
                                sx={{ fontSize: 16, color: 'primary.main' }}
                            />
                            <Typography
                                variant="body2"
                                sx={{ color: 'text.secondary' }}
                            >
                                {template.fileName}
                            </Typography>
                        </Box>
                    </Box>

                    {/* File Upload Area (Optional) */}
                    <Box>
                        <Typography
                            variant="body2"
                            sx={{
                                fontWeight: 600,
                                mb: 0.5,
                                color: 'text.primary',
                            }}
                        >
                            Replace File <span style={{ color: '#9ca3af' }}>(Optional)</span>
                        </Typography>

                        {!selectedFile ? (
                            <Box
                                onDragEnter={handleDrag}
                                onDragLeave={handleDrag}
                                onDragOver={handleDrag}
                                onDrop={handleDrop}
                                sx={{
                                    border: '2px dashed',
                                    borderColor: dragActive ? 'primary.main' : 'rgba(0, 0, 0, 0.12)',
                                    borderRadius: 2,
                                    p: 1,
                                    textAlign: 'center',
                                    bgcolor: dragActive
                                        ? alpha('#0f766e', 0.04)
                                        : 'rgba(0, 0, 0, 0.02)',
                                    transition: 'all 0.3s',
                                    cursor: 'pointer',
                                    '&:hover': {
                                        borderColor: 'primary.main',
                                        bgcolor: alpha('#0f766e', 0.04),
                                    },
                                }}
                                onClick={() => document.getElementById('file-edit-input')?.click()}
                            >
                                <CloudUploadIcon
                                    sx={{
                                        fontSize: 48,
                                        color: dragActive ? 'primary.main' : 'rgba(0, 0, 0, 0.3)',
                                        mb: 2,
                                    }}
                                />
                                <Typography
                                    variant="body1"
                                    sx={{
                                        fontWeight: 600,
                                        color: 'text.primary',
                                        mb: 0.5,
                                    }}
                                >
                                    Drop your file here or click to browse
                                </Typography>
                                <Typography
                                    variant="body2"
                                    sx={{
                                        color: 'text.secondary',
                                        fontSize: '0.875rem',
                                    }}
                                >
                                    Supported formats: PDF, DOCX, DOC
                                </Typography>
                                <input
                                    id="file-edit-input"
                                    type="file"
                                    accept=".pdf,.doc,.docx"
                                    onChange={handleFileChange}
                                    style={{ display: 'none' }}
                                />
                            </Box>
                        ) : (
                            <Box
                                sx={{
                                    border: '1px solid',
                                    borderColor: 'rgba(0, 0, 0, 0.12)',
                                    borderRadius: 2,
                                    p: 1,
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'space-between',
                                    bgcolor: alpha('#0f766e', 0.04),
                                }}
                            >
                                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
                                    <Box
                                        sx={{
                                            width: 40,
                                            height: 40,
                                            borderRadius: 1.5,
                                            bgcolor: 'primary.main',
                                            display: 'flex',
                                            alignItems: 'center',
                                            justifyContent: 'center',
                                        }}
                                    >
                                        <InsertDriveFileOutlinedIcon
                                            sx={{ fontSize: 20, color: 'white' }}
                                        />
                                    </Box>
                                    <Box>
                                        <Typography
                                            variant="body2"
                                            sx={{
                                                fontWeight: 600,
                                                color: 'text.primary',
                                            }}
                                        >
                                            {selectedFile.name}
                                        </Typography>
                                        <Typography
                                            variant="caption"
                                            sx={{
                                                color: 'text.secondary',
                                            }}
                                        >
                                            {(selectedFile.size / 1024).toFixed(2)} KB
                                        </Typography>
                                    </Box>
                                </Box>
                                <IconButton
                                    onClick={handleRemoveFile}
                                    size="small"
                                    sx={{
                                        color: 'text.secondary',
                                        '&:hover': {
                                            bgcolor: 'rgba(0, 0, 0, 0.08)',
                                            color: 'error.main',
                                        },
                                    }}
                                >
                                    <CloseIcon fontSize="small" />
                                </IconButton>
                            </Box>
                        )}
                    </Box>

                    {/* Template Name */}
                    <Box>
                        <Typography
                            variant="body2"
                            sx={{
                                fontWeight: 600,
                                mb: 0.5,
                                color: 'text.primary',
                            }}
                        >
                            Template Name <span style={{ color: '#ef4444' }}>*</span>
                        </Typography>
                        <TextField
                            fullWidth
                            placeholder="Enter template name"
                            value={templateName}
                            onChange={(e) => setTemplateName(e.target.value)}
                            sx={{
                                '& .MuiOutlinedInput-root': {
                                    borderRadius: 2,
                                    '&:hover fieldset': {
                                        borderColor: 'rgba(0, 0, 0, 0.3)',
                                    },
                                    '&.Mui-focused fieldset': {
                                        borderWidth: 2,
                                    },
                                },
                                '& .MuiOutlinedInput-input': {
                                    py: 1.25,
                                    px: 1.5,
                                },
                            }}
                        />
                    </Box>

                    {/* Description */}
                    <Box>
                        <Typography
                            variant="body2"
                            sx={{
                                fontWeight: 600,
                                mb: 1.5,
                                color: 'text.primary',
                            }}
                        >
                            Description
                        </Typography>
                        <TextField
                            fullWidth
                            multiline
                            rows={2}
                            placeholder="Enter template description (optional)"
                            value={description}
                            onChange={(e) => setDescription(e.target.value)}
                            sx={{
                                '& .MuiOutlinedInput-root': {
                                    borderRadius: 2,
                                    '&:hover fieldset': {
                                        borderColor: 'rgba(0, 0, 0, 0.3)',
                                    },
                                    '&.Mui-focused fieldset': {
                                        borderWidth: 2,
                                    },
                                },
                            }}
                        />
                    </Box>

                    {/* Category Selection */}
                    <Box>
                        <Typography
                            variant="body2"
                            sx={{
                                fontWeight: 600,
                                mb: 1.5,
                                color: 'text.primary',
                            }}
                        >
                            Category <span style={{ color: '#ef4444' }}>*</span>
                        </Typography>

                        {!showNewCategoryInput ? (
                            <Box sx={{ display: 'flex', gap: 1.5, alignItems: 'flex-start' }}>
                                <Autocomplete
                                    fullWidth
                                    options={categories}
                                    value={selectedCategory}
                                    onChange={(event, newValue) => {
                                        setSelectedCategory(newValue);
                                    }}
                                    renderInput={(params) => (
                                        <TextField
                                            {...params}
                                            placeholder="Select category"
                                            sx={{
                                                '& .MuiOutlinedInput-root': {
                                                    borderRadius: 2,
                                                    padding: 0.4,
                                                    '&:hover fieldset': {
                                                        borderColor: 'rgba(0, 0, 0, 0.3)',
                                                    },
                                                    '&.Mui-focused fieldset': {
                                                        borderWidth: 2,
                                                    },
                                                },
                                            }}
                                        />
                                    )}
                                    renderOption={(props, option) => {
                                        const { key, ...otherProps } = props;
                                        return (
                                            <li key={key} {...otherProps}>
                                                <Chip
                                                    label={option}
                                                    size="small"
                                                    sx={{
                                                        bgcolor: 'rgba(15, 118, 110, 0.08)',
                                                        color: 'primary.main',
                                                        fontWeight: 500,
                                                    }}
                                                />
                                            </li>
                                        );
                                    }}
                                />
                                <Button
                                    variant="outlined"
                                    startIcon={<AddCircleOutlineIcon />}
                                    onClick={() => setShowNewCategoryInput(true)}
                                    sx={{
                                        textTransform: 'none',
                                        fontWeight: 600,
                                        borderRadius: 2,
                                        whiteSpace: 'nowrap',
                                        borderColor: 'rgba(0, 0, 0, 0.23)',
                                        color: 'text.primary',
                                        '&:hover': {
                                            borderColor: 'primary.main',
                                            bgcolor: alpha('#0f766e', 0.04),
                                        },
                                    }}
                                >
                                    New
                                </Button>
                            </Box>
                        ) : (
                            <Box sx={{ display: 'flex', gap: 1.5 }}>
                                <TextField
                                    fullWidth
                                    placeholder="Enter new category name"
                                    value={newCategory}
                                    onChange={(e) => setNewCategory(e.target.value)}
                                    onKeyPress={(e) => {
                                        if (e.key === 'Enter') {
                                            handleAddNewCategory();
                                        }
                                    }}
                                    autoFocus
                                    sx={{
                                        '& .MuiOutlinedInput-root': {
                                            borderRadius: 2,
                                            '&:hover fieldset': {
                                                borderColor: 'rgba(0, 0, 0, 0.3)',
                                            },
                                            '&.Mui-focused fieldset': {
                                                borderWidth: 2,
                                            },
                                        },
                                        '& .MuiOutlinedInput-input': {
                                            py: 1.25,
                                            px: 1.5,
                                        },
                                    }}
                                />
                                <Button
                                    variant="contained"
                                    onClick={handleAddNewCategory}
                                    disabled={!newCategory.trim()}
                                    sx={{
                                        textTransform: 'none',
                                        fontWeight: 600,
                                        borderRadius: 2,
                                        whiteSpace: 'nowrap',
                                        bgcolor: 'primary.main',
                                        '&:hover': {
                                            bgcolor: 'primary.dark',
                                        },
                                    }}
                                >
                                    Add
                                </Button>
                                <Button
                                    variant="outlined"
                                    onClick={() => {
                                        setShowNewCategoryInput(false);
                                        setNewCategory('');
                                    }}
                                    sx={{
                                        textTransform: 'none',
                                        fontWeight: 600,
                                        borderRadius: 2,
                                        borderColor: 'rgba(0, 0, 0, 0.23)',
                                        color: 'text.primary',
                                        '&:hover': {
                                            borderColor: 'rgba(0, 0, 0, 0.4)',
                                            bgcolor: 'rgba(0, 0, 0, 0.02)',
                                        },
                                    }}
                                >
                                    Cancel
                                </Button>
                            </Box>
                        )}
                    </Box>
                </Box>
            )}

            {/* STEP 2: PDF Form Builder */}
            {currentStep === 2 && (
                <Box sx={{ display: 'flex', flexDirection: 'column', height: 'calc(98vh - 150px)' }}>
                    {/* Error Alert */}
                    {error && (
                        <Alert severity="error" sx={{ mb: 2 }} onClose={() => setError('')}>
                            {error}
                        </Alert>
                    )}

                    {/* Full-Height PDF Viewer */}
                    <Box sx={{ flex: 1, overflow: 'hidden' }}>
                        {documentUrl ? (
                            <Box sx={{
                                height: '100%',
                                border: '1px solid',
                                borderColor: 'divider',
                                borderRadius: 2,
                                overflow: 'hidden'
                            }}>
                                <PDFViewerContainer
                                    ref={pdfViewerRef}
                                    documentUrl={documentUrl}
                                    readOnly={false}
                                    toolbarMode="forms"
                                    // ✅ NEW: Listen for modifications to force binary update
                                    onDocumentModified={() => {
                                        console.log('📝 Template modified by user (fields added/changed)');
                                        setPdfModified(true);
                                    }}
                                    onDocumentLoaded={() => setDocumentLoaded(true)}
                                    onError={(err) => setError(err)}
                                    // ✅ CRITICAL FIX: ALWAYS import XFDF for templates (unless new file selected)
                                    // Templates are saved with flatten=false, so form fields exist ONLY in XFDF
                                    // Unlike signed contracts (which are flattened), templates need XFDF to show fields
                                    initialXfdf={selectedFile ? undefined : template.xfdfData}
                                    // Pass existing form fields ONLY if we are using the existing file
                                    // If a new file is selected (selectedFile is not null), we start fresh
                                    formFields={selectedFile ? undefined : template.formFields}
                                />
                            </Box>
                        ) : (
                            <Box
                                sx={{
                                    height: '100%',
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    border: '2px dashed',
                                    borderColor: 'divider',
                                    borderRadius: 2,
                                    bgcolor: 'grey.50'
                                }}
                            >
                                <Typography variant="h6" color="text.secondary">
                                    No document loaded
                                </Typography>
                            </Box>
                        )}
                    </Box>
                </Box>
            )}
        </BaseDialog>
    );
}
