'use client';

import { useEffect, useState, useCallback } from 'react';
import {
    Popover,
    Box,
    Typography,
    IconButton,
    Chip,
    Skeleton,
    alpha,
    useMediaQuery,
    useTheme,
    Drawer,
} from '@mui/material';
import CloseIcon from '@mui/icons-material/Close';
import InfoOutlinedIcon from '@mui/icons-material/InfoOutlined';
import HistoryIcon from '@mui/icons-material/History';
import CalendarTodayOutlinedIcon from '@mui/icons-material/CalendarTodayOutlined';
import dayjs from 'dayjs';
import EmptyState from '@/components/common/EmptyState';

export interface HistoryEntry {
    id: string;
    title: string;
    startDate: string | null;
    endDate: string | null;
    status: string;
    createdAt: string | null;
    finalizedAt: string | null;
    renewedFromId: string | null;
    renewedContractId: string | null;
    renewalStatus: string | null;
    renewalStartDate: string | null;
    renewalNotes: string | null;
    client: string;
    category: string;
    templateName: string;
    createdBy: string;
    externalSigners: { email: string; partyLabel: string; status: string; completedAt: string | null }[];
    internalSigners: { email: string; partyLabel: string; status: string; completedAt: string | null }[];
}

interface ContractHistoryPanelProps {
    open: boolean;
    anchorEl: HTMLElement | null;
    onClose: () => void;
    contractId: string;
    currentContractId: string;
    onSelectEntry: (entry: HistoryEntry) => void;
}

const STATUS_CONFIG_LIGHT: Record<string, { label: string; color: string; bg: string; border: string }> = {
    active:                 { label: 'Active',             color: '#065f46', bg: '#d1fae5', border: '#6ee7b7' },
    expiring:               { label: 'Expiring',           color: '#92400e', bg: '#fef3c7', border: '#fcd34d' },
    expired:                { label: 'Expired',            color: '#991b1b', bg: '#fee2e2', border: '#fca5a5' },
    signed:                 { label: 'Signed',             color: '#1e40af', bg: '#dbeafe', border: '#93c5fd' },
    signed_by_everyone:     { label: 'Signed by Parties',  color: '#1e40af', bg: '#dbeafe', border: '#93c5fd' },
    waiting_for_signature:  { label: 'Awaiting Signature', color: '#6d28d9', bg: '#ede9fe', border: '#c4b5fd' },
    ready_for_signature:    { label: 'Ready to Sign',      color: '#0369a1', bg: '#e0f2fe', border: '#7dd3fc' },
    approved:               { label: 'Approved',           color: '#065f46', bg: '#d1fae5', border: '#6ee7b7' },
    in_review:              { label: 'In Review',          color: '#92400e', bg: '#fef3c7', border: '#fcd34d' },
    in_approval:            { label: 'In Approval',        color: '#92400e', bg: '#fef3c7', border: '#fcd34d' },
    draft:                  { label: 'Draft',              color: '#374151', bg: '#f3f4f6', border: '#d1d5db' },
    terminated:             { label: 'Terminated',         color: '#334155', bg: '#f1f5f9', border: '#94a3b8' },
};

const STATUS_CONFIG_DARK: Record<string, { label: string; color: string; bg: string; border: string }> = {
    active:                 { label: 'Active',             color: '#6ee7b7', bg: 'rgba(16,185,129,0.12)',  border: 'rgba(16,185,129,0.30)' },
    expiring:               { label: 'Expiring',           color: '#fcd34d', bg: 'rgba(245,158,11,0.12)',  border: 'rgba(245,158,11,0.30)' },
    expired:                { label: 'Expired',            color: '#fca5a5', bg: 'rgba(239,68,68,0.12)',   border: 'rgba(239,68,68,0.30)' },
    signed:                 { label: 'Signed',             color: '#93c5fd', bg: 'rgba(59,130,246,0.12)',  border: 'rgba(59,130,246,0.30)' },
    signed_by_everyone:     { label: 'Signed by Parties',  color: '#93c5fd', bg: 'rgba(59,130,246,0.12)',  border: 'rgba(59,130,246,0.30)' },
    waiting_for_signature:  { label: 'Awaiting Signature', color: '#c4b5fd', bg: 'rgba(139,92,246,0.12)',  border: 'rgba(139,92,246,0.30)' },
    ready_for_signature:    { label: 'Ready to Sign',      color: '#7dd3fc', bg: 'rgba(14,165,233,0.12)',  border: 'rgba(14,165,233,0.30)' },
    approved:               { label: 'Approved',           color: '#6ee7b7', bg: 'rgba(16,185,129,0.12)',  border: 'rgba(16,185,129,0.30)' },
    in_review:              { label: 'In Review',          color: '#fcd34d', bg: 'rgba(245,158,11,0.12)',  border: 'rgba(245,158,11,0.30)' },
    in_approval:            { label: 'In Approval',        color: '#fcd34d', bg: 'rgba(245,158,11,0.12)',  border: 'rgba(245,158,11,0.30)' },
    draft:                  { label: 'Draft',              color: '#94a3b8', bg: 'rgba(148,163,184,0.10)', border: 'rgba(148,163,184,0.25)' },
    terminated:             { label: 'Terminated',         color: '#94a3b8', bg: 'rgba(148,163,184,0.10)', border: 'rgba(148,163,184,0.25)' },
};

function getStatusConfig(status: string, isDark: boolean) {
    const map = isDark ? STATUS_CONFIG_DARK : STATUS_CONFIG_LIGHT;
    return map[status] || (isDark
        ? { label: status, color: '#94a3b8', bg: 'rgba(148,163,184,0.10)', border: 'rgba(148,163,184,0.25)' }
        : { label: status, color: '#374151', bg: '#f3f4f6', border: '#d1d5db' });
}

function classifyEntry(
    entry: HistoryEntry,
    currentContractId: string,
    chain: HistoryEntry[],
): 'past' | 'current' | 'upcoming' {
    if (entry.id === currentContractId) return 'current';

    // If this entry is the head of the chain (no successor) and is terminated,
    // mark it as current — it represents the definitive final state.
    const isChainHead = !entry.renewedContractId ||
        !chain.some(e => e.id === entry.renewedContractId);
    if (isChainHead && entry.status === 'TERMINATED') return 'current';

    const upcomingStatuses = ['DRAFT', 'IN_REVIEW', 'IN_APPROVAL', 'APPROVED',
        'READY_FOR_SIGNATURE', 'WAITING_FOR_SIGNATURE', 'SIGNED', 'SIGNED_BY_EVERYONE'];
    if (upcomingStatuses.includes(entry.status)) return 'upcoming';
    const today = dayjs().startOf('day');
    if (entry.startDate && dayjs(entry.startDate).isAfter(today)) return 'upcoming';
    return 'past';
}

function formatDate(d: string | null) {
    if (!d) return '—';
    return dayjs(d).format('DD/MM/YYYY');
}

function HistoryContent({
    chain,
    loading,
    error,
    currentContractId,
    onSelectEntry,
    onClose,
}: {
    chain: HistoryEntry[];
    loading: boolean;
    error: string | null;
    currentContractId: string;
    onSelectEntry: (e: HistoryEntry) => void;
    onClose: () => void;
}) {
    const theme = useTheme();
    const primaryColor = theme.palette.primary.main;
    const isDark = theme.palette.mode === 'dark';

    return (
        <Box sx={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
            {/* Header */}
            <Box sx={{
                p: '6px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                borderBottom: '1px solid',
                borderColor: 'divider',
                bgcolor: 'background.paper',
                position: 'sticky',
                top: 0,
                zIndex: 1,
            }}>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                    <Box sx={{
                        width: 30, height: 30, borderRadius: 1.5,
                        bgcolor: alpha(primaryColor, 0.1),
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                    }}>
                        <HistoryIcon sx={{ color: primaryColor, fontSize: 17 }} />
                    </Box>
                    <Box>
                        <Typography fontWeight={700} fontSize="0.88rem" color="text.primary">
                            Contract History
                        </Typography>
                        {chain.length > 0 && (
                            <Typography fontSize="0.68rem" color="text.secondary">
                                {chain.length} version{chain.length !== 1 ? 's' : ''} in chain
                            </Typography>
                        )}
                    </Box>
                </Box>
                <IconButton size="small" onClick={onClose} sx={{ color: 'text.secondary', '&:hover': { color: 'text.primary' } }}>
                    <CloseIcon sx={{ fontSize: 17 }} />
                </IconButton>
            </Box>

            {/* Body */}
            <Box sx={{ flex: 1, overflowY: 'auto', p: '6px' }}>
                {/* Skeleton */}
                {loading && (
                    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
                        {[0, 1, 2].map(i => (
                            <Box key={i} sx={{ display: 'flex', gap: 1.25, alignItems: 'flex-start' }}>
                                <Skeleton variant="circular" width={18} height={18} sx={{ mt: 0.5, flexShrink: 0 }} />
                                <Box sx={{ flex: 1 }}>
                                    <Skeleton width="55%" height={16} />
                                    <Skeleton width="75%" height={13} sx={{ mt: 0.5 }} />
                                    <Skeleton width="40%" height={13} sx={{ mt: 0.25 }} />
                                </Box>
                            </Box>
                        ))}
                    </Box>
                )}

                {/* Error */}
                {!loading && error && (
                    <Box sx={{ py: 4, textAlign: 'center' }}>
                        <Typography color="error" fontSize="0.82rem">{error}</Typography>
                    </Box>
                )}

                {/* Empty */}
                {!loading && !error && chain.length === 0 && (
                    <EmptyState
                        compact
                        icon={<HistoryIcon />}
                        title="No history yet."
                    />
                )}

                {/* Chain entries */}
                {!loading && !error && chain.length > 0 && (
                    <Box sx={{ display: 'flex', flexDirection: 'column', maxHeight: '200px', overflowY: 'auto' }}>
                        {chain.map((entry, idx) => {
                            const kind = classifyEntry(entry, currentContractId, chain);
                            const sc = getStatusConfig(entry.status, isDark);
                            const isCurrent = kind === 'current';
                            const isLast = idx === chain.length - 1;
                            const displayTitle = entry.title.replace(/\s*\(Renewal\d*\)$/i, '');

                            return (
                                <Box key={entry.id} sx={{ display: 'flex', gap: 0 }}>
                                    {/* Timeline column */}
                                    {/* <Box sx={{
                                        display: 'flex', flexDirection: 'column',
                                        alignItems: 'center', width: 28, flexShrink: 0, pt: 1.75,
                                    }}>
                                        {renderIcon(kind)}
                                        {!isLast && (
                                            <Box sx={{
                                                width: 2, flex: 1, minHeight: 20, mt: 0.5,
                                                bgcolor: isCurrent ? '#0f766e' : '#e5e7eb',
                                                borderRadius: 1,
                                            }} />
                                        )}
                                    </Box> */}

                                    {/* Entry row */}
                                    <Box
                                        sx={{
                                            flex: 1,
                                            mb: isLast ? 0.5 : 1,
                                            p: 1,
                                            borderRadius: 2,
                                            border: '1px solid',
                                            borderColor: isCurrent
                                                ? (isDark ? alpha(primaryColor, 0.5) : '#a7f3d0')
                                                : 'divider',
                                            bgcolor: isCurrent
                                                ? alpha(primaryColor, isDark ? 0.08 : 0.035)
                                                : (isDark ? alpha('#ffffff', 0.03) : '#fafafa'),
                                            cursor: 'pointer',
                                            transition: 'all 0.15s ease',
                                            '&:hover': {
                                                borderColor: primaryColor,
                                                bgcolor: alpha(primaryColor, 0.07),
                                                boxShadow: `0 2px 10px ${alpha(primaryColor, 0.1)}`,
                                                transform: 'translateY(-1px)',
                                            },
                                        }}
                                        onClick={() => { onSelectEntry(entry); onClose(); }}
                                    >
                                        {/* Top row: kind badge + status chip */}
                                        <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                                            <Typography sx={{
                                                fontWeight: 700,
                                                fontSize: '0.6rem',
                                                color: isCurrent ? primaryColor : kind === 'upcoming' ? '#d97706' : 'text.disabled',
                                            }}>
                                                {kind === 'current' ? '● Current' : kind === 'upcoming' ? '◷ Upcoming' : '○ Past'}
                                            </Typography>
                                            <Chip
                                                label={sc.label}
                                                size="small"
                                                sx={{
                                                    bgcolor: sc.bg, color: sc.color,
                                                    border: `1px solid ${sc.border}`,
                                                    fontWeight: 600, fontSize: '0.6rem', height: 18,
                                                    '& .MuiChip-label': { px: 0.75 },
                                                }}
                                            />
                                        </Box>

                                        {/* Title */}
                                        <Typography fontWeight={600} fontSize="0.82rem" color="text.primary">
                                            {displayTitle}
                                        </Typography>

                                        {/* Date range */}
                                        <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                                            <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                                                <CalendarTodayOutlinedIcon sx={{ fontSize: 11, color: 'text.disabled' }} />
                                                <Typography fontSize="0.7rem" color="text.secondary">
                                                    {(entry.startDate || entry.endDate)
                                                        ? `${formatDate(entry.startDate)} → ${formatDate(entry.endDate)}`
                                                        : 'Dates not set'}
                                                </Typography>
                                            </Box>
                                            <Box
                                                component="span"
                                                onClick={e => { e.stopPropagation(); onSelectEntry(entry); onClose(); }}
                                                sx={{
                                                    display: 'inline-flex', alignItems: 'center', gap: 0.4,
                                                    fontSize: '0.68rem', fontWeight: 600, color: primaryColor,
                                                    cursor: 'pointer',
                                                    '&:hover': { textDecoration: 'underline' },
                                                }}
                                            >
                                                <InfoOutlinedIcon sx={{ fontSize: 13 }} />
                                                View details
                                            </Box>
                                        </Box>

                                        {/* Renewal note */}
                                        {kind === 'upcoming' && entry.renewalNotes && (
                                            <Typography fontSize="0.67rem" color="text.disabled" sx={{ mt: 0.5, fontStyle: 'italic' }} noWrap>
                                                {entry.renewalNotes}
                                            </Typography>
                                        )}

                                        {/* Info link */}
                                        <Box sx={{ display: 'flex', justifyContent: 'flex-end' }}>

                                        </Box>
                                    </Box>
                                </Box>
                            );
                        })}
                    </Box>
                )}
            </Box>
        </Box>
    );
}

export default function ContractHistoryPanel({
    open,
    anchorEl,
    onClose,
    contractId,
    currentContractId,
    onSelectEntry,
}: ContractHistoryPanelProps) {
    const theme = useTheme();
    const isMobile = useMediaQuery(theme.breakpoints.down('sm'));

    const [chain, setChain] = useState<HistoryEntry[]>([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const fetchChain = useCallback(async () => {
        if (!contractId) return;
        setLoading(true);
        setError(null);
        try {
            const res = await fetch(`/api/contracts/${contractId}/history`);
            const data = await res.json();
            if (data.success) setChain(data.chain);
            else setError('Failed to load history');
        } catch {
            setError('Failed to load history');
        } finally {
            setLoading(false);
        }
    }, [contractId]);

    useEffect(() => {
        if (open) fetchChain();
    }, [open, fetchChain]);

    const contentProps = { chain, loading, error, currentContractId, onSelectEntry, onClose };

    // Mobile: bottom sheet drawer
    if (isMobile) {
        return (
            <Drawer
                anchor="bottom"
                open={open}
                onClose={onClose}
                slotProps={{ paper: { sx: {
                    borderTopLeftRadius: 20,
                    borderTopRightRadius: 20,
                    maxHeight: '85vh',
                    overflow: 'hidden',
                    boxShadow: '0 -8px 40px rgba(0,0,0,0.15)',
                } } }}
            >
                <Box sx={{ width: 40, height: 4, bgcolor: 'divider', borderRadius: 2, mx: 'auto', mt: 1.5, mb: 0.5 }} />
                <Box sx={{ height: '100%', overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
                    <HistoryContent {...contentProps} />
                </Box>
            </Drawer>
        );
    }

    // Desktop: popover anchored to History button
    return (
        <Popover
            open={open}
            anchorEl={anchorEl}
            onClose={onClose}
            anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
            transformOrigin={{ vertical: 'top', horizontal: 'right' }}
            slotProps={{ paper: { sx: {
                width: 360,
                maxHeight: 520,
                borderRadius: 3,
                overflow: 'hidden',
                boxShadow: '0 8px 40px rgba(0,0,0,0.14), 0 2px 8px rgba(0,0,0,0.08)',
                border: '1px solid',
                borderColor: 'divider',
                display: 'flex',
                flexDirection: 'column',
                mt: 0.75,
            } } }}
            disableScrollLock
        >
            <HistoryContent {...contentProps} />
        </Popover>
    );
}
