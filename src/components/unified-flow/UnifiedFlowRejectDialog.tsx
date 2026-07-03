'use client';

import { useState } from 'react';
import { Box, TextField, Typography, Alert } from '@mui/material';
import { CancelOutlined } from '@mui/icons-material';
import BaseDialog from '@/components/common/BaseDialog';
import AppButton from '@/components/common/AppButton';
import { unifiedFlowService } from '@/services/unifiedFlowService';

interface UnifiedFlowRejectDialogProps {
    open: boolean;
    onClose: () => void;
    onRejected: () => void;
    contractId: string;
    contractTitle?: string;
    role: 'REVIEWER' | 'APPROVER';
}

const MIN_CHARS = 10;

export default function UnifiedFlowRejectDialog({
    open,
    onClose,
    onRejected,
    contractId,
    contractTitle,
    role,
}: UnifiedFlowRejectDialogProps) {
    const [reason, setReason] = useState('');
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const isValid = reason.trim().length >= MIN_CHARS;

    const handleReject = async () => {
        if (!isValid) return;
        setLoading(true);
        setError(null);
        const res = await unifiedFlowService.rejectFlow(contractId, reason.trim());
        setLoading(false);
        if (res.ok) {
            handleClose();
            onRejected();
        } else {
            setError(res.message || 'Failed to reject. Please try again.');
        }
    };

    const handleClose = () => {
        if (loading) return;
        setReason('');
        setError(null);
        onClose();
    };

    return (
        <BaseDialog
            open={open}
            onClose={handleClose}
            title={role === 'REVIEWER' ? 'Reject Contract (Reviewer)' : 'Reject Contract (Approver)'}
            maxWidth="sm"
            disableBackdropClick={loading}
            actions={
                <>
                    <AppButton variant="outlined" onClick={handleClose} disabled={loading}>
                        Cancel
                    </AppButton>
                    <AppButton
                        variant="contained"
                        color="error"
                        loading={loading}
                        disabled={!isValid}
                        startIcon={<CancelOutlined />}
                        onClick={handleReject}
                    >
                        {loading ? 'Rejecting…' : 'Reject Contract'}
                    </AppButton>
                </>
            }
        >
            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                {contractTitle && (
                    <Typography variant="body2" color="text.secondary">
                        Contract: <strong>{contractTitle}</strong>
                    </Typography>
                )}

                <Alert severity="warning" sx={{ borderRadius: 2 }}>
                    This will reject the contract and notify the owner.
                    {role === 'REVIEWER'
                        ? ' All participants will be reset and the owner must resubmit.'
                        : ' Reviewers will be preserved — only approvers need to be reassigned.'}
                </Alert>

                {error && (
                    <Alert severity="error" onClose={() => setError(null)} sx={{ borderRadius: 2 }}>
                        {error}
                    </Alert>
                )}

                <Box>
                    <Typography variant="subtitle2" fontWeight={600} gutterBottom>
                        Rejection Reason <span style={{ color: '#ef4444' }}>*</span>
                    </Typography>
                    <TextField
                        multiline
                        rows={4}
                        fullWidth
                        placeholder="Describe what needs to be changed or why you are rejecting this contract…"
                        value={reason}
                        onChange={(e) => setReason(e.target.value)}
                        disabled={loading}
                        autoFocus
                        inputProps={{ maxLength: 1000 }}
                        sx={{ '& .MuiOutlinedInput-root': { bgcolor: 'background.paper' } }}
                    />
                    <Box sx={{ display: 'flex', justifyContent: 'space-between', mt: 0.5 }}>
                        <Typography
                            variant="caption"
                            color={isValid ? 'text.secondary' : 'error'}
                        >
                            {!isValid && reason.length > 0
                                ? `Minimum ${MIN_CHARS} characters required`
                                : ' '}
                        </Typography>
                        <Typography variant="caption" color="text.secondary">
                            {reason.length} / 1000
                        </Typography>
                    </Box>
                </Box>
            </Box>
        </BaseDialog>
    );
}
