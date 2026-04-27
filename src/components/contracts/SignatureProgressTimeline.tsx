'use client';

/**
 * SignatureProgressTimeline
 *
 * Compact timeline view of multi-party signing progress.
 * Shows each signing order as a timeline node with inline signer chips.
 * Includes finalization controls.
 */

import React from 'react';
import { useTranslations } from 'next-intl';
import {
    Box,
    Typography,
    Chip,
    Paper,
    Alert,
    Tooltip,
    useTheme,
} from '@mui/material';
import { alpha } from '@mui/material/styles';
import AppButton from '@/components/common/AppButton';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import HourglassEmptyIcon from '@mui/icons-material/HourglassEmpty';
import DoneAllIcon from '@mui/icons-material/DoneAll';
import PersonIcon from '@mui/icons-material/Person';
import EmailIcon from '@mui/icons-material/Email';

interface SignatureProgressTimelineProps {
    contract: any;
    isFinalized: boolean;
    canFinalize: boolean;
    currentOrder: number | null | undefined;
    uniqueOrders: number[];
    finalizing: boolean;
    finalizeError: string | null;
    finalizeSuccess: boolean;
    onFinalize: () => void;
}

export default function SignatureProgressTimeline({
    contract,
    isFinalized,
    canFinalize,
    currentOrder,
    uniqueOrders,
    finalizing,
    finalizeError,
    finalizeSuccess,
    onFinalize,
}: SignatureProgressTimelineProps) {
    const t = useTranslations('contractDetail');
    const theme = useTheme();
    const primaryColor = theme.palette.primary.main;
    const isDark = theme.palette.mode === 'dark';

    // Theme palette tokens — no hardcoded hex
    const successColor = theme.palette.success.main;
    const successDark  = theme.palette.success.dark;
    const warningColor = theme.palette.warning.main;
    const infoColor    = theme.palette.info.main;

    // Derive parties from formFields when contract.parties is empty (e.g. renewal contracts)
    const effectiveParties: { id: string; color: string; label: string }[] = React.useMemo(() => {
        if (contract.parties && contract.parties.length > 0) return contract.parties;
        const seen = new Map<string, { id: string; color: string; label: string }>();
        for (const f of (contract.formFields || [])) {
            if (f.assignedParty && !seen.has(f.assignedParty)) {
                seen.set(f.assignedParty, {
                    id: f.assignedParty,
                    label: f.partyLabel || f.assignedParty,
                    color: f.partyColor || '#666',
                });
            }
        }
        return Array.from(seen.values());
    }, [contract.parties, contract.formFields]);

    return (
        <Paper
            elevation={0}
            sx={{
                p: 1,
                border: '1px solid',
                borderColor: isFinalized
                    ? alpha(successColor, isDark ? 0.28 : 0.5)
                    : 'divider',
                borderRadius: 2.5,
                bgcolor: isFinalized
                    ? alpha(successColor, isDark ? 0.06 : 0.05)
                    : isDark ? 'background.paper' : '#f8f9fb',
            }}
        >
            {/* Header row */}
            <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 1.5 }}>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                    <Typography variant="h6">
                        {isFinalized ? t('contractFinalized') : t('signatureProgress')}
                    </Typography>
                    {currentOrder && !isFinalized && (
                        <Chip
                            label={t('orderActive', { order: currentOrder })}
                            size="small"
                            sx={{
                                bgcolor: primaryColor,
                                color: '#fff',
                                fontWeight: 600,
                                fontSize: '0.65rem',
                                height: 20,
                            }}
                        />
                    )}
                </Box>
                {isFinalized && contract.finalizedAt && (
                    <Typography variant="caption" color="text.secondary">
                        {new Date(contract.finalizedAt).toLocaleDateString('en-GB')}
                    </Typography>
                )}
            </Box>

            {/* Horizontal timeline */}
            <Box sx={{ display: 'flex', alignItems: 'flex-start', gap: 0, width: '100%' }}>
                {uniqueOrders.map((order: number, orderIdx: number) => {
                    const internalAtOrder = (contract.internalSigners || []).filter((s: any) => s.order === order);
                    const externalAtOrder = (contract.externalSigners || []).filter((s: any) => s.order === order);
                    const allAtOrder = [...internalAtOrder, ...externalAtOrder];
                    const allComplete = allAtOrder.every((s: any) => s.status === 'completed');
                    const isCurrentOrder = order === currentOrder;
                    const isLast = orderIdx === uniqueOrders.length - 1;

                    return (
                        <Box key={order} sx={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', minWidth: 0 }}>
                            {/* Dot + horizontal connector row */}
                            <Box sx={{ display: 'flex', alignItems: 'center', width: '100%' }}>
                                {/* Left connector line */}
                                {orderIdx > 0 ? (
                                    <Box sx={{
                                        flex: 1,
                                        height: 2,
                                        bgcolor: allComplete
                                            ? alpha(successColor, 0.40)
                                            : alpha(theme.palette.divider, isDark ? 1 : 0.5),
                                    }} />
                                ) : (
                                    <Box sx={{ flex: 1 }} />
                                )}

                                {/* Dot */}
                                <Box
                                    sx={{
                                        width: 22,
                                        height: 22,
                                        borderRadius: '50%',
                                        display: 'flex',
                                        alignItems: 'center',
                                        justifyContent: 'center',
                                        flexShrink: 0,
                                        bgcolor: allComplete
                                            ? successDark
                                            : isCurrentOrder ? primaryColor
                                            : alpha(theme.palette.text.disabled, 0.3),
                                        border: isCurrentOrder && !allComplete ? `2px solid ${primaryColor}` : 'none',
                                        boxShadow: isCurrentOrder ? `0 0 0 3px ${alpha(primaryColor, 0.15)}` : 'none',
                                    }}
                                >
                                    {allComplete ? (
                                        <CheckCircleIcon sx={{ color: '#fff', fontSize: 15 }} />
                                    ) : (
                                        <Typography sx={{ color: '#fff', fontSize: '0.6rem', fontWeight: 800, lineHeight: 1 }}>
                                            {order}
                                        </Typography>
                                    )}
                                </Box>

                                {/* Right connector line */}
                                {!isLast ? (
                                    <Box sx={{
                                        flex: 1,
                                        height: 2,
                                        bgcolor: allComplete
                                            ? alpha(successColor, 0.40)
                                            : alpha(theme.palette.divider, isDark ? 1 : 0.5),
                                    }} />
                                ) : (
                                    <Box sx={{ flex: 1 }} />
                                )}
                            </Box>

                            {/* Background card wrapping label + signer cards */}
                            <Box sx={{
                                mt: 0.5,
                                mx: 0.25,
                                p: 0.75,
                                borderRadius: 1.5,
                                width: 'calc(100% - 4px)',
                                border: '1px solid',
                                bgcolor: allComplete
                                    ? alpha(successColor, isDark ? 0.08 : 0.06)
                                    : isCurrentOrder
                                        ? alpha(primaryColor, 0.06)
                                        : alpha(theme.palette.text.primary, isDark ? 0.03 : 0.02),
                                borderColor: allComplete
                                    ? alpha(successColor, isDark ? 0.22 : 0.30)
                                    : isCurrentOrder
                                        ? alpha(primaryColor, 0.22)
                                        : 'divider',
                            }}>
                                {/* Order label */}
                                <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 0.25, mb: 0.5 }}>
                                    {isCurrentOrder && !allComplete && (
                                        <Typography variant="caption" sx={{ fontSize: '0.55rem', color: primaryColor, fontWeight: 700 }}>
                                            {t('inProgress')}
                                        </Typography>
                                    )}
                                    {!isCurrentOrder && !allComplete && (
                                        <Typography variant="caption" sx={{ fontSize: '0.55rem' }} color="text.disabled">
                                            {t('pending')}
                                        </Typography>
                                    )}
                                    {allComplete && (
                                        <Typography variant="caption" sx={{ fontSize: '0.55rem', color: isDark ? alpha(successColor, 0.65) : successColor, fontWeight: 700 }}>
                                            {t('done')}
                                        </Typography>
                                    )}
                                </Box>

                                {/* Signers cards */}
                                <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.5, width: '100%' }}>
                                    {allAtOrder.map((signer: any, index: number) => {
                                        const isInternal = internalAtOrder.includes(signer);
                                        const partyColor = effectiveParties.find((p: any) => p.id === signer.partyId)?.color || '#666';
                                        const isCompleted = signer.status === 'completed';
                                        const isUnlocked = signer.status === 'unlocked';

                                        return (
                                            <Box
                                                key={signer.token || signer.email || index}
                                                sx={{
                                                    display: 'flex',
                                                    alignItems: 'flex-start',
                                                    gap: 0.75,
                                                    py: 0.5,
                                                    px: 1,
                                                    borderRadius: 1.5,
                                                    bgcolor: isCompleted
                                                        ? alpha(successColor, isDark ? 0.08 : 0.06)
                                                        : isUnlocked
                                                            ? alpha(warningColor, isDark ? 0.08 : 0.06)
                                                            : alpha(theme.palette.text.primary, isDark ? 0.03 : 0.02),
                                                    border: '1px solid',
                                                    borderColor: isCompleted
                                                        ? alpha(successColor, isDark ? 0.22 : 0.30)
                                                        : isUnlocked
                                                            ? alpha(warningColor, isDark ? 0.22 : 0.25)
                                                            : 'divider',
                                                    transition: 'all 0.15s',
                                                }}
                                            >
                                                {/* Signer info */}
                                                <Box sx={{ minWidth: 0, flex: 1 }}>
                                                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                                                        {/* Status icon */}
                                                        {isCompleted ? (
                                                            <CheckCircleIcon sx={{ color: successColor, fontSize: 14, flexShrink: 0 }} />
                                                        ) : isUnlocked ? (
                                                            <HourglassEmptyIcon sx={{ color: warningColor, fontSize: 14, flexShrink: 0 }} />
                                                        ) : (
                                                            <Box sx={{
                                                                width: 14,
                                                                height: 14,
                                                                borderRadius: '50%',
                                                                border: `2px solid ${alpha(theme.palette.text.disabled, 0.4)}`,
                                                                flexShrink: 0,
                                                            }} />
                                                        )}
                                                        {/* Party dot */}
                                                        <Tooltip title={signer.partyLabel} arrow>
                                                            <Box sx={{
                                                                width: 8,
                                                                height: 8,
                                                                borderRadius: '50%',
                                                                bgcolor: partyColor,
                                                                flexShrink: 0,
                                                            }} />
                                                        </Tooltip>
                                                        <Typography variant="caption" sx={{
                                                            fontWeight: 600,
                                                            overflow: 'hidden',
                                                            textOverflow: 'ellipsis',
                                                            whiteSpace: 'nowrap',
                                                            color: isCompleted ? (isDark ? alpha(successColor, 0.65) : successColor) : 'text.primary',
                                                        }}>
                                                            {signer.name || signer.email}
                                                        </Typography>
                                                        {isInternal ? (
                                                            <PersonIcon sx={{ fontSize: 11, color: infoColor }} />
                                                        ) : (
                                                            <EmailIcon sx={{ fontSize: 11, color: warningColor }} />
                                                        )}
                                                    </Box>
                                                </Box>
                                                {/* Completion date */}
                                                {isCompleted && signer.completedAt && (
                                                    <Typography variant="caption" color="text.secondary" sx={{ fontSize: '0.6rem', lineHeight: 1, flexShrink: 0, mt: 0.25 }}>
                                                        {new Date(signer.completedAt).toLocaleDateString('en-GB')}
                                                    </Typography>
                                                )}
                                            </Box>
                                        );
                                    })}
                                </Box>
                            </Box>
                        </Box>
                    );
                })}
            </Box>

            {/* Finalize / waiting section */}
            {!isFinalized && (
                <Box sx={{ mt: 1.5, pt: 1.5, borderTop: '1px solid', borderColor: 'divider' }}>
                    {canFinalize ? (
                        <Box>
                            <Alert severity="success" sx={{ mb: 1.5, py: 0.25, '& .MuiAlert-message': { fontSize: '0.75rem' } }}>
                                <Typography variant="body2" color="inherit">{t('allPartiesCompleted')}</Typography>
                            </Alert>
                            {finalizeError && (
                                <Alert severity="error" sx={{ mb: 1, py: 0.25, '& .MuiAlert-message': { fontSize: '0.75rem' } }}>
                                    <Typography variant="body2" color="inherit">{finalizeError}</Typography>
                                </Alert>
                            )}
                            {finalizeSuccess && (
                                <Alert severity="success" sx={{ mb: 1, py: 0.25, '& .MuiAlert-message': { fontSize: '0.75rem' } }}>
                                    <Typography variant="body2" color="inherit">{t('finalizeSuccess')}</Typography>
                                </Alert>
                            )}
                            <AppButton
                                variant="contained"
                                size="small"
                                onClick={onFinalize}
                                disabled={finalizeSuccess}
                                loading={finalizing}
                                startIcon={<DoneAllIcon sx={{ fontSize: 16 }} />}
                                sx={{
                                    fontWeight: 600,
                                    fontSize: '0.8rem',
                                    borderRadius: 1.5,
                                    px: 2,
                                }}
                            >
                                {finalizing ? t('finalizing') : t('finalizeContract')}
                            </AppButton>
                        </Box>
                    ) : (
                        <Alert severity="info" sx={{ py: 0.25, '& .MuiAlert-message': { fontSize: '0.75rem' } }}>
                            <Typography variant="body2" color="inherit">{t('waitingForParties')}</Typography>
                        </Alert>
                    )}
                </Box>
            )}

            {isFinalized && (
                <Box sx={{ mt: 1, borderColor: 'divider'}}>
                    <Alert icon={<DoneAllIcon />} sx={{ py: 0.25, '& .MuiAlert-message': { fontSize: '0.75rem' }, '& .MuiAlert-icon': { color: isDark ? alpha(successColor, 0.75) : successColor } }}>
                        <Typography variant="body2" color="text.primary">{t('finalizedCopy')}</Typography>
                    </Alert>
                </Box>
            )}
        </Paper>
    );
}