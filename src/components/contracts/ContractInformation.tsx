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
}: ContractInformationProps) => {
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
                            color: 'text.primary',
                            fontWeight: 500,
                        }}
                    >
                        {daysRemaining} days remaining
                    </Typography>
                    <Typography
                        variant="body2"
                        sx={{
                            color: 'text.primary',
                            fontWeight: 600,
                        }}
                    >
                        {progressPercentage}% complete
                    </Typography>
                </Box>

                {/* Progress Bar */}
                <LinearProgress
                    variant="determinate"
                    value={progressPercentage}
                    sx={{
                        height: 8,
                        borderRadius: 1,
                        bgcolor: '#e5e7eb',
                        '& .MuiLinearProgress-bar': {
                            bgcolor: 'text.primary',
                            borderRadius: 1,
                        },
                    }}
                />
            </Box>
        </Paper>
    );
};

export default ContractInformation;
