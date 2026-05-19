'use client';

import AppButton from '@/components/common/AppButton';
import { Box,  Typography, useTheme } from '@mui/material';
import { alpha } from '@mui/material/styles';
import CheckCircleOutlineIcon from '@mui/icons-material/CheckCircleOutline';
import SendIcon from '@mui/icons-material/Send';
import BaseDialog from '@/components/common/BaseDialog';

interface ReviewConfirmationDialogProps {
    open: boolean;
    onClose: () => void;
    contractTitle: string;
    onMarkAsReviewed: () => void;
    onMarkAndSendForFurtherReview: () => void;
}

export default function ReviewConfirmationDialog({
    open,
    onClose,
    contractTitle,
    onMarkAsReviewed,
    onMarkAndSendForFurtherReview,
}: ReviewConfirmationDialogProps) {
    const theme = useTheme();
    const isDark = theme.palette.mode === 'dark';

    const handleMarkAsReviewed = () => { onMarkAsReviewed(); onClose(); };
    const handleMarkAndSendForFurtherReview = () => { onMarkAndSendForFurtherReview(); onClose(); };

    const dialogActions = (
        <AppButton variant="outlined" onClick={onClose}>
            Cancel
        </AppButton>
    );

    const optionSx = (color: string) => ({
        p: 1.5,
        border: '1px solid',
        borderColor: isDark ? alpha(color, 0.25) : alpha(color, 0.35),
        borderRadius: 2,
        cursor: 'pointer',
        transition: 'all 0.2s',
        '&:hover': {
            borderColor: color,
            bgcolor: alpha(color, isDark ? 0.10 : 0.06),
            transform: 'translateY(-1px)',
            boxShadow: `0 4px 12px ${alpha(color, 0.18)}`,
        },
    });

    const iconSx = (color: string) => ({
        width: 40,
        height: 40,
        borderRadius: '50%',
        bgcolor: alpha(color, isDark ? 0.15 : 0.10),
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        flexShrink: 0,
    });

    const primaryColor = theme.palette.primary.main;
    const infoColor = theme.palette.info?.main ?? '#1976d2';

    return (
        <BaseDialog open={open} onClose={onClose} title="REVIEW CONFIRMATION" actions={dialogActions} maxWidth="sm">
            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
                {/* Contract Info */}
                <Box
                    sx={{
                        bgcolor: isDark ? alpha('#ffffff', 0.05) : '#f8fafc',
                        p: 1,
                        borderRadius: 2,
                        border: '1px solid',
                        borderColor: 'divider',
                    }}
                >
                    <Typography variant="caption" sx={{ display: 'block', mb: 0.25 }}>
                        Contract
                    </Typography>
                    <Typography variant="subtitle2">
                        {contractTitle}
                    </Typography>
                </Box>

                {/* Option 1 */}
                <Box onClick={handleMarkAsReviewed} sx={optionSx(primaryColor)}>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
                        <Box sx={iconSx(primaryColor)}>
                            <CheckCircleOutlineIcon sx={{ color: primaryColor, fontSize: 22 }} />
                        </Box>
                        <Box>
                            <Typography variant="subtitle2" sx={{ mb: 0.25 }}>
                                Mark as Reviewed
                            </Typography>
                            <Typography variant="body2">
                                Complete your review without additional actions
                            </Typography>
                        </Box>
                    </Box>
                </Box>

                {/* Option 2 */}
                <Box onClick={handleMarkAndSendForFurtherReview} sx={optionSx(infoColor)}>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
                        <Box sx={iconSx(infoColor)}>
                            <SendIcon sx={{ color: infoColor, fontSize: 20 }} />
                        </Box>
                        <Box>
                            <Typography variant="subtitle2" sx={{ mb: 0.25 }}>
                                Mark as Reviewed & Send for Further Review
                            </Typography>
                            <Typography variant="body2">
                                Add additional reviewers before approval
                            </Typography>
                        </Box>
                    </Box>
                </Box>
            </Box>
        </BaseDialog>
    );
}