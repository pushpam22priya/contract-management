'use client';

import { Box, Typography } from '@mui/material';
import AppLayout from '@/components/layout/AppLayout';
import CriticalAlerts from '@/components/dashboard/CriticalAlerts';
import StatsCard from '@/components/dashboard/StatsCard';
import RecentContracts from '@/components/dashboard/RecentContracts';
import QuickActions from '@/components/dashboard/QuickActions';
import ContractsPieChart from '@/components/dashboard/ContractsPieChart';
import { useState, useEffect } from 'react';
import { contractService } from '@/services/contractService';
import { authService } from '@/services/authService';
import { useRouter } from 'next/navigation';
import CreateContractDialog from '@/components/contracts/CreateContractDialog';
import { ContractStatus } from '@/types/contract';

export default function DashboardPage() {
    const router = useRouter();
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
                            if (c.status === ContractStatus.EXPIRED) expired++;
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
            title: 'Draft',
            value: stats.draftCount,
            description: 'In draft status',
            icon: 'document' as const,
            iconColor: '#57a8de',
            iconBgColor: '#ddf8ff',
            path: '/draft?status=draft'
        },
        {
            title: 'In Progress',
            value: stats.underReviewCount + stats.underApprovalCount,
            description: 'Under review or approval',
            icon: 'clock' as const,
            iconColor: '#ed3a88',
            iconBgColor: '#fee9f3',
            path: '/draft?title=In+Progress&status=draft,in_review,in_approval,review_approval,reviewed'
        },
        {
            title: 'Requested for Signature',
            value: stats.requestedCount,
            description: 'Shared, awaiting signatures',
            icon: 'send' as const,
            iconColor: '#7c3aed',
            iconBgColor: '#ede9fe',
            path: '/contracts?status=waiting_for_signature'
        },
        {
            title: 'Waiting for My Signature',
            value: stats.waitingForSigCount,
            description: 'Pending your signature',
            icon: 'pending' as const,
            iconColor: '#e1781d',
            iconBgColor: '#fff2e4',
            path: '/signatures?status=pending'
        },
        {
            title: 'Signed Contracts',
            value: stats.receivedSignedCount,
            description: 'All parties signed',
            icon: 'taskalt' as const,
            iconColor: '#2563eb',
            iconBgColor: '#dbeafe',
            path: '/contracts?status=signed_by_everyone'
        },
        {
            title: 'Active Contracts',
            value: stats.activeCount,
            description: 'Currently active',
            icon: 'bolt' as const,
            iconColor: '#10b981',
            iconBgColor: '#d1fae5',
            path: '/contracts?status=active'
        },
        {
            title: 'Expiring Soon',
            value: stats.expiringCount,
            description: 'Action required',
            icon: 'warning' as const,
            iconColor: '#f59e0b',
            iconBgColor: '#fef3c7',
            path: '/contracts?status=expiring'
        },
        {
            title: 'Expired/Terminated',
            value: stats.expiredCount,
            description: 'No longer active',
            icon: 'cancel' as const,
            iconColor: '#ef4444',
            iconBgColor: '#fee2e2',
            path: '/contracts?status=expired'
        },
    ];

    const [createWizardOpen, setCreateWizardOpen] = useState(false);

    const handleQuickAction = (actionKey: string) => {
        switch (actionKey) {
            case 'create':
                setCreateWizardOpen(true);
                break;
            case 'templates':
                router.push('/template');
                break;
            case 'expiring':
                router.push(`/contracts?status=${ContractStatus.EXPIRING}`);
                break;
            case 'approvals':
                router.push('/review-approval?tab=approver');
                break;
        }
    };

    return (
        <AppLayout>
            <Box>
                <Typography fontSize={20} fontWeight={600} color="primary">
                    Dashboard
                </Typography>
                <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
                    Welcome back, <strong>{displayName}</strong> ! Here's your contract overview
                </Typography>

                {/* Critical Alerts Section */}
                {/* <CriticalAlerts /> */}

                {/* Stats Cards Grid with Pie Chart */}
                <Box
                    sx={{
                        display: 'grid',
                        gridTemplateColumns: {
                            xs: '1fr',
                            sm: 'repeat(2, 1fr)',
                            md: 'repeat(3, 1fr)',
                            lg: 'repeat(4, 1fr)',
                        },
                        gap: 1,
                    }}
                >
                    {statsData.map((stat, index) => (
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

                    {/* Pie Chart in the 8th position */}
                    {/* <ContractsPieChart
                        stats={{
                            draftCount: stats.draftCount,
                            underReviewCount: stats.underReviewCount,
                            underApprovalCount: stats.underApprovalCount,
                            activeCount: stats.activeCount,
                            expiringCount: stats.expiringCount,
                            expiredCount: stats.expiredCount,
                        }}
                    /> */}
                </Box>

                {/* Recent Contracts and Quick Actions Section */}
                <Box
                    sx={{
                        mt: 1.5,
                        display: 'grid',
                        gridTemplateColumns: {
                            xs: '1fr',
                            lg: '2fr 1fr',
                        },
                        gap: 1.5,
                    }}
                >
                    <RecentContracts />
                    <QuickActions onActionClick={handleQuickAction} />
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
