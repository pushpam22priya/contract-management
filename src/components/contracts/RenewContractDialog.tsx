'use client';

import AppButton from '@/components/common/AppButton';
import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import {
    Box,
    Typography, 
    TextField,
    RadioGroup,
    FormControlLabel,
    Radio,
    Autocomplete,
    Alert,
    CircularProgress,
    AlertColor,
    Tooltip,
    useTheme,
} from '@mui/material';
import { alpha } from '@mui/material/styles';
import { ArrowBack, ArrowForward, Save } from '@mui/icons-material';
import AutoFixHighIcon from '@mui/icons-material/AutoFixHigh';
import { LocalizationProvider } from '@mui/x-date-pickers/LocalizationProvider';
import { AdapterDayjs } from '@mui/x-date-pickers/AdapterDayjs';
import { DatePicker } from '@mui/x-date-pickers/DatePicker';
import dayjs, { Dayjs } from 'dayjs';
import BaseDialog from '@/components/common/BaseDialog';
import ConfirmationDialog from '@/components/common/ConfirmationDialog';
import NotificationSnackbar from '@/components/common/NotificationSnackbar';
import RequestReviewDialog from '@/components/contracts/RequestReviewDialog';
import SubmitForSignatureDialog from '@/components/contracts/SubmitForSignatureDialog';
import MultiPartySignatureDialog from '@/components/contracts/MultiPartySignatureDialog';
import PDFViewerContainer, { PDFViewerHandle } from '@/components/viewer/PDFViewerContainer';
import PartyValidationWarningPopup from '@/components/viewer/pdfViewer/PartyValidationWarningPopup';
import WrongPartyWarningDialog from '@/components/viewer/pdfViewer/WrongPartyWarningDialog';
import { authService } from '@/services/authService';
import { contractService } from '@/services/contractService';
import { apiService } from '@/services/apiService';
import { submitForMixedSignature } from '@/services/externalSignatureService';
import { validatePartyFields } from '@/utils/partyValidation';
import AutofillPartyDialog from '@/components/contracts/AutofillPartyDialog';
import { buildProfileData } from '@/utils/profileKeyOptions';

interface Template {
    id: string;
    name: string;
    category: string;
}

interface RenewContractDialogProps {
    open: boolean;
    onClose: () => void;
    contractId: string;
    contractTitle: string;
    contractEndDate: string; // ISO string
    onSuccess?: (renewalId: string) => void;
}

export default function RenewContractDialog({
    open,
    onClose,
    contractId,
    contractTitle,
    contractEndDate,
    onSuccess,
}: RenewContractDialogProps) {
    const router = useRouter();
    const theme = useTheme();
    const isDark = theme.palette.mode === 'dark';
    const inputBg = isDark ? alpha('#ffffff', 0.05) : '#f8fafc';
    const inputHoverBg = isDark ? alpha('#ffffff', 0.08) : '#f1f5f9';
    const pdfViewerRef = useRef<PDFViewerHandle>(null);

    const origEnd = dayjs(contractEndDate);
    const defaultStart = origEnd.add(1, 'day');
    const defaultEnd = origEnd.add(1, 'year');

    // ── Step ──────────────────────────────────────────────────────────────────
    const [step, setStep] = useState<1 | 2>(1);

    // ── Step 1 form state ─────────────────────────────────────────────────────
    const [startDate, setStartDate] = useState<Dayjs | null>(defaultStart);
    const [endDate, setEndDate] = useState<Dayjs | null>(defaultEnd);
    const [startError, setStartError] = useState('');
    const [endError, setEndError] = useState('');
    const [docSource, setDocSource] = useState<'same' | 'template'>('same');
    const [templates, setTemplates] = useState<Template[]>([]);
    const [loadingTemplates, setLoadingTemplates] = useState(false);
    const [selectedTemplate, setSelectedTemplate] = useState<Template | null>(null);
    const [templateError, setTemplateError] = useState('');
    const [notes, setNotes] = useState('');
    const [creatingRenewal, setCreatingRenewal] = useState(false);
    const [step1Error, setStep1Error] = useState('');

    // ── Renewal contract state (set after Step 1 API call) ────────────────────
    const [renewalId, setRenewalId] = useState<string | null>(null);
    const [renewalContract, setRenewalContract] = useState<any | null>(null);
    // Fallback parties from the original contract (for old drafts that pre-date the parties copy fix)
    const [originalParties, setOriginalParties] = useState<any[]>([]);

    // ── Step 2 state ──────────────────────────────────────────────────────────
    const [documentLoaded, setDocumentLoaded] = useState(false);
    const [saving, setSaving] = useState(false);
    const [step2Error, setStep2Error] = useState('');
    const [filledFieldValues, setFilledFieldValues] = useState<Record<string, string>>({});
    const [validationTriggered, setValidationTriggered] = useState(false);
    const [showWrongPartyWarning, setShowWrongPartyWarning] = useState(false);
    // Track whether the user has actually saved — only then is the original marked
    const [hasSaved, setHasSaved] = useState(false);

    // ── Refs so callbacks always see latest values ────────────────────────────
    const contractorPartyIdRef = useRef<string | null>(null);
    const filledFieldValuesRef = useRef<Record<string, string>>({});
    useEffect(() => { filledFieldValuesRef.current = filledFieldValues; }, [filledFieldValues]);

    // ── Dialogs ───────────────────────────────────────────────────────────────
    const [showUnsavedDialog, setShowUnsavedDialog] = useState(false);
    const [pendingAction, setPendingAction] = useState<'close' | 'review' | 'signature' | null>(null);
    const [reviewDialogOpen, setReviewDialogOpen] = useState(false);
    const [signatureDialogOpen, setSignatureDialogOpen] = useState(false);
    const [multiPartyDialogOpen, setMultiPartyDialogOpen] = useState(false);
    const [autofillPartyDialogOpen, setAutofillPartyDialogOpen] = useState(false);

    // ── Snackbar ──────────────────────────────────────────────────────────────
    const [snackbar, setSnackbar] = useState<{ open: boolean; message: string; severity: AlertColor }>({
        open: false, message: '', severity: 'success',
    });

    // ── Reset when dialog opens ───────────────────────────────────────────────
    useEffect(() => {
        if (open) {
            setStep(1);
            setStartDate(defaultStart);
            setEndDate(defaultEnd);
            setStartError('');
            setEndError('');
            setDocSource('same');
            setSelectedTemplate(null);
            setTemplateError('');
            setNotes('');
            setStep1Error('');
            setRenewalId(null);
            setRenewalContract(null);
            setDocumentLoaded(false);
            setStep2Error('');
            setFilledFieldValues({});
            setValidationTriggered(false);
            setShowWrongPartyWarning(false);
            setOriginalParties([]);
            setHasSaved(false);
        }
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [open]);

    // Effective parties: prefer renewal contract's own parties, fall back to original contract's,
    // and as a final fallback derive from formFields assignedParty metadata so the
    // MultiPartySignatureDialog always gets a populated parties array.
    const effectiveParties = useMemo(() => {
        if (renewalContract?.parties?.length) return renewalContract.parties;
        if (originalParties.length) return originalParties;
        // Derive from formFields — works for renewals that pre-date the parties copy fix
        const formFields = renewalContract?.formFields || [];
        const seen = new Map<string, { id: string; label: string; color: string; order: number }>();
        for (const f of formFields) {
            if (f.assignedParty && !seen.has(f.assignedParty)) {
                seen.set(f.assignedParty, {
                    id: f.assignedParty,
                    label: f.partyLabel || f.assignedParty,
                    color: f.partyColor || '#888',
                    order: seen.size + 1,
                });
            }
        }
        return Array.from(seen.values());
    }, [renewalContract?.parties, renewalContract?.formFields, originalParties]);

    // ── Contractor party restriction: first party touched locks the rest ─────
    const contractorPartyId = useMemo(() => {
        const formFields = renewalContract?.formFields || [];
        for (const field of formFields) {
            if (field.assignedParty && filledFieldValues[field.name]?.trim()) {
                return field.assignedParty as string;
            }
        }
        return null;
    }, [filledFieldValues, renewalContract?.formFields]);

    useEffect(() => { contractorPartyIdRef.current = contractorPartyId; }, [contractorPartyId]);

    // ── Party validation: detect partially filled parties ─────────────────────
    const partyValidationWarning = useMemo(() => {
        const formFields = renewalContract?.formFields || [];
        const parties = effectiveParties;
        if (!formFields.length || !parties.length) return null;

        const partialParties: { party: any; filled: number; total: number; missing: string[] }[] = [];
        for (const party of parties) {
            const result = validatePartyFields(party.id, formFields, filledFieldValues);
            if (result.filledCount > 0 && result.filledCount < result.totalCount) {
                const partyFields = formFields.filter((f: any) => f.assignedParty === party.id);
                const unfilledFields = partyFields
                    .filter((f: any) => !filledFieldValues[f.name]?.trim())
                    .map((f: any) => f.name);
                partialParties.push({ party, filled: result.filledCount, total: result.totalCount, missing: unfilledFields });
            }
        }
        return partialParties.length > 0 ? partialParties : null;
    }, [filledFieldValues, renewalContract?.formFields, renewalContract?.parties]);

    const hasPartialParty = !!partyValidationWarning;

    // ── Field change handler with single-party restriction ────────────────────
    const handleFieldChange = useCallback((fieldName: string, value: any) => {
        const formFields = renewalContract?.formFields || [];
        const field = formFields.find((f: any) => f.name === fieldName);
        if (field?.assignedParty && contractorPartyIdRef.current && field.assignedParty !== contractorPartyIdRef.current) {
            setShowWrongPartyWarning(true);
            const prevValue = filledFieldValuesRef.current[fieldName] || '';
            if (prevValue) {
                pdfViewerRef.current?.restoreFieldValue(fieldName, prevValue);
            } else {
                pdfViewerRef.current?.clearField(fieldName);
            }
            return;
        }
        setFilledFieldValues(prev => ({ ...prev, [fieldName]: value?.toString() || '' }));
    }, [renewalContract?.formFields]);

    // ── Fetch templates when user picks "Use a different template" ────────────
    useEffect(() => {
        if (docSource === 'template' && templates.length === 0) {
            setLoadingTemplates(true);
            fetch('/api/templates')
                .then(r => r.json())
                .then(data => setTemplates(Array.isArray(data) ? data : []))
                .catch(() => setTemplates([]))
                .finally(() => setLoadingTemplates(false));
        }
    }, [docSource, templates.length]);

    // ── Validation helpers ────────────────────────────────────────────────────
    const validateStartDate = (d: Dayjs | null): string => {
        if (!d || !d.isValid()) return 'Start date is required';
        if (!d.isAfter(origEnd)) return `Start date must be after the contract's expiry date (${origEnd.format('DD/MM/YYYY')})`;
        return '';
    };

    const validateEndDate = (d: Dayjs | null, sd: Dayjs | null): string => {
        if (!d || !d.isValid()) return 'End date is required';
        if (sd && sd.isValid() && !d.isAfter(sd)) return 'End date must be after the new start date';
        return '';
    };

    const handleStartDateChange = (d: Dayjs | null) => {
        setStartDate(d);
        setStartError(validateStartDate(d));
        if (endDate) setEndError(validateEndDate(endDate, d));
    };

    const handleEndDateChange = (d: Dayjs | null) => {
        setEndDate(d);
        setEndError(validateEndDate(d, startDate));
    };

    const isStep1Valid =
        !validateStartDate(startDate) &&
        !validateEndDate(endDate, startDate) &&
        (docSource === 'same' || !!selectedTemplate);

    // ── Step 1 → Step 2 ───────────────────────────────────────────────────────
    const handleNext = async () => {
        const se = validateStartDate(startDate);
        const ee = validateEndDate(endDate, startDate);
        const te = docSource === 'template' && !selectedTemplate ? 'Please select a template' : '';
        setStartError(se);
        setEndError(ee);
        setTemplateError(te);
        if (se || ee || te) return;

        // If renewal already created (user went back from Step 2), just re-enter Step 2
        if (renewalId && renewalContract) {
            setStep(2);
            return;
        }

        setCreatingRenewal(true);
        setStep1Error('');

        try {
            const currentUser = authService.getCurrentUser();
            const res = await fetch(`/api/contracts/${contractId}/renew`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    startDate: startDate!.format('YYYY-MM-DD'),
                    endDate: endDate!.format('YYYY-MM-DD'),
                    documentSource: docSource,
                    templateId: docSource === 'template' ? selectedTemplate?.id : undefined,
                    notes: notes.trim() || undefined,
                    createdBy: currentUser?.email || '',
                }),
            });

            const data = await res.json();
            if (!res.ok) {
                setStep1Error(data.error || 'Failed to create renewal contract');
                return;
            }

            const newRenewalId = data.renewalId;
            setRenewalId(newRenewalId);

            // Fetch the renewal contract to get formFields and parties for the PDF viewer
            const contractRes = await fetch(`/api/contracts/${newRenewalId}`);
            if (contractRes.ok) {
                const contractData = await contractRes.json();
                setRenewalContract(contractData);

                // For old renewal drafts that were created before the `parties` copy fix,
                // parties may be empty. Fall back to the original contract's parties.
                if (!contractData.parties?.length) {
                    const origRes = await fetch(`/api/contracts/${contractId}`);
                    if (origRes.ok) {
                        const origData = await origRes.json();
                        setOriginalParties(origData.parties || []);
                    }
                }
            }

            setStep(2);
        } catch {
            setStep1Error('Network error. Please try again.');
        } finally {
            setCreatingRenewal(false);
        }
    };

    // ── canSave: drives button disabled state ─────────────────────────────────
    const canSave = documentLoaded && !saving && (!validationTriggered || !hasPartialParty);

    // ── Mark original as "renewal in progress" (called once on first save) ──────
    const markOriginalAsRenewed = useCallback(async (rid: string) => {
        try {
            await fetch(`/api/contracts/${contractId}/mark-renewal`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    renewalId: rid,
                    startDate: startDate?.format('YYYY-MM-DD') || null,
                }),
            });
        } catch {
            // Non-critical — don't block the save flow
        }
    }, [contractId, startDate]);

    // ── Step 2: Save ──────────────────────────────────────────────────────────
    const handleSave = useCallback(async (): Promise<string | null> => {
        if (hasPartialParty) {
            setValidationTriggered(true);
            return null;
        }
        if (!renewalId || !pdfViewerRef.current) return null;
        setSaving(true);
        setStep2Error('');

        try {
            const exportResult = await pdfViewerRef.current.exportAnnotations({}, { flatten: false });
            if (!exportResult?.blob) {
                setStep2Error('Failed to export PDF. Please try again.');
                return null;
            }

            const { blob: pdfBlob, xfdfString } = exportResult;

            // Upload PDF binary
            const uploadResult = await contractService.updateContractSignedPdf(renewalId, pdfBlob, xfdfString);
            if (!uploadResult.success) {
                setStep2Error('Failed to save contract');
                return null;
            }

            // Export and save formFields + fieldValues metadata
            const exportedFormFields = await pdfViewerRef.current.exportFormFields?.();
            if (exportedFormFields && exportedFormFields.length > 0) {
                const renewalFormFields = (renewalContract?.formFields || []);
                const templateFieldsMap = new Map(renewalFormFields.map((f: any) => [f.name, f]));
                const mergedFields = exportedFormFields.map((field: any) => {
                    const base = templateFieldsMap.get(field.name) as any;
                    return {
                        ...field,
                        value: filledFieldValues[field.name] || field.value || '',
                        assignedParty: base?.assignedParty || field.assignedParty,
                        partyLabel: base?.partyLabel || field.partyLabel,
                        partyColor: base?.partyColor || field.partyColor,
                        profileKey: base?.profileKey ?? field.profileKey ?? null,
                    };
                });
                await apiService.updateContractMetadata(renewalId, {
                    formFields: mergedFields,
                    fieldValues: filledFieldValues,
                });
            }

            // Mark the original as "renewal in progress" on first save only
            if (!hasSaved) {
                await markOriginalAsRenewed(renewalId);
                setHasSaved(true);
            }

            setSnackbar({ open: true, message: 'Contract saved!', severity: 'success' });
            return renewalId;
        } catch {
            setStep2Error('An error occurred while saving. Please try again.');
            return null;
        } finally {
            setSaving(false);
        }
    }, [renewalId, contractId, filledFieldValues, renewalContract, hasPartialParty, hasSaved, markOriginalAsRenewed]);

    // ── Step 2: Review & Approve ──────────────────────────────────────────────
    const handleReviewClick = () => {
        setPendingAction('review');
        setShowUnsavedDialog(true);
    };

    // ── Step 2: Signature ─────────────────────────────────────────────────────
    const handleSignatureClick = () => {
        setPendingAction('signature');
        setShowUnsavedDialog(true);
    };

    // ── Unsaved changes dialog ────────────────────────────────────────────────
    const handleUnsavedYes = async () => {
        setShowUnsavedDialog(false);
        const savedId = await handleSave();
        if (!savedId) return;

        if (pendingAction === 'close') {
            handleClose();
            onSuccess?.(savedId);
        } else if (pendingAction === 'review') {
            setReviewDialogOpen(true);
        } else if (pendingAction === 'signature') {
            openSignatureDialog();
        }
        setPendingAction(null);
    };

    const handleUnsavedNo = () => {
        setShowUnsavedDialog(false);
        if (pendingAction === 'close') handleClose();
        setPendingAction(null);
    };

    const openSignatureDialog = () => {
        const formFields = renewalContract?.formFields || [];
        // Count unique assigned parties directly from formFields — this is the
        // authoritative source and works even when effectiveParties is empty or IDs mismatch.
        const uniqueAssignedParties = new Set(
            formFields.map((f: any) => f.assignedParty).filter(Boolean)
        );
        if (uniqueAssignedParties.size > 1) {
            setMultiPartyDialogOpen(true);
        } else {
            setSignatureDialogOpen(true);
        }
    };

    // ── Mixed signature submit ────────────────────────────────────────────────
    const handleMixedSignatureSubmit = async (assignments: any[]) => {
        if (!renewalId) return { success: false, error: 'Contract not saved' };
        const currentUser = authService.getCurrentUser();
        const contractMock = {
            id: renewalId,
            title: renewalTitle,
            client: renewalContract?.client,
            parties: effectiveParties,
            formFields: renewalContract?.formFields,
            fieldValues: filledFieldValues,
        } as any;

        try {
            const result = await submitForMixedSignature(contractMock, assignments, currentUser?.email || '');
            if (result.success) {
                setSnackbar({ open: true, message: 'Signature assignments created!', severity: 'success' });
                setMultiPartyDialogOpen(false);
                setTimeout(() => {
                    handleClose();
                    onSuccess?.(renewalId);
                    router.push('/contracts');
                }, 1000);
                return { success: true };
            }
            return { success: false, error: result.error };
        } catch (e: any) {
            return { success: false, error: e.message };
        }
    };

    // ── Autofill ──────────────────────────────────────────────────────────────
    const handleAutofillConfirm = (partyId: string) => {
        const currentUser = authService.getCurrentUser();
        if (!currentUser) {
            setSnackbar({ open: true, message: 'Please log in to use autofill', severity: 'warning' });
            return;
        }

        const profileData = buildProfileData(currentUser);

        if (Object.values(profileData).every(v => !v.trim())) {
            setSnackbar({ open: true, message: 'Please complete your profile in Settings first', severity: 'warning' });
            return;
        }

        try {
            const count = pdfViewerRef.current?.autofillFields(partyId, profileData) ?? 0;
            if (count === 0) {
                setSnackbar({ open: true, message: 'No matching fields found for your profile data', severity: 'warning' });
            } else {
                setSnackbar({ open: true, message: `${count} field${count !== 1 ? 's' : ''} filled from your profile`, severity: 'success' });
            }
        } catch {
            setSnackbar({ open: true, message: 'Something went wrong during autofill. Please try manually.', severity: 'error' });
        }
    };

    const handleAutofillClick = () => {
        const formFields = renewalContract?.formFields || [];
        const parties = effectiveParties;

        const getMappedFieldCount = (partyId: string) =>
            formFields.filter(
                (f: any) => f.assignedParty === partyId && f.type !== 'Sig' && f.type !== 'signature' && !!f.profileKey
            ).length;

        const partiesWithFields = parties.filter((p: any) => getMappedFieldCount(p.id) > 0);

        if (partiesWithFields.length === 0) {
            setSnackbar({ open: true, message: 'No fillable fields found in this document', severity: 'warning' });
            return;
        }

        if (partiesWithFields.length === 1) {
            handleAutofillConfirm(partiesWithFields[0].id);
        } else {
            setAutofillPartyDialogOpen(true);
        }
    };

    // ── Close ─────────────────────────────────────────────────────────────────
    const handleClose = () => {
        pdfViewerRef.current?.dispose?.();
        // If a renewal draft was created but never saved, delete it so the
        // original contract's Renew button stays available.
        if (renewalId && !hasSaved) {
            contractService.deleteContract(renewalId).catch(() => {});
        }
        onClose();
    };

    const handleCloseAttempt = () => {
        if (step === 2 && renewalId && documentLoaded) {
            setPendingAction('close');
            setShowUnsavedDialog(true);
        } else {
            handleClose();
        }
    };

    // ── Date picker sx ────────────────────────────────────────────────────────
    const datePickerSx = {
        width: '100%',
        '& .MuiOutlinedInput-root': {
            bgcolor: inputBg,
            borderRadius: 2,
            '&:hover': { bgcolor: inputHoverBg },
            '&.Mui-focused': { bgcolor: 'background.paper' },
        },
    };

    const renewalTitle = `${contractTitle.replace(/\s*\(Renewal\d*\)$/i, '')} (Renewal)`;

    return (
        <LocalizationProvider dateAdapter={AdapterDayjs}>
            <BaseDialog
                open={open}
                onClose={handleCloseAttempt}
                title={step === 1
                    ? 'Renew Contract — Step 1: Renewal Details'
                    : `Renew Contract — Step 2: Edit Document`}
                maxWidth={step === 1 ? 'md' : 'xl'}
                fullWidth
                fullScreen={step === 2}
                noPadding={step === 2}
                disableEnforceFocus
                actions={
                    step === 1 ? (
                        <>
                            <AppButton onClick={handleClose} disabled={creatingRenewal} variant="outlined" color="inherit" size="small">
                                Cancel
                            </AppButton>
                            <AppButton
                                onClick={handleNext}
                                disabled={!isStep1Valid}
                                loading={creatingRenewal}
                                variant="contained"
                                size="small"
                                endIcon={<ArrowForward />}
                            >
                                {creatingRenewal ? 'Creating…' : renewalId ? 'Back to Editor' : 'Next: Edit Document'}
                            </AppButton>
                        </>
                    ) : (
                        <Box sx={{ display: 'flex', gap: 1.5, alignItems: 'center' }}>
                            <AppButton
                                onClick={() => setStep(1)}
                                variant="outlined"
                                startIcon={<ArrowBack />}
                                sx={{ px: 1.5, py: 0.5, borderRadius: 2 }}
                            >
                                Back to Details
                            </AppButton>

                            <Tooltip title="Fill fields from your profile" arrow>
                                <span>
                                    <AppButton
                                        variant="outlined"
                                        onClick={handleAutofillClick}
                                        disabled={!documentLoaded || saving}
                                        size="small"
                                        startIcon={<AutoFixHighIcon sx={{ fontSize: 16 }} />}
                                        sx={{ borderRadius: 2, py: 0.5 }}
                                    >
                                        Autofill
                                    </AppButton>
                                </span>
                            </Tooltip>

                            <Tooltip title={hasPartialParty ? 'Complete all fields for the party you started' : ''} arrow>
                                <span>
                                    <AppButton
                                        onClick={handleSave}
                                        variant="contained"
                                        disabled={!canSave}
                                        loading={saving}
                                        startIcon={<Save />}
                                        sx={{
                                            px: 2, py: 0.5, borderRadius: 2, minWidth: 150,
                                            bgcolor: 'primary.main',
                                            '&:hover': { bgcolor: 'primary.dark' },
                                        }}
                                    >
                                        {saving ? 'Saving…' : 'Save Contract'}
                                    </AppButton>
                                </span>
                            </Tooltip>

                            <AppButton
                                variant="contained"
                                onClick={handleReviewClick}
                                disabled={!canSave}
                                sx={{
                                    px: 2, py: 0.5, borderRadius: 2, minWidth: 150,
                                    bgcolor: '#2e7d32',
                                    '&:hover': { bgcolor: '#1b5e20' },
                                }}
                            >
                                Review & Approve
                            </AppButton>

                            <AppButton
                                variant="contained"
                                onClick={handleSignatureClick}
                                disabled={!canSave}
                                sx={{
                                    px: 2, py: 0.5, borderRadius: 2, minWidth: 150,
                                    bgcolor: '#1565c0',
                                    '&:hover': { bgcolor: '#0d47a1' },
                                }}
                            >
                                Signature
                            </AppButton>
                        </Box>
                    )
                }
            >
                {/* ── STEP 1: Renewal Details Form ── */}
                {step === 1 && (
                    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>

                        {step1Error && <Alert severity="error" sx={{ py: 0.5 }}>{step1Error}</Alert>}

                        {/* Dates */}
                        <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr' }, gap: 2 }}>
                            <Box>
                                <Typography variant="caption" sx={{ fontWeight: 600, color: 'text.secondary', display: 'block', mb: 0.5 }}>
                                    New Start Date <span style={{ color: '#ef4444' }}>*</span>
                                </Typography>
                                <DatePicker
                                    value={startDate}
                                    onChange={handleStartDateChange}
                                    minDate={origEnd.add(1, 'day')}
                                    format="DD/MM/YYYY"
                                    slotProps={{ textField: { size: 'small', error: !!startError, helperText: startError, sx: datePickerSx } }}
                                />
                            </Box>
                            <Box>
                                <Typography variant="caption" sx={{ fontWeight: 600, color: 'text.secondary', display: 'block', mb: 0.5 }}>
                                    New End Date <span style={{ color: '#ef4444' }}>*</span>
                                </Typography>
                                <DatePicker
                                    value={endDate}
                                    onChange={handleEndDateChange}
                                    minDate={startDate ? startDate.add(1, 'day') : origEnd.add(2, 'day')}
                                    format="DD/MM/YYYY"
                                    slotProps={{ textField: { size: 'small', error: !!endError, helperText: endError, sx: datePickerSx } }}
                                />
                            </Box>
                        </Box>

                        {/* Document source */}
                        <Box>
                            <Typography variant="caption" sx={{ fontWeight: 600, color: 'text.secondary', display: 'block', mb: 0.5 }}>
                                Document Source
                            </Typography>
                            <RadioGroup
                                value={docSource}
                                onChange={(e) => {
                                    setDocSource(e.target.value as 'same' | 'template');
                                    setSelectedTemplate(null);
                                    setTemplateError('');
                                }}
                                sx={{
                                    display: 'flex',
                                    flexDirection: 'row',
                                    gap: 2,
                                }}
                            >
                                <FormControlLabel
                                    value="same"
                                    sx={{
                                        margin: 0,
                                    }}
                                    control={<Radio size="small" />}
                                    label={<Typography variant="body2">Keep existing document</Typography>}
                                />
                                <FormControlLabel
                                    value="template"
                                    sx={{
                                        margin: 0,
                                    }}
                                    control={<Radio size="small" />}
                                    label={<Typography variant="body2">Use a different template</Typography>}
                                />
                            </RadioGroup>
                        </Box>

                        {/* Template selector */}
                        {docSource === 'template' && (
                            <Box>
                                <Typography variant="caption" sx={{ fontWeight: 600, color: 'text.secondary', display: 'block', mb: 0.5 }}>
                                    Select Template <span style={{ color: '#ef4444' }}>*</span>
                                </Typography>
                                <Autocomplete
                                    size="small"
                                    loading={loadingTemplates}
                                    options={templates}
                                    getOptionLabel={(t) => `${t.name} (${t.category})`}
                                    value={selectedTemplate}
                                    onChange={(_, val) => {
                                        setSelectedTemplate(val);
                                        setTemplateError(val ? '' : 'Please select a template');
                                    }}
                                    renderInput={(params) => (
                                        <TextField
                                            {...params}
                                            placeholder="Search templates…"
                                            error={!!templateError}
                                            helperText={templateError}
                                            sx={{ '& .MuiOutlinedInput-root': { bgcolor: inputBg, borderRadius: 2 } }}
                                        />
                                    )}
                                />
                            </Box>
                        )}

                        {/* Notes */}
                        <Box>
                            <Typography variant="caption" sx={{ fontWeight: 600, color: 'text.secondary', display: 'block', mb: 0.5 }}>
                                Renewal Notes{' '}
                            </Typography>
                            <TextField
                                fullWidth
                                multiline
                                rows={3}
                                size="small"
                                placeholder="Add any notes about this renewal"
                                value={notes}
                                onChange={(e) => { if (e.target.value.length <= 300) setNotes(e.target.value); }}
                                slotProps={{ htmlInput: { maxLength: 300 } }}
                                helperText={`${notes.length}/300`}
                                sx={{ '& .MuiOutlinedInput-root': { bgcolor: inputBg, borderRadius: 2 } }}
                            />
                        </Box>
                    </Box>
                )}

                {/* ── STEP 2: Full-screen PDF editor ── */}
                {step === 2 && (
                    <Box sx={{ display: 'flex', flexDirection: 'column', flex: 1, overflow: 'hidden' }}>
                        {step2Error && (
                            <Alert severity="error" sx={{ m: 1 }} onClose={() => setStep2Error('')}>
                                {step2Error}
                            </Alert>
                        )}

                        {renewalId ? (
                            <Box sx={{ flex: 1, overflow: 'hidden', position: 'relative' }}>
                                <PDFViewerContainer
                                    ref={pdfViewerRef}
                                    documentUrl={`/api/file/${renewalId}?type=contract`}
                                    initialXfdf={undefined}
                                    formFields={renewalContract?.formFields || []}
                                    readOnly={false}
                                    currentUserRole="contractor"
                                    canAddFormFields={false}
                                    toolbarMode="forms"
                                    defaultToolbar="view"
                                    onFieldChange={handleFieldChange}
                                    onDocumentLoaded={() => setDocumentLoaded(true)}
                                    showAnnotationNavigation={true}
                                    onError={(err) => setStep2Error(err)}
                                    parties={effectiveParties}
                                />

                                <PartyValidationWarningPopup
                                    partyValidationWarning={validationTriggered ? partyValidationWarning : null}
                                    onNavigateToField={(name) => pdfViewerRef.current?.navigateToField(name)}
                                />

                                <WrongPartyWarningDialog
                                    open={showWrongPartyWarning}
                                    title="Single Party Restriction"
                                    description={
                                        contractorPartyId
                                            ? <>You have already started filling <strong>{effectiveParties.find((p: any) => p.id === contractorPartyId)?.label || contractorPartyId}</strong> fields. You can only fill one party&apos;s fields.</>
                                            : <>You can only fill one party&apos;s fields.</>
                                    }
                                    pdfViewerRef={pdfViewerRef}
                                    navigateConfig={contractorPartyId ? { type: 'party', partyIds: [contractorPartyId] } : { type: 'party', partyIds: [] }}
                                    onClose={() => setShowWrongPartyWarning(false)}
                                    zIndex={1400}
                                />
                            </Box>
                        ) : (
                            <Box sx={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                <CircularProgress />
                            </Box>
                        )}
                    </Box>
                )}
            </BaseDialog>

            {/* Unsaved Changes Confirmation */}
            <ConfirmationDialog
                open={showUnsavedDialog}
                title="Save Changes"
                message="Do you want to save your changes before continuing?"
                onYes={handleUnsavedYes}
                onNo={handleUnsavedNo}
                onClose={() => { setShowUnsavedDialog(false); setPendingAction(null); }}
                loading={saving}
                disableYes={!canSave}
                yesTooltip={hasPartialParty ? 'Complete all fields for the party you started' : ''}
            />

            {/* Request Review Dialog */}
            {renewalId && (
                <RequestReviewDialog
                    open={reviewDialogOpen}
                    onClose={() => setReviewDialogOpen(false)}
                    contractId={renewalId}
                    contractTitle={renewalTitle}
                    onSubmit={async (reviewers, approver, reviewerMessage, approverMessage) => {
                        const currentUser = authService.getCurrentUser();
                        const result = await contractService.submitForReview(
                            renewalId,
                            reviewers,
                            approver,
                            reviewerMessage,
                            approverMessage,
                            currentUser?.email
                        );
                        if (result.success) {
                            setSnackbar({ open: true, message: result.message, severity: 'success' });
                            setReviewDialogOpen(false);
                            setTimeout(() => {
                                handleClose();
                                onSuccess?.(renewalId);
                                router.push('/draft');
                            }, 1000);
                        } else {
                            setSnackbar({ open: true, message: result.message, severity: 'error' });
                        }
                    }}
                />
            )}

            {/* Submit for Signature (single signer) */}
            <SubmitForSignatureDialog
                open={signatureDialogOpen}
                onClose={() => setSignatureDialogOpen(false)}
                contractTitle={renewalTitle}
                onSubmit={async (signerEmail) => {
                    if (!renewalId) return { success: false };
                    const result = await contractService.submitForSignature(renewalId, signerEmail);
                    if (result.success) {
                        setSnackbar({ open: true, message: 'Signature request sent', severity: 'success' });
                        setSignatureDialogOpen(false);
                        setTimeout(() => {
                            handleClose();
                            onSuccess?.(renewalId);
                            router.push('/contracts');
                        }, 1000);
                        return { success: true, signingUrl: result.signingUrl };
                    }
                    return { success: false };
                }}
            />

            {/* Multi-party Signature */}
            <MultiPartySignatureDialog
                open={multiPartyDialogOpen}
                onClose={() => setMultiPartyDialogOpen(false)}
                contractTitle={renewalTitle}
                parties={effectiveParties}
                formFields={renewalContract?.formFields}
                existingExternalSigners={renewalContract?.externalSigners}
                existingInternalSigners={renewalContract?.internalSigners}
                fieldValues={filledFieldValues}
                onSubmit={handleMixedSignatureSubmit}
            />

            {/* Autofill Party Selection Dialog */}
            <AutofillPartyDialog
                open={autofillPartyDialogOpen}
                onClose={() => setAutofillPartyDialogOpen(false)}
                onConfirm={(partyId) => {
                    setAutofillPartyDialogOpen(false);
                    handleAutofillConfirm(partyId);
                }}
                parties={effectiveParties}
                formFields={renewalContract?.formFields || []}
            />

            {/* Snackbar */}
            <NotificationSnackbar
                open={snackbar.open}
                message={snackbar.message}
                severity={snackbar.severity}
                onClose={() => setSnackbar(s => ({ ...s, open: false }))}
            />
        </LocalizationProvider>
    );
}
