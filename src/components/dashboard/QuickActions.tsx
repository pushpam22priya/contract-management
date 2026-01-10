'use client';

import { Box, Typography, Paper, Button, Fade, Grow } from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import DescriptionOutlinedIcon from '@mui/icons-material/DescriptionOutlined';
import WarningAmberOutlinedIcon from '@mui/icons-material/WarningAmberOutlined';
import AccessTimeOutlinedIcon from '@mui/icons-material/AccessTimeOutlined';
import { useState } from 'react';

interface QuickAction {
    id: number;
    label: string;
    icon: React.ReactNode;
    actionKey: string;
}

const actions: QuickAction[] = [
    {
        id: 1,
        label: 'Create New Contract',
        icon: <AddIcon />,
        actionKey: 'create',
    },
    {
        id: 2,
        label: 'Browse Templates',
        icon: <DescriptionOutlinedIcon />,
        actionKey: 'templates',
    },
    {
        id: 3,
        label: 'Review Expiring Contracts',
        icon: <WarningAmberOutlinedIcon />,
        actionKey: 'expiring',
    },
    {
        id: 4,
        label: 'Pending Approvals',
        icon: <AccessTimeOutlinedIcon />,
        actionKey: 'approvals',
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
                    p: { xs: 1.5, sm: 2 },
                    height: '100%',
                    borderRadius: 3,
                    border: '1px solid',
                    borderColor: 'rgba(0, 0, 0, 0.08)',
                    bgcolor: 'white',
                }}
            >
                {/* Header */}
                <Box sx={{ mb: 1 }}>
                    <Typography
                        variant="h6"
                        fontWeight={700}
                        sx={{
                            color: 'text.primary',
                            fontSize: { xs: '1.1rem', sm: '1.25rem' },
                        }}
                    >
                        Quick Actions
                    </Typography>
                    <Typography
                        variant="body2"
                        sx={{
                            color: 'text.secondary',
                            fontSize: { xs: '0.85rem', sm: '0.875rem' },
                        }}
                    >
                        Common tasks
                    </Typography>
                </Box>

                {/* Action Buttons */}
                <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
                    {actions.map((action, index) => {
                        const isHovered = hoveredId === action.id;

                        return (
                            <Grow
                                key={action.id}
                                in
                                timeout={800 + index * 150}
                                style={{ transformOrigin: '0 0 0' }}
                            >
                                <Button
                                    variant="outlined"
                                    onMouseEnter={() => setHoveredId(action.id)}
                                    onMouseLeave={() => setHoveredId(null)}
                                    onClick={() => onActionClick && onActionClick(action.actionKey)}
                                    sx={{
                                        display: 'flex',
                                        justifyContent: 'flex-start',
                                        alignItems: 'center',
                                        gap: 2,
                                        p: 1,
                                        borderRadius: 2,
                                        textTransform: 'none',
                                        borderColor: isHovered ? 'primary.main' : 'rgba(0, 0, 0, 0.12)',
                                        bgcolor: isHovered ? 'rgba(15, 118, 110, 0.04)' : 'transparent',
                                        color: 'text.primary',
                                        transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
                                        '&:hover': {
                                            borderColor: 'primary.main',
                                            bgcolor: 'rgba(15, 118, 110, 0.04)',
                                            transform: 'translateX(4px)',
                                            boxShadow: '0 2px 8px rgba(15, 118, 110, 0.12)',
                                        },
                                        '& .MuiButton-startIcon': {
                                            margin: 0,
                                        },
                                    }}
                                    startIcon={
                                        <Box
                                            sx={{
                                                display: 'flex',
                                                alignItems: 'center',
                                                justifyContent: 'center',
                                                fontSize: 20,
                                                color: isHovered ? 'primary.main' : 'text.secondary',
                                                transition: 'all 0.3s',
                                            }}
                                        >
                                            {action.icon}
                                        </Box>
                                    }
                                >
                                    <Typography
                                        variant="body1"
                                        fontWeight={isHovered ? 600 : 500}
                                        sx={{
                                            fontSize: { xs: '0.95rem', sm: '1rem' },
                                            transition: 'font-weight 0.3s',
                                        }}
                                    >
                                        {action.label}
                                    </Typography>
                                </Button>
                            </Grow>
                        );
                    })}
                </Box>
            </Paper>
        </Fade>
    );
}
