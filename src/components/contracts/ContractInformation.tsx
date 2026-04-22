'use client';

import { Box, Typography, Paper, LinearProgress, useTheme } from '@mui/material';
import { alpha } from '@mui/material/styles';
import CalendarTodayOutlinedIcon from '@mui/icons-material/CalendarTodayOutlined';
import { useTranslations } from 'next-intl';

interface ContractInformationProps {
    client: string;
    contractValue: string;
    category: string;
    template: string;
    startDate: string;
    endDate: string;
    daysRemaining: number;
    progressPercentage: number;
    status?: string;
    description?: string;
}

const ContractInformation = ({
    client,
    contractValue,
    category,
    template,
    startDate,
    endDate,
    daysRemaining,
    progressPercentage,
    status,
    description,
}: ContractInformationProps) => {
    const t = useTranslations('contractDetail');
    const theme = useTheme();
    const isDark = theme.palette.mode === 'dark';

    // Get progress bar color based on status
    const getProgressBarColor = () => {
        switch (status) {
            case 'active':
                return theme.palette.primary.main;
            case 'signed':
                return '#6366f1'; // Indigo - signed but not started
            case 'expiring':
                return '#f59e0b'; // Amber/Orange - warning
            case 'expired':
                return '#ef4444'; // Red - expired
            default:
                return '#6b7280'; // Gray - default
        }
    };

    // Get progress bar background color
    const getProgressBarBgColor = () => {
        if (isDark) {
            switch (status) {
                case 'active':   return alpha('#10b981', 0.12);
                case 'signed':   return alpha('#6366f1', 0.12);
                case 'expiring': return alpha('#f59e0b', 0.12);
                case 'expired':  return alpha('#ef4444', 0.12);
                default:         return alpha('#6b7280', 0.12);
            }
        }
        switch (status) {
            case 'active':   return '#d1fae5';
            case 'signed':   return '#e0e7ff';
            case 'expiring': return '#fef3c7';
            case 'expired':  return '#fee2e2';
            default:         return '#e5e7eb';
        }
    };

    // Get status-specific text for days remaining
    const getDaysText = () => {
        if (status === 'signed' && daysRemaining > 0) {
            return t('startsIn', { days: daysRemaining });
        }
        if (status === 'expired' || daysRemaining < 0) {
            return t('expiredDaysAgo', { days: Math.abs(daysRemaining) });
        }
        if (daysRemaining === 0) {
            return t('endsToday');
        }
        return t('daysRemaining', { days: daysRemaining });
    };
    return (
        <Paper
            elevation={0}
            sx={{
                p: { xs: 1, sm: 1.5 },
                borderRadius: 3,
                border: '1px solid',
                borderColor: 'divider',
                transition: 'box-shadow 0.3s ease',
                '&:hover': {
                    boxShadow: '0 4px 12px rgba(0,0,0,0.08)',
                },
            }}
        >
            {/* Title */}
            <Typography
                variant="h6"
                fontWeight={700}
                sx={{
                    mb: 0.75,
                    color: 'text.primary',
                    fontSize: { xs: '1rem', sm: '1.1rem' },
                }}
            >
                {t('contractInformation')}
            </Typography>

            {/* Info Grid - First Section */}
            <Box
                sx={{
                    display: 'grid',
                    gridTemplateColumns: { xs: '1fr', sm: 'repeat(2, 1fr)' },
                    gap: 1.25,
                    mb: 0.75,
                }}
            >
                {/* Client */}
                <Box>
                    <Typography
                        variant="caption"
                        sx={{
                            color: 'text.secondary',
                            display: 'block',
                            // mb: 0.5,
                            fontSize: '0.75rem',
                        }}
                    >
                        {t('client')}
                    </Typography>
                    <Typography
                        variant="body2"
                        fontWeight={600}
                        sx={{
                            color: 'text.primary',
                            fontSize: '0.875rem',
                        }}
                    >
                        {client}
                    </Typography>
                </Box>

                {/* Contract Value */}
                <Box>
                    <Typography
                        variant="caption"
                        sx={{
                            color: 'text.secondary',
                            display: 'block',
                            // mb: 0.5,
                            fontSize: '0.75rem',
                        }}
                    >
                        {t('contractValue')}
                    </Typography>
                    <Typography
                        variant="body2"
                        fontWeight={600}
                        sx={{
                            color: 'text.primary',
                            fontSize: '0.875rem',
                        }}
                    >
                        {contractValue}
                    </Typography>
                </Box>

                {/* Category */}
                <Box>
                    <Typography
                        variant="caption"
                        sx={{
                            color: 'text.secondary',
                            display: 'block',
                            // mb: 0.5,
                            fontSize: '0.75rem',
                        }}
                    >
                        {t('category')}
                    </Typography>
                    <Typography
                        variant="body2"
                        fontWeight={600}
                        sx={{
                            color: 'text.primary',
                            fontSize: '0.875rem',
                        }}
                    >
                        {category}
                    </Typography>
                </Box>

                {/* Template */}
                <Box>
                    <Typography
                        variant="caption"
                        sx={{
                            color: 'text.secondary',
                            display: 'block',
                            // mb: 0.5,
                            fontSize: '0.75rem',
                        }}
                    >
                        {t('template')}
                    </Typography>
                    <Typography
                        variant="body2"
                        fontWeight={600}
                        sx={{
                            color: 'text.primary',
                            fontSize: '0.875rem',
                        }}
                    >
                        {template}
                    </Typography>
                </Box>
            </Box>

            {/* Divider */}
            <Box
                sx={{
                    height: '1px',
                    bgcolor: 'divider',
                    mb: 1,
                }}
            />

            {/* Date Section */}
            <Box
                sx={{
                    display: 'grid',
                    gridTemplateColumns: { xs: '1fr', sm: 'repeat(2, 1fr)' },
                    gap: 2,
                    mb: 1,
                }}
            >
                {/* Start Date */}
                <Box>
                    <Typography
                        variant="caption"
                        sx={{
                            color: 'text.secondary',
                            display: 'block',
                            // mb: 0.5,
                            fontSize: '0.75rem',
                        }}
                    >
                        {t('startDate')}
                    </Typography>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                        <CalendarTodayOutlinedIcon
                            sx={{
                                fontSize: '0.9rem',
                                color: 'text.secondary',
                            }}
                        />
                        <Typography
                            variant="body2"
                            fontWeight={600}
                            sx={{
                                color: 'text.primary',
                                fontSize: '0.875rem',
                            }}
                        >
                            {startDate}
                        </Typography>
                    </Box>
                </Box>

                {/* End Date */}
                <Box>
                    <Typography
                        variant="caption"
                        sx={{
                            color: 'text.secondary',
                            display: 'block',
                            // mb: 0.5,
                            fontSize: '0.75rem',
                        }}
                    >
                        {t('endDate')}
                    </Typography>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                        <CalendarTodayOutlinedIcon
                            sx={{
                                fontSize: '0.9rem',
                                color: 'text.secondary',
                            }}
                        />
                        <Typography
                            variant="body2"
                            fontWeight={600}
                            sx={{
                                color: 'text.primary',
                                fontSize: '0.875rem',
                            }}
                        >
                            {endDate}
                        </Typography>
                    </Box>
                </Box>
            </Box>

            {/* Divider */}
            <Box
                sx={{
                    height: '1px',
                    bgcolor: 'divider',
                    mb: 1,
                }}
            />

            {/* Description Section */}
            {description && (
                <Box sx={{ mb: 1.5 }}>
                    <Typography
                        variant="caption"
                        sx={{
                            color: 'text.secondary',
                            display: 'block',
                            mb: 0.5,
                            fontSize: '0.75rem',
                        }}
                    >
                        {t('description')}
                    </Typography>
                    <Typography
                        variant="body2"
                        sx={{
                            color: 'text.primary',
                            fontSize: '0.875rem',
                            // lineHeight: 1.5,
                        }}
                    >
                        {description}
                    </Typography>
                    {/* Divider inside if exists */}
                    <Box
                        sx={{
                            height: '1px',
                            bgcolor: 'divider',
                            my: 1,
                        }}
                    />
                </Box>
            )}

            {/* Contract Progress */}
            <Box>
                <Typography
                    variant="caption"
                    sx={{
                        color: 'text.secondary',
                        display: 'block',
                        mb: 0.5,
                        fontSize: '0.75rem',
                    }}
                >
                    {t('contractProgress')}
                </Typography>

                {/* Progress Info */}
                <Box
                    sx={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                        mb: 1,
                    }}
                >
                    <Typography
                        variant="body2"
                        sx={{
                            color: status === 'expiring' ? '#f59e0b' : status === 'expired' ? '#ef4444' : 'text.primary',
                            fontWeight: 500,
                        }}
                    >
                        {getDaysText()}
                    </Typography>
                    <Typography
                        variant="body2"
                        sx={{
                            color: 'text.primary',
                            fontWeight: 600,
                        }}
                    >
                        {t('percentRemaining', { pct: progressPercentage })}
                    </Typography>
                </Box>

                {/* Progress Bar */}
                <LinearProgress
                    variant="determinate"
                    value={progressPercentage}
                    sx={{
                        height: 8,
                        borderRadius: 1,
                        bgcolor: getProgressBarBgColor(),
                        '& .MuiLinearProgress-bar': {
                            bgcolor: getProgressBarColor(),
                            borderRadius: 1,
                        },
                    }}
                />
            </Box>
        </Paper>
    );
};

export default ContractInformation;
