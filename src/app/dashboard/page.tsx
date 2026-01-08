import { Box, Typography } from '@mui/material';
import AppLayout from '@/components/layout/AppLayout';
import CriticalAlerts from '@/components/dashboard/CriticalAlerts';
import StatsCard from '@/components/dashboard/StatsCard';
import RecentContracts from '@/components/dashboard/RecentContracts';
import QuickActions from '@/components/dashboard/QuickActions';

const statsData = [
    {
        title: 'Active Contracts',
        value: 4,
        description: 'Currently Active',
        icon: 'check' as const,
        iconColor: '#10b981',
        iconBgColor: '#d1fae5',
    },
    {
        title: 'Expiring Soon',
        value: 2,
        description: 'Action required',
        icon: 'warning' as const,
        iconColor: '#f59e0b',
        iconBgColor: '#fef3c7',
    },
    {
        title: 'Pending Approval',
        value: 1,
        description: 'Awaiting review',
        icon: 'clock' as const,
        iconColor: '#3b82f6',
        iconBgColor: '#dbeafe',
    },
];

export default function DashboardPage() {
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
                    <QuickActions />
                </Box>
            </Box>
        </AppLayout>
    );
}
