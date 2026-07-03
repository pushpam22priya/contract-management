'use client';

import { Box, Typography, Alert, List, ListItem, ListItemIcon, ListItemText, Skeleton, useTheme } from '@mui/material';
import { CheckCircle, WarningAmber, FiberManualRecord, AutoAwesome } from '@mui/icons-material';
import { alpha } from '@mui/material/styles';
import { useFlowStatus } from '@/hooks/useFlowStatus';
import AppButton from '@/components/common/AppButton';

interface UnifiedFlowOrgGateStatusProps {
    contractId: string;
    onSendForSignature: () => void;
    onEditContract?: () => void;
    externalSigningIncluded?: boolean;
    /** Current contract status — used to short-circuit rendering for Case A */
    contractStatus?: string;
}

export default function UnifiedFlowOrgGateStatus({
    contractId,
    onSendForSignature,
    onEditContract,
    externalSigningIncluded = false,
    contractStatus,
}: UnifiedFlowOrgGateStatusProps) {
    const theme = useTheme();
    const isDark = theme.palette.mode === 'dark';

    // Case A (externalSigningIncluded=false): only relevant once status is READY_FOR_SIGNATURE.
    // Skip the API fetch entirely until then to avoid unnecessary requests.
    const isReadyForSig = contractStatus === 'READY_FOR_SIGNATURE';
    const shouldFetch = externalSigningIncluded || isReadyForSig;

    const { flowStatus, loading, error, refresh } = useFlowStatus(contractId, shouldFetch, false);

    // ─── Case A: no external signing at submit time ────────────────────────────
    // Show nothing until status reaches READY_FOR_SIGNATURE.
    if (!externalSigningIncluded) {
        if (!isReadyForSig) return null;

        // All approvals done — owner can now collect external signers and send.
        return (
            <Box
                sx={{
                    p: 2,
                    borderRadius: 2.5,
                    border: '1px solid',
                    borderColor: isDark ? alpha('#10b981', 0.35) : '#6ee7b7',
                    bgcolor: isDark ? alpha('#10b981', 0.07) : '#f0fdf4',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    gap: 2,
                    flexWrap: 'wrap',
                }}
            >
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
                    <CheckCircle sx={{ color: '#10b981', flexShrink: 0 }} />
                    <Box>
                        <Typography variant="subtitle2" fontWeight={700} sx={{ color: isDark ? '#6ee7b7' : '#065f46' }}>
                            All approvals complete — ready for external signatures
                        </Typography>
                        <Typography variant="caption" color="text.secondary">
                            Enter the external client details to send the contract for signing.
                        </Typography>
                    </Box>
                </Box>
                <AppButton
                    variant="contained"
                    size="small"
                    onClick={onSendForSignature}
                    sx={{ bgcolor: '#10b981', '&:hover': { bgcolor: '#059669' }, boxShadow: `0 2px 8px ${alpha('#10b981', 0.4)}`, flexShrink: 0 }}
                >
                    Send for Signature
                </AppButton>
            </Box>
        );
    }

    // ─── Case B: externalSigningIncluded=true ─────────────────────────────────
    // Signers were set at submit time — auto-trigger fires after last approver.
    // Show org field completeness so owner knows what reviewers/approvers still need to fill.
    // The "Send for Signature" button is hidden (auto-triggered), except as a fallback
    // if the auto-trigger failed (status still READY_FOR_SIGNATURE).

    if (loading && !flowStatus) {
        return <Skeleton variant="rounded" height={80} sx={{ borderRadius: 2 }} />;
    }

    if (error) {
        return (
            <Alert
                severity="error"
                action={<AppButton size="small" variant="outlined" onClick={refresh}>Retry</AppButton>}
                sx={{ borderRadius: 2 }}
            >
                {error}
            </Alert>
        );
    }

    if (!flowStatus) return null;

    const { orgFieldsComplete, unfilledOrgFields, status: flowStatusValue } = flowStatus;

    // Auto-trigger already worked → no action needed from owner
    if (flowStatusValue === 'IN_SIGNATURE') return null;

    // Auto-trigger failed (still READY_FOR_SIGNATURE despite externalSigningIncluded=true)
    if (flowStatusValue === 'READY_FOR_SIGNATURE') {
        return (
            <Box
                sx={{
                    p: 2,
                    borderRadius: 2.5,
                    border: '1px solid',
                    borderColor: isDark ? alpha('#f59e0b', 0.35) : '#fcd34d',
                    bgcolor: isDark ? alpha('#f59e0b', 0.07) : '#fffbeb',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    gap: 2,
                    flexWrap: 'wrap',
                }}
            >
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
                    <WarningAmber sx={{ color: '#f59e0b', flexShrink: 0 }} />
                    <Box>
                        <Typography variant="subtitle2" fontWeight={700} sx={{ color: isDark ? '#fcd34d' : '#92400e' }}>
                            Automatic signature emails could not be sent
                        </Typography>
                        <Typography variant="caption" color="text.secondary">
                            All approvals are complete. Please send the signature request manually.
                        </Typography>
                    </Box>
                </Box>
                <AppButton
                    variant="contained"
                    size="small"
                    onClick={onSendForSignature}
                    sx={{ bgcolor: '#f59e0b', '&:hover': { bgcolor: '#d97706' }, flexShrink: 0 }}
                >
                    Send for Signature
                </AppButton>
            </Box>
        );
    }

    // Normal Case B: IN_REVIEW or IN_APPROVAL — show org field gate (no send button)
    return (
        <Box
            sx={{
                p: 2,
                borderRadius: 2.5,
                border: '1px solid',
                borderColor: orgFieldsComplete
                    ? (isDark ? alpha('#10b981', 0.35) : '#6ee7b7')
                    : (isDark ? alpha('#f59e0b', 0.35) : '#fcd34d'),
                bgcolor: orgFieldsComplete
                    ? (isDark ? alpha('#10b981', 0.07) : '#f0fdf4')
                    : (isDark ? alpha('#f59e0b', 0.07) : '#fffbeb'),
            }}
        >
            <Box sx={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 2, flexWrap: 'wrap' }}>
                <Box sx={{ display: 'flex', alignItems: 'flex-start', gap: 1.5, flex: 1 }}>
                    {orgFieldsComplete ? (
                        <CheckCircle sx={{ color: '#10b981', mt: 0.25, flexShrink: 0 }} />
                    ) : (
                        <WarningAmber sx={{ color: '#f59e0b', mt: 0.25, flexShrink: 0 }} />
                    )}
                    <Box>
                        <Typography variant="subtitle2" fontWeight={700} sx={{ color: orgFieldsComplete ? (isDark ? '#6ee7b7' : '#065f46') : (isDark ? '#fcd34d' : '#92400e') }}>
                            {orgFieldsComplete
                                ? 'All organisation fields complete — signature emails will be sent automatically after approval'
                                : 'Organisation fields incomplete'}
                        </Typography>

                        {!orgFieldsComplete && unfilledOrgFields.length > 0 && (
                            <Box sx={{ mt: 0.75 }}>
                                <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 0.5 }}>
                                    The following fields must be filled before signatures can be sent:
                                </Typography>
                                <List dense disablePadding>
                                    {unfilledOrgFields.map((field) => (
                                        <ListItem key={field} disableGutters sx={{ py: 0 }}>
                                            <ListItemIcon sx={{ minWidth: 18 }}>
                                                <FiberManualRecord sx={{ fontSize: 6, color: '#f59e0b' }} />
                                            </ListItemIcon>
                                            <ListItemText
                                                primary={field}
                                                primaryTypographyProps={{ variant: 'caption', fontWeight: 500 }}
                                            />
                                        </ListItem>
                                    ))}
                                </List>
                            </Box>
                        )}

                        {orgFieldsComplete && (
                            <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, mt: 0.5 }}>
                                <AutoAwesome sx={{ fontSize: 12, color: '#10b981' }} />
                                <Typography variant="caption" color="text.secondary">
                                    Signature emails will be sent automatically once the approver completes.
                                </Typography>
                            </Box>
                        )}
                    </Box>
                </Box>

                {!orgFieldsComplete && onEditContract && (
                    <AppButton
                        variant="outlined"
                        size="small"
                        onClick={onEditContract}
                        sx={{ borderColor: '#f59e0b', color: '#f59e0b', '&:hover': { borderColor: '#d97706', bgcolor: alpha('#f59e0b', 0.06) }, flexShrink: 0 }}
                    >
                        Edit Contract
                    </AppButton>
                )}
            </Box>
        </Box>
    );
}
