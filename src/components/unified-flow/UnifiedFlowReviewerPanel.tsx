'use client';

import { useState, useEffect, useRef } from 'react';
import {
    Box, Typography, Alert, CircularProgress,
    LinearProgress, Stepper, Step, StepLabel, Tooltip,
} from '@mui/material';
import {
    CheckCircle, CheckCircleOutline, CancelOutlined, LockOutlined,
    TaskAlt, RefreshOutlined,
} from '@mui/icons-material';
import dynamic from 'next/dynamic';
import BaseDialog from '@/components/common/BaseDialog';
import AppButton from '@/components/common/AppButton';
import UnifiedFlowRejectDialog from './UnifiedFlowRejectDialog';
import { unifiedFlowService } from '@/services/unifiedFlowService';
import type { WorkflowParticipant, FlowUploadPart } from '@/types/unifiedFlow';

const DocumentViewerDialog = dynamic(() => import('@/components/viewer/DocumentViewerDialog'), {
    ssr: false,
});

type Phase = 'viewing' | 'uploading' | 'completing' | 'done' | 'error';

const CHUNK_SIZE = 10 * 1024 * 1024; // 10 MB

interface UnifiedFlowReviewerPanelProps {
    open: boolean;
    onClose: () => void;
    onActed: () => void;
    contractId: string;
    contractTitle?: string;
    participant: WorkflowParticipant;
    contractParties?: any[];
    flowFormFields?: any[];
    statusXfdf?: string;
}

export default function UnifiedFlowReviewerPanel({
    open,
    onClose,
    onActed,
    contractId,
    contractTitle,
    participant,
    contractParties,
    flowFormFields,
    statusXfdf,
}: UnifiedFlowReviewerPanelProps) {
    const [fileUrl, setFileUrl] = useState<string | null>(null);
    const [initialXfdf, setInitialXfdf] = useState<string | undefined>(undefined);
    const [loadingUrl, setLoadingUrl] = useState(false);
    const [urlError, setUrlError] = useState<string | null>(null);

    const [phase, setPhase] = useState<Phase>('viewing');
    const [phaseError, setPhaseError] = useState<string | null>(null);

    const [uploadProgress, setUploadProgress] = useState(0);
    const [uploadedParts, setUploadedParts] = useState(0);
    const [totalParts, setTotalParts] = useState(0);

    const [rejectOpen, setRejectOpen] = useState(false);
    const [actionError, setActionError] = useState<string | null>(null);

    // Cached viewer output (refs avoid async state-update race in handleMarkComplete)
    const cachedBlobRef = useRef<Blob | null>(null);
    const cachedXfdfRef = useRef<string>('');
    const cachedFieldValuesRef = useRef<Record<string, string>>({});
    const cachedFormFieldsRef = useRef<any[]>([]);

    // Exposed to DocumentViewerDialog so Mark Complete can trigger PDF export before uploading
    const viewerSaveRef = useRef<(() => Promise<void>) | null>(null);

    const isReadOnly = participant.status === 'completed' || participant.status === 'rejected';

    useEffect(() => {
        if (open) {
            loadFileUrl();
            setPhase('viewing');
            setPhaseError(null);
            setActionError(null);
            setUploadProgress(0);
            cachedBlobRef.current = null;
        }
    }, [open, contractId]);

    const loadFileUrl = async () => {
        setLoadingUrl(true);
        setUrlError(null);
        const res = await unifiedFlowService.getParticipantFileUrl(contractId);
        setLoadingUrl(false);
        if (res.ok && res.data?.url) {
            setFileUrl(res.data.url);
            setInitialXfdf(statusXfdf || res.data.xfdfData || undefined);
        } else {
            setUrlError(res.message || 'Failed to load contract PDF.');
        }
    };

    /** Called by viewer on export (Save button or via viewerSaveRef). Caches locally — no backend call. */
    const handleViewerSave = async (pdfBlob: Blob, xfdf: string, fieldValues?: Record<string, string>, formFields?: any[]) => {
        cachedBlobRef.current = pdfBlob;
        cachedXfdfRef.current = xfdf;
        cachedFieldValuesRef.current = fieldValues || {};
        cachedFormFieldsRef.current = formFields || [];
    };

    const handleMarkComplete = async () => {
        setActionError(null);

        // 1. Export current PDF state from the viewer (while viewer is still mounted)
        if (viewerSaveRef.current) {
            try { await viewerSaveRef.current(); } catch { /* fall through */ }
        }

        const blob = cachedBlobRef.current;
        if (!blob) {
            setActionError('Could not export the PDF. Please try saving first.');
            return;
        }

        // 2. Upload and complete (transitions out of 'viewing', unmounting the viewer)
        await handleUploadAndComplete(blob);
    };

    const handleUploadAndComplete = async (pdfBlob: Blob) => {
        setPhase('uploading');
        setPhaseError(null);

        let uploadId: string | null = null;

        try {
            const initiateRes = await unifiedFlowService.initiateFlowUpload(contractId);
            if (!initiateRes.ok || !initiateRes.data?.uploadId) {
                throw new Error(initiateRes.message || 'Failed to initiate upload.');
            }
            uploadId = initiateRes.data.uploadId;

            const chunks: Blob[] = [];
            let offset = 0;
            while (offset < pdfBlob.size) {
                chunks.push(pdfBlob.slice(offset, offset + CHUNK_SIZE));
                offset += CHUNK_SIZE;
            }
            setTotalParts(chunks.length);
            setUploadedParts(0);

            const parts: FlowUploadPart[] = [];
            for (let i = 0; i < chunks.length; i++) {
                const partNumber = i + 1;
                const presignRes = await unifiedFlowService.getFlowPresignedUrl(contractId, uploadId, partNumber);
                if (!presignRes.ok || !presignRes.data?.url) {
                    throw new Error(presignRes.message || `Failed to get upload URL for part ${partNumber}.`);
                }

                const putRes = await fetch(presignRes.data.url, {
                    method: 'PUT',
                    body: chunks[i],
                    headers: { 'Content-Type': 'application/pdf' },
                });
                if (!putRes.ok) throw new Error(`Failed to upload part ${partNumber} (HTTP ${putRes.status}).`);

                const etag = putRes.headers.get('ETag') || putRes.headers.get('etag') || `etag_${partNumber}`;
                parts.push({ partNumber, etag: etag.replace(/"/g, '') });
                setUploadedParts(partNumber);
                setUploadProgress(Math.round((partNumber / chunks.length) * 100));
            }

            setPhase('completing');
            const completeRes = await unifiedFlowService.markFlowComplete(contractId, {
                uploadId,
                parts,
                xfdfData: cachedXfdfRef.current || undefined,
                formFields: cachedFormFieldsRef.current,
                fieldValues: cachedFieldValuesRef.current,
            });

            if (!completeRes.ok) throw new Error(completeRes.message || 'Failed to mark review complete.');

            setPhase('done');
        } catch (err: any) {
            if (uploadId) {
                await unifiedFlowService.abortFlowUpload(contractId, uploadId).catch(() => {});
            }
            setPhaseError(err.message || 'An unexpected error occurred.');
            setPhase('error');
        }
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

    // ─── Toolbar (shown while in viewing phase) ───────────────────────────────
    const viewingToolbar = (
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap' }}>
            {actionError && (
                <Tooltip title={actionError} arrow>
                    <Typography variant="caption" color="error" sx={{ maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {actionError}
                    </Typography>
                </Tooltip>
            )}

            {!isReadOnly && (
                <>
                    <AppButton
                        size="small"
                        variant="contained"
                        startIcon={<CheckCircleOutline />}
                        onClick={handleMarkComplete}
                        sx={{ fontSize: '0.78rem', bgcolor: '#10b981', '&:hover': { bgcolor: '#059669' } }}
                    >
                        Mark Complete
                    </AppButton>

                    <AppButton
                        size="small"
                        variant="outlined"
                        color="error"
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
                        {participant.status === 'completed' ? 'You have completed this review' : 'You have rejected this contract'}
                    </Typography>
                </Box>
            )}
        </Box>
    );

    // ─── Upload / Done / Error overlay ───────────────────────────────────────
    const renderOverlay = () => {
        if (phase === 'viewing') return null;

        const steps = ['Uploading PDF', 'Finalising'];
        const activeStep = phase === 'uploading' ? 0 : 1;

        return (
            <BaseDialog
                open
                onClose={() => {}}
                title={phase === 'done' ? 'Review Complete' : phase === 'error' ? 'Upload Failed' : 'Saving Review'}
                maxWidth="sm"
                disableBackdropClick
            >
                <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2.5, py: 1 }}>
                    {(phase === 'uploading' || phase === 'completing') && (
                        <>
                            <Stepper activeStep={activeStep} alternativeLabel>
                                {steps.map((label) => (
                                    <Step key={label}><StepLabel>{label}</StepLabel></Step>
                                ))}
                            </Stepper>

                            <Box>
                                <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 0.75 }}>
                                    <Typography variant="body2" fontWeight={600}>
                                        {phase === 'uploading'
                                            ? `Uploading… ${uploadedParts} of ${totalParts} part${totalParts !== 1 ? 's' : ''}`
                                            : 'Finalising…'}
                                    </Typography>
                                    <Typography variant="body2" color="text.secondary">{uploadProgress}%</Typography>
                                </Box>
                                <LinearProgress
                                    variant="determinate"
                                    value={phase === 'completing' ? 100 : uploadProgress}
                                    sx={{ height: 8, borderRadius: 4, '& .MuiLinearProgress-bar': { bgcolor: '#10b981', borderRadius: 4 } }}
                                />
                            </Box>

                            {phase === 'completing' && (
                                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, justifyContent: 'center' }}>
                                    <CircularProgress size={16} sx={{ color: '#10b981' }} />
                                    <Typography variant="body2" color="text.secondary">Recording your review…</Typography>
                                </Box>
                            )}
                        </>
                    )}

                    {phase === 'done' && (
                        <Box sx={{ textAlign: 'center', py: 1 }}>
                            <CheckCircle sx={{ fontSize: 56, color: '#10b981', mb: 1 }} />
                            <Typography variant="h6" fontWeight={700} gutterBottom>Review Submitted</Typography>
                            <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
                                Your review and any field edits have been saved.
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
                            <Alert severity="error" sx={{ borderRadius: 2, mb: 2, textAlign: 'left' }}>{phaseError}</Alert>
                            <Box sx={{ display: 'flex', gap: 1, justifyContent: 'center', flexWrap: 'wrap' }}>
                                <AppButton variant="outlined" startIcon={<RefreshOutlined />} onClick={handleRetry}>
                                    Retry
                                </AppButton>
                                <AppButton
                                    variant="outlined"
                                    color="inherit"
                                    onClick={() => { setPhase('viewing'); setPhaseError(null); }}
                                >
                                    Back
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
            <BaseDialog open={open} onClose={onClose} title={contractTitle || 'Review Contract'} maxWidth="lg" noPadding>
                <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: 400 }}>
                    <CircularProgress />
                </Box>
            </BaseDialog>
        );
    }

    if (urlError) {
        return (
            <BaseDialog open={open} onClose={onClose} title={contractTitle || 'Review Contract'} maxWidth="sm">
                <Alert severity="error" action={<AppButton size="small" variant="outlined" onClick={loadFileUrl}>Retry</AppButton>}>
                    {urlError}
                </Alert>
            </BaseDialog>
        );
    }

    if (!fileUrl) return null;

    return (
        <>
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
                unifiedParticipantRole="REVIEWER"
                contractParties={contractParties}
                formFields={flowFormFields}
                initialXfdf={initialXfdf}
                saveRef={viewerSaveRef}
                hideSaveButton
            />

            {renderOverlay()}

            <UnifiedFlowRejectDialog
                open={rejectOpen}
                onClose={() => setRejectOpen(false)}
                onRejected={() => { setRejectOpen(false); onClose(); onActed(); }}
                contractId={contractId}
                contractTitle={contractTitle}
                role="REVIEWER"
            />
        </>
    );
}
