'use client';

import { useState, useEffect } from 'react';
import {
    Box, Typography, TextField, Alert, Paper, useTheme, List, ListItem, ListItemIcon, ListItemText, CircularProgress,
} from '@mui/material';
import { Add, Delete, SendOutlined, DriveFileRenameOutline, InfoOutlined, WarningAmber, FiberManualRecord } from '@mui/icons-material';
import { alpha } from '@mui/material/styles';
import BaseDialog from '@/components/common/BaseDialog';
import AppButton from '@/components/common/AppButton';
import { unifiedFlowService } from '@/services/unifiedFlowService';
import type { FlowSignerAssignment } from '@/types/unifiedFlow';

interface UnifiedFlowSendForSignatureDialogProps {
    open: boolean;
    onClose: () => void;
    onSent: () => void;
    contractId: string;
    contractTitle?: string;
    senderName?: string;
}

let _signerCounter = 0;
interface SignerRow extends FlowSignerAssignment {
    _id: string;
}
const newSigner = (order: number): SignerRow => ({
    _id: `sig_${++_signerCounter}`,
    email: '',
    name: '',
    order,
});

const isValidEmail = (v: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v);

export default function UnifiedFlowSendForSignatureDialog({
    open,
    onClose,
    onSent,
    contractId,
    contractTitle,
    senderName,
}: UnifiedFlowSendForSignatureDialogProps) {
    const theme = useTheme();
    const isDark = theme.palette.mode === 'dark';

    const [signers, setSigners] = useState<SignerRow[]>([newSigner(1)]);
    const [submitting, setSubmitting] = useState(false);
    const [error, setError] = useState<string | null>(null);

    // Internal-field gate: check that all INTERNAL party fields are filled before allowing send
    const [checkingFields, setCheckingFields] = useState(false);
    const [orgCheck, setOrgCheck] = useState<{ complete: boolean; unfilledFields: string[] } | null>(null);

    useEffect(() => {
        if (!open) return;
        setSigners([newSigner(1)]);
        setError(null);
        setOrgCheck(null);
        setCheckingFields(true);
        unifiedFlowService.getFlowStatus(contractId).then((res) => {
            if (res.ok && res.data) {
                setOrgCheck({
                    complete: res.data.orgFieldsComplete,
                    unfilledFields: res.data.unfilledOrgFields || [],
                });
            }
            setCheckingFields(false);
        });
    }, [open, contractId]);

    const addSigner = () => {
        const maxOrder = Math.max(...signers.map((s) => s.order));
        setSigners((prev) => [...prev, newSigner(maxOrder + 1)]);
    };

    const removeSigner = (id: string) => {
        setSigners((prev) => prev.filter((s) => s._id !== id));
    };

    const updateSigner = (id: string, patch: Partial<SignerRow>) => {
        setSigners((prev) => prev.map((s) => (s._id === id ? { ...s, ...patch } : s)));
    };

    const validate = (): string | null => {
        if (signers.length === 0) return 'Add at least one external signer.';
        for (const s of signers) {
            if (!s.email.trim()) return 'All signers must have an email address.';
            if (!isValidEmail(s.email.trim())) return `"${s.email}" is not a valid email address.`;
        }
        const emails = signers.map((s) => s.email.toLowerCase().trim());
        if (new Set(emails).size !== emails.length) return 'Duplicate signer emails are not allowed.';
        return null;
    };

    const handleSend = async () => {
        setError(null);
        // Block send if internal party fields are not yet fully filled
        if (orgCheck && !orgCheck.complete) {
            setError('Fill all internal party fields before sending to external signers.');
            return;
        }
        const err = validate();
        if (err) { setError(err); return; }

        setSubmitting(true);
        const assignments: FlowSignerAssignment[] = signers.map(({ email, name, order }) => ({
            email: email.trim(),
            name: name?.trim() || undefined,
            order,
        }));
        const res = await unifiedFlowService.sendForSignatureUnified(contractId, assignments, senderName);
        setSubmitting(false);

        if (res.ok) {
            handleClose();
            onSent();
        } else {
            setError(res.message || 'Failed to send. Please try again.');
        }
    };

    const handleClose = () => {
        if (submitting) return;
        setSigners([newSigner(1)]);
        setError(null);
        onClose();
    };

    const sectionBg = isDark ? alpha('#ffffff', 0.03) : '#f8fafc';
    const sectionBorder = isDark ? alpha('#ffffff', 0.08) : '#e2e8f0';

    return (
        <BaseDialog
            open={open}
            onClose={handleClose}
            title="SEND FOR EXTERNAL SIGNATURE"
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
                        disabled={checkingFields || (orgCheck != null && !orgCheck.complete)}
                        startIcon={<SendOutlined />}
                        onClick={handleSend}
                        sx={{
                            fontWeight: 600,
                            px: 3,
                            bgcolor: '#10b981',
                            '&:hover': { bgcolor: '#059669' },
                            boxShadow: `0 2px 8px ${alpha('#10b981', 0.4)}`,
                        }}
                    >
                        {submitting ? 'Sending…' : 'Send for Signature'}
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

                <Alert
                    severity="info"
                    icon={<InfoOutlined fontSize="inherit" />}
                    sx={{ borderRadius: 2, py: 0.5, '& .MuiAlert-message': { py: 0.25 } }}
                >
                    <Typography variant="caption">
                        External signers will receive a secure email link. They can sign without creating an account.
                        Signers with the same order number are notified simultaneously.
                    </Typography>
                </Alert>

                {/* Internal-field gate: show loading spinner or warning while checking */}
                {checkingFields && (
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                        <CircularProgress size={14} />
                        <Typography variant="caption" color="text.secondary">Checking field completion…</Typography>
                    </Box>
                )}

                {!checkingFields && orgCheck && !orgCheck.complete && (
                    <Alert
                        severity="warning"
                        icon={<WarningAmber fontSize="inherit" />}
                        sx={{ borderRadius: 2, '& .MuiAlert-message': { width: '100%' } }}
                    >
                        <Typography variant="body2" fontWeight={600} sx={{ mb: 0.5 }}>
                            Internal fields must be filled before sending to external signers:
                        </Typography>
                        <List dense disablePadding>
                            {orgCheck.unfilledFields.map((field) => (
                                <ListItem key={field} disableGutters sx={{ py: 0 }}>
                                    <ListItemIcon sx={{ minWidth: 16 }}>
                                        <FiberManualRecord sx={{ fontSize: 6, color: 'warning.main' }} />
                                    </ListItemIcon>
                                    <ListItemText
                                        primary={field}
                                        primaryTypographyProps={{ variant: 'caption', fontWeight: 500 }}
                                    />
                                </ListItem>
                            ))}
                        </List>
                        <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 0.5 }}>
                            Close this dialog, fill the above fields in the contract, then come back to send.
                        </Typography>
                    </Alert>
                )}

                {error && (
                    <Alert severity="error" onClose={() => setError(null)} sx={{ borderRadius: 2 }}>
                        {error}
                    </Alert>
                )}

                {/* Signer rows */}
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
                        <DriveFileRenameOutline sx={{ fontSize: 16, color: '#10b981' }} />
                        <Typography variant="subtitle2" fontWeight={700} sx={{ color: '#10b981' }}>
                            External Signers
                        </Typography>
                        <Typography variant="caption" color="text.secondary" sx={{ ml: 0.5 }}>
                            · {signers.length} signer{signers.length !== 1 ? 's' : ''}
                        </Typography>
                    </Box>

                    <Box sx={{ p: 1, display: 'flex', flexDirection: 'column', gap: 0.75 }}>
                        {signers.map((signer) => (
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
                                {/* Order badge */}
                                <Box
                                    sx={{
                                        minWidth: 22,
                                        height: 22,
                                        borderRadius: '50%',
                                        bgcolor: alpha('#10b981', 0.12),
                                        display: 'flex',
                                        alignItems: 'center',
                                        justifyContent: 'center',
                                        flexShrink: 0,
                                    }}
                                >
                                    <Typography variant="caption" fontWeight={700} sx={{ fontSize: '0.62rem', color: '#10b981' }}>
                                        {signer.order}
                                    </Typography>
                                </Box>

                                {/* Email */}
                                <TextField
                                    size="small"
                                    placeholder="client@example.com"
                                    type="email"
                                    value={signer.email}
                                    onChange={(e) => updateSigner(signer._id, { email: e.target.value })}
                                    sx={{ flex: 2, '& .MuiOutlinedInput-root': { fontSize: '0.82rem' } }}
                                    error={signer.email !== '' && !isValidEmail(signer.email)}
                                />

                                {/* Name (optional) */}
                                <TextField
                                    size="small"
                                    placeholder="Name (optional)"
                                    value={signer.name || ''}
                                    onChange={(e) => updateSigner(signer._id, { name: e.target.value })}
                                    sx={{ flex: 1.5, '& .MuiOutlinedInput-root': { fontSize: '0.82rem' } }}
                                />

                                {/* Signing order */}
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

                                {/* Remove */}
                                <AppButton
                                    size="small"
                                    color="error"
                                    variant="outlined"
                                    onClick={() => removeSigner(signer._id)}
                                    disabled={signers.length === 1}
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
                            onClick={addSigner}
                            sx={{ mt: 0.25, borderColor: alpha('#10b981', 0.4), color: '#10b981', '&:hover': { borderColor: '#10b981', bgcolor: alpha('#10b981', 0.06) } }}
                        >
                            Add Signer
                        </AppButton>
                    </Box>
                </Paper>
            </Box>
        </BaseDialog>
    );
}
