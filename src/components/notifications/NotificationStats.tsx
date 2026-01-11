'use client';

import { Box, Typography, Paper } from '@mui/material';
import NotificationsActiveIcon from '@mui/icons-material/NotificationsActive';
import WarningAmberIcon from '@mui/icons-material/WarningAmber';
import CheckCircleOutlineIcon from '@mui/icons-material/CheckCircleOutline';

interface NotificationStatsProps {
    unreadCount: number;
    warningsCount: number;
    totalCount: number;
}

export default function NotificationStats({ unreadCount, warningsCount, totalCount }: NotificationStatsProps) {
    const stats = [
        {
            label: 'Unread',
            count: unreadCount,
            icon: <NotificationsActiveIcon sx={{ fontSize: 24 }} />,
            bgColor: '#dbeafe',
            iconColor: '#1e40af',
        },
        {
            label: 'Warnings',
            count: warningsCount,
            icon: <WarningAmberIcon sx={{ fontSize: 24 }} />,
            bgColor: '#fef3c7',
            iconColor: '#92400e',
        },
        {
            label: 'Total',
            count: totalCount,
            icon: <CheckCircleOutlineIcon sx={{ fontSize: 24 }} />,
            bgColor: '#dcfce7',
            iconColor: '#166534',
        },
    ];

    return (
        <Box
            sx={{
                display: 'grid',
                gridTemplateColumns: { xs: '1fr', sm: 'repeat(3, 1fr)' },
                gap: 2,
                mb: 2,
            }}
        >
            {stats.map((stat) => (
                <Paper
                    key={stat.label}
                    elevation={0}
                    sx={{
                        p: 1,
                        borderRadius: 2,
                        border: '1px solid',
                        borderColor: 'divider',
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                        transition: 'all 0.2s',
                        '&:hover': {
                            boxShadow: '0 4px 12px rgba(0,0,0,0.08)',
                            transform: 'translateY(-2px)',
                        },
                    }}
                >
                    <Box>
                        <Typography
                            variant="caption"
                            sx={{
                                color: 'text.secondary',
                                fontSize: '0.75rem',
                                fontWeight: 500,
                                textTransform: 'uppercase',
                                letterSpacing: '0.5px',
                                display: 'block',
                                mb: 0.5,
                            }}
                        >
                            {stat.label}
                        </Typography>
                        <Typography
                            variant="h3"
                            sx={{
                                fontWeight: 700,
                                color: 'text.primary',
                            }}
                        >
                            {stat.count}
                        </Typography>
                    </Box>

                    <Box
                        sx={{
                            width: 56,
                            height: 56,
                            borderRadius: '50%',
                            bgcolor: stat.bgColor,
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            color: stat.iconColor,
                        }}
                    >
                        {stat.icon}
                    </Box>
                </Paper>
            ))}
        </Box>
    );
}
