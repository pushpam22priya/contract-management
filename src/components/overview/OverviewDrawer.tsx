'use client';

import { Box, Typography, IconButton, Badge } from '@mui/material';
import { useTheme, alpha } from '@mui/material/styles';
import CloseIcon from '@mui/icons-material/Close';
import DescriptionOutlinedIcon from '@mui/icons-material/DescriptionOutlined';
import AccessTimeIcon from '@mui/icons-material/AccessTime';
import SendOutlinedIcon from '@mui/icons-material/SendOutlined';
import PendingActionsOutlinedIcon from '@mui/icons-material/PendingActionsOutlined';
import TaskAltOutlinedIcon from '@mui/icons-material/TaskAltOutlined';
import BoltOutlinedIcon from '@mui/icons-material/BoltOutlined';
import WarningAmberIcon from '@mui/icons-material/WarningAmber';
import CancelOutlinedIcon from '@mui/icons-material/CancelOutlined';
import BarChartIcon from '@mui/icons-material/BarChart';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { OverviewStats } from './useOverviewStats';
import { Contract } from '@/types/contract';
import { TabId } from './OverviewSideTabs';

interface OverviewDrawerProps {
    activeTab: TabId | null;
    stats: OverviewStats;
    onClose: () => void;
    onTabChange: (tab: TabId) => void;
}

const DRAWER_WIDTH = 260;

function ContractListItem({
    contract,
    accentColor,
    onClick,
}: {
    contract: Contract;
    accentColor: string;
    onClick: () => void;
}) {
    const theme = useTheme();
    return (
        <Box
            onClick={onClick}
            sx={{
                px: 2,
                py: 1.5,
                cursor: 'pointer',
                borderBottom: '1px solid',
                borderColor: 'divider',
                transition: 'background 0.15s ease',
                '&:hover': { bgcolor: alpha(accentColor, theme.palette.mode === 'dark' ? 0.1 : 0.06) },
                position: 'relative',
                '&::before': {
                    content: '""',
                    position: 'absolute',
                    left: 0, top: 0, bottom: 0,
                    width: 3,
                    bgcolor: accentColor,
                    borderRadius: '0 2px 2px 0',
                },
            }}
        >
            <Typography
                variant="body2"
                sx={{ fontWeight: 600, color: 'text.primary', lineHeight: 1.3, mb: 0.25 }}
                noWrap
            >
                {contract.title}
            </Typography>
            {contract.client && (
                <Typography variant="caption" sx={{ color: 'text.secondary', display: 'block', mb: 0.25 }} noWrap>
                    {contract.client}
                </Typography>
            )}
            {contract.expiresInDays !== undefined && (
                <Box
                    sx={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        px: 0.75,
                        py: 0.2,
                        borderRadius: 1,
                        bgcolor: alpha(accentColor, theme.palette.mode === 'dark' ? 0.18 : 0.1),
                        mt: 0.25,
                    }}
                >
                    <Typography
                        variant="caption"
                        sx={{ fontSize: '0.65rem', fontWeight: 700, color: accentColor, lineHeight: 1 }}
                    >
                        {contract.expiresInDays}d left
                    </Typography>
                </Box>
            )}
        </Box>
    );
}

export default function OverviewDrawer({ activeTab, stats, onClose, onTabChange }: OverviewDrawerProps) {
    const theme = useTheme();
    const router = useRouter();
    const t = useTranslations('dashboard');
    const isOpen = activeTab !== null;

    const tabs: Array<{
        id: TabId;
        label: string;
        shortLabel: string;
        icon: React.ReactNode;
        color: string;
        count?: number;
    }> = [
        {
            id: 'stats',
            label: 'Status Overview',
            shortLabel: 'Status',
            icon: <BarChartIcon sx={{ fontSize: 14 }} />,
            color: theme.palette.primary.main,
        },
        {
            id: 'active',
            label: t('activeContracts'),
            shortLabel: 'Active',
            icon: <BoltOutlinedIcon sx={{ fontSize: 14 }} />,
            color: '#10b981',
            count: stats.activeCount,
        },
        {
            id: 'expiring',
            label: t('expiringSoon'),
            shortLabel: 'Expiring',
            icon: <WarningAmberIcon sx={{ fontSize: 14 }} />,
            color: '#f59e0b',
            count: stats.expiringCount,
        },
    ];

    const statRows = [
        {
            label: t('draft'),
            value: stats.draftCount,
            icon: <DescriptionOutlinedIcon sx={{ fontSize: 14 }} />,
            color: '#57a8de',
            path: '/draft?status=draft',
        },
        {
            label: t('inProgress'),
            value: stats.underReviewCount + stats.underApprovalCount,
            icon: <AccessTimeIcon sx={{ fontSize: 14 }} />,
            color: '#ed3a88',
            path: '/draft?title=In+Progress&status=draft,in_review,in_approval,review_approval,reviewed',
        },
        {
            label: t('sendForSignature'),
            value: stats.requestedCount,
            icon: <SendOutlinedIcon sx={{ fontSize: 14 }} />,
            color: '#7c3aed',
            path: '/contracts?status=waiting_for_signature',
        },
        {
            label: t('waitingForMySignature'),
            value: stats.waitingForSigCount,
            icon: <PendingActionsOutlinedIcon sx={{ fontSize: 14 }} />,
            color: '#e1781d',
            path: '/signatures?status=pending',
        },
        {
            label: t('signedContracts'),
            value: stats.receivedSignedCount,
            icon: <TaskAltOutlinedIcon sx={{ fontSize: 14 }} />,
            color: '#2563eb',
            path: '/contracts?status=signed_by_everyone',
        },
        {
            label: t('activeContracts'),
            value: stats.activeCount,
            icon: <BoltOutlinedIcon sx={{ fontSize: 14 }} />,
            color: '#10b981',
            path: '/contracts?status=active',
        },
        {
            label: t('expiringSoon'),
            value: stats.expiringCount,
            icon: <WarningAmberIcon sx={{ fontSize: 14 }} />,
            color: '#f59e0b',
            path: '/contracts?status=expiring',
        },
        {
            label: t('expired'),
            value: stats.expiredCount,
            icon: <CancelOutlinedIcon sx={{ fontSize: 14 }} />,
            color: '#ef4444',
            path: '/contracts?status=expired',
        },
    ];

    const EmptyState = ({ icon, message }: { icon: React.ReactNode; message: string }) => (
        <Box sx={{ py: 5, px: 2, textAlign: 'center' }}>
            <Box sx={{ mb: 1, opacity: 0.35 }}>{icon}</Box>
            <Typography variant="body2" sx={{ color: 'text.secondary' }}>
                {message}
            </Typography>
        </Box>
    );

    return (
        <Box
            sx={{
                width: isOpen ? DRAWER_WIDTH : 0,
                flexShrink: 0,
                overflow: 'hidden',
                transition: 'width 0.35s cubic-bezier(0.4, 0, 0.2, 1)',
                borderLeft: isOpen ? '1px solid' : 'none',
                borderColor: 'divider',
                bgcolor: 'background.paper',
                display: 'flex',
                flexDirection: 'column',
                boxShadow: isOpen
                    ? theme.palette.mode === 'dark'
                        ? '-4px 0 16px rgba(0,0,0,0.4)'
                        : '-4px 0 12px rgba(0,0,0,0.06)'
                    : 'none',
            }}
        >
            {/* ── Header ── */}
            <Box
                sx={{
                    minWidth: DRAWER_WIDTH,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    px: 2,
                    py: 1,
                    borderBottom: '1px solid',
                    borderColor: 'divider',
                    flexShrink: 0,
                }}
            >
                <Typography variant="subtitle2" sx={{ fontWeight: 700, fontSize: '0.82rem' }}>
                    {activeTab ? tabs.find(t => t.id === activeTab)?.label : ''}
                </Typography>
                <IconButton size="small" onClick={onClose} sx={{ color: 'text.secondary' }}>
                    <CloseIcon sx={{ fontSize: 16 }} />
                </IconButton>
            </Box>

            {/* ── Tab switcher bar ── */}
            <Box
                sx={{
                    minWidth: DRAWER_WIDTH,
                    display: 'flex',
                    borderBottom: '1px solid',
                    borderColor: 'divider',
                    flexShrink: 0,
                }}
            >
                {tabs.map((tab) => {
                    const isActive = activeTab === tab.id;
                    return (
                        <Box
                            key={tab.id}
                            onClick={() => onTabChange(tab.id)}
                            sx={{
                                flex: 1,
                                display: 'flex',
                                flexDirection: 'column',
                                alignItems: 'center',
                                justifyContent: 'center',
                                gap: 0.4,
                                py: 1,
                                cursor: 'pointer',
                                position: 'relative',
                                color: isActive ? tab.color : 'text.disabled',
                                transition: 'color 0.18s ease, background 0.18s ease',
                                '&:hover': {
                                    bgcolor: alpha(tab.color, theme.palette.mode === 'dark' ? 0.08 : 0.05),
                                    color: tab.color,
                                },
                                // Active underline
                                '&::after': {
                                    content: '""',
                                    position: 'absolute',
                                    bottom: 0,
                                    left: '10%',
                                    width: '80%',
                                    height: 2,
                                    borderRadius: '2px 2px 0 0',
                                    bgcolor: isActive ? tab.color : 'transparent',
                                    transition: 'background 0.18s ease',
                                },
                            }}
                        >
                            {tab.count !== undefined ? (
                                <Badge
                                    badgeContent={tab.count}
                                    max={99}
                                    sx={{
                                        '& .MuiBadge-badge': {
                                            bgcolor: isActive ? tab.color : alpha(tab.color, 0.55),
                                            color: '#fff',
                                            fontSize: '0.55rem',
                                            minWidth: 14,
                                            height: 14,
                                            lineHeight: '14px',
                                            padding: 0,
                                            top: -1,
                                            right: -1,
                                        },
                                    }}
                                >
                                    {tab.icon}
                                </Badge>
                            ) : (
                                tab.icon
                            )}
                            <Typography
                                component="span"
                                sx={{
                                    fontSize: '0.6rem',
                                    fontWeight: isActive ? 700 : 500,
                                    lineHeight: 1,
                                    letterSpacing: '0.02em',
                                }}
                            >
                                {tab.shortLabel}
                            </Typography>
                        </Box>
                    );
                })}
            </Box>

            {/* ── Scrollable content ── */}
            <Box sx={{ flex: 1, overflowY: 'auto', minWidth: DRAWER_WIDTH }}>

                {activeTab === 'stats' && (
                    <Box>
                        {statRows.map((row) => (
                            <Box
                                key={row.label}
                                onClick={() => router.push(row.path)}
                                sx={{
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: 1.5,
                                    px: 2,
                                    py: 1.25,
                                    cursor: 'pointer',
                                    borderBottom: '1px solid',
                                    borderColor: 'divider',
                                    transition: 'background 0.15s ease',
                                    '&:hover': { bgcolor: alpha(row.color, theme.palette.mode === 'dark' ? 0.1 : 0.06) },
                                    '&:hover .overview-count': { color: row.color },
                                }}
                            >
                                <Box
                                    sx={{
                                        width: 28,
                                        height: 28,
                                        borderRadius: 1.5,
                                        bgcolor: alpha(row.color, theme.palette.mode === 'dark' ? 0.16 : 0.1),
                                        display: 'flex',
                                        alignItems: 'center',
                                        justifyContent: 'center',
                                        flexShrink: 0,
                                        color: row.color,
                                    }}
                                >
                                    {row.icon}
                                </Box>
                                <Typography
                                    variant="body2"
                                    sx={{ flex: 1, color: 'text.secondary', fontSize: '0.78rem', lineHeight: 1.3 }}
                                >
                                    {row.label}
                                </Typography>
                                <Typography
                                    className="overview-count"
                                    variant="body2"
                                    sx={{
                                        fontWeight: 700,
                                        color: 'text.primary',
                                        fontSize: '0.9rem',
                                        minWidth: 24,
                                        textAlign: 'right',
                                        transition: 'color 0.15s ease',
                                    }}
                                >
                                    {row.value}
                                </Typography>
                            </Box>
                        ))}
                    </Box>
                )}

                {activeTab === 'active' && (
                    <Box>
                        {stats.activeContracts.length === 0 ? (
                            <EmptyState
                                icon={<BoltOutlinedIcon sx={{ fontSize: 36, color: '#10b981' }} />}
                                message="No active contracts"
                            />
                        ) : (
                            stats.activeContracts.map((c: Contract) => (
                                <ContractListItem
                                    key={c.id}
                                    contract={c}
                                    accentColor="#10b981"
                                    onClick={() => router.push(`/contracts/${c.id}`)}
                                />
                            ))
                        )}
                    </Box>
                )}

                {activeTab === 'expiring' && (
                    <Box>
                        {stats.expiringContracts.length === 0 ? (
                            <EmptyState
                                icon={<WarningAmberIcon sx={{ fontSize: 36, color: '#f59e0b' }} />}
                                message="No expiring contracts"
                            />
                        ) : (
                            stats.expiringContracts.map((c: Contract) => (
                                <ContractListItem
                                    key={c.id}
                                    contract={c}
                                    accentColor="#f59e0b"
                                    onClick={() => router.push(`/contracts/${c.id}`)}
                                />
                            ))
                        )}
                    </Box>
                )}

            </Box>
        </Box>
    );
}
