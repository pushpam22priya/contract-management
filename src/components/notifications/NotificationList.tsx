'use client';

import { Box, Typography } from '@mui/material';
import NotificationItem, { Notification } from './NotificationItem';

interface NotificationListProps {
    notifications: Notification[];
    onViewContract?: (contractId: string) => void;
}

export default function NotificationList({ notifications, onViewContract }: NotificationListProps) {
    if (notifications.length === 0) {
        return (
            <Box
                sx={{
                    textAlign: 'center',
                    py: 8,
                    color: 'text.secondary',
                }}
            >
                <Typography variant="h6" sx={{ mb: 1, fontWeight: 500 }}>
                    No notifications found
                </Typography>
                <Typography variant="body2">
                    You're all caught up!
                </Typography>
            </Box>
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
