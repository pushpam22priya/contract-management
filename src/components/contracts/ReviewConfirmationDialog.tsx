'use client';

import { Box, Button, Typography } from '@mui/material';
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

/**
 * Dialog asking reviewer what they want to do after reviewing
 * - Just mark as reviewed
 * - Mark as reviewed and send for further review
 */
export default function ReviewConfirmationDialog({
    open,
    onClose,
    contractTitle,
    onMarkAsReviewed,
    onMarkAndSendForFurtherReview,
}: ReviewConfirmationDialogProps) {
    const handleMarkAsReviewed = () => {
        onMarkAsReviewed();
        onClose();
    };

    const handleMarkAndSendForFurtherReview = () => {
        onMarkAndSendForFurtherReview();
        onClose();
    };

    const dialogActions = (
        <>
            <Button
                onClick={onClose}
                sx={{
                    textTransform: 'none',
                    color: 'text.secondary',
                }}
            >
                Cancel
            </Button>
        </>
    );

    return (
        <BaseDialog
            open={open}
            onClose={onClose}
            title="REVIEW CONFIRMATION"
            actions={dialogActions}
            maxWidth="sm"
        >
            <Box sx={{ py: 2 }}>
                {/* Contract Info */}
                <Box
                    sx={{
                        bgcolor: '#f8fafc',
                        p: 2,
                        borderRadius: 2,
                        border: '1px solid',
                        borderColor: 'rgba(0, 0, 0, 0.08)',
                        mb: 3,
                    }}
                >
                    <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 0.5 }}>
                        Contract
                    </Typography>
                    <Typography variant="body1" fontWeight={600}>
                        {contractTitle}
                    </Typography>
                </Box>

                <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
                    You're about to mark this contract as reviewed. What would you like to do?
                </Typography>

                {/* Options */}
                <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                    {/* Option 1: Just Mark as Reviewed */}
                    <Box
                        onClick={handleMarkAsReviewed}
                        sx={{
                            p: 2.5,
                            border: '2px solid',
                            borderColor: '#e0f2f1',
                            borderRadius: 2,
                            cursor: 'pointer',
                            transition: 'all 0.2s',
                            '&:hover': {
                                borderColor: '#00695c',
                                bgcolor: '#f0fdfa',
                                transform: 'translateY(-2px)',
                                boxShadow: '0 4px 12px rgba(0, 105, 92, 0.15)',
                            },
                        }}
                    >
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
                            <Box
                                sx={{
                                    width: 48,
                                    height: 48,
                                    borderRadius: '50%',
                                    bgcolor: '#e0f2f1',
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                }}
                            >
                                <CheckCircleOutlineIcon sx={{ color: '#00695c', fontSize: 28 }} />
                            </Box>
                            <Box sx={{ flex: 1 }}>
                                <Typography variant="subtitle1" fontWeight={600} sx={{ mb: 0.5 }}>
                                    Mark as Reviewed
                                </Typography>
                                <Typography variant="caption" color="text.secondary">
                                    Complete your review without additional actions
                                </Typography>
                            </Box>
                        </Box>
                    </Box>

                    {/* Option 2: Mark and Send for Further Review */}
                    <Box
                        onClick={handleMarkAndSendForFurtherReview}
                        sx={{
                            p: 2.5,
                            border: '2px solid',
                            borderColor: '#e3f2fd',
                            borderRadius: 2,
                            cursor: 'pointer',
                            transition: 'all 0.2s',
                            '&:hover': {
                                borderColor: '#1976d2',
                                bgcolor: '#e3f2fd',
                                transform: 'translateY(-2px)',
                                boxShadow: '0 4px 12px rgba(25, 118, 210, 0.15)',
                            },
                        }}
                    >
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
                            <Box
                                sx={{
                                    width: 48,
                                    height: 48,
                                    borderRadius: '50%',
                                    bgcolor: '#e3f2fd',
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                }}
                            >
                                <SendIcon sx={{ color: '#1976d2', fontSize: 28 }} />
                            </Box>
                            <Box sx={{ flex: 1 }}>
                                <Typography variant="subtitle1" fontWeight={600} sx={{ mb: 0.5 }}>
                                    Mark as Reviewed & Send for Further Review
                                </Typography>
                                <Typography variant="caption" color="text.secondary">
                                    Add additional reviewers before approval
                                </Typography>
                            </Box>
                        </Box>
                    </Box>
                </Box>
            </Box>
        </BaseDialog>
    );
}
