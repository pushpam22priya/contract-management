'use client';

import { useState, useEffect } from 'react';
import {
    Box,
    Typography,
    Chip,
    Alert,
    Divider,
    Autocomplete,
    TextField,
    Paper,
    ToggleButton,
    ToggleButtonGroup,
    useTheme,
} from '@mui/material';
import { alpha } from '@mui/material/styles';
import CloseIcon from '@mui/icons-material/Close';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import PendingIcon from '@mui/icons-material/Pending';
import RateReviewIcon from '@mui/icons-material/RateReview';
import ThumbUpIcon from '@mui/icons-material/ThumbUp';
import LockOutlinedIcon from '@mui/icons-material/LockOutlined';
import InfoOutlinedIcon from '@mui/icons-material/InfoOutlined';
import AppButton from '@/components/common/AppButton';
import BaseDialog from '@/components/common/BaseDialog';
import { userService, User } from '@/services/userService';
import { apiService } from '@/services/apiService';
import { authService } from '@/services/authService';
import { ModificationRequest, ContractStatus, WorkflowMode } from '@/types/contract';
import ErrorOutlineIcon from '@mui/icons-material/ErrorOutline';

interface RequestReviewDialogProps {
    open: boolean;
    onClose: () => void;
    contractId: string;
    contractTitle: string;
    onSubmit: (
        mode: WorkflowMode,
        reviewers: string[],
        approver: string,
        reviewerMessage?: string,
        approverMessage?: string
    ) => Promise<void>;
}

export default function RequestReviewDialog({
    open,
    onClose,
    contractId,
    contractTitle,
    onSubmit,
}: RequestReviewDialogProps) {
    const theme = useTheme();
    const isDark = theme.palette.mode === 'dark';

    const [users, setUsers] = useState<User[]>([]);
    const [loadingUsers, setLoadingUsers] = useState(false);

    const [workflowMode, setWorkflowMode] = useState<WorkflowMode>('REVIEW_AND_APPROVE');
    const [selectedReviewers, setSelectedReviewers] = useState<User[]>([]);
    const [selectedApprover, setSelectedApprover] = useState<User | null>(null);
    const [reviewerMessage, setReviewerMessage] = useState('');
    const [approverMessage, setApproverMessage] = useState('');

    const [error, setError] = useState('');
    const [submitting, setSubmitting] = useState(false);

    const [existingReviewers, setExistingReviewers] = useState<{ email: string; status: string; submissionMessage?: string }[]>([]);
    const [existingApprover, setExistingApprover] = useState<{ email: string; status: string; submissionMessage?: string } | null>(null);
    const [existingModificationRequests, setExistingModificationRequests] = useState<ModificationRequest[]>([]);
    const [contractStatus, setContractStatus] = useState<string>('');

    useEffect(() => {
        if (open) {
            loadUsers();
            loadExistingReviewData();
        }
    }, [open, contractId]);

    const loadExistingReviewData = async () => {
        // Use the detail endpoint (GET /contracts/{id}) which returns the full
        // ContractResponse including reviewers[] and approver{}.
        // getContractById uses the list endpoint which omits those fields.
        const contract = await apiService.getContractDetails(contractId);
        if (contract) {
            setContractStatus(contract.status || '');

            if (contract.modificationRequests && contract.modificationRequests.length > 0) {
                setExistingModificationRequests(contract.modificationRequests);
            } else {
                setExistingModificationRequests([]);
            }

            if (contract.reviewers && contract.reviewers.length > 0) {
                setExistingReviewers((contract.reviewers as any[]).map((r: any) => ({
                    email: r.email,
                    status: r.status,
                    submissionMessage: r.submissionMessage,
                })));
            } else {
                setExistingReviewers([]);
            }

            if (contract.approver) {
                setExistingApprover({
                    email: contract.approver.email,
                    status: contract.approver.status,
                    submissionMessage: contract.approver.submissionMessage,
                });
            } else {
                setExistingApprover(null);
            }

            if (contract.workflowMode) {
                setWorkflowMode(contract.workflowMode);
            }
        }
    };

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

    const getAvailableReviewers = (): User[] => {
        const currentUser = authService.getCurrentUser();
        // When resubmitting after reviewer rejection, the reviewer list is fully replaced.
        // Previously assigned reviewers are allowed again because they may be re-selected.
        const replacingList = contractStatus === ContractStatus.REJECTED_BY_REVIEWER;
        let filtered = users;
        if (currentUser) filtered = filtered.filter(u => u.email !== currentUser.email);
        if (selectedApprover) filtered = filtered.filter(u => u.email !== selectedApprover.email);
        if (!replacingList && existingReviewers.length > 0) {
            const existingEmails = existingReviewers.map(r => r.email);
            filtered = filtered.filter(u => !existingEmails.includes(u.email));
        }
        return filtered;
    };

    const getAvailableApprovers = (): User[] => {
        const currentUser = authService.getCurrentUser();
        const reviewerEmails = selectedReviewers.map(r => r.email);
        return users.filter(user => {
            if (currentUser && user.email === currentUser.email) return false;
            if (reviewerEmails.includes(user.email)) return false;
            return true;
        });
    };

    const handleReviewerChange = (_: any, newValue: User[]) => {
        setError('');
        setSelectedReviewers(newValue);
    };

    const handleApproverChange = (_: any, newValue: User | null) => {
        setError('');
        setSelectedApprover(newValue);
    };

    const handleSubmit = async () => {
        setError('');

        // On resubmission, reviewers are only required when the rejection was by a reviewer
        // (backend replaces the list). When rejected by approver, reviewers are preserved server-side.
        const needsReviewers = (workflowMode === 'ONLY_REVIEW' || workflowMode === 'REVIEW_AND_APPROVE')
            && (!isRejected || canChangeReviewers);
        const needsApprover = workflowMode === 'ONLY_APPROVE' || workflowMode === 'REVIEW_AND_APPROVE';

        if (needsReviewers && selectedReviewers.length === 0) {
            setError('Please select at least one Reviewer');
            return;
        }
        if (needsApprover && !selectedApprover && !existingApprover) {
            setError('Please select an Approver');
            return;
        }
        if (selectedApprover && selectedReviewers.map(r => r.email).includes(selectedApprover.email)) {
            setError('The approver cannot also be a reviewer');
            return;
        }

        setSubmitting(true);
        try {
            await onSubmit(
                workflowMode,
                selectedReviewers.map(r => r.email),
                selectedApprover?.email || existingApprover?.email || '',
                reviewerMessage.trim() || undefined,
                approverMessage.trim() || undefined,
            );
            handleClose();
        } catch (err) {
            setError('Failed to submit. Please try again.');
        } finally {
            setSubmitting(false);
        }
    };

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
        ContractStatus.READY_FOR_SIGNATURE,
        ContractStatus.IN_SIGNATURE,
        ContractStatus.SIGNED,
        ContractStatus.SIGNED_BY_EVERYONE,
        ContractStatus.ACTIVE,
    ];
    const isReadOnly = READ_ONLY_STATUSES.includes(contractStatus);

    const isRejected =
        contractStatus === ContractStatus.REJECTED_BY_REVIEWER ||
        contractStatus === ContractStatus.REJECTED_BY_APPROVER;

    const isRejectedByReviewer = contractStatus === ContractStatus.REJECTED_BY_REVIEWER;
    const isRejectedByApprover = contractStatus === ContractStatus.REJECTED_BY_APPROVER;

    // Backend resubmission rules:
    // - Mode: frozen — backend returns 400 if mode changes on resubmit
    // - Reviewers: replaceable only when rejected by reviewer; locked when rejected by approver
    // - Approver: never changeable on resubmission in any mode
    // - REVIEW_AND_APPROVE + rejected by approver: review already done → goes directly to IN_APPROVAL
    const modeIsLocked = isRejected;
    const canChangeReviewers = isRejectedByReviewer;
    const approverIsLocked = isRejected;
    const reviewWillBeSkipped = isRejectedByApprover && workflowMode === 'REVIEW_AND_APPROVE';

    const showReviewerSection = workflowMode === 'ONLY_REVIEW' || workflowMode === 'REVIEW_AND_APPROVE';
    const showApproverSection = workflowMode === 'ONLY_APPROVE' || workflowMode === 'REVIEW_AND_APPROVE';

    const getSubmitLabel = () => {
        if (submitting) return 'Submitting...';
        switch (workflowMode) {
            case 'ONLY_REVIEW': return 'Submit for Review';
            case 'ONLY_APPROVE': return 'Submit for Approval';
            case 'REVIEW_AND_APPROVE': return 'Submit for Review & Approval';
        }
    };

    const getResubmitHint = (): string => {
        if (isRejectedByReviewer) {
            return workflowMode === 'REVIEW_AND_APPROVE'
                ? 'Select new reviewers below — approver stays unchanged.'
                : 'Select new reviewers to resubmit.';
        }
        return workflowMode === 'REVIEW_AND_APPROVE'
            ? 'Resubmit — review skipped, goes directly to approval.'
            : 'Resubmit to the same approver.';
    };

    const lockedChipSx = {
        height: 18,
        fontSize: '0.62rem',
        fontWeight: 600,
        bgcolor: isDark ? alpha('#f97316', 0.15) : '#fef3c7',
        color: isDark ? '#fdba74' : '#92400e',
        border: '1px solid',
        borderColor: isDark ? alpha('#f97316', 0.3) : '#fde68a',
        '& .MuiChip-icon': { color: 'inherit', fontSize: '11px !important' },
    };

    const dialogActions = (
        <>
            <AppButton variant="outlined" onClick={handleClose} disabled={submitting}>
                Cancel
            </AppButton>
            {!isReadOnly && (
                <AppButton
                    onClick={handleSubmit}
                    variant="contained"
                    loading={submitting}
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
                    {getSubmitLabel()}
                </AppButton>
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
                        gap: 1,
                    }}
                >
                    <Typography variant="body1" color="text.secondary" sx={{ fontWeight: 600 }}>
                        Contract:
                    </Typography>
                    <Typography variant="body1">{contractTitle}</Typography>
                </Box>

                {/* STATUS BANNER — read-only non-rejection states */}
                {isReadOnly && !isRejected && (
                    <Alert
                        severity="info"
                        sx={{ '& .MuiAlert-message': { width: '100%' }, borderRadius: 1.5, py: 0.75, px: 1 }}
                    >
                        <Typography variant="body2" fontWeight={600}>
                            {(() => {
                                switch (contractStatus) {
                                    case ContractStatus.IN_REVIEW: return 'Currently In Review';
                                    case ContractStatus.IN_APPROVAL: return 'Currently In Approval';
                                    case ContractStatus.READY_FOR_SIGNATURE: return 'Approved — ready for signatures';
                                    case ContractStatus.IN_SIGNATURE: return 'In Signature';
                                    case ContractStatus.SIGNED:
                                    case ContractStatus.SIGNED_BY_EVERYONE: return 'Signed';
                                    case ContractStatus.ACTIVE: return 'Active';
                                    default: return contractStatus;
                                }
                            })()}
                        </Typography>
                    </Alert>
                )}

                {/* REJECTION BANNER — merged with modification requests */}
                {isRejected && (
                    <Alert
                        severity="error"
                        icon={<ErrorOutlineIcon fontSize="inherit" />}
                        sx={{ '& .MuiAlert-message': { width: '100%' }, borderRadius: 1.5, py: 0.75, px: 1 }}
                    >
                        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', mb: existingModificationRequests.length > 0 ? 0.75 : 0 }}>
                            <Typography variant="body2" fontWeight={700}>
                                {isRejectedByReviewer ? 'Rejected by Reviewer' : 'Rejected by Approver'}
                            </Typography>
                            <Typography variant="caption" color="text.secondary" sx={{ ml: 1, flexShrink: 0 }}>
                                {getResubmitHint()}
                            </Typography>
                        </Box>

                        {existingModificationRequests.length > 0 && (
                            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.5 }}>
                                {existingModificationRequests.map((request, index) => (
                                    <Box
                                        key={index}
                                        sx={{
                                            bgcolor: isDark ? alpha('#ffffff', 0.06) : 'rgba(255,255,255,0.55)',
                                            p: 0.75,
                                            borderRadius: 1,
                                            border: '1px solid rgba(211,47,47,0.15)',
                                        }}
                                    >
                                        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 0.25 }}>
                                            <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75 }}>
                                                <Chip
                                                    label={request.role.toUpperCase()}
                                                    size="small"
                                                    color={request.role === 'approver' ? 'success' : 'primary'}
                                                    sx={{ height: 18, fontSize: '0.62rem' }}
                                                />
                                                <Typography variant="caption" fontWeight={500}>
                                                    {request.requestedBy}
                                                </Typography>
                                            </Box>
                                            <Typography variant="caption" color="text.secondary">
                                                {new Date(request.requestedAt).toLocaleDateString('en-GB')}
                                            </Typography>
                                        </Box>
                                        {request.message && (
                                            <Typography variant="caption" color="text.secondary" sx={{ fontStyle: 'italic', pl: 0.25 }}>
                                                "{request.message}"
                                            </Typography>
                                        )}
                                    </Box>
                                ))}
                            </Box>
                        )}
                    </Alert>
                )}

                {/* Validation Error */}
                {error && (
                    <Alert severity="error" onClose={() => setError('')}>
                        {error}
                    </Alert>
                )}

                {/* WORKFLOW MODE — read-only badge when not editable */}
                {isReadOnly && (
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                        <Typography variant="subtitle2" fontWeight={600} color="text.secondary">
                            Workflow Type:
                        </Typography>
                        <Chip
                            icon={workflowMode === 'ONLY_APPROVE' ? <ThumbUpIcon /> : <RateReviewIcon />}
                            label={
                                workflowMode === 'ONLY_REVIEW' ? 'Review Only'
                                    : workflowMode === 'ONLY_APPROVE' ? 'Approve Only'
                                        : 'Review & Approve'
                            }
                            size="small"
                            sx={{
                                bgcolor: isDark ? alpha(theme.palette.primary.main, 0.15) : alpha(theme.palette.primary.main, 0.1),
                                color: 'primary.main',
                                fontWeight: 600,
                                fontSize: '0.75rem',
                                '& .MuiChip-icon': { color: 'primary.main', fontSize: 14 },
                            }}
                        />
                    </Box>
                )}

                {/* WORKFLOW MODE SELECTOR */}
                {!isReadOnly && (
                    <Box>
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 0.5 }}>
                            <Typography variant="subtitle2" fontWeight={600}>
                                Workflow Type
                            </Typography>
                            {modeIsLocked && (
                                <Chip
                                    icon={<LockOutlinedIcon />}
                                    label="Locked"
                                    size="small"
                                    sx={lockedChipSx}
                                />
                            )}
                        </Box>
                        {modeIsLocked && (
                            <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 0.75 }}>
                                Workflow type cannot be changed on resubmission.
                            </Typography>
                        )}
                        <ToggleButtonGroup
                            value={workflowMode}
                            exclusive
                            onChange={(_, val) => { if (val && !modeIsLocked) setWorkflowMode(val); }}
                            size="small"
                            fullWidth
                            disabled={modeIsLocked}
                            sx={{
                                '& .MuiToggleButton-root': {
                                    textTransform: 'none',
                                    fontSize: '0.78rem',
                                    py: 0.75,
                                    gap: 0.5,
                                    borderColor: 'divider',
                                    '&.Mui-selected': {
                                        bgcolor: isDark
                                            ? alpha(theme.palette.primary.main, 0.2)
                                            : alpha(theme.palette.primary.main, 0.1),
                                        color: 'primary.main',
                                        borderColor: 'primary.main',
                                        fontWeight: 600,
                                    },
                                    '&.Mui-selected.Mui-disabled': {
                                        bgcolor: isDark
                                            ? alpha(theme.palette.primary.main, 0.15)
                                            : alpha(theme.palette.primary.main, 0.08),
                                        color: isDark ? theme.palette.primary.light : theme.palette.primary.main,
                                        borderColor: alpha(theme.palette.primary.main, 0.6),
                                        opacity: 0.75,
                                    },
                                },
                            }}
                        >
                            <ToggleButton value="ONLY_REVIEW">
                                <RateReviewIcon sx={{ fontSize: 15 }} />
                                Review Only
                            </ToggleButton>
                            <ToggleButton value="REVIEW_AND_APPROVE">
                                <RateReviewIcon sx={{ fontSize: 15 }} />
                                <ThumbUpIcon sx={{ fontSize: 15 }} />
                                Review & Approve
                            </ToggleButton>
                            <ToggleButton value="ONLY_APPROVE">
                                <ThumbUpIcon sx={{ fontSize: 15 }} />
                                Approve Only
                            </ToggleButton>
                        </ToggleButtonGroup>
                    </Box>
                )}

                {/* ASSIGNED REVIEWERS (existing) */}
                {existingReviewers.length > 0 && (
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
                        <Box sx={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: 0.75, mb: 0.75 }}>
                            <Typography variant="subtitle2" fontWeight={600} sx={{ color: 'primary.main' }}>
                                Assigned Reviewers
                            </Typography>
                            {reviewWillBeSkipped && (
                                <Chip
                                    icon={<InfoOutlinedIcon />}
                                    label="Review skipped"
                                    size="small"
                                    color="info"
                                    sx={{ height: 18, fontSize: '0.62rem', fontWeight: 600, '& .MuiChip-icon': { fontSize: '11px !important' } }}
                                />
                            )}
                            {canChangeReviewers && (
                                <Chip
                                    label="Will be replaced"
                                    size="small"
                                    sx={{
                                        height: 18,
                                        fontSize: '0.62rem',
                                        fontWeight: 600,
                                        bgcolor: isDark ? alpha('#ef4444', 0.15) : '#fee2e2',
                                        color: isDark ? '#fca5a5' : '#991b1b',
                                        border: '1px solid',
                                        borderColor: isDark ? alpha('#ef4444', 0.3) : '#fecaca',
                                    }}
                                />
                            )}
                        </Box>

                        {/* Contextual notices */}
                        {reviewWillBeSkipped && (
                            <Alert
                                severity="info"
                                icon={<InfoOutlinedIcon fontSize="inherit" />}
                                sx={{ mb: 1, py: 0.5, '& .MuiAlert-message': { py: 0.25 } }}
                            >
                                <Typography variant="caption">
                                    Review was already completed. Contract will go directly to approval without repeating the review phase.
                                </Typography>
                            </Alert>
                        )}
                        {canChangeReviewers && (
                            <Alert severity="warning" sx={{ mb: 1, py: 0.5, '& .MuiAlert-message': { py: 0.25 } }}>
                                <Typography variant="caption">
                                    These reviewers will be fully replaced by your new selection below.
                                </Typography>
                            </Alert>
                        )}

                        {(() => {
                            const groups: { message: string | null; reviewers: typeof existingReviewers }[] = [];
                            existingReviewers.forEach((reviewer) => {
                                const message = reviewer.submissionMessage || null;
                                const existing = groups.find(g => g.message === message);
                                if (existing) existing.reviewers.push(reviewer);
                                else groups.push({ message, reviewers: [reviewer] });
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
                                                sx={{
                                                    bgcolor: reviewer.status === 'reviewed'
                                                        ? (isDark ? alpha('#22c55e', 0.15) : '#d1fae5')
                                                        : (isDark ? alpha('#f97316', 0.15) : '#fef3c7'),
                                                    color: reviewer.status === 'reviewed'
                                                        ? (isDark ? '#86efac' : '#065f46')
                                                        : (isDark ? '#fdba74' : '#92400e'),
                                                    '& .MuiChip-icon': {
                                                        color: reviewer.status === 'reviewed'
                                                            ? (isDark ? '#86efac' : '#065f46')
                                                            : (isDark ? '#fdba74' : '#92400e'),
                                                    },
                                                }}
                                            />
                                        ))}
                                    </Box>
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
                        })()}
                    </Paper>
                )}

                {/* REVIEWER INPUT — hidden when read-only, mode excludes review, or review phase skipped */}
                {!isReadOnly && showReviewerSection && !reviewWillBeSkipped && (
                    <Box>
                        <Typography variant="subtitle2" fontWeight={600} gutterBottom>
                            {canChangeReviewers
                                ? 'New Reviewers (replaces current list)'
                                : existingReviewers.length > 0 ? 'Add More Reviewers' : 'Reviewers'}
                        </Typography>
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
                                    sx={{ '& .MuiOutlinedInput-root': { bgcolor: 'background.paper' } }}
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
                                                '&:hover': { color: isDark ? '#ffffff' : '#004d40' },
                                            },
                                        }}
                                    />
                                ))
                            }
                            sx={{ mb: 1 }}
                        />
                        {selectedReviewers.length > 0 && (
                            <Typography variant="caption" color="text.secondary">
                                {selectedReviewers.length} reviewer{selectedReviewers.length > 1 ? 's' : ''} selected
                            </Typography>
                        )}
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
                                            '& fieldset': { borderColor: alpha(theme.palette.primary.main, 0.2) },
                                            '&:hover fieldset': { borderColor: alpha(theme.palette.primary.main, 0.4) },
                                            '&.Mui-focused fieldset': { borderColor: theme.palette.primary.main },
                                        },
                                    }}
                                />
                            </Box>
                        )}
                    </Box>
                )}

                {showApproverSection && <Divider />}

                {/* APPROVER SECTION */}
                {showApproverSection && (
                    <Box>
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 0.5 }}>
                            <Typography variant="subtitle2" fontWeight={600}>
                                Approver
                            </Typography>
                            {approverIsLocked && (
                                <Chip
                                    icon={<LockOutlinedIcon />}
                                    label="Cannot be changed"
                                    size="small"
                                    sx={lockedChipSx}
                                />
                            )}
                        </Box>

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
                                    sx={{
                                        bgcolor: existingApprover.status === 'approved'
                                            ? (isDark ? alpha('#3b82f6', 0.15) : '#dbeafe')
                                            : (isDark ? alpha('#f97316', 0.15) : '#fef3c7'),
                                        color: existingApprover.status === 'approved'
                                            ? (isDark ? '#93c5fd' : '#1e40af')
                                            : (isDark ? '#fdba74' : '#92400e'),
                                        '& .MuiChip-icon': {
                                            color: existingApprover.status === 'approved'
                                                ? (isDark ? '#93c5fd' : '#1e40af')
                                                : (isDark ? '#fdba74' : '#92400e'),
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
                                {approverIsLocked && (
                                    <Typography
                                        variant="caption"
                                        color="text.secondary"
                                        sx={{ display: 'flex', alignItems: 'center', gap: 0.5, mt: 0.75 }}
                                    >
                                        <LockOutlinedIcon sx={{ fontSize: 11 }} />
                                        Same approver will be notified again — cannot be changed on resubmission
                                    </Typography>
                                )}
                            </Box>
                        ) : isReadOnly || approverIsLocked ? (
                            <Typography variant="body2" color="text.secondary" sx={{ fontStyle: 'italic' }}>
                                No approver assigned
                            </Typography>
                        ) : (
                            <>
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
                                            sx={{ '& .MuiOutlinedInput-root': { bgcolor: 'background.paper' } }}
                                        />
                                    )}
                                />
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
                                                '& .MuiChip-icon': { color: isDark ? '#fdba74' : '#92400e' },
                                                '& .MuiChip-deleteIcon': {
                                                    color: isDark ? '#fdba74' : '#92400e',
                                                    '&:hover': { color: isDark ? '#fb923c' : '#78350f' },
                                                },
                                            }}
                                        />
                                    </Box>
                                )}
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
                                                    '& fieldset': { borderColor: alpha(theme.palette.primary.main, 0.2) },
                                                    '&:hover fieldset': { borderColor: alpha(theme.palette.primary.main, 0.4) },
                                                    '&.Mui-focused fieldset': { borderColor: theme.palette.primary.main },
                                                },
                                            }}
                                        />
                                    </Box>
                                )}
                            </>
                        )}
                    </Box>
                )}
            </Box>
        </BaseDialog>
    );
}
