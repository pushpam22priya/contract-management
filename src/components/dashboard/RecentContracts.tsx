'use client';

import { Box, Typography, Paper, Button, Chip, LinearProgress, Fade, Grow, SvgIcon } from '@mui/material';
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
    path: string;
}

type ActiveTab = 'recent' | 'expiring';

export default function RecentContracts() {
    const router = useRouter();
    const [hoveredId, setHoveredId] = useState<string | null>(null);
    const [activeTab, setActiveTab] = useState<ActiveTab>('recent');
    const [recentContracts, setRecentContracts] = useState<RecentContractDisplay[]>([]);
    const [expiringContracts, setExpiringContracts] = useState<RecentContractDisplay[]>([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        const loadContracts = async () => {
            const currentUser = authService.getCurrentUser();
            if (!currentUser) return;

            try {
                const allContracts = await contractService.getAllContracts();

                if (!Array.isArray(allContracts)) {
                    console.error("RecentContracts: getAllContracts returned non-array", allContracts);
                    setLoading(false);
                    return;
                }

                // Filter relevant contracts (created by or signer)
                const relevantContracts = allContracts.filter(c =>
                    c.createdBy === currentUser.email || c.signer?.email === currentUser.email
                );

                const toDisplay = (c: Contract): RecentContractDisplay => {
                    const today = dayjs();
                    const end = c.endDate ? dayjs(c.endDate) : today;
                    const start = c.startDate ? dayjs(c.startDate) : today;
                    const totalDays = Math.max(1, end.diff(start, 'day'));
                    const daysLeft = Math.max(0, end.diff(today, 'day'));

                    const draftPageStatuses = [
                        ContractStatus.DRAFT,
                        ContractStatus.IN_REVIEW,
                        ContractStatus.IN_APPROVAL,
                        ContractStatus.REVIEW_APPROVAL,
                        ContractStatus.REJECTED_BY_REVIEWER,
                        ContractStatus.REJECTED_BY_APPROVER,
                    ];
                    const path = draftPageStatuses.includes(c.status)
                        ? `/draft?status=${encodeURIComponent(c.status)}&search=${encodeURIComponent(c.title)}`
                        : `/contracts/${c.id}`;

                    return {
                        id: c.id,
                        title: c.title,
                        company: c.client || 'Unknown Client',
                        status: c.status,
                        daysLeft,
                        totalDays,
                        value: c.value ? `₹${c.value}` : '₹0',
                        path,
                    };
                };

                // Recent: top 3 active contracts sorted by newest
                const recent = relevantContracts
                    .filter(c => c.status === ContractStatus.ACTIVE)
                    .sort((a, b) => dayjs(b.createdAt).diff(dayjs(a.createdAt)))
                    .slice(0, 3)
                    .map(toDisplay);

                // Expiring: top 3 with fewest days left (most urgent first)
                const expiring = relevantContracts
                    .filter(c => c.status === ContractStatus.EXPIRING)
                    .map(toDisplay)
                    .sort((a, b) => a.daysLeft - b.daysLeft)
                    .slice(0, 3);

                setRecentContracts(recent);
                setExpiringContracts(expiring);
            } catch (error) {
                console.error("RecentContracts: Failed to load contracts", error);
            } finally {
                setLoading(false);
            }
        };

        loadContracts();
    }, []);

    const getStatusColor = (status: string) => {
        switch (status) {
            case 'draft':               return { bg: '#f1f5f9', text: '#475569', border: '#cbd5e1', accent: '#94a3b8' };
            case 'in_review':
            case 'review_approval':     return { bg: '#dbeafe', text: '#1d4ed8', border: '#93c5fd', accent: '#3b82f6' };
            case 'reviewed':            return { bg: '#e0e7ff', text: '#3730a3', border: '#a5b4fc', accent: '#4f46e5' };
            case 'in_approval':         return { bg: '#ede9fe', text: '#6d28d9', border: '#c4b5fd', accent: '#7c3aed' };
            case 'approved':            return { bg: '#f7fee7', text: '#3f6212', border: '#bef264', accent: '#65a30d' };
            case 'ready_for_signature': return { bg: '#fff7ed', text: '#c2410c', border: '#fdba74', accent: '#ea580c' };
            case 'waiting_for_signature': return { bg: '#fdf4ff', text: '#86198f', border: '#f0abfc', accent: '#c026d3' };
            case 'signed_by_everyone':  return { bg: '#cffafe', text: '#0e7490', border: '#67e8f9', accent: '#0891b2' };
            case 'signed':              return { bg: '#e0f2f1', text: '#00695c', border: '#80cbc4', accent: '#00897b' };
            case 'active':              return { bg: '#d1fae5', text: '#059669', border: '#6ee7b7', accent: '#10b981' };
            case 'expiring':            return { bg: '#fef3c7', text: '#d97706', border: '#fcd34d', accent: '#f59e0b' };
            case 'rejected':            return { bg: '#fff1f2', text: '#9f1239', border: '#fda4af', accent: '#e11d48' };
            case 'rejected_by_reviewer': return { bg: '#fee2e2', text: '#b91c1c', border: '#fca5a5', accent: '#ef4444' };
            case 'rejected_by_approver': return { bg: '#fee2e2', text: '#b91c1c', border: '#fca5a5', accent: '#ef4444' };
            case 'expired':
            case 'terminated':          return { bg: '#fef2f2', text: '#991b1b', border: '#fecaca', accent: '#dc2626' };
            default:                    return { bg: '#f1f5f9', text: '#475569', border: '#cbd5e1', accent: '#94a3b8' };
        }
    };

    const getProgressColor = (status: string) => {
        switch (status) {
            case 'draft':               return '#94a3b8';
            case 'in_review':
            case 'review_approval':     return '#3b82f6';
            case 'reviewed':            return '#4f46e5';
            case 'in_approval':         return '#7c3aed';
            case 'approved':            return '#65a30d';
            case 'ready_for_signature': return '#ea580c';
            case 'waiting_for_signature': return '#c026d3';
            case 'signed_by_everyone':  return '#0891b2';
            case 'signed':              return '#00897b';
            case 'active':              return '#10b981';
            case 'expiring':            return '#f59e0b';
            case 'rejected':            return '#e11d48';
            case 'rejected_by_reviewer': return '#ef4444';
            case 'rejected_by_approver': return '#ef4444';
            case 'expired':
            case 'terminated':          return '#dc2626';
            default:                    return '#94a3b8';
        }
    };

    const getProgressValue = (daysLeft: number, totalDays: number) => {
        if (totalDays <= 0) return 0;
        return (daysLeft / totalDays) * 100;
    };

    if (loading) {
        return null;
    }

    const displayContracts = activeTab === 'recent' ? recentContracts : expiringContracts;

    const renderEmptyState = () => {
        const isExpiring = activeTab === 'expiring';
        return (
            <Box
                sx={{
                    flex: 1,
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    justifyContent: 'center',
                    py: 4,
                    gap: 1.5,
                }}
            >
                <Box
                    sx={{
                        width: 80,
                        height: 80,
                        borderRadius: '50%',
                        bgcolor: isExpiring ? '#fffbeb' : '#f0fdf4',
                        border: `2px dashed ${isExpiring ? '#fcd34d' : '#0f766e'}`,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                    }}
                >
                    <SvgIcon sx={{ fontSize: 40, color: isExpiring ? '#f59e0b' : '#0f766e' }} viewBox="0 0 48 48">
                        {isExpiring ? (
                            <>
                                <path fill="currentColor" fillOpacity={0.15} d="M24 4a20 20 0 1 0 0 40A20 20 0 0 0 24 4z" />
                                <path fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" d="M24 4a20 20 0 1 0 0 40A20 20 0 0 0 24 4z" />
                                <path fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" d="M24 15v10l6 4" />
                            </>
                        ) : (
                            <>
                                <path fill="currentColor" fillOpacity={0.15} d="M10 6h28a2 2 0 0 1 2 2v32a2 2 0 0 1-2 2H10a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2z" />
                                <path fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" d="M10 6h28a2 2 0 0 1 2 2v32a2 2 0 0 1-2 2H10a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2z" />
                                <path fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" d="M15 17h18M15 23h18M15 29h10" />
                                <circle cx="36" cy="36" r="7" fill="#0f766e" />
                                <path fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" d="M33 36l2 2 4-4" />
                            </>
                        )}
                    </SvgIcon>
                </Box>

                <Box sx={{ textAlign: 'center' }}>
                    <Typography fontWeight={600} sx={{ fontSize: '0.95rem', color: 'text.primary', mb: 0.4 }}>
                        {isExpiring ? 'No expiring contracts' : 'No contracts yet'}
                    </Typography>
                    <Typography variant="body2" sx={{ color: 'text.secondary', fontSize: '0.8rem', maxWidth: 220, mx: 'auto' }}>
                        {isExpiring
                            ? 'All your contracts are in good standing.'
                            : 'Create your first contract to get started tracking activity here.'}
                    </Typography>
                </Box>

                {!isExpiring && (
                    <Button
                        variant="contained"
                        size="small"
                        onClick={() => router.push('/contracts?status=active')}
                        sx={{
                            textTransform: 'none',
                            fontSize: '0.82rem',
                            borderRadius: 2,
                            px: 2.5,
                            py: 0.6,
                            bgcolor: '#0f766e',
                            '&:hover': { bgcolor: '#036949' },
                            boxShadow: '0 2px 8px rgba(16,185,129,0.3)',
                        }}
                    >
                        Go to Contracts
                    </Button>
                )}
            </Box>
        );
    };

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
                    display: 'flex',
                    flexDirection: 'column',
                }}
            >
                {/* Header: title + tabs + view all */}
                <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 1.5 }}>
                    <Box>
                        <Typography variant="h6" fontWeight={700} sx={{ fontSize: '1.05rem', color: 'text.primary' }}>
                            {activeTab === 'recent' ? 'Recent Contracts' : 'Expiring Soon'}
                        </Typography>
                        <Typography variant="body2" sx={{ color: 'text.secondary', fontSize: '0.8rem' }}>
                            {activeTab === 'recent' ? 'Latest contract activity' : 'Contracts expiring by urgency'}
                        </Typography>
                    </Box>
                    <Button
                        variant="contained"
                        size="small"
                        onClick={() => router.push(activeTab === 'expiring' ? '/contracts?status=expiring' : '/contracts?status=all')}
                        sx={{
                            textTransform: 'none',
                            fontSize: '0.8rem',
                            color: 'primary.main',
                            borderColor: 'primary.main',
                            borderRadius: 1.5,
                            py: 0.5,
                            px: 1.5,
                            bgcolor: activeTab === 'expiring' ? 'rgba(245,158,11,0.08)' : 'rgba(11,97,90,0.06)',
                            minWidth: 0,
                            '&:hover': { bgcolor: activeTab === 'expiring' ? 'rgba(245,158,11,0.14)' : 'rgba(15,118,110,0.1)' },
                        }}
                    >
                        View All
                    </Button>
                </Box>

                {/* Tab switcher */}
                <Box
                    sx={{
                        display: 'flex',
                        gap: 0.5,
                        mb: 1.5,
                        p: 0.4,
                        bgcolor: '#f1f5f9',
                        borderRadius: 2,
                        width: 'fit-content',
                    }}
                >
                    {([
                        { key: 'recent', label: 'Recent' },
                        { key: 'expiring', label: `Expiring Soon${expiringContracts.length > 0 ? ` (${expiringContracts.length})` : ''}` },
                    ] as { key: ActiveTab; label: string }[]).map(tab => (
                        <Button
                            key={tab.key}
                            size="small"
                            onClick={() => setActiveTab(tab.key)}
                            sx={{
                                textTransform: 'none',
                                fontSize: '0.78rem',
                                fontWeight: activeTab === tab.key ? 700 : 500,
                                px: 1.5,
                                py: 0.4,
                                borderRadius: 1.5,
                                minWidth: 0,
                                bgcolor: activeTab === tab.key
                                    ? tab.key === 'expiring' ? '#fef3c7' : 'white'
                                    : 'transparent',
                                color: activeTab === tab.key
                                    ? tab.key === 'expiring' ? '#d97706' : 'primary.main'
                                    : 'text.secondary',
                                boxShadow: activeTab === tab.key ? '0 1px 3px rgba(0,0,0,0.1)' : 'none',
                                '&:hover': {
                                    bgcolor: activeTab === tab.key
                                        ? tab.key === 'expiring' ? '#fef3c7' : 'white'
                                        : 'rgba(0,0,0,0.04)',
                                },
                            }}
                        >
                            {tab.label}
                        </Button>
                    ))}
                </Box>

                {/* Content */}
                {displayContracts.length === 0 ? renderEmptyState() : (
                    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
                        {displayContracts.map((contract, index) => {
                            const statusColors = getStatusColor(contract.status);
                            const progressColor = getProgressColor(contract.status);
                            const progressValue = getProgressValue(contract.daysLeft, contract.totalDays);
                            const isHovered = hoveredId === contract.id;

                            return (
                                <Grow key={contract.id} in timeout={400 + index * 120} style={{ transformOrigin: '0 0 0' }}>
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
                )}
            </Paper>
        </Fade>
    );
}
