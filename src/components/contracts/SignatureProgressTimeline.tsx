'use client';

/**
 * SignatureProgressTimeline
 *
 * Compact timeline view of multi-party signing progress.
 * Shows each signing order as a timeline node with inline signer chips.
 * Includes finalization controls.
 */

import React from 'react';
import {
    Box,
    Typography,
    Chip,
    Paper,
    Alert,
    Button,
    Tooltip,
    CircularProgress,
} from '@mui/material';
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
    return (
        <Paper
            elevation={0}
            sx={{
                mt: 2,
                p: 1,
                border: '1px solid',
                borderColor: isFinalized ? '#a5d6a7' : 'divider',
                borderRadius: 2.5,
                bgcolor: isFinalized ? '#f1f8e9' : 'background.paper',
            }}
        >
            {/* Header row */}
            <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 1.5 }}>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                    <Typography variant="subtitle2" fontWeight={700} sx={{ fontSize: '1rem' }}>
                        {isFinalized ? 'Contract Finalized' : 'Signature Progress'}
                    </Typography>
                    {currentOrder && !isFinalized && (
                        <Chip
                            label={`Order ${currentOrder} active`}
                            size="small"
                            sx={{
                                bgcolor: '#0f766e',
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
                        {new Date(contract.finalizedAt).toLocaleDateString()}
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
                    const isFutureOrder = currentOrder ? order > currentOrder : (!isFinalized && !allComplete);
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
                                        bgcolor: allComplete ? '#a5d6a7' : '#e0e0e0',
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
                                        bgcolor: allComplete ? '#2e7d32' : isCurrentOrder ? '#0f766e' : '#bdbdbd',
                                        border: isCurrentOrder && !allComplete ? '2px solid #0f766e' : 'none',
                                        boxShadow: isCurrentOrder ? '0 0 0 3px rgba(15,118,110,0.15)' : 'none',
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
                                        // Color based on whether the NEXT order's signers are all complete
                                        bgcolor: allComplete ? '#a5d6a7' : '#e0e0e0',
                                    }} />
                                ) : (
                                    <Box sx={{ flex: 1 }} />
                                )}
                            </Box>

                            {/* Order label */}
                            <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 0.25, mt: 0.5, mb: 0.5 }}>
                                <Typography variant="caption" sx={{
                                    fontWeight: 700,
                                    fontSize: '0.65rem',
                                    color: allComplete ? '#2e7d32' : isCurrentOrder ? '#0f766e' : 'text.secondary',
                                    textTransform: 'uppercase',
                                    letterSpacing: '0.5px',
                                }}>
                                    Order {order}
                                </Typography>
                                {isCurrentOrder && !allComplete && (
                                    <Box sx={{
                                        px: 0.75,
                                        py: 0.1,
                                        borderRadius: 0.75,
                                        bgcolor: 'rgba(15,118,110,0.08)',
                                    }}>
                                        <Typography variant="caption" sx={{
                                            fontSize: '0.55rem',
                                            color: '#0f766e',
                                            fontWeight: 600,
                                        }}>
                                            In Progress
                                        </Typography>
                                    </Box>
                                )}
                                {isFutureOrder && !allComplete && (
                                    <Typography variant="caption" sx={{ fontSize: '0.55rem', color: 'text.disabled' }}>
                                        Queued
                                    </Typography>
                                )}
                                {allComplete && (
                                    <Typography variant="caption" sx={{ fontSize: '0.55rem', color: '#66bb6a' }}>
                                        Done
                                    </Typography>
                                )}
                            </Box>

                            {/* Signers cards — stacked below */}
                            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.5, width: '100%', px: 0.5 }}>
                                {allAtOrder.map((signer: any, index: number) => {
                                    const isInternal = internalAtOrder.includes(signer);
                                    const partyColor = contract.parties?.find((p: any) => p.id === signer.partyId)?.color || '#666';
                                    const isCompleted = signer.status === 'completed';
                                    const isUnlocked = signer.status === 'unlocked';

                                    return (
                                        <Box
                                            key={signer.token || signer.email || index}
                                            sx={{
                                                display: 'flex',
                                                alignItems: 'center',
                                                gap: 0.75,
                                                py: 0.5,
                                                px: 1,
                                                borderRadius: 1.5,
                                                bgcolor: isCompleted ? '#e8f5e9' : isUnlocked ? '#fff8e1' : '#fafafa',
                                                border: '1px solid',
                                                borderColor: isCompleted ? '#c8e6c9' : isUnlocked ? '#fff0b8' : '#eee',
                                                transition: 'all 0.15s',
                                            }}
                                        >
                                            {/* Signer info */}
                                            <Box sx={{ minWidth: 0, flex: 1 }}>
                                                <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                                                    {/* Status icon — inline with name */}
                                                    {isCompleted ? (
                                                        <CheckCircleIcon sx={{ color: '#2e7d32', fontSize: 14, flexShrink: 0 }} />
                                                    ) : isUnlocked ? (
                                                        <HourglassEmptyIcon sx={{ color: '#f9a825', fontSize: 14, flexShrink: 0 }} />
                                                    ) : (
                                                        <Box sx={{
                                                            width: 14,
                                                            height: 14,
                                                            borderRadius: '50%',
                                                            border: '2px solid #ccc',
                                                            flexShrink: 0,
                                                        }} />
                                                    )}
                                                    {/* Party dot — always before name */}
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
                                                        fontSize: '0.65rem',
                                                        overflow: 'hidden',
                                                        textOverflow: 'ellipsis',
                                                        whiteSpace: 'nowrap',
                                                        color: isCompleted ? '#1b5e20' : 'text.primary',
                                                    }}>
                                                        {signer.name || signer.email}
                                                    </Typography>
                                                    {isInternal ? (
                                                        <PersonIcon sx={{ fontSize: 11, color: '#64b5f6' }} />
                                                    ) : (
                                                        <EmailIcon sx={{ fontSize: 11, color: '#ffb74d' }} />
                                                    )}
                                                </Box>
                                                {isCompleted && signer.completedAt && (
                                                    <Typography variant="caption" sx={{ fontSize: '0.55rem', color: '#66bb6a', lineHeight: 1 }}>
                                                        {new Date(signer.completedAt).toLocaleDateString()}
                                                    </Typography>
                                                )}
                                            </Box>
                                        </Box>
                                    );
                                })}
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
                            <Alert severity="success" sx={{ mb: 1.5, py: 0.25, '& .MuiAlert-message': { fontSize: '0.8rem' } }}>
                                <strong>All parties completed!</strong> Finalize to activate and notify signers.
                            </Alert>
                            {finalizeError && (
                                <Alert severity="error" sx={{ mb: 1, py: 0.25, '& .MuiAlert-message': { fontSize: '0.8rem' } }}>
                                    {finalizeError}
                                </Alert>
                            )}
                            {finalizeSuccess && (
                                <Alert severity="success" sx={{ mb: 1, py: 0.25, '& .MuiAlert-message': { fontSize: '0.8rem' } }}>
                                    Contract finalized! Emails sent to all signers.
                                </Alert>
                            )}
                            <Button
                                variant="contained"
                                size="small"
                                onClick={onFinalize}
                                disabled={finalizing || finalizeSuccess}
                                startIcon={finalizing ? <CircularProgress size={16} color="inherit" /> : <DoneAllIcon sx={{ fontSize: 16 }} />}
                                sx={{
                                    fontWeight: 600,
                                    fontSize: '0.8rem',
                                    textTransform: 'none',
                                    borderRadius: 1.5,
                                    px: 2,
                                }}
                            >
                                {finalizing ? 'Finalizing...' : 'Finalize Contract'}
                            </Button>
                        </Box>
                    ) : (
                        <Alert severity="info" sx={{ py: 0.25, '& .MuiAlert-message': { fontSize: '0.8rem' } }}>
                            {currentOrder
                                ? `Waiting for Order ${currentOrder} signers to complete.`
                                : 'Waiting for all parties to complete before finalization.'
                            }
                        </Alert>
                    )}
                </Box>
            )}

            {isFinalized && (
                <Box sx={{ mt: 1.5, borderTop: '1px solid', borderColor: 'divider' }}>
                    <Alert severity="success" icon={<DoneAllIcon />} sx={{ py: 0.25, '& .MuiAlert-message': { fontSize: '0.8rem' } }}>
                        Contract finalized — all signers have received a copy.
                    </Alert>
                </Box>
            )}
        </Paper>
    );
}
