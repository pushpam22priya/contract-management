'use client';

import { Box, Typography, Chip, IconButton, Tooltip, Button, Popover } from '@mui/material';
import { Visibility, CheckCircle, AccessTime, Person, AccountCircle, Message, Groups, Cancel, MoreVert } from '@mui/icons-material';
import { Contract } from '@/types/contract';
import { useState } from 'react';
import { authService } from '@/services/authService';

interface ReviewApprovalCardProps {
    contract: Contract;
    userRole: 'reviewer' | 'approver';
    onView: (id: string) => void;
    onMarkAsReviewed: (id: string) => void;
    onApprove: (id: string) => void;
    onRequestModification: (id: string, comments: string) => void;
    onReject: (id: string) => void;
}

const truncate = (text: string | undefined, maxLen: number) => {
    if (!text) return '';
    return text.length > maxLen ? text.slice(0, maxLen) + '…' : text;
};

/**
 * Format a date string to a readable format
 */
const formatDateTime = (dateString?: string): string => {
    if (!dateString) return '';
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', {
        month: 'short',
        day: 'numeric',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
    });
};

/**
 * Card component for Review & Approval page
 * Displays contract information with action buttons based on user role
 */
export default function ReviewApprovalCard({
    contract,
    userRole,
    onView,
    onMarkAsReviewed,
    onApprove,
    onRequestModification,
    onReject,
}: ReviewApprovalCardProps) {
    const [showCommentInput, setShowCommentInput] = useState(false);
    const [comments, setComments] = useState('');
    const [actionsAnchor, setActionsAnchor] = useState<HTMLElement | null>(null);

    const currentUser = authService.getCurrentUser();

    /**
     * Get reviewer status for current user
     */
    const getMyReviewerStatus = () => {
        if (!currentUser || !contract.reviewers) return null;
        const myReview = contract.reviewers.find(r => r.email === currentUser.email);
        return myReview?.status || null;
    };

    /**
     * Check if all reviewers have reviewed
     */
    const allReviewersComplete = () => {
        if (!contract.reviewers || contract.reviewers.length === 0) return true;
        return contract.reviewers.every(r => r.status === 'reviewed');
    };

    /**
     * Check if contract is approved
     */
    const isApproved = () => {
        return contract.approver?.status === 'approved';
    };

    /**
     * Check if contract is rejected by reviewer
     */
    const isRejectedByReviewer = () => {
        const myStatus = getMyReviewerStatus();
        return myStatus === 'rejected';
    };

    /**
     * Check if contract is rejected by approver
     */
    const isRejectedByApprover = () => {
        return contract.approver?.status === 'rejected';
    };

    /**
     * Get status color - distinct colors for different states
     * Reviewer pending: Orange (action needed)
     * Reviewer reviewed: Teal green (completed)
     * Reviewer rejected: Red (rejected)
     * Approver awaiting: Blue/Indigo (waiting for others)
     * Approver ready: Light green (action needed)
     * Approver approved: Emerald green (completed)
     * Approver rejected: Red (rejected)
     */
    const getStatusColor = () => {
        if (userRole === 'reviewer') {
            const myStatus = getMyReviewerStatus();
            // Red for rejected
            if (myStatus === 'rejected') return { bg: '#ffebee', color: '#c62828', border: '#ef9a9a' };
            // Teal green for reviewed
            if (myStatus === 'reviewed') return { bg: '#e0f2f1', color: '#00695c', border: '#80cbc4' };
            // Orange for pending
            return { bg: '#fff3e0', color: '#e65100', border: '#ffb74d' };
        } else {
            // Red for rejected
            if (isRejectedByApprover()) return { bg: '#ffebee', color: '#c62828', border: '#ef9a9a' };
            // Emerald green for approved
            if (isApproved()) return { bg: '#ecfdf5', color: '#059669', border: '#a7f3d0' };
            // Light green for ready to approve
            if (allReviewersComplete()) return { bg: '#e8f5e9', color: '#2e7d32', border: '#81c784' };
            // Blue for awaiting reviews
            return { bg: '#e8eaf6', color: '#3949ab', border: '#9fa8da' };
        }
    };

    /**
     * Get sender info and message for current user
     * Falls back to contract.createdAt if sentAt is not available
     */
    const getSenderInfo = () => {
        if (userRole === 'reviewer' && contract.reviewers) {
            const myReview = contract.reviewers.find(r => r.email === currentUser?.email);
            return {
                sentBy: myReview?.sentBy || contract.createdBy,
                sentAt: myReview?.sentAt || contract.createdAt,
                message: myReview?.submissionMessage
            };
        } else if (userRole === 'approver' && contract.approver) {
            return {
                sentBy: contract.approver.sentBy || contract.createdBy,
                sentAt: contract.approver.sentAt || contract.createdAt,
                message: contract.approver.submissionMessage
            };
        }
        return { sentBy: contract.createdBy, sentAt: contract.createdAt, message: undefined };
    };

    const senderInfo = getSenderInfo();

    const statusColors = getStatusColor();
    const myReviewerStatus = getMyReviewerStatus();

    /**
     * Get sender info section colors based on completion status
     * Colors match the header for consistency
     */
    const getSenderInfoColors = () => {
        if (userRole === 'reviewer') {
            if (myReviewerStatus === 'rejected') {
                // Red for rejected (matches header)
                return { bg: '#ffebee', border: '#ef9a9a', icon: '#c62828' };
            }
            if (myReviewerStatus === 'reviewed') {
                // Teal green for reviewed (matches header)
                return { bg: '#e0f2f1', border: '#80cbc4', icon: '#00695c' };
            }
            // Orange for pending review (matches header)
            return { bg: '#fff3e0', border: '#ffb74d', icon: '#e65100' };
        } else {
            // Approver
            if (isRejectedByApprover()) {
                // Red for rejected (matches header)
                return { bg: '#ffebee', border: '#ef9a9a', icon: '#c62828' };
            }
            if (isApproved()) {
                // Emerald green for approved (matches header)
                return { bg: '#ecfdf5', border: '#a7f3d0', icon: '#059669' };
            }
            if (allReviewersComplete()) {
                // Light green for ready to approve (matches header)
                return { bg: '#e8f5e9', border: '#81c784', icon: '#2e7d32' };
            }
            // Blue for awaiting reviews (matches header)
            return { bg: '#e8eaf6', border: '#9fa8da', icon: '#3949ab' };
        }
    };

    const senderInfoColors = getSenderInfoColors();

    /**
     * Handle request modification
     */
    const handleRequestModification = () => {
        if (!comments.trim()) {
            alert('Please enter comments before requesting modifications');
            return;
        }
        onRequestModification(contract.id, comments);
        setComments('');
        setShowCommentInput(false);
    };

    return (
        <Box
            onClick={() => onView(contract.id)}
            sx={{
                border: '1px solid',
                borderColor: 'rgba(0, 0, 0, 0.08)',
                borderRadius: 2.5,
                bgcolor: 'white',
                transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
                overflow: 'hidden',
                boxShadow: '0 1px 3px rgba(0, 0, 0, 0.05)',
                cursor: 'pointer',
                '&:hover': {
                    boxShadow: '0 4px 12px rgba(0, 0, 0, 0.08)',
                    transform: 'translateY(-2px)',
                },
            }}
        >
            {/* Content */}
            <Box sx={{ p: 1 }}>
                {/* Title + Status Chip + Actions Toggle */}
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 0.25 }}>
                    <Tooltip title={contract.title?.length > 22 ? contract.title : ''} arrow placement="top">
                        <Typography variant="h6" fontWeight={600} sx={{ fontSize: '0.95rem', flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            {truncate(contract.title, 22)}
                        </Typography>
                    </Tooltip>
                    <Chip
                        label={userRole === 'reviewer'
                            ? (myReviewerStatus === 'rejected' ? 'Rejected' : (myReviewerStatus === 'reviewed' ? 'Reviewed' : 'Pending Review'))
                            : (isRejectedByApprover() ? 'Rejected' : (isApproved() ? 'Approved' : (allReviewersComplete() ? 'Ready' : 'Awaiting Reviews')))}
                        size="small"
                        sx={{
                            bgcolor: statusColors.bg,
                            color: statusColors.color,
                            border: `1px solid ${statusColors.border}`,
                            fontWeight: 600,
                            fontSize: '0.68rem',
                            height: 20,
                            flexShrink: 0,
                            '& .MuiChip-label': { px: 1 },
                        }}
                    />
                    <IconButton
                        size="small"
                        onClick={(e) => { e.stopPropagation(); setActionsAnchor(e.currentTarget); }}
                        sx={{ flexShrink: 0, p: 0.25, color: 'text.secondary', '&:hover': { color: 'text.primary' } }}
                    >
                        <MoreVert sx={{ fontSize: 18 }} />
                    </IconButton>
                </Box>

                {/* Floating Actions Popover */}
                <Popover
                    open={Boolean(actionsAnchor)}
                    anchorEl={actionsAnchor}
                    onClose={() => setActionsAnchor(null)}
                    onClick={(e) => e.stopPropagation()}
                    anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
                    transformOrigin={{ vertical: 'top', horizontal: 'right' }}
                    slotProps={{
                        paper: {
                            sx: {
                                p: 0.8,
                                borderRadius: 2,
                                boxShadow: '0 4px 16px rgba(0,0,0,0.12)',
                                display: 'flex',
                                gap: 1,
                            },
                        },
                    }}
                >
                    {/* View Button */}
                    <Tooltip title="View Contract" arrow>
                        <IconButton
                            size="small"
                            onClick={() => { onView(contract.id); setActionsAnchor(null); }}
                            sx={{ border: '1px solid', borderColor: statusColors.color, color: statusColors.color, borderRadius: 1, '&:hover': { bgcolor: statusColors.bg } }}
                        >
                            <Visibility sx={{ fontSize: 18 }} />
                        </IconButton>
                    </Tooltip>

                    {/* Review Progress (approvers only) */}
                    {userRole === 'approver' && contract.reviewers && contract.reviewers.length > 0 && (
                        <Tooltip
                            title={
                                <Box sx={{ p: 0.5 }}>
                                    <Typography variant="caption" fontWeight={600} sx={{ display: 'block', mb: 1 }}>Review Progress</Typography>
                                    <Box sx={{ maxHeight: 150, overflowY: 'auto', pr: 0.5, '&::-webkit-scrollbar': { width: '4px' }, '&::-webkit-scrollbar-track': { bgcolor: '#f1f1f1', borderRadius: '4px' }, '&::-webkit-scrollbar-thumb': { bgcolor: '#c1c1c1', borderRadius: '4px' } }}>
                                        {contract.reviewers.map((reviewer, idx) => (
                                            <Box key={idx} sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 0.5, gap: 2 }}>
                                                <Typography variant="caption" sx={{ fontSize: '0.7rem' }}>{reviewer.email}</Typography>
                                                <Chip
                                                    label={reviewer.status.charAt(0).toUpperCase() + reviewer.status.slice(1).replace('_', ' ')}
                                                    size="small"
                                                    sx={{ height: '18px', fontSize: '0.65rem', bgcolor: reviewer.status === 'reviewed' ? '#e0f2f1' : '#fff3e0', color: reviewer.status === 'reviewed' ? '#00695c' : '#e65100' }}
                                                />
                                            </Box>
                                        ))}
                                    </Box>
                                </Box>
                            }
                            arrow placement="top"
                            slotProps={{ tooltip: { sx: { bgcolor: 'white', color: 'text.primary', boxShadow: '0 4px 20px rgba(0,0,0,0.15)', borderRadius: 2, p: 1.5, minWidth: 200, '& .MuiTooltip-arrow': { color: 'white' } } } }}
                        >
                            <IconButton size="small" sx={{ border: '1px solid', borderColor: statusColors.color, color: statusColors.color, borderRadius: 1, '&:hover': { bgcolor: statusColors.bg } }}>
                                <Groups sx={{ fontSize: 18 }} />
                            </IconButton>
                        </Tooltip>
                    )}

                    {/* Reviewer Actions */}
                    {userRole === 'reviewer' && myReviewerStatus !== 'reviewed' && myReviewerStatus !== 'rejected' && (
                        <>
                            <Tooltip title="Mark as Reviewed" arrow>
                                <IconButton size="small" onClick={() => { onMarkAsReviewed(contract.id); setActionsAnchor(null); }} sx={{ border: '1px solid', borderColor: statusColors.color, color: statusColors.color, borderRadius: 1, '&:hover': { bgcolor: statusColors.bg } }}>
                                    <CheckCircle sx={{ fontSize: 18 }} />
                                </IconButton>
                            </Tooltip>
                            <Tooltip title="Reject Contract" arrow>
                                <IconButton size="small" onClick={() => { onReject(contract.id); setActionsAnchor(null); }} sx={{ border: '1px solid', borderColor: '#d32f2f', color: '#d32f2f', borderRadius: 1, '&:hover': { bgcolor: 'rgba(211,47,47,0.08)' } }}>
                                    <Cancel sx={{ fontSize: 18 }} />
                                </IconButton>
                            </Tooltip>
                        </>
                    )}

                    {/* Approver Actions */}
                    {userRole === 'approver' && allReviewersComplete() && !isApproved() && !isRejectedByApprover() && (
                        <>
                            <Tooltip title="Approve Contract" arrow>
                                <IconButton size="small" onClick={() => { onApprove(contract.id); setActionsAnchor(null); }} sx={{ border: '1px solid', borderColor: statusColors.color, color: statusColors.color, borderRadius: 1, '&:hover': { bgcolor: statusColors.bg } }}>
                                    <CheckCircle sx={{ fontSize: 18 }} />
                                </IconButton>
                            </Tooltip>
                            <Tooltip title="Reject Contract" arrow>
                                <IconButton size="small" onClick={() => { onReject(contract.id); setActionsAnchor(null); }} sx={{ border: '1px solid', borderColor: '#d32f2f', color: '#d32f2f', borderRadius: 1, '&:hover': { bgcolor: 'rgba(211,47,47,0.08)' } }}>
                                    <Cancel sx={{ fontSize: 18 }} />
                                </IconButton>
                            </Tooltip>
                        </>
                    )}
                </Popover>

                {/* Sender Info Section */}
                <Box
                    sx={{
                        mt: 0.75,
                        mb: 1,
                        p: 1,
                        bgcolor: senderInfoColors.bg,
                        borderRadius: 1.5,
                        border: '1px solid',
                        borderColor: senderInfoColors.border,
                    }}
                >
                    {/* Client */}
                    {contract.client && (
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75 }}>
                            <AccountCircle sx={{ fontSize: 14, color: senderInfoColors.icon }} />
                            <Tooltip title={contract.client.length > 22 ? contract.client : ''} arrow>
                                <Typography variant="caption" sx={{ fontWeight: 500 }}>
                                    Client: {truncate(contract.client, 22)}
                                </Typography>
                            </Tooltip>
                        </Box>
                    )}

                    {/* Sender Email */}
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75 }}>
                        <Person sx={{ fontSize: 14, color: senderInfoColors.icon }} />
                        <Tooltip title={(senderInfo.sentBy?.length ?? 0) > 25 ? senderInfo.sentBy : ''} arrow>
                            <Typography variant="caption" sx={{ fontWeight: 500 }}>
                                From: {truncate(senderInfo.sentBy, 25) || 'Unknown'}
                            </Typography>
                        </Tooltip>
                    </Box>

                    {/* Sent Time */}
                    {senderInfo.sentAt && (
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75 }}>
                            <AccessTime sx={{ fontSize: 14, color: senderInfoColors.icon }} />
                            <Typography variant="caption" color="text.secondary">
                                {formatDateTime(senderInfo.sentAt)}
                            </Typography>
                        </Box>
                    )}

                    {/* Message */}
                    {senderInfo.message && (
                        <Box sx={{ display: 'flex', alignItems: 'flex-start', gap: 0.75 }}>
                            <Message sx={{ fontSize: 14, color: senderInfoColors.icon, mt: 0.25 }} />
                            <Tooltip title={senderInfo.message.length > 60 ? senderInfo.message : ''} arrow placement="top">
                                <Typography
                                    variant="caption"
                                    sx={{
                                        fontStyle: 'italic',
                                        color: 'text.secondary',
                                        display: '-webkit-box',
                                        WebkitLineClamp: 2,
                                        WebkitBoxOrient: 'vertical',
                                        overflow: 'hidden',
                                    }}
                                >
                                    "{truncate(senderInfo.message, 60)}"
                                </Typography>
                            </Tooltip>
                        </Box>
                    )}
                </Box>


                {/* Comment Input (when requesting modification) */}
                {showCommentInput && (
                    <Box sx={{ mb: 0}}>
                        <textarea
                            placeholder="Enter your comments..."
                            value={comments}
                            onChange={(e) => setComments(e.target.value)}
                            style={{
                                width: '100%',
                                minHeight: '80px',
                                padding: '8px',
                                borderRadius: '4px',
                                border: '1px solid rgba(0, 0, 0, 0.23)',
                                fontFamily: 'inherit',
                                fontSize: '0.875rem',
                            }}
                        />
                        <Box sx={{ display: 'flex', gap: 1, mt: 1 }}>
                            <Button
                                size="small"
                                variant="contained"
                                onClick={handleRequestModification}
                                sx={{ textTransform: 'none' }}
                            >
                                Submit
                            </Button>
                            <Button
                                size="small"
                                onClick={() => {
                                    setShowCommentInput(false);
                                    setComments('');
                                }}
                                sx={{ textTransform: 'none' }}
                            >
                                Cancel
                            </Button>
                        </Box>
                    </Box>
                )}

            </Box>
        </Box>
    );
}
