'use client';

import { Box } from '@mui/material';
import NotificationsNoneIcon from '@mui/icons-material/NotificationsNone';
import NotificationItem, { Notification } from './NotificationItem';
import EmptyState from '@/components/common/EmptyState';

interface NotificationListProps {
    notifications: Notification[];
    onViewContract?: (contractId: string) => void;
}

export default function NotificationList({ notifications, onViewContract }: NotificationListProps) {
    if (notifications.length === 0) {
        return (
            <EmptyState
                icon={<NotificationsNoneIcon />}
                title="No notifications"
                description="You're all caught up!"
            />
        );
    }

    return (
        <Box>
            {notifications.map((notification) => (
                <NotificationItem
                    key={notification.id}
                    notification={notification}
                    onViewContract={onViewContract}
                />
            ))}
        </Box>
    );
}
