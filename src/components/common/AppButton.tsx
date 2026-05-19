'use client';

import React from 'react';
import { Button, ButtonProps, CircularProgress } from '@mui/material';

export interface AppButtonProps extends ButtonProps {
    /**
     * When true, disables the button and replaces startIcon with a spinner.
     * Replaces the common manual pattern:
     *   startIcon={loading ? <CircularProgress size={16} color="inherit" /> : <Icon />}
     */
    loading?: boolean;
}

/**
 * Centralised button component for the app.
 * All visual defaults (size, padding, font, radius, shadow) live in the
 * MuiButton theme override in src/theme/theme.ts — change once, affects all.
 *
 * Special-case colours / sx can still be passed as props and will override.
 * Example:
 *   <AppButton>Save</AppButton>
 *   <AppButton variant="outlined" color="error">Delete</AppButton>
 *   <AppButton loading={saving} startIcon={<SaveIcon />}>Save</AppButton>
 *   <AppButton sx={{ bgcolor: '#115e59' }}>Custom colour</AppButton>
 */
const AppButton = React.forwardRef<HTMLButtonElement, AppButtonProps>(
    (
        {
            loading = false,
            disabled,
            startIcon,
            endIcon,
            variant = 'contained',
            size = 'medium',
            children,
            ...rest
        },
        ref,
    ) => (
        <Button
            ref={ref}
            variant={variant}
            size={size}
            disabled={disabled || loading}
            startIcon={loading ? <CircularProgress size={15} color="inherit" /> : startIcon}
            endIcon={loading ? undefined : endIcon}
            {...rest}
        >
            {children}
        </Button>
    ),
);

AppButton.displayName = 'AppButton';

export default AppButton;