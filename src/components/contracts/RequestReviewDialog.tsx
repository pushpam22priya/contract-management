'use client';

import { useState, useEffect } from 'react';
import {
    Box,
    Typography,
    Chip,
    Button,
    Alert,
    Divider,
    Autocomplete,
    TextField,
    Paper,
} from '@mui/material';
import CloseIcon from '@mui/icons-material/Close';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import PendingIcon from '@mui/icons-material/Pending';
import BaseDialog from '@/components/common/BaseDialog';
import { userService, User } from '@/services/userService';
import { contractService } from '@/services/contractService';
import { ModificationRequest } from '@/types/contract';
import ErrorOutlineIcon from '@mui/icons-material/ErrorOutline';

interface RequestReviewDialogProps {
    open: boolean;
    onClose: () => void;
    contractId: string;
    contractTitle: string;
    onSubmit: (reviewers: string[], approver: string) => Promise<void>;
}

/**
 * Dialog for submitting a contract for review and approval
 * - Shows modification requests if returned for changes
 * - Allows adding multiple reviewers (MANDATORY - at least 1 required)
 * - Allows selecting single approver (MANDATORY)
 * - Uses autocomplete for user selection
 * - Shows previously shared reviewers/approvers if contract was already submitted
 */
export default function RequestReviewDialog({
    open,
    onClose,
    contractId,
    contractTitle,
    onSubmit,
}: RequestReviewDialogProps) {
    // Available users from service
    const [users, setUsers] = useState<User[]>([]);
    const [loadingUsers, setLoadingUsers] = useState(false);

    // State for reviewers
    const [selectedReviewers, setSelectedReviewers] = useState<User[]>([]);

    // State for approver
    const [selectedApprover, setSelectedApprover] = useState<User | null>(null);

    // UI state
    const [error, setError] = useState('');
    const [submitting, setSubmitting] = useState(false);

    // Previously shared users (from existing contract data)
    const [existingReviewers, setExistingReviewers] = useState<{ email: string; status: string }[]>([]);
    const [existingApprover, setExistingApprover] = useState<{ email: string; status: string } | null>(null);
    const [existingModificationRequests, setExistingModificationRequests] = useState<ModificationRequest[]>([]);
    const [hasExistingData, setHasExistingData] = useState(false);

    /**
     * Load users and existing contract data on mount
     */
    useEffect(() => {
        if (open) {
            loadUsers();
            loadExistingReviewData();
        }
    }, [open, contractId]);

    /**
     * Load existing review/approval data from contract
     */
    const loadExistingReviewData = () => {
        const contract = contractService.getContractById(contractId);

        if (contract) {
            let hasData = false;

            // Load modification requests
            if (contract.modificationRequests && contract.modificationRequests.length > 0) {
                setExistingModificationRequests(contract.modificationRequests);
                hasData = true;
            } else {
                setExistingModificationRequests([]);
            }

            // Load existing reviewers
            if (contract.reviewers && contract.reviewers.length > 0) {
                setExistingReviewers(contract.reviewers.map(r => ({
                    email: r.email,
                    status: r.status,
                })));
                hasData = true;
            } else {
                setExistingReviewers([]);
            }

            // Load existing approver
            if (contract.approver) {
                setExistingApprover({
                    email: contract.approver.email,
                    status: contract.approver.status,
                });
                hasData = true;
            } else {
                setExistingApprover(null);
            }

            setHasExistingData(hasData);
        }
    };

    /**
     * Load all users from service
     */
    const loadUsers = async () => {
        setLoadingUsers(true);
        try {
            const allUsers = await userService.getAllUsers();
            setUsers(allUsers);
        } catch (err) {
            console.error('Failed to load users:', err);
            setError('Failed to load users. Please refresh.');
        } finally {
            setLoadingUsers(false);
        }
    };

    /**
     * Pre-populate fields when users and existing data are loaded
     */
    /**
     * Pre-populate fields when users and existing data are loaded
     */
    useEffect(() => {
        if (users.length > 0 && hasExistingData) {
            // Note: We intentionally DO NOT pre-populate reviewers here per user request.
            // This prevents "replacing" confusion. We only allow adding NEW reviewers.
            // The merging happens in the parent component.

            // Populate approver (User wants this pre-filled)
            if (existingApprover) {
                const approverToSelect = users.find(user => user.email === existingApprover.email);
                if (approverToSelect) {
                    setSelectedApprover(approverToSelect);
                }
            }
        }
    }, [users, hasExistingData, existingApprover]);

    /**
     * Get available reviewers (exclude approver AND existing reviewers)
     */
    const getAvailableReviewers = (): User[] => {
        let filtered = users;

        // Exclude currently selected approver
        if (selectedApprover) {
            filtered = filtered.filter(u => u.email !== selectedApprover.email);
        }

        // Exclude existing reviewers (to prevent selecting them again)
        if (existingReviewers.length > 0) {
            const existingEmails = existingReviewers.map(r => r.email);
            filtered = filtered.filter(u => !existingEmails.includes(u.email));
        }

        return filtered;
    };

    /**
     * Get available approvers (exclude selected reviewers)
     */
    const getAvailableApprovers = (): User[] => {
        const reviewerEmails = selectedReviewers.map(r => r.email);
        return users.filter(user => !reviewerEmails.includes(user.email));
    };

    /**
     * Handle reviewer selection
     */
    const handleReviewerChange = (_: any, newValue: User[]) => {
        setError('');
        setSelectedReviewers(newValue);
    };

    /**
     * Handle approver selection
     */
    const handleApproverChange = (_: any, newValue: User | null) => {
        setError('');
        setSelectedApprover(newValue);
    };

    /**
     * Submit the review request
     */
    const handleSubmit = async () => {
        setError('');

        // Validation - at least one reviewer is mandatory
        if (selectedReviewers.length === 0) {
            setError('Please select at least one reviewer');
            return;
        }

        // Validation - approver is mandatory
        if (!selectedApprover) {
            setError('Please select an approver');
            return;
        }

        // Validate that reviewers and approver are not the same
        const reviewerEmails = selectedReviewers.map(r => r.email);
        if (reviewerEmails.includes(selectedApprover.email)) {
            setError('The approver cannot also be a reviewer');
            return;
        }

        setSubmitting(true);

        try {
            await onSubmit(reviewerEmails, selectedApprover.email);
            handleClose();
        } catch (err) {
            setError('Failed to submit. Please try again.');
        } finally {
            setSubmitting(false);
        }
    };

    /**
     * Reset and close dialog
     */
    const handleClose = () => {
        setSelectedReviewers([]);
        setSelectedApprover(null);
        setError('');
        setSubmitting(false);
        onClose();
    };

    // Dialog actions (footer buttons)
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
                disabled={submitting || selectedReviewers.length === 0 || !selectedApprover}
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
                {submitting ? 'Submitting...' : 'Submit for Review & Approval'}
            </Button>
        </>
    );

    return (
        <BaseDialog
            open={open}
            onClose={handleClose}
            title="REQUEST REVIEW & APPROVAL"
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

                {/* MODIFICATIONS REQUESTED SECTION */}
                {existingModificationRequests.length > 0 && (
                    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                        <Alert
                            severity="warning"
                            icon={<ErrorOutlineIcon fontSize="inherit" />}
                            sx={{
                                '& .MuiAlert-message': { width: '100%' }
                            }}
                        >
                            <Typography variant="subtitle2" fontWeight={600} sx={{ mb: 1 }}>
                                Modifications Requested
                            </Typography>
                            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
                                {existingModificationRequests.map((request, index) => (
                                    <Paper
                                        key={index}
                                        elevation={0}
                                        sx={{
                                            bgcolor: 'rgba(255, 255, 255, 0.6)',
                                            p: 1.5,
                                            borderRadius: 1,
                                            border: '1px solid rgba(237, 108, 2, 0.2)',
                                        }}
                                    >
                                        <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 0.5 }}>
                                            <Chip
                                                label={request.role.toUpperCase()}
                                                size="small"
                                                color={request.role === 'approver' ? 'success' : 'primary'}
                                                sx={{ height: 20, fontSize: '0.65rem' }}
                                            />
                                            <Typography variant="caption" color="text.secondary">
                                                {new Date(request.requestedAt).toLocaleDateString()}
                                            </Typography>
                                        </Box>
                                        <Typography variant="body2" fontWeight={500} sx={{ mb: 0.5 }}>
                                            {request.requestedBy}
                                        </Typography>
                                        <Typography variant="body2" color="text.secondary" sx={{ fontStyle: 'italic' }}>
                                            "{request.comments}"
                                        </Typography>
                                    </Paper>
                                ))}
                            </Box>
                        </Alert>
                    </Box>
                )}

                {/* Error Message */}
                {error && (
                    <Alert severity="error" onClose={() => setError('')}>
                        {error}
                    </Alert>
                )}

                {/* Previously Shared With Section */}
                {(existingReviewers.length > 0 || existingApprover) && (
                    <Paper
                        elevation={0}
                        sx={{
                            bgcolor: '#f0fdfa',
                            border: '1px solid #99f6e4',
                            borderRadius: 2,
                            p: 2,
                        }}
                    >
                        <Typography variant="subtitle2" fontWeight={600} gutterBottom sx={{ color: '#115e59' }}>
                            Submitted to
                        </Typography>

                        {/* Existing Reviewers */}
                        {existingReviewers.length > 0 && (
                            <Box sx={{ mb: 2 }}>
                                <Typography variant="caption" fontWeight={600} sx={{ display: 'block', mb: 1, color: 'text.secondary' }}>
                                    Reviewers:
                                </Typography>
                                <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1 }}>
                                    {existingReviewers.map((reviewer, index) => (
                                        <Chip
                                            key={index}
                                            icon={reviewer.status === 'reviewed' ? <CheckCircleIcon /> : <PendingIcon />}
                                            label={`${reviewer.email} (${reviewer.status})`}
                                            size="small"
                                            sx={{
                                                bgcolor: reviewer.status === 'reviewed' ? '#d1fae5' : '#fef3c7',
                                                color: reviewer.status === 'reviewed' ? '#065f46' : '#92400e',
                                                '& .MuiChip-icon': {
                                                    color: reviewer.status === 'reviewed' ? '#065f46' : '#92400e',
                                                },
                                            }}
                                        />
                                    ))}
                                </Box>
                            </Box>
                        )}

                        {/* Existing Approver */}
                        {existingApprover && (
                            <Box>
                                <Typography variant="caption" fontWeight={600} sx={{ display: 'block', mb: 1, color: 'text.secondary' }}>
                                    Approver:
                                </Typography>
                                <Chip
                                    icon={existingApprover.status === 'approved' ? <CheckCircleIcon /> : <PendingIcon />}
                                    label={`${existingApprover.email} (${existingApprover.status})`}
                                    size="small"
                                    sx={{
                                        bgcolor: existingApprover.status === 'approved' ? '#dbeafe' : '#fef3c7',
                                        color: existingApprover.status === 'approved' ? '#1e40af' : '#92400e',
                                        '& .MuiChip-icon': {
                                            color: existingApprover.status === 'approved' ? '#1e40af' : '#92400e',
                                        },
                                    }}
                                />
                            </Box>
                        )}
                    </Paper>
                )}

                {/* Reviewers Section */}
                <Box>
                    <Typography variant="subtitle2" fontWeight={600} gutterBottom>
                        Reviewers <span style={{ color: '#d32f2f' }}>*</span>
                    </Typography>

                    {/* Reviewer Autocomplete */}
                    <Autocomplete
                        multiple
                        options={getAvailableReviewers()}
                        getOptionLabel={(option) => `${option.name} (${option.email})`}
                        value={selectedReviewers}
                        onChange={handleReviewerChange}
                        loading={loadingUsers}
                        renderInput={(params) => (
                            <TextField
                                {...params}
                                placeholder="Search and select reviewers..."
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
                                        bgcolor: '#e0f2f1',
                                        color: '#00695c',
                                        '& .MuiChip-deleteIcon': {
                                            color: '#00695c',
                                            '&:hover': {
                                                color: '#004d40',
                                            },
                                        },
                                    }}
                                />
                            ))
                        }
                        sx={{ mb: 1 }}
                    />

                    {/* Selected Reviewers Count */}
                    {selectedReviewers.length > 0 && (
                        <Typography variant="caption" color="text.secondary">
                            {selectedReviewers.length} reviewer{selectedReviewers.length > 1 ? 's' : ''} selected
                        </Typography>
                    )}
                </Box>

                <Divider />

                {/* Approver Section */}
                <Box>
                    <Typography variant="subtitle2" fontWeight={600} gutterBottom>
                        Approver <span style={{ color: '#d32f2f' }}>*</span>
                    </Typography>
                    {/* Approver Autocomplete */}
                    <Autocomplete
                        options={getAvailableApprovers()}
                        getOptionLabel={(option) => `${option.name} (${option.email})`}
                        value={selectedApprover}
                        onChange={handleApproverChange}
                        loading={loadingUsers}
                        renderInput={(params) => (
                            <TextField
                                {...params}
                                placeholder="Search and select approver..."
                                size="small"
                                sx={{
                                    '& .MuiOutlinedInput-root': {
                                        bgcolor: 'white',
                                    },
                                }}
                            />
                        )}
                    />

                    {/* Selected Approver Display */}
                    {selectedApprover && (
                        <Box sx={{ mt: 1.5 }}>
                            <Chip
                                label={`${selectedApprover.name} - ${selectedApprover.email}`}
                                onDelete={() => setSelectedApprover(null)}
                                deleteIcon={<CloseIcon />}
                                sx={{
                                    bgcolor: '#fff3e0',
                                    color: '#e65100',
                                    '& .MuiChip-deleteIcon': {
                                        color: '#e65100',
                                        '&:hover': {
                                            color: '#bf360c',
                                        },
                                    },
                                }}
                            />
                        </Box>
                    )}
                </Box>
            </Box>
        </BaseDialog>
    );
}
