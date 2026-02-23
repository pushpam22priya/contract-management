'use client';

import { Button, Typography, Box, Tooltip } from '@mui/material';
import BaseDialog from '@/components/common/BaseDialog';

interface ConfirmationDialogProps {
    open: boolean;
    title: string;
    message: string;
    onYes: () => void;
    onNo: () => void;
    onClose?: () => void;
    loading?: boolean;
    disableYes?: boolean;
    yesTooltip?: string;
}

export default function ConfirmationDialog({
    open,
    title,
    message,
    onYes,
    onNo,
    onClose,
    loading = false,
    disableYes = false,
    yesTooltip = '',
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
                    <Tooltip title={disableYes ? yesTooltip : ''} arrow>
                        <span>
                            <Button variant="contained" onClick={onYes} disabled={loading || disableYes}>
                                {loading ? 'Saving...' : 'Yes'}
                            </Button>
                        </span>
                    </Tooltip>
                </Box>
            }
        >
            <Typography variant="body1" color="text.secondary">
                {message}
            </Typography>
        </BaseDialog>
    );
}
