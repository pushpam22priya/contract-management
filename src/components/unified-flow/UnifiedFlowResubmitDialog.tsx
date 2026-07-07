'use client';

import { useState, useEffect, useMemo } from 'react';
import {
    Box, Typography, Chip, Alert, Autocomplete, TextField,
    Paper, Divider, Switch, FormControlLabel, IconButton, Tooltip,
    useTheme, CircularProgress,
} from '@mui/material';
import {
    Add, Delete, DragIndicator, RateReview, ThumbUp,
    LockOutlined, WarningAmber, SendOutlined, Person,
    DriveFileRenameOutline, AutoAwesome,
} from '@mui/icons-material';
import { alpha } from '@mui/material/styles';
import BaseDialog from '@/components/common/BaseDialog';
import AppButton from '@/components/common/AppButton';
import { userService, User } from '@/services/userService';
import { authService } from '@/services/authService';
import { unifiedFlowService } from '@/services/unifiedFlowService';
import type {
    ParticipantAssignment,
    ExternalSignerSubmitInput,
    WorkflowParticipant,
} from '@/types/unifiedFlow';

interface UnifiedFlowResubmitDialogProps {
    open: boolean;
    onClose: () => void;
    onSubmitted: () => void;
    contractId: string;
    contractTitle?: string;
}

let _rsctr = 0;
const uid = () => `rs_${++_rsctr}`;

interface ParticipantRow {
    _id: string;
    email: string;
    name: string;
    role: 'REVIEWER' | 'APPROVER';
}

interface SignerRow {
    _id: string;
    email: string;
    name: string;
    partyId?: string;
    partyLabel?: string;
}

const isValidEmail = (v: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v);

function reorder<T extends { _id: string }>(arr: T[], fromId: string, toId: string): T[] {
    const from = arr.findIndex(r => r._id === fromId);
    const to = arr.findIndex(r => r._id === toId);
    if (from < 0 || to < 0 || from === to) return arr;
    const next = [...arr];
    const [item] = next.splice(from, 1);
    next.splice(to, 0, item);
    return next;
}

export default function UnifiedFlowResubmitDialog({
    open,
    onClose,
    onSubmitted,
    contractId,
    contractTitle,
}: UnifiedFlowResubmitDialogProps) {
    const theme = useTheme();
    const isDark = theme.palette.mode === 'dark';
    const currentUser = authService.getCurrentUser();

    // Flow status
    const [loadingStatus, setLoadingStatus] = useState(false);
    const [participants, setParticipants] = useState<WorkflowParticipant[]>([]);
    const [externalPartiesFromStatus, setExternalPartiesFromStatus] = useState<Array<{ id: string; label: string; order: number }>>([]);

    // Rejection info
    const rejectedParticipant = useMemo(() => participants.find(p => p.status === 'rejected'), [participants]);
    const isApproverRejection = rejectedParticipant?.role === 'APPROVER';
    const preservedReviewers = useMemo(
        () => isApproverRejection ? participants.filter(p => p.role === 'REVIEWER' && p.status === 'completed').sort((a, b) => a.order - b.order) : [],
        [participants, isApproverRejection],
    );

    // Participant rows
    const [reviewerRows, setReviewerRows] = useState<ParticipantRow[]>([]);
    const [approverRows, setApproverRows] = useState<ParticipantRow[]>([]);

    // Drag state
    const [dragging, setDragging] = useState<{ id: string; group: 'reviewer' | 'approver' | 'signer' } | null>(null);
    const [dragOverId, setDragOverId] = useState<string | null>(null);

    // Users for autocomplete
    const [users, setUsers] = useState<User[]>([]);
    const [loadingUsers, setLoadingUsers] = useState(false);

    // External signing
    const [externalSigningEnabled, setExternalSigningEnabled] = useState(false);
    const [signerRows, setSignerRows] = useState<SignerRow[]>([]);
    const [senderName, setSenderName] = useState('');

    // Submit
    const [submitting, setSubmitting] = useState(false);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        if (!open) return;
        setError(null);
        setParticipants([]);
        setExternalPartiesFromStatus([]);
        setLoadingStatus(true);
        setLoadingUsers(true);

        Promise.all([
            unifiedFlowService.getFlowStatus(contractId),
            userService.getAllUsers(),
        ]).then(([statusRes, allUsers]) => {
            setUsers(allUsers);
            setLoadingUsers(false);

            if (statusRes.ok && statusRes.data) {
                const ps = statusRes.data.participants ?? [];
                setParticipants(ps);

                // External parties
                const extParties = (statusRes.data.parties ?? [])
                    .filter(p => p.type === 'EXTERNAL')
                    .map(p => ({ id: p.id, label: p.label, order: p.order }));
                setExternalPartiesFromStatus(extParties);

                // Pre-populate external signing from stored data
                const extIncluded = statusRes.data.externalSigningIncluded ?? false;
                setExternalSigningEnabled(extIncluded);
                if (extIncluded && statusRes.data.externalSigners?.length) {
                    setSignerRows(statusRes.data.externalSigners.map(s => ({
                        _id: uid(),
                        email: s.email,
                        name: s.name ?? '',
                        partyId: s.partyId,
                        partyLabel: s.partyLabel,
                    })));
                } else if (extIncluded) {
                    setSignerRows([{ _id: uid(), email: '', name: '', partyId: extParties[0]?.id, partyLabel: extParties[0]?.label }]);
                } else {
                    setSignerRows([]);
                }
            }
            setLoadingStatus(false);

            // Seed empty rows for the case we're in
            const rejected = statusRes.ok ? statusRes.data?.participants?.find(p => p.status === 'rejected') : undefined;
            const isApprover = rejected?.role === 'APPROVER';
            if (isApprover) {
                // Case B: approver rejected → only approver rows
                setReviewerRows([]);
                setApproverRows([{ _id: uid(), email: '', name: '', role: 'APPROVER' }]);
            } else {
                // Case A: reviewer rejected (or unknown) → full reset
                setReviewerRows([{ _id: uid(), email: '', name: '', role: 'REVIEWER' }]);
                setApproverRows([{ _id: uid(), email: '', name: '', role: 'APPROVER' }]);
            }
        });
    }, [open, contractId]);

    const usedEmails = [...reviewerRows, ...approverRows].map(r => r.email).filter(Boolean);

    const availableUsers = (excludeEmail?: string) =>
        users.filter(u => {
            if (currentUser && u.email === currentUser.email) return false;
            const preserved = preservedReviewers.map(r => r.email);
            if (preserved.includes(u.email)) return false;
            if (!excludeEmail && usedEmails.includes(u.email)) return false;
            if (excludeEmail && usedEmails.filter(e => e !== excludeEmail).includes(u.email)) return false;
            return true;
        });

    const updateParticipantRow = (id: string, patch: Partial<ParticipantRow>) => {
        setReviewerRows(prev => prev.map(r => r._id === id ? { ...r, ...patch } : r));
        setApproverRows(prev => prev.map(r => r._id === id ? { ...r, ...patch } : r));
    };

    const removeParticipantRow = (id: string) => {
        setReviewerRows(prev => prev.filter(r => r._id !== id));
        setApproverRows(prev => prev.filter(r => r._id !== id));
    };

    const handleExternalToggle = (checked: boolean) => {
        setExternalSigningEnabled(checked);
        if (checked && signerRows.length === 0) {
            setSignerRows([{
                _id: uid(), email: '', name: '',
                partyId: externalPartiesFromStatus[0]?.id,
                partyLabel: externalPartiesFromStatus[0]?.label,
            }]);
        }
    };

    const updateSignerRow = (id: string, patch: Partial<SignerRow>) => {
        setSignerRows(prev => prev.map(s => s._id === id ? { ...s, ...patch } : s));
    };

    const removeSignerRow = (id: string) => {
        setSignerRows(prev => prev.filter(s => s._id !== id));
    };

    const validate = (): string | null => {
        if (approverRows.length === 0) return 'At least one Approver is required.';

        const allRows = isApproverRejection ? approverRows : [...reviewerRows, ...approverRows];
        for (const r of allRows) {
            if (!r.email.trim()) return 'All participants must have an email address.';
            if (!isValidEmail(r.email.trim())) return `"${r.email}" is not a valid email.`;
        }
        const emails = allRows.map(r => r.email.toLowerCase().trim());
        if (new Set(emails).size !== emails.length) return 'Duplicate participant emails are not allowed.';
        if (currentUser && emails.includes(currentUser.email.toLowerCase()))
            return 'You cannot add yourself as a participant.';

        if (externalSigningEnabled) {
            if (signerRows.length === 0)
                return 'Add at least one external signer when client signing is enabled.';
            for (const s of signerRows) {
                if (!s.email.trim()) return 'All external signers must have an email.';
                if (!isValidEmail(s.email.trim())) return `"${s.email}" is not a valid email.`;
                if (externalPartiesFromStatus.length > 0 && !s.partyId)
                    return `Select a party for signer "${s.email || 'unknown'}".`;
            }
            const signerEmails = signerRows.map(s => s.email.toLowerCase().trim());
            if (new Set(signerEmails).size !== signerEmails.length)
                return 'Duplicate external signer emails are not allowed.';
        }

        return null;
    };

    const handleSubmit = async () => {
        setError(null);
        const err = validate();
        if (err) { setError(err); return; }

        setSubmitting(true);

        let assignments: ParticipantAssignment[];

        if (isApproverRejection) {
            // Case B: pass ONLY new approvers; backend preserves completed reviewers
            const maxReviewerOrder = preservedReviewers.length > 0
                ? Math.max(...preservedReviewers.map(r => r.order))
                : 0;
            assignments = approverRows.map((r, i) => ({
                email: r.email.trim(),
                name: r.name.trim() || undefined,
                role: 'APPROVER' as const,
                order: maxReviewerOrder + i + 1,
            }));
        } else {
            // Case A: full reset — all new reviewers + approvers
            assignments = [
                ...reviewerRows.map((r, i) => ({
                    email: r.email.trim(),
                    name: r.name.trim() || undefined,
                    role: 'REVIEWER' as const,
                    order: i + 1,
                })),
                ...approverRows.map((r, i) => ({
                    email: r.email.trim(),
                    name: r.name.trim() || undefined,
                    role: 'APPROVER' as const,
                    order: reviewerRows.length + i + 1,
                })),
            ];
        }

        const signers: ExternalSignerSubmitInput[] | undefined = externalSigningEnabled
            ? signerRows.map((s, i) => ({
                email: s.email.trim(),
                name: s.name.trim() || undefined,
                order: i + 1,
                ...(s.partyId ? { partyId: s.partyId, partyLabel: s.partyLabel } : {}),
            }))
            : undefined;

        const res = await unifiedFlowService.submitFlow(
            contractId,
            assignments,
            externalSigningEnabled,
            signers,
            senderName.trim() || currentUser?.fullName || currentUser?.email,
        );
        setSubmitting(false);

        if (res.ok) {
            handleClose();
            onSubmitted();
        } else {
            setError(res.message || 'Failed to resubmit. Please try again.');
        }
    };

    const handleClose = () => {
        if (submitting) return;
        setParticipants([]);
        setReviewerRows([]);
        setApproverRows([]);
        setSignerRows([]);
        setError(null);
        onClose();
    };

    const sectionBg = isDark ? alpha('#ffffff', 0.03) : '#f8fafc';
    const sectionBorder = isDark ? alpha('#ffffff', 0.08) : '#e2e8f0';

    const renderParticipantSection = (
        role: 'REVIEWER' | 'APPROVER',
        rows: ParticipantRow[],
        setRows: React.Dispatch<React.SetStateAction<ParticipantRow[]>>,
        orderOffset: number,
    ) => {
        const isReviewer = role === 'REVIEWER';
        const accentColor = isReviewer ? '#3b82f6' : '#10b981';
        const Icon = isReviewer ? RateReview : ThumbUp;
        const label = isReviewer ? 'Reviewers' : 'Approvers';
        const subtext = isReviewer ? 'Can review & edit organisation fields.' : 'Can sign the PDF and approve the contract.';
        const group: 'reviewer' | 'approver' = isReviewer ? 'reviewer' : 'approver';

        return (
            <Paper elevation={0} sx={{ bgcolor: sectionBg, border: `1px solid ${sectionBorder}`, borderRadius: 2, overflow: 'hidden' }}>
                <Box sx={{ px: 1.5, py: 1, display: 'flex', alignItems: 'center', gap: 1, borderBottom: `1px solid ${sectionBorder}`, bgcolor: isDark ? alpha(accentColor, 0.08) : alpha(accentColor, 0.05) }}>
                    <Icon sx={{ fontSize: 16, color: accentColor }} />
                    <Box sx={{ flex: 1 }}>
                        <Typography variant="subtitle2" fontWeight={700} sx={{ color: accentColor }}>{label}</Typography>
                        <Typography variant="caption" color="text.secondary">{subtext}</Typography>
                    </Box>
                    <Chip label={rows.length} size="small" sx={{ height: 18, fontSize: '0.65rem', fontWeight: 700, bgcolor: alpha(accentColor, 0.15), color: accentColor }} />
                </Box>
                <Box sx={{ p: 1, display: 'flex', flexDirection: 'column', gap: 0.75 }}>
                    {rows.length === 0 && (
                        <Typography variant="caption" color="text.disabled" sx={{ textAlign: 'center', py: 1 }}>No {label.toLowerCase()} added yet</Typography>
                    )}
                    {rows.map((row, idx) => {
                        const order = orderOffset + idx + 1;
                        const isDraggingThis = dragging?.id === row._id;
                        const isDragTarget = dragOverId === row._id && dragging?.group === group && !isDraggingThis;
                        return (
                            <Box
                                key={row._id}
                                draggable
                                onDragStart={e => { setDragging({ id: row._id, group }); e.dataTransfer.effectAllowed = 'move'; }}
                                onDragOver={e => { e.preventDefault(); if (dragging?.group !== group) return; e.dataTransfer.dropEffect = 'move'; if (dragOverId !== row._id) setDragOverId(row._id); }}
                                onDrop={e => { e.preventDefault(); if (!dragging || dragging.group !== group) return; setRows(prev => reorder(prev, dragging.id, row._id)); setDragging(null); setDragOverId(null); }}
                                onDragEnd={() => { setDragging(null); setDragOverId(null); }}
                                sx={{
                                    display: 'flex', alignItems: 'center', gap: 1,
                                    p: 1, borderRadius: 1.5,
                                    bgcolor: 'background.paper',
                                    border: '1px solid',
                                    borderColor: isDragTarget ? accentColor : 'divider',
                                    cursor: isDraggingThis ? 'grabbing' : 'grab',
                                    opacity: isDraggingThis ? 0.4 : 1,
                                    boxShadow: isDragTarget ? `0 0 0 2px ${alpha(accentColor, 0.25)}` : 'none',
                                    transition: 'border-color 0.1s, box-shadow 0.1s, opacity 0.15s',
                                    userSelect: 'none',
                                }}
                            >
                                <Box sx={{ minWidth: 22, height: 22, borderRadius: '50%', bgcolor: alpha(accentColor, 0.12), display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                                    <Typography variant="caption" fontWeight={700} sx={{ fontSize: '0.62rem', color: accentColor }}>{order}</Typography>
                                </Box>
                                <DragIndicator sx={{ fontSize: 18, color: 'text.disabled', flexShrink: 0 }} />
                                <Autocomplete
                                    options={availableUsers(row.email)}
                                    getOptionLabel={u => typeof u === 'string' ? u : `${u.name || ''} (${u.email})`}
                                    value={users.find(u => u.email === row.email) || null}
                                    onChange={(_, val) => {
                                        if (val && typeof val !== 'string') {
                                            updateParticipantRow(row._id, { email: val.email, name: val.name ?? '' });
                                        } else {
                                            updateParticipantRow(row._id, { email: '', name: '' });
                                        }
                                    }}
                                    loading={loadingUsers}
                                    size="small"
                                    sx={{ flex: 1, minWidth: 0 }}
                                    renderInput={params => (
                                        <TextField
                                            {...params}
                                            placeholder="Search user…"
                                            size="small"
                                            sx={{ '& .MuiOutlinedInput-root': { fontSize: '0.82rem' } }}
                                        />
                                    )}
                                    freeSolo
                                    onInputChange={(_, val, reason) => {
                                        if (reason === 'input') updateParticipantRow(row._id, { email: val });
                                    }}
                                />
                                <Tooltip title="Remove">
                                    <span>
                                        <IconButton
                                            size="small"
                                            onClick={() => removeParticipantRow(row._id)}
                                            disabled={rows.length === 1}
                                            sx={{ color: 'error.main', p: 0.5 }}
                                        >
                                            <Delete sx={{ fontSize: 16 }} />
                                        </IconButton>
                                    </span>
                                </Tooltip>
                            </Box>
                        );
                    })}
                    <AppButton
                        variant="outlined"
                        size="small"
                        startIcon={<Add />}
                        onClick={() => setRows(prev => [...prev, { _id: uid(), email: '', name: '', role }])}
                        sx={{ mt: 0.25, borderColor: alpha(accentColor, 0.4), color: accentColor, '&:hover': { borderColor: accentColor, bgcolor: alpha(accentColor, 0.06) } }}
                    >
                        Add {isReviewer ? 'Reviewer' : 'Approver'}
                    </AppButton>
                </Box>
            </Paper>
        );
    };

    const renderSignerSection = () => (
        <Paper elevation={0} sx={{ bgcolor: sectionBg, border: `1px solid ${isDark ? alpha('#f59e0b', 0.3) : '#fde68a'}`, borderRadius: 2, overflow: 'hidden' }}>
            <Box sx={{ px: 1.5, py: 1, display: 'flex', alignItems: 'center', gap: 1, borderBottom: `1px solid ${sectionBorder}`, bgcolor: isDark ? alpha('#f59e0b', 0.08) : '#fffbeb' }}>
                <DriveFileRenameOutline sx={{ fontSize: 16, color: '#f59e0b' }} />
                <Box sx={{ flex: 1 }}>
                    <Typography variant="subtitle2" fontWeight={700} sx={{ color: isDark ? '#fcd34d' : '#92400e' }}>External Client Signers</Typography>
                    <Typography variant="caption" color="text.secondary">Emails sent automatically after all approvers complete</Typography>
                </Box>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                    <AutoAwesome sx={{ fontSize: 12, color: '#f59e0b' }} />
                    <Typography variant="caption" sx={{ color: '#f59e0b', fontWeight: 600 }}>Auto</Typography>
                </Box>
            </Box>
            <Box sx={{ p: 1, display: 'flex', flexDirection: 'column', gap: 0.75 }}>
                {signerRows.map((row, idx) => {
                    const isDraggingThis = dragging?.id === row._id;
                    const isDragTarget = dragOverId === row._id && dragging?.group === 'signer' && !isDraggingThis;
                    return (
                        <Box
                            key={row._id}
                            draggable
                            onDragStart={e => { setDragging({ id: row._id, group: 'signer' }); e.dataTransfer.effectAllowed = 'move'; }}
                            onDragOver={e => { e.preventDefault(); if (dragging?.group !== 'signer') return; e.dataTransfer.dropEffect = 'move'; if (dragOverId !== row._id) setDragOverId(row._id); }}
                            onDrop={e => { e.preventDefault(); if (!dragging || dragging.group !== 'signer') return; setSignerRows(prev => reorder(prev, dragging.id, row._id)); setDragging(null); setDragOverId(null); }}
                            onDragEnd={() => { setDragging(null); setDragOverId(null); }}
                            sx={{
                                display: 'flex', alignItems: 'center', gap: 1, p: 1, borderRadius: 1.5,
                                bgcolor: 'background.paper', border: '1px solid',
                                borderColor: isDragTarget ? '#f59e0b' : 'divider',
                                cursor: isDraggingThis ? 'grabbing' : 'grab',
                                opacity: isDraggingThis ? 0.4 : 1,
                                boxShadow: isDragTarget ? `0 0 0 2px ${alpha('#f59e0b', 0.25)}` : 'none',
                                userSelect: 'none',
                            }}
                        >
                            <Box sx={{ minWidth: 22, height: 22, borderRadius: '50%', bgcolor: alpha('#f59e0b', 0.12), display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                                <Typography variant="caption" fontWeight={700} sx={{ fontSize: '0.62rem', color: '#f59e0b' }}>{idx + 1}</Typography>
                            </Box>
                            <DragIndicator sx={{ fontSize: 18, color: 'text.disabled', flexShrink: 0 }} />
                            <TextField
                                placeholder="Email *"
                                size="small"
                                value={row.email}
                                onChange={e => updateSignerRow(row._id, { email: e.target.value })}
                                sx={{ flex: 1, '& .MuiOutlinedInput-root': { fontSize: '0.82rem' } }}
                            />
                            <TextField
                                placeholder="Name"
                                size="small"
                                value={row.name}
                                onChange={e => updateSignerRow(row._id, { name: e.target.value })}
                                sx={{ flex: 1, '& .MuiOutlinedInput-root': { fontSize: '0.82rem' } }}
                            />
                            {externalPartiesFromStatus.length > 1 && (
                                <Autocomplete
                                    options={externalPartiesFromStatus}
                                    getOptionLabel={p => p.label}
                                    value={externalPartiesFromStatus.find(p => p.id === row.partyId) || null}
                                    onChange={(_, val) => updateSignerRow(row._id, { partyId: val?.id, partyLabel: val?.label })}
                                    size="small"
                                    sx={{ width: 130, '& .MuiOutlinedInput-root': { fontSize: '0.82rem' } }}
                                    renderInput={params => <TextField {...params} placeholder="Party" size="small" />}
                                />
                            )}
                            {externalPartiesFromStatus.length === 1 && row.partyLabel && (
                                <Chip label={row.partyLabel} size="small" sx={{ bgcolor: alpha('#f59e0b', 0.12), color: '#f59e0b', fontSize: '0.65rem' }} />
                            )}
                            <Tooltip title="Remove">
                                <span>
                                    <IconButton
                                        size="small"
                                        onClick={() => removeSignerRow(row._id)}
                                        disabled={signerRows.length === 1}
                                        sx={{ color: 'error.main', p: 0.5 }}
                                    >
                                        <Delete sx={{ fontSize: 16 }} />
                                    </IconButton>
                                </span>
                            </Tooltip>
                        </Box>
                    );
                })}
                <AppButton
                    variant="outlined"
                    size="small"
                    startIcon={<Add />}
                    onClick={() => setSignerRows(prev => [...prev, {
                        _id: uid(), email: '', name: '',
                        partyId: externalPartiesFromStatus.length === 1 ? externalPartiesFromStatus[0].id : undefined,
                        partyLabel: externalPartiesFromStatus.length === 1 ? externalPartiesFromStatus[0].label : undefined,
                    }])}
                    sx={{ mt: 0.25, borderColor: alpha('#f59e0b', 0.4), color: '#f59e0b', '&:hover': { borderColor: '#f59e0b', bgcolor: alpha('#f59e0b', 0.06) } }}
                >
                    Add Signer
                </AppButton>

                {/* Optional sender name */}
                <Box sx={{ mt: 0.5 }}>
                    <TextField
                        fullWidth
                        size="small"
                        label="Sender name (shown in signature emails)"
                        placeholder="e.g. Priya from CostaCloud"
                        value={senderName}
                        onChange={e => setSenderName(e.target.value)}
                        sx={{ '& .MuiOutlinedInput-root': { fontSize: '0.82rem' } }}
                    />
                </Box>
            </Box>
        </Paper>
    );

    return (
        <BaseDialog
            open={open}
            onClose={handleClose}
            title="RESUBMIT CONTRACT"
            maxWidth="md"
            disableBackdropClick={submitting}
            actions={
                <>
                    <AppButton variant="outlined" onClick={handleClose} disabled={submitting}>
                        Cancel
                    </AppButton>
                    <AppButton
                        variant="contained"
                        loading={submitting}
                        startIcon={<SendOutlined />}
                        onClick={handleSubmit}
                        disabled={loadingStatus}
                        sx={{ fontWeight: 600, px: 3 }}
                    >
                        {submitting ? 'Resubmitting…' : 'Resubmit'}
                    </AppButton>
                </>
            }
        >
            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>

                {/* Contract title */}
                {contractTitle && (
                    <Box sx={{ p: 1, borderRadius: 1.5, bgcolor: isDark ? alpha('#ffffff', 0.04) : '#f8fafc', border: '1px solid', borderColor: 'divider' }}>
                        <Typography variant="body2" color="text.secondary">
                            Contract: <strong>{contractTitle}</strong>
                        </Typography>
                    </Box>
                )}

                {/* Loading spinner */}
                {loadingStatus && (
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, py: 1 }}>
                        <CircularProgress size={16} />
                        <Typography variant="caption" color="text.secondary">Loading contract status…</Typography>
                    </Box>
                )}

                {/* Rejection banner */}
                {!loadingStatus && rejectedParticipant && (
                    <Alert
                        severity="error"
                        icon={<WarningAmber fontSize="inherit" />}
                        sx={{ borderRadius: 2, '& .MuiAlert-message': { width: '100%' } }}
                    >
                        <Typography variant="body2" fontWeight={700}>
                            Rejected by {isApproverRejection ? 'Approver' : 'Reviewer'}: {rejectedParticipant.name || rejectedParticipant.email}
                        </Typography>
                        {rejectedParticipant.comments && (
                            <Typography variant="caption" sx={{ display: 'block', mt: 0.5, fontStyle: 'italic' }}>
                                "{rejectedParticipant.comments}"
                            </Typography>
                        )}
                        <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 0.5 }}>
                            {isApproverRejection
                                ? 'Reviewer stage was already completed and will be preserved. Assign new approver(s) below.'
                                : 'All participants will be reset. Assign new reviewers and approvers below.'}
                        </Typography>
                    </Alert>
                )}

                {error && (
                    <Alert severity="error" onClose={() => setError(null)} sx={{ borderRadius: 2 }}>
                        {error}
                    </Alert>
                )}

                {!loadingStatus && (
                    <>
                        {/* Case B: preserved reviewers display */}
                        {isApproverRejection && preservedReviewers.length > 0 && (
                            <Paper elevation={0} sx={{ bgcolor: sectionBg, border: `1px solid ${sectionBorder}`, borderRadius: 2, overflow: 'hidden' }}>
                                <Box sx={{ px: 1.5, py: 0.75, display: 'flex', alignItems: 'center', gap: 1, borderBottom: `1px solid ${sectionBorder}`, bgcolor: isDark ? alpha('#3b82f6', 0.08) : alpha('#3b82f6', 0.05) }}>
                                    <LockOutlined sx={{ fontSize: 14, color: '#3b82f6' }} />
                                    <Typography variant="subtitle2" fontWeight={700} sx={{ color: '#3b82f6' }}>Reviewers (preserved — locked)</Typography>
                                </Box>
                                <Box sx={{ p: 1, display: 'flex', flexDirection: 'column', gap: 0.5 }}>
                                    {preservedReviewers.map(r => (
                                        <Box
                                            key={r.email}
                                            sx={{ display: 'flex', alignItems: 'center', gap: 1, px: 1.25, py: 0.75, borderRadius: 1.5, bgcolor: isDark ? alpha('#3b82f6', 0.06) : '#eff6ff', border: '1px solid', borderColor: isDark ? alpha('#3b82f6', 0.2) : '#bfdbfe' }}
                                        >
                                            <LockOutlined sx={{ fontSize: 13, color: '#3b82f6', flexShrink: 0 }} />
                                            <Person sx={{ fontSize: 14, color: '#3b82f6', flexShrink: 0 }} />
                                            <Box sx={{ flex: 1 }}>
                                                <Typography variant="caption" fontWeight={600}>{r.name || r.email}</Typography>
                                                {r.name && <Typography variant="caption" color="text.secondary" sx={{ display: 'block' }}>{r.email}</Typography>}
                                            </Box>
                                            <Chip label={`Order ${r.order}`} size="small" sx={{ height: 18, fontSize: '0.62rem', bgcolor: alpha('#3b82f6', 0.12), color: '#3b82f6' }} />
                                            <Chip label="Completed" size="small" sx={{ height: 18, fontSize: '0.62rem', bgcolor: alpha('#10b981', 0.12), color: '#10b981' }} />
                                        </Box>
                                    ))}
                                </Box>
                            </Paper>
                        )}

                        {isApproverRejection && <Divider />}

                        {/* Case A: reviewer + approver sections side by side */}
                        {/* Case B: approver section only */}
                        {isApproverRejection ? (
                            renderParticipantSection('APPROVER', approverRows, setApproverRows, preservedReviewers.length)
                        ) : (
                            <Box sx={{ display: 'flex', gap: 1.5, flexDirection: { xs: 'column', md: 'row' } }}>
                                <Box sx={{ flex: 1 }}>
                                    {renderParticipantSection('REVIEWER', reviewerRows, setReviewerRows, 0)}
                                </Box>
                                <Box sx={{ flex: 1 }}>
                                    {renderParticipantSection('APPROVER', approverRows, setApproverRows, reviewerRows.length)}
                                </Box>
                            </Box>
                        )}

                        {/* External signing toggle */}
                        <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', px: 1, py: 0.5, borderRadius: 1.5, border: '1px solid', borderColor: 'divider', bgcolor: 'background.paper' }}>
                            <Box>
                                <Typography variant="body2" fontWeight={600}>External Client Signing</Typography>
                                <Typography variant="caption" color="text.secondary">
                                    {externalSigningEnabled ? 'Signing emails auto-sent after last approver completes' : 'No external signing — owner sends manually if needed'}
                                </Typography>
                            </Box>
                            <FormControlLabel
                                control={<Switch checked={externalSigningEnabled} onChange={e => handleExternalToggle(e.target.checked)} size="small" />}
                                label=""
                                sx={{ m: 0 }}
                            />
                        </Box>

                        {externalSigningEnabled && renderSignerSection()}
                    </>
                )}
            </Box>
        </BaseDialog>
    );
}
