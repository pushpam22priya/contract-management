'use client';

import { Box, Typography, Paper, Button, Chip, LinearProgress, Fade, Grow } from '@mui/material';
import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { contractService } from '@/services/contractService';
import { authService } from '@/services/authService';
import { Contract, ContractStatus } from '@/types/contract';
import dayjs from 'dayjs';

interface RecentContractDisplay {
    id: string;
    title: string;
    company: string;
    status: ContractStatus;
    daysLeft: number;
    totalDays: number;
    value: string;
    path: string; // Navigation path
}

export default function RecentContracts() {
    const router = useRouter();
    const [hoveredId, setHoveredId] = useState<string | null>(null);
    const [recentContracts, setRecentContracts] = useState<RecentContractDisplay[]>([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        const loadRecentContracts = async () => {
            const currentUser = authService.getCurrentUser();
            if (!currentUser) return;

            try {
                const allContracts = await contractService.getAllContracts();

                // Ensure array
                if (!Array.isArray(allContracts)) {
                    console.error("RecentContracts: getAllContracts returned non-array", allContracts);
                    setLoading(false);
                    return;
                }

                // Filter relevant contracts (created by or signer)
                const relevantContracts = allContracts.filter(c =>
                    c.createdBy === currentUser.email || c.signer?.email === currentUser.email
                );

                // Sort by creation date (newest first)
                const sortedContracts = relevantContracts.sort((a, b) => {
                    return dayjs(b.createdAt).diff(dayjs(a.createdAt));
                });

                // Take top 2
                const top2 = sortedContracts.slice(0, 2);

                // Map to display format
                const displayContracts = top2.map(c => {
                    // Calculate days left
                    const today = dayjs();
                    const end = c.endDate ? dayjs(c.endDate) : today;
                    const start = c.startDate ? dayjs(c.startDate) : today;

                    const totalDays = Math.max(1, end.diff(start, 'day'));
                    const daysLeft = Math.max(0, end.diff(today, 'day'));

                    // Navigate to the appropriate page based on status:
                    // draft-lifecycle statuses (created by user) → draft page flat view
                    // all others → contract detail page directly
                    const draftPageStatuses = [
                        ContractStatus.DRAFT,
                        ContractStatus.IN_REVIEW,
                        ContractStatus.IN_APPROVAL,
                        ContractStatus.REVIEW_APPROVAL,
                        ContractStatus.REJECTED_BY_REVIEWER,
                        ContractStatus.REJECTED_BY_APPROVER,
                    ];
                    let path: string;
                    if (draftPageStatuses.includes(c.status)) {
                        path = `/draft?status=${encodeURIComponent(c.status)}&search=${encodeURIComponent(c.title)}`;
                    } else {
                        path = `/contracts/${c.id}`;
                    }

                    return {
                        id: c.id,
                        title: c.title,
                        company: c.client || 'Unknown Client',
                        status: c.status,
                        daysLeft: daysLeft,
                        totalDays: totalDays,
                        value: c.value ? `₹${c.value}` : '₹0',
                        path: path
                    };
                });

                setRecentContracts(displayContracts);
            } catch (error) {
                console.error("RecentContracts: Failed to load contracts", error);
            } finally {
                setLoading(false);
            }
        };

        loadRecentContracts();
    }, []);

    const getStatusColor = (status: string) => {
        switch (status) {
            case 'active':       return { bg: '#d1fae5', text: '#059669', border: '#6ee7b7', accent: '#10b981' };
            case 'expiring':     return { bg: '#fef3c7', text: '#d97706', border: '#fcd34d', accent: '#f59e0b' };
            case 'signed':       return { bg: '#e0f2f1', text: '#00695c', border: '#80cbc4', accent: '#00897b' };
            case 'in_review':
            case 'review_approval': return { bg: '#dbeafe', text: '#1d4ed8', border: '#93c5fd', accent: '#3b82f6' };
            case 'in_approval':  return { bg: '#ede9fe', text: '#6d28d9', border: '#c4b5fd', accent: '#7c3aed' };
            case 'draft':        return { bg: '#f1f5f9', text: '#475569', border: '#cbd5e1', accent: '#94a3b8' };
            case 'rejected_by_reviewer':
            case 'rejected_by_approver': return { bg: '#fee2e2', text: '#b91c1c', border: '#fca5a5', accent: '#ef4444' };
            case 'expired':
            case 'terminated':   return { bg: '#fef2f2', text: '#991b1b', border: '#fecaca', accent: '#dc2626' };
            default:             return { bg: '#f1f5f9', text: '#475569', border: '#cbd5e1', accent: '#94a3b8' };
        }
    };

    const getProgressColor = (status: string) => {
        switch (status) {
            case 'active': return '#10b981';
            case 'expiring': return '#f59e0b';
            case 'in_review':
            case 'review_approval': return '#3b82f6';
            case 'in_approval': return '#7c3aed';
            case 'signed': return '#00897b';
            default: return '#94a3b8';
        }
    };

    const getProgressValue = (daysLeft: number, totalDays: number) => {
        if (totalDays <= 0) return 0;
        return (daysLeft / totalDays) * 100;
    };

    if (loading) {
        return null; // Or a skeleton loader
    }

    // Only show if we have contracts
    if (recentContracts.length === 0) {
        return (
            <Fade in timeout={800}>
                <Paper
                    elevation={0}
                    sx={{
                        p: { xs: 1.5, sm: 1.5 },
                        borderRadius: 3,
                        border: '1px solid',
                        borderColor: 'rgba(0, 0, 0, 0.08)',
                        bgcolor: 'white',
                    }}
                >
                    <Box sx={{ mb: 1 }}>
                        <Typography variant="subtitle1" fontWeight={700} sx={{ color: 'text.primary', fontSize: '0.95rem' }}>
                            Recent Contracts
                        </Typography>
                        <Typography variant="caption" sx={{ color: 'text.secondary', fontSize: '0.72rem' }}>
                            No recent activity found.
                        </Typography>
                    </Box>
                </Paper>
            </Fade>
        )
    }

    return (
        <Fade in timeout={800}>
            <Paper
                elevation={0}
                sx={{
                    p: 1.5,
                    borderRadius: 3,
                    border: '1px solid',
                    borderColor: 'rgba(0,0,0,0.08)',
                    bgcolor: 'white',
                    height: '100%',
                    boxShadow: '0 1px 3px rgba(0,0,0,0.06)',
                }}
            >
                {/* Header */}
                <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', mb: 2 }}>
                    <Box>
                        <Typography variant="h6" fontWeight={700} sx={{ fontSize: '1.05rem', color: 'text.primary', }}>
                            Recent Contracts
                        </Typography>
                        <Typography variant="body2" sx={{ color: 'text.secondary', fontSize: '0.8rem', }}>
                            Latest contract activity
                        </Typography>
                    </Box>
                    <Button
                        variant="outlined"
                        size="small"
                        onClick={() => router.push('/contracts')}
                        sx={{
                            textTransform: 'none',
                            fontSize: '0.8rem',
                            color: 'primary.main',
                            borderColor: 'primary.main',
                            borderRadius: 2,
                            py: 0.4,
                            px: 1.5,
                            minWidth: 0,
                            '&:hover': { bgcolor: 'rgba(15,118,110,0.06)' },
                        }}
                    >
                        View All
                    </Button>
                </Box>

                {/* Contract Cards */}
                <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
                    {recentContracts.map((contract, index) => {
                        const statusColors = getStatusColor(contract.status);
                        const progressColor = getProgressColor(contract.status);
                        const progressValue = getProgressValue(contract.daysLeft, contract.totalDays);
                        const isHovered = hoveredId === contract.id;

                        return (
                            <Grow key={contract.id} in timeout={600 + index * 150} style={{ transformOrigin: '0 0 0' }}>
                                <Box
                                    onMouseEnter={() => setHoveredId(contract.id)}
                                    onMouseLeave={() => setHoveredId(null)}
                                    onClick={() => router.push(contract.path)}
                                    sx={{
                                        p: 1,
                                        borderRadius: 2.5,
                                        border: '1px solid',
                                        borderColor: isHovered ? statusColors.accent : 'rgba(0,0,0,0.08)',
                                        borderLeft: `4px solid ${statusColors.accent}`,
                                        bgcolor: isHovered ? `${statusColors.accent}0d` : 'white',
                                        transition: 'all 0.25s ease',
                                        cursor: 'pointer',
                                        boxShadow: isHovered ? `0 4px 14px ${statusColors.accent}22` : '0 1px 3px rgba(0,0,0,0.04)',
                                        '&:hover': { transform: 'translateY(-1px)' },
                                    }}
                                >
                                    {/* Title + Status chip */}
                                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 0.5 }}>
                                        <Typography
                                            fontWeight={700}
                                            sx={{
                                                fontSize: '0.92rem',
                                                color: 'text.primary',
                                                flex: 1,
                                                minWidth: 0,
                                                overflow: 'hidden',
                                                textOverflow: 'ellipsis',
                                                whiteSpace: 'nowrap',
                                            }}
                                        >
                                            {contract.title}
                                        </Typography>
                                        <Chip
                                            label={contract.status.split('_').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ')}
                                            size="small"
                                            sx={{
                                                bgcolor: statusColors.bg,
                                                color: statusColors.text,
                                                border: `1px solid ${statusColors.border}`,
                                                fontWeight: 600,
                                                fontSize: '0.7rem',
                                                height: 22,
                                                flexShrink: 0,
                                                '& .MuiChip-label': { px: 1 },
                                            }}
                                        />
                                    </Box>

                                    {/* Client */}
                                    <Typography variant="body2" sx={{ color: 'text.secondary', fontSize: '0.8rem', mb: 1 }}>
                                        {contract.company}
                                    </Typography>

                                    {/* Progress bar */}
                                    <LinearProgress
                                        variant="determinate"
                                        value={progressValue}
                                        sx={{
                                            height: 5,
                                            borderRadius: 3,
                                            mb: 1,
                                            bgcolor: 'rgba(0,0,0,0.06)',
                                            '& .MuiLinearProgress-bar': { bgcolor: progressColor, borderRadius: 3 },
                                        }}
                                    />

                                    {/* Footer */}
                                    <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                        <Typography variant="body2" sx={{ color: 'text.secondary', fontSize: '0.78rem', fontWeight: 500 }}>
                                            {(contract.status === ContractStatus.IN_REVIEW || contract.status === ContractStatus.REVIEW_APPROVAL)
                                                ? 'Waiting for review'
                                                : contract.status === ContractStatus.IN_APPROVAL
                                                    ? 'Waiting for approval'
                                                    : contract.status === ContractStatus.DRAFT
                                                        ? 'Draft in progress'
                                                        : `${contract.daysLeft} days left`}
                                        </Typography>
                                        <Button
                                            size="small"
                                            variant={isHovered ? 'contained' : 'text'}
                                            onClick={(e) => { e.stopPropagation(); router.push(contract.path); }}
                                            sx={{
                                                textTransform: 'none',
                                                fontSize: '0.78rem',
                                                fontWeight: 600,
                                                py: 0.3,
                                                px: 1.25,
                                                minWidth: 0,
                                                borderRadius: 1.5,
                                                color: isHovered ? 'white' : statusColors.accent,
                                                bgcolor: isHovered ? statusColors.accent : 'transparent',
                                                '&:hover': { bgcolor: statusColors.accent, color: 'white' },
                                            }}
                                        >
                                            View
                                        </Button>
                                    </Box>
                                </Box>
                            </Grow>
                        );
                    })}
                </Box>
            </Paper>
        </Fade>
    );
}
