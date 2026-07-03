'use client';

import { useState, useEffect } from 'react';
import {
    Box, Typography, TextField, Chip, Autocomplete, Alert,
    Divider, Switch, FormControlLabel, IconButton, Tooltip,
    Paper, useTheme,
} from '@mui/material';
import {
    Add, Delete, RateReview, ThumbUp, DragIndicator,
    Groups, PeopleAlt, InfoOutlined, SendOutlined, DriveFileRenameOutline,
    BusinessCenter,
} from '@mui/icons-material';
import { alpha } from '@mui/material/styles';
import BaseDialog from '@/components/common/BaseDialog';
import AppButton from '@/components/common/AppButton';
import { userService, User } from '@/services/userService';
import { authService } from '@/services/authService';
import { unifiedFlowService } from '@/services/unifiedFlowService';
import type { ParticipantAssignment, ParticipantRole, ExternalSignerSubmitInput } from '@/types/unifiedFlow';

interface UnifiedFlowSubmitDialogProps {
    open: boolean;
    onClose: () => void;
    onSubmitted: () => void;
    contractId: string;
    contractTitle?: string;
}

interface ParticipantRow extends ParticipantAssignment {
    _id: string;
}

interface ExternalSignerRow extends ExternalSignerSubmitInput {
    _id: string;
}

let _rowCounter = 0;
const newParticipantRow = (role: ParticipantRole, order: number, email = '', name = ''): ParticipantRow => ({
    _id: `row_${++_rowCounter}`,
    email,
    name,
    role,
    order,
});

let _signerCounter = 0;
const newSignerRow = (order: number): ExternalSignerRow => ({
    _id: `sig_${++_signerCounter}`,
    email: '',
    name: '',
    order,
});

const isValidEmail = (v: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v);

function nextOrder(rows: ParticipantRow[], role: ParticipantRole): number {
    const same = rows.filter((r) => r.role === role);
    if (same.length === 0) {
        if (role === 'APPROVER') {
            const maxReviewer = Math.max(0, ...rows.filter((r) => r.role === 'REVIEWER').map((r) => r.order));
            return maxReviewer + 1;
        }
        return 1;
    }
    return Math.max(...same.map((r) => r.order)) + 1;
}

export default function UnifiedFlowSubmitDialog({
    open,
    onClose,
    onSubmitted,
    contractId,
    contractTitle,
}: UnifiedFlowSubmitDialogProps) {
    const theme = useTheme();
    const isDark = theme.palette.mode === 'dark';
    const currentUser = authService.getCurrentUser();

    const [users, setUsers] = useState<User[]>([]);
    const [loadingUsers, setLoadingUsers] = useState(false);
    const [rows, setRows] = useState<ParticipantRow[]>([]);
    const [externalSigningIncluded, setExternalSigningIncluded] = useState(false);
    const [externalSigners, setExternalSigners] = useState<ExternalSignerRow[]>([]);
    const [submitting, setSubmitting] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [externalParties, setExternalParties] = useState<Array<{ id: string; label: string; order: number }>>([]);
    const [loadingParties, setLoadingParties] = useState(false);

    useEffect(() => {
        if (open) {
            loadUsers();
            setRows([
                newParticipantRow('REVIEWER', 1),
                newParticipantRow('APPROVER', 2),
            ]);
            setExternalSigningIncluded(false);
            setExternalSigners([]);
            setExternalParties([]);
            setError(null);
        }
    }, [open]);

    const loadUsers = async () => {
        setLoadingUsers(true);
        const all = await userService.getAllUsers();
        setUsers(all);
        setLoadingUsers(false);
    };

    const loadExternalParties = async () => {
        setLoadingParties(true);
        const res = await unifiedFlowService.getFlowStatus(contractId);
        if (res.ok && res.data?.parties) {
            const ext = res.data.parties
                .filter((p) => p.type === 'EXTERNAL')
                .map((p) => ({ id: p.id, label: p.label, order: p.order }));
            setExternalParties(ext);
            // Auto-assign the only party when adding the first signer row
            if (ext.length === 1) {
                setExternalSigners((prev) =>
                    prev.map((s) => (!s.partyId ? { ...s, partyId: ext[0].id, partyLabel: ext[0].label } : s)),
                );
            }
        }
        setLoadingParties(false);
    };

    const handleExternalToggle = (checked: boolean) => {
        setExternalSigningIncluded(checked);
        if (checked) {
            if (externalSigners.length === 0) {
                setExternalSigners([newSignerRow(1)]);
            }
            loadExternalParties();
        } else {
            setExternalSigners([]);
            setExternalParties([]);
        }
    };

    const reviewers = rows.filter((r) => r.role === 'REVIEWER');
    const approvers = rows.filter((r) => r.role === 'APPROVER');

    const usedEmails = rows.map((r) => r.email).filter(Boolean);
    const availableUsers = (excludeEmail?: string) =>
        users.filter((u) => {
            if (currentUser && u.email === currentUser.email) return false;
            if (!excludeEmail && usedEmails.includes(u.email)) return false;
            if (excludeEmail && usedEmails.filter((e) => e !== excludeEmail).includes(u.email)) return false;
            return true;
        });

    const addRow = (role: ParticipantRole) => {
        setRows((prev) => [...prev, newParticipantRow(role, nextOrder(prev, role))]);
    };

    const removeRow = (id: string) => {
        setRows((prev) => prev.filter((r) => r._id !== id));
    };

    const updateRow = (id: string, patch: Partial<ParticipantRow>) => {
        setRows((prev) => prev.map((r) => (r._id === id ? { ...r, ...patch } : r)));
    };

    const moveRow = (id: string, direction: 'up' | 'down') => {
        setRows((prev) => {
            const idx = prev.findIndex((r) => r._id === id);
            if (idx < 0) return prev;
            const swapIdx = direction === 'up' ? idx - 1 : idx + 1;
            if (swapIdx < 0 || swapIdx >= prev.length) return prev;
            const next = [...prev];
            [next[idx], next[swapIdx]] = [next[swapIdx], next[idx]];
            return next.map((r, i) => ({ ...r, order: i + 1 }));
        });
    };

    const addSigner = () => {
        const maxOrder = externalSigners.length > 0 ? Math.max(...externalSigners.map((s) => s.order)) : 0;
        const row = newSignerRow(maxOrder + 1);
        if (externalParties.length === 1) {
            row.partyId = externalParties[0].id;
            row.partyLabel = externalParties[0].label;
        }
        setExternalSigners((prev) => [...prev, row]);
    };

    const removeSigner = (id: string) => {
        setExternalSigners((prev) => prev.filter((s) => s._id !== id));
    };

    const updateSigner = (id: string, patch: Partial<ExternalSignerRow>) => {
        setExternalSigners((prev) => prev.map((s) => (s._id === id ? { ...s, ...patch } : s)));
    };

    const validate = (): string | null => {
        if (reviewers.length === 0 && approvers.length === 0)
            return 'Add at least one reviewer or approver.';
        if (approvers.length === 0)
            return 'At least one Approver is required.';
        for (const r of rows) {
            if (!r.email.trim()) return 'All participants must have an email address.';
        }
        const emails = rows.map((r) => r.email.toLowerCase().trim());
        if (new Set(emails).size !== emails.length) return 'Duplicate emails are not allowed.';
        if (currentUser && emails.includes(currentUser.email.toLowerCase()))
            return 'You cannot add yourself as a participant.';

        const maxReviewerOrder = reviewers.length > 0 ? Math.max(...reviewers.map((r) => r.order)) : 0;
        const minApproverOrder = approvers.length > 0 ? Math.min(...approvers.map((r) => r.order)) : Infinity;
        if (maxReviewerOrder >= minApproverOrder)
            return 'All reviewers must have a lower order number than all approvers.';

        if (externalSigningIncluded) {
            if (externalSigners.length === 0)
                return 'Add at least one external signer when external client signing is enabled.';
            for (const s of externalSigners) {
                if (!s.email.trim()) return 'All external signers must have an email address.';
                if (!isValidEmail(s.email.trim())) return `"${s.email}" is not a valid email address.`;
                if (externalParties.length > 0 && !s.partyId)
                    return `Select a party for the signer "${s.email || 'unknown'}".`;
            }
            const signerEmails = externalSigners.map((s) => s.email.toLowerCase().trim());
            if (new Set(signerEmails).size !== signerEmails.length)
                return 'Duplicate external signer emails are not allowed.';
        }

        return null;
    };

    const handleSubmit = async () => {
        setError(null);
        const validationError = validate();
        if (validationError) { setError(validationError); return; }

        setSubmitting(true);
        const assignments = rows.map(({ email, name, role, order }) => ({ email, name, role, order }));
        const signers: ExternalSignerSubmitInput[] | undefined = externalSigningIncluded
            ? externalSigners.map(({ email, name, order, partyId, partyLabel }) => ({
                email: email.trim(),
                name: name?.trim() || undefined,
                order,
                ...(partyId ? { partyId, partyLabel } : {}),
            }))
            : undefined;

        const res = await unifiedFlowService.submitFlow(
            contractId,
            assignments,
            externalSigningIncluded,
            signers,
            currentUser?.fullName || currentUser?.fullName || currentUser?.email,
        );
        setSubmitting(false);

        if (res.ok) {
            handleClose();
            onSubmitted();
        } else {
            setError(res.message || 'Failed to submit. Please try again.');
        }
    };

    const handleClose = () => {
        if (submitting) return;
        setRows([]);
        setExternalSigners([]);
        setError(null);
        onClose();
    };

    const sectionBg = isDark ? alpha('#ffffff', 0.03) : '#f8fafc';
    const sectionBorder = isDark ? alpha('#ffffff', 0.08) : '#e2e8f0';

    const renderParticipantSection = (role: ParticipantRole, sectionRows: ParticipantRow[]) => {
        const isReviewer = role === 'REVIEWER';
        const accentColor = isReviewer ? '#3b82f6' : '#10b981';
        const Icon = isReviewer ? RateReview : ThumbUp;
        const label = isReviewer ? 'Reviewers' : 'Approvers';
        const subtext = isReviewer
            ? 'Can review & edit organisation fields.'
            : 'Can sign the PDF and approve the contract.';

        return (
            <Paper
                elevation={0}
                sx={{
                    bgcolor: sectionBg,
                    border: `1px solid ${sectionBorder}`,
                    borderRadius: 2,
                    overflow: 'hidden',
                }}
            >
                <Box
                    sx={{
                        px: 1.5,
                        py: 1,
                        display: 'flex',
                        alignItems: 'center',
                        gap: 1,
                        borderBottom: `1px solid ${sectionBorder}`,
                        bgcolor: isDark ? alpha(accentColor, 0.08) : alpha(accentColor, 0.05),
                    }}
                >
                    <Icon sx={{ fontSize: 16, color: accentColor }} />
                    <Box sx={{ flex: 1 }}>
                        <Typography variant="subtitle2" fontWeight={700} sx={{ color: accentColor }}>
                            {label}
                        </Typography>
                        <Typography variant="caption" color="text.secondary">
                            {subtext}
                        </Typography>
                    </Box>
                    <Chip
                        label={sectionRows.length}
                        size="small"
                        sx={{
                            height: 18,
                            fontSize: '0.65rem',
                            fontWeight: 700,
                            bgcolor: alpha(accentColor, 0.15),
                            color: accentColor,
                        }}
                    />
                </Box>

                <Box sx={{ p: 1, display: 'flex', flexDirection: 'column', gap: 0.75 }}>
                    {sectionRows.length === 0 && (
                        <Typography variant="caption" color="text.disabled" sx={{ textAlign: 'center', py: 1 }}>
                            No {label.toLowerCase()} added yet
                        </Typography>
                    )}

                    {sectionRows.map((row, idx) => (
                        <Box
                            key={row._id}
                            sx={{
                                display: 'flex',
                                alignItems: 'center',
                                gap: 1,
                                p: 1,
                                borderRadius: 1.5,
                                bgcolor: 'background.paper',
                                border: '1px solid',
                                borderColor: 'divider',
                            }}
                        >
                            <Box
                                sx={{
                                    minWidth: 22,
                                    height: 22,
                                    borderRadius: '50%',
                                    bgcolor: alpha(accentColor, 0.12),
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    flexShrink: 0,
                                }}
                            >
                                <Typography variant="caption" fontWeight={700} sx={{ fontSize: '0.62rem', color: accentColor }}>
                                    {row.order}
                                </Typography>
                            </Box>

                            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0, flexShrink: 0 }}>
                                <IconButton
                                    size="small"
                                    sx={{ p: 0.1, opacity: idx === 0 ? 0.25 : 1 }}
                                    disabled={idx === 0}
                                    onClick={() => moveRow(row._id, 'up')}
                                >
                                    <DragIndicator sx={{ fontSize: 14, transform: 'rotate(-90deg)' }} />
                                </IconButton>
                                <IconButton
                                    size="small"
                                    sx={{ p: 0.1, opacity: idx === sectionRows.length - 1 ? 0.25 : 1 }}
                                    disabled={idx === sectionRows.length - 1}
                                    onClick={() => moveRow(row._id, 'down')}
                                >
                                    <DragIndicator sx={{ fontSize: 14, transform: 'rotate(90deg)' }} />
                                </IconButton>
                            </Box>

                            <Autocomplete
                                options={availableUsers(row.email)}
                                getOptionLabel={(u) => typeof u === 'string' ? u : `${u.name || ''} (${u.email})`}
                                value={users.find((u) => u.email === row.email) || null}
                                onChange={(_, val) => {
                                    if (val && typeof val !== 'string') {
                                        updateRow(row._id, { email: val.email, name: val.name });
                                    } else {
                                        updateRow(row._id, { email: '', name: '' });
                                    }
                                }}
                                loading={loadingUsers}
                                size="small"
                                sx={{ flex: 1 }}
                                renderInput={(params) => (
                                    <TextField
                                        {...params}
                                        placeholder="Search user…"
                                        size="small"
                                        sx={{ '& .MuiOutlinedInput-root': { fontSize: '0.82rem' } }}
                                    />
                                )}
                                freeSolo
                                onInputChange={(_, val, reason) => {
                                    if (reason === 'input') updateRow(row._id, { email: val });
                                }}
                            />

                            <TextField
                                type="number"
                                size="small"
                                value={row.order}
                                onChange={(e) => {
                                    const v = parseInt(e.target.value, 10);
                                    if (!isNaN(v) && v > 0) updateRow(row._id, { order: v });
                                }}
                                inputProps={{ min: 1, style: { textAlign: 'center', width: 36, padding: '4px 4px' } }}
                                sx={{ width: 52, flexShrink: 0 }}
                                label="Or..."
                            />

                            <Tooltip title="Remove" arrow>
                                <IconButton
                                    size="small"
                                    color="error"
                                    onClick={() => removeRow(row._id)}
                                    sx={{ flexShrink: 0, p: 0.5 }}
                                >
                                    <Delete sx={{ fontSize: 16 }} />
                                </IconButton>
                            </Tooltip>
                        </Box>
                    ))}

                    <AppButton
                        variant="outlined"
                        size="small"
                        startIcon={<Add />}
                        onClick={() => addRow(role)}
                        sx={{
                            mt: 0.25,
                            borderColor: alpha(accentColor, 0.4),
                            color: accentColor,
                            '&:hover': { borderColor: accentColor, bgcolor: alpha(accentColor, 0.06) },
                            fontSize: '0.78rem',
                        }}
                    >
                        Add {isReviewer ? 'Reviewer' : 'Approver'}
                    </AppButton>
                </Box>
            </Paper>
        );
    };

    const renderExternalSignersSection = () => (
        <Paper
            elevation={0}
            sx={{
                bgcolor: sectionBg,
                border: `1px solid ${isDark ? alpha('#f59e0b', 0.3) : '#fde68a'}`,
                borderRadius: 2,
                overflow: 'hidden',
            }}
        >
            <Box
                sx={{
                    px: 1.5,
                    py: 0.75,
                    display: 'flex',
                    alignItems: 'center',
                    gap: 1,
                    borderBottom: `1px solid ${sectionBorder}`,
                    bgcolor: isDark ? alpha('#f59e0b', 0.08) : '#fffbeb',
                }}
            >
                <DriveFileRenameOutline sx={{ fontSize: 16, color: '#f59e0b' }} />
                <Box sx={{ flex: 1 }}>
                    <Typography variant="subtitle2" fontWeight={700} sx={{ color: isDark ? '#fcd34d' : '#92400e' }}>
                        External Signers
                    </Typography>
                    <Typography variant="caption" color="text.secondary">
                        {externalParties.length > 0
                            ? 'Assign each client to their party so they know which fields belong to them.'
                            : 'External clients who will sign after all approvals are complete.'}
                    </Typography>
                </Box>
                <Chip
                    label={externalSigners.length}
                    size="small"
                    sx={{ height: 18, fontSize: '0.65rem', fontWeight: 700, bgcolor: alpha('#f59e0b', 0.15), color: '#f59e0b' }}
                />
            </Box>

            <Box sx={{ p: 1, display: 'flex', flexDirection: 'column', gap: 0.75 }}>
                {externalSigners.map((signer) => (
                    <Box
                        key={signer._id}
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
                        <Box
                            sx={{
                                minWidth: 22,
                                height: 22,
                                borderRadius: '50%',
                                bgcolor: alpha('#f59e0b', 0.12),
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                flexShrink: 0,
                            }}
                        >
                            <Typography variant="caption" fontWeight={700} sx={{ fontSize: '0.62rem', color: '#f59e0b' }}>
                                {signer.order}
                            </Typography>
                        </Box>

                        <TextField
                            size="small"
                            placeholder="client@example.com *"
                            type="email"
                            value={signer.email}
                            onChange={(e) => updateSigner(signer._id, { email: e.target.value })}
                            sx={{ flex: 2, '& .MuiOutlinedInput-root': { fontSize: '0.82rem' } }}
                            error={signer.email !== '' && !isValidEmail(signer.email)}
                        />

                        <TextField
                            size="small"
                            placeholder="Name (optional)"
                            value={signer.name || ''}
                            onChange={(e) => updateSigner(signer._id, { name: e.target.value })}
                            sx={{ flex: 1.5, '& .MuiOutlinedInput-root': { fontSize: '0.82rem' } }}
                        />

                        {externalParties.length > 0 && (
                            <Autocomplete
                                options={externalParties}
                                getOptionLabel={(p) => p.label}
                                value={externalParties.find((p) => p.id === signer.partyId) ?? null}
                                onChange={(_, val) => {
                                    updateSigner(signer._id, {
                                        partyId: val?.id ?? undefined,
                                        partyLabel: val?.label ?? undefined,
                                    });
                                }}
                                loading={loadingParties}
                                size="small"
                                sx={{ flex: 1.5 }}
                                renderInput={(params) => (
                                    <TextField
                                        {...params}
                                        placeholder="Party *"
                                        size="small"
                                        error={!signer.partyId}
                                        InputProps={{
                                            ...params.InputProps,
                                            startAdornment: (
                                                <>
                                                    <BusinessCenter sx={{ fontSize: 14, color: '#f59e0b', mr: 0.5 }} />
                                                    {params.InputProps.startAdornment}
                                                </>
                                            ),
                                        }}
                                        sx={{ '& .MuiOutlinedInput-root': { fontSize: '0.82rem' } }}
                                    />
                                )}
                                isOptionEqualToValue={(o, v) => o.id === v.id}
                                disableClearable={false}
                            />
                        )}

                        <TextField
                            type="number"
                            size="small"
                            label="Order"
                            value={signer.order}
                            onChange={(e) => {
                                const v = parseInt(e.target.value, 10);
                                if (!isNaN(v) && v > 0) updateSigner(signer._id, { order: v });
                            }}
                            inputProps={{ min: 1, style: { textAlign: 'center', padding: '4px 4px' } }}
                            sx={{ width: 68, flexShrink: 0 }}
                        />

                        <Tooltip title="Remove" arrow>
                            <span>
                                <IconButton
                                    size="small"
                                    color="error"
                                    onClick={() => removeSigner(signer._id)}
                                    disabled={externalSigners.length === 1}
                                    sx={{ flexShrink: 0, p: 0.5 }}
                                >
                                    <Delete sx={{ fontSize: 16 }} />
                                </IconButton>
                            </span>
                        </Tooltip>
                    </Box>
                ))}

                <AppButton
                    variant="outlined"
                    size="small"
                    startIcon={<Add />}
                    onClick={addSigner}
                    sx={{
                        mt: 0.25,
                        borderColor: alpha('#f59e0b', 0.4),
                        color: '#f59e0b',
                        '&:hover': { borderColor: '#f59e0b', bgcolor: alpha('#f59e0b', 0.06) },
                        fontSize: '0.78rem',
                    }}
                >
                    Add External Signer
                </AppButton>
            </Box>
        </Paper>
    );

    return (
        <BaseDialog
            open={open}
            onClose={handleClose}
            title="SUBMIT FOR UNIFIED REVIEW"
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
                        disabled={rows.length === 0}
                        startIcon={<SendOutlined />}
                        onClick={handleSubmit}
                        sx={{
                            fontWeight: 600,
                            px: 3,
                            boxShadow: (t) => `0 2px 8px ${t.palette.primary.main}40`,
                        }}
                    >
                        {submitting ? 'Submitting…' : 'Submit Flow'}
                    </AppButton>
                </>
            }
        >
            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
                {/* Contract info */}
                {contractTitle && (
                    <Box
                        sx={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: 1,
                            p: 1,
                            borderRadius: 1.5,
                            bgcolor: isDark ? alpha('#ffffff', 0.04) : '#f8fafc',
                            border: '1px solid',
                            borderColor: 'divider',
                        }}
                    >
                        <Groups sx={{ fontSize: 18, color: 'text.secondary' }} />
                        <Typography variant="body2" color="text.secondary">
                            Contract: <strong>{contractTitle}</strong>
                        </Typography>
                    </Box>
                )}

                {error && (
                    <Alert severity="error" onClose={() => setError(null)} sx={{ borderRadius: 2 }}>
                        {error}
                    </Alert>
                )}

                <Alert
                    severity="info"
                    icon={<InfoOutlined fontSize="inherit" />}
                    sx={{ borderRadius: 2, py: 0.5, '& .MuiAlert-message': { py: 0.25 } }}
                >
                    <Typography variant="caption">
                        Participants are notified sequentially by order number. All reviewer orders must be lower than all approver orders. Participants with the same order number are notified simultaneously.
                    </Typography>
                </Alert>

                {/* Reviewers + Approvers */}
                <Box sx={{ display: 'flex', flexDirection: { xs: 'column', sm: 'row' }, gap: 1.5 }}>
                    <Box sx={{ flex: 1 }}>{renderParticipantSection('REVIEWER', reviewers)}</Box>
                    <Box sx={{ flex: 1 }}>{renderParticipantSection('APPROVER', approvers)}</Box>
                </Box>

                <Divider />

                {/* External signing toggle */}
                <Paper
                    elevation={0}
                    sx={{
                        p: 1.5,
                        borderRadius: 2,
                        bgcolor: externalSigningIncluded
                            ? (isDark ? alpha('#10b981', 0.08) : '#f0fdf4')
                            : sectionBg,
                        border: '1px solid',
                        borderColor: externalSigningIncluded
                            ? (isDark ? alpha('#10b981', 0.3) : '#a7f3d0')
                            : sectionBorder,
                        transition: 'all 0.2s',
                    }}
                >
                    <FormControlLabel
                        control={
                            <Switch
                                checked={externalSigningIncluded}
                                onChange={(e) => handleExternalToggle(e.target.checked)}
                                color="success"
                                size="small"
                            />
                        }
                        label={
                            <Box sx={{ ml: 0.5 }}>
                                <Typography variant="body2" fontWeight={600}>
                                    Include external client signing
                                </Typography>
                                <Typography variant="caption" color="text.secondary">
                                    {externalSigningIncluded
                                        ? 'Signature emails will be sent automatically after all approvals are complete.'
                                        : 'After all approvals, you can manually send the contract to external clients for signature.'}
                                </Typography>
                            </Box>
                        }
                        sx={{ alignItems: 'flex-start', m: 0 }}
                    />
                </Paper>

                {/* External signers section — shown only when toggle is ON */}
                {externalSigningIncluded && renderExternalSignersSection()}

                {/* Participant summary */}
                {rows.length > 0 && (
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap' }}>
                        <PeopleAlt sx={{ fontSize: 16, color: 'text.secondary' }} />
                        <Typography variant="caption" color="text.secondary">
                            {reviewers.length} reviewer{reviewers.length !== 1 ? 's' : ''},{' '}
                            {approvers.length} approver{approvers.length !== 1 ? 's' : ''}
                            {externalSigningIncluded
                                ? ` · ${externalSigners.length} external signer${externalSigners.length !== 1 ? 's' : ''} (auto-sent after approval)`
                                : ''}
                        </Typography>
                    </Box>
                )}
            </Box>
        </BaseDialog>
    );
}
