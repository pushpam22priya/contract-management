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
} from '@mui/material';
import { ArrowBack, ArrowForward } from '@mui/icons-material';
import BaseDialog from '@/components/common/BaseDialog';
import { LocalizationProvider } from '@mui/x-date-pickers/LocalizationProvider';
import { AdapterDayjs } from '@mui/x-date-pickers/AdapterDayjs';
import { DatePicker } from '@mui/x-date-pickers/DatePicker';
import { Dayjs } from 'dayjs';

const categoryOptions = [
    { label: 'Legal', value: 'legal' },
    { label: 'Finance', value: 'finance' },
    { label: 'HR', value: 'hr' },
    { label: 'Sales', value: 'sales' },
    { label: 'Service', value: 'service' },
];

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

const templateOptions = [
    { label: 'Service Agreement', value: 'service' },
    { label: 'Employment Contract', value: 'employment' },
    { label: 'Non-Disclosure Agreement (NDA)', value: 'nda' },
    { label: 'Partnership Agreement', value: 'partnership' },
    { label: 'Lease Agreement', value: 'lease' },
    { label: 'Sales Contract', value: 'sales' },
    { label: 'Consulting Agreement', value: 'consulting' },
    { label: 'Vendor Agreement', value: 'vendor' },
];

interface CreateContractWizardProps {
    open: boolean;
    onClose: () => void;
    initialTemplate?: string;
}

const CreateContractWizard = ({ open, onClose, initialTemplate }: CreateContractWizardProps) => {
    const [activeStep, setActiveStep] = useState(0);
    const [selectedTemplate, setSelectedTemplate] = useState<{ label: string; value: string } | null>(null);

    // Step 2: Basic Information state
    const [contractTitle, setContractTitle] = useState('');
    const [clientName, setClientName] = useState('');
    const [description, setDescription] = useState('');
    const [contractValue, setContractValue] = useState('');
    const [category, setCategory] = useState<{ label: string; value: string } | null>(null);

    // Step 3: Terms & Dates state
    const [startDate, setStartDate] = useState<Dayjs | null>(null);
    const [endDate, setEndDate] = useState<Dayjs | null>(null);

    // Pre-select template when initialTemplate is provided
    useEffect(() => {
        if (initialTemplate && open) {
            const template = templateOptions.find(t => t.label === initialTemplate);
            if (template) {
                setSelectedTemplate(template);
            }
        }
    }, [initialTemplate, open]);

    const handleNext = () => {
        if (activeStep < steps.length - 1) {
            setActiveStep((prev) => prev + 1);
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
        setContractTitle('');
        setClientName('');
        setDescription('');
        setContractValue('');
        setCategory(null);
        setStartDate(null);
        setEndDate(null);
        onClose();
    };

    const isNextDisabled =
        (activeStep === 0 && !selectedTemplate) ||
        (activeStep === 1 && (!contractTitle || !clientName)) ||
        (activeStep === 2 && (!startDate || !endDate));

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
                disabled={isNextDisabled}
                endIcon={<ArrowForward />}
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
                {activeStep === steps.length - 1 ? 'Create Contract' : 'Next'}
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
                                        Choose a contract template
                                    </Typography>

                                    <Box>
                                        <Typography
                                            variant="subtitle2"
                                            fontWeight={600}
                                            sx={{ mb: 1.5, color: 'text.primary' }}
                                        >
                                            Select Template
                                        </Typography>
                                        <Autocomplete
                                            value={selectedTemplate}
                                            onChange={(event, newValue) => {
                                                setSelectedTemplate(newValue);
                                            }}
                                            options={templateOptions}
                                            disableClearable={false}
                                            renderInput={(params) => (
                                                <TextField
                                                    {...params}
                                                    placeholder="Choose a template"
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
                                            <Typography
                                                variant="subtitle2"
                                                fontWeight={600}
                                                sx={{ mb: 1.5, color: 'text.primary' }}
                                            >
                                                Contract Title <span style={{ color: '#d32f2f' }}>*</span>
                                            </Typography>
                                            <TextField
                                                fullWidth
                                                placeholder="e.g., Annual Software Maintenance Agreement"
                                                value={contractTitle}
                                                onChange={(e) => setContractTitle(e.target.value)}
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
                                            <Typography
                                                variant="subtitle2"
                                                fontWeight={600}
                                                sx={{ mb: 1.5, color: 'text.primary' }}
                                            >
                                                Description
                                            </Typography>
                                            <TextField
                                                fullWidth
                                                multiline
                                                rows={3}
                                                placeholder="Brief description of the contract..."
                                                value={description}
                                                onChange={(e) => setDescription(e.target.value)}
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
                                        Terms & Dates
                                    </Typography>
                                    <Typography
                                        variant="body2"
                                        color="text.secondary"
                                        sx={{ mb: 3 }}
                                    >
                                        Set contract period
                                    </Typography>

                                    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
                                        {/* Start Date and End Date */}
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
                                                                    p: 5,
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
                                                            },
                                                        },
                                                    }}
                                                />
                                            </Box>
                                        </Box>
                                    </Box>
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
                                                {selectedTemplate?.label || '-'}
                                            </Typography>
                                        </Box>
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

