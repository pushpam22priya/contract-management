'use client';

import { useState } from 'react';
import { Box, Typography, Button, Alert } from '@mui/material';
import WarningAmberRoundedIcon from '@mui/icons-material/WarningAmberRounded';
import BaseDialog from '@/components/common/BaseDialog';

interface DeleteContractDialogProps {
    open: boolean;
    onClose: () => void;
    contractId: string;
    contractTitle: string;
    onSuccess: () => void;
}

export default function DeleteContractDialog({
    open,
    onClose,
    contractId,
    contractTitle,
    onSuccess,
}: DeleteContractDialogProps) {
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const handleClose = () => {
        if (loading) return;
        setError(null);
        onClose();
    };

    const handleDelete = async () => {
        setLoading(true);
        setError(null);

        try {
            const res = await fetch(`/api/contracts/${contractId}`, { method: 'DELETE' });
            const data = await res.json();

            if (!res.ok) {
                setError(data.error || 'Failed to delete contract. Please try again.');
                return;
            }

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
            title="Delete Contract"
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
                        onClick={handleDelete}
                        disabled={loading}
                        sx={{
                            bgcolor: '#dc2626',
                            color: 'white',
                            '&:hover': { bgcolor: '#b91c1c' },
                            '&:disabled': { bgcolor: '#fca5a5', color: 'white' },
                        }}
                    >
                        {loading ? 'Deleting…' : 'Delete Permanently'}
                    </Button>
                </Box>
            }
        >
            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
                {/* Contract name */}
                <Box sx={{ display: 'flex', flexDirection: 'row', gap: 1}}>
                    <Typography fontSize="0.9rem"  color="text.secondary">
                        You are about to permanently delete:
                    </Typography>
                    <Typography
                        fontWeight={700}
                        fontSize="0.95rem"
                        color="text.primary"
                        sx={{
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

                {/* Warning */}
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
                            The contract and all its data will be permanently removed.
                        </Typography>
                    </Box>
                </Box>

                {error && (
                    <Alert severity="error" sx={{ fontSize: '0.82rem', py: 0.5 }}>
                        {error}
                    </Alert>
                )}
            </Box>
        </BaseDialog>
    );
}
