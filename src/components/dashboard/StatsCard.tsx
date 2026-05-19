'use client';

import { Box, Typography, Paper, Grow } from '@mui/material';
import CheckCircleOutlineIcon from '@mui/icons-material/CheckCircleOutline';
import WarningAmberIcon from '@mui/icons-material/WarningAmber';
import AccessTimeIcon from '@mui/icons-material/AccessTime';
import DescriptionOutlinedIcon from '@mui/icons-material/DescriptionOutlined';
import HourglassEmptyIcon from '@mui/icons-material/HourglassEmpty';
import CancelOutlinedIcon from '@mui/icons-material/CancelOutlined';
import SendOutlinedIcon from '@mui/icons-material/SendOutlined';
import PendingActionsOutlinedIcon from '@mui/icons-material/PendingActionsOutlined';
import TaskAltOutlinedIcon from '@mui/icons-material/TaskAltOutlined';
import GavelOutlinedIcon from '@mui/icons-material/GavelOutlined';
import BoltOutlinedIcon from '@mui/icons-material/BoltOutlined';
import { useState, useEffect } from 'react';
import { useTheme, alpha } from '@mui/material/styles';

interface StatsCardProps {
    title: string;
    value: number;
    description: string;
    icon: 'check' | 'warning' | 'clock' | 'document' | 'hourglass' | 'cancel' | 'send' | 'pending' | 'taskalt' | 'gavel' | 'bolt';
    iconColor: string;
    iconBgColor: string;
    index?: number;
    onClick?: () => void;
}

const iconMap = {
    check: CheckCircleOutlineIcon,
    warning: WarningAmberIcon,
    clock: AccessTimeIcon,
    document: DescriptionOutlinedIcon,
    hourglass: HourglassEmptyIcon,
    cancel: CancelOutlinedIcon,
    send: SendOutlinedIcon,
    pending: PendingActionsOutlinedIcon,
    taskalt: TaskAltOutlinedIcon,
    gavel: GavelOutlinedIcon,
    bolt: BoltOutlinedIcon,
};

export default function StatsCard({
    title,
    value,
    icon,
    iconColor,
    iconBgColor,
    index = 0,
    onClick,
}: StatsCardProps) {
    const [displayValue, setDisplayValue] = useState(0);
    const [isHovered, setIsHovered] = useState(false);
    const IconComponent = iconMap[icon];
    const theme = useTheme();
    const isDark = theme.palette.mode === 'dark';

    useEffect(() => {
        const duration = 800;
        const steps = 25;
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
        <Grow in timeout={250 + index * 60}>
            <Paper
                elevation={0}
                onMouseEnter={() => setIsHovered(true)}
                onMouseLeave={() => setIsHovered(false)}
                onClick={onClick}
                sx={{
                    p: 1,
                    borderRadius: 2.5,
                    border: '1px solid',
                    borderColor: isHovered ? `${iconColor}70` : isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.08)',
                    cursor: onClick ? 'pointer' : 'default',
                    transition: 'all 0.22s ease',
                    transform: isHovered ? 'translateY(-5px)' : 'translateY(0)',
                    boxShadow: isDark
                        ? isHovered
                            ? '0 8px 24px rgba(0,0,0,0.55), 0 2px 8px rgba(0,0,0,0.4)'
                            : '0 4px 14px rgba(0,0,0,0.45), 0 1px 4px rgba(0,0,0,0.3)'
                        : isHovered
                            ? '0 6px 16px rgba(0,0,0,0.12)'
                            : '0 2px 8px rgba(0,0,0,0.07)',
                    position: 'relative',
                    overflow: 'hidden',
                    // Left accent bar
                    '&::before': {
                        content: '""',
                        position: 'absolute',
                        left: 0,
                        top: 0,
                        bottom: 0,
                        width: '3px',
                        bgcolor: iconColor,
                        opacity: isHovered ? 1 : 0.35,
                        transition: 'opacity 0.22s ease',
                        borderRadius: '4px 0 0 4px',
                    },
                }}
            >
                {/* Top row: icon badge + value */}
                <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 0.5 }}>
                    <Box
                        sx={{
                            width: 30,
                            height: 30,
                            borderRadius: 1.5,
                            bgcolor: isDark ? alpha(iconColor, 0.14) : iconBgColor,
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            flexShrink: 0,
                            transition: 'transform 0.22s ease',
                            transform: isHovered ? 'scale(1.08)' : 'scale(1)',
                        }}
                    >
                        <IconComponent sx={{ fontSize: 15, color: isDark ? alpha(iconColor, 0.75) : iconColor }} />
                    </Box>

                    <Typography
                        variant='h4'
                        sx={{
                            color: isHovered ? (isDark ? alpha(iconColor, 0.85) : iconColor) : 'text.primary',
                            transition: 'color 0.22s ease',
                        }}
                    >
                        {displayValue}
                    </Typography>
                </Box>

                {/* Title */}
                <Typography
                    variant='subtitle2'
                    sx={{
                        color: 'text.primary',   
                        whiteSpace: 'nowrap',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                    }}
                >
                    {title}
                </Typography>
            </Paper>
        </Grow>
    );
}
