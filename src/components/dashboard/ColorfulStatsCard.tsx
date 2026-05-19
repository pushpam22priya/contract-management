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

interface ColorfulStatsCardProps {
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

export default function ColorfulStatsCard({
    title,
    value,
    description: _description,
    icon,
    iconColor,
    iconBgColor: _iconBgColor,
    index = 0,
    onClick,
}: ColorfulStatsCardProps) {
    const [displayValue, setDisplayValue] = useState(0);
    const IconComponent = iconMap[icon];

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
                onClick={onClick}
                sx={{
                    p: 1.5,
                    borderRadius: 2.5,
                    cursor: onClick ? 'pointer' : 'default',
                    position: 'relative',
                    overflow: 'hidden',
                    // Fully opaque card: white overlay gradient on solid color base
                    background: `linear-gradient(135deg, rgba(255,255,255,0.18) 0%, rgba(255,255,255,0) 60%), ${iconColor}`,
                    border: 'none',
                    transition: 'transform 0.28s ease, box-shadow 0.28s ease',
                    boxShadow: `0 6px 20px ${iconColor}60, 0 2px 6px rgba(0,0,0,0.18), inset 0 1px 0 rgba(255,255,255,0.15)`,
                    '&:hover': {
                        transform: 'translateY(-5px) scale(1.01)',
                        boxShadow: `0 12px 32px ${iconColor}75, 0 4px 12px rgba(0,0,0,0.22)`,
                    },
                    // Shine sweep on hover
                    '&::after': {
                        content: '""',
                        position: 'absolute',
                        top: '-60%',
                        left: '-80%',
                        width: '55%',
                        height: '220%',
                        background: 'linear-gradient(to right, rgba(255,255,255,0) 0%, rgba(255,255,255,0.28) 50%, rgba(255,255,255,0) 100%)',
                        transform: 'skewX(-18deg)',
                        transition: 'left 0.55s ease',
                        pointerEvents: 'none',
                    },
                    '&:hover::after': {
                        left: '160%',
                    },
                    // Large decorative circle — top right
                    '&::before': {
                        content: '""',
                        position: 'absolute',
                        right: -18,
                        top: -18,
                        width: 72,
                        height: 72,
                        borderRadius: '50%',
                        background: 'rgba(255,255,255,0.12)',
                        pointerEvents: 'none',
                    },
                }}
            >
                {/* Small decorative circle — bottom left */}
                <Box sx={{
                    position: 'absolute',
                    bottom: -14,
                    left: -14,
                    width: 52,
                    height: 52,
                    borderRadius: '50%',
                    bgcolor: 'rgba(255,255,255,0.09)',
                    pointerEvents: 'none',
                }} />

                {/* Top row: icon badge + value */}
                <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 1, position: 'relative', zIndex: 1 }}>
                    <Box
                        sx={{
                            width: 36,
                            height: 36,
                            borderRadius: 1.5,
                            bgcolor: 'rgba(255,255,255,0.22)',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            flexShrink: 0,
                            backdropFilter: 'blur(4px)',
                            boxShadow: '0 2px 8px rgba(0,0,0,0.12)',
                            transition: 'transform 0.25s ease, background-color 0.25s ease',
                            '.MuiPaper-root:hover &': {
                                transform: 'scale(1.1) rotate(-4deg)',
                                bgcolor: 'rgba(255,255,255,0.32)',
                            },
                        }}
                    >
                        <IconComponent sx={{ fontSize: 18, color: 'white' }} />
                    </Box>

                    <Typography
                        sx={{
                            fontSize: '2rem',
                            fontWeight: 800,
                            color: 'white',
                            lineHeight: 1,
                            letterSpacing: '-0.03em',
                            textShadow: '0 2px 8px rgba(0,0,0,0.15)',
                        }}
                    >
                        {displayValue}
                    </Typography>
                </Box>

                {/* Title */}
                <Typography
                    sx={{
                        fontSize: '0.78rem',
                        fontWeight: 600,
                        color: 'rgba(255,255,255,0.95)',
                        lineHeight: 1.3,
                        whiteSpace: 'nowrap',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        position: 'relative',
                        zIndex: 1,
                    }}
                >
                    {title}
                </Typography>
            </Paper>
        </Grow>
    );
}
