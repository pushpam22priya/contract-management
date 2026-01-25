'use client';

import { useState, useRef, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import {
    Box,
    Typography,
    Button,
    Autocomplete,
    TextField,
    Alert,
    Chip,
    alpha,
    Divider,
} from '@mui/material';
import { Save, Close, ArrowBack, ArrowForward } from '@mui/icons-material';
import BaseDialog from '@/components/common/BaseDialog';
import PDFViewerContainer, { PDFViewerHandle } from '@/components/viewer/PDFViewerContainer';
import { templateService } from '@/services/templateService';
import { contractService } from '@/services/contractService';
import { authService } from '@/services/authService';
import { Template } from '@/types/template';
import dayjs from 'dayjs';
import { ContractStatus } from '@/types/contract';

interface CreateContractDialogProps {
    open: boolean;
    onClose: () => void;
}

const CreateContractDialog = ({ open, onClose }: CreateContractDialogProps) => {
    const router = useRouter();
    const pdfViewerRef = useRef<PDFViewerHandle>(null);

    // Wizard State
    const [currentStep, setCurrentStep] = useState<1 | 2>(1);

    // State
    const [templates, setTemplates] = useState<Template[]>([]);
    const [selectedTemplate, setSelectedTemplate] = useState<Template | null>(null);
    const [loadingTemplates, setLoadingTemplates] = useState(false);
    const [documentLoaded, setDocumentLoaded] = useState(false);
    const [error, setError] = useState('');

    // Contract Information
    const [contractTitle, setContractTitle] = useState('');
    const [clientName, setClientName] = useState('');
    const [description, setDescription] = useState('');
    const [contractValue, setContractValue] = useState('');
    const [startDate, setStartDate] = useState('');
    const [endDate, setEndDate] = useState('');

    // Saving state
    const [saving, setSaving] = useState(false);

    // Track filled field values
    // Explanation: This stores the values user enters in form fields (e.g., {"client_name": "John Doe"})
    // These values are specific to THIS contract only - template remains unchanged
    const [filledFieldValues, setFilledFieldValues] = useState<Record<string, string>>({});

    // Load templates when dialog opens
    useEffect(() => {
        if (open) {
            loadTemplates();
        }
    }, [open]);

    const loadTemplates = () => {
        setLoadingTemplates(true);
        try {
            const allTemplates = templateService.getAllTemplates();
            setTemplates(allTemplates);
        } catch (err) {
            setError('Failed to load templates');
            console.error('Error loading templates:', err);
        } finally {
            setLoadingTemplates(false);
        }
    };

    // Handle form field changes
    // Explanation: When user types in a form field, this function captures the value
    // and stores it in filledFieldValues state so we can save it with the contract
    const handleFieldChange = (fieldName: string, value: any) => {
        console.log(`📝 Field changed: ${fieldName} = ${value}`);
        setFilledFieldValues(prev => ({
            ...prev,
            [fieldName]: value?.toString() || ''
        }));
    };

    const handleSave = async () => {
        if (!selectedTemplate) {
            setError('Please select a template');
            return;
        }

        if (!contractTitle.trim()) {
            setError('Contract title is required');
            return;
        }

        if (!clientName.trim()) {
            setError('Client name is required');
            return;
        }

        if (!documentLoaded) {
            setError('Please wait for the document to load');
            return;
        }

        setSaving(true);
        setError('');


        try {
            const currentUser = authService.getCurrentUser();
            if (!currentUser) {
                setError('You must be logged in to create a contract');
                return;
            }

            console.log('🔍 Starting XFDF export...');
            console.log('📄 PDF Viewer Ref exists:', !!pdfViewerRef.current);
            console.log('📝 Field values to export:', filledFieldValues);

            // Export XFDF data from PDF
            // CRITICAL: Pass filledFieldValues so PDFViewer can set them before export
            // Explanation: Per Apryse docs, we must use fieldManager.getField().setValue()
            // to properly set field values before export
            const xfdf = await pdfViewerRef.current?.exportAnnotations(filledFieldValues);

            console.log('📋 XFDF Export Result:');
            console.log('  - XFDF exists:', !!xfdf);
            console.log('  - XFDF length:', xfdf?.length || 0);
            console.log('  - XFDF preview:', xfdf?.substring(0, 200));

            if (!xfdf) {
                console.error('❌ XFDF export returned empty or null');
                setError('Failed to export PDF data. Please try again.');
                return;
            }

            if (xfdf.length < 50) {
                console.warn('⚠️ XFDF seems too short - might be empty annotations');
                console.log('Full XFDF:', xfdf);
            }

            // CRITICAL: Also export formFields to capture ReadOnly and other flags
            // These are stored with the contract so flags persist when reopening
            const exportedFormFields = await pdfViewerRef.current?.exportFormFields();
            console.log('📋 FormFields Export Result:');
            console.log('  - Fields exported:', exportedFormFields?.length || 0);
            if (exportedFormFields && exportedFormFields.length > 0) {
                console.log('  - ReadOnly flags:', exportedFormFields.filter((f: any) => f.readOnly).map((f: any) => f.name));
            }

            // Calculate dates if not provided
            const finalStartDate = startDate || dayjs().format('YYYY-MM-DD');
            const finalEndDate = endDate || dayjs().add(1, 'year').format('YYYY-MM-DD');
            const expiresInDays = dayjs(finalEndDate).diff(dayjs(), 'day');

            console.log('💾 Creating contract with XFDF data...');

            // Create contract with XFDF data AND formFields (with ReadOnly flags)
            const result = await contractService.createContract({
                title: contractTitle,
                client: clientName,
                description: description || `Contract based on ${selectedTemplate.name}`,
                value: contractValue || 'N/A',
                category: selectedTemplate.category,
                expiresInDays: expiresInDays,
                status: ContractStatus.DRAFT,
                templateId: selectedTemplate.id,
                templateName: selectedTemplate.name,
                content: selectedTemplate.content || '',
                fieldValues: filledFieldValues,  // Save filled values (e.g., {"client_name": "ABC Corp"})
                startDate: finalStartDate,
                endDate: finalEndDate,
                createdBy: currentUser.email,
                templateDocxBase64: selectedTemplate.docxBase64,
                templateFileName: selectedTemplate.fileName,
                xfdfString: xfdf,
                formFields: exportedFormFields, // Save field definitions with ReadOnly flags
            });

            console.log('Contract creation result:', result);

            if (result.success) {
                console.log('Contract created successfully with XFDF!');
                console.log('Contract ID:', result.contract?.id);
                console.log('XFDF stored length:', result.contract?.xfdfString?.length);
                console.log('Waiting 2 seconds before navigation so you can see logs...');

                // Wait 2 seconds so logs are visible before navigation
                await new Promise(resolve => setTimeout(resolve, 2000));

                handleClose();
                router.push('/draft');
            } else {
                console.error('❌ Contract creation failed:', result.message);
                setError(result.message);
            }
        } catch (err) {
            console.error('❌ Error creating contract:', err);
            setError('Failed to create contract. Please try again.');
        } finally {
            setSaving(false);
        }
    };

    const handleClose = () => {
        // Reset all state
        setCurrentStep(1); // Reset to Step 1
        setSelectedTemplate(null);
        setContractTitle('');
        setClientName('');
        setDescription('');
        setContractValue('');
        setStartDate('');
        setEndDate('');
        setDocumentLoaded(false);
        setError('');
        setFilledFieldValues({}); // Reset for next contract

        // Dispose PDF viewer
        pdfViewerRef.current?.dispose();

        onClose();
    };

    const handleNextStep = () => {
        // Validation before proceeding to Step 2
        if (!selectedTemplate) {
            setError('Please select a template');
            return;
        }
        if (!contractTitle.trim()) {
            setError('Contract title is required');
            return;
        }
        if (!clientName.trim()) {
            setError('Client name is required');
            return;
        }

        setError('');
        setCurrentStep(2);
    };

    const canSave = selectedTemplate && contractTitle.trim() && clientName.trim() && documentLoaded;

    // Step 1: Contract Details Actions
    const step1Actions = (
        <>
            <Button
                onClick={handleNextStep}
                endIcon={<ArrowForward />}
                variant="contained"
                disabled={!selectedTemplate || !contractTitle.trim() || !clientName.trim()}
                sx={{
                    textTransform: 'none',
                    fontWeight: 600,
                    borderRadius: 2,
                    bgcolor: 'primary.main',
                    boxShadow: '0 2px 8px rgba(15, 118, 110, 0.25)',
                    '&:hover': {
                        bgcolor: 'primary.dark',
                        boxShadow: '0 4px 12px rgba(15, 118, 110, 0.35)',
                    },
                }}
            >
                Next: Edit Document
            </Button>
        </>
    );

    // Step 2: PDF Editing Actions
    const step2Actions = (
        <>
            <Button
                onClick={() => setCurrentStep(1)}
                startIcon={<ArrowBack />}
                variant="outlined"
                sx={{
                    textTransform: 'none',
                    fontWeight: 600,
                    borderRadius: 2,
                }}
            >
                Back to Details
            </Button>

            <Box sx={{ display: 'flex', gap: 1.5, alignItems: 'center' }}>
                {/* {documentLoaded && (
                    <Chip
                        label="✓ Document Ready"
                        color="success"
                        size="small"
                        sx={{ fontWeight: 600 }}
                    />
                )} */}
                <Button
                    onClick={handleSave}
                    startIcon={<Save />}
                    variant="contained"
                    disabled={!canSave || saving}
                    sx={{
                        textTransform: 'none',
                        fontWeight: 600,
                        // px: 3,
                        borderRadius: 2,
                        minWidth: 150,
                        bgcolor: 'primary.main',
                        boxShadow: '0 2px 8px rgba(15, 118, 110, 0.25)',
                        '&:hover': {
                            bgcolor: 'primary.dark',
                            boxShadow: '0 4px 12px rgba(15, 118, 110, 0.35)',
                        },
                    }}
                >
                    {saving ? 'Saving...' : 'Save Contract'}
                </Button>
            </Box>
        </>
    );

    // Conditional dialog actions based on current step
    const dialogActions = currentStep === 1 ? step1Actions : step2Actions;

    return (
        <BaseDialog
            open={open}
            onClose={handleClose}
            title={currentStep === 1 ? "Create Contract - Step 1: Contract Details" : `Create Contract - Step 2: Edit Document`}
            maxWidth={currentStep === 1 ? "md" : "xl"} // Compact for Step 1, Full-width for Step 2
            fullWidth
            customHeight={currentStep === 1 ? undefined : "98vh"} // Auto height for Step 1, Full height for Step 2
            actions={dialogActions}
            disableEnforceFocus={true} // Allow PDFTron text fields to work properly
            disableBackdropClick={false} // Allow closing on backdrop click
        >
            {/* STEP 1: Contract Details Form */}
            {currentStep === 1 && (
                <Box sx={{ display: 'flex', flexDirection: 'column' }}>
                    {/* Error Alert */}
                    {error && (
                        <Alert severity="error" sx={{ mb: 2 }} onClose={() => setError('')}>
                            {error}
                        </Alert>
                    )}

                    <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: '1fr 1fr' }, gap: 2 }}>
                        {/* Template Selection */}
                        <Autocomplete
                            value={selectedTemplate}
                            onChange={(_event, newValue) => {
                                setSelectedTemplate(newValue);
                                setDocumentLoaded(false);
                            }}
                            options={templates}
                            getOptionLabel={(option) => option.name}
                            loading={loadingTemplates}
                            renderInput={(params) => (
                                <TextField
                                    {...params}
                                    label="Select Template"
                                    placeholder="Choose a template..."
                                    required
                                    sx={{
                                        '& .MuiOutlinedInput-root': {
                                            padding: '4px',
                                        },

                                    }}
                                />
                            )}
                            renderOption={(props, option) => {
                                const { key, ...otherProps } = props as any;
                                return (
                                    <li key={key} {...otherProps}>
                                        <Box>
                                            <Typography variant="body2" fontWeight={600}>{option.name}</Typography>
                                            <Typography variant="caption" color="text.secondary">
                                                {option.category}
                                            </Typography>
                                        </Box>
                                    </li>
                                );
                            }}
                        />

                        {/* Selected Template Info */}
                        {selectedTemplate && (
                            <Box
                                sx={{
                                    p: 0.5,
                                    px: 1,
                                    bgcolor: alpha('#0f766e', 0.05),
                                    borderRadius: 2,
                                    border: '1px solid',
                                    borderColor: alpha('#0f766e', 0.2),
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'space-between',
                                }}
                            >
                                <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 1 }}>
                                    <Typography variant="body1" fontWeight={600} color="primary">
                                        {selectedTemplate.name}
                                    </Typography>
                                    <Chip
                                        label={selectedTemplate.category}
                                        size="small"
                                        sx={{
                                            bgcolor: 'primary.main',
                                            color: 'white',
                                        }}
                                    />
                                </Box>
                            </Box>
                        )}
                    </Box>

                    <Divider sx={{ my: 1 }} />

                    <Typography variant="h6" gutterBottom>Contract Information</Typography>

                    <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: 'repeat(2, 1fr)' }, gap: 2, mb: 2 }}>
                        <TextField
                            label="Contract Title"
                            value={contractTitle}
                            onChange={(e) => setContractTitle(e.target.value)}
                            required
                            placeholder="e.g., Software License Agreement"
                            sx={{
                                '& .MuiInputBase-input': {
                                    padding: '10px 12px',
                                },
                                // Adjust floating label position when focused/filled
                                '& .MuiInputLabel-root': {
                                    transform: 'translate(14px, 10px) scale(1)',
                                },
                                // Adjust floating label when shrunk (focused or has value)
                                '& .MuiInputLabel-root.MuiInputLabel-shrink': {
                                    transform: 'translate(14px, -9px) scale(0.75)',
                                },
                            }}

                        />
                        <TextField
                            label="Client Name"
                            value={clientName}
                            onChange={(e) => setClientName(e.target.value)}
                            required
                            placeholder="e.g., ABC Corp"
                            sx={{
                                '& .MuiInputBase-input': {
                                    padding: '10px 12px',
                                },
                                // Adjust floating label position when focused/filled
                                '& .MuiInputLabel-root': {
                                    transform: 'translate(14px, 10px) scale(1)',
                                },
                                // Adjust floating label when shrunk (focused or has value)
                                '& .MuiInputLabel-root.MuiInputLabel-shrink': {
                                    transform: 'translate(14px, -9px) scale(0.75)',
                                },
                            }}

                        />
                    </Box>

                    <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: 'repeat(2, 1fr)' }, gap: 2 }}>
                        <TextField
                            label="Start Date"
                            type="date"
                            value={startDate}
                            onChange={(e) => {
                                const newStartDate = e.target.value;
                                setStartDate(newStartDate);
                                if (newStartDate) {
                                    // Auto-set End Date to 1 year from Start Date
                                    setEndDate(dayjs(newStartDate).add(1, 'year').format('YYYY-MM-DD'));
                                }
                            }}
                            InputLabelProps={{ shrink: true }}
                            sx={{
                                '& .MuiInputBase-input': {
                                    padding: '10px 12px',
                                }
                            }}
                        />
                        <TextField
                            label="End Date"
                            type="date"
                            value={endDate}
                            onChange={(e) => setEndDate(e.target.value)}
                            InputLabelProps={{ shrink: true }}
                            sx={{
                                '& .MuiInputBase-input': {
                                    padding: '10px 12px',
                                }
                            }}
                        />
                    </Box>

                    <TextField
                        label="Description"
                        value={description}
                        onChange={(e) => setDescription(e.target.value)}
                        multiline
                        rows={3}
                        placeholder="Optional description..."
                        sx={{ mt: 2 }}
                    />
                </Box>
            )}

            {/* STEP 2: Full-Screen PDF Editor */}
            {currentStep === 2 && (
                <Box sx={{ display: 'flex', flexDirection: 'column', height: 'calc(98vh - 150px)' }}>
                    {/* Minimal Header with Contract Info */}
                    {/* <Box sx={{
                        px: 2,
                        py: 1.5,
                        borderBottom: '1px solid',
                        borderColor: 'divider',
                        bgcolor: alpha('#0f766e', 0.02),
                    }}>
                        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                            <Box>
                                <Typography variant="h6" fontWeight={600}>{contractTitle}</Typography>
                                <Typography variant="body2" color="text.secondary">
                                    Template: {selectedTemplate?.name} • Client: {clientName}
                                </Typography>
                            </Box>
                        </Box>
                    </Box> */}

                    {/* Error Alert */}
                    {error && (
                        <Alert severity="error" sx={{ mx: 2, mt: 2 }} onClose={() => setError('')}>
                            {error}
                        </Alert>
                    )}

                    {/* Full-Height PDF Viewer */}
                    <Box sx={{ flex: 1, p: 0.5, overflow: 'hidden' }}>
                        {selectedTemplate ? (
                            <Box sx={{
                                height: '100%',
                                border: '1px solid',
                                borderColor: 'divider',
                                borderRadius: 2,
                                overflow: 'hidden'
                            }}>
                                <PDFViewerContainer
                                    ref={pdfViewerRef}
                                    documentUrl={selectedTemplate.fileUrl}
                                    // Pass form fields from template so PDF can recreate them
                                    // Explanation: selectedTemplate.formFields contains field definitions
                                    // created when template was uploaded. PDFViewer recreates these fields.
                                    formFields={selectedTemplate?.formFields}
                                    readOnly={false}
                                    currentUserRole="contractor"
                                    // Callback when user fills any field  
                                    // Explanation: Fires when user types/checks a field, stores value
                                    onFieldChange={handleFieldChange}
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
                                <Box sx={{ textAlign: 'center', maxWidth: 400 }}>
                                    <Typography variant="h6" color="text.secondary" gutterBottom>
                                        No Template Selected
                                    </Typography>
                                    <Typography variant="body2" color="text.secondary">
                                        Select a template from the dropdown above to start editing
                                    </Typography>
                                </Box>
                            </Box>
                        )}
                    </Box>
                </Box>
            )}
        </BaseDialog>
    );
};

export default CreateContractDialog;
