'use client';

import { useState, useRef, useEffect } from 'react';
import { useForm, Controller } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { contractStep1Schema, ContractStep1Form } from '@/schemas/contractSchema';
import {
    Box,
    Typography,
    Autocomplete,
    TextField,
    Alert,
    Chip,
    alpha,
    Divider,
    AlertColor,
    useTheme,
} from '@mui/material';
import { ArrowBack, ArrowForward } from '@mui/icons-material';
import AppButton from '@/components/common/AppButton';
import BaseDialog from '@/components/common/BaseDialog';
import ConfirmationDialog from '@/components/common/ConfirmationDialog';
import NotificationSnackbar from '@/components/common/NotificationSnackbar';
import PDFViewerContainer, { PDFViewerHandle } from '@/components/viewer/PDFViewerContainer';
import { templateService } from '@/services/templateService';
import { apiService } from '@/services/apiService';
import { contractService } from '@/services/contractService';
import { Template } from '@/types/template';
import { Contract } from '@/types/contract';
import dayjs, { Dayjs } from 'dayjs';
import { LocalizationProvider } from '@mui/x-date-pickers/LocalizationProvider';
import { AdapterDayjs } from '@mui/x-date-pickers/AdapterDayjs';
import { DatePicker } from '@mui/x-date-pickers/DatePicker';
import { getTemplateViewUrl } from '@/utils/getTemplateViewUrl';

interface EditContractDialogProps {
    open: boolean;
    onClose: () => void;
    onSuccess?: () => void;
    contract: Contract;
}

const EditContractDialog = ({ open, onClose, onSuccess, contract }: EditContractDialogProps) => {
    const theme = useTheme();
    const isDark = theme.palette.mode === 'dark';
    const pdfViewerRef = useRef<PDFViewerHandle>(null);

    const [currentStep, setCurrentStep] = useState<1 | 2>(1);
    const [templates, setTemplates] = useState<Template[]>([]);
    const [selectedTemplate, setSelectedTemplate] = useState<Template | null>(null);
    const [loadingTemplates, setLoadingTemplates] = useState(false);

    const [documentUrl, setDocumentUrl] = useState<string | null>(null);
    const [initialXfdf, setInitialXfdf] = useState<string | undefined>(undefined);
    const [initialFormFields, setInitialFormFields] = useState<any[] | undefined>(undefined);
    const [documentLoaded, setDocumentLoaded] = useState(false);
    const [loadingDocument, setLoadingDocument] = useState(false);
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState('');
    const [showUnsavedDialog, setShowUnsavedDialog] = useState(false);
    const [snackbar, setSnackbar] = useState<{ open: boolean; message: string; severity: AlertColor }>({
        open: false, message: '', severity: 'success',
    });

    const { control, reset, watch, trigger } = useForm<ContractStep1Form>({
        resolver: zodResolver(contractStep1Schema),
        defaultValues: { contractTitle: '', clientName: '', description: '' },
    });
    const { contractTitle, clientName, description } = watch();

    const [startDate, setStartDate] = useState('');
    const [endDate, setEndDate] = useState('');
    const [filledFieldValues, setFilledFieldValues] = useState<Record<string, string>>({});

    // True when the user picked a different template than the contract's original one
    const templateChanged = selectedTemplate !== null && selectedTemplate.id !== contract.templateId;

    useEffect(() => {
        if (!open) return;

        reset({
            contractTitle: contract.title.replace(/\s*\(Renewal\d*\)$/i, ''),
            clientName: contract.client,
            description: contract.description || '',
        });
        setStartDate(contract.startDate || '');
        setEndDate(contract.endDate || '');
        setFilledFieldValues(contract.fieldValues || {});
        setCurrentStep(1);
        setDocumentUrl(null);
        setDocumentLoaded(false);
        setError('');

        loadTemplateList();
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [open]);

    const loadTemplateList = async () => {
        setLoadingTemplates(true);
        try {
            const allTemplates = await templateService.getAllTemplates();
            setTemplates(allTemplates);
            if (contract.templateId) {
                const found = allTemplates.find(t => t.id === contract.templateId) || null;
                setSelectedTemplate(found);
            } else {
                setSelectedTemplate(null);
            }
        } catch {
            // non-critical — template selector stays empty
        } finally {
            setLoadingTemplates(false);
        }
    };

    const handleNextStep = async () => {
        const valid = await trigger(['contractTitle', 'clientName', 'description']);
        if (!valid) return;
        setError('');
        setLoadingDocument(true);

        try {
            if (templateChanged && selectedTemplate) {
                // User switched to a different template — load that template's PDF
                const [fullTemplate, viewUrl] = await Promise.all([
                    templateService.getTemplateById(selectedTemplate.id),
                    getTemplateViewUrl(selectedTemplate.id),
                ]);
                const tpl = fullTemplate || selectedTemplate;
                const url = viewUrl || tpl.fileData || tpl.fileUrl;
                if (!url) {
                    setError('Failed to load template document. Please try again.');
                    return;
                }
                if (fullTemplate) setSelectedTemplate(fullTemplate);
                setDocumentUrl(url);
                setInitialXfdf(tpl.xfdfData);
                setInitialFormFields(tpl.formFields);
            } else {
                // Load the existing contract PDF
                let url: string | null = null;
                if (contract.fileUploaded) {
                    url = await apiService.getContractViewUrl(contract.id);
                } else if (contract.fileUrl) {
                    url = contract.fileUrl;
                } else if (contract.fileData) {
                    url = `data:application/pdf;base64,${contract.fileData}`;
                } else if ((contract as any).signedPdfBase64) {
                    url = `data:application/pdf;base64,${(contract as any).signedPdfBase64}`;
                }
                if (!url) {
                    setError('No document found for this contract.');
                    return;
                }
                setDocumentUrl(url);
                setInitialXfdf(contract.xfdfData);
                setInitialFormFields(contract.formFields);
            }
            setCurrentStep(2);
        } finally {
            setLoadingDocument(false);
        }
    };

    const handleSave = async () => {
        if (!documentLoaded) return;
        setSaving(true);
        setError('');

        try {
            const exportResult = await pdfViewerRef.current?.exportAnnotations({}, { flatten: false });
            if (!exportResult?.blob) {
                setError('Failed to export document. Please try again.');
                return;
            }
            const { blob: pdfBlob, xfdfString } = exportResult;

            // Export form fields and preserve party/profile assignments from the source
            let exportedFormFields = await pdfViewerRef.current?.exportFormFields();
            const sourceFields = templateChanged
                ? (selectedTemplate?.formFields || [])
                : (contract.formFields || []);
            if (exportedFormFields && sourceFields.length > 0) {
                const sourceMap = new Map(sourceFields.map((f: any) => [f.name, f]));
                exportedFormFields = exportedFormFields.map(field => {
                    const src = sourceMap.get(field.name) as any;
                    return {
                        ...field,
                        value: filledFieldValues[field.name] ?? field.value ?? '',
                        assignedParty: src?.assignedParty || field.assignedParty,
                        partyLabel: src?.partyLabel || field.partyLabel,
                        partyColor: src?.partyColor || field.partyColor,
                        profileKey: src?.profileKey ?? field.profileKey ?? null,
                    };
                });
            }

            const finalStartDate = startDate || dayjs().format('YYYY-MM-DD');
            const finalEndDate = endDate || dayjs(finalStartDate).add(1, 'year').format('YYYY-MM-DD');
            const expiresInDays = dayjs(finalEndDate).diff(dayjs(), 'day');

            const updateData: Record<string, any> = {
                name: contractTitle.trim(),
                title: contractTitle.trim(),
                client: clientName.trim(),
                description: description || contract.description || '',
                expiresInDays,
                startDate: finalStartDate,
                endDate: finalEndDate,
                xfdfData: xfdfString,
                fieldValues: filledFieldValues,
                formFields: exportedFormFields,
                hasFormFields: (exportedFormFields?.length ?? 0) > 0,
            };

            // If template was swapped, update template-related fields too
            if (templateChanged && selectedTemplate) {
                updateData.templateId = selectedTemplate.id;
                updateData.templateName = selectedTemplate.name;
                updateData.content = selectedTemplate.content || '';
                updateData.templateDocxBase64 = selectedTemplate.docxBase64;
                updateData.templateFileName = selectedTemplate.fileName;
                updateData.category = selectedTemplate.category;
                updateData.parties = selectedTemplate.parties;
            }

            const updateResult = await apiService.updateContractDocument(contract.id, updateData);
            if (!updateResult.success) {
                setError(updateResult.message || 'Failed to update contract');
                return;
            }

            const uploadResult = await contractService.updateContractSignedPdf(contract.id, pdfBlob, xfdfString);
            if (!uploadResult.success) {
                setError('Metadata saved but PDF upload failed. Please try saving again.');
                return;
            }

            setSnackbar({ open: true, message: 'Contract updated successfully!', severity: 'success' });
            onSuccess?.();
            setTimeout(() => handleClose(), 1200);
        } catch {
            setError('Failed to update contract. Please try again.');
        } finally {
            setSaving(false);
        }
    };

    const handleClose = () => {
        setCurrentStep(1);
        setSelectedTemplate(null);
        reset();
        setStartDate('');
        setEndDate('');
        setDocumentUrl(null);
        setDocumentLoaded(false);
        setError('');
        setFilledFieldValues({});
        pdfViewerRef.current?.dispose();
        onClose();
    };

    const handleCloseAttempt = () => {
        if (currentStep === 2 && documentLoaded) {
            setShowUnsavedDialog(true);
        } else {
            handleClose();
        }
    };

    const step1Actions = (
        <AppButton
            onClick={handleNextStep}
            endIcon={loadingDocument ? undefined : <ArrowForward />}
            loading={loadingDocument}
            variant="contained"
            disabled={!contractTitle.trim() || !clientName.trim() || loadingDocument}
            sx={{
                fontWeight: 600,
                borderRadius: 2,
                bgcolor: 'primary.main',
                boxShadow: (t) => `0 2px 8px ${t.palette.primary.main}40`,
                '&:hover': { bgcolor: 'primary.dark' },
            }}
        >
            Next: Edit Document
        </AppButton>
    );

    const step2Actions = (
        <Box sx={{ display: 'flex', gap: 1.5, alignItems: 'center' }}>
            <AppButton
                onClick={() => { setCurrentStep(1); setDocumentLoaded(false); }}
                startIcon={<ArrowBack />}
                variant="outlined"
                sx={{ padding: '4px 10px', borderRadius: 2 }}
            >
                Back to Details
            </AppButton>
            <AppButton
                onClick={handleSave}
                variant="contained"
                loading={saving}
                disabled={!documentLoaded || saving}
                sx={{
                    px: 2,
                    py: 0.5,
                    borderRadius: 2,
                    minWidth: 150,
                    bgcolor: 'primary.main',
                    boxShadow: (t) => `0 2px 8px ${t.palette.primary.main}40`,
                    '&:hover': { bgcolor: 'primary.dark' },
                }}
            >
                {saving ? 'Saving...' : 'Save Contract'}
            </AppButton>
        </Box>
    );

    return (
        <>
            <BaseDialog
                open={open}
                onClose={handleCloseAttempt}
                title={currentStep === 1
                    ? 'Edit Contract — Step 1: Contract Details'
                    : 'Edit Contract — Step 2: Edit Document'}
                maxWidth={currentStep === 1 ? 'md' : 'xl'}
                fullWidth
                fullScreen={currentStep === 2}
                noPadding={currentStep === 2}
                actions={currentStep === 1 ? step1Actions : step2Actions}
                disableEnforceFocus={true}
                disableBackdropClick={false}
            >
                {/* ── Step 1: Contract Details ── */}
                {currentStep === 1 && (
                    <Box sx={{ display: 'flex', flexDirection: 'column' }}>
                        {error && (
                            <Alert severity="error" sx={{ mb: 2 }} onClose={() => setError('')}>
                                {error}
                            </Alert>
                        )}

                        <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: '1fr 1fr' }, gap: 2 }}>
                            {/* Template selector */}
                            <Autocomplete
                                value={selectedTemplate}
                                onChange={(_event, newValue) => setSelectedTemplate(newValue)}
                                options={templates}
                                getOptionLabel={(option) => option.name}
                                loading={loadingTemplates}
                                renderInput={(params) => (
                                    <TextField
                                        {...params}
                                        label="Template"
                                        placeholder="Select a template..."
                                        sx={{ '& .MuiOutlinedInput-root': { padding: '4px' } }}
                                    />
                                )}
                                renderOption={(props, option) => {
                                    const { key, ...otherProps } = props as any;
                                    return (
                                        <li key={key} {...otherProps}>
                                            <Box>
                                                <Typography variant="body2" fontWeight={600}>{option.name}</Typography>
                                                <Typography variant="caption" color="text.secondary">{option.category}</Typography>
                                            </Box>
                                        </li>
                                    );
                                }}
                            />

                            {/* Template info / change warning */}
                            {selectedTemplate ? (
                                <Box sx={{
                                    p: 0.5,
                                    px: 1,
                                    bgcolor: templateChanged
                                        ? (t) => alpha(t.palette.warning.main, isDark ? 0.12 : 0.08)
                                        : (t) => alpha(t.palette.primary.main, isDark ? 0.10 : 0.05),
                                    borderRadius: 2,
                                    border: '1px solid',
                                    borderColor: templateChanged
                                        ? (t) => alpha(t.palette.warning.main, 0.4)
                                        : (t) => alpha(t.palette.primary.main, 0.2),
                                    display: 'flex',
                                    alignItems: 'center',
                                }}>
                                    <Box>
                                        <Typography variant="body2" fontWeight={600}
                                            color={templateChanged ? 'warning.main' : 'primary.main'}>
                                            {templateChanged ? '⚠ Template changed' : selectedTemplate.name}
                                        </Typography>
                                        {templateChanged ? (
                                            <Typography variant="caption" color="text.secondary">
                                                The document will reload with the new template
                                            </Typography>
                                        ) : (
                                            <Chip
                                                label={selectedTemplate.category}
                                                size="small"
                                                sx={{ mt: 0.25, bgcolor: 'primary.main', color: 'white' }}
                                            />
                                        )}
                                    </Box>
                                </Box>
                            ) : (
                                // Placeholder when no template selected
                                <Box sx={{
                                    p: 0.5, px: 1,
                                    borderRadius: 2,
                                    border: '1px dashed',
                                    borderColor: 'divider',
                                    display: 'flex',
                                    alignItems: 'center',
                                }}>
                                    <Typography variant="body2" color="text.secondary">
                                        No template selected — document will be unchanged
                                    </Typography>
                                </Box>
                            )}
                        </Box>

                        <Divider sx={{ my: 1.5 }} />
                        <Typography variant="h6" gutterBottom>Contract Information</Typography>

                        <LocalizationProvider dateAdapter={AdapterDayjs}>
                            <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: 'repeat(2, 1fr)' }, gap: 2, mb: 2 }}>
                                <DatePicker
                                    label="Start Date"
                                    value={startDate ? dayjs(startDate) : null}
                                    onChange={(date: Dayjs | null) => {
                                        const val = date ? date.format('YYYY-MM-DD') : '';
                                        setStartDate(val);
                                        if (val && !endDate) {
                                            setEndDate(dayjs(val).add(1, 'year').format('YYYY-MM-DD'));
                                        }
                                    }}
                                    format="DD/MM/YYYY"
                                    slotProps={{
                                        textField: { size: 'small', fullWidth: true },
                                        desktopPaper: { sx: { maxHeight: '50vh', overflowY: 'auto' } },
                                        popper: { modifiers: [{ name: 'preventOverflow', options: { padding: 8 } }, { name: 'flip', enabled: true }] },
                                    }}
                                />
                                <DatePicker
                                    label="End Date"
                                    value={endDate ? dayjs(endDate) : null}
                                    onChange={(date: Dayjs | null) => setEndDate(date ? date.format('YYYY-MM-DD') : '')}
                                    minDate={startDate ? dayjs(startDate) : undefined}
                                    format="DD/MM/YYYY"
                                    slotProps={{
                                        textField: { size: 'small', fullWidth: true },
                                        desktopPaper: { sx: { maxHeight: '50vh', overflowY: 'auto' } },
                                        popper: { modifiers: [{ name: 'preventOverflow', options: { padding: 8 } }, { name: 'flip', enabled: true }] },
                                    }}
                                />
                            </Box>
                        </LocalizationProvider>

                        <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: 'repeat(2, 1fr)' }, gap: 2, mb: 2 }}>
                            <Controller
                                name="contractTitle"
                                control={control}
                                render={({ field, fieldState }) => (
                                    <TextField
                                        {...field}
                                        label="Contract Title"
                                        required
                                        error={!!fieldState.error}
                                        helperText={fieldState.error?.message}
                                        slotProps={{ htmlInput: { maxLength: 50 } }}
                                        sx={{
                                            '& .MuiInputBase-input': { padding: '10px 12px' },
                                            '& .MuiInputLabel-root': { transform: 'translate(14px, 10px) scale(1)' },
                                            '& .MuiInputLabel-root.MuiInputLabel-shrink': { transform: 'translate(14px, -9px) scale(0.75)' },
                                        }}
                                    />
                                )}
                            />
                            <Controller
                                name="clientName"
                                control={control}
                                render={({ field, fieldState }) => (
                                    <TextField
                                        {...field}
                                        label="Client Name"
                                        required
                                        error={!!fieldState.error}
                                        helperText={fieldState.error?.message}
                                        slotProps={{ htmlInput: { maxLength: 50 } }}
                                        sx={{
                                            '& .MuiInputBase-input': { padding: '10px 12px' },
                                            '& .MuiInputLabel-root': { transform: 'translate(14px, 10px) scale(1)' },
                                            '& .MuiInputLabel-root.MuiInputLabel-shrink': { transform: 'translate(14px, -9px) scale(0.75)' },
                                        }}
                                    />
                                )}
                            />
                        </Box>

                        <Controller
                            name="description"
                            control={control}
                            render={({ field, fieldState }) => (
                                <TextField
                                    {...field}
                                    label="Description"
                                    multiline
                                    rows={3}
                                    placeholder="Optional description..."
                                    error={!!fieldState.error}
                                    helperText={fieldState.error?.message}
                                    slotProps={{ htmlInput: { maxLength: 500 } }}
                                    sx={{ mt: 2 }}
                                />
                            )}
                        />
                    </Box>
                )}

                {/* ── Step 2: PDF Editor ── */}
                {currentStep === 2 && (
                    <Box sx={{ display: 'flex', flexDirection: 'column', flex: 1, overflow: 'hidden' }}>
                        {error && (
                            <Alert severity="error" sx={{ mb: 1 }} onClose={() => setError('')}>
                                {error}
                            </Alert>
                        )}
                        {documentUrl ? (
                            <Box sx={{ flex: 1, overflow: 'hidden' }}>
                                <PDFViewerContainer
                                    ref={pdfViewerRef}
                                    documentUrl={documentUrl}
                                    initialXfdf={initialXfdf}
                                    formFields={initialFormFields}
                                    readOnly={false}
                                    currentUserRole="contractor"
                                    canAddFormFields={false}
                                    toolbarMode="forms"
                                    defaultToolbar="view"
                                    editableFieldMode="all"
                                    showAnnotationNavigation={true}
                                    onFieldChange={(fieldName, value) => {
                                        setFilledFieldValues(prev => ({
                                            ...prev,
                                            [fieldName]: value?.toString() ?? '',
                                        }));
                                    }}
                                    onDocumentLoaded={() => setDocumentLoaded(true)}
                                    onError={(err) => setError(err)}
                                />
                            </Box>
                        ) : (
                            <Box sx={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                <Typography variant="h6" color="text.secondary">No document loaded</Typography>
                            </Box>
                        )}
                    </Box>
                )}
            </BaseDialog>

            {/* Discard confirmation */}
            <ConfirmationDialog
                open={showUnsavedDialog}
                title="Discard Changes"
                message="Close without saving? All unsaved edits will be lost."
                onYes={() => { setShowUnsavedDialog(false); handleClose(); }}
                onNo={() => setShowUnsavedDialog(false)}
                onClose={() => setShowUnsavedDialog(false)}
            />

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

export default EditContractDialog;
