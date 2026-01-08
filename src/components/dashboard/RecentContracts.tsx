'use client';

import { Box, Typography, Paper, Button, Chip, LinearProgress, Fade, Grow } from '@mui/material';
import { useState } from 'react';

interface Contract {
    id: number;
    title: string;
    company: string;
    status: 'active' | 'expiring';
    daysLeft: number;
    totalDays: number;
    value: string;
}

const contracts: Contract[] = [
    {
        id: 1,
        title: 'Annual Software Maintenance - TechCorp',
        company: 'TechCorp Solutions',
        status: 'active',
        daysLeft: 362,
        totalDays: 365,
        value: '₹125K',
    },
    {
        id: 2,
        title: 'Consulting Services - Global Industries',
        company: 'Global Industries Inc.',
        status: 'expiring',
        daysLeft: 28,
        totalDays: 365,
        value: ' ₹85K',
    },
];

export default function RecentContracts() {
    const [hoveredId, setHoveredId] = useState<number | null>(null);

    const getStatusColor = (status: string) => {
        return status === 'active'
            ? { bg: '#d1fae5', text: '#10b981' }
            : { bg: '#fef3c7', text: '#f59e0b' };
    };

    const getProgressColor = (status: string) => {
        return status === 'active' ? '#10b981' : '#f59e0b';
    };

    const getProgressValue = (daysLeft: number, totalDays: number) => {
        return (daysLeft / totalDays) * 100;
    };

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
                    {contracts.map((contract, index) => {
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
                                                    }}
                                                >
                                                    {contract.title}
                                                </Typography>
                                                <Chip
                                                    label={contract.status}
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

                                    {/* Progress Bar */}
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
                                            {contract.daysLeft} days left
                                        </Typography>

                                        <Button
                                            variant={isHovered ? 'contained' : 'text'}
                                            size="small"
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
