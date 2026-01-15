'use client';

import { Box, Typography, Chip, IconButton, Tooltip, Button } from '@mui/material';
import { Visibility, CheckCircle, Edit } from '@mui/icons-material';
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
}

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
     * Get status color
     */
    const getStatusColor = () => {
        if (userRole === 'reviewer') {
            const myStatus = getMyReviewerStatus();
            if (myStatus === 'reviewed') return { bg: '#e0f2f1', color: '#00695c', border: '#80cbc4' };
            return { bg: '#fff3e0', color: '#e65100', border: '#ffb74d' };
        } else {
            if (allReviewersComplete()) return { bg: '#e8f5e9', color: '#2e7d32', border: '#81c784' };
            return { bg: '#fff9c4', color: '#f57f17', border: '#fff176' };
        }
    };

    const statusColors = getStatusColor();
    const myReviewerStatus = getMyReviewerStatus();

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
                            ? (myReviewerStatus === 'reviewed' ? 'REVIEWED' : 'PENDING REVIEW')
                            : (allReviewersComplete() ? 'READY FOR APPROVAL' : 'AWAITING REVIEWS')}
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
            <Box sx={{ p: 2 }}>
                {/* Title */}
                <Typography variant="h6" fontWeight={600} sx={{ mb: 1, fontSize: '1rem' }}>
                    {contract.title}
                </Typography>

                {/* Client */}
                <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
                    <strong>Client:</strong> {contract.client}
                </Typography>

                {/* Description */}
                <Typography
                    variant="caption"
                    color="text.secondary"
                    sx={{
                        display: '-webkit-box',
                        WebkitLineClamp: 2,
                        WebkitBoxOrient: 'vertical',
                        overflow: 'hidden',
                        mb: 2,
                    }}
                >
                    {contract.description}
                </Typography>

                {/* Review Progress (for approvers) */}
                {userRole === 'approver' && contract.reviewers && contract.reviewers.length > 0 && (
                    <Box sx={{ mb: 2, p: 1.5, bgcolor: '#f8fafc', borderRadius: 1 }}>
                        <Typography variant="caption" fontWeight={600} sx={{ display: 'block', mb: 1 }}>
                            Review Progress:
                        </Typography>
                        {contract.reviewers.map((reviewer, idx) => (
                            <Box key={idx} sx={{ display: 'flex', justifyContent: 'space between', mb: 0.5 }}>
                                <Typography variant="caption" sx={{ fontSize: '0.7rem' }}>
                                    {reviewer.email}
                                </Typography>
                                <Chip
                                    label={reviewer.status}
                                    size="small"
                                    sx={{
                                        ml: 1,
                                        height: '18px',
                                        fontSize: '0.65rem',
                                        bgcolor: reviewer.status === 'reviewed' ? '#e0f2f1' : '#fff3e0',
                                        color: reviewer.status === 'reviewed' ? '#00695c' : '#e65100',
                                    }}
                                />
                            </Box>
                        ))}
                    </Box>
                )}

                {/* Comment Input (when requesting modification) */}
                {showCommentInput && (
                    <Box sx={{ mb: 2 }}>
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
                                borderColor: 'primary.main',
                                color: 'primary.main',
                                '&:hover': {
                                    bgcolor: 'rgba(15, 118, 110, 0.08)',
                                },
                            }}
                        >
                            <Visibility sx={{ fontSize: 18 }} />
                        </IconButton>
                    </Tooltip>

                    {/* Reviewer Actions */}
                    {userRole === 'reviewer' && myReviewerStatus !== 'reviewed' && (
                        <Tooltip title="Mark as Reviewed" arrow>
                            <IconButton
                                size="small"
                                onClick={() => onMarkAsReviewed(contract.id)}
                                sx={{
                                    bgcolor: 'transparent',
                                    border: '1px solid',
                                    borderColor: '#2e7d32',
                                    color: '#2e7d32',
                                    '&:hover': {
                                        bgcolor: 'rgba(46, 125, 50, 0.08)',
                                    },
                                }}
                            >
                                <CheckCircle sx={{ fontSize: 18 }} />
                            </IconButton>
                        </Tooltip>
                    )}

                    {/* Approver Actions */}
                    {userRole === 'approver' && allReviewersComplete() && (
                        <Tooltip title="Approve Contract" arrow>
                            <IconButton
                                size="small"
                                onClick={() => onApprove(contract.id)}
                                sx={{
                                    bgcolor: 'transparent',
                                    border: '1px solid',
                                    borderColor: '#2e7d32',
                                    color: '#2e7d32',
                                    '&:hover': {
                                        bgcolor: 'rgba(46, 125, 50, 0.08)',
                                    },
                                }}
                            >
                                <CheckCircle sx={{ fontSize: 18 }} />
                            </IconButton>
                        </Tooltip>
                    )}

                    {/* Request Modification (both roles) */}
                    {!showCommentInput && (
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
                    )}
                </Box>
            </Box>
        </Box>
    );
}
