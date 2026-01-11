'use client';

import { useState } from 'react';
import { Box } from '@mui/material';
import { useRouter } from 'next/navigation';
import AppLayout from '@/components/layout/AppLayout';
import NotificationHeader from '@/components/notifications/NotificationHeader';
import NotificationStats from '@/components/notifications/NotificationStats';
import NotificationFilters from '@/components/notifications/NotificationFilters';
import NotificationList from '@/components/notifications/NotificationList';
import { Notification } from '@/components/notifications/NotificationItem';

// Sample notification data
const sampleNotifications: Notification[] = [
    {
        id: '1',
        type: 'warning',
        title: 'Contract Expiring Soon',
        description: 'Vendor Supply Agreement - SupplyCo expires in 12 days',
        timestamp: 'Jan 3, 2026, 10:30 AM',
        isRead: false,
        contractId: 'contract-1',
    },
    {
        id: '2',
        type: 'warning',
        title: 'Contract Expiring Soon',
        description: 'Consulting Services - Global Industries expires in 28 days',
        timestamp: 'Jan 3, 2026, 09:15 AM',
        isRead: false,
        contractId: 'contract-2',
    },
    {
        id: '3',
        type: 'success',
        title: 'Contract Activated',
        description: 'Annual Software Maintenance - TechCorp has been activated',
        timestamp: 'Jan 1, 2026, 02:20 PM',
        isRead: false,
        contractId: 'contract-3',
    },
    {
        id: '4',
        type: 'info',
        title: 'Contract Under Review',
        description: 'Marketing Agreement - AdCorp is pending approval',
        timestamp: 'Dec 30, 2025, 11:45 AM',
        isRead: true,
        contractId: 'contract-4',
    },
    {
        id: '5',
        type: 'success',
        title: 'Contract Signed',
        description: 'Service Level Agreement - DataFlow has been signed by all parties',
        timestamp: 'Dec 28, 2025, 04:10 PM',
        isRead: true,
        contractId: 'contract-5',
    },
];

export default function NotificationsPage() {
    const router = useRouter();
    const [notifications, setNotifications] = useState<Notification[]>(sampleNotifications);
    const [selectedFilter, setSelectedFilter] = useState<'unread' | 'all' | 'read'>('unread');

    // Calculate counts
    const unreadCount = notifications.filter((n) => !n.isRead).length;
    const readCount = notifications.filter((n) => n.isRead).length;
    const warningsCount = notifications.filter((n) => n.type === 'warning').length;
    const totalCount = notifications.length;

    // Filter notifications based on selected filter
    const filteredNotifications = notifications.filter((notification) => {
        if (selectedFilter === 'unread') return !notification.isRead;
        if (selectedFilter === 'read') return notification.isRead;
        return true; // 'all'
    });

    const handleMarkAllRead = () => {
        setNotifications(notifications.map((n) => ({ ...n, isRead: true })));
    };

    const handleViewContract = (contractId: string) => {
        console.log('Viewing contract:', contractId);
        router.push(`/contracts`);
    };

    return (
        <AppLayout>
            <Box>
                <NotificationHeader onMarkAllRead={handleMarkAllRead} />
{/* 
                <NotificationStats
                    unreadCount={unreadCount}
                    warningsCount={warningsCount}
                    totalCount={totalCount}
                /> */}

                <NotificationFilters
                    selectedFilter={selectedFilter}
                    onFilterChange={setSelectedFilter}
                    unreadCount={unreadCount}
                    allCount={totalCount}
                    readCount={readCount}
                />

                <NotificationList
                    notifications={filteredNotifications}
                    onViewContract={handleViewContract}
                />
            </Box>
        </AppLayout>
    );
}
