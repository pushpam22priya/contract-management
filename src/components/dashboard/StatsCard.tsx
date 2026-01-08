'use client';

import { Box, Typography, Paper, Grow } from '@mui/material';
import CheckCircleOutlineIcon from '@mui/icons-material/CheckCircleOutline';
import WarningAmberIcon from '@mui/icons-material/WarningAmber';
import AccessTimeIcon from '@mui/icons-material/AccessTime';
import DescriptionOutlinedIcon from '@mui/icons-material/DescriptionOutlined';
import HourglassEmptyIcon from '@mui/icons-material/HourglassEmpty';
import CancelOutlinedIcon from '@mui/icons-material/CancelOutlined';
import { useState, useEffect } from 'react';

interface StatsCardProps {
    title: string;
    value: number;
    description: string;
    icon: 'check' | 'warning' | 'clock' | 'document' | 'hourglass' | 'cancel';
    iconColor: string;
    iconBgColor: string;
    index?: number;
}

const iconMap = {
    check: CheckCircleOutlineIcon,
    warning: WarningAmberIcon,
    clock: AccessTimeIcon,
    document: DescriptionOutlinedIcon,
    hourglass: HourglassEmptyIcon,
    cancel: CancelOutlinedIcon,
};

export default function StatsCard({
    title,
    value,
    description,
    icon,
    iconColor,
    iconBgColor,
    index = 0,
}: StatsCardProps) {
    const [displayValue, setDisplayValue] = useState(0);
    const [isHovered, setIsHovered] = useState(false);
    const IconComponent = iconMap[icon];

    // Animated counter effect
    useEffect(() => {
        const duration = 1000; // 1 second
        const steps = 30;
        const stepValue = value / steps;
        const stepDuration = duration / steps;
        let currentStep = 0;

        const timer = setInterval(() => {
            currentStep++;
            if (currentStep <= steps) {
                setDisplayValue(Math.floor(stepValue * currentStep));
            } else {
                setDisplayValue(value);
                clearInterval(timer);
            }
        }, stepDuration);

        return () => clearInterval(timer);
    }, [value]);

    return (
        <Grow in timeout={600 + index * 150}>
            <Paper
                elevation={0}
                onMouseEnter={() => setIsHovered(true)}
                onMouseLeave={() => setIsHovered(false)}
                sx={{
                    p: 2,
                    height: '100%',
                    borderRadius: 3,
                    border: '1px solid',
                    borderColor: isHovered ? iconColor : 'rgba(0, 0, 0, 0.08)',
                    bgcolor: 'white',
                    position: 'relative',
                    overflow: 'hidden',
                    cursor: 'pointer',
                    transition: 'all 0.4s cubic-bezier(0.4, 0, 0.2, 1)',
                    transform: isHovered ? 'translateY(-8px)' : 'translateY(0)',
                    boxShadow: isHovered
                        ? `0 12px 24px ${iconColor}20`
                        : '0 2px 8px rgba(0, 0, 0, 0.05)',
                    '&::before': {
                        content: '""',
                        position: 'absolute',
                        top: 0,
                        left: 0,
                        right: 0,
                        height: '3px',
                        bgcolor: iconColor,
                        transform: isHovered ? 'scaleX(1)' : 'scaleX(0)',
                        transformOrigin: 'left',
                        transition: 'transform 0.4s cubic-bezier(0.4, 0, 0.2, 1)',
                    },
                }}
            >
                <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                    {/* Left Side - Text Content */}
                    <Box sx={{ flex: 1 }}>
                        <Typography
                            variant="body2"
                            sx={{
                                color: 'text.secondary',
                                fontWeight: 500,
                                mb: 1,
                                fontSize: { xs: '0.875rem', sm: '0.9rem' },
                            }}
                        >
                            {title}
                        </Typography>

                        <Typography
                            variant="h3"
                            sx={{
                                fontWeight: 700,
                                color: 'text.primary',
                                mb: 1,
                                fontSize: { xs: '2.5rem', sm: '3rem' },
                                lineHeight: 1,
                            }}
                        >
                            {displayValue}
                        </Typography>

                        <Typography
                            variant="caption"
                            sx={{
                                color: 'text.secondary',
                                fontSize: { xs: '0.75rem', sm: '0.8rem' },
                                display: 'block',
                                fontWeight: 500,
                            }}
                        >
                            {description}
                        </Typography>
                    </Box>

                    {/* Right Side - Icon */}
                    <Box
                        sx={{
                            width: { xs: 48, sm: 56 },
                            height: { xs: 48, sm: 56 },
                            borderRadius: '50%',
                            bgcolor: iconBgColor,
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            flexShrink: 0,
                            transition: 'all 0.4s cubic-bezier(0.4, 0, 0.2, 1)',
                            transform: isHovered ? 'scale(1.1) rotate(10deg)' : 'scale(1) rotate(0deg)',
                        }}
                    >
                        <IconComponent
                            sx={{
                                fontSize: { xs: 24, sm: 28 },
                                color: iconColor,
                                transition: 'transform 0.3s',
                            }}
                        />
                    </Box>
                </Box>
            </Paper>
        </Grow>
    );
}
