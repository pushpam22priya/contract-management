'use client';

import { useState, useEffect } from 'react';
import {
    Box,
    Typography,
    Chip,
    Button,
    Alert,
    Autocomplete,
    TextField,
    Paper,
} from '@mui/material';
import CloseIcon from '@mui/icons-material/Close';
import InfoOutlinedIcon from '@mui/icons-material/InfoOutlined';
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
    onSubmit: (additionalReviewers: string[]) => Promise<void>;
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
}: FurtherReviewDialogProps) {
    const [users, setUsers] = useState<User[]>([]);
    const [loadingUsers, setLoadingUsers] = useState(false);
    const [selectedReviewers, setSelectedReviewers] = useState<User[]>([]);
    const [error, setError] = useState('');
    const [submitting, setSubmitting] = useState(false);

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
            await onSubmit(reviewerEmails);
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
            <Button
                onClick={handleClose}
                disabled={submitting}
                sx={{
                    textTransform: 'none',
                    color: 'text.secondary',
                }}
            >
                Cancel
            </Button>
            <Button
                onClick={handleSubmit}
                variant="contained"
                disabled={submitting || selectedReviewers.length === 0}
                sx={{
                    textTransform: 'none',
                    fontWeight: 600,
                    px: 3,
                    bgcolor: 'primary.main',
                    boxShadow: '0 2px 8px rgba(15, 118, 110, 0.25)',
                    '&:hover': {
                        bgcolor: 'primary.dark',
                        boxShadow: '0 4px 12px rgba(15, 118, 110, 0.35)',
                    },
                }}
            >
                {submitting ? 'Submitting...' : 'Submit for Further Review'}
            </Button>
        </>
    );

    return (
        <BaseDialog
            open={open}
            onClose={handleClose}
            title="SEND FOR FURTHER REVIEW"
            actions={dialogActions}
            maxWidth="sm"
        >
            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 3, py: 2 }}>
                {/* Contract Info */}
                <Box
                    sx={{
                        bgcolor: '#f8fafc',
                        p: 2,
                        borderRadius: 2,
                        border: '1px solid',
                        borderColor: 'rgba(0, 0, 0, 0.08)',
                    }}
                >
                    <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 0.5 }}>
                        Contract
                    </Typography>
                    <Typography variant="body1" fontWeight={600}>
                        {contractTitle}
                    </Typography>
                </Box>

                {/* Error Message */}
                {error && (
                    <Alert severity="error" onClose={() => setError('')}>
                        {error}
                    </Alert>
                )}

                {/* Excluded Users Info */}
                {/* <Paper
                    elevation={0}
                    sx={{
                        bgcolor: '#fef3c7',
                        border: '1px solid #fcd34d',
                        borderRadius: 2,
                        p: 1.5,
                    }}
                >
                    <Typography variant="caption" color="#92400e">
                        ℹ️ {getExcludedUserSummary()}
                    </Typography>
                </Paper> */}

                {/* Additional Reviewers Selection */}
                <Box>
                    <Typography variant="subtitle2" fontWeight={600} gutterBottom>
                        Additional Reviewers <span style={{ color: '#d32f2f' }}>*</span>
                    </Typography>
                    <Typography variant="caption" color="text.secondary" sx={{ mb: 2, display: 'block' }}>
                        Select one or more additional reviewers
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
                                placeholder="Search and select additional reviewers..."
                                size="small"
                                sx={{
                                    '& .MuiOutlinedInput-root': {
                                        bgcolor: 'white',
                                    },
                                }}
                            />
                        )}
                        renderTags={(value, getTagProps) =>
                            value.map((option, index) => (
                                <Chip
                                    {...getTagProps({ index })}
                                    key={option.id}
                                    label={option.email}
                                    deleteIcon={<CloseIcon />}
                                    sx={{
                                        bgcolor: '#e3f2fd',
                                        color: '#1565c0',
                                        '& .MuiChip-deleteIcon': {
                                            color: '#1565c0',
                                            '&:hover': {
                                                color: '#0d47a1',
                                            },
                                        },
                                    }}
                                />
                            ))
                        }
                        sx={{ mb: 1 }}
                    />

                    {/* Selected Count */}
                    {selectedReviewers.length > 0 && (
                        <Typography variant="caption" color="text.secondary">
                            {selectedReviewers.length} additional reviewer{selectedReviewers.length > 1 ? 's' : ''} selected
                        </Typography>
                    )}
                </Box>
            </Box>
        </BaseDialog>
    );
}
