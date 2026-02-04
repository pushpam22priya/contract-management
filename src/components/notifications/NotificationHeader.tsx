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
        <Box sx={{ mb: 3, display: 'flex', gap: 1.5, flexWrap: 'wrap' }}>
            {filters.map((filter) => (
                <Chip
                    key={filter.key}
                    label={`${filter.label} (${filter.count})`}
                    onClick={() => onFilterChange(filter.key)}
                    sx={{
                        px: 1,
                        height: 36,
                        fontSize: '0.875rem',
                        fontWeight: 500,
                        bgcolor: selectedFilter === filter.key ? 'text.primary' : 'background.paper',
                        color: selectedFilter === filter.key ? 'white' : 'text.secondary',
                        border: '1px solid',
                        borderColor: selectedFilter === filter.key ? 'text.primary' : 'divider',
                        transition: 'all 0.2s',
                        cursor: 'pointer',
                        '&:hover': {
                            bgcolor: selectedFilter === filter.key ? 'text.primary' : 'action.hover',
                            borderColor: selectedFilter === filter.key ? 'text.primary' : 'text.secondary',
                        },
                    }}
                />
            ))}
        </Box>
    );
}
