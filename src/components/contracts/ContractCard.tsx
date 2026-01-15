import { Box, Typography, Chip, IconButton, Tooltip } from '@mui/material';
import { Visibility, FileDownload, Share } from '@mui/icons-material';
import { Contract } from '@/types/contract';

interface ContractCardProps {
    contract: Contract;
    onView?: (id: string) => void;
    onExport?: (id: string) => void;
    onShare?: (id: string) => void;
}

const ContractCard = ({ contract, onView, onExport, onShare }: ContractCardProps) => {
    /**
     * Format status for display
     */
    const getStatusLabel = (status: Contract['status']): string => {
        switch (status) {
            case 'active':
                return 'Active';
            case 'expiring':
                return 'Expiring';
            case 'expired':
                return 'Expired';
            case 'review_approval':
                return 'Review and Approval';
            case 'waiting_for_signature':
                return 'Waiting for Signature';
            case 'draft':
                return 'Draft';
            default:
                return status;
        }
    };

    const getStatusColor = (status: Contract['status']) => {
        switch (status) {
            case 'active':
                return { bg: '#dcfce7', color: '#166534', border: '#86efac' };
            case 'expiring':
                return { bg: '#fef3c7', color: '#92400e', border: '#fcd34d' };
            case 'expired':
                return { bg: '#fee2e2', color: '#991b1b', border: '#fca5a5' };
            case 'review_approval':
                return { bg: '#dbeafe', color: '#1e40af', border: '#93c5fd' };
            case 'waiting_for_signature':
                return { bg: '#fff9c4', color: '#f57f17', border: '#fff176' };
            case 'draft':
                return { bg: '#f3f4f6', color: '#374151', border: '#d1d5db' };
            default:
                return { bg: '#f3f4f6', color: '#374151', border: '#d1d5db' };
        }
    };

    const getExpiryText = (days: number) => {
        if (days < 0) return 'Expired';
        if (days === 0) return 'Today';
        if (days === 1) return '1 day';
        return `${days} days`;
    };

    const truncateText = (text: string, maxLength: number) => {
        if (text.length <= maxLength) return text;
        return `${text.substring(0, maxLength)}...`;
    };

    const statusColors = getStatusColor(contract.status);

    return (
        <Box
            sx={{
                bgcolor: 'background.paper',
                borderRadius: 3,
                p: 1,
                border: '1px solid',
                borderColor: 'divider',
                transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
                position: 'relative',
                overflow: 'hidden',
                '&:hover': {
                    boxShadow: '0 12px 24px rgba(0,0,0,0.1)',
                    transform: 'translateY(-4px)',
                    borderColor: 'primary.main',
                    '& .action-buttons': {
                        opacity: 1,
                        transform: 'translateY(0)',
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
            {/* Header with Title and Status */}
            <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 2 }}>
                <Typography
                    variant="h6"
                    sx={{
                        fontWeight: 500,
                        fontSize: { xs: '1rem', sm: '1rem' },
                        color: 'text.primary',
                        // lineHeight: 1.3,
                        flex: 1,
                    }}
                >
                    {truncateText(contract.title, 25)}
                </Typography>

                <Chip
                    label={getStatusLabel(contract.status)}
                    size="small"
                    sx={{
                        bgcolor: statusColors.bg,
                        color: statusColors.color,
                        border: `1px solid ${statusColors.border}`,
                        fontWeight: 600,
                        fontSize: '0.75rem',
                        textTransform: 'lowercase',
                        height: '24px',
                        minWidth: '70px',
                        '& .MuiChip-label': {
                            px: 1.5,
                        },
                    }}
                />
            </Box>

            {/* Description */}
            <Typography
                variant="body2"
                sx={{
                    color: 'text.secondary',
                    mb: 1.5,
                    fontSize: '0.8rem',
                    // lineHeight: 1.5,
                    display: '-webkit-box',
                    WebkitLineClamp: 2,
                    WebkitBoxOrient: 'vertical',
                    overflow: 'hidden',
                }}
            >
                {truncateText(contract.description, 35)}
            </Typography>

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
                    <Typography
                        variant="body2"
                        sx={{
                            color: 'text.primary',
                            fontWeight: 500,
                            fontSize: '0.75rem',
                        }}
                    >
                        {contract.category}
                    </Typography>
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
                        {getExpiryText(contract.expiresInDays)}
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
                    background: 'linear-gradient(to top, rgba(255,255,255,0.98) 0%, rgba(255,255,255,0.95) 70%, rgba(255,255,255,0) 100%)',
                    backdropFilter: 'blur(8px)',
                    borderRadius: '0 0 12px 12px',
                    opacity: { xs: 1, md: 0 },
                    transform: { xs: 'translateY(0)', md: 'translateY(100%)' },
                    transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
                }}
            >
                {/* View Icon Button */}
                <Tooltip title="View Contract" arrow>
                    <IconButton
                        size="small"
                        onClick={() => onView?.(contract.id)}
                        sx={{
                            bgcolor: 'transparent',
                            border: '1px solid',
                            borderColor: 'divider',
                            borderRadius: 1.5,
                            width: 36,
                            height: 36,
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
                        <Visibility sx={{ fontSize: '1.1rem' }} />
                    </IconButton>
                </Tooltip>

                {/* Export Icon Button */}
                {/* <Tooltip title="Download" arrow>
                    <IconButton
                        size="small"
                        onClick={() => onExport?.(contract.id)}
                        sx={{
                            bgcolor: 'transparent',
                            border: '1px solid',
                            borderColor: 'divider',
                            borderRadius: 1.5,
                            width: 36,
                            height: 36,
                            color: 'text.primary',
                            transition: 'all 0.2s ease',
                            '&:hover': {
                                bgcolor: 'primary.main',
                                borderColor: 'primary.main',
                                color: 'white',
                                transform: 'translateY(-2px)',
                                boxShadow: '0 4px 8px rgba(33, 150, 243, 0.2)',
                            },
                        }}
                    >
                        <FileDownload sx={{ fontSize: '1.1rem' }} />
                    </IconButton>
                </Tooltip> */}

                {/* Share Icon Button (For Draft, Review, or Waiting for Signature) */}
                {!['signed', 'active', 'expiring', 'expired'].includes(contract.status) && (
                    <Tooltip title="Share for signature" arrow>
                        <IconButton
                            size="small"
                            onClick={() => onShare?.(contract.id)}
                            sx={{
                                bgcolor: 'transparent',
                                border: '1px solid',
                                borderColor: 'divider',
                                borderRadius: 1.5,
                                width: 36,
                                height: 36,
                                color: 'text.primary',
                                transition: 'all 0.2s ease',
                                '&:hover': {
                                    bgcolor: 'primary.main',
                                    borderColor: 'primary.main',
                                    color: 'white',
                                    transform: 'translateY(-2px)',
                                    boxShadow: '0 4px 8px rgba(0, 0, 0, 0.15)',
                                },
                            }}
                        >
                            <Share sx={{ fontSize: '1.1rem' }} />
                        </IconButton>
                    </Tooltip>
                )}
            </Box>
        </Box>
    );
};

export default ContractCard;
