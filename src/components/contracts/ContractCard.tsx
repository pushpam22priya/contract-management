import { Box, Typography, Chip, IconButton, Tooltip } from '@mui/material';
import dayjs from 'dayjs';
import { Visibility, Share, Download, FolderOutlined, AutorenewOutlined, Loop } from '@mui/icons-material';
import { Contract, ContractStatus } from '@/types/contract';

/**
 * Unified ContractCard component that handles both draft and contract views.
 * Use `variant="draft"` for draft contracts and `variant="contract"` (default) for active contracts.
 */

interface ContractCardProps {
    contract: Contract;
    onView?: (id: string) => void;
    onShare?: (id: string) => void;
    onDownload?: (id: string) => void;
    onRenew?: (id: string) => void;
    /**
     * Variant determines the card behavior:
     * - 'draft': Shows share button always (for review submission), handles "changes_requested" status
     * - 'contract': Shows share button only for APPROVED/WAITING_FOR_SIGNATURE (for signature requests)
     */
    variant?: 'draft' | 'contract';
    /** Team name to display on draft cards */
    teamName?: string;
}

const ContractCard = ({
    contract,
    onView,
    onShare,
    onDownload,
    onRenew,
    variant = 'contract',
    teamName,
}: ContractCardProps) => {
    /**
     * For multi-party sequential signing, returns the position of the current
     * active order (1-based) and the total number of orders, or null when:
     *  - there are no multi-party signers
     *  - only one unique order exists (no ordering UX needed)
     *  - currentSigningOrder is absent or not in the orders list
     */
    const getMultiPartySigningProgress = (): { orderIndex: number; totalOrders: number } | null => {
        const allSigners = [
            ...(contract.internalSigners || []),
            ...(contract.externalSigners || []),
        ];
        if (allSigners.length === 0 || !contract.currentSigningOrder) return null;

        const uniqueOrders = [...new Set(allSigners.map(s => s.order))].sort((a, b) => a - b);
        if (uniqueOrders.length <= 1) return null;

        const orderIndex = uniqueOrders.indexOf(contract.currentSigningOrder);
        if (orderIndex === -1) return null;

        return { orderIndex, totalOrders: uniqueOrders.length };
    };

    /**
     * Format status for display
     */
    const getStatusLabel = (status: Contract['status']): string => {
        // Handle special case for draft variant with changes_requested
        if (variant === 'draft' && status === ContractStatus.DRAFT && contract.reviewStatus === 'changes_requested') {
            return 'Returned for Modification';
        }

        switch (status) {
            case ContractStatus.ACTIVE:
                return 'Active';
            case ContractStatus.EXPIRING:
                return 'Expiring';
            case ContractStatus.EXPIRED:
                return 'Expired';
            case ContractStatus.IN_REVIEW:
                return 'Under Review';
            case ContractStatus.IN_APPROVAL:
                return 'Under Approval';
            case ContractStatus.REVIEW_APPROVAL:
                return 'Review and Approval';
            case ContractStatus.REVIEWED:
                return 'Reviewed';
            case ContractStatus.APPROVED:
                return 'Approved';
            case ContractStatus.READY_FOR_SIGNATURE:
                return 'Ready for Signature';
            case ContractStatus.WAITING_FOR_SIGNATURE: {
                const progress = getMultiPartySigningProgress();
                if (progress) {
                    return `Order ${progress.orderIndex + 1}/${progress.totalOrders} Signing`;
                }
                return 'Waiting for Signature';
            }
            case ContractStatus.SIGNED_BY_EVERYONE:
                return 'Signed by Assigned Parties';
            case ContractStatus.DRAFT:
                return 'Draft';
            case ContractStatus.SIGNED:
                return 'Signed';
            case ContractStatus.REJECTED_BY_REVIEWER:
                return 'Rejected by Reviewer';
            case ContractStatus.REJECTED_BY_APPROVER:
                return 'Rejected by Approver';
            default:
                return status;
        }
    };

    const getStatusColor = (status: Contract['status']) => {
        // Handle special case for draft variant with changes_requested
        if (variant === 'draft' && status === ContractStatus.DRAFT && contract.reviewStatus === 'changes_requested') {
            return { bg: '#fff7ed', color: '#c2410c', border: '#fdba74' };
        }

        switch (status) {
            case ContractStatus.ACTIVE:
            case ContractStatus.SIGNED:
                return { bg: '#dcfce7', color: '#166534', border: '#86efac' };
            case ContractStatus.EXPIRING:
                return { bg: '#fef3c7', color: '#92400e', border: '#fcd34d' };
            case ContractStatus.EXPIRED:
            case ContractStatus.REJECTED:
            case ContractStatus.REJECTED_BY_REVIEWER:
            case ContractStatus.REJECTED_BY_APPROVER:
                return { bg: '#fee2e2', color: '#991b1b', border: '#fca5a5' };
            case ContractStatus.IN_REVIEW:
                return { bg: '#ede9fe', color: '#5b21b6', border: '#c4b5fd' };
            case ContractStatus.IN_APPROVAL:
                return { bg: '#fef9c3', color: '#92400e', border: '#fde68a' };
            case ContractStatus.REVIEW_APPROVAL:
            case ContractStatus.REVIEWED:
                return { bg: '#dbeafe', color: '#1e40af', border: '#93c5fd' };
            case ContractStatus.APPROVED:
                return { bg: '#d1fae5', color: '#065f46', border: '#34d399' };
            case ContractStatus.READY_FOR_SIGNATURE:
                // Teal/Cyan theme to differentiate from plain green approved
                return { bg: '#e0f2f1', color: '#00695c', border: '#4db6ac' };
            case ContractStatus.WAITING_FOR_SIGNATURE: {
                const progress = getMultiPartySigningProgress();
                if (progress && progress.orderIndex > 0) {
                    // Later orders: blue-teal to show signing is progressing
                    return { bg: '#e0f7fa', color: '#00695c', border: '#80cbc4' };
                }
                return { bg: '#fff9c4', color: '#f57f17', border: '#fff176' };
            }
            case ContractStatus.SIGNED_BY_EVERYONE:
                return { bg: '#e3f2fd', color: '#1565c0', border: '#90caf9' };
            case ContractStatus.DRAFT:
            default:
                return { bg: '#f3f4f6', color: '#374151', border: '#d1d5db' };
        }
    };

    const getExpiryDisplay = () => {
        if (contract.endDate) {
            return dayjs(contract.endDate).format('DD MMM YYYY');
        }
        // Fallback to calculating from expiresInDays if endDate is missing
        return dayjs().add(contract.expiresInDays, 'day').format('DD MMM YYYY');
    };

    const truncateText = (text: string, maxLength: number) => {
        if (text.length <= maxLength) return text;
        return `${text.substring(0, maxLength)}...`;
    };

    /**
     * Determine if share button should be visible based on variant
     */
    const shouldShowShareButton = (): boolean => {
        if (!onShare) return false;

        if (variant === 'draft') {
            // Draft variant: always show share button (for review submission)
            return true;
        }

        // Contract variant: only show for APPROVED, READY_FOR_SIGNATURE, or WAITING_FOR_SIGNATURE
        return contract.status === ContractStatus.APPROVED ||
            contract.status === ContractStatus.READY_FOR_SIGNATURE ||
            contract.status === ContractStatus.WAITING_FOR_SIGNATURE ||
            contract.status === ContractStatus.SIGNED_BY_EVERYONE;
    };

    /**
     * Get tooltip text for share button based on variant
     */
    const getShareTooltip = (): string => {
        return variant === 'draft'
            ? 'Submit for review or approval'
            : 'Submit for signature';
    };

    const statusColors = getStatusColor(contract.status);

    return (
        <Box
            sx={{
                bgcolor: 'background.paper',
                borderRadius: 3,
                p: 1,
                border: '1px solid',
                borderColor: 'rgba(0, 0, 0, 0.08)',
                boxShadow: '0 2px 8px rgba(0, 0, 0, 0.04)',
                transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
                position: 'relative',
                overflow: 'hidden',
                '&:hover': {
                    boxShadow: '0 12px 24px rgba(0,0,0,0.1)',
                    transform: 'translateY(-4px)',
                    borderColor: statusColors.border,
                    '& .action-buttons': {
                        opacity: 1,
                    },
                },
                '&::before': {
                    content: '""',
                    position: 'absolute',
                    top: 0,
                    left: 0,
                    right: 0,
                    height: '4px',
                    background: `linear-gradient(90deg, ${statusColors.border}, ${statusColors.color})`,
                    opacity: 0,
                    transition: 'opacity 0.3s ease',
                },
                '&:hover::before': {
                    opacity: 1,
                },
            }}
        >
             {/* Team badge — shown only on draft variant when contract belongs to a team */}
            {variant === 'draft' && teamName && (
                <Box sx={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    width: '100%',
                    gap: 0.5,
                    mb: 1,
                    bgcolor: '#eef2ff',
                    border: '1px solid #c7d2fe',
                    px: 0.75,
                    py: 0.3,
                    borderRadius: 1,
                    maxWidth: '100%',
                }}>
                    <FolderOutlined sx={{ fontSize: '0.8rem', color: '#4338ca', flexShrink: 0 }} />
                    <Tooltip title={teamName} arrow placement="top">
                        <Typography
                            variant="caption"
                            sx={{
                                color: '#4338ca',
                                fontWeight: 600,
                                fontSize: '0.72rem',
                                overflow: 'hidden',
                                textOverflow: 'ellipsis',
                                whiteSpace: 'nowrap',
                            }}
                        >
                            {teamName}
                        </Typography>
                    </Tooltip>
                </Box>
            )}
            
            {/* Renewal corner badge — absolutely positioned, zero layout impact */}
            {contract.renewedFromId && ![ContractStatus.ACTIVE, ContractStatus.EXPIRING, ContractStatus.EXPIRED].includes(contract.status) && (
                <Tooltip title="Renewal contract" arrow placement="right">
                    <Box sx={{
                        position: 'absolute',
                        bottom: 8,
                        right: 8,
                        width: 20,
                        height: 20,
                        borderRadius: '50%',
                        background: 'linear-gradient(135deg, #f59e0b, #d97706)',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        boxShadow: '0 1px 5px rgba(217,119,6,0.45)',
                        zIndex: 1,
                    }}>
                        <Loop sx={{ fontSize: '0.7rem', color: '#fff' }} />
                    </Box>
                </Tooltip>
            )}

            {/* Header with Title and Status */}
            <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 1 }}>
                {/* Title */}
                {(() => {
                    const displayTitle = contract.title.replace(/\s*\(Renewal\d*\)$/i, '');
                    return (
                        <Tooltip title={displayTitle} arrow placement="top">
                            <Typography
                                variant="h6"
                                sx={{
                                    fontWeight: 500,
                                    fontSize: { xs: '1rem', sm: '1rem' },
                                    color: 'text.primary',
                                    flex: 1,
                                    minWidth: 0,
                                }}
                            >
                                {truncateText(displayTitle, 16)}
                            </Typography>
                        </Tooltip>
                    );
                })()}

                {/* Status chip */}
                <Tooltip title={getStatusLabel(contract.status)} arrow placement="top">
                    <Chip
                        label={truncateText(getStatusLabel(contract.status), 14)}
                        size="small"
                        sx={{
                            bgcolor: statusColors.bg,
                            color: statusColors.color,
                            border: `1px solid ${statusColors.border}`,
                            fontWeight: 600,
                            fontSize: '0.7rem',
                            height: '24px',
                            minWidth: '70px',
                            flexShrink: 0,
                            '& .MuiChip-label': {
                                px: 1.5,
                            },
                        }}
                    />
                </Tooltip>
            </Box>

            {/* Description */}
            <Tooltip title={contract.description || ''} arrow placement="top">
                <Typography
                    variant="body2"
                    sx={{
                        color: 'text.secondary',
                        mb: 1,
                        fontSize: '0.8rem',
                        display: '-webkit-box',
                        WebkitLineClamp: 2,
                        WebkitBoxOrient: 'vertical',
                        overflow: 'hidden',
                    }}
                >
                    {truncateText(contract.description || '', 35)}
                </Typography>
            </Tooltip>

            {/* Contract Details Grid */}
            <Box
                sx={{
                    display: 'grid',
                    gridTemplateColumns: { xs: 'repeat(2, 1fr)', sm: 'repeat(3, 1fr)' },
                    gap: 1.5,
                    mb: 1,
                }}
            >
                {/* Client */}
                <Box>
                    <Typography
                        variant="caption"
                        sx={{
                            color: 'text.secondary',
                            fontSize: '0.75rem',
                            fontWeight: 500,
                            textTransform: 'uppercase',
                            letterSpacing: '0.5px',
                            display: 'block',
                            mb: 0.5,
                        }}
                    >
                        Client
                    </Typography>
                    <Tooltip title={contract.client} arrow placement="top">
                        <Typography
                            variant="body2"
                            sx={{
                                color: 'text.primary',
                                fontWeight: 500,
                                fontSize: '0.75rem',
                            }}
                        >
                            {truncateText(contract.client, 10)}
                        </Typography>
                    </Tooltip>
                </Box>

                {/* Category */}
                <Box>
                    <Typography
                        variant="caption"
                        sx={{
                            color: 'text.secondary',
                            fontSize: '0.75rem',
                            fontWeight: 500,
                            textTransform: 'uppercase',
                            letterSpacing: '0.5px',
                            display: 'block',
                            mb: 0.5,
                        }}
                    >
                        Category
                    </Typography>
                    <Tooltip title={contract.category} arrow placement="top">
                        <Typography
                            variant="body2"
                            sx={{
                                color: 'text.primary',
                                fontWeight: 500,
                                fontSize: '0.75rem',
                            }}
                        >
                            {truncateText(contract.category, 15)}
                        </Typography>
                    </Tooltip>
                </Box>

                {/* Expires */}
                <Box>
                    <Typography
                        variant="caption"
                        sx={{
                            color: 'text.secondary',
                            fontSize: '0.75rem',
                            fontWeight: 500,
                            textTransform: 'uppercase',
                            letterSpacing: '0.5px',
                            display: 'block',
                            mb: 0.5,
                        }}
                    >
                        Expires
                    </Typography>
                    <Typography
                        variant="body2"
                        sx={{
                            color: contract.expiresInDays < 30 ? 'error.main' : 'text.primary',
                            fontWeight: 500,
                            fontSize: '0.75rem',
                        }}
                    >
                        {getExpiryDisplay()}
                    </Typography>
                </Box>
            </Box>

            {/* Action Buttons - Icon Only (Overlay) */}
            <Box
                className="action-buttons"
                sx={{
                    position: 'absolute',
                    bottom: 0,
                    left: 0,
                    right: 0,
                    display: 'flex',
                    gap: 1,
                    p: 0.5,
                    background: '#fff',
                    borderRadius: '0 0 12px 12px',
                    opacity: { xs: 1, md: 0 },
                    transition: 'opacity 0.2s ease-in-out',
                }}
            >
                {[
                    {
                        title: variant === 'draft' ? 'View' : 'View Contract',
                        icon: <Visibility sx={{ fontSize: '1.1rem' }} />,
                        onClick: () => onView?.(contract.id),
                        color: 'primary.main',
                        shadow: 'rgba(15, 118, 110, 0.2)',
                        show: true
                    },
                    {
                        title: 'Download PDF',
                        icon: <Download sx={{ fontSize: '1.1rem' }} />,
                        onClick: () => onDownload?.(contract.id),
                        color: 'primary.main',
                        shadow: 'rgba(15, 118, 110, 0.2)',
                        show: !!onDownload
                    },
                    {
                        title: getShareTooltip(),
                        icon: <Share sx={{ fontSize: '1.1rem' }} />,
                        onClick: () => onShare?.(contract.id),
                        color: 'primary.main',
                        shadow: 'rgba(15, 118, 110, 0.2)',
                        show: shouldShowShareButton()
                    },
                    {
                        title: 'Renew Contract',
                        icon: <AutorenewOutlined sx={{ fontSize: '1.1rem' }} />,
                        onClick: () => onRenew?.(contract.id),
                        color: 'success.main',
                        shadow: 'rgba(22, 163, 74, 0.2)',
                        show: variant === 'contract' &&
                            !!onRenew &&
                            (contract.status === ContractStatus.EXPIRING || contract.status === ContractStatus.EXPIRED) &&
                            !contract.renewalStatus
                    }
                ].map((action, idx) => (
                    action.show && (
                        <Tooltip key={idx} title={action.title} arrow>
                            <IconButton
                                size="small"
                                onClick={action.onClick}
                                sx={{
                                    bgcolor: 'transparent',
                                    border: '1px solid',
                                    borderColor: 'divider',
                                    borderRadius: 1.5,
                                    color: 'text.primary',
                                    transition: 'all 0.2s ease',
                                    '&:hover': {
                                        bgcolor: action.color,
                                        borderColor: action.color,
                                        color: 'white',
                                        transform: 'translateY(-2px)',
                                        boxShadow: `0 4px 8px ${action.shadow}`,
                                    },
                                }}
                            >
                                {action.icon}
                            </IconButton>
                        </Tooltip>
                    )
                ))}

                {/* Renewal in Progress badge */}
                {variant === 'contract' &&
                    (contract.status === ContractStatus.EXPIRING || contract.status === ContractStatus.EXPIRED) &&
                    contract.renewalStatus === 'in_progress' && (
                        <Tooltip
                            title={contract.renewalStartDate
                                ? `Renewal starting on ${new Date(contract.renewalStartDate).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })}`
                                : 'A renewal contract is being prepared'}
                            arrow
                        >
                            <Chip
                                icon={<AutorenewOutlined sx={{ fontSize: '0.85rem !important' }} />}
                                label="Renewal in Progress"
                                size="small"
                                sx={{
                                    bgcolor: '#fef3c7',
                                    color: '#92400e',
                                    border: '1px solid #fcd34d',
                                    fontWeight: 600,
                                    fontSize: '0.72rem',
                                    height: 26,
                                    alignSelf: 'center',
                                    cursor: 'default',
                                    '& .MuiChip-icon': { color: '#92400e' },
                                }}
                            />
                        </Tooltip>
                    )}

            </Box>
        </Box>
    );
};

export default ContractCard;