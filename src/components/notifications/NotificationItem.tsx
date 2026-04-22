'use client';

import { Box, Typography, Button, Chip, Paper, useTheme } from '@mui/material';
import { alpha } from '@mui/material/styles';
import WarningAmberIcon from '@mui/icons-material/WarningAmber';
import CheckCircleOutlineIcon from '@mui/icons-material/CheckCircleOutline';
import InfoOutlinedIcon from '@mui/icons-material/InfoOutlined';

export interface Notification {
    id: string;
    type: 'warning' | 'success' | 'info';
    title: string;
    description: string;
    timestamp: string;
    isRead: boolean;
    contractId?: string;
}

interface NotificationItemProps {
    notification: Notification;
    onViewContract?: (contractId: string) => void;
}

export default function NotificationItem({ notification, onViewContract }: NotificationItemProps) {
    const theme = useTheme();
    const isDark = theme.palette.mode === 'dark';
    const { type, title, description, timestamp, isRead, contractId } = notification;

    const colorMap = {
        warning: theme.palette.warning?.main || '#f59e0b',
        success: theme.palette.success.main,
        info: theme.palette.primary.main,
    };

    const iconMap = {
        warning: <WarningAmberIcon sx={{ fontSize: 20 }} />,
        success: <CheckCircleOutlineIcon sx={{ fontSize: 20 }} />,
        info: <InfoOutlinedIcon sx={{ fontSize: 20 }} />,
    };

    const color = colorMap[type];

    return (
        <Paper
            elevation={0}
            sx={{
                p: 2,
                mb: 1,
                borderRadius: 2,
                border: '1px solid',
                borderColor: alpha(color, isDark ? 0.22 : 0.28),
                bgcolor: alpha(color, isDark ? 0.08 : 0.10),
                position: 'relative',
                transition: 'all 0.2s',
                '&:hover': {
                    borderColor: alpha(color, isDark ? 0.38 : 0.45),
                    boxShadow: `0 4px 12px ${alpha(color, isDark ? 0.10 : 0.08)}`,
                },
            }}
        >
            <Box sx={{ display: 'flex', gap: 2, alignItems: 'flex-start' }}>
                {/* Icon */}
                <Box
                    sx={{
                        width: 40,
                        height: 40,
                        borderRadius: '50%',
                        bgcolor: alpha(color, isDark ? 0.18 : 0.14),
                        border: `1px solid ${alpha(color, isDark ? 0.30 : 0.25)}`,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        color: color,
                        flexShrink: 0,
                    }}
                >
                    {iconMap[type]}
                </Box>

                {/* Content */}
                <Box sx={{ flex: 1, minWidth: 0 }}>
                    <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 2 }}>
                        <Typography
                            variant="subtitle1"
                            sx={{ fontWeight: 600, color: 'text.primary', fontSize: '0.95rem' }}
                        >
                            {title}
                        </Typography>
                        {!isRead && (
                            <Chip
                                label="New"
                                size="small"
                                sx={{
                                    height: 20,
                                    fontSize: '0.7rem',
                                    fontWeight: 600,
                                    bgcolor: 'primary.main',
                                    color: 'white',
                                    '& .MuiChip-label': { px: 1 },
                                }}
                            />
                        )}
                    </Box>

                    <Typography
                        variant="body2"
                        sx={{ color: 'text.secondary', fontSize: '0.875rem' }}
                    >
                        {description}
                    </Typography>

                    <Typography
                        variant="caption"
                        sx={{
                            color: 'text.disabled',
                            fontSize: '0.75rem',
                            display: 'block',
                            mb: contractId ? 1 : 0,
                            mt: 0.25,
                        }}
                    >
                        {timestamp}
                    </Typography>

                    {contractId && (
                        <Button
                            variant="outlined"
                            size="small"
                            onClick={() => onViewContract?.(contractId)}
                            sx={{
                                textTransform: 'none',
                                fontWeight: 500,
                                fontSize: '0.8125rem',
                                borderColor: alpha(color, 0.45),
                                color: isDark ? color : 'text.primary',
                                px: 2,
                                py: 0.5,
                                '&:hover': {
                                    borderColor: color,
                                    bgcolor: alpha(color, 0.12),
                                    color: color,
                                },
                            }}
                        >
                            View Contract
                        </Button>
                    )}
                </Box>
            </Box>
        </Paper>
    );
}