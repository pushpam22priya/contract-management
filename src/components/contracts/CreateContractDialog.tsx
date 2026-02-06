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
import { blobToBase64, verifyPdfBase64 } from '@/utils/pdfUtils';

interface CreateContractDialogProps {
    open: boolean;
    onClose: () => void;
    initialTemplateName?: string;
}

const CreateContractDialog = ({ open, onClose, initialTemplateName }: CreateContractDialogProps) => {
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
    const [success, setSuccess] = useState(''); // Add success state

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

    const loadTemplates = async () => {
        setLoadingTemplates(true);
        try {
            const allTemplates = await templateService.getAllTemplates();
            setTemplates(allTemplates);

            // Pre-select template if name provided
            if (initialTemplateName) {
                const found = allTemplates.find(t => t.name === initialTemplateName);
                if (found) {
                    setSelectedTemplate(found);
                }
            }
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

            console.log('═══════════════════════════════════════════════════════════════════');
            console.log('🔍 [CreateContractDialog] Starting PDF export...');
            console.log('✅ [CreateContractDialog] Commit process will run in exportAnnotations');
            console.log('═══════════════════════════════════════════════════════════════════');
            console.log('📄 PDF Viewer Ref exists:', !!pdfViewerRef.current);
            console.log('📝 Field values to export:', filledFieldValues);

            // Export PDF Blob and XFDF from PDF viewer
            // ✅ IMPORTANT: exportAnnotations() will COMMIT all pending changes before exporting
            // This includes: deselecting annotations, switching tools, calling field.commit(),
            // refreshing viewer, and redrawing annotations
            // CRITICAL: exportAnnotations now returns { blob, xfdfString }
            // ✅ FIX: Do NOT pass filledFieldValues to exportAnnotations.
            // The values are already in the PDF (typed by user). Passing them causes redundant setValue calls which invalidate signatures.
            // ✅ FIX: Using flatten: false allows signatures to remain as interactive annotations.
            // This ensures they can be modified or deleted without leaving "ghost" images in the PDF background.
            // We rely on the XFDF (saved below) to restore the visual appearance of annotations on load.
            const exportResult = await pdfViewerRef.current?.exportAnnotations({}, { flatten: false });

            console.log('📋 PDF Export Result:');
            console.log('  - Export result exists:', !!exportResult);
            console.log('  - PDF Blob size:', exportResult?.blob?.size || 0, 'bytes');
            console.log('  - PDF Blob type:', exportResult?.blob?.type);
            console.log('  - XFDF length:', exportResult?.xfdfString?.length || 0, 'chars');

            if (!exportResult || !exportResult.blob) {
                console.error('❌ PDF export returned empty or null');
                setError('Failed to export PDF data. Please try again.');
                return;
            }

            const { blob: pdfBlob, xfdfString } = exportResult;

            // ✅ CRITICAL FIX: Store both template and contract XFDF
            // Template XFDF contains signatures from template creation
            // Contract XFDF contains new annotations from contract creation
            // We'll merge them on load to preserve both
            console.log('📋 [Contract Creation] XFDF Comparison:');
            console.log(`   Template XFDF: ${selectedTemplate?.xfdfData?.length || 0} chars`);
            console.log(`   Exported XFDF: ${xfdfString.length} chars`);

            // Use the exported XFDF (has new signature) but also store template XFDF for merging on load
            const finalXfdf = xfdfString;

            // CRITICAL: Also export formFields to capture ReadOnly and other flags
            // These are stored with the contract so flags persist when reopening
            let exportedFormFields = await pdfViewerRef.current?.exportFormFields();

            // ✅ CRITICAL FIX: Sync values from filledFieldValues into exportedFormFields
            // The exportFormFields() method might return initial/empty values if not fully synced
            if (exportedFormFields) {
                exportedFormFields = exportedFormFields.map(field => ({
                    ...field,
                    value: filledFieldValues[field.name] || field.value || ''
                }));
            }

            // Calculate dates if not provided
            const finalStartDate = startDate || dayjs().format('YYYY-MM-DD');
            const finalEndDate = endDate || dayjs().add(1, 'year').format('YYYY-MM-DD');
            const expiresInDays = dayjs(finalEndDate).diff(dayjs(), 'day');

            // Create contract metadata first
            console.log('📝 Creating contract metadata...');
            // Exclude signedPdfBase64 from initial creation to avoid JSON overhead/violation
            const contractData = {
                name: contractTitle,
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
                fieldValues: filledFieldValues,  // Save filled values
                startDate: finalStartDate,
                endDate: finalEndDate,
                createdBy: currentUser.email,
                templateDocxBase64: selectedTemplate.docxBase64,
                templateFileName: selectedTemplate.fileName,
                xfdfData: finalXfdf,         // ✅ Use finalXfdf (preserves template signatures)
                formFields: exportedFormFields, // Save field definitions
                hasFormFields: (exportedFormFields?.length ?? 0) > 0 || selectedTemplate.hasFormFields || false, // ✅ Use template flag or check fields
            };

            const result = await contractService.createContract(contractData);

            if (result.success && result.contract) {
                console.log('✅ Contract metadata created, ID:', result.contract.id);

                // Now upload the PDF binary
                if (pdfBlob) {
                    console.log(`📤 Uploading PDF binary (${pdfBlob.size} bytes)...`);
                    const uploadResult = await contractService.updateContractSignedPdf(
                        result.contract.id,
                        pdfBlob, // Pass Blob directly
                        finalXfdf // ✅ Use finalXfdf (preserves template signatures)
                    );

                    if (uploadResult.success) {
                        console.log('✅ PDF binary uploaded successfully');
                    } else {
                        console.error('❌ Failed to upload PDF binary');
                        setError('Contract created but PDF upload failed');
                        setSaving(false);
                        return;
                    }
                }

                console.log('Contract created successfully with PDF!');

                setSuccess('Contract created successfully!');
                setTimeout(() => {
                    handleClose();
                    router.push('/draft');
                }, 1500);
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
        <Box sx={{ display: 'flex', gap: 1.5, alignItems: 'center' }}>
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
                    {/* Success Alert */}
                    {success && (
                        <Alert severity="success" sx={{ mb: 2 }}>
                            {success}
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
                                    documentUrl={selectedTemplate.fileData || selectedTemplate.fileUrl}
                                    // ✅ CRITICAL: Load template XFDF to display form fields during contract creation
                                    // Template form fields are stored in XFDF and need to be imported
                                    initialXfdf={selectedTemplate?.xfdfData}
                                    formFields={selectedTemplate?.formFields}
                                    readOnly={false}
                                    currentUserRole="contractor"
                                    // ✅ NEW: Enable form field creation during contract creation ONLY
                                    canAddFormFields={true}
                                    toolbarMode="forms"
                                    defaultToolbar="view"
                                    // Callback when user fills any field
                                    // Explanation: Fires when user types/checks a field, stores value
                                    onFieldChange={handleFieldChange}
                                    onDocumentLoaded={() => setDocumentLoaded(true)}
                                    // ✅ Enable annotation navigation for contract creation
                                    showAnnotationNavigation={true}
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
