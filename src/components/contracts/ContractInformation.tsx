'use client';

import { Box, Typography, Paper, LinearProgress } from '@mui/material';
import CalendarTodayOutlinedIcon from '@mui/icons-material/CalendarTodayOutlined';

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
    // Get progress bar color based on status
    const getProgressBarColor = () => {
        switch (status) {
            case 'active':
                return '#0f766e'; // Teal - healthy/active
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
        switch (status) {
            case 'active':
                return '#d1fae5'; // Light teal
            case 'signed':
                return '#e0e7ff'; // Light indigo
            case 'expiring':
                return '#fef3c7'; // Light amber
            case 'expired':
                return '#fee2e2'; // Light red
            default:
                return '#e5e7eb'; // Light gray
        }
    };

    // Get status-specific text for days remaining
    const getDaysText = () => {
        if (status === 'signed' && daysRemaining > 0) {
            return `Starts in ${daysRemaining} days`;
        }
        if (status === 'expired' || daysRemaining < 0) {
            return `Expired ${Math.abs(daysRemaining)} days ago`;
        }
        if (daysRemaining === 0) {
            return 'Ends today';
        }
        return `${daysRemaining} days remaining`;
    };
    return (
        <Paper
            elevation={0}
            sx={{
                p: { xs: 1, sm: 2 },
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
                    mb: 1,
                    color: 'text.primary',
                    fontSize: { xs: '1.1rem', sm: '1.25rem' },
                }}
            >
                Contract Information
            </Typography>

            {/* Info Grid - First Section */}
            <Box
                sx={{
                    display: 'grid',
                    gridTemplateColumns: { xs: '1fr', sm: 'repeat(2, 1fr)' },
                    gap: 2,
                    mb: 1,
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
                            fontSize: '0.875rem',
                        }}
                    >
                        Client
                    </Typography>
                    <Typography
                        variant="body2"
                        fontWeight={600}
                        sx={{
                            color: 'text.primary',
                            fontSize: { xs: '1rem', sm: '1rem' },
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
                            fontSize: '0.875rem',
                        }}
                    >
                        Contract Value
                    </Typography>
                    <Typography
                        variant="body2"
                        fontWeight={600}
                        sx={{
                            color: 'text.primary',
                            fontSize: { xs: '1rem', sm: '1rem' },
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
                            fontSize: '0.875rem',
                        }}
                    >
                        Category
                    </Typography>
                    <Typography
                        variant="body2"
                        fontWeight={600}
                        sx={{
                            color: 'text.primary',
                            fontSize: { xs: '1rem', sm: '1rem' },
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
                            fontSize: '0.875rem',
                        }}
                    >
                        Template
                    </Typography>
                    <Typography
                        variant="body2"
                        fontWeight={600}
                        sx={{
                            color: 'text.primary',
                            fontSize: { xs: '1rem', sm: '1rem' },
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
                            fontSize: '0.875rem',
                        }}
                    >
                        Start Date
                    </Typography>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                        <CalendarTodayOutlinedIcon
                            sx={{
                                fontSize: '1rem',
                                color: 'text.secondary',
                            }}
                        />
                        <Typography
                            variant="body2"
                            fontWeight={600}
                            sx={{
                                color: 'text.primary',
                                fontSize: { xs: '1rem', sm: '1rem' },
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
                            fontSize: '0.875rem',
                        }}
                    >
                        End Date
                    </Typography>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                        <CalendarTodayOutlinedIcon
                            sx={{
                                fontSize: '1rem',
                                color: 'text.secondary',
                            }}
                        />
                        <Typography
                            variant="body2"
                            fontWeight={600}
                            sx={{
                                color: 'text.primary',
                                fontSize: { xs: '1rem', sm: '1rem' },
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
                            fontSize: '0.875rem',
                        }}
                    >
                        Description
                    </Typography>
                    <Typography
                        variant="body2"
                        sx={{
                            color: 'text.primary',
                            fontSize: { xs: '0.95rem', sm: '1rem' },
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
                        fontSize: '0.875rem',
                    }}
                >
                    Contract Progress
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
                        {progressPercentage}% remaining
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
