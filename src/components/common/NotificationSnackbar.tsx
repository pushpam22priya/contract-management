'use client';

import { Snackbar, Alert, AlertColor, Typography, useTheme } from '@mui/material';

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

    const darkSolidBg: Record<AlertColor, string> = {
        success: '#166534',
        error:   '#991b1b',
        warning: '#92400e',
        info:    '#1e3a8a',
    };

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
                        ? '0 4px 16px rgba(0,0,0,0.50)'
                        : '0 4px 12px rgba(0,0,0,0.15)',
                    ...(isDark && {
                        bgcolor: darkSolidBg[severity],
                        color: '#fff',
                        '& .MuiAlert-icon': { color: '#fff' },
                        '& .MuiAlert-action .MuiIconButton-root': { color: '#fff' },
                    }),
                }}
            >
                <Typography variant="body2" color="inherit">{message}</Typography>
            </Alert>
        </Snackbar>
    );
}