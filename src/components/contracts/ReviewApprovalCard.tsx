'use client';

import { Box, Typography, Chip, IconButton, Tooltip, Button, Popover, useTheme } from '@mui/material';
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
    const d = String(date.getDate()).padStart(2, '0');
    const m = String(date.getMonth() + 1).padStart(2, '0');
    const y = date.getFullYear();
    const h = String(date.getHours()).padStart(2, '0');
    const min = String(date.getMinutes()).padStart(2, '0');
    return `${d}/${m}/${y}, ${h}:${min}`;
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

    const theme = useTheme();
    const isDark = theme.palette.mode === 'dark';
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
        if (isDark) {
            if (userRole === 'reviewer') {
                const myStatus = getMyReviewerStatus();
                if (myStatus === 'rejected') return { bg: 'rgba(239,68,68,0.08)', color: '#b07070', border: 'rgba(239,68,68,0.22)' };
                if (myStatus === 'reviewed') return { bg: 'rgba(16,185,129,0.08)', color: '#6bac8e', border: 'rgba(16,185,129,0.22)' };
                return { bg: 'rgba(245,158,11,0.08)', color: '#b8935a', border: 'rgba(245,158,11,0.22)' };
            } else {
                if (isRejectedByApprover()) return { bg: 'rgba(239,68,68,0.08)', color: '#b07070', border: 'rgba(239,68,68,0.22)' };
                if (isApproved()) return { bg: 'rgba(16,185,129,0.08)', color: '#6bac8e', border: 'rgba(16,185,129,0.22)' };
                if (allReviewersComplete()) return { bg: 'rgba(16,185,129,0.08)', color: '#6bac8e', border: 'rgba(16,185,129,0.22)' };
                return { bg: 'rgba(59,130,246,0.08)', color: '#6888ac', border: 'rgba(59,130,246,0.22)' };
            }
        }
        if (userRole === 'reviewer') {
            const myStatus = getMyReviewerStatus();
            if (myStatus === 'rejected') return { bg: '#ffebee', color: '#c62828', border: '#ef9a9a' };
            if (myStatus === 'reviewed') return { bg: '#e0f2f1', color: '#00695c', border: '#80cbc4' };
            return { bg: '#fff3e0', color: '#e65100', border: '#ffb74d' };
        } else {
            if (isRejectedByApprover()) return { bg: '#ffebee', color: '#c62828', border: '#ef9a9a' };
            if (isApproved()) return { bg: '#ecfdf5', color: '#059669', border: '#a7f3d0' };
            if (allReviewersComplete()) return { bg: '#e8f5e9', color: '#2e7d32', border: '#81c784' };
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
        if (isDark) {
            if (userRole === 'reviewer') {
                if (myReviewerStatus === 'rejected') return { bg: 'rgba(239,68,68,0.07)', border: 'rgba(239,68,68,0.20)', icon: '#b07070' };
                if (myReviewerStatus === 'reviewed') return { bg: 'rgba(16,185,129,0.07)', border: 'rgba(16,185,129,0.20)', icon: '#6bac8e' };
                return { bg: 'rgba(245,158,11,0.07)', border: 'rgba(245,158,11,0.20)', icon: '#b8935a' };
            } else {
                if (isRejectedByApprover()) return { bg: 'rgba(239,68,68,0.07)', border: 'rgba(239,68,68,0.20)', icon: '#b07070' };
                if (isApproved()) return { bg: 'rgba(16,185,129,0.07)', border: 'rgba(16,185,129,0.20)', icon: '#6bac8e' };
                if (allReviewersComplete()) return { bg: 'rgba(16,185,129,0.07)', border: 'rgba(16,185,129,0.20)', icon: '#6bac8e' };
                return { bg: 'rgba(59,130,246,0.07)', border: 'rgba(59,130,246,0.20)', icon: '#6888ac' };
            }
        }
        if (userRole === 'reviewer') {
            if (myReviewerStatus === 'rejected') return { bg: '#ffebee', border: '#ef9a9a', icon: '#c62828' };
            if (myReviewerStatus === 'reviewed') return { bg: '#e0f2f1', border: '#80cbc4', icon: '#00695c' };
            return { bg: '#fff3e0', border: '#ffb74d', icon: '#e65100' };
        } else {
            if (isRejectedByApprover()) return { bg: '#ffebee', border: '#ef9a9a', icon: '#c62828' };
            if (isApproved()) return { bg: '#ecfdf5', border: '#a7f3d0', icon: '#059669' };
            if (allReviewersComplete()) return { bg: '#e8f5e9', border: '#81c784', icon: '#2e7d32' };
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
                borderColor: 'divider',
                borderRadius: 2.5,
                bgcolor: 'background.paper',
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
                                p: 0.5,
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
                            <Visibility sx={{ fontSize: '0.8rem' }} />
                        </IconButton>
                    </Tooltip>

                    {/* Review Progress (approvers only) */}
                    {userRole === 'approver' && contract.reviewers && contract.reviewers.length > 0 && (
                        <Tooltip
                            title={
                                <Box sx={{ p: 0.5 }}>
                                    <Typography variant="caption" fontWeight={600} sx={{ display: 'block', mb: 1 }}>Review Progress</Typography>
                                    <Box sx={{ maxHeight: 150, overflowY: 'auto', pr: 0.5, '&::-webkit-scrollbar': { width: '4px' }, '&::-webkit-scrollbar-track': { bgcolor: 'action.hover', borderRadius: '4px' }, '&::-webkit-scrollbar-thumb': { bgcolor: 'divider', borderRadius: '4px' } }}>
                                        {contract.reviewers.map((reviewer, idx) => (
                                            <Box key={idx} sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 0.5, gap: 2 }}>
                                                <Typography variant="caption" sx={{ fontSize: '0.7rem' }}>{reviewer.email}</Typography>
                                                <Chip
                                                    label={reviewer.status.charAt(0).toUpperCase() + reviewer.status.slice(1).replace('_', ' ')}
                                                    size="small"
                                                    sx={{ height: '18px', fontSize: '0.65rem', bgcolor: reviewer.status === 'reviewed' ? (isDark ? 'rgba(16,185,129,0.12)' : '#e0f2f1') : (isDark ? 'rgba(245,158,11,0.12)' : '#fff3e0'), color: reviewer.status === 'reviewed' ? (isDark ? '#6bac8e' : '#00695c') : (isDark ? '#b8935a' : '#e65100') }}
                                                />
                                            </Box>
                                        ))}
                                    </Box>
                                </Box>
                            }
                            arrow placement="top"
                            slotProps={{ tooltip: { sx: { bgcolor: 'background.paper', color: 'text.primary', boxShadow: '0 4px 20px rgba(0,0,0,0.15)', borderRadius: 2, p: 1.5, minWidth: 200, border: '1px solid', borderColor: 'divider', '& .MuiTooltip-arrow' : { color: 'background.paper' } } } }}
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
                                    <CheckCircle sx={{ fontSize: '0.8rem' }} />
                                </IconButton>
                            </Tooltip>
                            <Tooltip title="Reject Contract" arrow>
                                <IconButton size="small" onClick={() => { onReject(contract.id); setActionsAnchor(null); }} sx={{ border: '1px solid', borderColor: isDark ? '#b07070' : '#d32f2f', color: isDark ? '#b07070' : '#d32f2f', borderRadius: 1, '&:hover': { bgcolor: isDark ? 'rgba(239,68,68,0.08)' : 'rgba(211,47,47,0.08)' } }}>
                                    <Cancel sx={{ fontSize: '0.8rem' }} />
                                </IconButton>
                            </Tooltip>
                        </>
                    )}

                    {/* Approver Actions */}
                    {userRole === 'approver' && allReviewersComplete() && !isApproved() && !isRejectedByApprover() && (
                        <>
                            <Tooltip title="Approve Contract" arrow>
                                <IconButton size="small" onClick={() => { onApprove(contract.id); setActionsAnchor(null); }} sx={{ border: '1px solid', borderColor: statusColors.color, color: statusColors.color, borderRadius: 1, '&:hover': { bgcolor: statusColors.bg } }}>
                                    <CheckCircle sx={{ fontSize: '0.8rem' }} />
                                </IconButton>
                            </Tooltip>
                            <Tooltip title="Reject Contract" arrow>
                                <IconButton size="small" onClick={() => { onReject(contract.id); setActionsAnchor(null); }} sx={{ border: '1px solid', borderColor: isDark ? '#b07070' : '#d32f2f', color: isDark ? '#b07070' : '#d32f2f', borderRadius: 1, '&:hover': { bgcolor: isDark ? 'rgba(239,68,68,0.08)' : 'rgba(211,47,47,0.08)' } }}>
                                    <Cancel sx={{ fontSize: '0.8rem' }} />
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
                                border: `1px solid ${isDark ? 'rgba(255,255,255,0.18)' : 'rgba(0,0,0,0.23)'}`,
                                background: isDark ? 'rgba(255,255,255,0.04)' : '#fff',
                                color: isDark ? '#efefef' : 'inherit',
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
