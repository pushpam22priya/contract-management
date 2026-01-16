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
            console.log('📤 Starting template upload...');

            // Extract form fields if in Step 2 (PDF with forms)
            let formFields: any[] = [];
            if (currentStep === 2 && pdfViewerRef.current) {
                console.log('📦 Extracting form fields from PDF...');
                formFields = await pdfViewerRef.current.exportFormFields();
                console.log(`  - Extracted ${formFields.length} form fields`);
            }

            // Import MockAPI service
            const { mockApiService } = await import('@/services/mockApiService');

            // Upload via MockAPI
            console.log('🚀 Uploading template via MockAPI...');
            const result = await mockApiService.uploadTemplate({
                name: templateName.trim(),
                description: description.trim(),
                category: selectedCategory,
                file: selectedFile,
                uploadedBy: currentUser.email,
                formFields: formFields,
            });

            if (result.success) {
                console.log('✅ Template uploaded successfully!');
                console.log('  - Template ID:', result.template?.id);
                console.log('  - Form fields saved:', result.template?.formFields?.length || 0);

                setSuccess('Template uploaded successfully!');
                setTimeout(() => {
                    handleClose();
                    onSuccess?.();
                }, 1500);
            } else {
                setError(result.message);
            }
        } catch (err) {
            console.error('❌ Error uploading template:', err);
            setError('Failed to upload template. Please try again.');
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
                                    Supported formats: PDF, DOCX, DOC
                                </Typography>
                                <input
                                    id="file-upload-input"
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
                                    readOnly={false}
                                    toolbarMode="forms"
                                    onDocumentLoaded={() => setDocumentLoaded(true)}
                                    onError={(err) => setError(err)}
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
