'use client';

import { Box, Typography, Button } from '@mui/material';

interface NotificationHeaderProps {
    onMarkAllRead?: () => void;
}

export default function NotificationHeader({ onMarkAllRead }: NotificationHeaderProps) {
    return (
        <Box sx={{ mb: 3, display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 2 }}>
            <Box>
                <Typography
                    // variant="h4"
                    sx={{
                        fontWeight: 600,
                        fontSize: { xs: '1.75rem', sm: '2rem', md: '20px' },
                        color: 'text.primary',
                        mb: 0.5,
                    }}
                >
                    Notifications
                </Typography>
                <Typography
                    variant="body2"
                    sx={{
                        color: 'text.secondary',
                        fontSize: '0.8rem',
                    }}
                >
                    Stay updated on contract activities and deadlines
                </Typography>
            </Box>

            <Button
                variant="outlined"
                onClick={onMarkAllRead}
                sx={{
                    textTransform: 'none',
                    borderColor: 'divider',
                    color: 'text.secondary',
                    fontWeight: 500,
                    '&:hover': {
                        borderColor: 'primary.main',
                        bgcolor: 'rgba(15, 118, 110, 0.04)',
                        color: 'primary.main',
                    },
                }}
            >
                Mark All as Read
            </Button>
        </Box>
    );
}
