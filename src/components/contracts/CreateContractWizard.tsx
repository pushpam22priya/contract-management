'use client';

import { useState, useEffect } from 'react';
import {
    Box,
    Typography,
    Stepper,
    Step,
    StepLabel,
    Button,
    IconButton,
    Autocomplete,
    TextField,
    Slide,
    Alert,
    Chip,
    Fade,
    Collapse,
    alpha,
    CircularProgress,
} from '@mui/material';
import { ArrowBack, ArrowForward } from '@mui/icons-material';
import BaseDialog from '@/components/common/BaseDialog';
import { LocalizationProvider } from '@mui/x-date-pickers/LocalizationProvider';
import { AdapterDayjs } from '@mui/x-date-pickers/AdapterDayjs';
import { DatePicker } from '@mui/x-date-pickers/DatePicker';
import { Dayjs } from 'dayjs';
import InsertDriveFileOutlinedIcon from '@mui/icons-material/InsertDriveFileOutlined';
import CloseIcon from '@mui/icons-material/Close';
import { templateService } from '@/services/templateService';
import { Template } from '@/types/template';
import { extractTemplateFields, populateTemplate, TemplateField } from '@/utils/templateParser';
import dayjs from 'dayjs';
import { contractService } from '@/services/contractService';
import { authService } from '@/services/authService';

const steps = [
    {
        label: 'Template Selection',
        description: 'Choose a contract template',
    },
    {
        label: 'Basic Information',
        description: 'Contract details',
    },
    {
        label: 'Terms & Dates',
        description: 'Set contract period',
    },
    {
        label: 'Review & Create',
        description: 'Confirm details',
    },
];

interface CreateContractWizardProps {
    open: boolean;
    onClose: () => void;
    initialTemplate?: string;
}

const CreateContractWizard = ({ open, onClose, initialTemplate }: CreateContractWizardProps) => {
    const [activeStep, setActiveStep] = useState(0);
    const [selectedTemplate, setSelectedTemplate] = useState<Template | null>(null);
    const [templates, setTemplates] = useState<Template[]>([]);
    const [loadingTemplates, setLoadingTemplates] = useState(false);

    // ADD new state for dynamic categories:
    const [categoryOptions, setCategoryOptions] = useState<{ label: string; value: string }[]>([]);

    // State for template dynamic fields and values
    const [templateFields, setTemplateFields] = useState<TemplateField[]>([]);
    const [fieldValues, setFieldValues] = useState<Record<string, string>>({});

    // Step 2: Basic Information state
    const [contractTitle, setContractTitle] = useState('');
    const [clientName, setClientName] = useState('');
    const [description, setDescription] = useState('');
    const [contractValue, setContractValue] = useState('');
    const [category, setCategory] = useState<{ label: string; value: string } | null>(null);

    // Step 3: Terms & Dates state
    const [startDate, setStartDate] = useState<Dayjs | null>(null);
    const [endDate, setEndDate] = useState<Dayjs | null>(null);

    // Load templates when dialog opens
    useEffect(() => {
        if (open) {
            setLoadingTemplates(true);
            const allTemplates = templateService.getAllTemplates();
            setTemplates(allTemplates);

            // Extract unique categories from templates
            const uniqueCategories = Array.from(
                new Set(allTemplates.map(t => t.category))
            ).map(cat => ({
                label: cat,
                value: cat.toLowerCase().replace(/\s+/g, '_')
            }));
            setCategoryOptions(uniqueCategories);

            setLoadingTemplates(false);

            // Handle initialTemplate if provided
            // if (initialTemplate) {
            //     const template = allTemplates.find(t => t.name === initialTemplate);
            //     if (template) {
            //         setSelectedTemplate(template);
            //         // Extract fields from template
            //         if (template.content) {
            //             const fields = extractTemplateFields(template.content);
            //             setTemplateFields(fields);
            //             // Initialize field values
            //             const initialValues: Record<string, string> = {};
            //             fields.forEach(field => {
            //                 initialValues[field.name] = '';
            //             });
            //             setFieldValues(initialValues);
            //         }
            //     }
            // }

            // Handle initialTemplate if provided
            if (initialTemplate) {
                const template = allTemplates.find(t => t.name === initialTemplate);
                if (template) {
                    setSelectedTemplate(template);
                }
            }
        }
    }, [open, initialTemplate]);

    // Add effect to extract fields when template changes
    useEffect(() => {
        if (selectedTemplate?.content) {
            const fields = extractTemplateFields(selectedTemplate.content);
            setTemplateFields(fields);

            // Initialize field values
            const initialValues: Record<string, string> = {};
            fields.forEach(field => {
                initialValues[field.name] = '';
            });
            setFieldValues(initialValues);
        } else {
            setTemplateFields([]);
            setFieldValues({});
        }
    }, [selectedTemplate]);

    const handleNext = () => {
        if (activeStep < steps.length - 1) {
            setActiveStep((prev) => prev + 1);
        } else {
            // FINAL STEP - Create Contract
            handleCreateContract();
        }
    };

    // Add state for saving
    const [saving, setSaving] = useState(false);

    // Add contract creation handler
    const handleCreateContract = async () => {
        if (!selectedTemplate) return;

        setSaving(true);

        try {
            // Generate populated contract content
            const populatedContent = selectedTemplate.content
                ? populateTemplate(selectedTemplate.content, fieldValues)
                : 'Contract content not available';

            // Get current user
            const currentUser = authService.getCurrentUser();

            // Create contract object matching the unified Contract interface
            // Calculate expiresInDays
            const calculateExpiresInDays = (endDateStr?: string): number => {
                if (!endDateStr) return 0;
                const end = dayjs(endDateStr);
                const today = dayjs();
                return Math.max(0, end.diff(today, 'day'));
            };

            // Get dates
            const contractStartDate = templateFields.length > 0
                ? (fieldValues['start_date'] || undefined)
                : (startDate?.format('YYYY-MM-DD') || undefined);

            const contractEndDate = templateFields.length > 0
                ? (fieldValues['end_date'] || undefined)
                : (endDate?.format('YYYY-MM-DD') || undefined);

            // Create contract object matching the unified Contract interface
            const contractData = {
                // Card display fields (from Step 2)
                title: contractTitle,
                client: clientName,  // ← Changed from clientName to client
                description: description || '',
                value: contractValue || '',
                category: category?.label || 'Uncategorized',
                expiresInDays: calculateExpiresInDays(contractEndDate),
                status: 'draft' as const,
                templateDocxBase64: selectedTemplate.docxBase64, // Store for later use
                templateFileName: selectedTemplate.fileName,

                // Template info
                templateId: selectedTemplate.id,
                templateName: selectedTemplate.name,

                // Content (for PDF viewer - includes dynamic fields)
                content: populatedContent,
                fieldValues: fieldValues,

                // Dates
                startDate: contractStartDate,
                endDate: contractEndDate,

                // Metadata
                createdBy: currentUser?.email || 'user@demo.com',
            };
            // Save contract
            const result = await contractService.createContract(contractData);

            if (result.success) {
                alert('Contract created successfully! ✅');
                handleClose();
                // Optionally reload the page to show new contract
                window.location.reload();
            } else {
                alert('Failed to create contract: ' + result.message);
            }
        } catch (error) {
            console.error('Error creating contract:', error);
            alert('An error occurred while creating the contract');
        } finally {
            setSaving(false);
        }
    };


    const handleBack = () => {
        if (activeStep > 0) {
            setActiveStep((prev) => prev - 1);
        }
    };

    const handleClose = () => {
        setActiveStep(0);
        setSelectedTemplate(null);
        setTemplateFields([]);
        setFieldValues({});
        setContractTitle('');
        setClientName('');
        setDescription('');
        setContractValue('');
        setCategory(null);
        setStartDate(null);
        setEndDate(null);
        onClose();
    };

    const handleRemoveTemplate = () => {
        setSelectedTemplate(null);
    };

    // Add helper function to check if all required fields are filled
    const areAllFieldsFilled = (): boolean => {
        // If template has custom fields
        if (templateFields.length > 0) {
            return templateFields.every(field => {
                const value = fieldValues[field.name];
                return value && value.trim().length > 0;
            });
        }

        // Fallback to date validation for templates without fields
        return !!startDate && !!endDate;
    };


    const isNextDisabled =
        (activeStep === 0 && !selectedTemplate) ||
        (activeStep === 1 && (!contractTitle || !clientName)) ||
        (activeStep === 2 && !areAllFieldsFilled());

    const dialogActions = (
        <>
            <Button
                onClick={handleBack}
                disabled={activeStep === 0}
                startIcon={<ArrowBack />}
                sx={{
                    textTransform: 'none',
                    fontWeight: 500,
                    color: 'text.secondary',
                    '&:hover': {
                        bgcolor: 'action.hover',
                    },
                    '&.Mui-disabled': {
                        opacity: 0.3,
                    },
                }}
            >
                Previous
            </Button>

            <Button
                onClick={handleNext}
                disabled={isNextDisabled || saving}
                endIcon={saving ? <CircularProgress size={20} /> : <ArrowForward />}
                variant="contained"
                sx={{
                    textTransform: 'none',
                    fontWeight: 500,
                    bgcolor: 'primary.main',
                    color: 'white',
                    px: 3,
                    py: 1,
                    boxShadow: '0 2px 8px rgba(15, 118, 110, 0.25)',
                    '&:hover': {
                        bgcolor: 'primary.dark',
                        boxShadow: '0 4px 12px rgba(15, 118, 110, 0.35)',
                    },
                    '&.Mui-disabled': {
                        opacity: 0.5,
                        bgcolor: 'primary.main',
                        color: 'white',
                    },
                }}
            >
                {activeStep === steps.length - 1
                    ? (saving ? 'Creating...' : 'Create Contract')
                    : 'Next'}
            </Button>
        </>
    );

    return (
        <LocalizationProvider dateAdapter={AdapterDayjs}>
            <BaseDialog
                open={open}
                onClose={handleClose}
                title="Create New Contract"
                maxWidth="md"
                actions={dialogActions}
            >
                <Box>
                    {/* Subtitle */}
                    <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
                        Follow the steps to create your contract
                    </Typography>

                    {/* Stepper */}
                    <Box sx={{ mb: 3 }}>
                        <Stepper activeStep={activeStep} alternativeLabel>
                            {steps.map((step, index) => (
                                <Step key={step.label}>
                                    <StepLabel
                                        StepIconProps={{
                                            sx: {
                                                '&.Mui-active': {
                                                    color: 'primary.main',
                                                },
                                                '&.Mui-completed': {
                                                    color: 'primary.main',
                                                },
                                            },
                                        }}
                                    >
                                        <Typography
                                            variant="body2"
                                            fontWeight={activeStep === index ? 600 : 500}
                                            sx={{
                                                color: activeStep === index ? 'primary.main' : 'text.secondary',
                                                fontSize: { xs: '0.75rem', sm: '0.875rem' },
                                            }}
                                        >
                                            {step.label}
                                        </Typography>
                                        <Typography
                                            variant="caption"
                                            sx={{
                                                color: 'text.secondary',
                                                display: { xs: 'none', sm: 'block' },
                                            }}
                                        >
                                            {step.description}
                                        </Typography>
                                    </StepLabel>
                                </Step>
                            ))}
                        </Stepper>
                    </Box>

                    {/* Step Content */}
                    <Box sx={{ minHeight: 280 }}>
                        {/* Step 1: Template Selection */}
                        {activeStep === 0 && (
                            <Slide
                                direction="left"
                                in={activeStep === 0}
                                timeout={300}
                            >
                                <Box>
                                    <Typography
                                        variant="h6"
                                        fontWeight={600}
                                        sx={{ mb: 1, color: 'text.primary' }}
                                    >
                                        Template Selection
                                    </Typography>
                                    <Typography
                                        variant="body2"
                                        color="text.secondary"
                                        sx={{ mb: 3 }}
                                    >
                                        Choose a contract template to get started
                                    </Typography>

                                    <Box>
                                        <Typography
                                            variant="subtitle2"
                                            fontWeight={600}
                                            sx={{ mb: 1.5, color: 'text.primary' }}
                                        >
                                            Select Template <span style={{ color: '#ef4444' }}>*</span>
                                        </Typography>

                                        {/* Template Selection - Dynamic UI */}
                                        {!selectedTemplate ? (
                                            <Fade in={!selectedTemplate} timeout={400}>
                                                <Box>
                                                    <Autocomplete
                                                        value={selectedTemplate}
                                                        onChange={(event, newValue) => {
                                                            setSelectedTemplate(newValue);
                                                        }}
                                                        options={templates}
                                                        getOptionLabel={(option) => option.name}
                                                        loading={loadingTemplates}
                                                        disableClearable={false}
                                                        renderOption={(props, option) => (
                                                            <li {...props} key={option.id}>
                                                                <Box sx={{ display: 'flex', flexDirection: 'column', width: '100%' }}>
                                                                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 0.5 }}>
                                                                        <Typography variant="body2" fontWeight={600}>
                                                                            {option.name}
                                                                        </Typography>
                                                                        <Chip
                                                                            label={option.category}
                                                                            size="small"
                                                                            sx={{
                                                                                height: 20,
                                                                                fontSize: '0.7rem',
                                                                                bgcolor: 'rgba(15, 118, 110, 0.08)',
                                                                                color: 'primary.main',
                                                                                fontWeight: 500,
                                                                            }}
                                                                        />
                                                                    </Box>
                                                                    {option.description && (
                                                                        <Typography
                                                                            variant="caption"
                                                                            sx={{ color: 'text.secondary', fontSize: '0.75rem' }}
                                                                        >
                                                                            {option.description}
                                                                        </Typography>
                                                                    )}
                                                                </Box>
                                                            </li>
                                                        )}
                                                        renderInput={(params) => (
                                                            <TextField
                                                                {...params}
                                                                placeholder="Search and select a template..."
                                                                sx={{
                                                                    '& .MuiOutlinedInput-root': {
                                                                        bgcolor: '#f8fafc',
                                                                        borderRadius: 2,
                                                                        '&:hover': {
                                                                            bgcolor: '#f1f5f9',
                                                                        },
                                                                        '&.Mui-focused': {
                                                                            bgcolor: 'background.paper',
                                                                        },
                                                                    },
                                                                    '& .MuiOutlinedInput-input': {
                                                                        py: 1.5,
                                                                        fontSize: '0.95rem',
                                                                    },
                                                                }}
                                                            />
                                                        )}
                                                    />
                                                </Box>
                                            </Fade>
                                        ) : (
                                            <Fade in={!!selectedTemplate} timeout={400}>
                                                <Box
                                                    sx={{
                                                        border: '1px solid',
                                                        borderColor: 'primary.main',
                                                        borderRadius: 2,
                                                        p: 2,
                                                        display: 'flex',
                                                        alignItems: 'center',
                                                        justifyContent: 'space-between',
                                                        bgcolor: alpha('#0f766e', 0.04),
                                                        transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
                                                        '&:hover': {
                                                            boxShadow: '0 4px 12px rgba(15, 118, 110, 0.12)',
                                                        },
                                                    }}
                                                >
                                                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, flex: 1 }}>
                                                        {/* File Icon */}
                                                        <Box
                                                            sx={{
                                                                width: 48,
                                                                height: 48,
                                                                borderRadius: 1.5,
                                                                bgcolor: 'primary.main',
                                                                display: 'flex',
                                                                alignItems: 'center',
                                                                justifyContent: 'center',
                                                                flexShrink: 0,
                                                            }}
                                                        >
                                                            <InsertDriveFileOutlinedIcon
                                                                sx={{ fontSize: 24, color: 'white' }}
                                                            />
                                                        </Box>

                                                        {/* Template Info */}
                                                        <Box sx={{ flex: 1, minWidth: 0 }}>
                                                            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 0.5 }}>
                                                                <Typography
                                                                    variant="body1"
                                                                    fontWeight={600}
                                                                    sx={{
                                                                        color: 'text.primary',
                                                                        overflow: 'hidden',
                                                                        textOverflow: 'ellipsis',
                                                                        whiteSpace: 'nowrap',
                                                                    }}
                                                                >
                                                                    {selectedTemplate.name}
                                                                </Typography>
                                                                <Chip
                                                                    label={selectedTemplate.category}
                                                                    size="small"
                                                                    sx={{
                                                                        height: 22,
                                                                        fontSize: '0.7rem',
                                                                        bgcolor: 'primary.main',
                                                                        color: 'white',
                                                                        fontWeight: 600,
                                                                    }}
                                                                />
                                                            </Box>
                                                            <Typography
                                                                variant="caption"
                                                                sx={{
                                                                    color: 'text.secondary',
                                                                    display: 'block',
                                                                }}
                                                            >
                                                                {selectedTemplate.fileName}
                                                            </Typography>
                                                        </Box>
                                                    </Box>

                                                    {/* Remove Button */}
                                                    <IconButton
                                                        onClick={handleRemoveTemplate}
                                                        size="small"
                                                        sx={{
                                                            ml: 1,
                                                            color: 'text.secondary',
                                                            transition: 'all 0.2s',
                                                            '&:hover': {
                                                                bgcolor: 'rgba(211, 47, 47, 0.08)',
                                                                color: 'error.main',
                                                                transform: 'rotate(90deg)',
                                                            },
                                                        }}
                                                    >
                                                        <CloseIcon fontSize="small" />
                                                    </IconButton>
                                                </Box>
                                            </Fade>
                                        )}
                                    </Box>
                                </Box>
                            </Slide>
                        )}

                        {/* Placeholder for other steps */}
                        {activeStep === 1 && (
                            <Slide
                                direction="left"
                                in={activeStep === 1}
                                timeout={300}
                            >
                                <Box>
                                    <Typography
                                        variant="h6"
                                        fontWeight={600}
                                        sx={{ mb: 1, color: 'text.primary' }}
                                    >
                                        Basic Information
                                    </Typography>
                                    <Typography
                                        variant="body2"
                                        color="text.secondary"
                                        sx={{ mb: 3 }}
                                    >
                                        Contract details
                                    </Typography>

                                    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
                                        {/* Contract Title */}
                                        <Box>
                                            <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 1.5 }}>
                                                <Typography
                                                    variant="subtitle2"
                                                    fontWeight={600}
                                                    sx={{ color: 'text.primary' }}
                                                >
                                                    Contract Title <span style={{ color: '#d32f2f' }}>*</span>
                                                </Typography>
                                                <Typography
                                                    variant="caption"
                                                    sx={{
                                                        color: contractTitle.length > 100 ? 'error.main' : 'text.secondary',
                                                        fontWeight: 500
                                                    }}
                                                >
                                                    {contractTitle.length}/100
                                                </Typography>
                                            </Box>
                                            <TextField
                                                fullWidth
                                                placeholder="e.g., Annual Software Maintenance Agreement"
                                                value={contractTitle}
                                                onChange={(e) => {
                                                    if (e.target.value.length <= 100) {
                                                        setContractTitle(e.target.value);
                                                    }
                                                }}
                                                autoFocus
                                                error={contractTitle.length > 100}
                                                sx={{
                                                    '& .MuiOutlinedInput-root': {
                                                        bgcolor: '#f8fafc',
                                                        borderRadius: 2,
                                                        '&:hover': {
                                                            bgcolor: '#f1f5f9',
                                                        },
                                                        '&.Mui-focused': {
                                                            bgcolor: 'background.paper',
                                                        },
                                                    },
                                                    '& .MuiOutlinedInput-input': {
                                                        py: 1.5,
                                                        fontSize: '0.95rem',
                                                    },
                                                }}
                                            />
                                        </Box>

                                        {/* Client Name */}
                                        <Box>
                                            <Typography
                                                variant="subtitle2"
                                                fontWeight={600}
                                                sx={{ mb: 1.5, color: 'text.primary' }}
                                            >
                                                Client Name <span style={{ color: '#d32f2f' }}>*</span>
                                            </Typography>
                                            <TextField
                                                fullWidth
                                                placeholder="e.g., TechCorp Solutions"
                                                value={clientName}
                                                onChange={(e) => setClientName(e.target.value)}
                                                sx={{
                                                    '& .MuiOutlinedInput-root': {
                                                        bgcolor: '#f8fafc',
                                                        borderRadius: 2,
                                                        '&:hover': {
                                                            bgcolor: '#f1f5f9',
                                                        },
                                                        '&.Mui-focused': {
                                                            bgcolor: 'background.paper',
                                                        },
                                                    },
                                                    '& .MuiOutlinedInput-input': {
                                                        py: 1.5,
                                                        fontSize: '0.95rem',
                                                    },
                                                }}
                                            />
                                        </Box>

                                        {/* Description */}
                                        <Box>
                                            <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 1.5 }}>
                                                <Typography
                                                    variant="subtitle2"
                                                    fontWeight={600}
                                                    sx={{ color: 'text.primary' }}
                                                >
                                                    Description
                                                </Typography>
                                                <Typography
                                                    variant="caption"
                                                    sx={{
                                                        color: description.length > 500 ? 'error.main' : 'text.secondary',
                                                        fontWeight: 500
                                                    }}
                                                >
                                                    {description.length}/500
                                                </Typography>
                                            </Box>
                                            <TextField
                                                fullWidth
                                                multiline
                                                rows={3}
                                                placeholder="Enter a brief description of the contract terms, deliverables, and key points..."
                                                value={description}
                                                onChange={(e) => {
                                                    if (e.target.value.length <= 500) {
                                                        setDescription(e.target.value);
                                                    }
                                                }}
                                                error={description.length > 500}
                                                sx={{
                                                    '& .MuiOutlinedInput-root': {
                                                        bgcolor: '#f8fafc',
                                                        borderRadius: 2,
                                                        '&:hover': {
                                                            bgcolor: '#f1f5f9',
                                                        },
                                                        '&.Mui-focused': {
                                                            bgcolor: 'background.paper',
                                                        },
                                                    },
                                                    '& .MuiOutlinedInput-input': {
                                                        fontSize: '0.95rem',
                                                    },
                                                }}
                                            />
                                        </Box>

                                        {/* Contract Value and Category */}
                                        <Box
                                            sx={{
                                                display: 'grid',
                                                gridTemplateColumns: { xs: '1fr', sm: 'repeat(2, 1fr)' },
                                                gap: 3,
                                            }}
                                        >
                                            {/* Contract Value */}
                                            <Box>
                                                <Typography
                                                    variant="subtitle2"
                                                    fontWeight={600}
                                                    sx={{ mb: 1.5, color: 'text.primary' }}
                                                >
                                                    Contract Value (₹)
                                                </Typography>
                                                <TextField
                                                    fullWidth
                                                    type="number"
                                                    placeholder="0"
                                                    value={contractValue}
                                                    onChange={(e) => setContractValue(e.target.value)}
                                                    sx={{
                                                        '& .MuiOutlinedInput-root': {
                                                            bgcolor: '#f8fafc',
                                                            borderRadius: 2,
                                                            '&:hover': {
                                                                bgcolor: '#f1f5f9',
                                                            },
                                                            '&.Mui-focused': {
                                                                bgcolor: 'background.paper',
                                                            },
                                                        },
                                                        '& .MuiOutlinedInput-input': {
                                                            py: 1.5,
                                                            fontSize: '0.95rem',
                                                        },
                                                    }}
                                                />
                                            </Box>

                                            {/* Category */}
                                            <Box>
                                                <Typography
                                                    variant="subtitle2"
                                                    fontWeight={600}
                                                    sx={{ mb: 1.5, color: 'text.primary' }}
                                                >
                                                    Category
                                                </Typography>
                                                <Autocomplete
                                                    value={category}
                                                    onChange={(event, newValue) => {
                                                        setCategory(newValue);
                                                    }}
                                                    options={categoryOptions}
                                                    disableClearable={false}
                                                    renderInput={(params) => (
                                                        <TextField
                                                            {...params}
                                                            placeholder="Select category"
                                                            sx={{
                                                                '& .MuiOutlinedInput-root': {
                                                                    bgcolor: '#f8fafc',
                                                                    borderRadius: 2,
                                                                    padding: 0.5,
                                                                    '&:hover': {
                                                                        bgcolor: '#f1f5f9',
                                                                    },
                                                                    '&.Mui-focused': {
                                                                        bgcolor: 'background.paper',
                                                                    },
                                                                },
                                                                '& .MuiOutlinedInput-input': {
                                                                    fontSize: '0.95rem',
                                                                    fontWeight: 500,
                                                                },
                                                            }}
                                                        />
                                                    )}
                                                />
                                            </Box>
                                        </Box>
                                    </Box>
                                </Box>
                            </Slide>
                        )}

                        {activeStep === 2 && (
                            <Slide
                                direction="left"
                                in={activeStep === 2}
                                timeout={300}
                            >
                                <Box>
                                    <Typography
                                        variant="h6"
                                        fontWeight={600}
                                        sx={{ mb: 1, color: 'text.primary' }}
                                    >
                                        {templateFields.length > 0 ? 'Template Fields' : 'Terms & Dates'}
                                    </Typography>
                                    <Typography
                                        variant="body2"
                                        color="text.secondary"
                                        sx={{ mb: 3 }}
                                    >
                                        {templateFields.length > 0
                                            ? 'Fill in the template-specific fields'
                                            : 'Set contract period'}
                                    </Typography>

                                    {templateFields.length > 0 ? (
                                        // DYNAMIC TEMPLATE FIELDS
                                        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
                                            <Alert severity="info" sx={{ mb: 1 }}>
                                                This template requires {templateFields.length} field(s) to be filled
                                            </Alert>

                                            {templateFields.map((field, index) => (
                                                <Box key={field.name}>
                                                    <Typography
                                                        variant="subtitle2"
                                                        fontWeight={600}
                                                        sx={{ mb: 1.5, color: 'text.primary' }}
                                                    >
                                                        {field.label} {field.required && <span style={{ color: '#d32f2f' }}>*</span>}
                                                    </Typography>

                                                    {field.type === 'date' ? (
                                                        <DatePicker
                                                            value={fieldValues[field.name] ? dayjs(fieldValues[field.name]) : null}
                                                            onChange={(newValue) => {
                                                                setFieldValues(prev => ({
                                                                    ...prev,
                                                                    [field.name]: newValue ? newValue.format('YYYY-MM-DD') : ''
                                                                }));
                                                            }}
                                                            slotProps={{
                                                                textField: {
                                                                    fullWidth: true,
                                                                    placeholder: field.placeholder,
                                                                    sx: {
                                                                        '& .MuiOutlinedInput-root': {
                                                                            bgcolor: '#f8fafc',
                                                                            borderRadius: 2,
                                                                            '&:hover': { bgcolor: '#f1f5f9' },
                                                                            '&.Mui-focused': { bgcolor: 'background.paper' },
                                                                        },
                                                                        '& .MuiOutlinedInput-input': {
                                                                            py: 1.5,
                                                                            fontSize: '0.95rem',
                                                                        },
                                                                    },
                                                                },
                                                            }}
                                                        />
                                                    ) : (
                                                        <TextField
                                                            fullWidth
                                                            type={field.type}
                                                            placeholder={field.placeholder}
                                                            value={fieldValues[field.name] || ''}
                                                            onChange={(e) => {
                                                                setFieldValues(prev => ({
                                                                    ...prev,
                                                                    [field.name]: e.target.value
                                                                }));
                                                            }}
                                                            autoFocus={index === 0}
                                                            sx={{
                                                                '& .MuiOutlinedInput-root': {
                                                                    bgcolor: '#f8fafc',
                                                                    borderRadius: 2,
                                                                    '&:hover': { bgcolor: '#f1f5f9' },
                                                                    '&.Mui-focused': { bgcolor: 'background.paper' },
                                                                },
                                                                '& .MuiOutlinedInput-input': {
                                                                    py: 1.5,
                                                                    fontSize: '0.95rem',
                                                                },
                                                            }}
                                                        />
                                                    )}
                                                </Box>
                                            ))}
                                        </Box>
                                    ) : (
                                        // DEFAULT DATE RANGE FIELDS (for templates without placeholders)
                                        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
                                            <Box
                                                sx={{
                                                    display: 'grid',
                                                    gridTemplateColumns: { xs: '1fr', sm: 'repeat(2, 1fr)' },
                                                    gap: 3,
                                                }}
                                            >
                                                {/* Start Date */}
                                                <Box>
                                                    <Typography
                                                        variant="subtitle2"
                                                        fontWeight={600}
                                                        sx={{ mb: 1.5, color: 'text.primary' }}
                                                    >
                                                        Start Date <span style={{ color: '#d32f2f' }}>*</span>
                                                    </Typography>
                                                    <DatePicker
                                                        value={startDate}
                                                        onChange={(newValue) => setStartDate(newValue)}
                                                        slotProps={{
                                                            textField: {
                                                                fullWidth: true,
                                                                placeholder: 'dd-mm-yyyy',
                                                                sx: {
                                                                    '& .MuiOutlinedInput-root': {
                                                                        bgcolor: '#f8fafc',
                                                                        borderRadius: 2,
                                                                        '&:hover': { bgcolor: '#f1f5f9' },
                                                                        '&.Mui-focused': { bgcolor: 'background.paper' },
                                                                    },
                                                                    '& .MuiOutlinedInput-input': {
                                                                        py: 1.5,
                                                                        fontSize: '0.95rem',
                                                                    },
                                                                },
                                                            },
                                                        }}
                                                    />
                                                </Box>
                                                {/* End Date */}
                                                <Box>
                                                    <Typography
                                                        variant="subtitle2"
                                                        fontWeight={600}
                                                        sx={{ mb: 1.5, color: 'text.primary' }}
                                                    >
                                                        End Date <span style={{ color: '#d32f2f' }}>*</span>
                                                    </Typography>
                                                    <DatePicker
                                                        value={endDate}
                                                        onChange={(newValue) => setEndDate(newValue)}
                                                        minDate={startDate || undefined}
                                                        slotProps={{
                                                            textField: {
                                                                fullWidth: true,
                                                                placeholder: 'dd-mm-yyyy',
                                                                sx: {
                                                                    '& .MuiOutlinedInput-root': {
                                                                        bgcolor: '#f8fafc',
                                                                        borderRadius: 2,
                                                                        '&:hover': { bgcolor: '#f1f5f9' },
                                                                        '&.Mui-focused': { bgcolor: 'background.paper' },
                                                                    },
                                                                    '& .MuiOutlinedInput-input': {
                                                                        py: 1.5,
                                                                        fontSize: '0.95rem',
                                                                    },
                                                                },
                                                            },
                                                        }}
                                                    />
                                                </Box>
                                            </Box>
                                        </Box>
                                    )}
                                </Box>
                            </Slide>
                        )}

                        {activeStep === 3 && (
                            <Slide
                                direction="left"
                                in={activeStep === 3}
                                timeout={300}
                            >
                                <Box>
                                    <Typography
                                        variant="h6"
                                        fontWeight={600}
                                        sx={{ mb: 1, color: 'text.primary' }}
                                    >
                                        Review & Create
                                    </Typography>
                                    <Typography
                                        variant="body2"
                                        color="text.secondary"
                                        sx={{ mb: 3 }}
                                    >
                                        Confirm details
                                    </Typography>

                                    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2.5 }}>
                                        {/* Contract Title & Client */}
                                        <Box
                                            sx={{
                                                display: 'grid',
                                                gridTemplateColumns: { xs: '1fr', sm: 'repeat(2, 1fr)' },
                                                gap: 2.5,
                                            }}
                                        >
                                            <Box>
                                                <Typography
                                                    variant="caption"
                                                    sx={{ color: 'text.secondary', display: 'block', mb: 0.5 }}
                                                >
                                                    Contract Title
                                                </Typography>
                                                <Typography variant="body1" fontWeight={500}>
                                                    {contractTitle || '-'}
                                                </Typography>
                                            </Box>
                                            <Box>
                                                <Typography
                                                    variant="caption"
                                                    sx={{ color: 'text.secondary', display: 'block', mb: 0.5 }}
                                                >
                                                    Client
                                                </Typography>
                                                <Typography variant="body1" fontWeight={500}>
                                                    {clientName || '-'}
                                                </Typography>
                                            </Box>
                                        </Box>

                                        {/* Value & Category */}
                                        <Box
                                            sx={{
                                                display: 'grid',
                                                gridTemplateColumns: { xs: '1fr', sm: 'repeat(2, 1fr)' },
                                                gap: 2.5,
                                            }}
                                        >
                                            <Box>
                                                <Typography
                                                    variant="caption"
                                                    sx={{ color: 'text.secondary', display: 'block', mb: 0.5 }}
                                                >
                                                    Value
                                                </Typography>
                                                <Typography variant="body1" fontWeight={500}>
                                                    {contractValue ? `₹${contractValue}` : '-'}
                                                </Typography>
                                            </Box>
                                            <Box>
                                                <Typography
                                                    variant="caption"
                                                    sx={{ color: 'text.secondary', display: 'block', mb: 0.5 }}
                                                >
                                                    Category
                                                </Typography>
                                                <Typography variant="body1" fontWeight={500}>
                                                    {category?.label || '-'}
                                                </Typography>
                                            </Box>
                                        </Box>

                                        {/* Start Date & End Date */}
                                        <Box
                                            sx={{
                                                display: 'grid',
                                                gridTemplateColumns: { xs: '1fr', sm: 'repeat(2, 1fr)' },
                                                gap: 2.5,
                                            }}
                                        >
                                            <Box>
                                                <Typography
                                                    variant="caption"
                                                    sx={{ color: 'text.secondary', display: 'block', mb: 0.5 }}
                                                >
                                                    Start Date
                                                </Typography>
                                                <Typography variant="body1" fontWeight={500}>
                                                    {startDate ? startDate.format('MM/DD/YYYY') : '-'}
                                                </Typography>
                                            </Box>
                                            <Box>
                                                <Typography
                                                    variant="caption"
                                                    sx={{ color: 'text.secondary', display: 'block', mb: 0.5 }}
                                                >
                                                    End Date
                                                </Typography>
                                                <Typography variant="body1" fontWeight={500}>
                                                    {endDate ? endDate.format('MM/DD/YYYY') : '-'}
                                                </Typography>
                                            </Box>
                                        </Box>

                                        {/* Description */}
                                        <Box>
                                            <Typography
                                                variant="caption"
                                                sx={{ color: 'text.secondary', display: 'block', mb: 0.5 }}
                                            >
                                                Description
                                            </Typography>
                                            <Typography variant="body1" fontWeight={500}>
                                                {description || '-'}
                                            </Typography>
                                        </Box>

                                        {/* Template */}
                                        <Box>
                                            <Typography
                                                variant="caption"
                                                sx={{ color: 'text.secondary', display: 'block', mb: 0.5 }}
                                            >
                                                Template
                                            </Typography>
                                            <Typography variant="body1" fontWeight={500}>
                                                {selectedTemplate?.name || '-'}
                                            </Typography>
                                        </Box>

                                        {/* Template Fields */}
                                        {templateFields.length > 0 && (
                                            <Box>
                                                <Typography
                                                    variant="caption"
                                                    sx={{ color: 'text.secondary', display: 'block', mb: 1 }}
                                                >
                                                    Template Fields
                                                </Typography>
                                                <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: 'repeat(2, 1fr)' }, gap: 2 }}>
                                                    {templateFields.map(field => (
                                                        <Box key={field.name}>
                                                            <Typography variant="caption" sx={{ color: 'text.secondary' }}>
                                                                {field.label}
                                                            </Typography>
                                                            <Typography variant="body2" fontWeight={500}>
                                                                {fieldValues[field.name] || '-'}
                                                            </Typography>
                                                        </Box>
                                                    ))}
                                                </Box>
                                            </Box>
                                        )}
                                    </Box>
                                </Box>
                            </Slide>
                        )}
                    </Box>
                </Box>
            </BaseDialog>
        </LocalizationProvider>
    );
};

export default CreateContractWizard;
