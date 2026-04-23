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
    useTheme,
} from '@mui/material';
import { alpha } from '@mui/material/styles';
import CloseIcon from '@mui/icons-material/Close';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import PendingIcon from '@mui/icons-material/Pending';
import BaseDialog from '@/components/common/BaseDialog';
import { userService, User } from '@/services/userService';
import { contractService } from '@/services/contractService';
import { authService } from '@/services/authService';
import { ModificationRequest, ContractStatus } from '@/types/contract';
import ErrorOutlineIcon from '@mui/icons-material/ErrorOutline';

interface RequestReviewDialogProps {
    open: boolean;
    onClose: () => void;
    contractId: string;
    contractTitle: string;
    onSubmit: (
        reviewers: string[],
        approver: string,
        reviewerMessage?: string,
        approverMessage?: string
    ) => Promise<void>;
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
    const theme = useTheme();
    const isDark = theme.palette.mode === 'dark';

    const [users, setUsers] = useState<User[]>([]);
    const [loadingUsers, setLoadingUsers] = useState(false);

    // State for reviewers
    const [selectedReviewers, setSelectedReviewers] = useState<User[]>([]);

    // State for approver
    const [selectedApprover, setSelectedApprover] = useState<User | null>(null);

    // State for messages
    const [reviewerMessage, setReviewerMessage] = useState('');
    const [approverMessage, setApproverMessage] = useState('');

    // UI state
    const [error, setError] = useState('');
    const [submitting, setSubmitting] = useState(false);
    const [removing, setRemoving] = useState<string | null>(null); // Track which item is being removed

    // Previously shared users (from existing contract data)
    const [existingReviewers, setExistingReviewers] = useState<{ email: string; status: string; submissionMessage?: string }[]>([]);
    const [existingApprover, setExistingApprover] = useState<{ email: string; status: string; submissionMessage?: string } | null>(null);
    const [existingModificationRequests, setExistingModificationRequests] = useState<ModificationRequest[]>([]);
    const [hasExistingData, setHasExistingData] = useState(false);
    const [contractStatus, setContractStatus] = useState<string>('');

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
    const loadExistingReviewData = async () => {
        const contract = await contractService.getContractById(contractId);

        if (contract) {
            setContractStatus(contract.status || '');
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
                    submissionMessage: r.submissionMessage,
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
                    submissionMessage: contract.approver.submissionMessage,
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
     * Note: We intentionally DO NOT pre-populate selectedReviewers or selectedApprover.
     * - Existing reviewers/approvers are shown in the "Previously Assigned" sections
     * - selectedReviewers and selectedApprover are only for NEW selections
     * - Submit button is only enabled when NEW selections are made
     */

    /**
     * Get available reviewers (exclude current user, approver, and existing reviewers)
     */
    const getAvailableReviewers = (): User[] => {
        const currentUser = authService.getCurrentUser();
        let filtered = users;

        // Exclude current logged-in user (can't review your own contract)
        if (currentUser) {
            filtered = filtered.filter(u => u.email !== currentUser.email);
        }

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
     * Get available approvers (exclude current user and selected reviewers)
     */
    const getAvailableApprovers = (): User[] => {
        const currentUser = authService.getCurrentUser();
        const reviewerEmails = selectedReviewers.map(r => r.email);

        return users.filter(user => {
            // Exclude current logged-in user (can't approve your own contract)
            if (currentUser && user.email === currentUser.email) {
                return false;
            }
            // Exclude selected reviewers
            if (reviewerEmails.includes(user.email)) {
                return false;
            }
            return true;
        });
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
     * Handle removing an existing reviewer
     */
    const handleRemoveReviewer = async (reviewerEmail: string) => {
        setRemoving(reviewerEmail);
        setError('');

        try {
            const result = await contractService.removeReviewer(contractId, reviewerEmail);

            if (result.success) {
                // Update local state to reflect removal
                setExistingReviewers(prev => prev.filter(r => r.email !== reviewerEmail));
            } else {
                setError(result.message || 'Failed to remove reviewer');
            }
        } catch (err) {
            setError('Failed to remove reviewer');
        } finally {
            setRemoving(null);
        }
    };

    /**
     * Handle removing the existing approver
     */
    const handleRemoveApprover = async () => {
        if (!existingApprover) return;

        setRemoving('approver');
        setError('');

        try {
            const result = await contractService.removeApprover(contractId);

            if (result.success) {
                // Clear existing approver to show the selection input again
                setExistingApprover(null);
                // Also clear any previously selected approver in the autocomplete
                setSelectedApprover(null);
            } else {
                setError(result.message || 'Failed to remove approver');
            }
        } catch (err) {
            setError('Failed to remove approver');
        } finally {
            setRemoving(null);
        }
    };

    /**
     * Submit the review request
     */
    const handleSubmit = async () => {
        setError('');

        const reviewerEmails = selectedReviewers.map(r => r.email);
        const approverEmail = existingApprover?.email || selectedApprover?.email;

        // Case D: Neither reviewer nor approver selected — block submission
        if (selectedReviewers.length === 0 && !selectedApprover) {
            setError('Please select at least one Reviewer or Approver');
            return;
        }

        // Validate that reviewers and approver are not the same
        if (selectedApprover && reviewerEmails.includes(selectedApprover.email)) {
            setError('The approver cannot also be a reviewer');
            return;
        }

        setSubmitting(true);

        try {
            await onSubmit(
                reviewerEmails,
                approverEmail || '', // Pass empty string if no approver
                reviewerMessage.trim() || undefined,
                // Only pass approver message if it's a new approver
                !existingApprover ? (approverMessage.trim() || undefined) : undefined
            );
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
        setReviewerMessage('');
        setApproverMessage('');
        setError('');
        setSubmitting(false);
        onClose();
    };

    const READ_ONLY_STATUSES: string[] = [
        ContractStatus.IN_REVIEW,
        ContractStatus.IN_APPROVAL,
        ContractStatus.APPROVED,
        ContractStatus.READY_FOR_SIGNATURE,
        ContractStatus.REJECTED_BY_REVIEWER,
        ContractStatus.REJECTED_BY_APPROVER,
        ContractStatus.WAITING_FOR_SIGNATURE,
        ContractStatus.SIGNED,
        ContractStatus.SIGNED_BY_EVERYONE,
        ContractStatus.ACTIVE,
    ];
    const isReadOnly = READ_ONLY_STATUSES.includes(contractStatus);

    const getSubmitLabel = () => {
        if (submitting) return 'Submitting...';
        if (selectedReviewers.length > 0 && selectedApprover) return 'Submit for Review & Approval';
        if (selectedReviewers.length > 0) return 'Submit for Review';
        if (selectedApprover) return 'Submit for Approval';
        return 'Submit';
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
            {!isReadOnly && (
                <Button
                    onClick={handleSubmit}
                    variant="contained"
                    disabled={submitting}
                    sx={{
                        textTransform: 'none',
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
                    {getSubmitLabel()}
                </Button>
            )}
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
            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
                {/* Contract Info */}
                <Box
                    sx={{
                        bgcolor: isDark ? alpha('#ffffff', 0.05) : '#f8fafc',
                        p: 0.8,
                        borderRadius: 2,
                        border: '1px solid',
                        borderColor: 'divider',
                        display: 'flex',
                        alignItems: 'center',
                        gap: 1
                    }}
                >
                    <Typography variant="body1" color="text.secondary" sx={{ display: 'block', fontWeight: 600 }}>
                        Contract:
                    </Typography>
                    <Typography variant="body1">
                        {contractTitle}
                    </Typography>
                </Box>

                {/* READ-ONLY STATUS BANNER */}
                {isReadOnly && (
                    <Alert
                        severity={
                            contractStatus === ContractStatus.REJECTED_BY_REVIEWER ||
                                contractStatus === ContractStatus.REJECTED_BY_APPROVER
                                ? "error" : "info"
                        }
                        sx={{
                            '& .MuiAlert-message': { width: '100%' },
                            borderRadius: 1.5,
                            p: 1
                        }}
                    >
                        <Typography variant="body2" fontWeight={600} sx={{ mb: 0.25 }}>
                            {(() => {
                                switch (contractStatus) {
                                    case ContractStatus.IN_REVIEW: return 'Contract is currently In Review';
                                    case ContractStatus.IN_APPROVAL: return 'Contract is currently In Approval';
                                    case ContractStatus.APPROVED:
                                    case ContractStatus.READY_FOR_SIGNATURE: return 'Contract has been Approved';
                                    case ContractStatus.REJECTED_BY_REVIEWER: return 'Contract was Rejected by Reviewer';
                                    case ContractStatus.REJECTED_BY_APPROVER: return 'Contract was Rejected by Approver';
                                    case ContractStatus.WAITING_FOR_SIGNATURE: return 'Contract is Waiting for Signature';
                                    case ContractStatus.SIGNED:
                                    case ContractStatus.SIGNED_BY_EVERYONE: return 'Contract has been Signed';
                                    case ContractStatus.ACTIVE: return 'Contract is Active';
                                    default: return `Contract Status: ${contractStatus}`;
                                }
                            })()}
                        </Typography>
                        <Typography variant="caption" color="text.secondary">
                            {(() => {
                                if (contractStatus === ContractStatus.REJECTED_BY_REVIEWER || contractStatus === ContractStatus.REJECTED_BY_APPROVER) {
                                    return 'This contract has been rejected and cannot be modified further in this flow.';
                                }
                                if (contractStatus === ContractStatus.APPROVED || contractStatus === ContractStatus.READY_FOR_SIGNATURE) {
                                    return 'Review and approval process is complete. Contract is ready for signatures.';
                                }
                                // return 'No changes can be made at this stage.';
                            })()}
                        </Typography>
                    </Alert>
                )}

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
                                            bgcolor: isDark ? alpha('#ffffff', 0.06) : 'rgba(255, 255, 255, 0.6)',
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
                                                {new Date(request.requestedAt).toLocaleDateString('en-GB')}
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

                {/* Previously Submitted Reviewers Section - Grouped by Message */}
                {(existingReviewers.length > 0 || isReadOnly) && (
                    <Paper
                        elevation={0}
                        sx={{
                            bgcolor: isDark ? alpha(theme.palette.primary.main, 0.08) : '#f0fdfa',
                            border: '1px solid',
                borderColor: isDark ? alpha(theme.palette.primary.main, 0.25) : '#99f6e4',
                            borderRadius: 2,
                            p: 1,
                        }}
                    >
                        <Typography variant="subtitle2" fontWeight={600} gutterBottom sx={{ color: 'primary.main' }}>
                            Assigned Reviewers
                        </Typography>

                        {existingReviewers.length === 0 ? (
                            /* Read-only: no reviewers assigned */
                            <Typography variant="body2" color="text.secondary" sx={{ fontStyle: 'italic' }}>
                                No reviewers assigned
                            </Typography>
                        ) : (
                            /* Group reviewers by their submission message - maintaining order */
                            (() => {
                                const groups: { message: string | null; reviewers: typeof existingReviewers }[] = [];

                                existingReviewers.forEach((reviewer) => {
                                    const message = reviewer.submissionMessage || null;
                                    const existingGroup = groups.find(g => g.message === message);
                                    if (existingGroup) {
                                        existingGroup.reviewers.push(reviewer);
                                    } else {
                                        groups.push({ message, reviewers: [reviewer] });
                                    }
                                });

                                return groups.map(({ message, reviewers }, groupIndex) => (
                                    <Box
                                        key={groupIndex}
                                        sx={{
                                            mb: groupIndex < groups.length - 1 ? 1.5 : 0,
                                            pb: groupIndex < groups.length - 1 ? 1.5 : 0,
                                            borderBottom: groupIndex < groups.length - 1
                                                ? '1px dashed rgba(0, 105, 92, 0.2)'
                                                : 'none',
                                        }}
                                    >
                                        <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1 }}>
                                            {reviewers.map((reviewer, index) => (
                                                <Chip
                                                    key={index}
                                                    icon={reviewer.status === 'reviewed' ? <CheckCircleIcon /> : <PendingIcon />}
                                                    label={`${reviewer.email} (${reviewer.status})`}
                                                    size="small"
                                                    /* No delete in read-only mode */
                                                    onDelete={isReadOnly ? undefined : () => handleRemoveReviewer(reviewer.email)}
                                                    deleteIcon={isReadOnly ? undefined : (
                                                        removing === reviewer.email ? (
                                                            <Box
                                                                sx={{
                                                                    width: 18,
                                                                    height: 18,
                                                                    display: 'flex',
                                                                    alignItems: 'center',
                                                                    justifyContent: 'center',
                                                                }}
                                                            >
                                                                <Box
                                                                    sx={{
                                                                        width: 12,
                                                                        height: 12,
                                                                        border: '2px solid',
                                                                        borderColor: reviewer.status === 'reviewed' ? (isDark ? '#86efac' : '#065f46') : (isDark ? '#fdba74' : '#92400e'),
                                                                        borderTopColor: 'transparent',
                                                                        borderRadius: '50%',
                                                                        animation: 'spin 1s linear infinite',
                                                                        '@keyframes spin': {
                                                                            '0%': { transform: 'rotate(0deg)' },
                                                                            '100%': { transform: 'rotate(360deg)' },
                                                                        },
                                                                    }}
                                                                />
                                                            </Box>
                                                        ) : (
                                                            <CloseIcon />
                                                        )
                                                    )}
                                                    disabled={!isReadOnly && removing !== null}
                                                    sx={{
                                                        bgcolor: reviewer.status === 'reviewed' ? (isDark ? alpha('#22c55e', 0.15) : '#d1fae5') : (isDark ? alpha('#f97316', 0.15) : '#fef3c7'),
                                                        color: reviewer.status === 'reviewed' ? (isDark ? '#86efac' : '#065f46') : (isDark ? '#fdba74' : '#92400e'),
                                                        '& .MuiChip-icon': {
                                                            color: reviewer.status === 'reviewed' ? (isDark ? '#86efac' : '#065f46') : (isDark ? '#fdba74' : '#92400e'),
                                                        },
                                                        '& .MuiChip-deleteIcon': {
                                                            color: reviewer.status === 'reviewed' ? (isDark ? '#86efac' : '#065f46') : (isDark ? '#fdba74' : '#92400e'),
                                                            '&:hover': {
                                                                color: reviewer.status === 'reviewed' ? (isDark ? '#4ade80' : '#064e3b') : (isDark ? '#fb923c' : '#78350f'),
                                                            },
                                                        },
                                                    }}
                                                />
                                            ))}
                                        </Box>
                                        {/* Show submission message for this group */}
                                        {message && (
                                            <Box
                                                sx={{
                                                    mt: 1,
                                                    p: 1,
                                                    bgcolor: isDark ? alpha('#ffffff', 0.06) : 'rgba(255, 255, 255, 0.6)',
                                                    borderRadius: 1,
                                                    borderLeft: '3px solid',
                                                borderLeftColor: 'primary.main',
                                                }}
                                            >
                                                <Typography variant="caption" color="text.secondary" sx={{ fontStyle: 'italic' }}>
                                                    "{message}"
                                                </Typography>
                                            </Box>
                                        )}
                                    </Box>
                                ));
                            })()
                        )}
                    </Paper>
                )}

                {/* Reviewers Section — hidden in read-only mode (inputs shown only when editable) */}
                {!isReadOnly && <Box>
                    <Typography variant="subtitle2" fontWeight={600} gutterBottom>
                        Reviewers
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
                                        bgcolor: 'background.paper',
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
                                        bgcolor: isDark ? alpha(theme.palette.primary.main, 0.15) : '#e0f2f1',
                                        color: isDark ? theme.palette.primary.light : '#00695c',
                                        '& .MuiChip-deleteIcon': {
                                            color: isDark ? theme.palette.primary.light : '#00695c',
                                            '&:hover': {
                                                color: isDark ? '#ffffff' : '#004d40',
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

                    {/* Message for Reviewers */}
                    {selectedReviewers.length > 0 && (
                        <Box
                            sx={{
                                mt: 1.5,
                                p: 1.5,
                                bgcolor: alpha(theme.palette.primary.main, 0.04),
                                borderRadius: 1.5,
                                border: '1px dashed rgba(0, 105, 92, 0.2)',
                            }}
                        >
                            <Typography
                                variant="caption"
                                fontWeight={500}
                                sx={{ display: 'block', mb: 1, color: isDark ? theme.palette.primary.light : '#00695c' }}
                            >
                                Message to Reviewers
                            </Typography>
                            <TextField
                                multiline
                                rows={2}
                                fullWidth
                                placeholder="Add instructions or context for reviewers..."
                                value={reviewerMessage}
                                onChange={(e) => setReviewerMessage(e.target.value)}
                                size="small"
                                sx={{
                                    '& .MuiOutlinedInput-root': {
                                        bgcolor: 'background.paper',
                                        fontSize: '0.875rem',
                                        '& fieldset': {
                                            borderColor: alpha(theme.palette.primary.main, 0.2),
                                        },
                                        '&:hover fieldset': {
                                            borderColor: alpha(theme.palette.primary.main, 0.4),
                                        },
                                        '&.Mui-focused fieldset': {
                                            borderColor: theme.palette.primary.main,
                                        },
                                    },
                                }}
                            />
                        </Box>
                    )}
                </Box>}

                <Divider />

                {/* Approver Section */}
                <Box>
                    <Typography variant="subtitle2" fontWeight={600} gutterBottom>
                        Approver
                    </Typography>

                    {/* Show existing approver — read-only chip in read-only mode, with remove in editable mode */}
                    {existingApprover ? (
                        <Box
                            sx={{
                                p: 1,
                                bgcolor: isDark ? alpha(theme.palette.primary.main, 0.08) : '#f7fdf0ff',
                                borderRadius: 2,
                                border: '1px solid',
                            borderColor: isDark ? alpha(theme.palette.primary.main, 0.25) : '#ddf699ff',
                            }}
                        >
                            <Chip
                                icon={existingApprover.status === 'approved' ? <CheckCircleIcon /> : <PendingIcon />}
                                label={`${existingApprover.email} (${existingApprover.status})`}
                                size="small"
                                /* No delete in read-only mode */
                                onDelete={isReadOnly ? undefined : handleRemoveApprover}
                                deleteIcon={isReadOnly ? undefined : (
                                    removing === 'approver' ? (
                                        <Box
                                            sx={{
                                                width: 18,
                                                height: 18,
                                                display: 'flex',
                                                alignItems: 'center',
                                                justifyContent: 'center',
                                            }}
                                        >
                                            <Box
                                                sx={{
                                                    width: 12,
                                                    height: 12,
                                                    border: '2px solid',
                                                    borderColor: existingApprover.status === 'approved' ? (isDark ? '#93c5fd' : '#1e40af') : (isDark ? '#fdba74' : '#92400e'),
                                                    borderTopColor: 'transparent',
                                                    borderRadius: '50%',
                                                    animation: 'spin 1s linear infinite',
                                                    '@keyframes spin': {
                                                        '0%': { transform: 'rotate(0deg)' },
                                                        '100%': { transform: 'rotate(360deg)' },
                                                    },
                                                }}
                                            />
                                        </Box>
                                    ) : (
                                        <CloseIcon />
                                    )
                                )}
                                disabled={!isReadOnly && removing !== null}
                                sx={{
                                    bgcolor: existingApprover.status === 'approved' ? (isDark ? alpha('#3b82f6', 0.15) : '#dbeafe') : (isDark ? alpha('#f97316', 0.15) : '#fef3c7'),
                                    color: existingApprover.status === 'approved' ? (isDark ? '#93c5fd' : '#1e40af') : (isDark ? '#fdba74' : '#92400e'),
                                    '& .MuiChip-icon': {
                                        color: existingApprover.status === 'approved' ? (isDark ? '#93c5fd' : '#1e40af') : (isDark ? '#fdba74' : '#92400e'),
                                    },
                                    '& .MuiChip-deleteIcon': {
                                        color: existingApprover.status === 'approved' ? (isDark ? '#93c5fd' : '#1e40af') : (isDark ? '#fdba74' : '#92400e'),
                                        '&:hover': {
                                            color: existingApprover.status === 'approved' ? (isDark ? '#bfdbfe' : '#1e3a8a') : (isDark ? '#fb923c' : '#78350f'),
                                        },
                                    },
                                }}
                            />
                            {existingApprover.submissionMessage && (
                                <Box
                                    sx={{
                                        mt: 1,
                                        p: 1,
                                        bgcolor: isDark ? alpha('#ffffff', 0.06) : 'rgba(255, 255, 255, 0.6)',
                                        borderRadius: 1,
                                        borderLeft: '3px solid',
                                        borderLeftColor: 'primary.main',
                                    }}
                                >
                                    <Typography variant="caption" color="text.secondary" sx={{ fontStyle: 'italic' }}>
                                        "{existingApprover.submissionMessage}"
                                    </Typography>
                                </Box>
                            )}
                        </Box>
                    ) : isReadOnly ? (
                        /* Read-only: no approver was assigned */
                        <Typography variant="body2" color="text.secondary" sx={{ fontStyle: 'italic' }}>
                            No approver assigned
                        </Typography>
                    ) : (
                        <>
                            {/* Approver Autocomplete - only shown if no existing approver */}
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
                                                bgcolor: 'background.paper',
                                            },
                                        }}
                                    />
                                )}
                            />

                            {/* Selected Approver Display */}
                            {selectedApprover && (
                                <Box sx={{ mt: 1.5 }}>
                                    <Chip
                                        icon={<PendingIcon />}
                                        label={`${selectedApprover.name} (${selectedApprover.email})`}
                                        size="small"
                                        onDelete={() => setSelectedApprover(null)}
                                        deleteIcon={<CloseIcon />}
                                        sx={{
                                            bgcolor: isDark ? alpha('#f97316', 0.15) : '#fef3c7',
                                            color: isDark ? '#fdba74' : '#92400e',
                                            '& .MuiChip-icon': {
                                                color: isDark ? '#fdba74' : '#92400e',
                                            },
                                            '& .MuiChip-deleteIcon': {
                                                color: isDark ? '#fdba74' : '#92400e',
                                                '&:hover': {
                                                    color: isDark ? '#fb923c' : '#78350f',
                                                },
                                            },
                                        }}
                                    />
                                </Box>
                            )}

                            {/* Message for Approver */}
                            {selectedApprover && (
                                <Box
                                    sx={{
                                        mt: 1.5,
                                        p: 1.5,
                                        bgcolor: alpha(theme.palette.primary.main, 0.04),
                                        borderRadius: 1.5,
                                        border: '1px dashed rgba(0, 105, 92, 0.2)',
                                    }}
                                >
                                    <Typography
                                        variant="caption"
                                        fontWeight={500}
                                        sx={{ display: 'block', mb: 1, color: isDark ? theme.palette.primary.light : '#00695c' }}
                                    >
                                        Message to Approver
                                    </Typography>
                                    <TextField
                                        multiline
                                        rows={2}
                                        fullWidth
                                        placeholder="Add instructions or context for the approver..."
                                        value={approverMessage}
                                        onChange={(e) => setApproverMessage(e.target.value)}
                                        size="small"
                                        sx={{
                                            '& .MuiOutlinedInput-root': {
                                                bgcolor: 'background.paper',
                                                fontSize: '0.875rem',
                                                '& fieldset': {
                                                    borderColor: alpha(theme.palette.primary.main, 0.2),
                                                },
                                                '&:hover fieldset': {
                                                    borderColor: alpha(theme.palette.primary.main, 0.4),
                                                },
                                                '&.Mui-focused fieldset': {
                                                    borderColor: theme.palette.primary.main,
                                                },
                                            },
                                        }}
                                    />
                                </Box>
                            )}
                        </>
                    )}
                </Box>
            </Box>
        </BaseDialog>
    );
}
