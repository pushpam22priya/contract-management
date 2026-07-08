'use client';

import { useState, useRef, useEffect, useMemo } from 'react';
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
import WrongPartyWarningDialog from '@/components/viewer/pdfViewer/WrongPartyWarningDialog';
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

/**
 * In resubmit mode the owner edits a clean template PDF. Only fields they explicitly fill
 * get exported as XFDF annotations. Fields left empty produce no XFDF entry, which means
 * the previous reviewer's values baked into the MinIO flow PDF will show through for those
 * fields when the new participant applies this XFDF. This function augments the XFDF to
 * include an explicit entry for every text/choice form field, using the exported value
 * (owner's input or empty string) so every field is properly overridden.
 */
function buildComprehensiveXfdf(
    xfdf: string,
    formFields: Array<{ name?: string; value?: string; type?: string }>,
): string {
    if (!formFields?.length) return xfdf;

    const existingNames = new Set<string>();
    const namePattern = /<field name="([^"]+)"/g;
    let m: RegExpExecArray | null;
    while ((m = namePattern.exec(xfdf)) !== null) existingNames.add(m[1]);

    const SKIP_TYPES = new Set(['signature', 'button']);
    const additionalEntries = formFields
        .filter(f => f.name && !existingNames.has(f.name) && !SKIP_TYPES.has(f.type ?? ''))
        .map(f => {
            const escaped = String(f.value ?? '')
                .replace(/&/g, '&amp;')
                .replace(/</g, '&lt;')
                .replace(/>/g, '&gt;')
                .replace(/"/g, '&quot;');
            return `<field name="${f.name}"><value>${escaped}</value></field>`;
        })
        .join('');

    if (!additionalEntries) return xfdf;

    if (xfdf.includes('</fields>')) return xfdf.replace('</fields>', additionalEntries + '</fields>');
    if (xfdf.includes('<fields/>')) return xfdf.replace('<fields/>', `<fields>${additionalEntries}</fields>`);
    return xfdf.replace(/<annots(\s*\/?)>/, `<fields>${additionalEntries}</fields><annots$1>`);
}

interface EditContractDialogProps {
    open: boolean;
    onClose: () => void;
    onSuccess?: () => void;
    contract: Contract;
    /** When true: Step 2 loads the fresh template (not current PDF), save calls onResubmitReady */
    resubmitMode?: boolean;
    onResubmitReady?: (contractId: string, contract: Contract) => void;
}

const EditContractDialog = ({ open, onClose, onSuccess, contract, resubmitMode, onResubmitReady }: EditContractDialogProps) => {
    console.log('🟢 [EditContractDialog BUILD MARKER v2] external-party guard active');
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

    // Contractor cannot edit EXTERNAL party fields (type === 'EXTERNAL' on the party config)
    const [showWrongPartyWarning, setShowWrongPartyWarning] = useState(false);

    // IDs of parties marked as EXTERNAL — contractor must not edit these fields.
    // Prefer the freshly-loaded template's parties; fall back to the contract's own parties
    // (e.g. resubmit without a matched template).
    const externalTypePartyIds = useMemo(() => {
        const parties = (selectedTemplate?.parties || (contract as any).parties || []) as any[];
        return parties.filter((p) => p.type === 'EXTERNAL').map((p) => p.id as string);
    }, [selectedTemplate?.parties, contract]);

    // Ref so onFieldChange always sees latest values (called via viewer ref / closure)
    const filledFieldValuesRef = useRef<Record<string, string>>({});
    useEffect(() => { filledFieldValuesRef.current = filledFieldValues; }, [filledFieldValues]);

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
            // In resubmit mode: always load the original template fresh (empty form fields).
            // This discards any reviewer/approver annotations — owner starts from scratch.
            const loadFreshTemplate = resubmitMode || (templateChanged && !!selectedTemplate);

            if (loadFreshTemplate && selectedTemplate) {
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
                // Load with empty XFDF so all form fields start blank
                setInitialXfdf(undefined);
                setInitialFormFields(tpl.formFields);
                // Clear old reviewer/approver field values so the PATCH sends only the owner's new values
                if (resubmitMode) setFilledFieldValues({});
            } else {
                // Normal edit: load the existing contract PDF with saved annotations
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
                // In resubmit mode without a matched template: still strip reviewer/approver
                // XFDF so the owner sees the clean base PDF (no old annotations).
                if (resubmitMode) {
                    setInitialXfdf(undefined);
                    setFilledFieldValues({});
                } else {
                    setInitialXfdf(contract.xfdfData);
                }
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

            // In resubmit mode: augment XFDF to include ALL form fields with explicit values.
            // Without this, the new reviewer loads the MinIO flow PDF (which still has the
            // previous reviewer's values baked in from their markFlowComplete upload) and only
            // the owner's explicitly filled fields are overridden. Empty explicit entries ensure
            // every field is reset to the owner's submitted state regardless of the flow PDF.
            const finalXfdf = resubmitMode
                ? buildComprehensiveXfdf(xfdfString, exportedFormFields ?? [])
                : xfdfString;

            // Build comprehensive fieldValues from exported form fields in resubmit mode
            // so the PATCH sends the full owner state rather than an empty map that
            // causes the internal PATCH handler to merge-preserve old reviewer values.
            const finalFieldValues = resubmitMode
                ? Object.fromEntries((exportedFormFields ?? []).map(f => [f.name, f.value ?? '']))
                : filledFieldValues;

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
                xfdfData: finalXfdf,
                fieldValues: finalFieldValues,
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

            const uploadResult = await contractService.updateContractSignedPdf(contract.id, pdfBlob, finalXfdf);
            if (!uploadResult.success) {
                setError('Metadata saved but PDF upload failed. Please try saving again.');
                return;
            }

            if (resubmitMode) {
                // Belt-and-suspenders: also write directly to MongoDB via the internal API so the
                // reviewer/approver panels (which now read MongoDB first) always see the fresh values
                // without depending solely on Spring Boot's flush timing.
                try {
                    await fetch(`/api/contracts/${contract.id}`, {
                        method: 'PATCH',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                            xfdfData: finalXfdf,
                            fieldValues: finalFieldValues,
                            formFields: exportedFormFields,
                        }),
                    });
                } catch {
                    // Non-fatal — Spring Boot path already persisted above
                }
                onResubmitReady?.(contract.id, contract);
                handleClose();
            } else {
                setSnackbar({ open: true, message: 'Contract updated successfully!', severity: 'success' });
                onSuccess?.();
                setTimeout(() => handleClose(), 1200);
            }
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
            {resubmitMode ? 'Next: Fill Document' : 'Next: Edit Document'}
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
                {saving ? 'Saving...' : resubmitMode ? 'Save & Continue' : 'Save Contract'}
            </AppButton>
        </Box>
    );

    return (
        <>
            <BaseDialog
                open={open}
                onClose={handleCloseAttempt}
                title={currentStep === 1
                    ? (resubmitMode ? 'Update & Resubmit — Step 1: Contract Details' : 'Edit Contract — Step 1: Contract Details')
                    : (resubmitMode ? 'Update & Resubmit — Step 2: Fill Document' : 'Edit Contract — Step 2: Edit Document')}
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
                                    // ✅ Enable the viewer's native EXTERNAL-party protection.
                                    // protectedPartyIds activates signature blocking (viewer deletes an
                                    // external-party signature and calls onSignaturePositionRestored),
                                    // which reads party ownership from formFields directly (name match),
                                    // so it is unaffected by the party-restore timing issue.
                                    parties={selectedTemplate?.parties || (contract as any).parties || []}
                                    protectedPartyIds={externalTypePartyIds}
                                    onSignaturePositionRestored={() => setShowWrongPartyWarning(true)}
                                    onFieldChange={(fieldName, value) => {
                                        // Block contractor from editing EXTERNAL party TEXT fields.
                                        // (Signature fields are blocked by the viewer via protectedPartyIds above.)
                                        // This guard must run in resubmit/edit mode too, not just on first creation.
                                        const field = (initialFormFields || []).find((f: any) => f.name === fieldName);
                                        if (field?.assignedParty && externalTypePartyIds.includes(field.assignedParty)) {
                                            setShowWrongPartyWarning(true);
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
                                            [fieldName]: value?.toString() ?? '',
                                        }));
                                    }}
                                    onDocumentLoaded={() => setDocumentLoaded(true)}
                                    onError={(err) => setError(err)}
                                />

                                {/* Warn contractor when they try to fill an EXTERNAL party's fields */}
                                <WrongPartyWarningDialog
                                    open={showWrongPartyWarning}
                                    title="External Party Field"
                                    description="This field belongs to an external party and cannot be edited by your organisation."
                                    pdfViewerRef={pdfViewerRef}
                                    navigateConfig={{ type: 'nonClient', excludePartyIds: externalTypePartyIds }}
                                    onClose={() => setShowWrongPartyWarning(false)}
                                    zIndex={1400}
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
