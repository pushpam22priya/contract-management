'use client';

import { Typography, Box, Tooltip } from '@mui/material';
import BaseDialog from '@/components/common/BaseDialog';
import AppButton from '@/components/common/AppButton';

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
                    <AppButton variant="outlined" onClick={onNo} disabled={loading}>
                        No
                    </AppButton>
                    <Tooltip title={disableYes ? yesTooltip : ''} arrow>
                        <span>
                            <AppButton variant="contained" loading={loading} onClick={onYes} disabled={disableYes}>
                                {loading ? 'Saving...' : 'Yes'}
                            </AppButton>
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
