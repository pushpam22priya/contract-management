'use client';

import { Box, Typography, Button, Chip, Paper } from '@mui/material';
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
    const { type, title, description, timestamp, isRead, contractId } = notification;

    const typeConfig = {
        warning: {
            icon: <WarningAmberIcon sx={{ fontSize: 20 }} />,
            bgColor: '#fff9e1ff',
            iconColor: '#92400e',
            borderColor: '#ffefaeff',
        },
        success: {
            icon: <CheckCircleOutlineIcon sx={{ fontSize: 20 }} />,
            bgColor: '#dcfce7',
            iconColor: '#166534',
            borderColor: '#bbf7d0',
        },
        info: {
            icon: <InfoOutlinedIcon sx={{ fontSize: 20 }} />,
            bgColor: '#dbeafe',
            iconColor: '#1e40af',
            borderColor: '#bfdbfe',
        },
    };

    const config = typeConfig[type];

    return (
        <Paper
            elevation={0}
            sx={{
                p: 1.2,
                mb: 1,
                borderRadius: 2,
                border: '1px solid',
                borderColor: config.borderColor,
                bgcolor: config.bgColor,
                position: 'relative',
                transition: 'all 0.2s',
                '&:hover': {
                    boxShadow: '0 4px 12px rgba(0,0,0,0.08)',
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
                        bgcolor: 'white',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        color: config.iconColor,
                        flexShrink: 0,
                    }}
                >
                    {config.icon}
                </Box>

                {/* Content */}
                <Box sx={{ flex: 1, minWidth: 0 }}>
                    <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 2 }}>
                        <Typography
                            variant="subtitle1"
                            sx={{
                                fontWeight: 600,
                                color: 'text.primary',
                                fontSize: '0.95rem',
                            }}
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
                                    '& .MuiChip-label': {
                                        px: 1,
                                    },
                                }}
                            />
                        )}
                    </Box>

                    <Typography
                        variant="body2"
                        sx={{
                            color: 'text.secondary',
                            // mb: 1,
                            fontSize: '0.875rem',
                        }}
                    >
                        {description}
                    </Typography>

                    <Typography
                        variant="caption"
                        sx={{
                            color: 'text.secondary',
                            fontSize: '0.75rem',
                            display: 'block',
                            mb: contractId ? 1 : 0,
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
                                borderColor: 'text.primary',
                                color: 'text.primary',
                                bgcolor: 'white',
                                px: 2,
                                py: 0.5,
                                '&:hover': {
                                    borderColor: 'primary.main',
                                    bgcolor: 'primary.main',
                                    color: 'white',
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
