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
import CloudUploadIcon from '@mui/icons-material/CloudUpload';
import InsertDriveFileOutlinedIcon from '@mui/icons-material/InsertDriveFileOutlined';
import CloseIcon from '@mui/icons-material/Close';
import AddCircleOutlineIcon from '@mui/icons-material/AddCircleOutline';
import ArrowForward from '@mui/icons-material/ArrowForward';
import ArrowBack from '@mui/icons-material/ArrowBack';
import { templateService } from '@/services/templateService';
import { categoryService } from '@/services/categoryService';
import { authService } from '@/services/authService';
import PDFViewerContainer, { PDFViewerHandle } from '@/components/viewer/PDFViewerContainer';
import { resolve } from 'path';

interface UploadTemplateDialogProps {
    open: boolean;
    onClose: () => void;
    onSuccess?: () => void;
}

export default function UploadTemplateDialog({
    open,
    onClose,
    onSuccess,
}: UploadTemplateDialogProps) {
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
    const [uploading, setUploading] = useState(false);
    const [error, setError] = useState('');
    const [success, setSuccess] = useState('');
    const [documentUrl, setDocumentUrl] = useState(''); // For PDFViewerContainer
    const [documentLoaded, setDocumentLoaded] = useState(false);

    // Load categories on mount
    useEffect(() => {
        if (open) {
            const allCategories = categoryService.getAllCategories();
            setCategories(allCategories.map(cat => cat.name));
        }
    }, [open]);

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
        if (documentUrl) {
            URL.revokeObjectURL(documentUrl);
            setDocumentUrl('');
        }
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
        if (!selectedFile) {
            setError('Please upload a file');
            return;
        }

        // Only proceed to Step 2 if it's a PDF
        if (selectedFile.type === 'application/pdf') {
            // Create blob URL for PDFViewerContainer
            const url = URL.createObjectURL(selectedFile);
            setDocumentUrl(url);
            setCurrentStep(2);
            setError('');
        } else {
            setError('Please upload a PDF file to use the form builder');
        }
    };

    // Go back to Step 1
    const handleBack = () => {
        setCurrentStep(1);
        // Clean up blob URL
        if (documentUrl) {
            URL.revokeObjectURL(documentUrl);
            setDocumentUrl('');
        }
        setDocumentLoaded(false);
    };


    // State for modification tracking
    const [pdfModified, setPdfModified] = useState(false);

    // ✅ AUTO-SAVE: Handle change notifications during template editing
    // Note: For NEW templates, we don't save to JSONBin until final submit
    // (because template doesn't exist yet). This handler just logs changes.
    // For EDITING existing templates, this could be enhanced to actually save.
    const handleAutoSave = async (fileData: string, xfdfData: string) => {
        console.log('💾 [AUTO-SAVE] Template change detected');
        console.log(`📄 File data length: ${fileData?.length || 0}`);
        console.log(`📋 XFDF data length: ${xfdfData?.length || 0}`);
        console.log('ℹ️  [AUTO-SAVE] Changes will be captured on final submit');

        // Note: We don't actually save here because:
        // 1. Template doesn't exist in JSONBin yet (no ID)
        // 2. We always do a fresh export on submit to ensure latest state
        // 3. This avoids race conditions with debounced auto-save
    };

    // Handle submit
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
        if (!selectedFile) {
            setError('Please upload a file');
            return;
        }

        const currentUser = authService.getCurrentUser();
        if (!currentUser) {
            setError('You must be logged in to upload templates');
            return;
        }

        setUploading(true);



        try {

            if(pdfViewerRef.current) {
                pdfViewerRef.current.setToolbarGroup('toolbarGroup-View');
                pdfViewerRef.current.setToolMode('Pan');
                console.log('Set toolbar to View mode and Pan tool before save')
            }

            await new Promise(resolve => setTimeout(resolve, 2000));

            let xfdfData = '';
            let formFields: any[] = [];
            let fileToUpload: File | Blob = selectedFile;

            // IF on step 2 (Designer) and viewer is active
            if (currentStep === 2 && pdfViewerRef.current) {
                console.log('═══════════════════════════════════════════════════════════════════');
                console.log('📦 [UploadTemplateDialog] Exporting data from Viewer...');
                console.log('✅ [UploadTemplateDialog] Commit process will run in exportAnnotations');
                console.log('═══════════════════════════════════════════════════════════════════');

                // ✅ CRITICAL FIX: Always export fresh data on submit
                // Don't rely on cached auto-save data as it may be stale or incomplete
                // The exportAnnotations() call includes the full pre-export commit process
                console.log('📋 [UploadTemplateDialog] Performing fresh export on submit');

                // 1. Export XFDF (annotations/data)
                // ✅ IMPORTANT: exportAnnotations() will COMMIT all pending changes before exporting
                // This includes: deselecting annotations, switching tools, calling field.commit(),
                // refreshing viewer, and redrawing annotations
                // We use exportAnnotations() which returns both blob and xfdf string.
                try {
                    const exportResult = await pdfViewerRef.current.exportAnnotations();

                    if (exportResult) {
                        xfdfData = exportResult.xfdfString;
                        console.log(`  ✓ Extracted XFDF (${xfdfData.length} chars)`);
                    }
                } catch (ex) {
                    console.error('Failed to export annotations:', ex);
                    throw new Error('Failed to prepare document for upload.');
                }

                // 2. Export form field metadata
                try {
                    formFields = await pdfViewerRef.current.exportFormFields();
                    console.log(`  ✓ Extracted ${formFields.length} form field definitions`);
                } catch (e) {
                    console.warn('Failed to export form fields metadata:', e);
                }

                // 3. If PDF was modified, use the blob from the export
                if (pdfModified) {
                    console.log('  ⚠️ PDF was modified, using exported binary Blob...');
                    // We already have the exportResult from above
                    try {
                        const exportResult = await pdfViewerRef.current.exportAnnotations();
                        if (exportResult) {
                            fileToUpload = exportResult.blob;
                            console.log(`  ✓ Using exported Blob (${fileToUpload.size} bytes)`);
                        }
                    } catch (ex) {
                        console.error('Failed to export PDF blob:', ex);
                        throw new Error('Failed to prepare document for upload.');
                    }
                } else {
                    console.log('  ✓ PDF not modified, uploading original file.');
                }
            }

            // At this point:
            // - fileToUpload is either original File (step 1 or unmodified step 2) OR dynamic Blob (modified step 2)
            // - xfdfData is populated from fresh export
            // - formFields is populated from fresh export


            console.log('💾 Saving template via Service...');
            const savedTemplate = await templateService.saveTemplate({
                name: templateName.trim(),
                description: description.trim(),
                category: selectedCategory,
                fileName: selectedFile.name,
                file: fileToUpload,   // ✅ Pass File/Blob directly
                xfdfData: xfdfData,   // ✅ Pass XFDF string
                formFields: formFields,
            }, currentUser.email);

            console.log('✅ Template saved successfully!', savedTemplate.template?.id);

            setSuccess('Template uploaded successfully!');

            // ✅ Set toolbar to View mode after success
            if (pdfViewerRef.current && pdfViewerRef.current.setToolbarGroup) {
                console.log('✅ Setting toolbar to View mode');
                pdfViewerRef.current.setToolbarGroup('toolbarGroup-View');
                // ✅ Also set to Pan mode as requested
                // if (pdfViewerRef.current.setToolMode) {
                //     pdfViewerRef.current.setToolMode('Pan');
                // }
            }

            setTimeout(() => {
                handleClose();
                onSuccess?.();
            }, 2000); // 2 second delay as requested
        } catch (err: any) {
            console.error('❌ Error uploading template:', err);
            setError(err.message || 'Failed to upload template. Please try again.');
        } finally {
            setUploading(false);
        }
    };


    // Handle close
    const handleClose = () => {
        if (!uploading) {
            setCurrentStep(1); // Reset to step 1
            setTemplateName('');
            setDescription('');
            setSelectedCategory(null);
            setSelectedFile(null);
            setNewCategory('');
            setShowNewCategoryInput(false);
            setError('');
            setSuccess('');
            setPdfModified(false); // Reset modification state
            if (documentUrl) {
                URL.revokeObjectURL(documentUrl);
                setDocumentUrl('');
            }
            setDocumentLoaded(false);
            onClose();
        }
    };

    // Dialog actions - Step based
    const step1Actions = (
        <Button
            onClick={handleNext}
            variant="contained"
            endIcon={<ArrowForward />}
            disabled={!templateName || !selectedCategory || !selectedFile}
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
            Next: Add Form Fields
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
                disabled={uploading}
                startIcon={uploading ? <CircularProgress size={20} color="inherit" /> : null}
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
                {uploading ? 'Uploading...' : 'Upload Template'}
            </Button>
        </>
    );

    const dialogActions = currentStep === 1 ? step1Actions : step2Actions;

    return (
        <BaseDialog
            open={open}
            onClose={handleClose}
            title={currentStep === 1 ? "Upload Template - Step 1: Basic Information" : "Upload Template - Step 2: Add Form Fields"}
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

                    {/* File Upload Area */}
                    <Box>
                        <Typography
                            variant="body2"
                            sx={{
                                fontWeight: 600,
                                mb: 0.5,
                                color: 'text.primary',
                            }}
                        >
                            Template File <span style={{ color: '#ef4444' }}>*</span>
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
                                onClick={() => document.getElementById('file-upload-input')?.click()}
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
                                    Supported formats: PDF
                                </Typography>
                                <input
                                    id="file-upload-input"
                                    type="file"
                                    accept=".pdf"
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
                                        // px: 2,
                                        // py: 1.75,
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
                                    isReadOnly={false}
                                    // ✅ Force start with Forms toolbar
                                    initialToolbarGroup="toolbarGroup-Forms"
                                    onDocumentLoaded={() => setDocumentLoaded(true)}
                                    onError={(msg) => setError(msg)}
                                    // ✅ AUTO-SAVE: Auto-save when form fields are added/modified
                                    onSave={handleAutoSave}
                                    // Track modifications
                                    onDocumentModified={() => {
                                        if (!pdfModified) {
                                            console.log('📝 PDF Modified - will upload binary blob instead of original file');
                                            setPdfModified(true);
                                        }
                                    }}
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
