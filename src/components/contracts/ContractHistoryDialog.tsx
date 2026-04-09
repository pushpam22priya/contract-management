'use client';

import React, { useState } from 'react';
import {
    Dialog,
    DialogTitle,
    DialogContent,
    IconButton,
    Box,
    Typography,
    Chip,
    Divider,
    alpha,
    Tooltip,
} from '@mui/material';
import CloseIcon from '@mui/icons-material/Close';
import InsertDriveFileOutlinedIcon from '@mui/icons-material/InsertDriveFileOutlined';
import OpenInFullIcon from '@mui/icons-material/OpenInFull';
import PersonOutlineIcon from '@mui/icons-material/PersonOutline';
import EmailOutlinedIcon from '@mui/icons-material/EmailOutlined';
import CalendarTodayOutlinedIcon from '@mui/icons-material/CalendarTodayOutlined';
import CategoryOutlinedIcon from '@mui/icons-material/CategoryOutlined';
import BusinessOutlinedIcon from '@mui/icons-material/BusinessOutlined';
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

const STATUS_CONFIG: Record<string, { label: string; color: string; bg: string; border: string }> = {
    active: { label: 'Active', color: '#065f46', bg: '#d1fae5', border: '#6ee7b7' },
    expiring: { label: 'Expiring', color: '#92400e', bg: '#fef3c7', border: '#fcd34d' },
    expired: { label: 'Expired', color: '#991b1b', bg: '#fee2e2', border: '#fca5a5' },
    signed: { label: 'Signed', color: '#1e40af', bg: '#dbeafe', border: '#93c5fd' },
    signed_by_everyone: { label: 'Signed by Parties', color: '#1e40af', bg: '#dbeafe', border: '#93c5fd' },
    waiting_for_signature: { label: 'Awaiting Signature', color: '#6d28d9', bg: '#ede9fe', border: '#c4b5fd' },
    ready_for_signature: { label: 'Ready to Sign', color: '#0369a1', bg: '#e0f2fe', border: '#7dd3fc' },
    approved: { label: 'Approved', color: '#065f46', bg: '#d1fae5', border: '#6ee7b7' },
    in_review: { label: 'In Review', color: '#92400e', bg: '#fef3c7', border: '#fcd34d' },
    in_approval: { label: 'In Approval', color: '#92400e', bg: '#fef3c7', border: '#fcd34d' },
    draft: { label: 'Draft', color: '#374151', bg: '#f3f4f6', border: '#d1d5db' },
};

function getStatusConfig(status: string) {
    return STATUS_CONFIG[status] || { label: status, color: '#374151', bg: '#f3f4f6', border: '#d1d5db' };
}

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
    const [pdfOpen, setPdfOpen] = useState(false);

    if (!entry) return null;

    const isCurrent = entry.id === currentContractId;
    const isUpcoming = !isCurrent && ['draft', 'in_review', 'in_approval', 'approved',
        'ready_for_signature', 'waiting_for_signature', 'signed', 'signed_by_everyone'].includes(entry.status);

    const sc = getStatusConfig(entry.status);
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
                PaperProps={{
                    sx: {
                        borderRadius: 3,
                        overflow: 'hidden',
                        boxShadow: '0 20px 60px rgba(0,0,0,0.15)',
                    },
                }}
            >
                {/* Header */}
                <DialogTitle
                    sx={{
                        p: 0,
                        background: 'linear-gradient(135deg, #0f766e 0%, #0d9488 100%)',
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
                        bgcolor: '#f8fafc',
                        borderBottom: '1px solid #e5e7eb',
                        display: 'flex',
                        alignItems: 'center',
                        gap: 1,
                    }}>
                        <CalendarTodayOutlinedIcon sx={{ fontSize: 15, color: '#6b7280' }} />
                        <Typography fontSize="0.8rem" color="text.secondary" fontWeight={500}>
                            {entry.startDate || entry.endDate
                                ? `${formatDate(entry.startDate)} → ${formatDate(entry.endDate)}`
                                : 'Dates not set'}
                        </Typography>
                    </Box>

                    <Box sx={{ p: 1, display: 'flex', flexDirection: 'column', gap: 0 }}>
                        <Box sx={{ display: 'flex', justifyContent: 'space-between', p: 1, px: 2, borderRadius: '10px', bgcolor: '#eff7ffff' }}>
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
                                            bgcolor: s.status === 'completed' ? alpha('#10b981', 0.06) : alpha('#f59e0b', 0.06),
                                            border: '1px solid',
                                            borderColor: s.status === 'completed' ? '#a7f3d0' : '#fde68a',
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
                                    border: '1px solid #e5e7eb',
                                    bgcolor: '#f8fafc',
                                    cursor: 'pointer',
                                    transition: 'all 0.15s',
                                    '&:hover': {
                                        borderColor: '#0f766e',
                                        bgcolor: alpha('#0f766e', 0.04),
                                        boxShadow: '0 2px 8px rgba(15,118,110,0.1)',
                                    },
                                }}
                            >
                                <Box sx={{
                                    width: 36, height: 36, borderRadius: 1.5,
                                    bgcolor: alpha('#0f766e', 0.1),
                                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                                    flexShrink: 0,
                                }}>
                                    <InsertDriveFileOutlinedIcon sx={{ fontSize: 18, color: '#0f766e' }} />
                                </Box>
                                <Box sx={{ flex: 1, minWidth: 0 }}>
                                    <Typography fontSize="0.82rem" fontWeight={600} color="text.primary" noWrap>
                                        {displayTitle}.pdf
                                    </Typography>
                                    <Typography fontSize="0.7rem" color="text.secondary">
                                        PDF · Click to view
                                    </Typography>
                                </Box>
                                <OpenInFullIcon sx={{ fontSize: 16, color: '#6b7280', flexShrink: 0 }} />
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
