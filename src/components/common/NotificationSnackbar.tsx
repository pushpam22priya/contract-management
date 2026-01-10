import { Snackbar, Alert, AlertColor } from '@mui/material';

interface NotificationSnackbarProps {
    open: boolean;
    message: string;
    severity: AlertColor;
    onClose: () => void;
    autoHideDuration?: number;
}

/**
 * Reusable Snackbar component for notifications
 * Replaces alert() calls with modern Material-UI notifications
 */
export default function NotificationSnackbar({
    open,
    message,
    severity,
    onClose,
    autoHideDuration = 4000,
}: NotificationSnackbarProps) {
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
                    boxShadow: '0 4px 12px rgba(0, 0, 0, 0.15)',
                }}
            >
                {message}
            </Alert>
        </Snackbar>
    );
}
