'use client';

import { Box, Typography, Paper, Button, IconButton, Chip, Grow, Tooltip } from '@mui/material';
import DescriptionOutlinedIcon from '@mui/icons-material/DescriptionOutlined';
import AddIcon from '@mui/icons-material/Add';
import VisibilityOutlinedIcon from '@mui/icons-material/VisibilityOutlined';
import ContentCopyOutlinedIcon from '@mui/icons-material/ContentCopyOutlined';
import EditOutlinedIcon from '@mui/icons-material/EditOutlined';
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline';
import { useState } from 'react';

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

    return (
        <Grow in timeout={600 + index * 100}>
            <Paper
                elevation={0}
                onMouseEnter={() => setIsHovered(true)}
                onMouseLeave={() => setIsHovered(false)}
                sx={{
                    p: 1.5,
                    borderRadius: 2.5,
                    border: '1px solid',
                    borderColor: isHovered ? 'primary.main' : 'rgba(0, 0, 0, 0.08)',
                    bgcolor: 'white',
                    height: '100%',
                    display: 'flex',
                    flexDirection: 'column',
                    position: 'relative',
                    overflow: 'hidden',
                    transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
                    cursor: 'pointer',
                    transform: isHovered ? 'translateY(-4px)' : 'translateY(0)',
                    boxShadow: isHovered
                        ? '0 12px 24px rgba(15, 118, 110, 0.15)'
                        : '0 2px 8px rgba(0, 0, 0, 0.04)',
                    '&:hover': {
                        '& .action-buttons': {
                            opacity: 1,
                            transform: 'translateY(0)',
                        },
                    },
                }}
            >
                {/* Header with Icon and Category */}
                <Box
                    sx={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'flex-start',
                        mb: 1.5,
                    }}
                >
                    <Box
                        sx={{
                            width: 40,
                            height: 40,
                            borderRadius: 1.5,
                            bgcolor: '#9cece64a',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            transition: 'all 0.3s',
                            transform: isHovered ? 'scale(1.1)' : 'scale(1)',
                        }}
                    >
                        <DescriptionOutlinedIcon
                            sx={{
                                fontSize: 20,
                                color: '#0f766e',
                            }}
                        />
                    </Box>

                    <Chip
                        label={category}
                        size="small"
                        sx={{
                            bgcolor: 'rgba(0, 0, 0, 0.04)',
                            color: 'text.secondary',
                            fontWeight: 500,
                            fontSize: '0.75rem',
                            height: 24,
                        }}
                    />
                </Box>

                {/* Title and Description */}
                <Box sx={{ flex: 1, mb: 1.5 }}>
                    <Typography
                        variant="h6"
                        fontWeight={600}
                        sx={{
                            color: 'text.primary',
                            mb: 0.75,
                            fontSize: '0.95rem',
                            lineHeight: 1.3,
                        }}
                    >
                        {title}
                    </Typography>
                    <Typography
                        variant="body2"
                        sx={{
                            color: 'text.secondary',
                            fontSize: '0.8rem',
                            lineHeight: 1.5,
                        }}
                    >
                        {description}
                    </Typography>
                </Box>

                {/* Metadata */}
                {/* <Box
                    sx={{
                        display: 'flex',
                        gap: 3,
                        mb: 2.5,
                        pb: 2.5,
                        justifyContent: 'space-between',
                        borderBottom: '1px solid',
                        borderColor: 'rgba(0, 0, 0, 0.06)',
                    }}
                >
                    <Box>
                        <Typography
                            variant="caption"
                            sx={{
                                color: 'text.secondary',
                                fontSize: '0.75rem',
                                display: 'block',
                                mb: 0.5,
                            }}
                        >
                            Times Used
                        </Typography>
                        <Typography
                            variant="body1"
                            fontWeight={700}
                            sx={{
                                color: 'text.primary',
                                fontSize: '0.95rem',
                            }}
                        >
                            {timesUsed}
                        </Typography>
                    </Box>
                    <Box>
                        <Typography
                            variant="caption"
                            sx={{
                                color: 'text.secondary',
                                fontSize: '0.75rem',
                                display: 'block',
                                mb: 0.5,
                            }}
                        >
                            Last Used
                        </Typography>
                        <Typography
                            variant="body1"
                            fontWeight={700}
                            sx={{
                                color: 'text.primary',
                                fontSize: '0.95rem',
                            }}
                        >
                            {lastUsed}
                        </Typography>
                    </Box>
                </Box> */}

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
                        p: 0.5,
                        background: 'linear-gradient(to top, rgba(255,255,255,0.98) 0%, rgba(255,255,255,0.95) 70%, rgba(255,255,255,0) 100%)',
                        backdropFilter: 'blur(8px)',
                        borderRadius: '0 0 12px 12px',
                        opacity: { xs: 1, md: 0 },
                        transform: { xs: 'translateY(0)', md: 'translateY(100%)' },
                        transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
                    }}
                >
                    {/* View Icon Button */}
                    <Tooltip title="View Template" arrow>
                        <IconButton
                            size="small"
                            onClick={() => onView?.(id)}
                            sx={{
                                bgcolor: 'transparent',
                                border: '1px solid',
                                borderColor: 'divider',
                                borderRadius: 1.5,
                                width: 36,
                                height: 36,
                                color: 'text.primary',
                                transition: 'all 0.2s ease',
                                '&:hover': {
                                    bgcolor: 'primary.main',
                                    borderColor: 'primary.main',
                                    color: 'white',
                                    transform: 'translateY(-2px)',
                                    boxShadow: '0 4px 8px rgba(15, 118, 110, 0.2)',
                                },
                            }}
                        >
                            <VisibilityOutlinedIcon sx={{ fontSize: '1.1rem' }} />
                        </IconButton>
                    </Tooltip>

                    {/* Edit Icon Button - Admin Only */}
                    {isAdmin && (
                        <Tooltip title="Edit Template" arrow>
                            <IconButton
                                size="small"
                                onClick={(e) => {
                                    e.stopPropagation();
                                    onEdit?.(id);
                                }}
                                sx={{
                                    bgcolor: 'transparent',
                                    border: '1px solid',
                                    borderColor: 'divider',
                                    borderRadius: 1.5,
                                    width: 36,
                                    height: 36,
                                    color: 'text.primary',
                                    transition: 'all 0.2s ease',
                                    '&:hover': {
                                        bgcolor: 'info.main',
                                        borderColor: 'info.main',
                                        color: 'white',
                                        transform: 'translateY(-2px)',
                                        boxShadow: '0 4px 8px rgba(2, 136, 209, 0.2)',
                                    },
                                }}
                            >
                                <EditOutlinedIcon sx={{ fontSize: '1.1rem' }} />
                            </IconButton>
                        </Tooltip>
                    )}

                    {/* Delete Icon Button - Admin Only */}
                    {isAdmin && (
                        <Tooltip title="Delete Template" arrow>
                            <IconButton
                                size="small"
                                onClick={(e) => {
                                    e.stopPropagation();
                                    onDelete?.(id);
                                }}
                                sx={{
                                    bgcolor: 'transparent',
                                    border: '1px solid',
                                    borderColor: 'divider',
                                    borderRadius: 1.5,
                                    width: 36,
                                    height: 36,
                                    color: 'text.primary',
                                    transition: 'all 0.2s ease',
                                    '&:hover': {
                                        bgcolor: 'error.main',
                                        borderColor: 'error.main',
                                        color: 'white',
                                        transform: 'translateY(-2px)',
                                        boxShadow: '0 4px 8px rgba(211, 47, 47, 0.2)',
                                    },
                                }}
                            >
                                <DeleteOutlineIcon sx={{ fontSize: '1.1rem' }} />
                            </IconButton>
                        </Tooltip>
                    )}
                </Box>
            </Paper>
        </Grow>
    );
}
