'use client';

import { useState } from 'react';
import {
    Box,
    Typography,
    Button,
    Alert,
    CircularProgress,
    alpha,
} from '@mui/material';
import BlockOutlinedIcon from '@mui/icons-material/BlockOutlined';
import WarningAmberRoundedIcon from '@mui/icons-material/WarningAmberRounded';
import BaseDialog from '@/components/common/BaseDialog';
import { authService } from '@/services/authService';

interface TerminateContractDialogProps {
    open: boolean;
    onClose: () => void;
    contractId: string;
    contractTitle: string;  // clean base title (no Renewal suffix)
    onSuccess: () => void;
}

export default function TerminateContractDialog({
    open,
    onClose,
    contractId,
    contractTitle,
    onSuccess,
}: TerminateContractDialogProps) {
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const handleClose = () => {
        if (loading) return;
        setError(null);
        onClose();
    };

    const handleTerminate = async () => {
        setLoading(true);
        setError(null);

        try {
            const currentUser = authService.getCurrentUser();
            const terminatedBy = currentUser?.email || 'unknown';

            const res = await fetch(`/api/contracts/${contractId}/terminate`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ terminatedBy }),
            });

            const data = await res.json();

            if (!res.ok) {
                setError(data.error || 'Failed to terminate contract. Please try again.');
                return;
            }

            // Success
            onSuccess();
            handleClose();
        } catch {
            setError('An unexpected error occurred. Please try again.');
        } finally {
            setLoading(false);
        }
    };

    return (
        <BaseDialog
            open={open}
            onClose={handleClose}
            title="Terminate Contract"
            maxWidth="xs"
            disableBackdropClick={loading}
            actions={
                <Box sx={{ display: 'flex', gap: 1, width: '100%', justifyContent: 'flex-end', px: 0.5 }}>
                    <Button
                        variant="outlined"
                        onClick={handleClose}
                        disabled={loading}
                        sx={{
                            borderColor: 'divider',
                            color: 'text.secondary',
                            '&:hover': { borderColor: 'text.secondary', bgcolor: 'transparent' },
                        }}
                    >
                        Cancel
                    </Button>
                    <Button
                        variant="contained"
                        onClick={handleTerminate}
                        disabled={loading}
                        startIcon={
                            loading
                                ? <CircularProgress size={16} sx={{ color: 'white' }} />
                                : <BlockOutlinedIcon sx={{ fontSize: '1rem !important' }} />
                        }
                        sx={{
                            bgcolor: '#dc2626',
                            color: 'white',
                            '&:hover': { bgcolor: '#b91c1c' },
                            '&:disabled': { bgcolor: '#fca5a5', color: 'white' },
                            minWidth: 130,
                        }}
                    >
                        {loading ? 'Terminating…' : 'Terminate'}
                    </Button>
                </Box>
            }
        >
            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                {/* Icon + intro */}
                <Box sx={{ display: 'flex', alignItems: 'flex-start', gap: 1.5 }}>
                    <Box
                        sx={{
                            width: 44,
                            height: 44,
                            borderRadius: 2,
                            bgcolor: alpha('#dc2626', 0.1),
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            flexShrink: 0,
                        }}
                    >
                        <BlockOutlinedIcon sx={{ fontSize: 22, color: '#dc2626' }} />
                    </Box>
                    <Box>
                        <Typography fontSize="0.9rem" color="text.secondary" sx={{ lineHeight: 1.5 }}>
                            You are about to permanently terminate:
                        </Typography>
                        <Typography
                            fontWeight={700}
                            fontSize="0.95rem"
                            color="text.primary"
                            sx={{
                                mt: 0.25,
                                wordBreak: 'break-word',
                                display: '-webkit-box',
                                WebkitLineClamp: 2,
                                WebkitBoxOrient: 'vertical',
                                overflow: 'hidden',
                            }}
                        >
                            "{contractTitle}"
                        </Typography>
                    </Box>
                </Box>

                {/* Warning box */}
                <Box
                    sx={{
                        display: 'flex',
                        alignItems: 'flex-start',
                        gap: 1,
                        p: 1.5,
                        bgcolor: '#fef2f2',
                        border: '1px solid #fecaca',
                        borderRadius: 2,
                    }}
                >
                    <WarningAmberRoundedIcon sx={{ fontSize: 18, color: '#dc2626', flexShrink: 0, mt: '1px' }} />
                    <Box>
                        <Typography fontSize="0.82rem" fontWeight={600} color="#991b1b" sx={{ mb: 0.25 }}>
                            This action cannot be undone.
                        </Typography>
                        <Typography fontSize="0.8rem" color="#7f1d1d" sx={{ lineHeight: 1.5 }}>
                            The contract will be permanently archived as terminated and cannot be renewed, edited, or sent for signature.
                        </Typography>
                    </Box>
                </Box>

                {/* API error */}
                {error && (
                    <Alert severity="error" sx={{ fontSize: '0.82rem', py: 0.5 }}>
                        {error}
                    </Alert>
                )}
            </Box>
        </BaseDialog>
    );
}
