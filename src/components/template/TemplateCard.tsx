'use client';

import { Box, Typography, Paper, Button, IconButton, Chip, Grow } from '@mui/material';
import DescriptionOutlinedIcon from '@mui/icons-material/DescriptionOutlined';
import AddIcon from '@mui/icons-material/Add';
import VisibilityOutlinedIcon from '@mui/icons-material/VisibilityOutlined';
import ContentCopyOutlinedIcon from '@mui/icons-material/ContentCopyOutlined';
import { useState } from 'react';

interface TemplateCardProps {
    category: string;
    title: string;
    description: string;
    timesUsed: number;
    lastUsed: string;
    index?: number;
    onUse?: () => void;
}

export default function TemplateCard({
    category,
    title,
    description,
    timesUsed,
    lastUsed,
    index = 0,
    onUse,
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
                    transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
                    cursor: 'pointer',
                    transform: isHovered ? 'translateY(-4px)' : 'translateY(0)',
                    boxShadow: isHovered
                        ? '0 12px 24px rgba(15, 118, 110, 0.15)'
                        : '0 2px 8px rgba(0, 0, 0, 0.04)',
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
                <Box sx={{ display: 'flex', gap: 1, alignItems: 'center' }}>
                    <Button
                        variant="contained"
                        startIcon={<AddIcon />}
                        fullWidth
                        onClick={onUse}
                        sx={{
                            textTransform: 'none',
                            fontWeight: 600,
                            py: 0.75,
                            borderRadius: 1.5,
                            bgcolor: 'primary.main',
                            fontSize: '0.875rem',
                            transition: 'all 0.3s',
                            '&:hover': {
                                bgcolor: 'primary.dark',
                                transform: 'translateY(-2px)',
                                boxShadow: '0 6px 16px rgba(26, 46, 35, 0.4)',
                            },
                        }}
                    >
                        Use
                    </Button>

                    <IconButton
                        sx={{
                            borderRadius: 2,
                            border: '1px solid',
                            borderColor: 'rgba(0, 0, 0, 0.12)',
                            transition: 'all 0.3s',
                            '&:hover': {
                                borderColor: 'primary.main',
                                bgcolor: 'rgba(15, 118, 110, 0.04)',
                            },
                        }}
                    >
                        <VisibilityOutlinedIcon sx={{ fontSize: 20 }} />
                    </IconButton>

                    {/* <IconButton
                        sx={{
                            borderRadius: 2,
                            border: '1px solid',
                            borderColor: 'rgba(0, 0, 0, 0.12)',
                            transition: 'all 0.3s',
                            '&:hover': {
                                borderColor: 'primary.main',
                                bgcolor: 'rgba(15, 118, 110, 0.04)',
                            },
                        }}
                    >
                        <ContentCopyOutlinedIcon sx={{ fontSize: 20 }} />
                    </IconButton> */}
                </Box>
            </Paper>
        </Grow>
    );
}
