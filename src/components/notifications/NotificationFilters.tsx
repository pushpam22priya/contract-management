'use client';

import { Box, Chip } from '@mui/material';

interface NotificationFiltersProps {
    selectedFilter: 'unread' | 'all' | 'read';
    onFilterChange: (filter: 'unread' | 'all' | 'read') => void;
    unreadCount: number;
    allCount: number;
    readCount: number;
}

export default function NotificationFilters({
    selectedFilter,
    onFilterChange,
    unreadCount,
    allCount,
    readCount,
}: NotificationFiltersProps) {
    const filters = [
        { key: 'unread' as const, label: 'Unread', count: unreadCount },
        { key: 'all' as const, label: 'All Notifications', count: allCount },
        { key: 'read' as const, label: 'Read', count: readCount },
    ];

    return (
        <Box sx={{ mb: 2.5, display: 'flex', gap: 1, flexWrap: 'wrap' }}>
            {filters.map((filter) => {
                const active = selectedFilter === filter.key;
                return (
                    <Chip
                        key={filter.key}
                        label={`${filter.label} (${filter.count})`}
                        onClick={() => onFilterChange(filter.key)}
                        sx={{
                            px: 1,
                            height: 34,
                            fontSize: '0.85rem',
                            fontWeight: active ? 600 : 500,
                            bgcolor: active ? 'primary.main' : 'background.paper',
                            color: active ? 'white' : 'text.secondary',
                            border: '1px solid',
                            borderColor: active ? 'primary.main' : 'divider',
                            transition: 'all 0.2s',
                            cursor: 'pointer',
                            '&:hover': {
                                bgcolor: active ? 'primary.dark' : 'action.hover',
                                borderColor: active ? 'primary.dark' : 'text.secondary',
                            },
                        }}
                    />
                );
            })}
        </Box>
    );
}