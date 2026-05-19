'use client';

import { Box, Typography, Paper, IconButton, Grow, Tooltip, useTheme } from '@mui/material';
import { alpha } from '@mui/material/styles';
import DescriptionOutlinedIcon from '@mui/icons-material/DescriptionOutlined';
import VisibilityOutlinedIcon from '@mui/icons-material/VisibilityOutlined';
import EditOutlinedIcon from '@mui/icons-material/EditOutlined';
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline';
import { useState } from 'react';
import { useTranslations } from 'next-intl';

interface TemplateCardProps {
    id: string;
    category: string;
    title: string;
    description: string;
    timesUsed: number;
    lastUsed: string;
    index?: number;
    isAdmin?: boolean;
    onUse?: () => void;
    onView?: (id: string) => void;
    onEdit?: (id: string) => void;
    onDelete?: (id: string) => void;
}

const truncateText = (text: string, limit: number) => {
    if (text.length <= limit) return text;
    return text.slice(0, limit) + '...';
};

export default function TemplateCard({
    id,
    category,
    title,
    description,
    timesUsed,
    lastUsed,
    index = 0,
    isAdmin = false,
    onUse,
    onView,
    onEdit,
    onDelete,
}: TemplateCardProps) {
    const [isHovered, setIsHovered] = useState(false);
    const theme = useTheme();
    const tTooltips = useTranslations('tooltips');
    const primaryColor = theme.palette.primary.main;
    const isDark = theme.palette.mode === 'dark';

    const iconBtnBorderColor = alpha(theme.palette.text.secondary, 0.35);
    const chipColor = isDark ? '#e5a07bff' : primaryColor;

    return (
        <Grow in timeout={600 + index * 100}>
            <Paper
                elevation={0}
                onMouseEnter={() => setIsHovered(true)}
                onMouseLeave={() => setIsHovered(false)}
                sx={{
                    p: 1,
                    borderRadius: 2.5,
                    border: '1px solid',
                    borderColor: isHovered ? 'primary.main' : 'divider',
                    bgcolor: 'background.paper',
                    height: '100%',
                    display: 'flex',
                    flexDirection: 'column',
                    position: 'relative',
                    overflow: 'hidden',
                    transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
                    cursor: 'pointer',
                    transform: isHovered ? 'translateY(-4px)' : 'translateY(0)',
                    boxShadow: isHovered
                        ? `0 12px 24px ${alpha(primaryColor, 0.15)}`
                        : '0 2px 8px rgba(0, 0, 0, 0.04)',
                    '&:hover': {
                        '& .action-buttons': {
                            opacity: 1,
                        },
                    },
                }}
            >
                {/* Row 1: Icon + Title */}
                <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 1, mb: 0.8 }}>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, }}>
                         <Box
                        sx={{
                            width: 28,
                            height: 28,
                            borderRadius: 1.5,
                            flexShrink: 0,
                            bgcolor: alpha(primaryColor, isDark ? 0.15 : 0.12),
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            transition: 'all 0.3s',
                            transform: isHovered ? 'scale(1.1)' : 'scale(1)',
                        }}
                    >
                        <DescriptionOutlinedIcon sx={{ fontSize: 16, color: primaryColor }} />
                    </Box>
                    <Tooltip title={title} arrow placement="top">
                        <Typography
                            variant="subtitle2"
                            sx={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
                        >
                            {truncateText(title, 22)}
                        </Typography>
                    </Tooltip>
                    </Box>
                   
                    
                    <Tooltip title={category} arrow placement="top">
                        <Box
                            component="span"
                            sx={{
                                display: 'inline-block',
                                px: 0.6,
                                py: 0.2,
                                borderRadius: '4px',
                                bgcolor: alpha(chipColor, isDark ? 0.12 : 0.07),
                                border: `1px solid ${alpha(chipColor, isDark ? 0.40 : 0.28)}`,
                                color: chipColor,
                                fontSize: '0.6rem',
                                fontWeight: 500,
                            }}
                        >
                            {truncateText(category, 18)}
                        </Box>
                    </Tooltip>
                
                </Box>

                {/* Row 2: Description */}
                <Box sx={{ flex: 1, mb: 0.5 }}>
                    <Tooltip title={description} arrow placement="top">
                        <Typography
                            variant="body2"
                            sx={{
                                color: 'text.secondary',
                            }}
                        >
                            {truncateText(description, 60)}
                        </Typography>
                    </Tooltip>
                </Box>

                {/* Action Buttons */}
                <Box
                    className="action-buttons"
                    sx={{
                        position: 'absolute',
                        bottom: 0,
                        left: 0,
                        right: 0,
                        display: 'flex',
                        gap: 1,
                        p: '4px 8px',
                        background: theme.card.actionOverlay,
                        borderRadius: '0 0 12px 12px',
                        opacity: { xs: 1, md: 0 },
                        transition: 'opacity 0.2s ease-in-out',
                    }}
                >
                    {[
                        {
                            title: tTooltips('viewTemplate'),
                            icon: <VisibilityOutlinedIcon sx={{ fontSize: '0.8rem' }} />,
                            onClick: () => onView?.(id),
                            color: primaryColor,
                            shadow: alpha(primaryColor, 0.2),
                            show: true
                        },
                        {
                            title: tTooltips('editTemplate'),
                            icon: <EditOutlinedIcon sx={{ fontSize: '0.8rem' }} />,
                            onClick: (e: React.MouseEvent) => {
                                e.stopPropagation();
                                onEdit?.(id);
                            },
                            color: primaryColor,
                            shadow: alpha(primaryColor, 0.2),
                            show: isAdmin
                        },
                        {
                            title: tTooltips('deleteTemplate'),
                            icon: <DeleteOutlineIcon sx={{ fontSize: '0.8rem' }} />,
                            onClick: (e: React.MouseEvent) => {
                                e.stopPropagation();
                                onDelete?.(id);
                            },
                            color: isDark ? '#a95151ff' : '#d32f2f',
                            shadow: isDark ? 'rgba(239,68,68,0.2)' : 'rgba(211,47,47,0.2)',
                            show: isAdmin
                        }
                    ].map((action, idx) => (
                        action.show && (
                            <Tooltip key={idx} title={action.title} arrow>
                                <IconButton
                                    size="small"
                                    onClick={action.onClick}
                                    sx={{
                                        bgcolor: 'transparent',
                                        border: '1px solid',
                                        borderColor: iconBtnBorderColor,
                                        borderRadius: 1.5,
                                        color: 'text.secondary',
                                        transition: 'all 0.2s ease',
                                        '&:hover': {
                                            bgcolor: action.color,
                                            borderColor: action.color,
                                            color: 'white',
                                            transform: 'translateY(-2px)',
                                            boxShadow: `0 4px 8px ${action.shadow}`,
                                        },
                                    }}
                                >
                                    {action.icon}
                                </IconButton>
                            </Tooltip>
                        )
                    ))}
                </Box>
            </Paper>
        </Grow>
    );
}