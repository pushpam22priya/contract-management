'use client';

import { Box, Typography, Paper, Fade, Grow } from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import DescriptionOutlinedIcon from '@mui/icons-material/DescriptionOutlined';
import WarningAmberOutlinedIcon from '@mui/icons-material/WarningAmberOutlined';
import AccessTimeOutlinedIcon from '@mui/icons-material/AccessTimeOutlined';
import ChevronRightIcon from '@mui/icons-material/ChevronRight';
import { useState } from 'react';

interface QuickAction {
    id: number;
    label: string;
    description: string;
    icon: React.ReactNode;
    actionKey: string;
    iconBg: string;
    iconColor: string;
    hoverBg: string;
    hoverBorder: string;
}

const actions: QuickAction[] = [
    {
        id: 1,
        label: 'Create New Contract',
        description: 'Start a new contract draft',
        icon: <AddIcon sx={{ fontSize: 18 }} />,
        actionKey: 'create',
        iconBg: '#d1fae5',
        iconColor: '#059669',
        hoverBg: '#f0fdf4',
        hoverBorder: '#6ee7b7',
    },
    {
        id: 2,
        label: 'Browse Templates',
        description: 'Use a pre-built template',
        icon: <DescriptionOutlinedIcon sx={{ fontSize: 18 }} />,
        actionKey: 'templates',
        iconBg: '#dbeafe',
        iconColor: '#1d4ed8',
        hoverBg: '#eff6ff',
        hoverBorder: '#93c5fd',
    },
    {
        id: 3,
        label: 'Review Expiring Contracts',
        description: 'Contracts expiring soon',
        icon: <WarningAmberOutlinedIcon sx={{ fontSize: 18 }} />,
        actionKey: 'expiring',
        iconBg: '#fef3c7',
        iconColor: '#d97706',
        hoverBg: '#fffbeb',
        hoverBorder: '#fcd34d',
    },
    {
        id: 4,
        label: 'Pending Approvals',
        description: 'Contracts awaiting approval',
        icon: <AccessTimeOutlinedIcon sx={{ fontSize: 18 }} />,
        actionKey: 'approvals',
        iconBg: '#ede9fe',
        iconColor: '#6d28d9',
        hoverBg: '#f5f3ff',
        hoverBorder: '#c4b5fd',
    },
];

interface QuickActionsProps {
    onActionClick?: (actionKey: string) => void;
}

export default function QuickActions({ onActionClick }: QuickActionsProps) {
    const [hoveredId, setHoveredId] = useState<number | null>(null);

    return (
        <Fade in timeout={800}>
            <Paper
                elevation={0}
                sx={{
                    p: 1.5,
                    height: '100%',
                    borderRadius: 3,
                    border: '1px solid',
                    borderColor: 'rgba(0,0,0,0.08)',
                    bgcolor: 'white',
                    boxShadow: '0 1px 3px rgba(0,0,0,0.06)',
                }}
            >
                {/* Header */}
                <Box sx={{ mb: 1 }}>
                    <Typography variant="h6" fontWeight={700} sx={{ fontSize: '1.05rem', color: 'text.primary', }}>
                        Quick Actions
                    </Typography>
                    <Typography variant="body2" sx={{ color: 'text.secondary', fontSize: '0.8rem', }}>
                        Common tasks
                    </Typography>
                </Box>

                {/* Action Items */}
                <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
                    {actions.map((action, index) => {
                        const isHovered = hoveredId === action.id;

                        return (
                            <Grow key={action.id} in timeout={600 + index * 120} style={{ transformOrigin: '0 0 0' }}>
                                <Box
                                    onMouseEnter={() => setHoveredId(action.id)}
                                    onMouseLeave={() => setHoveredId(null)}
                                    onClick={() => onActionClick && onActionClick(action.actionKey)}
                                    sx={{
                                        display: 'flex',
                                        alignItems: 'center',
                                        gap: 1.5,
                                        p: 1,
                                        borderRadius: 2.5,
                                        border: '1px solid',
                                        borderColor: isHovered ? action.hoverBorder : 'rgba(0,0,0,0.07)',
                                        bgcolor: isHovered ? action.hoverBg : 'white',
                                        cursor: 'pointer',
                                        transition: 'all 0.2s ease',
                                        boxShadow: isHovered ? `0 2px 10px ${action.hoverBorder}66` : '0 1px 2px rgba(0,0,0,0.03)',
                                        transform: isHovered ? 'translateX(3px)' : 'none',
                                    }}
                                >
                                    {/* Icon Badge */}
                                    <Box
                                        sx={{
                                            width: 36,
                                            height: 36,
                                            borderRadius: 2,
                                            bgcolor: action.iconBg,
                                            display: 'flex',
                                            alignItems: 'center',
                                            justifyContent: 'center',
                                            color: action.iconColor,
                                            flexShrink: 0,
                                            transition: 'transform 0.2s ease',
                                            transform: isHovered ? 'scale(1.08)' : 'scale(1)',
                                        }}
                                    >
                                        {action.icon}
                                    </Box>

                                    {/* Text */}
                                    <Box sx={{ flex: 1, minWidth: 0 }}>
                                        <Typography
                                            fontWeight={600}
                                            sx={{
                                                fontSize: '0.875rem',
                                                color: isHovered ? action.iconColor : 'text.primary',
                                                transition: 'color 0.2s',
                                            }}
                                        >
                                            {action.label}
                                        </Typography>
                                        <Typography variant="caption" sx={{ fontSize: '0.72rem', color: 'text.secondary' }}>
                                            {action.description}
                                        </Typography>
                                    </Box>

                                    {/* Chevron */}
                                    <ChevronRightIcon
                                        sx={{
                                            fontSize: 18,
                                            color: isHovered ? action.iconColor : 'text.disabled',
                                            transition: 'all 0.2s ease',
                                            transform: isHovered ? 'translateX(2px)' : 'none',
                                            flexShrink: 0,
                                        }}
                                    />
                                </Box>
                            </Grow>
                        );
                    })}
                </Box>
            </Paper>
        </Fade>
    );
}
