'use client';

import { Box, Typography, Chip, Skeleton, Alert, Tooltip, useTheme } from '@mui/material';
import {
    CheckCircle,
    RadioButtonUnchecked,
    HourglassEmpty,
    EditNote,
    Cancel,
    RateReview,
    ThumbUp,
    KeyboardArrowRight,
} from '@mui/icons-material';
import { alpha } from '@mui/material/styles';
import { useFlowStatus } from '@/hooks/useFlowStatus';
import { ContractStatus } from '@/types/contract';
import type { WorkflowParticipant } from '@/types/unifiedFlow';

interface UnifiedFlowParticipantTimelineProps {
    contractId: string;
    contractStatus?: string;
    /** Passed from the parent when it already has flow status to avoid a duplicate fetch */
    initialParticipants?: WorkflowParticipant[];
}

const formatDate = (iso?: string) => {
    if (!iso) return '';
    return new Date(iso).toLocaleDateString('en-GB', {
        day: '2-digit', month: 'short', year: 'numeric',
        hour: '2-digit', minute: '2-digit',
    });
};

function StatusIcon({ status }: { status: WorkflowParticipant['status'] }) {
    switch (status) {
        case 'completed':
            return <CheckCircle sx={{ fontSize: 20, color: '#10b981' }} />;
        case 'rejected':
            return <Cancel sx={{ fontSize: 20, color: '#ef4444' }} />;
        case 'in_progress':
            return <EditNote sx={{ fontSize: 20, color: '#f59e0b' }} />;
        case 'unlocked':
            return <HourglassEmpty sx={{ fontSize: 20, color: '#3b82f6' }} />;
        default:
            return <RadioButtonUnchecked sx={{ fontSize: 20, color: 'text.disabled' }} />;
    }
}

function statusLabel(status: WorkflowParticipant['status']) {
    switch (status) {
        case 'completed': return 'Completed';
        case 'rejected': return 'Rejected';
        case 'in_progress': return 'In Progress';
        case 'unlocked': return 'Your Turn';
        default: return 'Waiting';
    }
}

function statusColor(status: WorkflowParticipant['status'], isDark: boolean): { bg: string; color: string; border: string } {
    switch (status) {
        case 'completed':
            return isDark
                ? { bg: 'rgba(16,185,129,0.12)', color: '#6ee7b7', border: 'rgba(16,185,129,0.3)' }
                : { bg: '#d1fae5', color: '#065f46', border: '#a7f3d0' };
        case 'rejected':
            return isDark
                ? { bg: 'rgba(239,68,68,0.12)', color: '#fca5a5', border: 'rgba(239,68,68,0.3)' }
                : { bg: '#fee2e2', color: '#991b1b', border: '#fca5a5' };
        case 'in_progress':
            return isDark
                ? { bg: 'rgba(245,158,11,0.12)', color: '#fcd34d', border: 'rgba(245,158,11,0.3)' }
                : { bg: '#fef3c7', color: '#92400e', border: '#fde68a' };
        case 'unlocked':
            return isDark
                ? { bg: 'rgba(59,130,246,0.12)', color: '#93c5fd', border: 'rgba(59,130,246,0.3)' }
                : { bg: '#dbeafe', color: '#1e40af', border: '#bfdbfe' };
        default:
            return isDark
                ? { bg: 'rgba(255,255,255,0.04)', color: 'rgba(255,255,255,0.35)', border: 'rgba(255,255,255,0.1)' }
                : { bg: '#f1f5f9', color: '#64748b', border: '#e2e8f0' };
    }
}

export default function UnifiedFlowParticipantTimeline({
    contractId,
    contractStatus,
    initialParticipants,
}: UnifiedFlowParticipantTimelineProps) {
    const theme = useTheme();
    const isDark = theme.palette.mode === 'dark';

    // Poll when the contract is in an active unified-flow state
    const shouldPoll = [
        ContractStatus.IN_REVIEW,
        ContractStatus.IN_APPROVAL,
    ].includes(contractStatus as ContractStatus);

    const { flowStatus, loading, error } = useFlowStatus(contractId, true, shouldPoll);

    const participants: WorkflowParticipant[] =
        flowStatus?.participants ?? initialParticipants ?? [];

    const isAllComplete = contractStatus === ContractStatus.READY_FOR_SIGNATURE ||
        participants.every(p => p.status === 'completed');

    if (loading && participants.length === 0) {
        return (
            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
                {[1, 2, 3].map(i => (
                    <Skeleton key={i} variant="rounded" height={64} sx={{ borderRadius: 2 }} />
                ))}
            </Box>
        );
    }

    if (error) {
        return <Alert severity="error" sx={{ borderRadius: 2 }}>{error}</Alert>;
    }

    if (participants.length === 0) return null;

    // Group participants by order for visual grouping
    const orderGroups = Array.from(new Set(participants.map(p => p.order))).sort((a, b) => a - b);

    return (
        <Box>
            <Typography variant="subtitle2" fontWeight={700} sx={{ mb: 1.5, color: 'text.secondary', textTransform: 'uppercase', letterSpacing: 0.5, fontSize: '0.7rem' }}>
                Unified Workflow Progress
            </Typography>

            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.5 }}>
                {orderGroups.map((order, groupIdx) => {
                    const atOrder = participants.filter(p => p.order === order);
                    return (
                        <Box key={order}>
                            {/* Order connector line */}
                            {groupIdx > 0 && (
                                <Box sx={{ display: 'flex', justifyContent: 'center', py: 0.25 }}>
                                    <KeyboardArrowRight sx={{ fontSize: 16, color: 'text.disabled', transform: 'rotate(90deg)' }} />
                                </Box>
                            )}

                            {/* Participants at this order */}
                            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.5 }}>
                                {atOrder.map((participant, idx) => {
                                    const sc = statusColor(participant.status, isDark);
                                    return (
                                        <Box
                                            key={`${participant.email}-${idx}`}
                                            sx={{
                                                display: 'flex',
                                                alignItems: 'flex-start',
                                                gap: 1.5,
                                                p: 1.25,
                                                borderRadius: 2,
                                                border: '1px solid',
                                                borderColor: sc.border,
                                                bgcolor: sc.bg,
                                                transition: 'all 0.2s',
                                            }}
                                        >
                                            {/* Order badge */}
                                            <Box
                                                sx={{
                                                    minWidth: 24,
                                                    height: 24,
                                                    borderRadius: '50%',
                                                    bgcolor: isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.07)',
                                                    display: 'flex',
                                                    alignItems: 'center',
                                                    justifyContent: 'center',
                                                    flexShrink: 0,
                                                    mt: 0.1,
                                                }}
                                            >
                                                <Typography variant="caption" fontWeight={700} sx={{ fontSize: '0.65rem', lineHeight: 1 }}>
                                                    {order}
                                                </Typography>
                                            </Box>

                                            {/* Status icon */}
                                            <Box sx={{ mt: 0.1, flexShrink: 0 }}>
                                                <StatusIcon status={participant.status} />
                                            </Box>

                                            {/* Name + email */}
                                            <Box sx={{ flex: 1, minWidth: 0 }}>
                                                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap' }}>
                                                    <Typography variant="body2" fontWeight={600} noWrap sx={{ maxWidth: { xs: 120, sm: 200 } }}>
                                                        {participant.name || participant.email.split('@')[0]}
                                                    </Typography>
                                                    <Chip
                                                        icon={participant.role === 'REVIEWER' ? <RateReview sx={{ fontSize: '11px !important' }} /> : <ThumbUp sx={{ fontSize: '11px !important' }} />}
                                                        label={participant.role === 'REVIEWER' ? 'Reviewer' : 'Approver'}
                                                        size="small"
                                                        sx={{
                                                            height: 18,
                                                            fontSize: '0.62rem',
                                                            fontWeight: 600,
                                                            bgcolor: participant.role === 'REVIEWER'
                                                                ? (isDark ? alpha('#3b82f6', 0.15) : '#eff6ff')
                                                                : (isDark ? alpha('#10b981', 0.15) : '#f0fdf4'),
                                                            color: participant.role === 'REVIEWER'
                                                                ? (isDark ? '#93c5fd' : '#1d4ed8')
                                                                : (isDark ? '#6ee7b7' : '#166534'),
                                                            border: '1px solid',
                                                            borderColor: participant.role === 'REVIEWER'
                                                                ? (isDark ? alpha('#3b82f6', 0.3) : '#bfdbfe')
                                                                : (isDark ? alpha('#10b981', 0.3) : '#bbf7d0'),
                                                            '& .MuiChip-icon': { color: 'inherit' },
                                                        }}
                                                    />
                                                </Box>
                                                <Typography variant="caption" color="text.secondary" noWrap>
                                                    {participant.email}
                                                </Typography>

                                                {/* Rejection comment */}
                                                {participant.status === 'rejected' && participant.comments && (
                                                    <Tooltip title={participant.comments} arrow>
                                                        <Typography
                                                            variant="caption"
                                                            sx={{
                                                                display: 'block',
                                                                mt: 0.25,
                                                                color: '#ef4444',
                                                                fontStyle: 'italic',
                                                                overflow: 'hidden',
                                                                textOverflow: 'ellipsis',
                                                                whiteSpace: 'nowrap',
                                                                maxWidth: { xs: 160, sm: 280 },
                                                            }}
                                                        >
                                                            "{participant.comments}"
                                                        </Typography>
                                                    </Tooltip>
                                                )}
                                            </Box>

                                            {/* Right side: status chip + timestamp */}
                                            <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 0.25, flexShrink: 0 }}>
                                                <Chip
                                                    label={statusLabel(participant.status)}
                                                    size="small"
                                                    sx={{
                                                        height: 18,
                                                        fontSize: '0.62rem',
                                                        fontWeight: 600,
                                                        bgcolor: 'transparent',
                                                        color: sc.color,
                                                        border: `1px solid ${sc.border}`,
                                                    }}
                                                />
                                                {(participant.completedAt || participant.rejectedAt) && (
                                                    <Typography variant="caption" color="text.disabled" sx={{ fontSize: '0.6rem', textAlign: 'right' }}>
                                                        {formatDate(participant.completedAt || participant.rejectedAt)}
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

            {/* All complete banner */}
            {isAllComplete && (
                <Box
                    sx={{
                        mt: 1.5,
                        p: 1.25,
                        borderRadius: 2,
                        bgcolor: isDark ? alpha('#10b981', 0.1) : '#d1fae5',
                        border: '1px solid',
                        borderColor: isDark ? alpha('#10b981', 0.3) : '#6ee7b7',
                        display: 'flex',
                        alignItems: 'center',
                        gap: 1,
                    }}
                >
                    <CheckCircle sx={{ fontSize: 18, color: '#10b981' }} />
                    <Typography variant="body2" fontWeight={600} sx={{ color: isDark ? '#6ee7b7' : '#065f46' }}>
                        All internal participants have completed — ready for signature.
                    </Typography>
                </Box>
            )}
        </Box>
    );
}
