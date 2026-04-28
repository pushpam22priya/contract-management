import { Box, Typography, Chip, IconButton, Tooltip, useTheme } from '@mui/material';
import dayjs from 'dayjs';
import { Visibility, Share, Download, FolderOutlined, AutorenewOutlined, Loop } from '@mui/icons-material';
import BlockOutlinedIcon from '@mui/icons-material/BlockOutlined';
import HistoryIcon from '@mui/icons-material/History';
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline';
import { Contract, ContractStatus } from '@/types/contract';
import { useTranslations } from 'next-intl';

/**
 * Unified ContractCard component that handles draft, contract, and terminated views.
 *
 * variant='draft'       — Draft contracts (review/approval flow)
 * variant='contract'    — Active/signed/expired contracts
 * variant='terminated'  — Terminated contracts (read-only, History only)
 */

interface ContractCardProps {
    contract: Contract;
    onView?: (id: string) => void;
    onShare?: (id: string) => void;
    onDownload?: (id: string) => void;
    onRenew?: (id: string) => void;
    onTerminate?: (id: string) => void;
    onHistory?: (id: string, event: React.MouseEvent<HTMLButtonElement>) => void;
    onDelete?: (id: string) => void;
    /**
     * Variant determines the card behavior:
     * - 'draft': Shows share button always (for review submission), handles "changes_requested" status
     * - 'contract': Shows share button only for APPROVED/WAITING_FOR_SIGNATURE (for signature requests)
     * - 'terminated': Shows History button only (all other actions suppressed)
     */
    variant?: 'draft' | 'contract' | 'terminated';
    /** Team name to display on draft cards */
    teamName?: string;
}

const ContractCard = ({
    contract,
    onView,
    onShare,
    onDownload,
    onRenew,
    onTerminate,
    onHistory,
    onDelete,
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
    const theme = useTheme();
    const isDark = theme.palette.mode === 'dark';
    const tTooltips = useTranslations('tooltips');

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

    const getStatusLabel = (status: Contract['status']): string => {
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
            case ContractStatus.TERMINATED:
                return 'Terminated';
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
        if (isDark) {
            if (variant === 'draft' && status === ContractStatus.DRAFT && contract.reviewStatus === 'changes_requested')
                return { bg: 'rgba(234,88,12,0.08)', color: '#b87a50', border: 'rgba(234,88,12,0.22)' };
            switch (status) {
                case ContractStatus.ACTIVE:
                case ContractStatus.SIGNED:
                    return { bg: 'rgba(16,185,129,0.08)', color: '#6bac8e', border: 'rgba(16,185,129,0.20)' };
                case ContractStatus.EXPIRING:
                    return { bg: 'rgba(245,158,11,0.08)', color: '#b8935a', border: 'rgba(245,158,11,0.20)' };
                case ContractStatus.EXPIRED:
                case ContractStatus.REJECTED:
                case ContractStatus.REJECTED_BY_REVIEWER:
                case ContractStatus.REJECTED_BY_APPROVER:
                    return { bg: 'rgba(239,68,68,0.08)', color: '#b07070', border: 'rgba(239,68,68,0.20)' };
                case ContractStatus.TERMINATED:
                    return { bg: 'rgba(148,163,184,0.07)', color: '#6b7e90', border: 'rgba(148,163,184,0.18)' };
                case ContractStatus.IN_REVIEW:
                    return { bg: 'rgba(139,92,246,0.08)', color: '#9080c0', border: 'rgba(139,92,246,0.22)' };
                case ContractStatus.IN_APPROVAL:
                    return { bg: 'rgba(245,158,11,0.08)', color: '#b8935a', border: 'rgba(245,158,11,0.20)' };
                case ContractStatus.REVIEW_APPROVAL:
                case ContractStatus.REVIEWED:
                    return { bg: 'rgba(59,130,246,0.08)', color: '#6888ac', border: 'rgba(59,130,246,0.20)' };
                case ContractStatus.APPROVED:
                    return { bg: 'rgba(16,185,129,0.08)', color: '#6bac8e', border: 'rgba(16,185,129,0.20)' };
                case ContractStatus.READY_FOR_SIGNATURE:
                    return { bg: 'rgba(20,184,166,0.08)', color: '#4e8e88', border: 'rgba(20,184,166,0.20)' };
                case ContractStatus.WAITING_FOR_SIGNATURE: {
                    const progress = getMultiPartySigningProgress();
                    if (progress && progress.orderIndex > 0)
                        return { bg: 'rgba(20,184,166,0.08)', color: '#4e8e88', border: 'rgba(20,184,166,0.20)' };
                    return { bg: 'rgba(245,158,11,0.08)', color: '#b8935a', border: 'rgba(245,158,11,0.20)' };
                }
                case ContractStatus.SIGNED_BY_EVERYONE:
                    return { bg: 'rgba(59,130,246,0.08)', color: '#6888ac', border: 'rgba(59,130,246,0.20)' };
                case ContractStatus.DRAFT:
                default:
                    return { bg: 'rgba(148,163,184,0.07)', color: '#6b7e90', border: 'rgba(148,163,184,0.18)' };
            }
        }

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
            case ContractStatus.TERMINATED:
                return { bg: '#f1f5f9', color: '#334155', border: '#94a3b8' };
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
                return { bg: '#e0f2f1', color: '#00695c', border: '#4db6ac' };
            case ContractStatus.WAITING_FOR_SIGNATURE: {
                const progress = getMultiPartySigningProgress();
                if (progress && progress.orderIndex > 0)
                    return { bg: '#e0f7fa', color: '#00695c', border: '#80cbc4' };
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
        // Terminated variant: show termination date
        if (variant === 'terminated' && contract.terminatedAt) {
            return dayjs(contract.terminatedAt).format('DD/MM/YYYY');
        }
        if (contract.endDate) {
            return dayjs(contract.endDate).format('DD/MM/YYYY');
        }
        return dayjs().add(contract.expiresInDays, 'day').format('DD/MM/YYYY');
    };

    const getExpiryLabel = () => {
        if (variant === 'terminated') return 'Terminated';
        return 'Expires';
    };

    const truncateText = (text: string, maxLength: number) => {
        if (text.length <= maxLength) return text;
        return `${text.substring(0, maxLength)}...`;
    };

    const shouldShowShareButton = (): boolean => {
        if (!onShare || variant === 'terminated') return false;

        if (variant === 'draft') return true;

        return contract.status === ContractStatus.APPROVED ||
            contract.status === ContractStatus.READY_FOR_SIGNATURE ||
            contract.status === ContractStatus.WAITING_FOR_SIGNATURE ||
            contract.status === ContractStatus.SIGNED_BY_EVERYONE;
    };

    const getShareTooltip = (): string => {
        return variant === 'draft'
            ? tTooltips('submitForReviewOrApproval')
            : tTooltips('submitForSignature');
    };

    const statusColors = getStatusColor(contract.status);
    const displayTitle = contract.title.replace(/\s*\(Renewal\d*\)$/i, '');

    // Terminated cards use a subdued border/gradient
    const cardBorderColor = variant === 'terminated' ? '#94a3b8' : statusColors.border;
    const cardGradientColor = variant === 'terminated' ? '#94a3b8' : statusColors.color;

    return (
        <Box
            sx={{
                bgcolor: 'background.paper',
                borderRadius: 3,
                p: 1,
                border: '1px solid',
                borderColor: isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.08)',
                boxShadow: variant === 'terminated'
                    ? '0 1px 4px rgba(0, 0, 0, 0.06)'
                    : '0 2px 8px rgba(0, 0, 0, 0.04)',
                transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
                position: 'relative',
                overflow: 'hidden',
                opacity: variant === 'terminated' ? 0.92 : 1,
                '&:hover': {
                    boxShadow: variant === 'terminated'
                        ? '0 6px 16px rgba(0,0,0,0.08)'
                        : '0 12px 24px rgba(0,0,0,0.1)',
                    transform: 'translateY(-4px)',
                    borderColor: cardBorderColor,
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
                    background: `linear-gradient(90deg, ${cardBorderColor}, ${cardGradientColor})`,
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
                    bgcolor: isDark ? 'rgba(99,102,241,0.12)' : '#eef2ff',
                    border: `1px solid ${isDark ? 'rgba(99,102,241,0.30)' : '#c7d2fe'}`,
                    px: 0.75,
                    py: 0.3,
                    borderRadius: 1,
                    maxWidth: '100%',
                }}>
                    <FolderOutlined sx={{ fontSize: '0.8rem', color: isDark ? '#a5b4fc' : '#4338ca', flexShrink: 0 }} />
                    <Tooltip title={teamName} arrow placement="top">
                        <Typography
                            variant="caption"
                            sx={{
                                color: isDark ? '#a5b4fc' : '#4338ca',
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

            {/* Renewal corner badge — zero layout impact, hidden when active/expiring/expired/terminated */}
            {contract.renewedFromId &&
                ![ContractStatus.ACTIVE, ContractStatus.EXPIRING, ContractStatus.EXPIRED, ContractStatus.TERMINATED]
                    .includes(contract.status) && (
                    <Tooltip title={tTooltips('renewalContract')} arrow placement="right">
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

            {/* Header: Title + Status chip */}
            <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 1 }}>
                <Tooltip title={displayTitle} arrow placement="top">
                    <Typography
                        variant="subtitle2"
                        sx={{
                            flex: 1,
                            minWidth: 0,
                            ...(variant === 'terminated' && { color: 'text.secondary' }),
                        }}
                    >
                        {truncateText(displayTitle, 16)}
                    </Typography>
                </Tooltip>

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
                            '& .MuiChip-label': { px: 1.5 },
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
                    <Typography variant="body2" sx={{ color: 'text.secondary', fontWeight: 500, textTransform: 'uppercase', display: 'block', mb: 0.2 }}>
                        Client
                    </Typography>
                    <Tooltip title={contract.client} arrow placement="top">
                        <Typography variant="body2" sx={{ color: 'text.primary', fontWeight: 500 }}>
                            {truncateText(contract.client, 10)}
                        </Typography>
                    </Tooltip>
                </Box>

                {/* Category */}
                <Box>
                    <Typography variant="body2" sx={{ color: 'text.secondary', fontWeight: 500, textTransform: 'uppercase', display: 'block', mb: 0.2 }}>
                        Category
                    </Typography>
                    <Tooltip title={contract.category} arrow placement="top">
                        <Typography variant="body2" sx={{ color: 'text.primary', fontWeight: 500}}>
                            {truncateText(contract.category, 15)}
                        </Typography>
                    </Tooltip>
                </Box>

                {/* Expires / Terminated */}
                <Box>
                    <Typography variant="body2" sx={{ color: 'text.secondary', fontWeight: 500, textTransform: 'uppercase', display: 'block', mb: 0.2 }}>
                        {getExpiryLabel()}
                    </Typography>
                    <Tooltip title={variant === 'terminated' && contract.terminatedAt ? `Terminated on ${dayjs(contract.terminatedAt).format('DD/MM/YYYY')}` : ''} arrow placement="top">
                        <Typography
                            variant="body2"
                            sx={{
                                color: variant === 'terminated'
                                    ? 'text.secondary'
                                    : contract.expiresInDays < 30
                                        ? (isDark ? '#b07070' : 'error.main')
                                        : 'text.primary',
                                fontWeight: 500,
                            }}
                        >
                            {getExpiryDisplay()}
                        </Typography>
                    </Tooltip>
                </Box>
            </Box>

            {/* Action Buttons — overlay on hover */}
            <Box
                className="action-buttons"
                sx={{
                    position: 'absolute',
                    bottom: 0,
                    left: 0,
                    right: 0,
                    display: 'flex',
                    gap: 1,
                    px: 1,
                    py: 0.5,
                    background: isDark ? 'rgb(22,32,48)' : '#f8f8f8',
                    borderRadius: '0 0 12px 12px',
                    opacity: { xs: 1, md: 0 },
                    transition: 'opacity 0.2s ease-in-out',
                    flexWrap: 'wrap',
                    alignItems: 'center',
                }}
            >
                {/* ── Standard action buttons (hidden for terminated variant) ── */}
                {variant !== 'terminated' && [
                    {
                        title: variant === 'draft' ? tTooltips('view') : tTooltips('viewContract'),
                        icon: <Visibility sx={{ fontSize: '0.9rem' }} />,
                        onClick: () => onView?.(contract.id),
                        color: 'primary.main',
                        shadow: 'rgba(15, 118, 110, 0.2)',
                        show: !!onView,
                    },
                    {
                        title: tTooltips('downloadPdf'),
                        icon: <Download sx={{ fontSize: '0.9rem' }} />,
                        onClick: () => onDownload?.(contract.id),
                        color: 'primary.main',
                        shadow: 'rgba(15, 118, 110, 0.2)',
                        show: !!onDownload,
                    },
                    {
                        title: getShareTooltip(),
                        icon: <Share sx={{ fontSize: '0.9rem' }} />,
                        onClick: () => onShare?.(contract.id),
                        color: 'primary.main',
                        shadow: 'rgba(15, 118, 110, 0.2)',
                        show: shouldShowShareButton(),
                    },
                    {
                        title: tTooltips('renewContract'),
                        icon: <AutorenewOutlined sx={{ fontSize: '0.9rem' }} />,
                        onClick: () => onRenew?.(contract.id),
                        color: 'primary.main',
                        shadow: 'rgba(22, 163, 74, 0.2)',
                        // Renew available for both expiring AND expired
                        show: variant === 'contract' &&
                            !!onRenew &&
                            (contract.status === ContractStatus.EXPIRING || contract.status === ContractStatus.EXPIRED) &&
                            !contract.renewalStatus,
                    },
                    {
                        title: tTooltips('terminateContract'),
                        icon: <BlockOutlinedIcon sx={{ fontSize: '0.9rem' }} />,
                        onClick: () => onTerminate?.(contract.id),
                        color: '#dc2626',
                        shadow: 'rgba(220, 38, 38, 0.2)',
                        // Terminate only for expired, mutually exclusive with Renew
                        show: variant === 'contract' &&
                            !!onTerminate &&
                            contract.status === ContractStatus.EXPIRED &&
                            !contract.renewalStatus,
                    },
                ].map((action, idx) =>
                    action.show ? (
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
                    ) : null
                )}

                {/* ── History button: terminated variant OR any chain contract with onHistory ── */}
                {!!onHistory && (variant === 'terminated' || !!(contract.renewedFromId || contract.renewedContractId)) && (
                    <Tooltip title={tTooltips('viewContractHistory')} arrow>
                        <IconButton
                            size="small"
                            onClick={(e) => onHistory(contract.id, e)}
                            sx={{
                                bgcolor: 'transparent',
                                border: '1px solid',
                                borderColor: 'divider',
                                borderRadius: 1.5,
                                color: 'text.primary',
                                transition: 'all 0.2s ease',
                                '&:hover': {
                                    bgcolor: 'primary.main',
                                    borderColor: 'primary.main',
                                    color: 'white',
                                    transform: 'translateY(-2px)',
                                    boxShadow: '0 4px 8px rgba(15, 118, 110, 0.2)',
                                },
                            }}
                        >
                            <HistoryIcon sx={{ fontSize: '0.9rem' }} />
                        </IconButton>
                    </Tooltip>
                )}

                {/* ── Delete button: terminated variant only ── */}
                {variant === 'terminated' && !!onDelete && (
                    <Tooltip title={tTooltips('deletePermanently')} arrow>
                        <IconButton
                            size="small"
                            onClick={() => onDelete(contract.id)}
                            sx={{
                                bgcolor: 'transparent',
                                border: '1px solid',
                                borderColor: 'divider',
                                borderRadius: 1.5,
                                color: 'text.primary',
                                transition: 'all 0.2s ease',
                                '&:hover': {
                                    bgcolor: '#dc2626',
                                    borderColor: '#dc2626',
                                    color: 'white',
                                    transform: 'translateY(-2px)',
                                    boxShadow: '0 4px 8px rgba(220, 38, 38, 0.2)',
                                },
                            }}
                        >
                            <DeleteOutlineIcon sx={{ fontSize: '0.9rem' }} />
                        </IconButton>
                    </Tooltip>
                )}

                {/* Renewal in Progress badge — shown instead of Renew + Terminate buttons */}
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
