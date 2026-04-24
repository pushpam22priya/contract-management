'use client';

import React from 'react';
import { Box, Button, Typography, useTheme } from '@mui/material';
import { alpha } from '@mui/material/styles';
import type { SxProps, Theme } from '@mui/material';

interface EmptyStateAction {
    label: string;
    onClick: () => void;
    startIcon?: React.ReactNode;
    variant?: 'contained' | 'outlined';
}

interface EmptyStateProps {
    icon?: React.ReactNode;
    title: string;
    description?: string;
    action?: EmptyStateAction;
    compact?: boolean;
    sx?: SxProps<Theme>;
}

export default function EmptyState({
    icon,
    title,
    description,
    action,
    compact = false,
    sx,
}: EmptyStateProps) {
    const theme = useTheme();
    const isDark = theme.palette.mode === 'dark';
    const primaryColor = theme.palette.primary.main;

    const styledIcon =
        icon && React.isValidElement(icon)
            ? React.cloneElement(icon as React.ReactElement<{ sx?: SxProps<Theme> }>, {
                  sx: {
                      fontSize: compact ? 26 : 34,
                      color: primaryColor,
                      opacity: 0.85,
                  },
              })
            : icon;

    return (
        <Box
            sx={{
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                textAlign: 'center',
                py: compact ? 3 : 6,
                px: 2,
                width: '100%',
                ...sx,
            }}
        >
            {icon && (
                <Box
                    sx={{
                        width: compact ? 52 : 70,
                        height: compact ? 52 : 70,
                        borderRadius: '50%',
                        bgcolor: alpha(primaryColor, isDark ? 0.12 : 0.08),
                        border: '1.5px dashed',
                        borderColor: alpha(primaryColor, isDark ? 0.38 : 0.30),
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        mb: compact ? 1.5 : 2,
                        transition: 'all 0.2s',
                    }}
                >
                    {styledIcon}
                </Box>
            )}

            <Typography
                variant="subtitle2"
                sx={{ mb: description ? 0.5 : action ? 1.5 : 0 }}
            >
                {title}
            </Typography>

            {description && (
                <Typography
                    variant="body2"
                    color="text.secondary"
                    sx={{
                        maxWidth: 300,
                        mx: 'auto',
                        lineHeight: 1.55,
                        mb: action ? 2 : 0,
                    }}
                >
                    {description}
                </Typography>
            )}

            {action && (
                <Button
                    variant={action.variant ?? 'outlined'}
                    size="small"
                    startIcon={action.startIcon}
                    onClick={action.onClick}
                    sx={{
                        textTransform: 'none',
                        borderRadius: 2,
                        px: 2.5,
                        mt: !description ? 0 : undefined,
                        ...(action.variant === 'contained' && {
                            boxShadow: `0 2px 8px ${alpha(primaryColor, 0.30)}`,
                        }),
                    }}
                >
                    {action.label}
                </Button>
            )}
        </Box>
    );
}