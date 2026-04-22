'use client';

import { Snackbar, Alert, AlertColor, useTheme } from '@mui/material';

interface NotificationSnackbarProps {
    open: boolean;
    message: string;
    severity: AlertColor;
    onClose: () => void;
    autoHideDuration?: number;
}

export default function NotificationSnackbar({
    open,
    message,
    severity,
    onClose,
    autoHideDuration = 4000,
}: NotificationSnackbarProps) {
    const theme = useTheme();
    const isDark = theme.palette.mode === 'dark';

    return (
        <Snackbar
            open={open}
            autoHideDuration={autoHideDuration}
            onClose={onClose}
            anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
        >
            <Alert
                onClose={onClose}
                severity={severity}
                variant="filled"
                sx={{
                    width: '100%',
                    boxShadow: isDark
                        ? '0 4px 16px rgba(0,0,0,0.40)'
                        : '0 4px 12px rgba(0,0,0,0.15)',
                }}
            >
                {message}
            </Alert>
        </Snackbar>
    );
}