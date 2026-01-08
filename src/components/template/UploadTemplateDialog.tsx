'use client';

import { useState } from 'react';
import {
    Box,
    Button,
    TextField,
    Autocomplete,
    Typography,
    IconButton,
    Chip,
    alpha,
} from '@mui/material';
import BaseDialog from '@/components/common/BaseDialog';
import CloudUploadIcon from '@mui/icons-material/CloudUpload';
import InsertDriveFileOutlinedIcon from '@mui/icons-material/InsertDriveFileOutlined';
import CloseIcon from '@mui/icons-material/Close';
import AddCircleOutlineIcon from '@mui/icons-material/AddCircleOutline';

interface UploadTemplateDialogProps {
    open: boolean;
    onClose: () => void;
    existingCategories?: string[];
}

export default function UploadTemplateDialog({
    open,
    onClose,
    existingCategories = ['Service', 'Legal', 'HR', 'Procurement', 'Technology'],
}: UploadTemplateDialogProps) {
    const [templateName, setTemplateName] = useState('');
    const [description, setDescription] = useState('');
    const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
    const [categories, setCategories] = useState<string[]>(existingCategories);
    const [newCategory, setNewCategory] = useState('');
    const [showNewCategoryInput, setShowNewCategoryInput] = useState(false);
    const [selectedFile, setSelectedFile] = useState<File | null>(null);
    const [dragActive, setDragActive] = useState(false);

    // Handle file upload
    const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
        const file = event.target.files?.[0];
        if (file) {
            setSelectedFile(file);
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
    const handleAddNewCategory = () => {
        if (newCategory.trim() && !categories.includes(newCategory.trim())) {
            const updatedCategories = [...categories, newCategory.trim()];
            setCategories(updatedCategories);
            setSelectedCategory(newCategory.trim());
            setNewCategory('');
            setShowNewCategoryInput(false);
        }
    };

    // Handle submit
    const handleSubmit = () => {
        // Validate form
        if (!templateName.trim()) {
            alert('Please enter a template name');
            return;
        }
        if (!selectedCategory) {
            alert('Please select a category');
            return;
        }
        if (!selectedFile) {
            alert('Please upload a file');
            return;
        }

        // Process upload here
        console.log({
            templateName,
            description,
            category: selectedCategory,
            file: selectedFile,
        });

        // Reset form and close
        handleClose();
    };

    // Handle close
    const handleClose = () => {
        setTemplateName('');
        setDescription('');
        setSelectedCategory(null);
        setSelectedFile(null);
        setNewCategory('');
        setShowNewCategoryInput(false);
        onClose();
    };

    const dialogActions = (
        <>
            <Button
                onClick={handleSubmit}
                variant="contained"
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
                Upload Template
            </Button>
        </>
    );

    return (
        <BaseDialog
            open={open}
            onClose={handleClose}
            title="UPLOAD TEMPLATE"
            actions={dialogActions}
            maxWidth="sm"
        >
            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
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
                                renderOption={(props, option) => (
                                    <li {...props}>
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
                                )}
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
        </BaseDialog>
    );
}
