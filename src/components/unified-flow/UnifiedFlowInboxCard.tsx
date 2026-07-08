'use client';

import { useState } from 'react';
import {
    Box, Typography, Chip, IconButton, Tooltip, Popover, useTheme,
} from '@mui/material';
import {
    AccessTime, Person, AccountCircle, MoreVert,
    Visibility, CheckCircle, Cancel, RateReview, ThumbUp,
    AutoAwesome,
} from '@mui/icons-material';
import { alpha } from '@mui/material/styles';
import AppButton from '@/components/common/AppButton';
import { authService } from '@/services/authService';
import type { Contract } from '@/types/contract';
import type { WorkflowParticipant } from '@/types/unifiedFlow';
import UnifiedFlowRejectDialog from './UnifiedFlowRejectDialog';

interface UnifiedFlowInboxCardProps {
    contract: Contract;
    onOpen: (contractId: string, role: 'REVIEWER' | 'APPROVER') => void;
    onComplete: (contractId: string) => void;
    onReloaded: () => void;
}

const truncate = (text: string | undefined, max: number) =>
    !text ? '' : text.length > max ? text.slice(0, max) + '…' : text;

const formatDate = (iso?: string) => {
    if (!iso) return '';
    const d = new Date(iso);
    return d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })
        + ' ' + d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
};

export default function UnifiedFlowInboxCard({
    contract,
    onOpen,
    onComplete,
    onReloaded,
}: UnifiedFlowInboxCardProps) {
    const theme = useTheme();
    const isDark = theme.palette.mode === 'dark';
    const currentUser = authService.getCurrentUser();

    const [actionsAnchor, setActionsAnchor] = useState<HTMLElement | null>(null);
    const [rejectOpen, setRejectOpen] = useState(false);

    // Find this user's participant record
    const myParticipant: WorkflowParticipant | undefined = (contract.participants ?? []).find(
        (p) => p.email === currentUser?.email,
    );

    const role = myParticipant?.role ?? 'REVIEWER';
    const status = myParticipant?.status ?? 'pending';

    // Determine if the user can act right now
    const canAct = status === 'unlocked' || status === 'in_progress';

    const getRoleColor = () => {
        if (role === 'APPROVER') {
            return isDark
                ? { bg: alpha('#10b981', 0.12), color: '#6ee7b7', border: alpha('#10b981', 0.3) }
                : { bg: '#d1fae5', color: '#065f46', border: '#a7f3d0' };
        }
        return isDark
            ? { bg: alpha('#3b82f6', 0.12), color: '#93c5fd', border: alpha('#3b82f6', 0.3) }
            : { bg: '#dbeafe', color: '#1e40af', border: '#bfdbfe' };
    };

    const getStatusColor = () => {
        switch (status) {
            case 'completed':
                return isDark ? { bg: alpha('#10b981', 0.08), border: alpha('#10b981', 0.22), accent: '#6ee7b7' }
                    : { bg: '#ffffff', border: '#bbf7d0', accent: '#059669' };
            case 'rejected':
                return isDark ? { bg: alpha('#ef4444', 0.08), border: alpha('#ef4444', 0.22), accent: '#fca5a5' }
                    : { bg: '#ffffff', border: '#fecaca', accent: '#dc2626' };
            case 'unlocked':
            case 'in_progress':
                return isDark ? { bg: alpha('#f59e0b', 0.08), border: alpha('#f59e0b', 0.22), accent: '#fcd34d' }
                    : { bg: '#ffffff', border: '#fde68a', accent: '#d97706' };
            default:
                return isDark ? { bg: alpha('#6b7280', 0.08), border: alpha('#6b7280', 0.22), accent: '#9ca3af' }
                    : { bg: '#ffffff', border: '#e5e7eb', accent: '#6b7280' };
        }
    };

    const statusColors = getStatusColor();
    const roleColor = getRoleColor();

    const statusLabel = () => {
        switch (status) {
            case 'unlocked': return 'Your Turn';
            case 'in_progress': return 'In Progress';
            case 'completed': return 'Completed';
            case 'rejected': return 'Rejected';
            default: return 'Waiting';
        }
    };

    const handleOpen = () => {
        setActionsAnchor(null);
        onOpen(contract.id, role);
    };

    const handleComplete = () => {
        setActionsAnchor(null);
        onComplete(contract.id);
    };

    return (
        <>
            <Box
                onClick={handleOpen}
                sx={{
                    border: '1px solid',
                    borderColor: statusColors.border,
                    borderRadius: 2.5,
                    bgcolor: statusColors.bg,
                    overflow: 'hidden',
                    transition: 'box-shadow 0.2s',
                    boxShadow: '0 1px 3px rgba(0,0,0,0.05)',
                    '&:hover': { boxShadow: '0 4px 12px rgba(0,0,0,0.1)' },
                    position: 'relative',
                    cursor: 'pointer',
                }}
            >
                {/* Unified Flow indicator strip */}
                <Box
                    sx={{
                        height: 3,
                        bgcolor: statusColors.accent,
                        borderRadius: '2px 2px 0 0',
                    }}
                />

                <Box sx={{ p: 1.25 }}>
                    {/* Row 1: Title + Unified badge + Status + Menu */}
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 0.75 }}>
                        <Tooltip title={contract.title?.length > 20 ? contract.title : ''} arrow>
                            <Typography
                                variant="subtitle2"
                                noWrap
                                sx={{ flex: 1, minWidth: 0, fontWeight: 600 }}
                            >
                                {truncate(contract.title, 20)}
                            </Typography>
                        </Tooltip>

                        {/* Unified badge */}
                        <Chip
                            icon={<AutoAwesome sx={{ fontSize: '10px !important' }} />}
                            label="Unified"
                            size="small"
                            sx={{
                                height: 16,
                                fontSize: '0.58rem',
                                fontWeight: 700,
                                bgcolor: isDark ? alpha('#8b5cf6', 0.15) : '#f5f3ff',
                                color: isDark ? '#c4b5fd' : '#6d28d9',
                                border: '1px solid',
                                borderColor: isDark ? alpha('#8b5cf6', 0.3) : '#ddd6fe',
                                '& .MuiChip-icon': { color: 'inherit' },
                                flexShrink: 0,
                            }}
                        />

                        {/* Status chip */}
                        <Chip
                            label={statusLabel()}
                            size="small"
                            sx={{
                                height: 20,
                                fontSize: '0.68rem',
                                fontWeight: 600,
                                bgcolor: 'transparent',
                                color: statusColors.accent,
                                border: `1px solid ${statusColors.border}`,
                                flexShrink: 0,
                                '& .MuiChip-label': { px: 1 },
                            }}
                        />

                        {/* Actions menu */}
                        <IconButton
                            size="small"
                            onClick={(e) => { e.stopPropagation(); setActionsAnchor(e.currentTarget); }}
                            sx={{ flexShrink: 0, p: 0.25, color: 'text.secondary' }}
                        >
                            <MoreVert sx={{ fontSize: 18 }} />
                        </IconButton>
                    </Box>

                    {/* Row 2: Role + Order */}
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 0.75 }}>
                        <Chip
                            icon={role === 'REVIEWER' ? <RateReview sx={{ fontSize: '11px !important' }} /> : <ThumbUp sx={{ fontSize: '11px !important' }} />}
                            label={`${role === 'REVIEWER' ? 'Reviewer' : 'Approver'} · Order ${myParticipant?.order ?? '?'}`}
                            size="small"
                            sx={{
                                height: 20,
                                fontSize: '0.68rem',
                                fontWeight: 600,
                                bgcolor: roleColor.bg,
                                color: roleColor.color,
                                border: `1px solid ${roleColor.border}`,
                                '& .MuiChip-icon': { color: 'inherit' },
                            }}
                        />
                    </Box>

                    {/* Row 3: Sender info */}
                    <Box
                        sx={{
                            p: 1,
                            borderRadius: 1.5,
                            bgcolor: isDark ? alpha('#ffffff', 0.04) : alpha('#000000', 0.03),
                            border: '1px solid',
                            borderColor: 'divider',
                        }}
                    >
                        {contract.client && (
                            <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75 }}>
                                <AccountCircle sx={{ fontSize: 13, color: statusColors.accent }} />
                                <Typography variant="caption" fontWeight={500}>
                                    Client: {truncate(contract.client, 22)}
                                </Typography>
                            </Box>
                        )}
                        {myParticipant?.sentBy && (
                            <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75 }}>
                                <Person sx={{ fontSize: 13, color: statusColors.accent }} />
                                <Typography variant="caption" fontWeight={500}>
                                    From: {truncate(myParticipant.sentBy, 24)}
                                </Typography>
                            </Box>
                        )}
                        {myParticipant?.sentAt && (
                            <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75 }}>
                                <AccessTime sx={{ fontSize: 13, color: statusColors.accent }} />
                                <Typography variant="caption" color="text.secondary">
                                    {formatDate(myParticipant.sentAt)}
                                </Typography>
                            </Box>
                        )}
                    </Box>

                    {/* Quick-open button when it's this user's turn */}
                    {canAct && (
                        <Box sx={{ mt: 1 }}>
                            <AppButton
                                fullWidth
                                size="small"
                                variant="contained"
                                onClick={handleOpen}
                                sx={{
                                    bgcolor: role === 'APPROVER' ? '#10b981' : '#3b82f6',
                                    '&:hover': { bgcolor: role === 'APPROVER' ? '#059669' : '#2563eb' },
                                    fontWeight: 600,
                                    fontSize: '0.8rem',
                                }}
                            >
                                {role === 'APPROVER' ? 'Open & Sign' : 'Open & Review'}
                            </AppButton>
                        </Box>
                    )}
                </Box>

                {/* Popover actions */}
                <Popover
                    open={Boolean(actionsAnchor)}
                    anchorEl={actionsAnchor}
                    onClose={() => setActionsAnchor(null)}
                    onClick={(e) => e.stopPropagation()}
                    anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
                    transformOrigin={{ vertical: 'top', horizontal: 'right' }}
                    slotProps={{
                        paper: {
                            sx: {
                                p: 0.5,
                                borderRadius: 2,
                                boxShadow: '0 4px 16px rgba(0,0,0,0.12)',
                                display: 'flex',
                                gap: 0.75,
                            },
                        },
                    }}
                >
                    <Tooltip title="Open Contract" arrow>
                        <IconButton
                            size="small"
                            onClick={handleOpen}
                            sx={{ border: '1px solid', borderColor: statusColors.accent, color: statusColors.accent, borderRadius: 1, '&:hover': { bgcolor: statusColors.bg } }}
                        >
                            <Visibility sx={{ fontSize: '0.85rem' }} />
                        </IconButton>
                    </Tooltip>

                    {/* Mark complete — reviewer shortcut only */}
                    {canAct && role === 'REVIEWER' && (
                        <Tooltip title="Mark Complete" arrow>
                            <IconButton
                                size="small"
                                onClick={handleComplete}
                                sx={{ border: '1px solid', borderColor: '#10b981', color: '#10b981', borderRadius: 1, '&:hover': { bgcolor: alpha('#10b981', 0.08) } }}
                            >
                                <CheckCircle sx={{ fontSize: '0.85rem' }} />
                            </IconButton>
                        </Tooltip>
                    )}

                    {/* Reject */}
                    {canAct && (
                        <Tooltip title="Reject Contract" arrow>
                            <IconButton
                                size="small"
                                onClick={() => { setActionsAnchor(null); setRejectOpen(true); }}
                                sx={{ border: '1px solid', borderColor: '#ef4444', color: '#ef4444', borderRadius: 1, '&:hover': { bgcolor: alpha('#ef4444', 0.08) } }}
                            >
                                <Cancel sx={{ fontSize: '0.85rem' }} />
                            </IconButton>
                        </Tooltip>
                    )}
                </Popover>
            </Box>

            {/* Reject dialog */}
            <UnifiedFlowRejectDialog
                open={rejectOpen}
                onClose={() => setRejectOpen(false)}
                onRejected={() => { setRejectOpen(false); onReloaded(); }}
                contractId={contract.id}
                contractTitle={contract.title}
                role={role}
            />
        </>
    );
}
