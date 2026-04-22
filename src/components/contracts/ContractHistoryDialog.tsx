'use client';

import { useState } from 'react';
import {
    Dialog,
    DialogTitle,
    DialogContent,
    IconButton,
    Box,
    Typography,
    Divider,
    alpha,
    Tooltip,
    useTheme,
} from '@mui/material';
import CloseIcon from '@mui/icons-material/Close';
import InsertDriveFileOutlinedIcon from '@mui/icons-material/InsertDriveFileOutlined';
import OpenInFullIcon from '@mui/icons-material/OpenInFull';
import CalendarTodayOutlinedIcon from '@mui/icons-material/CalendarTodayOutlined';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import HourglassEmptyIcon from '@mui/icons-material/HourglassEmpty';
import dynamic from 'next/dynamic';
import dayjs from 'dayjs';
import type { HistoryEntry } from './ContractHistoryPanel';

const DocumentViewerDialog = dynamic(
    () => import('@/components/viewer/DocumentViewerDialog'),
    { ssr: false }
);

interface ContractHistoryDialogProps {
    open: boolean;
    onClose: () => void;
    entry: HistoryEntry | null;
    currentContractId: string;
}

// (STATUS_CONFIG unused — status chip removed from this dialog)

function formatDate(d: string | null) {
    if (!d) return '—';
    return dayjs(d).format('DD/MM/YYYY');
}

function InfoRow({ label, value }: { label: string; value: string }) {
    if (!value || value === '—') return null;
    return (
        <Box sx={{ display: 'flex', alignItems: 'center', flexDirection: 'column', justifyContent: 'center'}}>
            <Typography fontSize="0.68rem" color="text.disabled" fontWeight={600} letterSpacing="0.04em" textTransform="uppercase">
                {label}
            </Typography>
            <Typography fontSize="0.82rem" textAlign="center" color="text.primary" fontWeight={500}>
                {value}
            </Typography>
        </Box>
    );
}

export default function ContractHistoryDialog({
    open,
    onClose,
    entry,
    currentContractId,
}: ContractHistoryDialogProps) {
    const theme = useTheme();
    const primaryColor = theme.palette.primary.main;
    const isDark = theme.palette.mode === 'dark';
    const [pdfOpen, setPdfOpen] = useState(false);

    if (!entry) return null;

    const isCurrent = entry.id === currentContractId;
    const isUpcoming = !isCurrent && ['draft', 'in_review', 'in_approval', 'approved',
        'ready_for_signature', 'waiting_for_signature', 'signed', 'signed_by_everyone'].includes(entry.status);

    const displayTitle = entry.title.replace(/\s*\(Renewal\d*\)$/i, '');
    const kindLabel = isCurrent ? 'Current Version' : isUpcoming ? 'Upcoming Version' : 'Past Version';
    const allSigners = [...(entry.internalSigners || []), ...(entry.externalSigners || [])];

    return (
        <>
            <Dialog
                open={open}
                onClose={onClose}
                maxWidth="sm"
                fullWidth
                slotProps={{ paper: { sx: {
                    borderRadius: 3,
                    overflow: 'hidden',
                    boxShadow: '0 20px 60px rgba(0,0,0,0.15)',
                } } }}
            >
                {/* Header */}
                <DialogTitle
                    sx={{
                        p: 0,
                        background: (t) => `linear-gradient(135deg, ${t.palette.primary.dark} 0%, ${t.palette.primary.main} 100%)`,
                        color: '#fff',
                    }}
                >
                    <Box sx={{ p: 1, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                        <Box>
                            <Typography fontWeight={700} fontSize="1.05rem" color="#fff">
                                {displayTitle}
                            </Typography>
                        </Box>
                        <IconButton
                            size="small"
                            onClick={onClose}
                            sx={{ color: alpha('#fff', 0.8), '&:hover': { color: '#fff', bgcolor: alpha('#fff', 0.1) } }}
                        >
                            <CloseIcon fontSize="small" />
                        </IconButton>
                    </Box>
                </DialogTitle>

                <DialogContent sx={{ p: 0 }}>
                    {/* Period banner */}
                    <Box sx={{
                        p: 1,
                        bgcolor: isDark ? alpha('#ffffff', 0.03) : '#f8fafc',
                        borderBottom: '1px solid',
                        borderColor: 'divider',
                        display: 'flex',
                        alignItems: 'center',
                        gap: 1,
                    }}>
                        <CalendarTodayOutlinedIcon sx={{ fontSize: 15, color: 'text.disabled' }} />
                        <Typography fontSize="0.8rem" color="text.secondary" fontWeight={500}>
                            {entry.startDate || entry.endDate
                                ? `${formatDate(entry.startDate)} → ${formatDate(entry.endDate)}`
                                : 'Dates not set'}
                        </Typography>
                    </Box>

                    <Box sx={{ p: 1, display: 'flex', flexDirection: 'column', gap: 0 }}>
                        <Box sx={{ display: 'flex', justifyContent: 'space-between', p: 1, px: 2, borderRadius: '10px', bgcolor: isDark ? alpha(primaryColor, 0.08) : alpha(primaryColor, 0.06) }}>
                            {/* Contract details */}
                            {entry.client && (
                                <InfoRow
                                    label="Client"
                                    value={entry.client}
                                />
                            )}
                            {entry.category && (
                                <InfoRow
                                    label="Category"
                                    value={entry.category}
                                />
                            )}
                            {entry.finalizedAt && (
                                <InfoRow
                                    label="Finalized"
                                    value={formatDate(entry.finalizedAt)}
                                />
                            )}
                        </Box>
                        {entry.renewalNotes && (
                            <InfoRow
                                label="Renewal Notes"
                                value={entry.renewalNotes}
                            />
                        )}

                        {/* Signers */}
                        {allSigners.length > 0 && (
                            <>
                                <Divider sx={{ my: 1.5 }} />
                                <Typography fontSize="0.72rem" fontWeight={700} color="text.secondary" letterSpacing="0.05em" textTransform="uppercase" mb={1}>
                                    Signers
                                </Typography>
                                <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.75 }}>
                                    {allSigners.map((s, i) => (
                                        <Box key={i} sx={{
                                            display: 'flex',
                                            alignItems: 'center',
                                            gap: 1,
                                            p: 1,
                                            borderRadius: 1.5,
                                            bgcolor: s.status === 'completed' ? alpha('#10b981', isDark ? 0.10 : 0.06) : alpha('#f59e0b', isDark ? 0.10 : 0.06),
                                            border: '1px solid',
                                            borderColor: s.status === 'completed'
                                                ? (isDark ? 'rgba(16,185,129,0.30)' : '#a7f3d0')
                                                : (isDark ? 'rgba(245,158,11,0.30)' : '#fde68a'),
                                        }}>
                                            {s.status === 'completed'
                                                ? <CheckCircleIcon sx={{ fontSize: 14, color: '#10b981', flexShrink: 0 }} />
                                                : <HourglassEmptyIcon sx={{ fontSize: 14, color: '#f59e0b', flexShrink: 0 }} />
                                            }
                                            <Box sx={{ flex: 1, minWidth: 0 }}>
                                                <Typography fontSize="0.75rem" fontWeight={600} noWrap>{s.email}</Typography>
                                                <Typography fontSize="0.65rem" color="text.secondary">{s.partyLabel}</Typography>
                                            </Box>
                                            {s.completedAt && (
                                                <Typography fontSize="0.65rem" color="text.disabled" flexShrink={0}>
                                                    {formatDate(s.completedAt)}
                                                </Typography>
                                            )}
                                        </Box>
                                    ))}
                                </Box>
                            </>
                        )}

                        {/* PDF Document */}
                        <Divider sx={{ my: 1.5 }} />
                        <Typography fontSize="0.72rem" fontWeight={700} color="text.secondary" letterSpacing="0.05em" textTransform="uppercase" mb={1}>
                            Document
                        </Typography>
                        <Tooltip title="Click to open in full-screen viewer" arrow>
                            <Box
                                onClick={() => setPdfOpen(true)}
                                sx={{
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: 1.5,
                                    p: 1.5,
                                    borderRadius: 2,
                                    border: '1px solid',
                                    borderColor: 'divider',
                                    bgcolor: isDark ? alpha('#ffffff', 0.03) : '#f8fafc',
                                    cursor: 'pointer',
                                    transition: 'all 0.15s',
                                    '&:hover': {
                                        borderColor: primaryColor,
                                        bgcolor: alpha(primaryColor, 0.04),
                                        boxShadow: `0 2px 8px ${alpha(primaryColor, 0.1)}`,
                                    },
                                }}
                            >
                                <Box sx={{
                                    width: 36, height: 36, borderRadius: 1.5,
                                    bgcolor: alpha(primaryColor, 0.1),
                                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                                    flexShrink: 0,
                                }}>
                                    <InsertDriveFileOutlinedIcon sx={{ fontSize: 18, color: primaryColor }} />
                                </Box>
                                <Box sx={{ flex: 1, minWidth: 0 }}>
                                    <Typography fontSize="0.82rem" fontWeight={600} color="text.primary" noWrap>
                                        {displayTitle}.pdf
                                    </Typography>
                                    <Typography fontSize="0.7rem" color="text.secondary">
                                        PDF · Click to view
                                    </Typography>
                                </Box>
                                <OpenInFullIcon sx={{ fontSize: 16, color: 'text.disabled', flexShrink: 0 }} />
                            </Box>
                        </Tooltip>

                        <Box sx={{ pb: 1 }} />
                    </Box>
                </DialogContent>
            </Dialog>

            {/* Full-screen PDF viewer */}
            {pdfOpen && (
                <DocumentViewerDialog
                    open={pdfOpen}
                    onClose={() => setPdfOpen(false)}
                    fileUrl={`/api/file/${entry.id}?type=contract`}
                    fileName={`${displayTitle}.pdf`}
                    title={`${displayTitle} — ${kindLabel}`}
                    readOnly={true}
                    currentUserRole="contractor"
                />
            )}
        </>
    );
}
