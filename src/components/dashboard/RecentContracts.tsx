'use client';

import { Box, Typography, Paper, Button, Chip, Divider, Fade, Grow, SvgIcon, useTheme } from '@mui/material';
import { alpha } from '@mui/material/styles';
import CalendarTodayOutlinedIcon from '@mui/icons-material/CalendarTodayOutlined';
import BusinessOutlinedIcon from '@mui/icons-material/BusinessOutlined';
import CategoryOutlinedIcon from '@mui/icons-material/CategoryOutlined';
import ArticleOutlinedIcon from '@mui/icons-material/ArticleOutlined';
import ArrowForwardIcon from '@mui/icons-material/ArrowForward';
import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { contractService } from '@/services/contractService';
import { authService } from '@/services/authService';
import { Contract, ContractStatus } from '@/types/contract';
import dayjs from 'dayjs';

interface RecentContractDisplay {
    id: string;
    title: string;
    company: string;
    status: ContractStatus;
    daysLeft: number;
    category: string;
    startDate: string;
    endDate: string;
    path: string;
}

type ActiveTab = 'recent' | 'expiring';

export default function RecentContracts() {
    const router = useRouter();
    const theme = useTheme();
    const primaryColor = theme.palette.primary.main;
    const isDark = theme.palette.mode === 'dark';
    const t = useTranslations('recentContracts');
    const tStatus = useTranslations('contractStatus');
    const [hoveredId, setHoveredId] = useState<string | null>(null);
    const [activeTab, setActiveTab] = useState<ActiveTab>('recent');
    const [recentContracts, setRecentContracts] = useState<RecentContractDisplay[]>([]);
    const [expiringContracts, setExpiringContracts] = useState<RecentContractDisplay[]>([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        const loadContracts = async () => {
            const currentUser = authService.getCurrentUser();
            if (!currentUser) return;

            try {
                const allContracts = await contractService.getAllContracts();

                if (!Array.isArray(allContracts)) {
                    console.error("RecentContracts: getAllContracts returned non-array", allContracts);
                    setLoading(false);
                    return;
                }

                const relevantContracts = allContracts.filter(c =>
                    c.createdBy === currentUser.email || c.signer?.email === currentUser.email
                );

                const toDisplay = (c: Contract): RecentContractDisplay => {
                    const today = dayjs();
                    const end = c.endDate ? dayjs(c.endDate) : today;
                    const daysLeft = Math.max(0, end.diff(today, 'day'));

                    const draftPageStatuses = [
                        ContractStatus.DRAFT,
                        ContractStatus.IN_REVIEW,
                        ContractStatus.IN_APPROVAL,
                        ContractStatus.REVIEW_APPROVAL,
                        ContractStatus.REJECTED_BY_REVIEWER,
                        ContractStatus.REJECTED_BY_APPROVER,
                    ];
                    const path = draftPageStatuses.includes(c.status)
                        ? `/draft?status=${encodeURIComponent(c.status)}&search=${encodeURIComponent(c.title)}`
                        : `/contracts/${c.id}`;

                    return {
                        id: c.id,
                        title: c.title,
                        company: c.client || 'Unknown Client',
                        status: c.status,
                        daysLeft,
                        category: c.category || '—',
                        startDate: c.startDate ? dayjs(c.startDate).format('DD MMM YYYY') : '—',
                        endDate: c.endDate ? dayjs(c.endDate).format('DD MMM YYYY') : '—',
                        path,
                    };
                };

                const recent = relevantContracts
                    .filter(c => c.status === ContractStatus.ACTIVE)
                    .sort((a, b) => dayjs(b.createdAt).diff(dayjs(a.createdAt)))
                    .slice(0, 4)
                    .map(toDisplay);

                const expiring = relevantContracts
                    .filter(c => c.status === ContractStatus.EXPIRING)
                    .map(toDisplay)
                    .sort((a, b) => a.daysLeft - b.daysLeft)
                    .slice(0, 4);

                setRecentContracts(recent);
                setExpiringContracts(expiring);
            } catch (error) {
                console.error("RecentContracts: Failed to load contracts", error);
            } finally {
                setLoading(false);
            }
        };

        loadContracts();
    }, []);

    const getStatusColor = (status: string) => {
        switch (status) {
            case 'draft':               return { bg: '#f1f5f9', text: '#475569', border: '#cbd5e1', accent: '#94a3b8' };
            case 'in_review':
            case 'review_approval':     return { bg: '#dbeafe', text: '#1d4ed8', border: '#93c5fd', accent: '#3b82f6' };
            case 'reviewed':            return { bg: '#e0e7ff', text: '#3730a3', border: '#a5b4fc', accent: '#4f46e5' };
            case 'in_approval':         return { bg: '#ede9fe', text: '#6d28d9', border: '#c4b5fd', accent: '#7c3aed' };
            case 'approved':            return { bg: '#f7fee7', text: '#3f6212', border: '#bef264', accent: '#65a30d' };
            case 'ready_for_signature': return { bg: '#fff7ed', text: '#c2410c', border: '#fdba74', accent: '#ea580c' };
            case 'waiting_for_signature': return { bg: '#fdf4ff', text: '#86198f', border: '#f0abfc', accent: '#c026d3' };
            case 'signed_by_everyone':  return { bg: '#cffafe', text: '#0e7490', border: '#67e8f9', accent: '#0891b2' };
            case 'signed':              return { bg: '#e0f2f1', text: '#00695c', border: '#80cbc4', accent: '#00897b' };
            case 'active':              return { bg: '#f0fdf4', text: '#15803d', border: '#86efac', accent: '#16a34a' };
            case 'expiring':            return { bg: '#fef3c7', text: '#d97706', border: '#fcd34d', accent: '#c4874a' };
            case 'rejected':            return { bg: '#fff1f2', text: '#9f1239', border: '#fda4af', accent: '#e11d48' };
            case 'rejected_by_reviewer': return { bg: '#fee2e2', text: '#b91c1c', border: '#fca5a5', accent: '#ef4444' };
            case 'rejected_by_approver': return { bg: '#fee2e2', text: '#b91c1c', border: '#fca5a5', accent: '#ef4444' };
            case 'expired':
            case 'terminated':          return { bg: '#fef2f2', text: '#991b1b', border: '#fecaca', accent: '#dc2626' };
            default:                    return { bg: '#f1f5f9', text: '#475569', border: '#cbd5e1', accent: '#94a3b8' };
        }
    };

    if (loading) return null;

    const displayContracts = activeTab === 'recent' ? recentContracts : expiringContracts;
    const count = displayContracts.length;

    const renderEmptyState = () => {
        const isExpiring = activeTab === 'expiring';
        return (
            <Box sx={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', py: 4, gap: 1.5 }}>
                <Box sx={{
                    width: 72, height: 72, borderRadius: '50%',
                    bgcolor: isExpiring
                        ? (isDark ? 'rgba(184,147,90,0.12)' : '#fffbeb')
                        : (isDark ? 'rgba(82,183,136,0.10)' : '#f0fdf4'),
                    border: `2px dashed ${isExpiring ? '#fcd34d' : primaryColor}`,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                }}>
                    <SvgIcon sx={{ fontSize: 36, color: isExpiring ? '#f59e0b' : primaryColor }} viewBox="0 0 48 48">
                        {isExpiring ? (
                            <>
                                <path fill="currentColor" fillOpacity={0.15} d="M24 4a20 20 0 1 0 0 40A20 20 0 0 0 24 4z" />
                                <path fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" d="M24 4a20 20 0 1 0 0 40A20 20 0 0 0 24 4z" />
                                <path fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" d="M24 15v10l6 4" />
                            </>
                        ) : (
                            <>
                                <path fill="currentColor" fillOpacity={0.15} d="M10 6h28a2 2 0 0 1 2 2v32a2 2 0 0 1-2 2H10a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2z" />
                                <path fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" d="M10 6h28a2 2 0 0 1 2 2v32a2 2 0 0 1-2 2H10a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2z" />
                                <path fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" d="M15 17h18M15 23h18M15 29h10" />
                                <circle cx="36" cy="36" r="7" fill={primaryColor} />
                                <path fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" d="M33 36l2 2 4-4" />
                            </>
                        )}
                    </SvgIcon>
                </Box>
                <Box sx={{ textAlign: 'center' }}>
                    <Typography fontWeight={600} sx={{ fontSize: '0.9rem', color: 'text.primary', mb: 0.4 }}>
                        {isExpiring ? t('noExpiringTitle') : t('noContractsTitle')}
                    </Typography>
                    <Typography variant="body2" sx={{ color: 'text.secondary', fontSize: '0.78rem', maxWidth: 220, mx: 'auto' }}>
                        {isExpiring ? t('noExpiringDesc') : t('noContractsDesc')}
                    </Typography>
                </Box>
                {!isExpiring && (
                    <Button variant="contained" size="small" onClick={() => router.push('/contracts?status=active')}
                        sx={{ textTransform: 'none', fontSize: '0.8rem', borderRadius: 2, px: 2.5, py: 0.6, boxShadow: `0 2px 8px ${alpha(primaryColor, 0.3)}` }}>
                        {t('goToContracts')}
                    </Button>
                )}
            </Box>
        );
    };

    const accentColor = isDark
        ? (activeTab === 'expiring' ? '#b8935a' : primaryColor)
        : (activeTab === 'expiring' ? '#d97706' : primaryColor);
    const sectionBg = isDark ? 'none' : '#fafafa';

    return (
        <Fade in timeout={800}>
            <Paper elevation={0} sx={{
                borderRadius: 3,
                border: '1px solid',
                borderColor: alpha(accentColor, 0.2),
                background: sectionBg,
                height: '100%',
                boxShadow: `0 4px 20px ${alpha(accentColor, 0.1)}, 0 1px 4px rgba(0,0,0,0.06)`,
                display: 'flex',
                flexDirection: 'column',
                overflow: 'hidden',
                // Bold top accent bar
                borderTop: `3px solid ${primaryColor}`,
            }}>

                {/* ── Header ─────────────────────────────────────────── */}
                <Box sx={{ px: 1.75, pt: 1.5, pb: 1, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                        <Box sx={{
                            width: 34, height: 34, borderRadius: 1.5,
                            background: `linear-gradient(135deg, ${alpha(primaryColor, 0.65)}, ${primaryColor})`,
                            display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
                            boxShadow: `0 3px 10px ${accentColor}45`,
                        }}>
                            <ArticleOutlinedIcon sx={{ fontSize: 17, color: 'white' }} />
                        </Box>
                        <Box>
                            <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75 }}>
                                <Typography fontWeight={700} sx={{ fontSize: '0.95rem', color: 'text.primary', lineHeight: 1.2 }}>
                                    {activeTab === 'recent' ? t('title') : t('expiringSoon')}
                                </Typography>
                                {count > 0 && (
                                    <Box sx={{
                                        px: 0.75, py: 0.1, borderRadius: 1,
                                        bgcolor: isDark ? 'rgba(168,124,90,0.14)' : `${accentColor}18`,
                                        border: `1px solid ${isDark ? 'rgba(168,124,90,0.30)' : `${accentColor}40`}`,
                                    }}>
                                        <Typography sx={{ fontSize: '0.65rem', fontWeight: 700, color: isDark ? '#c4956a' : accentColor }}>
                                            {count}
                                        </Typography>
                                    </Box>
                                )}
                            </Box>
                            <Typography sx={{ color: 'text.secondary', fontSize: '0.72rem' }}>
                                {activeTab === 'recent' ? t('latestActivity') : t('expiringByUrgency')}
                            </Typography>
                        </Box>
                    </Box>

                    <Button
                        variant="outlined"
                        size="small"
                        onClick={() => router.push(activeTab === 'expiring' ? '/contracts?status=expiring' : '/contracts?status=all')}
                        endIcon={<ArrowForwardIcon sx={{ fontSize: '0.7rem !important' }} />}
                        sx={{
                            textTransform: 'none', fontSize: '0.73rem', fontWeight: 600,
                            borderRadius: 1.5, py: 0.35, px: 1.1, minWidth: 0,
                            color: primaryColor, borderColor: `${primaryColor}60`,
                            '&:hover': { bgcolor: `${primaryColor}0e`, borderColor: primaryColor },
                        }}
                    >
                        {t('viewAll')}
                    </Button>
                </Box>

                {/* ── Body ───────────────────────────────────────────── */}
                <Box sx={{ px: 1.75, pb: 1.5, display: 'flex', flexDirection: 'column', flex: 1 }}>

                {/* ── Tab switcher (unchanged) ────────────────────────── */}
                <Box sx={{ display: 'flex', gap: 0.5, mb: 1.25, p: 0.4, bgcolor: 'rgba(0,0,0,0.04)', borderRadius: 2, width: 'fit-content' }}>
                    {([
                        { key: 'recent', label: t('tabRecent') },
                        { key: 'expiring', label: `${t('tabExpiring')}${expiringContracts.length > 0 ? ` (${expiringContracts.length})` : ''}` },
                    ] as { key: ActiveTab; label: string }[]).map(tab => (
                        <Button key={tab.key} size="small" onClick={() => setActiveTab(tab.key)}
                            sx={{
                                textTransform: 'none',
                                fontSize: '0.78rem',
                                fontWeight: activeTab === tab.key ? 700 : 500,
                                px: 1.5, py: 0.4,
                                borderRadius: 1.5,
                                minWidth: 0,
                                bgcolor: activeTab === tab.key
                                    ? tab.key === 'expiring'
                                        ? (isDark ? 'rgba(184,147,90,0.12)' : 'rgba(180,83,9,0.08)')
                                        : (isDark ? 'rgba(82,183,136,0.10)' : 'rgba(22,163,74,0.09)')
                                    : 'transparent',
                                color: activeTab === tab.key
                                    ? tab.key === 'expiring'
                                        ? (isDark ? '#b8935a' : '#b45309')
                                        : (isDark ? '#6ab89a' : '#15803d')
                                    : 'text.secondary',
                                boxShadow: activeTab === tab.key ? '0 1px 3px rgba(0,0,0,0.08)' : 'none',
                                '&:hover': {
                                    bgcolor: activeTab === tab.key
                                        ? tab.key === 'expiring'
                                            ? (isDark ? 'rgba(184,147,90,0.12)' : 'rgba(180,83,9,0.08)')
                                            : (isDark ? 'rgba(82,183,136,0.10)' : 'rgba(22,163,74,0.09)')
                                        : 'rgba(0,0,0,0.04)',
                                },
                            }}>
                            {tab.label}
                        </Button>
                    ))}
                </Box>

                {/* ── Content ─────────────────────────────────────────── */}
                {displayContracts.length === 0 ? renderEmptyState() : (
                    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
                        {displayContracts.map((contract, index) => {
                            const sc = getStatusColor(contract.status);
                            const isHovered = hoveredId === contract.id;

                            return (
                                <Grow key={contract.id} in timeout={350 + index * 100} style={{ transformOrigin: '0 0 0' }}>
                                    <Box
                                        onMouseEnter={() => setHoveredId(contract.id)}
                                        onMouseLeave={() => setHoveredId(null)}
                                        onClick={() => router.push(contract.path)}
                                        sx={{
                                            px: 1.25,
                                            py: 1,
                                            borderRadius: 2,
                                            border: '1px solid',
                                            borderColor: isHovered ? sc.accent : alpha(primaryColor, isDark ? 0.25 : 0.2),
                                            bgcolor: isHovered
                                                ? isDark ? alpha(sc.accent, 0.14) : alpha(sc.accent, 0.08)
                                                : isDark ? alpha('#ffffff', 0.04) : '#fafafa',
                                            transition: 'all 0.2s ease',
                                            cursor: 'pointer',
                                            position: 'relative',
                                            overflow: 'hidden',
                                            boxShadow: isHovered
                                                ? isDark
                                                    ? `0 6px 20px ${alpha(sc.accent, 0.12)}, 0 2px 6px ${alpha(sc.accent, 0.07)}`
                                                    : `0 6px 20px ${alpha(sc.accent, 0.28)}, 0 2px 6px ${alpha(sc.accent, 0.14)}`
                                                : '0 1px 4px rgba(0,0,0,0.06)',
                                            // Rounded left accent bar via ::before
                                            '&::before': {
                                                content: '""',
                                                position: 'absolute',
                                                left: 0,
                                                top: '14%',
                                                bottom: '14%',
                                                width: 3,
                                                borderRadius: '0 3px 3px 0',
                                                bgcolor: isHovered ? sc.accent : primaryColor,
                                                opacity: isHovered ? 1 : 0.6,
                                                transition: 'opacity 0.2s ease',
                                            },
                                        }}
                                    >
                                        {/* Row 1: title + status dot + chip + days badge */}
                                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75, mb: 0.5 }}>
                                            {/* Status dot */}
                                            <Box sx={{ width: 7, height: 7, borderRadius: '50%', bgcolor: 'text.disabled', flexShrink: 0 }} />

                                            <Typography fontWeight={600} sx={{
                                                fontSize: '0.83rem', color: 'text.primary', flex: 1, minWidth: 0,
                                                overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                                            }}>
                                                {contract.title}
                                            </Typography>

                                            <Chip
                                                label={tStatus(contract.status as Parameters<typeof tStatus>[0])}
                                                size="small"
                                                sx={{
                                                    bgcolor: isHovered ? sc.bg : (isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.06)'),
                                                    color: isHovered ? sc.text : 'text.secondary',
                                                    border: `1px solid ${isHovered ? sc.border : (isDark ? 'rgba(255,255,255,0.12)' : 'rgba(0,0,0,0.12)')}`,
                                                    fontWeight: 600, fontSize: '0.62rem', height: 17, flexShrink: 0,
                                                    transition: 'all 0.2s ease',
                                                    '& .MuiChip-label': { px: 0.6 },
                                                }}
                                            />

                                            {contract.daysLeft > 0 && (
                                                <Box sx={{
                                                    px: 0.65, py: 0.1, borderRadius: 0.75, flexShrink: 0,
                                                    bgcolor: isHovered ? `${sc.accent}18` : (isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.06)'),
                                                    border: `1px solid ${isHovered ? `${sc.accent}35` : (isDark ? 'rgba(255,255,255,0.12)' : 'rgba(0,0,0,0.12)')}`,
                                                    transition: 'all 0.2s ease',
                                                }}>
                                                    <Typography sx={{ fontSize: '0.65rem', fontWeight: 700, color: isHovered ? sc.accent : 'text.secondary', whiteSpace: 'nowrap', transition: 'color 0.2s ease' }}>
                                                        {contract.daysLeft}d
                                                    </Typography>
                                                </Box>
                                            )}
                                        </Box>

                                        {/* Divider */}
                                        <Divider sx={{ mb: 0.6, borderColor: `${sc.accent}20` }} />

                                        {/* Row 2: meta + View */}
                                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap' }}>
                                            <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.35 }}>
                                                <BusinessOutlinedIcon sx={{ fontSize: 10, color: 'text.disabled' }} />
                                                <Typography sx={{ fontSize: '0.7rem', color: 'text.secondary' }}>{contract.company}</Typography>
                                            </Box>

                                            <Box sx={{ width: 2.5, height: 2.5, borderRadius: '50%', bgcolor: 'text.disabled', flexShrink: 0 }} />

                                            <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.35 }}>
                                                <CategoryOutlinedIcon sx={{ fontSize: 10, color: 'text.disabled' }} />
                                                <Typography sx={{ fontSize: '0.7rem', color: 'text.secondary' }}>{contract.category}</Typography>
                                            </Box>

                                            <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.35 }}>
                                                <CalendarTodayOutlinedIcon sx={{ fontSize: 10, color: 'text.disabled' }} />
                                                <Typography sx={{ fontSize: '0.7rem', color: 'text.secondary', display: 'flex', alignItems: 'center', gap: 0.3 }}>
                                                    {contract.startDate}
                                                    <ArrowForwardIcon sx={{ fontSize: 9, color: 'text.disabled', mx: 0.2 }} />
                                                    <span style={{ color: sc.accent, fontWeight: 500 }}>{contract.endDate}</span>
                                                </Typography>
                                            </Box>

                                            <Button size="small" onClick={(e) => { e.stopPropagation(); router.push(contract.path); }}
                                                sx={{
                                                    ml: 'auto', textTransform: 'none', fontSize: '0.68rem', fontWeight: 600,
                                                    py: 0.1, px: 0.75, minWidth: 0, borderRadius: 1,
                                                    color: isHovered ? sc.accent : 'text.secondary',
                                                    transition: 'color 0.2s ease',
                                                    flexShrink: 0,
                                                    '&:hover': { bgcolor: `${sc.accent}15` },
                                                }}>
                                                {t('view')}
                                            </Button>
                                        </Box>
                                    </Box>
                                </Grow>
                            );
                        })}
                    </Box>
                )}
                </Box>
            </Paper>
        </Fade>
    );
}
