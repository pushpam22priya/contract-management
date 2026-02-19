'use client';

import { Button, Typography, Box } from '@mui/material';
import BaseDialog from '@/components/common/BaseDialog';

interface ConfirmationDialogProps {
    open: boolean;
    title: string;
    message: string;
    onYes: () => void;
    onNo: () => void;
    onClose?: () => void;
    loading?: boolean;
}

export default function ConfirmationDialog({
    open,
    title,
    message,
    onYes,
    onNo,
    onClose,
    loading = false,
}: ConfirmationDialogProps) {
    return (
        <BaseDialog
            open={open}
            onClose={onClose || onNo}
            title={title}
            maxWidth="xs"
            actions={
                <Box sx={{ display: 'flex', gap: 1 }}>
                    <Button onClick={onNo} disabled={loading}>
                        No
                    </Button>
                    <Button variant="contained" onClick={onYes} disabled={loading}>
                        {loading ? 'Saving...' : 'Yes'}
                    </Button>
                </Box>
            }
        >
            <Typography variant="body1" color="text.secondary">
                {message}
            </Typography>
        </BaseDialog>
    );
}
