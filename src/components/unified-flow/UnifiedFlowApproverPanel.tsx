'use client';

import { useState, useEffect, useRef, useMemo } from 'react';
import {
    Box, Typography, Alert, CircularProgress,
    LinearProgress, Stepper, Step, StepLabel, Tooltip, useTheme,
} from '@mui/material';
import {
    CheckCircle, Create, LockOutlined,
    CancelOutlined, TaskAlt, RefreshOutlined,
} from '@mui/icons-material';
import { alpha } from '@mui/material/styles';
import dynamic from 'next/dynamic';
import BaseDialog from '@/components/common/BaseDialog';
import AppButton from '@/components/common/AppButton';
import UnifiedFlowRejectDialog from './UnifiedFlowRejectDialog';
import { unifiedFlowService } from '@/services/unifiedFlowService';
import { apiService } from '@/services/apiService';
import type { WorkflowParticipant, FlowUploadPart } from '@/types/unifiedFlow';
import type { PartyValidationEntry } from '@/components/viewer/pdfViewer/PartyValidationWarningPopup';

const DocumentViewerDialog = dynamic(() => import('@/components/viewer/DocumentViewerDialog'), {
    ssr: false,
});

// ─── Phase definitions ────────────────────────────────────────────────────────
type Phase = 'viewing' | 'uploading' | 'completing' | 'done' | 'error';

const CHUNK_SIZE = 10 * 1024 * 1024; // 10 MB

interface UnifiedFlowApproverPanelProps {
    open: boolean;
    onClose: () => void;
    onActed: () => void;
    contractId: string;
    contractTitle?: string;
    participant: WorkflowParticipant;
    contractParties?: any[]; // PartyConfiguration[] — INTERNAL parties editable, EXTERNAL read-only
    flowFormFields?: any[];  // formFields from flow status (name + assignedParty) — EXTERNAL field detection
    statusXfdf?: string;     // xfdfData from flow status — restores previously saved annotations
    /** True when external signers were registered at flow-submit time (Case B). Triggers internal-field gate on approve. */
    externalSigningIncluded?: boolean;
    /** Full list of all participants — used to determine if this approver is the last one in the flow. */
    allParticipants?: WorkflowParticipant[];
}

export default function UnifiedFlowApproverPanel({
    open,
    onClose,
    onActed,
    contractId,
    contractTitle,
    participant,
    contractParties,
    flowFormFields,
    statusXfdf,
    externalSigningIncluded,
    allParticipants,
}: UnifiedFlowApproverPanelProps) {
    const theme = useTheme();
    const isDark = theme.palette.mode === 'dark';

    // File URL loading
    const [fileUrl, setFileUrl] = useState<string | null>(null);
    const [initialXfdf, setInitialXfdf] = useState<string | undefined>(undefined);
    const [loadingUrl, setLoadingUrl] = useState(false);
    const [urlError, setUrlError] = useState<string | null>(null);

    // Phase state
    const [phase, setPhase] = useState<Phase>('viewing');
    const [phaseError, setPhaseError] = useState<string | null>(null);

    // Upload tracking
    const [uploadProgress, setUploadProgress] = useState(0); // 0-100
    const [uploadedParts, setUploadedParts] = useState(0);
    const [totalParts, setTotalParts] = useState(0);

    // Cached viewer data (refs avoid async state-update race in handleSignAndApprove)
    const cachedBlobRef = useRef<Blob | null>(null);
    const cachedXfdfRef = useRef<string>('');
    const cachedFieldValuesRef = useRef<Record<string, string>>({});
    const cachedFormFieldsRef = useRef<any[]>([]);

    // Exposed to DocumentViewerDialog so Sign & Approve can trigger PDF export before uploading
    const viewerSaveRef = useRef<(() => Promise<void>) | null>(null);

    // Reject dialog
    const [rejectOpen, setRejectOpen] = useState(false);
    const [actionError, setActionError] = useState<string | null>(null);

    // Internal-field gate: non-null when approver tried to submit with unfilled internal party fields
    const [internalFieldsWarning, setInternalFieldsWarning] = useState<PartyValidationEntry[] | null>(null);

    // Prevents double-click: true from button click until phase transitions away from 'viewing'
    const [submitting, setSubmitting] = useState(false);

    const isReadOnly = participant.status === 'completed' || participant.status === 'rejected';

    // True when this approver has the highest order among all APPROVER participants.
    // The internal-field gate only runs for the last approver because external signers are
    // triggered automatically right after the last approval completes.
    const isLastApprover = useMemo(() => {
        if (!allParticipants?.length) return true; // no info → assume last (safe: show gate rather than miss it)
        const approverOrders = allParticipants
            .filter((p) => p.role === 'APPROVER')
            .map((p) => p.order);
        if (approverOrders.length === 0) return true;
        return participant.order === Math.max(...approverOrders);
    }, [allParticipants, participant.order]);

    useEffect(() => {
        if (open) {
            loadFileUrl();
            setPhase('viewing');
            setPhaseError(null);
            cachedBlobRef.current = null;
            setUploadProgress(0);
            setActionError(null);
            setInternalFieldsWarning(null);
            setSubmitting(false);
        }
    }, [open, contractId]);

    const loadFileUrl = async () => {
        setLoadingUrl(true);
        setUrlError(null);
        const res = await unifiedFlowService.getParticipantFileUrl(contractId);
        setLoadingUrl(false);
        if (res.ok && res.data?.url) {
            setFileUrl(res.data.url);
            // If the backend served the _signed working copy, it already has ALL prior parties'
            // signatures and field values baked into the binary. Overlaying XFDF on top would wipe
            // baked ink signatures (e.g. the owner's "admin" mark) — so suppress it entirely.
            if (res.data.isSignedCopy) {
                setInitialXfdf(undefined);
                return;
            }
            // No working copy yet — this is the original .pdf, so restore field values from XFDF.
            // Fetch xfdfData from Spring Boot's contract endpoint directly.
            // getFlowStatus (statusXfdf) and getParticipantFileUrl (res.data.xfdfData) both return
            // the flow-level xfdf which may be stale from a previous participant's markFlowComplete.
            // GET /contracts/{id} returns the contract-level xfdfData, which is what the owner's
            // PATCH writes to before submitting the new flow — so this is always fresh.
            let xfdf: string | undefined;
            try {
                const contract = await apiService.getContractDetails(contractId);
                if (contract?.xfdfData) xfdf = contract.xfdfData;
            } catch (e) {
                console.warn('⚠️ [ApproverPanel] Could not fetch xfdfData from Spring Boot contract:', e);
            }
            if (!xfdf) {
                xfdf = statusXfdf || res.data.xfdfData || undefined;
            }
            setInitialXfdf(xfdf);
        } else {
            setUrlError(res.message || 'Failed to load contract PDF.');
        }
    };

    /** Called by viewer when the user saves/exports. Caches locally — no backend call until Sign & Approve. */
    const handleViewerSave = async (
        pdfBlob: Blob,
        xfdf: string,
        fieldValues?: Record<string, string>,
        formFields?: any[],
    ) => {
        cachedBlobRef.current = pdfBlob;
        cachedXfdfRef.current = xfdf;
        cachedFieldValuesRef.current = fieldValues || {};
        cachedFormFieldsRef.current = formFields || [];
    };

    /** Upload signed PDF via multipart upload, then mark complete. */
    const handleUploadAndComplete = async (pdfBlob: Blob) => {
        setPhase('uploading');
        setPhaseError(null);

        let uploadId: string | null = null;

        try {
            // Step 1: Initiate upload
            const initiateRes = await unifiedFlowService.initiateFlowUpload(contractId);
            if (!initiateRes.ok || !initiateRes.data?.uploadId) {
                throw new Error(initiateRes.message || 'Failed to initiate upload.');
            }
            uploadId = initiateRes.data.uploadId;

            // Step 2: Split into chunks
            const chunks: Blob[] = [];
            let offset = 0;
            while (offset < pdfBlob.size) {
                chunks.push(pdfBlob.slice(offset, offset + CHUNK_SIZE));
                offset += CHUNK_SIZE;
            }
            setTotalParts(chunks.length);
            setUploadedParts(0);

            // Step 3: Upload each chunk
            const parts: FlowUploadPart[] = [];
            for (let i = 0; i < chunks.length; i++) {
                const partNumber = i + 1;

                // Get presigned URL for this chunk
                const presignRes = await unifiedFlowService.getFlowPresignedUrl(contractId, uploadId, partNumber);
                if (!presignRes.ok || !presignRes.data?.url) {
                    throw new Error(presignRes.message || `Failed to get upload URL for part ${partNumber}.`);
                }

                // PUT chunk directly to MinIO (no auth header — presigned URL is self-authenticating)
                const putRes = await fetch(presignRes.data.url, {
                    method: 'PUT',
                    body: chunks[i],
                    headers: { 'Content-Type': 'application/pdf' },
                });

                if (!putRes.ok) {
                    throw new Error(`Failed to upload part ${partNumber} (HTTP ${putRes.status}).`);
                }

                const etag = putRes.headers.get('ETag') || putRes.headers.get('etag') || `etag_${partNumber}`;
                parts.push({ partNumber, etag: etag.replace(/"/g, '') });

                setUploadedParts(partNumber);
                setUploadProgress(Math.round((partNumber / chunks.length) * 100));
            }

            // Step 4: Mark complete
            setPhase('completing');
            const completeRes = await unifiedFlowService.markFlowComplete(contractId, {
                uploadId,
                parts,
                xfdfData: cachedXfdfRef.current || undefined,
                fieldValues: cachedFieldValuesRef.current,
                formFields: cachedFormFieldsRef.current,
            });

            if (!completeRes.ok) {
                throw new Error(completeRes.message || 'Failed to complete approval.');
            }

            setPhase('done');
        } catch (err: any) {
            // Abort upload on any failure
            if (uploadId) {
                await unifiedFlowService.abortFlowUpload(contractId, uploadId).catch(() => {});
            }
            setPhaseError(err.message || 'An unexpected error occurred.');
            setPhase('error');
        }
    };

    const handleSignAndApprove = async () => {
        setActionError(null);
        setInternalFieldsWarning(null);
        setSubmitting(true);

        // Export current PDF state from viewer before uploading
        if (viewerSaveRef.current) {
            try { await viewerSaveRef.current(); } catch { /* fall through */ }
        }
        const blob = cachedBlobRef.current;
        if (!blob) {
            setActionError('Could not export the PDF. Please try again.');
            setSubmitting(false);
            return;
        }

        // Gate: only the LAST approver needs all internal party fields filled, because external
        // signers are triggered automatically right after their submission.
        if (externalSigningIncluded && isLastApprover && flowFormFields?.length && contractParties?.length) {
            const internalPartyIds = new Set(
                (contractParties as any[])
                    .filter((p) => p.type !== 'EXTERNAL')
                    .map((p) => p.id as string),
            );
            const currentValues = cachedFieldValuesRef.current;

            // Group unfilled internal fields by their party
            const unfilledByParty = new Map<string, { party: any; missing: string[] }>();
            for (const field of (flowFormFields as any[])) {
                if (!field.assignedParty || !internalPartyIds.has(field.assignedParty)) continue;
                const val = currentValues[field.name];
                if (!val || String(val).trim() === '') {
                    if (!unfilledByParty.has(field.assignedParty)) {
                        const partyConfig = (contractParties as any[]).find((p) => p.id === field.assignedParty);
                        unfilledByParty.set(field.assignedParty, { party: partyConfig, missing: [] });
                    }
                    unfilledByParty.get(field.assignedParty)!.missing.push(field.name);
                }
            }

            if (unfilledByParty.size > 0) {
                const warning: PartyValidationEntry[] = Array.from(unfilledByParty.entries()).map(
                    ([partyId, { party, missing }]) => ({
                        party: party || { id: partyId, label: partyId, color: '#f59e0b' },
                        filled: (flowFormFields as any[]).filter((f) => f.assignedParty === partyId).length - missing.length,
                        total: (flowFormFields as any[]).filter((f) => f.assignedParty === partyId).length,
                        missing,
                    }),
                );
                setInternalFieldsWarning(warning);
                setSubmitting(false);
                return;
            }
        }

        handleUploadAndComplete(blob);
    };

    const handleRetry = () => {
        const blob = cachedBlobRef.current;
        if (blob) {
            setUploadProgress(0);
            setUploadedParts(0);
            handleUploadAndComplete(blob);
        }
    };

    const handleDoneClose = () => {
        onClose();
        onActed();
    };

    // ─── Toolbar for viewing phase ─────────────────────────────────────────────
    const viewingToolbar = (
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap' }}>
            {actionError && (
                <Tooltip title={actionError} arrow>
                    <Typography variant="caption" color="error" sx={{ maxWidth: 160, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {actionError}
                    </Typography>
                </Tooltip>
            )}
            {!isReadOnly && (
                <>
                    <AppButton
                        size="small"
                        variant="contained"
                        loading={submitting}
                        startIcon={<Create />}
                        onClick={handleSignAndApprove}
                        sx={{ fontSize: '0.78rem', bgcolor: '#10b981', '&:hover': { bgcolor: '#059669' } }}
                    >
                        Sign & Approve
                    </AppButton>
                    <AppButton
                        size="small"
                        variant="outlined"
                        color="error"
                        disabled={submitting}
                        startIcon={<CancelOutlined />}
                        onClick={() => setRejectOpen(true)}
                        sx={{ fontSize: '0.78rem' }}
                    >
                        Reject
                    </AppButton>
                </>
            )}
            {isReadOnly && (
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                    <LockOutlined sx={{ fontSize: 14, color: 'text.secondary' }} />
                    <Typography variant="caption" color="text.secondary">
                        {participant.status === 'completed' ? 'You have approved this contract' : 'You have rejected this contract'}
                    </Typography>
                </Box>
            )}
        </Box>
    );

    // ─── Upload / Done / Error overlay ───────────────────────────────────────
    const renderOverlay = () => {
        if (phase === 'viewing') return null;

        const steps = ['Uploading PDF', 'Finalising'];
        const activeStep = phase === 'uploading' ? 0 : phase === 'completing' ? 1 : 2;

        const canClose = phase === 'done' || phase === 'error';

        return (
            <BaseDialog
                open
                onClose={canClose ? handleDoneClose : () => {}}
                title={phase === 'done' ? 'Approval Complete' : phase === 'error' ? 'Upload Failed' : 'Uploading Signed PDF'}
                maxWidth="sm"
                disableBackdropClick={!canClose}
            >
                <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2.5, py: 1 }}>
                    {(phase === 'uploading' || phase === 'completing') && (
                        <>
                            <Stepper activeStep={activeStep} alternativeLabel>
                                {steps.map((label) => (
                                    <Step key={label}>
                                        <StepLabel>{label}</StepLabel>
                                    </Step>
                                ))}
                            </Stepper>

                            <Box>
                                <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 0.75 }}>
                                    <Typography variant="body2" fontWeight={600}>
                                        {phase === 'uploading'
                                            ? `Uploading… ${uploadedParts} of ${totalParts} part${totalParts !== 1 ? 's' : ''}`
                                            : 'Finalising approval…'}
                                    </Typography>
                                    <Typography variant="body2" color="text.secondary">
                                        {uploadProgress}%
                                    </Typography>
                                </Box>
                                <LinearProgress
                                    variant="determinate"
                                    value={phase === 'completing' ? 100 : uploadProgress}
                                    sx={{
                                        height: 8,
                                        borderRadius: 4,
                                        bgcolor: isDark ? alpha('#10b981', 0.15) : '#d1fae5',
                                        '& .MuiLinearProgress-bar': { bgcolor: '#10b981', borderRadius: 4 },
                                    }}
                                />
                            </Box>

                            {phase === 'completing' && (
                                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, justifyContent: 'center' }}>
                                    <CircularProgress size={16} sx={{ color: '#10b981' }} />
                                    <Typography variant="body2" color="text.secondary">
                                        Recording your approval…
                                    </Typography>
                                </Box>
                            )}
                        </>
                    )}

                    {phase === 'done' && (
                        <Box sx={{ textAlign: 'center', py: 1 }}>
                            <CheckCircle sx={{ fontSize: 56, color: '#10b981', mb: 1 }} />
                            <Typography variant="h6" fontWeight={700} gutterBottom>
                                Contract Approved
                            </Typography>
                            <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
                                Your signed PDF has been saved and the owner has been notified.
                            </Typography>
                            <AppButton
                                variant="contained"
                                startIcon={<TaskAlt />}
                                onClick={handleDoneClose}
                                sx={{ bgcolor: '#10b981', '&:hover': { bgcolor: '#059669' } }}
                            >
                                Done
                            </AppButton>
                        </Box>
                    )}

                    {phase === 'error' && (
                        <Box sx={{ textAlign: 'center', py: 1 }}>
                            <Alert severity="error" sx={{ borderRadius: 2, mb: 2, textAlign: 'left' }}>
                                {phaseError}
                            </Alert>
                            <Box sx={{ display: 'flex', gap: 1, justifyContent: 'center', flexWrap: 'wrap' }}>
                                <AppButton
                                    variant="outlined"
                                    startIcon={<RefreshOutlined />}
                                    onClick={handleRetry}
                                >
                                    Retry Upload
                                </AppButton>
                                <AppButton
                                    variant="outlined"
                                    color="inherit"
                                    onClick={() => { setPhase('viewing'); setPhaseError(null); setSubmitting(false); }}
                                >
                                    Back to Contract
                                </AppButton>
                            </Box>
                        </Box>
                    )}
                </Box>
            </BaseDialog>
        );
    };

    if (loadingUrl) {
        return (
            <BaseDialog open={open} onClose={onClose} title={contractTitle || 'Review & Approve'} maxWidth="lg" noPadding>
                <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: 400 }}>
                    <CircularProgress />
                </Box>
            </BaseDialog>
        );
    }

    if (urlError) {
        return (
            <BaseDialog open={open} onClose={onClose} title={contractTitle || 'Review & Approve'} maxWidth="sm">
                <Alert severity="error" action={<AppButton size="small" variant="outlined" onClick={loadFileUrl}>Retry</AppButton>}>
                    {urlError}
                </Alert>
            </BaseDialog>
        );
    }

    if (!fileUrl) return null;

    return (
        <>
            {/* Primary PDF viewer — always mounted while panel is open */}
            <DocumentViewerDialog
                open={open && phase === 'viewing'}
                onClose={onClose}
                fileUrl={fileUrl}
                title={contractTitle}
                readOnly={isReadOnly}
                editableFieldMode={isReadOnly ? 'none' : 'all'}
                canAddFormFields={false}
                showAnnotationNavigation={!isReadOnly}
                onSave={isReadOnly ? undefined : handleViewerSave}
                extraActions={viewingToolbar}
                unifiedParticipantRole="APPROVER"
                contractParties={contractParties}
                formFields={flowFormFields}
                // In read-only mode the viewer loads the _signed.pdf which already has ink signatures
                // baked into its appearance streams. Passing XFDF here would replace those baked-in
                // appearances with plain text values — the same bug that was fixed on the contract
                // detail page. Skip the overlay entirely for completed/rejected participants.
                initialXfdf={isReadOnly ? undefined : initialXfdf}
                saveRef={viewerSaveRef}
                hideSaveButton
                externalWarning={internalFieldsWarning}
            />

            {/* Upload / Done / Error overlay dialogs */}
            {renderOverlay()}

            {/* Reject dialog */}
            <UnifiedFlowRejectDialog
                open={rejectOpen}
                onClose={() => setRejectOpen(false)}
                onRejected={() => { setRejectOpen(false); onClose(); onActed(); }}
                contractId={contractId}
                contractTitle={contractTitle}
                role="APPROVER"
            />
        </>
    );
}
