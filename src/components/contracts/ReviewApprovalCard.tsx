'use client';

import { Box, Typography, Chip, IconButton, Tooltip, Button } from '@mui/material';
import { Visibility, CheckCircle, AccessTime, Person, Message, Groups, Cancel } from '@mui/icons-material';
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
            sx={{
                border: '1px solid',
                borderColor: 'rgba(0, 0, 0, 0.08)',
                borderRadius: 2.5,
                p: 0,
                bgcolor: 'white',
                transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
                overflow: 'hidden',
                boxShadow: '0 1px 3px rgba(0, 0, 0, 0.05)',
                '&:hover': {
                    boxShadow: '0 4px 12px rgba(0, 0, 0, 0.08)',
                    transform: 'translateY(-2px)',
                },
            }}
        >
            {/* Header with status */}
            <Box
                sx={{
                    p: 1.5,
                    bgcolor: statusColors.bg,
                    borderBottom: '1px solid',
                    borderColor: statusColors.border,
                }}
            >
                <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <Typography variant="caption" fontWeight={600} sx={{ color: statusColors.color }}>
                        {userRole === 'reviewer'
                            ? (myReviewerStatus === 'rejected' ? 'REJECTED' : (myReviewerStatus === 'reviewed' ? 'REVIEWED' : 'PENDING REVIEW'))
                            : (isRejectedByApprover() ? 'REJECTED' : (isApproved() ? 'APPROVED' : (allReviewersComplete() ? 'READY FOR APPROVAL' : 'AWAITING REVIEWS')))}
                    </Typography>
                    <Chip
                        label={contract.category}
                        size="small"
                        sx={{
                            bgcolor: 'white',
                            fontSize: '0.7rem',
                            height: '20px',
                        }}
                    />
                </Box>
            </Box>

            {/* Content */}
            <Box sx={{ p: 1 }}>
                {/* Title */}
                <Typography variant="h6" fontWeight={600} sx={{ mb: 1, fontSize: '1rem' }}>
                    {contract.title}
                </Typography>

                {/* Client */}
                <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
                    <strong>Client:</strong> {contract.client}
                </Typography>

                {/* Sender Info Section */}
                <Box
                    sx={{
                        mb: 2,
                        p: 1.5,
                        bgcolor: senderInfoColors.bg,
                        borderRadius: 1.5,
                        border: '1px solid',
                        borderColor: senderInfoColors.border,
                    }}
                >
                    {/* Sender Email */}
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75, mb: 0.75 }}>
                        <Person sx={{ fontSize: 14, color: senderInfoColors.icon }} />
                        <Typography variant="caption" sx={{ fontWeight: 500 }}>
                            From: {senderInfo.sentBy || 'Unknown'}
                        </Typography>
                    </Box>

                    {/* Sent Time */}
                    {senderInfo.sentAt && (
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75, mb: 0.75 }}>
                            <AccessTime sx={{ fontSize: 14, color: senderInfoColors.icon }} />
                            <Typography variant="caption" color="text.secondary">
                                {formatDateTime(senderInfo.sentAt)}
                            </Typography>
                        </Box>
                    )}

                    {/* Message */}
                    {senderInfo.message && (
                        <Box sx={{ display: 'flex', alignItems: 'flex-start', gap: 0.75, mt: 1 }}>
                            <Message sx={{ fontSize: 14, color: senderInfoColors.icon, mt: 0.25 }} />
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
                                "{senderInfo.message}"
                            </Typography>
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

                {/* Action Buttons */}
                <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap' }}>
                    {/* View Button */}
                    <Tooltip title="View Contract" arrow>
                        <IconButton
                            size="small"
                            onClick={() => onView(contract.id)}
                            sx={{
                                bgcolor: 'transparent',
                                border: '1px solid',
                                borderColor: statusColors.color,
                                color: statusColors.color,
                                '&:hover': {
                                    bgcolor: statusColors.bg,
                                },
                            }}
                        >
                            <Visibility sx={{ fontSize: 18 }} />
                        </IconButton>
                    </Tooltip>

                    {/* Review Progress Button (for approvers) */}
                    {userRole === 'approver' && contract.reviewers && contract.reviewers.length > 0 && (
                        <Tooltip
                            title={
                                <Box sx={{ p: 0.5 }}>
                                    <Typography variant="caption" fontWeight={600} sx={{ display: 'block', mb: 1 }}>
                                        Review Progress
                                    </Typography>
                                    <Box
                                        sx={{
                                            maxHeight: 150,
                                            overflowY: 'auto',
                                            pr: 0.5,
                                            '&::-webkit-scrollbar': {
                                                width: '4px',
                                            },
                                            '&::-webkit-scrollbar-track': {
                                                bgcolor: '#f1f1f1',
                                                borderRadius: '4px',
                                            },
                                            '&::-webkit-scrollbar-thumb': {
                                                bgcolor: '#c1c1c1',
                                                borderRadius: '4px',
                                            },
                                        }}
                                    >
                                        {contract.reviewers.map((reviewer, idx) => (
                                            <Box key={idx} sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 0.5, gap: 2 }}>
                                                <Typography variant="caption" sx={{ fontSize: '0.7rem' }}>
                                                    {reviewer.email}
                                                </Typography>
                                                <Chip
                                                    label={reviewer.status.charAt(0).toUpperCase() + reviewer.status.slice(1).replace('_', ' ')}
                                                    size="small"
                                                    sx={{
                                                        height: '18px',
                                                        fontSize: '0.65rem',
                                                        bgcolor: reviewer.status === 'reviewed' ? '#e0f2f1' : '#fff3e0',
                                                        color: reviewer.status === 'reviewed' ? '#00695c' : '#e65100',
                                                    }}
                                                />
                                            </Box>
                                        ))}
                                    </Box>
                                </Box>
                            }
                            arrow
                            placement="top"
                            slotProps={{
                                tooltip: {
                                    sx: {
                                        bgcolor: 'white',
                                        color: 'text.primary',
                                        boxShadow: '0 4px 20px rgba(0,0,0,0.15)',
                                        borderRadius: 2,
                                        p: 1.5,
                                        minWidth: 200,
                                        '& .MuiTooltip-arrow': {
                                            color: 'white',
                                        },
                                    },
                                },
                            }}
                        >
                            <IconButton
                                size="small"
                                sx={{
                                    bgcolor: 'transparent',
                                    border: '1px solid',
                                    borderColor: statusColors.color,
                                    color: statusColors.color,
                                    '&:hover': {
                                        bgcolor: statusColors.bg,
                                    },
                                }}
                            >
                                <Groups sx={{ fontSize: 18 }} />
                            </IconButton>
                        </Tooltip>
                    )}

                    {/* Reviewer Actions */}
                    {userRole === 'reviewer' && myReviewerStatus !== 'reviewed' && myReviewerStatus !== 'rejected' && (
                        <>
                            <Tooltip title="Mark as Reviewed" arrow>
                                <IconButton
                                    size="small"
                                    onClick={() => onMarkAsReviewed(contract.id)}
                                    sx={{
                                        bgcolor: 'transparent',
                                        border: '1px solid',
                                        borderColor: statusColors.color,
                                        color: statusColors.color,
                                        '&:hover': {
                                            bgcolor: statusColors.bg,
                                        },
                                    }}
                                >
                                    <CheckCircle sx={{ fontSize: 18 }} />
                                </IconButton>
                            </Tooltip>
                            <Tooltip title="Reject Contract" arrow>
                                <IconButton
                                    size="small"
                                    onClick={() => onReject(contract.id)}
                                    sx={{
                                        bgcolor: 'transparent',
                                        border: '1px solid',
                                        borderColor: '#d32f2f',
                                        color: '#d32f2f',
                                        '&:hover': {
                                            bgcolor: 'rgba(211, 47, 47, 0.08)',
                                        },
                                    }}
                                >
                                    <Cancel sx={{ fontSize: 18 }} />
                                </IconButton>
                            </Tooltip>
                        </>
                    )}

                    {/* Approver Actions */}
                    {userRole === 'approver' && allReviewersComplete() && !isApproved() && !isRejectedByApprover() && (
                        <>
                            <Tooltip title="Approve Contract" arrow>
                                <IconButton
                                    size="small"
                                    onClick={() => onApprove(contract.id)}
                                    sx={{
                                        bgcolor: 'transparent',
                                        border: '1px solid',
                                        borderColor: statusColors.color,
                                        color: statusColors.color,
                                        '&:hover': {
                                            bgcolor: statusColors.bg,
                                        },
                                    }}
                                >
                                    <CheckCircle sx={{ fontSize: 18 }} />
                                </IconButton>
                            </Tooltip>
                            <Tooltip title="Reject Contract" arrow>
                                <IconButton
                                    size="small"
                                    onClick={() => onReject(contract.id)}
                                    sx={{
                                        bgcolor: 'transparent',
                                        border: '1px solid',
                                        borderColor: '#d32f2f',
                                        color: '#d32f2f',
                                        '&:hover': {
                                            bgcolor: 'rgba(211, 47, 47, 0.08)',
                                        },
                                    }}
                                >
                                    <Cancel sx={{ fontSize: 18 }} />
                                </IconButton>
                            </Tooltip>
                        </>
                    )}

                    {/* Request Modification (both roles) */}
                    {/* {!showCommentInput && (
                        <Tooltip title="Request Modification" arrow>
                            <IconButton
                                size="small"
                                onClick={() => setShowCommentInput(true)}
                                sx={{
                                    bgcolor: 'transparent',
                                    border: '1px solid',
                                    borderColor: '#d32f2f',
                                    color: '#d32f2f',
                                    '&:hover': {
                                        bgcolor: 'rgba(211, 47, 47, 0.08)',
                                    },
                                }}
                            >
                                <Edit sx={{ fontSize: 18 }} />
                            </IconButton>
                        </Tooltip>
                    )} */}
                </Box>
            </Box>
        </Box>
    );
}
