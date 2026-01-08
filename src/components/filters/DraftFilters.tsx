'use client';

import { Box, Typography, TextField, InputAdornment, Autocomplete, Collapse, Button, Tooltip } from '@mui/material';
import { Search, FilterList, ExpandMore, ExpandLess } from '@mui/icons-material';
import { LocalizationProvider } from '@mui/x-date-pickers/LocalizationProvider';
import { AdapterDayjs } from '@mui/x-date-pickers/AdapterDayjs';
import { DatePicker } from '@mui/x-date-pickers/DatePicker';
import { Dayjs } from 'dayjs';

const categoryOptions = [
    { label: 'All Categories', value: 'all' },
    { label: 'Legal', value: 'legal' },
    { label: 'Finance', value: 'finance' },
    { label: 'HR', value: 'hr' },
    { label: 'Sales', value: 'sales' },
    { label: 'Service', value: 'service' },
];

interface DraftFiltersProps {
    searchQuery: string;
    onSearchChange: (value: string) => void;
    categoryFilter: { label: string; value: string };
    onCategoryChange: (value: { label: string; value: string }) => void;
    startDate: Dayjs | null;
    onStartDateChange: (value: Dayjs | null) => void;
    endDate: Dayjs | null;
    onEndDateChange: (value: Dayjs | null) => void;
    showAdvancedFilters: boolean;
    onAdvancedFiltersToggle: () => void;
    totalCount: number;
    filteredCount: number;
}

const DraftFilters = ({
    searchQuery,
    onSearchChange,
    categoryFilter,
    onCategoryChange,
    startDate,
    onStartDateChange,
    endDate,
    onEndDateChange,
    showAdvancedFilters,
    onAdvancedFiltersToggle,
    totalCount,
    filteredCount,
}: DraftFiltersProps) => {
    return (
        <LocalizationProvider dateAdapter={AdapterDayjs}>
            <Box
                sx={{
                    bgcolor: 'background.paper',
                    borderRadius: 3,
                    p: 1,
                    mb: 1.5,
                    boxShadow: '0 1px 3px rgba(0,0,0,0.08)',
                }}
            >
                {/* Filters Row: Search + Category + More Filters */}
                <Box
                    sx={{
                        display: 'grid',
                        gridTemplateColumns: {
                            xs: '1fr',
                            sm: 'repeat(2, 1fr)',
                            md: '2fr 1fr auto',
                        },
                        gap: 2,
                        mb: 1,
                        alignItems: 'center',
                    }}
                >
                    {/* Search Input */}
                    <TextField
                        fullWidth
                        placeholder="Search drafts or clients..."
                        value={searchQuery}
                        onChange={(e) => onSearchChange(e.target.value)}
                        InputProps={{
                            startAdornment: (
                                <InputAdornment position="start">
                                    <Search sx={{ color: 'text.secondary' }} />
                                </InputAdornment>
                            ),
                        }}
                        sx={{
                            gridColumn: { xs: '1', sm: '1 / -1', md: '1' },
                            '& .MuiOutlinedInput-root': {
                                bgcolor: '#f8fafc',
                                borderRadius: 2,
                                '&:hover': {
                                    bgcolor: '#f1f5f9',
                                },
                                '&.Mui-focused': {
                                    bgcolor: 'background.paper',
                                },
                            },
                            '& .MuiOutlinedInput-input': {
                                py: 1.25,
                                fontSize: '0.95rem',
                            },
                        }}
                    />

                    {/* Category Filter */}
                    <Autocomplete
                        value={categoryFilter}
                        onChange={(event, newValue) => {
                            onCategoryChange(newValue || categoryOptions[0]);
                        }}
                        options={categoryOptions}
                        disableClearable
                        renderInput={(params) => (
                            <TextField
                                {...params}
                                placeholder="Category"
                                sx={{
                                    '& .MuiOutlinedInput-root': {
                                        bgcolor: '#f8fafc',
                                        borderRadius: 2,
                                        padding: 0.5,
                                        '&:hover': {
                                            bgcolor: '#f1f5f9',
                                        },
                                        '&.Mui-focused': {
                                            bgcolor: 'background.paper',
                                        },
                                    },
                                    '& .MuiOutlinedInput-input': {
                                        fontSize: '0.95rem',
                                        fontWeight: 500,
                                    },
                                }}
                            />
                        )}
                    />

                    {/* More Filters Button */}
                    <Tooltip title={showAdvancedFilters ? "Hide date filters" : "Show date filters"} arrow>
                        <Button
                            startIcon={<FilterList />}
                            endIcon={showAdvancedFilters ? <ExpandLess /> : <ExpandMore />}
                            onClick={onAdvancedFiltersToggle}
                            sx={{
                                textTransform: 'none',
                                color: 'primary.main',
                                fontWeight: 500,
                                fontSize: '0.95rem',
                                px: 2,
                                py: 0.75,
                                borderRadius: 2,
                                bgcolor: showAdvancedFilters ? 'primary.lighter' : 'transparent',
                                whiteSpace: 'nowrap',
                                gridColumn: { xs: '1', sm: '1 / -1', md: 'auto' },
                                justifySelf: { xs: 'stretch', sm: 'stretch', md: 'start' },
                                '&:hover': {
                                    bgcolor: 'primary.lighter',
                                },
                                transition: 'all 0.3s ease',
                            }}
                        >
                            More Filters
                        </Button>
                    </Tooltip>
                </Box>

                {/* Advanced Filters - Collapsible */}
                <Collapse in={showAdvancedFilters} timeout="auto">
                    <Box
                        sx={{
                            mb: 2,
                            p: 2,
                            bgcolor: '#f8fafc',
                            borderRadius: 2,
                            border: '1px solid',
                            borderColor: 'divider',
                        }}
                    >
                        <Typography
                            variant="subtitle2"
                            sx={{
                                color: 'text.secondary',
                                fontWeight: 600,
                                mb: 2,
                                display: 'flex',
                                alignItems: 'center',
                                gap: 1,
                            }}
                        >
                            Filter by Draft Date Range
                        </Typography>

                        <Box
                            sx={{
                                display: 'grid',
                                gridTemplateColumns: {
                                    xs: '1fr',
                                    sm: 'repeat(2, 1fr)',
                                },
                                gap: 2,
                            }}
                        >
                            {/* Start Date */}
                            <DatePicker
                                label="Start Date"
                                value={startDate}
                                onChange={onStartDateChange}
                                slotProps={{
                                    textField: {
                                        fullWidth: true,
                                        placeholder: 'From',
                                        variant: 'standard',
                                        sx: {
                                            '& .MuiInput-root': {
                                                bgcolor: 'background.paper',
                                                borderRadius: 2,
                                                px: 1.5,
                                                py: 0.5,
                                                '&:before': {
                                                    display: 'none',
                                                },
                                                '&:after': {
                                                    display: 'none',
                                                },
                                                '&:hover': {
                                                    bgcolor: '#f1f5f9',
                                                },
                                            },
                                            '& .MuiInputLabel-root': {
                                                position: 'relative',
                                                transform: 'none',
                                                fontSize: '0.875rem',
                                                fontWeight: 600,
                                                color: 'text.primary',
                                                mb: 0.5,
                                            },
                                            '& .MuiInput-input': {
                                                fontSize: '0.95rem',
                                                fontWeight: 500,
                                            },
                                        },
                                    },
                                    field: { clearable: true },
                                }}
                            />

                            {/* End Date */}
                            <DatePicker
                                label="End Date"
                                value={endDate}
                                onChange={onEndDateChange}
                                minDate={startDate || undefined}
                                slotProps={{
                                    textField: {
                                        fullWidth: true,
                                        placeholder: 'To',
                                        variant: 'standard',
                                        sx: {
                                            '& .MuiInput-root': {
                                                bgcolor: 'background.paper',
                                                borderRadius: 2,
                                                px: 1.5,
                                                py: 0.5,
                                                '&:before': {
                                                    display: 'none',
                                                },
                                                '&:after': {
                                                    display: 'none',
                                                },
                                                '&:hover': {
                                                    bgcolor: '#f1f5f9',
                                                },
                                            },
                                            '& .MuiInputLabel-root': {
                                                position: 'relative',
                                                transform: 'none',
                                                fontSize: '0.875rem',
                                                fontWeight: 600,
                                                color: 'text.primary',
                                                mb: 0.5,
                                            },
                                            '& .MuiInput-input': {
                                                fontSize: '0.95rem',
                                                fontWeight: 500,
                                            },
                                        },
                                    },
                                    field: { clearable: true },
                                }}
                            />
                        </Box>
                    </Box>
                </Collapse>

                {/* Bottom Row: Results Count */}
                <Box
                    sx={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                        flexWrap: 'wrap',
                        gap: 2,
                    }}
                >
                    <Typography variant="body2" color="text.secondary">
                        Showing <strong>{filteredCount}</strong> of <strong>{totalCount}</strong> drafts
                    </Typography>
                </Box>
            </Box>
        </LocalizationProvider>
    );
};

export default DraftFilters;
