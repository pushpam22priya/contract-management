'use client';

import { useState, useRef, useEffect, useMemo } from 'react';
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
    AlertColor,
    Tooltip,
} from '@mui/material';
import { Save, ArrowBack, ArrowForward } from '@mui/icons-material';
import BaseDialog from '@/components/common/BaseDialog';
import ConfirmationDialog from '@/components/common/ConfirmationDialog';
import NotificationSnackbar from '@/components/common/NotificationSnackbar';
import RequestReviewDialog from '@/components/contracts/RequestReviewDialog';
import SubmitForSignatureDialog from '@/components/contracts/SubmitForSignatureDialog';
import MultiPartySignatureDialog from '@/components/contracts/MultiPartySignatureDialog';
import PDFViewerContainer, { PDFViewerHandle } from '@/components/viewer/PDFViewerContainer';
import PartyValidationWarningPopup from '@/components/viewer/pdfViewer/PartyValidationWarningPopup';
import WrongPartyWarningDialog from '@/components/viewer/pdfViewer/WrongPartyWarningDialog';
import { submitForMixedSignature } from '@/services/externalSignatureService';
import { templateService } from '@/services/templateService';
import { contractService } from '@/services/contractService';
import { apiService } from '@/services/apiService';
import { authService } from '@/services/authService';
import { Template, PartyConfiguration } from '@/types/template';
import { validatePartyFields } from '@/utils/partyValidation';
import dayjs from 'dayjs';
import { ContractStatus } from '@/types/contract';
import { blobToBase64, verifyPdfBase64 } from '@/utils/pdfUtils';

interface CreateContractDialogProps {
    open: boolean;
    onClose: () => void;
    onSuccess?: () => void;
    initialTemplateName?: string;
}

const CreateContractDialog = ({ open, onClose, onSuccess, initialTemplateName }: CreateContractDialogProps) => {
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
    // ✅ Track if validation has been triggered (by clicking save)
    const [validationTriggered, setValidationTriggered] = useState(false);

    // Snackbar state
    const [snackbar, setSnackbar] = useState<{ open: boolean; message: string; severity: AlertColor }>({
        open: false,
        message: '',
        severity: 'success',
    });

    // Track contract ID after first save (prevents duplicate contracts on re-save)
    const [contractId, setContractId] = useState<string | null>(null);

    // Unsaved changes confirmation dialog state
    const [showUnsavedDialog, setShowUnsavedDialog] = useState(false);
    // Track which action triggered the unsaved changes dialog
    const [pendingAction, setPendingAction] = useState<'close' | 'review' | 'signature' | null>(null);
    // Dialog states for Review & Signature
    const [reviewDialogOpen, setReviewDialogOpen] = useState(false);
    const [signatureDialogOpen, setSignatureDialogOpen] = useState(false);
    const [multiPartyDialogOpen, setMultiPartyDialogOpen] = useState(false);

    // Track filled field values
    // Explanation: This stores the values user enters in form fields (e.g., {"client_name": "John Doe"})
    // These values are specific to THIS contract only - template remains unchanged
    const [filledFieldValues, setFilledFieldValues] = useState<Record<string, string>>({});

    // ✅ Contractor party restriction: contractor may only fill ONE party's fields
    const [showWrongPartyWarning, setShowWrongPartyWarning] = useState(false);

    // The party the contractor has committed to (first party where they filled any field)
    const contractorPartyId = useMemo(() => {
        if (!selectedTemplate?.formFields) return null;
        for (const field of selectedTemplate.formFields) {
            if (field.assignedParty && filledFieldValues[field.name]?.trim()) {
                return field.assignedParty as string;
            }
        }
        return null;
    }, [filledFieldValues, selectedTemplate?.formFields]);

    // Refs so handleFieldChange (called via viewer ref) always sees the latest values
    const contractorPartyIdRef = useRef<string | null>(null);
    const filledFieldValuesRef = useRef<Record<string, string>>({});
    useEffect(() => { contractorPartyIdRef.current = contractorPartyId; }, [contractorPartyId]);
    useEffect(() => { filledFieldValuesRef.current = filledFieldValues; }, [filledFieldValues]);


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

        // ✅ Restrict contractor to filling only ONE party's fields
        const field = (selectedTemplate?.formFields || []).find((f: any) => f.name === fieldName);
        if (field?.assignedParty && contractorPartyIdRef.current && field.assignedParty !== contractorPartyIdRef.current) {
            setShowWrongPartyWarning(true);
            // Revert the field to its previous value
            const prevValue = filledFieldValuesRef.current[fieldName] || '';
            if (prevValue) {
                pdfViewerRef.current?.restoreFieldValue(fieldName, prevValue);
            } else {
                pdfViewerRef.current?.clearField(fieldName);
            }
            return;
        }

        setFilledFieldValues(prev => ({
            ...prev,
            [fieldName]: value?.toString() || ''
        }));
    };

    // Party validation: detect partially filled parties
    // If the user has started filling fields for a party, ALL fields for that party must be completed
    const partyValidationWarning = useMemo(() => {
        if (!selectedTemplate?.formFields || !selectedTemplate?.parties) return null;

        const formFields = selectedTemplate.formFields;
        const parties = selectedTemplate.parties;

        const partialParties: { party: PartyConfiguration; filled: number; total: number; missing: string[] }[] = [];

        for (const party of parties) {
            const result = validatePartyFields(party.id, formFields, filledFieldValues);
            // Check if user started filling but didn't complete ALL fields for this party
            // We check filledCount vs totalCount (not just required fields) because
            // the rule is: once you touch any field of a party, you must fill them all
            if (result.filledCount > 0 && result.filledCount < result.totalCount) {
                // Find names of unfilled fields (regardless of required flag)
                const partyFields = formFields.filter(f => f.assignedParty === party.id);
                const unfilledFields = partyFields
                    .filter(f => {
                        const val = filledFieldValues[f.name];
                        return !val || val.toString().trim() === '';
                    })
                    .map(f => f.name);

                partialParties.push({
                    party,
                    filled: result.filledCount,
                    total: result.totalCount,
                    missing: unfilledFields,
                });
            }
        }

        return partialParties.length > 0 ? partialParties : null;
    }, [filledFieldValues, selectedTemplate]);

    const hasPartialParty = !!partyValidationWarning;

    const handleSave = async (): Promise<string | null> => {
        // ✅ Check for party validation before proceeding
        if (hasPartialParty) {
            console.warn('📋 [SAVE BLOCKED] Partial party fields detected');
            setValidationTriggered(true);
            return null;
        }

        if (!selectedTemplate) {
            setError('Please select a template');
            return null;
        }

        if (!contractTitle.trim()) {
            setError('Contract title is required');
            return null;
        }

        if (!clientName.trim()) {
            setError('Client name is required');
            return null;
        }

        if (!documentLoaded) {
            setError('Please wait for the document to load');
            return null;
        }

        setSaving(true);
        setError('');

        try {
            const currentUser = authService.getCurrentUser();
            if (!currentUser) {
                setError('You must be logged in to create a contract');
                return null;
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
                return null;
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
            // AND preserve party assignments from template.formFields
            // The exportFormFields() method might return initial/empty values if not fully synced
            // and doesn't include party assignment info - that's only in the template
            if (exportedFormFields) {
                const templateFieldsMap = new Map(
                    (selectedTemplate.formFields || []).map((f: any) => [f.name, f])
                );
                exportedFormFields = exportedFormFields.map(field => {
                    const templateField = templateFieldsMap.get(field.name);
                    return {
                        ...field,
                        value: filledFieldValues[field.name] || field.value || '',
                        // ✅ Preserve party assignment from template
                        assignedParty: templateField?.assignedParty || field.assignedParty,
                        partyLabel: templateField?.partyLabel || field.partyLabel,
                        partyColor: templateField?.partyColor || field.partyColor,
                    };
                });
                console.log('📝 [Contract Creation] Form fields with party assignments:',
                    exportedFormFields.map(f => ({ name: f.name, assignedParty: f.assignedParty }))
                );
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
                parties: selectedTemplate.parties,  // ✅ Include parties for external signer validation
            };

            let activeContractId = contractId;

            if (contractId) {
                // Subsequent save: UPDATE existing contract
                console.log('📝 Updating existing contract, ID:', contractId);
                const updateResult = await apiService.updateContractMetadata(contractId, contractData);
                if (!updateResult.success) {
                    setError(updateResult.message || 'Failed to update contract');
                    return null;
                }
                console.log('✅ Contract metadata updated');
            } else {
                // First save: CREATE new contract
                const result = await contractService.createContract(contractData);
                if (result.success && result.contract) {
                    activeContractId = result.contract.id;
                    setContractId(activeContractId);
                    console.log('✅ Contract created, ID:', activeContractId);
                } else {
                    console.error('❌ Contract creation failed:', result.message);
                    setError(result.message);
                    return null;
                }
            }

            // Upload/overwrite the PDF binary
            if (pdfBlob && activeContractId) {
                console.log(`📤 Uploading PDF binary (${pdfBlob.size} bytes)...`);
                const uploadResult = await contractService.updateContractSignedPdf(
                    activeContractId,
                    pdfBlob,
                    finalXfdf
                );

                if (uploadResult.success) {
                    console.log('✅ PDF binary uploaded successfully');
                } else {
                    console.error('❌ Failed to upload PDF binary');
                    setError('Contract saved but PDF upload failed');
                    setSaving(false);
                    return null;
                }
            }

            console.log('Contract saved successfully with PDF!');

            setSnackbar({ open: true, message: 'Contract Saved successfully!', severity: 'success' });
            return activeContractId;
        } catch (err) {
            console.error('❌ Error creating contract:', err);
            setError('Failed to create contract. Please try again.');
            return null;
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
        setContractId(null); // Reset so next dialog creates a new contract
        setFilledFieldValues({}); // Reset for next contract
        setValidationTriggered(false);

        // Dispose PDF viewer
        pdfViewerRef.current?.dispose();

        onClose();
    };

    const hasUnsavedChanges = (): boolean => {
        return (
            contractTitle !== '' ||
            clientName !== '' ||
            description !== '' ||
            contractValue !== '' ||
            startDate !== '' ||
            endDate !== '' ||
            Object.keys(filledFieldValues).length > 0 ||
            documentLoaded
        );
    };

    const handleCloseAttempt = () => {
        if (currentStep === 2 && hasUnsavedChanges()) {
            setPendingAction('close');
            setShowUnsavedDialog(true);
        } else {
            handleClose();
        }
    };

    const handleReviewClick = () => {
        if (hasUnsavedChanges() || !contractId) {
            setPendingAction('review');
            setShowUnsavedDialog(true);
        } else {
            setReviewDialogOpen(true);
        }
    };

    const handleSignatureClick = () => {
        if (hasUnsavedChanges() || !contractId) {
            setPendingAction('signature');
            setShowUnsavedDialog(true);
        } else if (contractId) {
            // Check if contract has multiple parties with fields (same logic as ContractsPage)
            const partiesWithFields = (selectedTemplate?.parties || []).filter((party: any) => {
                return (selectedTemplate?.formFields || []).some((field: any) => field.assignedParty === party.id);
            });

            console.log(`📋 [CreateContractDialog] Signature click, parties with fields: ${partiesWithFields.length}`);

            if (partiesWithFields.length > 1) {
                setMultiPartyDialogOpen(true);
            } else {
                setSignatureDialogOpen(true);
            }
        }
    };

    const handleUnsavedYes = async () => {
        setShowUnsavedDialog(false);
        const savedId = await handleSave();
        if (!savedId) return; // Save failed

        if (pendingAction === 'close') {
            handleClose();
            router.push('/draft');
        } else if (pendingAction === 'review') {
            setReviewDialogOpen(true);
        } else if (pendingAction === 'signature') {
            // Check parties with fields to decide which dialog to open
            const partiesWithFields = (selectedTemplate?.parties || []).filter((party: any) => {
                return (selectedTemplate?.formFields || []).some((field: any) => field.assignedParty === party.id);
            });

            if (partiesWithFields.length > 1) {
                setMultiPartyDialogOpen(true);
            } else {
                setSignatureDialogOpen(true);
            }
        }
        setPendingAction(null);
    };

    const handleUnsavedNo = () => {
        setShowUnsavedDialog(false);
        if (pendingAction === 'close') {
            handleClose();
        }
        setPendingAction(null);
    };

    const handleUnsavedClose = () => {
        setShowUnsavedDialog(false);
        setPendingAction(null);
    };

    /**
     * Handle mixed signature submission (internal + external signers with order)
     */
    const handleMixedSignatureSubmit = async (assignments: any[]) => {
        if (!contractId) return { success: false, error: 'Contract not saved' };

        const currentUser = authService.getCurrentUser();
        const senderName = currentUser?.email || 'Contract System';

        try {
            // Re-fetch or reconstruct contract object for externalSignatureService
            const contractMock = {
                id: contractId,
                title: contractTitle,
                client: clientName,
                parties: selectedTemplate?.parties,
                formFields: selectedTemplate?.formFields,
                fieldValues: filledFieldValues
            } as any;

            const result = await submitForMixedSignature(
                contractMock,
                assignments,
                senderName
            );

            if (result.success) {
                setSnackbar({ open: true, message: 'Mixed signature assignments created successfully', severity: 'success' });
                setMultiPartyDialogOpen(false);
                // After submitting for signature, close dialog and redirect
                setTimeout(() => {
                    handleClose();
                    onSuccess?.(); // Trigger refresh if provided
                    router.push('/contracts');
                }, 1500);
                return { success: true };
            } else {
                setError(result.error || 'Failed to create assignments');
                return { success: false, error: result.error };
            }
        } catch (error: any) {
            console.error('❌ Mixed signature error:', error);
            setError(error.message || 'An unexpected error occurred');
            return { success: false, error: error.message };
        }
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

    const canSave = selectedTemplate && contractTitle.trim() && clientName.trim() && documentLoaded && (!validationTriggered || !hasPartialParty);

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
                // variant="outlined"
                sx={{
                    padding: '4px 10px',
                    borderRadius: 2,
                }}
            >
                Back to Details
            </Button>

            <Tooltip title={hasPartialParty ? 'Complete all fields for the party you started' : ''} arrow>
                <span>
                    <Button
                        onClick={handleSave}
                        variant="contained"
                        disabled={!canSave || saving}
                        sx={{
                            px: 2,
                            py: 0.5,
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
                </span>
            </Tooltip>

            <Button
                variant="contained"
                onClick={handleReviewClick}
                disabled={saving || !canSave}
                sx={{
                    textTransform: 'none',
                    fontWeight: 600,
                    px: 2,
                    py: 0.5,
                    borderRadius: 2,
                    minWidth: 150,
                    bgcolor: '#2e7d32',
                    boxShadow: '0 2px 8px rgba(46, 125, 50, 0.25)',
                    '&:hover': {
                        bgcolor: '#1b5e20',
                        boxShadow: '0 4px 12px rgba(46, 125, 50, 0.35)',
                    },
                }}
            >
                Review & Approve
            </Button>
            <Button
                variant="contained"
                onClick={handleSignatureClick}
                disabled={saving || !canSave}
                sx={{
                    textTransform: 'none',
                    fontWeight: 600,
                    px: 2,
                    py: 0.5,
                    borderRadius: 2,
                    minWidth: 150,
                    bgcolor: '#1565c0',
                    boxShadow: '0 2px 8px rgba(21, 101, 192, 0.25)',
                    '&:hover': {
                        bgcolor: '#0d47a1',
                        boxShadow: '0 4px 12px rgba(21, 101, 192, 0.35)',
                    },
                }}
            >
                Signature
            </Button>
        </Box>
    );

    // Conditional dialog actions based on current step
    const dialogActions = currentStep === 1 ? step1Actions : step2Actions;

    return (
        <>
            <BaseDialog
                open={open}
                onClose={handleCloseAttempt}
                title={currentStep === 1 ? "Create Contract - Step 1: Contract Details" : `Create Contract - Step 2: Edit Document`}
                maxWidth={currentStep === 1 ? "md" : "xl"}
                fullWidth
                fullScreen={currentStep === 2}
                noPadding={currentStep === 2}
                actions={dialogActions}
                disableEnforceFocus={true}
                disableBackdropClick={false}
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
                                inputProps={{ maxLength: 50 }}
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
                                inputProps={{ maxLength: 50 }}
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
                    <Box sx={{ display: 'flex', flexDirection: 'column', flex: 1, overflow: 'hidden' }}>
                        {/* Error Alert */}
                        {error && (
                            <Alert severity="error" sx={{ mb: 1 }} onClose={() => setError('')}>
                                {error}
                            </Alert>
                        )}

                        {/* Full-Screen PDF Viewer */}
                        {selectedTemplate ? (
                            <Box sx={{ flex: 1, overflow: 'hidden', position: 'relative' }}>
                                <PDFViewerContainer
                                    ref={pdfViewerRef}
                                    documentUrl={selectedTemplate.fileData || selectedTemplate.fileUrl}
                                    initialXfdf={selectedTemplate?.xfdfData}
                                    formFields={selectedTemplate?.formFields}
                                    readOnly={false}
                                    currentUserRole="contractor"
                                    canAddFormFields={false}
                                    toolbarMode="forms"
                                    defaultToolbar="view"
                                    onFieldChange={handleFieldChange}
                                    onDocumentLoaded={() => setDocumentLoaded(true)}
                                    showAnnotationNavigation={true}
                                    onError={(err) => setError(err)}
                                />

                                <PartyValidationWarningPopup
                                    partyValidationWarning={validationTriggered ? partyValidationWarning : null}
                                    onNavigateToField={(name) => pdfViewerRef.current?.navigateToField(name)}
                                />

                                {/* ✅ Warn contractor when they try to fill a second party's fields */}
                                <WrongPartyWarningDialog
                                    open={showWrongPartyWarning}
                                    title="Single Party Restriction"
                                    description={
                                        contractorPartyId
                                            ? <>You have already started filling <strong>{selectedTemplate?.parties?.find((p: PartyConfiguration) => p.id === contractorPartyId)?.label || contractorPartyId}</strong> fields. You can only fill one party&apos;s fields.</>
                                            : <>You can only fill one party&apos;s fields.</>
                                    }
                                    pdfViewerRef={pdfViewerRef}
                                    navigateConfig={contractorPartyId ? { type: 'party', partyIds: [contractorPartyId] } : { type: 'party', partyIds: [] }}
                                    onClose={() => setShowWrongPartyWarning(false)}
                                    zIndex={1400}
                                />
                            </Box>
                        ) : (
                            <Box
                                sx={{
                                    flex: 1,
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    bgcolor: 'grey.50'
                                }}
                            >
                                <Typography variant="h6" color="text.secondary">
                                    No Template Selected
                                </Typography>
                            </Box>
                        )}
                    </Box>
                )}
            </BaseDialog>

            {/* Unsaved Changes Confirmation Dialog */}
            <ConfirmationDialog
                open={showUnsavedDialog}
                title="Unsaved Changes"
                message="Do you want to save changes?"
                onYes={handleUnsavedYes}
                onNo={handleUnsavedNo}
                onClose={handleUnsavedClose}
                loading={saving}
                disableYes={!canSave}
                yesTooltip={hasPartialParty ? 'Complete all fields for the party you started' : ''}
            />

            {/* Request Review Dialog */}
            {contractId && (
                <RequestReviewDialog
                    open={reviewDialogOpen}
                    onClose={() => setReviewDialogOpen(false)}
                    contractId={contractId}
                    contractTitle={contractTitle}
                    onSubmit={async (reviewers, approver, reviewerMessage, approverMessage) => {
                        const currentUser = authService.getCurrentUser();
                        const result = await contractService.submitForReview(
                            contractId,
                            reviewers,
                            approver,
                            reviewerMessage,
                            approverMessage,
                            currentUser?.email
                        );
                        if (result.success) {
                            setSnackbar({ open: true, message: result.message, severity: 'success' });
                            setReviewDialogOpen(false);
                            // After submitting for review, we should close the create dialog 
                            // as the contract is no longer in "Edit/Draft" mode
                            setTimeout(() => {
                                handleClose();
                                onSuccess?.(); // Trigger refresh if provided
                                router.push('/draft');
                            }, 1500);
                        } else {
                            setSnackbar({ open: true, message: result.message, severity: 'error' });
                        }
                    }}
                />
            )}

            {/* Submit for Signature Dialog (Legacy/Single) */}
            {contractId && (
                <SubmitForSignatureDialog
                    open={signatureDialogOpen}
                    onClose={() => setSignatureDialogOpen(false)}
                    contractTitle={contractTitle}
                    onSubmit={async (signerEmail) => {
                        const currentUser = authService.getCurrentUser();
                        const result = await contractService.submitForSignature(
                            contractId,
                            signerEmail,
                            currentUser?.email
                        );
                        if (result.success) {
                            setSnackbar({ open: true, message: result.message, severity: 'success' });
                            setSignatureDialogOpen(false);
                            // After submitting for signature, close dialog and redirect
                            setTimeout(() => {
                                handleClose();
                                onSuccess?.(); // Trigger refresh if provided
                                router.push('/contracts');
                            }, 1500);
                        }
                        return result;
                    }}
                />
            )}

            {/* Multi-Party Signature Dialog */}
            {contractId && selectedTemplate && (
                <MultiPartySignatureDialog
                    open={multiPartyDialogOpen}
                    onClose={() => setMultiPartyDialogOpen(false)}
                    onSubmit={handleMixedSignatureSubmit}
                    contractTitle={contractTitle}
                    parties={selectedTemplate.parties || []}
                    formFields={selectedTemplate.formFields}
                    fieldValues={filledFieldValues}
                />
            )}

            {/* Notification Snackbar */}
            <NotificationSnackbar
                open={snackbar.open}
                message={snackbar.message}
                severity={snackbar.severity}
                onClose={() => setSnackbar({ ...snackbar, open: false })}
                autoHideDuration={3000}
            />
        </>
    );
};

export default CreateContractDialog;
