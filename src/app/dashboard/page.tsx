'use client';

import { Box, Typography } from '@mui/material';
import AppLayout from '@/components/layout/AppLayout';
import CriticalAlerts from '@/components/dashboard/CriticalAlerts';
import StatsCard from '@/components/dashboard/StatsCard';
import RecentContracts from '@/components/dashboard/RecentContracts';
import QuickActions from '@/components/dashboard/QuickActions';
import CreateContractWizard from '@/components/contracts/CreateContractWizard';
import { useState, useEffect } from 'react';
import { contractService } from '@/services/contractService';
import { authService } from '@/services/authService';
import { useRouter } from 'next/navigation';

export default function DashboardPage() {
    const router = useRouter();
    const [stats, setStats] = useState({
        activeCount: 0,
        expiringCount: 0,
        pendingCount: 0
    });

    useEffect(() => {
        const currentUser = authService.getCurrentUser();
        if (!currentUser) return;

        const allContracts = contractService.getAllContracts();

        // Count logic
        let active = 0;
        let expiring = 0;
        let pending = 0; // Contracts requiring review/approval

        allContracts.forEach(c => {
            const isRelevant = c.createdBy === currentUser.email || c.signer?.email === currentUser.email;

            // Only count if relevant to the user
            if (!isRelevant) return;

            if (c.status === 'active') active++;
            if (c.status === 'expiring') expiring++;

            // "Pending Approval" usually refers to contracts in 'review_approval' status
            // Depending on definition, it could also include 'waiting_for_signature' but user specifically said "approval screen"
            if (c.status === 'review_approval') pending++;
        });

        setStats({
            activeCount: active,
            expiringCount: expiring,
            pendingCount: pending
        });
    }, []);

    const statsData = [
        {
            title: 'Active Contracts',
            value: stats.activeCount,
            description: 'Currently Active',
            icon: 'check' as const,
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
            title: 'Pending Approval',
            value: stats.pendingCount,
            description: 'Awaiting review',
            icon: 'clock' as const,
            iconColor: '#3b82f6',
            iconBgColor: '#dbeafe',
            path: '/draft?status=review_approval'
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
                router.push('/contracts?status=expiring');
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
                    Welcome back! Here's your contract overview
                </Typography>

                {/* Critical Alerts Section */}
                <CriticalAlerts />

                {/* Stats Cards Grid */}
                <Box
                    sx={{
                        display: 'grid',
                        gridTemplateColumns: {
                            xs: '1fr',
                            sm: 'repeat(2, 1fr)',
                            lg: 'repeat(3, 1fr)',
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
            <CreateContractWizard
                open={createWizardOpen}
                onClose={() => setCreateWizardOpen(false)}
            />
        </AppLayout>
    );
}
