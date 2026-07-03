'use client';

import { useState, useEffect } from 'react';
import {
    Box, Typography, TextField, Chip, Autocomplete, Alert,
    Paper, Divider, useTheme,
} from '@mui/material';
import { Add, Delete, LockOutlined, WarningAmber, SendOutlined, ThumbUp } from '@mui/icons-material';
import { alpha } from '@mui/material/styles';
import BaseDialog from '@/components/common/BaseDialog';
import AppButton from '@/components/common/AppButton';
import { userService, User } from '@/services/userService';
import { authService } from '@/services/authService';
import { unifiedFlowService } from '@/services/unifiedFlowService';
import type { WorkflowParticipant, ParticipantAssignment } from '@/types/unifiedFlow';

interface UnifiedFlowResubmitDialogProps {
    open: boolean;
    onClose: () => void;
    onSubmitted: () => void;
    contractId: string;
    contractTitle?: string;
    /** Current participants from contract.participants */
    participants: WorkflowParticipant[];
}

let _counter = 0;
const uid = () => `r_${++_counter}`;

interface ApproverRow {
    _id: string;
    email: string;
    name?: string;
    order: number;
}

export default function UnifiedFlowResubmitDialog({
    open,
    onClose,
    onSubmitted,
    contractId,
    contractTitle,
    participants,
}: UnifiedFlowResubmitDialogProps) {
    const theme = useTheme();
    const isDark = theme.palette.mode === 'dark';
    const currentUser = authService.getCurrentUser();

    const [users, setUsers] = useState<User[]>([]);
    const [loadingUsers, setLoadingUsers] = useState(false);
    const [approverRows, setApproverRows] = useState<ApproverRow[]>([]);
    const [submitting, setSubmitting] = useState(false);
    const [error, setError] = useState<string | null>(null);

    // Determine rejection type from participant statuses
    const rejectedParticipant = participants.find((p) => p.status === 'rejected');
    const isApproverRejection = rejectedParticipant?.role === 'APPROVER';
    const isReviewerRejection = rejectedParticipant?.role === 'REVIEWER';

    // Preserved reviewers (when approver rejected — reviewers stay as-is)
    const preservedReviewers = isApproverRejection
        ? participants.filter((p) => p.role === 'REVIEWER')
        : [];

    // Previous approvers as a reference
    const prevApprovers = participants.filter((p) => p.role === 'APPROVER');

    useEffect(() => {
        if (open) {
            loadUsers();
            // Seed approver rows from previous approvers so user can edit them
            const maxReviewerOrder = preservedReviewers.length > 0
                ? Math.max(...preservedReviewers.map((r) => r.order))
                : 0;
            setApproverRows(
                prevApprovers.length > 0
                    ? prevApprovers.map((a) => ({ _id: uid(), email: a.email, name: a.name, order: a.order }))
                    : [{ _id: uid(), email: '', name: '', order: maxReviewerOrder + 1 }],
            );
            setError(null);
        }
    }, [open]);

    const loadUsers = async () => {
        setLoadingUsers(true);
        const all = await userService.getAllUsers();
        setUsers(all);
        setLoadingUsers(false);
    };

    const usedEmails = approverRows.map((r) => r.email).filter(Boolean);
    const availableUsers = (excludeEmail?: string) =>
        users.filter((u) => {
            if (currentUser && u.email === currentUser.email) return false;
            const locked = preservedReviewers.map((r) => r.email);
            if (locked.includes(u.email)) return false;
            if (!excludeEmail && usedEmails.includes(u.email)) return false;
            if (excludeEmail && usedEmails.filter((e) => e !== excludeEmail).includes(u.email)) return false;
            return true;
        });

    const addApproverRow = () => {
        const maxOrder = approverRows.length > 0 ? Math.max(...approverRows.map((r) => r.order)) : 0;
        const reviewerMax = preservedReviewers.length > 0 ? Math.max(...preservedReviewers.map((r) => r.order)) : 0;
        setApproverRows((prev) => [...prev, { _id: uid(), email: '', name: '', order: Math.max(maxOrder, reviewerMax) + 1 }]);
    };

    const removeApproverRow = (id: string) => {
        setApproverRows((prev) => prev.filter((r) => r._id !== id));
    };

    const updateApproverRow = (id: string, patch: Partial<ApproverRow>) => {
        setApproverRows((prev) => prev.map((r) => (r._id === id ? { ...r, ...patch } : r)));
    };

    const validate = (): string | null => {
        if (approverRows.length === 0) return 'At least one approver is required.';
        for (const r of approverRows) {
            if (!r.email.trim()) return 'All approvers must have an email address.';
        }
        const emails = approverRows.map((r) => r.email.toLowerCase().trim());
        if (new Set(emails).size !== emails.length) return 'Duplicate approver emails are not allowed.';
        if (currentUser && emails.includes(currentUser.email.toLowerCase()))
            return 'You cannot add yourself as a participant.';

        // Orders must be > max reviewer order
        const reviewerMax = preservedReviewers.length > 0 ? Math.max(...preservedReviewers.map((r) => r.order)) : 0;
        const minApproverOrder = Math.min(...approverRows.map((r) => r.order));
        if (reviewerMax > 0 && minApproverOrder <= reviewerMax)
            return `Approver order must be greater than ${reviewerMax} (highest reviewer order).`;

        return null;
    };

    const handleSubmit = async () => {
        setError(null);
        const err = validate();
        if (err) { setError(err); return; }

        setSubmitting(true);

        // Build final assignments: preserved reviewers + new approvers
        let assignments: ParticipantAssignment[] = [];
        if (isApproverRejection) {
            assignments = [
                ...preservedReviewers.map(({ email, name, role, order }) => ({ email, name, role, order })),
                ...approverRows.map(({ email, name, order }) => ({ email, name, role: 'APPROVER' as const, order })),
            ];
        } else {
            // Reviewer rejection: only approvers (full reset, no reviewers kept)
            assignments = approverRows.map(({ email, name, order }) => ({
                email, name, role: 'APPROVER' as const, order,
            }));
        }

        const res = await unifiedFlowService.submitFlow(contractId, assignments, false);
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
        setApproverRows([]);
        setError(null);
        onClose();
    };

    const sectionBg = isDark ? alpha('#ffffff', 0.03) : '#f8fafc';
    const sectionBorder = isDark ? alpha('#ffffff', 0.08) : '#e2e8f0';

    return (
        <BaseDialog
            open={open}
            onClose={handleClose}
            title="RESUBMIT CONTRACT"
            maxWidth="sm"
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
                        sx={{ fontWeight: 600, px: 3 }}
                    >
                        {submitting ? 'Resubmitting…' : 'Resubmit'}
                    </AppButton>
                </>
            }
        >
            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
                {/* Contract info */}
                {contractTitle && (
                    <Box sx={{ p: 1, borderRadius: 1.5, bgcolor: isDark ? alpha('#ffffff', 0.04) : '#f8fafc', border: '1px solid', borderColor: 'divider' }}>
                        <Typography variant="body2" color="text.secondary">
                            Contract: <strong>{contractTitle}</strong>
                        </Typography>
                    </Box>
                )}

                {/* Rejection context banner */}
                {rejectedParticipant && (
                    <Alert
                        severity="error"
                        icon={<WarningAmber fontSize="inherit" />}
                        sx={{ borderRadius: 2, '& .MuiAlert-message': { width: '100%' } }}
                    >
                        <Typography variant="body2" fontWeight={700}>
                            Rejected by {isApproverRejection ? 'Approver' : 'Reviewer'}: {rejectedParticipant.email}
                        </Typography>
                        {rejectedParticipant.comments && (
                            <Typography variant="caption" sx={{ display: 'block', mt: 0.5, fontStyle: 'italic' }}>
                                "{rejectedParticipant.comments}"
                            </Typography>
                        )}
                        <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 0.5 }}>
                            {isApproverRejection
                                ? 'Reviewer stage was already completed and will be preserved. Only approvers need to be reassigned.'
                                : 'All participants will be reset. Assign new approvers below.'}
                        </Typography>
                    </Alert>
                )}

                {error && (
                    <Alert severity="error" onClose={() => setError(null)} sx={{ borderRadius: 2 }}>
                        {error}
                    </Alert>
                )}

                {/* Preserved reviewers (approver rejection only) */}
                {isApproverRejection && preservedReviewers.length > 0 && (
                    <Paper
                        elevation={0}
                        sx={{ bgcolor: sectionBg, border: `1px solid ${sectionBorder}`, borderRadius: 2, overflow: 'hidden' }}
                    >
                        <Box
                            sx={{
                                px: 1.5,
                                py: 0.75,
                                display: 'flex',
                                alignItems: 'center',
                                gap: 1,
                                borderBottom: `1px solid ${sectionBorder}`,
                                bgcolor: isDark ? alpha('#3b82f6', 0.08) : alpha('#3b82f6', 0.05),
                            }}
                        >
                            <LockOutlined sx={{ fontSize: 14, color: '#3b82f6' }} />
                            <Typography variant="subtitle2" fontWeight={700} sx={{ color: '#3b82f6' }}>
                                Reviewers (preserved — locked)
                            </Typography>
                        </Box>
                        <Box sx={{ p: 1, display: 'flex', flexDirection: 'column', gap: 0.5 }}>
                            {preservedReviewers.map((r) => (
                                <Box
                                    key={r.email}
                                    sx={{
                                        display: 'flex',
                                        alignItems: 'center',
                                        gap: 1,
                                        px: 1.25,
                                        py: 0.75,
                                        borderRadius: 1.5,
                                        bgcolor: isDark ? alpha('#3b82f6', 0.06) : '#eff6ff',
                                        border: '1px solid',
                                        borderColor: isDark ? alpha('#3b82f6', 0.2) : '#bfdbfe',
                                    }}
                                >
                                    <LockOutlined sx={{ fontSize: 13, color: '#3b82f6', flexShrink: 0 }} />
                                    <Box sx={{ flex: 1 }}>
                                        <Typography variant="caption" fontWeight={600}>{r.name || r.email}</Typography>
                                        {r.name && <Typography variant="caption" color="text.secondary" sx={{ display: 'block' }}>{r.email}</Typography>}
                                    </Box>
                                    <Chip
                                        label={`Order ${r.order}`}
                                        size="small"
                                        sx={{ height: 18, fontSize: '0.62rem', bgcolor: alpha('#3b82f6', 0.12), color: '#3b82f6' }}
                                    />
                                    <Chip
                                        label={r.status}
                                        size="small"
                                        sx={{ height: 18, fontSize: '0.62rem', bgcolor: r.status === 'completed' ? alpha('#10b981', 0.12) : alpha('#6b7280', 0.12), color: r.status === 'completed' ? '#10b981' : '#6b7280' }}
                                    />
                                </Box>
                            ))}
                        </Box>
                    </Paper>
                )}

                {isApproverRejection && <Divider />}

                {/* Approver assignment section */}
                <Paper
                    elevation={0}
                    sx={{ bgcolor: sectionBg, border: `1px solid ${sectionBorder}`, borderRadius: 2, overflow: 'hidden' }}
                >
                    <Box
                        sx={{
                            px: 1.5,
                            py: 0.75,
                            display: 'flex',
                            alignItems: 'center',
                            gap: 1,
                            borderBottom: `1px solid ${sectionBorder}`,
                            bgcolor: isDark ? alpha('#10b981', 0.08) : '#f0fdf4',
                        }}
                    >
                        <ThumbUp sx={{ fontSize: 14, color: '#10b981' }} />
                        <Typography variant="subtitle2" fontWeight={700} sx={{ color: '#10b981' }}>
                            {isReviewerRejection ? 'Approvers' : 'New Approvers'}
                        </Typography>
                        {isApproverRejection && (
                            <Chip label="Replace" size="small" sx={{ height: 16, fontSize: '0.6rem', bgcolor: alpha('#f59e0b', 0.15), color: '#f59e0b', ml: 'auto' }} />
                        )}
                    </Box>

                    <Box sx={{ p: 1, display: 'flex', flexDirection: 'column', gap: 0.75 }}>
                        {approverRows.map((row) => (
                            <Box
                                key={row._id}
                                sx={{
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: 1,
                                    p: 0.75,
                                    borderRadius: 1.5,
                                    bgcolor: 'background.paper',
                                    border: '1px solid',
                                    borderColor: 'divider',
                                }}
                            >
                                <Autocomplete
                                    options={availableUsers(row.email)}
                                    getOptionLabel={(u) => typeof u === 'string' ? u : `${u.name || ''} (${u.email})`}
                                    value={users.find((u) => u.email === row.email) || null}
                                    onChange={(_, val) => {
                                        if (val && typeof val !== 'string') updateApproverRow(row._id, { email: val.email, name: val.name });
                                        else updateApproverRow(row._id, { email: '', name: '' });
                                    }}
                                    loading={loadingUsers}
                                    size="small"
                                    sx={{ flex: 1 }}
                                    renderInput={(params) => (
                                        <TextField
                                            {...params}
                                            placeholder="Search approver…"
                                            size="small"
                                            sx={{ '& .MuiOutlinedInput-root': { fontSize: '0.82rem' } }}
                                        />
                                    )}
                                    freeSolo
                                    onInputChange={(_, val, reason) => {
                                        if (reason === 'input') updateApproverRow(row._id, { email: val });
                                    }}
                                />
                                <TextField
                                    type="number"
                                    size="small"
                                    label="Order"
                                    value={row.order}
                                    onChange={(e) => {
                                        const v = parseInt(e.target.value, 10);
                                        if (!isNaN(v) && v > 0) updateApproverRow(row._id, { order: v });
                                    }}
                                    inputProps={{ min: 1, style: { textAlign: 'center', padding: '4px 4px' } }}
                                    sx={{ width: 68, flexShrink: 0 }}
                                />
                                <AppButton
                                    size="small"
                                    color="error"
                                    variant="outlined"
                                    onClick={() => removeApproverRow(row._id)}
                                    disabled={approverRows.length === 1}
                                    sx={{ p: 0.5, minWidth: 0 }}
                                >
                                    <Delete sx={{ fontSize: 16 }} />
                                </AppButton>
                            </Box>
                        ))}

                        <AppButton
                            variant="outlined"
                            size="small"
                            startIcon={<Add />}
                            onClick={addApproverRow}
                            sx={{ mt: 0.25, borderColor: alpha('#10b981', 0.4), color: '#10b981', '&:hover': { borderColor: '#10b981', bgcolor: alpha('#10b981', 0.06) } }}
                        >
                            Add Approver
                        </AppButton>
                    </Box>
                </Paper>
            </Box>
        </BaseDialog>
    );
}
