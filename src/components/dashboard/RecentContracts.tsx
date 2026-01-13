'use client';

import { Box, Typography, Paper, Button, Chip, LinearProgress, Fade, Grow } from '@mui/material';
import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { contractService } from '@/services/contractService';
import { authService } from '@/services/authService';
import { Contract } from '@/types/contract';
import dayjs from 'dayjs';

interface RecentContractDisplay {
    id: string;
    title: string;
    company: string;
    status: 'active' | 'expiring' | 'draft' | 'pending' | 'review_approval' | string;
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
        const loadRecentContracts = () => {
            const currentUser = authService.getCurrentUser();
            if (!currentUser) return;

            const allContracts = contractService.getAllContracts();

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

                // Navigate to draft page if review_approval, otherwise contracts page
                // Add search parameter to filter by contract title
                const basePath = c.status === 'review_approval' ? `/draft` : `/contracts`;
                const params = new URLSearchParams();
                params.set('search', c.title);
                const path = `${basePath}?${params.toString()}`;

                return {
                    id: c.id,
                    title: c.title,
                    company: c.client || 'Unknown Client', // Fallback
                    status: c.status,
                    daysLeft: daysLeft,
                    totalDays: totalDays,
                    value: c.value ? `₹${c.value}` : '₹0',
                    path: path
                };
            });

            setRecentContracts(displayContracts);
            setLoading(false);
        };

        loadRecentContracts();
    }, []);

    const getStatusColor = (status: string) => {
        switch (status) {
            case 'active':
                return { bg: '#d1fae5', text: '#10b981' };
            case 'expiring':
                return { bg: '#fef3c7', text: '#f59e0b' };
            case 'review_approval':
                return { bg: '#dbeafe', text: '#3b82f6' };
            case 'draft':
                return { bg: '#f3f4f6', text: '#6b7280' };
            default:
                return { bg: '#e5e7eb', text: '#374151' };
        }
    };

    const getProgressColor = (status: string) => {
        switch (status) {
            case 'active': return '#10b981';
            case 'expiring': return '#f59e0b';
            case 'review_approval': return '#3b82f6';
            default: return '#9ca3af';
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
                        p: { xs: 1.5, sm: 2 },
                        borderRadius: 3,
                        border: '1px solid',
                        borderColor: 'rgba(0, 0, 0, 0.08)',
                        bgcolor: 'white',
                    }}
                >
                    <Box sx={{ mb: 1 }}>
                        <Typography variant="h6" fontWeight={700} sx={{ color: 'text.primary', fontSize: { xs: '1.1rem', sm: '1.25rem' } }}>
                            Recent Contracts
                        </Typography>
                        <Typography variant="body2" sx={{ color: 'text.secondary', fontSize: '0.875rem' }}>
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
                    p: { xs: 1.5, sm: 2 },
                    borderRadius: 3,
                    border: '1px solid',
                    borderColor: 'rgba(0, 0, 0, 0.08)',
                    bgcolor: 'white',
                    height: '100%', // Match height of neighbors if needed
                }}
            >
                {/* Header */}
                <Box
                    sx={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: { xs: 'flex-start', sm: 'center' },
                        flexDirection: { xs: 'column', sm: 'row' },
                        gap: { xs: 2, sm: 0 },
                        mb: 1,
                    }}
                >
                    <Box>
                        <Typography
                            variant="h6"
                            fontWeight={700}
                            sx={{
                                color: 'text.primary',
                                fontSize: { xs: '1.1rem', sm: '1.25rem' },
                                // mb: 0.5,
                            }}
                        >
                            Recent Contracts
                        </Typography>
                        <Typography
                            variant="body2"
                            sx={{
                                color: 'text.secondary',
                                fontSize: { xs: '0.85rem', sm: '0.875rem' },
                            }}
                        >
                            Latest contract activity
                        </Typography>
                    </Box>

                    <Button
                        variant="text"
                        onClick={() => router.push('/contracts')}
                        sx={{
                            textTransform: 'none',
                            fontWeight: 600,
                            fontSize: '0.95rem',
                            color: 'primary.main',
                            alignSelf: { xs: 'flex-end', sm: 'auto' },
                            '&:hover': {
                                bgcolor: 'rgba(15, 118, 110, 0.08)',
                            },
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
                            <Grow
                                key={contract.id}
                                in
                                timeout={800 + index * 200}
                                style={{ transformOrigin: '0 0 0' }}
                            >
                                <Box
                                    onMouseEnter={() => setHoveredId(contract.id)}
                                    onMouseLeave={() => setHoveredId(null)}
                                    onClick={() => router.push(contract.path)}
                                    sx={{
                                        p: { xs: 1, sm: 1 },
                                        borderRadius: 2.5,
                                        border: '1px solid',
                                        borderColor: isHovered ? 'primary.main' : 'rgba(0, 0, 0, 0.08)',
                                        bgcolor: isHovered ? 'rgba(15, 118, 110, 0.02)' : 'transparent',
                                        transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
                                        cursor: 'pointer',
                                        '&:hover': {
                                            boxShadow: '0 4px 12px rgba(15, 118, 110, 0.1)',
                                        },
                                    }}
                                >
                                    {/* Contract Header */}
                                    <Box
                                        sx={{
                                            display: 'flex',
                                            justifyContent: 'space-between',
                                            alignItems: 'flex-start',
                                            mb: 1.5,
                                            flexWrap: 'wrap',
                                            gap: 1,
                                        }}
                                    >
                                        <Box sx={{ flex: 1, minWidth: 0 }}>
                                            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, mb: 0.5, flexWrap: 'wrap' }}>
                                                <Typography
                                                    variant="subtitle1"
                                                    fontWeight={700}
                                                    sx={{
                                                        color: 'text.primary',
                                                        fontSize: { xs: '0.95rem', sm: '1rem' },
                                                        // Truncate long titles
                                                        overflow: 'hidden',
                                                        textOverflow: 'ellipsis',
                                                        whiteSpace: 'nowrap',
                                                        maxWidth: '300px'
                                                    }}
                                                >
                                                    {contract.title}
                                                </Typography>
                                                <Chip
                                                    label={contract.status.replace('_', ' ')}
                                                    size="small"
                                                    sx={{
                                                        bgcolor: statusColors.bg,
                                                        color: statusColors.text,
                                                        fontWeight: 600,
                                                        fontSize: '0.75rem',
                                                        height: 24,
                                                        textTransform: 'lowercase',
                                                        '& .MuiChip-label': {
                                                            px: 1.5,
                                                        },
                                                    }}
                                                />
                                            </Box>
                                            <Typography
                                                variant="body2"
                                                sx={{
                                                    color: 'text.secondary',
                                                    fontSize: { xs: '0.85rem', sm: '0.875rem' },
                                                }}
                                            >
                                                {contract.company}
                                            </Typography>
                                        </Box>

                                        <Typography
                                            variant="h6"
                                            fontWeight={700}
                                            sx={{
                                                color: 'text.primary',
                                                fontSize: { xs: '1.1rem', sm: '1.25rem' },
                                            }}
                                        >
                                            {contract.value}
                                        </Typography>
                                    </Box>

                                    {/* Progress Bar (Only for active/expiring/etc with dates) */}
                                    {/* If pending/draft, maybe show something else or hide? Keeping it consistent for now */}
                                    <Box sx={{ mb: 1 }}>
                                        <LinearProgress
                                            variant="determinate"
                                            value={progressValue}
                                            sx={{
                                                height: 6,
                                                borderRadius: 3,
                                                bgcolor: 'rgba(0, 0, 0, 0.06)',
                                                '& .MuiLinearProgress-bar': {
                                                    bgcolor: progressColor,
                                                    borderRadius: 3,
                                                    transition: 'all 0.4s ease-in-out',
                                                },
                                            }}
                                        />
                                    </Box>

                                    {/* Footer */}
                                    <Box
                                        sx={{
                                            display: 'flex',
                                            justifyContent: 'space-between',
                                            alignItems: 'center',
                                            flexWrap: 'wrap',
                                            gap: 1,
                                        }}
                                    >
                                        <Typography
                                            variant="caption"
                                            sx={{
                                                color: 'text.secondary',
                                                fontSize: { xs: '0.75rem', sm: '0.8rem' },
                                                fontWeight: 500,
                                            }}
                                        >
                                            {/* Show "days left" or generic status text */}
                                            {contract.status === 'review_approval' ? 'Waiting for approval' :
                                                contract.status === 'draft' ? 'Draft in progress' :
                                                    `${contract.daysLeft} days left`}
                                        </Typography>

                                        <Button
                                            variant={isHovered ? 'contained' : 'text'}
                                            size="small"
                                            onClick={(e) => {
                                                e.stopPropagation(); // prevent double nav
                                                router.push(contract.path);
                                            }}
                                            sx={{
                                                textTransform: 'none',
                                                fontWeight: 600,
                                                fontSize: '0.875rem',
                                                minWidth: 80,
                                                bgcolor: isHovered ? 'primary.main' : 'transparent',
                                                color: isHovered ? 'white' : 'text.primary',
                                                transition: 'all 0.3s',
                                                '&:hover': {
                                                    bgcolor: 'primary.main',
                                                    color: 'white',
                                                },
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
