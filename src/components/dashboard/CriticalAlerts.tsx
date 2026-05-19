'use client';

import AppButton from '@/components/common/AppButton';
import { Box, Typography,  Paper, Fade, Grow } from '@mui/material';
import WarningAmberIcon from '@mui/icons-material/WarningAmber';
import ArrowForwardIcon from '@mui/icons-material/ArrowForward';
import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { contractService } from '@/services/contractService';
import { Contract, ContractStatus } from '@/types/contract';
import { authService } from '@/services/authService';

interface Alert {
    id: string;
    title: string;
    description: string;
    daysRemaining: number;
    contractTitle: string;
    clientName: string;
}

export default function CriticalAlerts() {
    const router = useRouter();
    const [hoveredId, setHoveredId] = useState<string | null>(null);
    const [alerts, setAlerts] = useState<Alert[]>([]);
    const [visible, setVisible] = useState(false);

    useEffect(() => {
        loadAlerts();
    }, []);

    const loadAlerts = async () => {
        const currentUser = authService.getCurrentUser();
        if (!currentUser) return;

        try {
            const allContracts = await contractService.getAllContracts();

            // Check if result is valid array
            if (!Array.isArray(allContracts)) {
                console.error("CriticalAlerts: getAllContracts returned non-array", allContracts);
                return;
            }

            // Filter logic:
            // 1. Must be relevant to user (creator or signer)
            // 2. Status must be 'expiring'
            const expiringContracts = allContracts.filter(c => {
                const isRelevant = c.createdBy === currentUser.email || c.signer?.email === currentUser.email;
                return isRelevant && c.status === ContractStatus.EXPIRING;
            });

            // Map to alerts and sort by nearest expiry (ascending)
            const newAlerts = expiringContracts.map(c => {
                const endDateStr = c.endDate || new Date().toISOString();
                const endDate = new Date(endDateStr);
                const today = new Date();
                const timeDiff = endDate.getTime() - today.getTime();
                const daysRemaining = Math.ceil(timeDiff / (1000 * 3600 * 24));

                const expiryDate = endDate.toLocaleDateString('en-GB');

                return {
                    id: c.id,
                    title: 'Contract Expiring Soon',
                    description: `${c.title} - ${c.client} expires on ${expiryDate}`,
                    daysRemaining,
                    contractTitle: c.title,
                    clientName: c.client
                };
            }).sort((a, b) => a.daysRemaining - b.daysRemaining);

            setAlerts(newAlerts);
            // Only show section if we have alerts
            setVisible(newAlerts.length > 0);
        } catch (error) {
            console.error("CriticalAlerts: Failed to load contracts", error);
        }
    };

    const handleViewAll = () => {
        const params = new URLSearchParams();
        params.set('status', ContractStatus.EXPIRING);
        router.push(`/contracts?${params.toString()}`);
    };

    const handleView = (alert: Alert) => {
        // Navigate with search params to filter for this specific contract
        // We use the contract title for search to narrow it down
        const params = new URLSearchParams();
        params.set('status', ContractStatus.EXPIRING);
        params.set('search', alert.contractTitle);
        router.push(`/contracts?${params.toString()}`);
    };

    if (!visible) return null;

    return (
        <Fade in timeout={800}>
            <Paper
                elevation={0}
                sx={{
                    p: 3,
                    mb: 1.5,
                    background: 'linear-gradient(135deg, #fffbedff 0%, #fffae5ff 100%)',
                    border: '1px solid #fbbf24',
                    borderRadius: 3,
                    position: 'relative',
                    overflow: 'hidden',
                    '&::before': {
                        content: '""',
                        position: 'absolute',
                        top: 0,
                        left: 0,
                        right: 0,
                        height: '4px',
                        background: 'linear-gradient(90deg, #f59e0b, #fbbf24, #f59e0b)',
                        backgroundSize: '200% 100%',
                        animation: 'shimmer 3s infinite',
                    },
                    '@keyframes shimmer': {
                        '0%': { backgroundPosition: '200% 0' },
                        '100%': { backgroundPosition: '-200% 0' },
                    },
                }}
            >
                {/* Header */}
                <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 3 }}>
                    <Box sx={{ display: 'flex', alignItems: 'center' }}>
                        <Box
                            sx={{
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                width: 40,
                                height: 40,
                                borderRadius: '50%',
                                bgcolor: '#f59e0b',
                                mr: 2,
                                animation: 'pulse 2s infinite',
                                '@keyframes pulse': {
                                    '0%, 100%': {
                                        transform: 'scale(1)',
                                        boxShadow: '0 0 0 0 rgba(245, 158, 11, 0.7)',
                                    },
                                    '50%': {
                                        transform: 'scale(1.05)',
                                        boxShadow: '0 0 0 8px rgba(245, 158, 11, 0)',
                                    },
                                },
                            }}
                        >
                            <WarningAmberIcon sx={{ color: 'white', fontSize: 24 }} />
                        </Box>
                        <Typography
                            variant="h6"
                            fontWeight={700}
                            sx={{
                                color: '#92400e',
                                fontSize: { xs: '1.1rem', sm: '1.25rem' }
                            }}
                        >
                            Critical Alerts
                        </Typography>
                    </Box>
                    {alerts.length > 2 && (
                        <AppButton
                            variant="text"
                            size="small"
                            onClick={handleViewAll}
                            sx={{
                                color: '#92400e',
                                fontWeight: 600,
                                '&:hover': {
                                    bgcolor: 'rgba(245, 158, 11, 0.1)',
                                },
                            }}
                        >
                            View All
                        </AppButton>
                    )}
                </Box>

                {/* Alert Items */}
                <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                    {alerts.slice(0, 2).map((alert, index) => (
                        <Grow
                            key={alert.id}
                            in
                            timeout={1000 + index * 200}
                            style={{ transformOrigin: '0 0 0' }}
                        >
                            <Box
                                onMouseEnter={() => setHoveredId(alert.id)}
                                onMouseLeave={() => setHoveredId(null)}
                                sx={{
                                    display: 'flex',
                                    alignItems: { xs: 'flex-start', sm: 'center' },
                                    justifyContent: 'space-between',
                                    flexDirection: { xs: 'column', sm: 'row' },
                                    gap: { xs: 2, sm: 0 },
                                    p: 1.5,
                                    bgcolor: hoveredId === alert.id ? 'rgba(255, 255, 255, 0.9)' : 'rgba(255, 255, 255, 0.6)',
                                    borderRadius: 2,
                                    border: '1px solid',
                                    borderColor: hoveredId === alert.id ? '#f59e0b' : 'rgba(251, 191, 36, 0.3)',
                                    cursor: 'pointer',
                                    transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
                                    transform: hoveredId === alert.id ? 'translateX(4px)' : 'translateX(0)',
                                    boxShadow: hoveredId === alert.id
                                        ? '0 4px 12px rgba(245, 158, 11, 0.2)'
                                        : '0 2px 4px rgba(0, 0, 0, 0.05)',
                                }}
                            >
                                <Box sx={{ flex: 1 }}>
                                    <Typography
                                        variant="subtitle1"
                                        fontWeight={700}
                                        sx={{
                                            color: '#92400e',
                                            mb: 0.5,
                                            fontSize: { xs: '0.95rem', sm: '1rem' }
                                        }}
                                    >
                                        {alert.title}
                                    </Typography>
                                    <Typography
                                        variant="body2"
                                        sx={{
                                            color: '#78350f',
                                            fontSize: { xs: '0.85rem', sm: '0.875rem' }
                                        }}
                                    >
                                        {alert.description}
                                    </Typography>
                                </Box>

                                <AppButton
                                    variant={hoveredId === alert.id ? 'contained' : 'outlined'}
                                    size="small"
                                    onClick={() => handleView(alert)}
                                    endIcon={
                                        <ArrowForwardIcon
                                            sx={{
                                                fontSize: 16,
                                                transition: 'transform 0.3s',
                                                transform: hoveredId === alert.id ? 'translateX(4px)' : 'translateX(0)',
                                            }}
                                        />
                                    }
                                    sx={{
                                        minWidth: { xs: '100%', sm: 'auto' },
                                        borderColor: '#f59e0b',
                                        color: hoveredId === alert.id ? 'white' : '#92400e',
                                        bgcolor: hoveredId === alert.id ? '#f59e0b' : 'transparent',
                                        fontWeight: 600,
                                        px: 3,
                                        py: 1,
                                        borderRadius: 2,
                                        transition: 'all 0.3s',
                                        '&:hover': {
                                            bgcolor: '#f59e0b',
                                            color: 'white',
                                            borderColor: '#f59e0b',
                                            transform: 'translateY(-2px)',
                                            boxShadow: '0 4px 12px rgba(245, 158, 11, 0.3)',
                                        },
                                    }}
                                >
                                    View
                                </AppButton>
                            </Box>
                        </Grow>
                    ))}
                </Box>
            </Paper>
        </Fade>
    );
}
