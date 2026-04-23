'use client';

import { Box, Typography, Button } from '@mui/material';
import AppLayout from '@/components/layout/AppLayout';
import StatsCard from '@/components/dashboard/StatsCard';
import RecentContracts from '@/components/dashboard/RecentContracts';
import { useState, useEffect } from 'react';
import { contractService } from '@/services/contractService';
import { authService } from '@/services/authService';
import { useRouter } from 'next/navigation';
import CreateContractDialog from '@/components/contracts/CreateContractDialog';
import { ContractStatus } from '@/types/contract';
import { useTranslations } from 'next-intl';
import { useThemeName } from '@/context/ThemeContext';

export default function DashboardPage() {
    const router = useRouter();
    const t = useTranslations('dashboard');
    const { themeName } = useThemeName();
    const currentUser = authService.getCurrentUser();
    const displayName = currentUser?.email
        ? currentUser.email.split('@')[0].replace(/[._-]/g, ' ').replace(/\b\w/g, c => c.toUpperCase())
        : 'there';
    const [stats, setStats] = useState({
        draftCount: 0,
        underReviewCount: 0,
        underApprovalCount: 0,
        activeCount: 0,
        expiringCount: 0,
        expiredCount: 0,
        requestedCount: 0,
        receivedSignedCount: 0,
        waitingForSigCount: 0,
    });

    useEffect(() => {
        const loadStats = async () => {
            const currentUser = authService.getCurrentUser();
            if (!currentUser) return;

            try {
                const allContracts = await contractService.getAllContracts();

                // Count logic for all statuses
                let draft = 0;
                let underReview = 0;
                let underApproval = 0;
                let active = 0;
                let expiring = 0;
                let expired = 0;
                let requested = 0;
                let receivedSigned = 0;
                let waitingForSig = 0;

                if (Array.isArray(allContracts)) {
                    // Build a status lookup so we can apply the same superseded-chain
                    // exclusion that the contracts page uses (hide old expired versions
                    // whose renewal has already progressed or been terminated).
                    const statusById = new Map(allContracts.map(c => [c.id, c.status]));

                    allContracts.forEach(c => {
                        const isCreator = c.createdBy === currentUser.email;
                        // Unlocked internal signer = it's their turn to sign
                        const isInternalSignerPending = (c.internalSigners || []).some(
                            (s: any) => s.email === currentUser.email && s.status === 'unlocked'
                        );
                        // Legacy single-signer flow
                        const isLegacySigner = c.signer?.email === currentUser.email;

                        const isRelevant = isCreator || isInternalSignerPending || isLegacySigner;
                        if (!isRelevant) return;

                        // Creator-owned contract counters
                        if (isCreator) {
                            if (c.status === ContractStatus.DRAFT) draft++;
                            if (
                                c.status === ContractStatus.IN_REVIEW ||
                                c.status === ContractStatus.REVIEW_APPROVAL
                            ) underReview++;
                            if (
                                c.status === ContractStatus.IN_APPROVAL ||
                                c.status === ContractStatus.REVIEWED
                            ) underApproval++;
                            if (c.status === ContractStatus.ACTIVE) active++;
                            if (c.status === ContractStatus.EXPIRING) expiring++;

                            // Only count expired contracts that are actually visible on the
                            // contracts page. Mirror the exact same exclusion logic:
                            // hide if the contract has a renewal whose status is anything
                            // beyond draft-stage (same set as CONTRACT_PAGE_STATUSES) or terminated.
                            if (c.status === ContractStatus.EXPIRED) {
                                let superseded = false;
                                if (c.renewedContractId) {
                                    const renewalStatus = statusById.get(c.renewedContractId);
                                    const hiddenWhenRenewalIs = new Set([
                                        ContractStatus.APPROVED,
                                        ContractStatus.READY_FOR_SIGNATURE,
                                        ContractStatus.WAITING_FOR_SIGNATURE,
                                        ContractStatus.SIGNED_BY_EVERYONE,
                                        ContractStatus.SIGNED,
                                        ContractStatus.ACTIVE,
                                        ContractStatus.EXPIRING,
                                        ContractStatus.EXPIRED,
                                        ContractStatus.TERMINATED,
                                    ]);
                                    if (renewalStatus && hiddenWhenRenewalIs.has(renewalStatus as ContractStatus)) {
                                        superseded = true;
                                    }
                                }
                                if (!superseded) expired++;
                            }

                            // Shared but not all signed yet
                            if (c.status === ContractStatus.WAITING_FOR_SIGNATURE) requested++;
                            // All assigned parties have signed
                            if (c.status === ContractStatus.SIGNED_BY_EVERYONE) receivedSigned++;
                        }

                        // Contracts THIS user still needs to sign (not yet completed)
                        if (
                            isInternalSignerPending ||
                            (isLegacySigner && c.status === ContractStatus.WAITING_FOR_SIGNATURE)
                        ) {
                            waitingForSig++;
                        }
                    });
                } else {
                    console.error("DashboardPage: getAllContracts returned non-array", allContracts);
                }

                setStats({
                    draftCount: draft,
                    underReviewCount: underReview,
                    underApprovalCount: underApproval,
                    activeCount: active,
                    expiringCount: expiring,
                    expiredCount: expired,
                    requestedCount: requested,
                    receivedSignedCount: receivedSigned,
                    waitingForSigCount: waitingForSig,
                });
            } catch (error) {
                console.error("DashboardPage: Failed to load stats", error);
            }
        };

        loadStats();
    }, []);

    const statsData = [
        {
            title: t('draft'),
            value: stats.draftCount,
            description: 'In draft status',
            icon: 'document' as const,
            iconColor: '#57a8de',
            iconBgColor: '#ddf8ff',
            path: '/draft?status=draft'
        },
        {
            title: t('inProgress'),
            value: stats.underReviewCount + stats.underApprovalCount,
            description: 'Under review or approval',
            icon: 'clock' as const,
            iconColor: '#ed3a88',
            iconBgColor: '#fee9f3',
            path: '/draft?title=In+Progress&status=draft,in_review,in_approval,review_approval,reviewed'
        },
        {
            title: t('sendForSignature'),
            value: stats.requestedCount,
            description: 'Shared, awaiting signatures',
            icon: 'send' as const,
            iconColor: '#7c3aed',
            iconBgColor: '#ede9fe',
            path: '/contracts?status=waiting_for_signature'
        },
        {
            title: t('waitingForMySignature'),
            value: stats.waitingForSigCount,
            description: 'Pending your signature',
            icon: 'pending' as const,
            iconColor: '#e1781d',
            iconBgColor: '#fff2e4',
            path: '/signatures?status=pending'
        },
        {
            title: t('signedContracts'),
            value: stats.receivedSignedCount,
            description: 'All parties signed',
            icon: 'taskalt' as const,
            iconColor: '#2563eb',
            iconBgColor: '#dbeafe',
            path: '/contracts?status=signed_by_everyone'
        },
        {
            title: t('activeContracts'),
            value: stats.activeCount,
            description: 'Currently active',
            icon: 'bolt' as const,
            iconColor: '#10b981',
            iconBgColor: '#d1fae5',
            path: '/contracts?status=active'
        },
        {
            title: t('expiringSoon'),
            value: stats.expiringCount,
            description: 'Action required',
            icon: 'warning' as const,
            iconColor: '#f59e0b',
            iconBgColor: '#fef3c7',
            path: '/contracts?status=expiring'
        },
        {
            title: t('expired'),
            value: stats.expiredCount,
            description: 'No longer active',
            icon: 'cancel' as const,
            iconColor: '#ef4444',
            iconBgColor: '#fee2e2',
            path: '/contracts?status=expired'
        },
    ];

    const [createWizardOpen, setCreateWizardOpen] = useState(false);

    return (
        <AppLayout>
            {/* Full-page scrollable container */}
            <Box sx={{ height: '100%', overflowY: 'auto' }}>

                {/* ── Hero Banner ──────────────────────────────────────── */}
                <Box
                    sx={{
                        position: 'relative',
                        background: (theme) => {
                            if (themeName === 'sunrise') {
                                return 'linear-gradient(to right, rgba(168, 60, 33, 0.85), rgba(216, 90, 56, 0.3)), url("/images/rising-sun.avif") center/cover no-repeat';
                            }
                            if (themeName === 'forest') {
                                return 'linear-gradient(to right, rgba(16, 42, 24, 0.9), rgba(46, 125, 50, 0.3)), url("/images/forest-theme.avif") center/cover no-repeat';
                            }
                            if (themeName === 'water') {
                                return 'linear-gradient(to right, rgba(0, 54, 58, 0.9), rgba(0, 131, 143, 0.3)), url("/images/water.avif") center/cover no-repeat';
                            }
                            return theme.palette.mode === 'dark'
                                ? 'linear-gradient(135deg, #0c0a1e 0%, #130f2e 40%, #1a1240 72%, #0f0b28 100%)'
                                : `linear-gradient(135deg, ${theme.palette.primary.dark} 0%, ${theme.palette.primary.main} 45%, ${theme.palette.primary.main}cc 80%, ${theme.palette.primary.light} 100%)`;
                        },
                        pt: { xs: 2, md: 3 },
                        pb: { xs: 11, md: 13 },
                        px: { xs: 2, md: 3 },
                        overflow: 'hidden',
                    }}
                >
                    {/* Decorative blurred circles */}
                    <Box sx={{ position: 'absolute', top: -40, right: -40, width: 220, height: 220, borderRadius: '50%', bgcolor: 'rgba(255,255,255,0.06)', pointerEvents: 'none' }} />
                    <Box sx={{ position: 'absolute', top: 30, right: 120, width: 120, height: 120, borderRadius: '50%', bgcolor: 'rgba(255,255,255,0.05)', pointerEvents: 'none' }} />
                    <Box sx={{ position: 'absolute', bottom: 20, left: -30, width: 160, height: 160, borderRadius: '50%', bgcolor: 'rgba(255,255,255,0.04)', pointerEvents: 'none' }} />

                    {/* Hero content — 3-column row: label | buttons | greeting */}
                    <Box sx={{
                        position: 'relative',
                        zIndex: 1,
                        display: 'grid',
                        gridTemplateColumns: { xs: '1fr', sm: '1fr auto 1fr' },
                        alignItems: 'center',
                        gap: 2,
                    }}>
                        {/* Left: Dashboard label */}
                        <Box>
                            <Typography variant="h5" sx={{ color: 'rgba(255,255,255,0.75)', textTransform: 'uppercase' }}>
                                {t('title')}
                            </Typography>
                        </Box>

                        {/* Center: Action buttons */}
                        <Box sx={{ display: 'flex', gap: 3, justifyContent: 'center' }}>
                            <Button
                                variant="text"
                                onClick={() => router.push('/template')}
                                sx={{
                                    color: 'rgba(255,255,255,0.85)',
                                    fontSize: '0.85rem',
                                    fontWeight: 500,
                                    textTransform: 'none',
                                    px: 1,
                                    py: 0.5,
                                    minWidth: 0,
                                    borderRadius: 0,
                                    position: 'relative',
                                    '&::after': {
                                        content: '""',
                                        position: 'absolute',
                                        bottom: 0,
                                        left: '50%',
                                        width: 0,
                                        height: '1px',
                                        background: 'rgba(255,255,255,0.7)',
                                        transition: 'width 0.35s cubic-bezier(0.4,0,0.2,1), left 0.35s cubic-bezier(0.4,0,0.2,1)',
                                    },
                                    '&:hover': { color: 'white', bgcolor: 'transparent' },
                                    '&:hover::after': { width: '100%', left: 0 },
                                }}
                            >
                                {t('browseTemplates')}
                            </Button>
                            <Button
                                variant="text"
                                onClick={() => setCreateWizardOpen(true)}
                                sx={{
                                    color: 'rgba(255,255,255,0.85)',
                                    fontSize: '0.85rem',
                                    fontWeight: 500,
                                    textTransform: 'none',
                                    px: 1,
                                    py: 0.5,
                                    minWidth: 0,
                                    borderRadius: 0,
                                    position: 'relative',
                                    '&::after': {
                                        content: '""',
                                        position: 'absolute',
                                        bottom: 0,
                                        left: '50%',
                                        width: 0,
                                        height: '1px',
                                        background: 'rgba(255,255,255,0.7)',
                                        transition: 'width 0.35s cubic-bezier(0.4,0,0.2,1), left 0.35s cubic-bezier(0.4,0,0.2,1)',
                                    },
                                    '&:hover': { color: 'white', bgcolor: 'transparent' },
                                    '&:hover::after': { width: '100%', left: 0 },
                                }}
                            >
                                {t('createContract')}
                            </Button>
                        </Box>

                        {/* Right: Hi, Name + avatar */}
                        <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 1.5 }}>
                            <Typography sx={{ color: 'rgba(255,255,255,0.85)', fontSize: '0.85rem', fontWeight: 500 }}>
                                {t('hi')}, <strong style={{ color: 'white' }}>{displayName}</strong>
                            </Typography>
                            <Box sx={{
                                width: 34,
                                height: 34,
                                borderRadius: '25%',
                                bgcolor: 'rgba(255,255,255,0.2)',
                                border: '2px solid rgba(255,255,255,0.4)',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                flexShrink: 0,
                            }}>
                                <Typography sx={{ color: 'white', fontSize: '0.8rem', fontWeight: 700, lineHeight: 1 }}>
                                    {displayName.charAt(0).toUpperCase()}
                                </Typography>
                            </Box>
                        </Box>
                    </Box>
                </Box>

                {/* ── First 4 cards — overlap the hero ─────────────────── */}
                <Box
                    sx={{
                        mt: { xs: -5, md: -6 },
                        mx: { xs: 1, md: 2 },
                        position: 'relative',
                        zIndex: 2,
                        display: 'grid',
                        gridTemplateColumns: { xs: '1fr', sm: 'repeat(2, 1fr)', lg: 'repeat(4, 1fr)' },
                        gap: 1.5,
                    }}
                >
                    {statsData.slice(0, 4).map((stat, index) => (
                        <StatsCard
                            key={stat.title}
                            title={stat.title}
                            value={stat.value}
                            description={stat.description}
                            icon={stat.icon}
                            iconColor={stat.iconColor}
                            iconBgColor={stat.iconBgColor}
                            index={index}
                            onClick={() => router.push(stat.path)}
                        />
                    ))}
                </Box>

                {/* ── Last 4 cards ──────────────────────────────────────── */}
                <Box
                    sx={{
                        mt: 1.5,
                        mx: { xs: 1, md: 2 },
                        display: 'grid',
                        gridTemplateColumns: { xs: '1fr', sm: 'repeat(2, 1fr)', lg: 'repeat(4, 1fr)' },
                        gap: 1.5,
                    }}
                >
                    {statsData.slice(4).map((stat, index) => (
                        <StatsCard
                            key={stat.title}
                            title={stat.title}
                            value={stat.value}
                            description={stat.description}
                            icon={stat.icon}
                            iconColor={stat.iconColor}
                            iconBgColor={stat.iconBgColor}
                            index={index + 4}
                            onClick={() => router.push(stat.path)}
                        />
                    ))}
                </Box>

                {/* ── Recent Contracts ─────────────────────────────────── */}
                <Box sx={{ mt: 2, mx: { xs: 1, md: 2 }, mb: 2 }}>
                    <RecentContracts />
                </Box>

            </Box>

            {/* Create Contract Wizard */}
            <CreateContractDialog
                open={createWizardOpen}
                onClose={() => setCreateWizardOpen(false)}
            />
        </AppLayout>
    );
}
