'use client';

import AppButton from '@/components/common/AppButton';
import { useState, useEffect } from 'react';
import {
    Box,
    Typography,
    Chip,
    Alert,
    Autocomplete,
    TextField,
    useTheme,
} from '@mui/material';
import CloseIcon from '@mui/icons-material/Close';
import BaseDialog from '@/components/common/BaseDialog';
import { userService, User } from '@/services/userService';

interface FurtherReviewDialogProps {
    open: boolean;
    onClose: () => void;
    contractId: string;
    contractTitle: string;
    existingReviewers: string[]; // emails
    existingApprover: string | null; // email
    contractInitiator: string; // email
    onSubmit: (additionalReviewers: string[], message?: string) => Promise<void>;
    initialMessage?: string;
}

/**
 * Dialog for selecting additional reviewers for further review
 * Excludes: existing reviewers, approver, and contract initiator
 */
export default function FurtherReviewDialog({
    open,
    onClose,
    contractId,
    contractTitle,
    existingReviewers,
    existingApprover,
    contractInitiator,
    onSubmit,
    initialMessage,
}: FurtherReviewDialogProps) {
    const [users, setUsers] = useState<User[]>([]);
    const [loadingUsers, setLoadingUsers] = useState(false);
    const [selectedReviewers, setSelectedReviewers] = useState<User[]>([]);
    const [error, setError] = useState('');
    const [submitting, setSubmitting] = useState(false);
    const [message, setMessage] = useState(initialMessage || '');
    const theme = useTheme();
    const isDark = theme.palette.mode === 'dark';

    /**
     * Load users on mount
     */
    useEffect(() => {
        if (open) {
            loadUsers();
        }
    }, [open]);

    /**
     * Load all users and filter out excluded users
     */
    const loadUsers = async () => {
        setLoadingUsers(true);
        try {
            const allUsers = await userService.getAllUsers();
            setUsers(allUsers);
        } catch (err) {
            console.error('Failed to load users:', err);
            setError('Failed to load users. Please try again.');
        } finally {
            setLoadingUsers(false);
        }
    };

    /**
     * Get available users (exclude existing reviewers, approver, and initiator)
     */
    const getAvailableUsers = (): User[] => {
        const excludedEmails = [
            ...existingReviewers,
            existingApprover,
            contractInitiator,
        ].filter(Boolean); // Remove null/undefined

        return users.filter(user => !excludedEmails.includes(user.email));
    };

    /**
     * Get excluded user names for display
     */
    const getExcludedUserSummary = (): string => {
        const excludedCount = users.length - getAvailableUsers().length;
        return `${excludedCount} user${excludedCount !== 1 ? 's' : ''} excluded (existing reviewers, approver, and initiator)`;
    };

    /**
     * Handle submit
     */
    const handleSubmit = async () => {
        setError('');

        if (selectedReviewers.length === 0) {
            setError('Please select at least one additional reviewer');
            return;
        }

        setSubmitting(true);

        try {
            const reviewerEmails = selectedReviewers.map(r => r.email);
            await onSubmit(reviewerEmails, message.trim() || undefined);
            handleClose();
        } catch (err) {
            setError('Failed to submit for further review. Please try again.');
        } finally {
            setSubmitting(false);
        }
    };

    /**
     * Reset and close dialog
     */
    const handleClose = () => {
        setSelectedReviewers([]);
        setError('');
        setSubmitting(false);
        onClose();
    };

    const dialogActions = (
        <>
            <AppButton
                variant="outlined"
                onClick={handleClose}
                disabled={submitting}
            >
                Cancel
            </AppButton>
            <AppButton
                onClick={handleSubmit}
                variant="contained"
                loading={submitting}
                disabled={selectedReviewers.length === 0}
                sx={{
                    fontWeight: 600,
                    px: 3,
                    bgcolor: 'primary.main',
                    boxShadow: (theme) => `0 2px 8px ${theme.palette.primary.main}40`,
                    '&:hover': {
                        bgcolor: 'primary.dark',
                        boxShadow: (theme) => `0 4px 12px ${theme.palette.primary.main}59`,
                    },
                }}
            >
                {submitting ? 'Submitting...' : 'Submit for Further Review'}
            </AppButton>
        </>
    );

    return (
        <BaseDialog
            open={open}
            onClose={handleClose}
            title="Forward for Further Review"
            actions={dialogActions}
            maxWidth="sm"
        >
            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5, pt: 0.5, pb: 1 }}>
                {/* Contract Info — compact inline row */}
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, px: 1.5, py: 1, bgcolor: 'action.hover', borderRadius: 1.5, border: '1px solid', borderColor: 'divider' }}>
                    <Typography variant="caption" color="text.secondary" sx={{ flexShrink: 0 }}>Contract:</Typography>
                    <Typography variant="body2" fontWeight={600} noWrap>{contractTitle}</Typography>
                </Box>

                {/* Error Message */}
                {error && (
                    <Alert severity="error" onClose={() => setError('')} sx={{ py: 0.25 }}>
                        {error}
                    </Alert>
                )}

                {/* Additional Reviewers Selection */}
                <Box>
                    <Typography variant="subtitle2" fontWeight={600} sx={{ mb: 0.75 }}>
                        Additional Reviewers <span style={{ color: '#d32f2f' }}>*</span>
                    </Typography>

                    <Autocomplete
                        multiple
                        options={getAvailableUsers()}
                        getOptionLabel={(option) => `${option.name} (${option.email})`}
                        value={selectedReviewers}
                        onChange={(_, newValue) => {
                            setError('');
                            setSelectedReviewers(newValue);
                        }}
                        loading={loadingUsers}
                        renderInput={(params) => (
                            <TextField
                                {...params}
                                placeholder="Search and select reviewers..."
                                size="small"
                            />
                        )}
                        renderTags={(value, getTagProps) =>
                            value.map((option, index) => (
                                <Chip
                                    {...getTagProps({ index })}
                                    key={option.id}
                                    label={option.email}
                                    size="small"
                                    deleteIcon={<CloseIcon sx={{ fontSize: '0.9rem !important' }} />}
                                    sx={{
                                        height: 24,
                                        fontSize: '0.75rem',
                                        bgcolor: '#e3f2fd',
                                        color: '#1565c0',
                                        '& .MuiChip-deleteIcon': { color: '#1565c0', '&:hover': { color: '#0d47a1' } },
                                    }}
                                />
                            ))
                        }
                    />

                    {selectedReviewers.length > 0 && (
                        <Typography variant="caption" color="text.secondary" sx={{ mt: 0.5, display: 'block' }}>
                            {selectedReviewers.length} reviewer{selectedReviewers.length > 1 ? 's' : ''} selected
                        </Typography>
                    )}
                </Box>
                {/* Optional message to include with forward */}
                <Box>
                    <Typography variant="subtitle2" fontWeight={600} sx={{ mb: 0.5 }}>Message (optional)</Typography>
                    <TextField
                        label="Message (optional)"
                        placeholder="Add a message to the additional reviewers"
                        value={message}
                        onChange={(e) => setMessage(e.target.value)}
                        multiline
                        minRows={3}
                        maxRows={6}
                        size="small"
                        fullWidth
                        variant="outlined"
                        inputProps={{ maxLength: 500 }}
                        helperText={`${message.length}/500`}
                        sx={{
                            bgcolor: isDark ? 'rgba(255,255,255,0.02)' : '#ffffff',
                            borderRadius: 1,
                            '& .MuiOutlinedInput-notchedOutline': { borderColor: 'divider' },
                            boxShadow: (theme) => theme.palette.mode === 'dark' ? 'none' : '0 1px 4px rgba(16,24,40,0.04)'
                        }}
                    />
                </Box>
            </Box>
        </BaseDialog>
    );
}
