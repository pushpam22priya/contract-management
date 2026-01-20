'use client';

import { Box, Typography, TextField, InputAdornment, Autocomplete, Collapse, Button, Tooltip, IconButton } from '@mui/material';
import { Search, FilterList, ExpandMore, ExpandLess } from '@mui/icons-material';
import { LocalizationProvider } from '@mui/x-date-pickers/LocalizationProvider';
import { AdapterDayjs } from '@mui/x-date-pickers/AdapterDayjs';
import { DatePicker } from '@mui/x-date-pickers/DatePicker';
import { Dayjs } from 'dayjs';

export interface FilterOption {
    label: string;
    value: any;
}

export interface FilterConfig {
    label: string; // The placeholder/label for the input
    value: any; // The current value (object or string depending on implementation, but typically the option object for Autocomplete)
    onChange: (newValue: any) => void;
    options: FilterOption[];
    minWidth?: number | string;
}

interface ReusableFilterProps {
    // Search
    searchQuery?: string;
    onSearchChange?: (value: string) => void;
    searchPlaceholder?: string;

    // Dynamic Filters (Dropdowns)
    filters?: FilterConfig[];

    // Date Range
    enableDateFilter?: boolean;
    startDate?: Dayjs | null;
    onStartDateChange?: (date: Dayjs | null) => void;
    endDate?: Dayjs | null;
    onEndDateChange?: (date: Dayjs | null) => void;
    showAdvancedFilters?: boolean;
    onAdvancedFiltersToggle?: () => void;
    dateFilterTitle?: string;

    // Counts / Footer
    showCounts?: boolean;
    filteredCount?: number;
    totalCount?: number;
    countLabel?: string; // e.g. "contracts", "drafts", "templates"

    // Extra actions (optional, for things not covered)
    extraActions?: React.ReactNode;
}

/**
 * A reusable filter component that provides search, dynamic dropdown filters,
 * collapsible date range picker, and result counts.
 */
const ReusableFilter = ({
    searchQuery = '',
    onSearchChange,
    searchPlaceholder = 'Search...',
    filters = [],
    enableDateFilter = false,
    startDate,
    onStartDateChange,
    endDate,
    onEndDateChange,
    showAdvancedFilters = false,
    onAdvancedFiltersToggle,
    dateFilterTitle = 'Filter by Date Range',
    showCounts = true,
    filteredCount = 0,
    totalCount = 0,
    countLabel = 'items',
    extraActions,
}: ReusableFilterProps) => {

    // Common styles
    const commonInputSx = {
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
    };

    const searchInputSx = {
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
    };

    const datePickerSlotProps = {
        textField: {
            fullWidth: true,
            variant: 'standard' as const,
            sx: {
                '& .MuiInput-root': {
                    bgcolor: 'background.paper',
                    borderRadius: 2,
                    px: 1.5,
                    py: 0.5,
                    '&:before': { display: 'none' },
                    '&:after': { display: 'none' },
                    '&:hover': { bgcolor: '#f1f5f9' },
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
    };

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
                {/* Top Row: Search + Filters + DateToggle + Extra */}
                <Box
                    sx={{
                        display: 'grid',
                        gridTemplateColumns: {
                            xs: '1fr',
                            sm: 'repeat(2, 1fr)',
                            md: `2fr ${filters.length > 0 ? `repeat(${filters.length}, 1fr)` : ''} auto`,
                        },
                        gap: 2,
                        mb: 1,
                        alignItems: 'center',
                    }}
                >
                    {/* Search Input */}
                    {onSearchChange && (
                        <TextField
                            fullWidth
                            placeholder={searchPlaceholder}
                            value={searchQuery}
                            onChange={(e) => onSearchChange(e.target.value)}
                            InputProps={{
                                startAdornment: (
                                    <InputAdornment position="start">
                                        <Search sx={{ color: 'text.secondary' }} />
                                    </InputAdornment>
                                ),
                            }}
                            sx={searchInputSx}
                        />
                    )}

                    {/* Dynamic Filters */}
                    {filters.map((filter, index) => (
                        <Autocomplete
                            key={index}
                            value={filter.value}
                            onChange={(event, newValue) => {
                                filter.onChange(newValue);
                            }}
                            options={filter.options}
                            disableClearable
                            renderInput={(params) => (
                                <TextField
                                    {...params}
                                    placeholder={filter.label}
                                    sx={commonInputSx}
                                />
                            )}
                            sx={{
                                minWidth: filter.minWidth,
                            }}
                        />
                    ))}

                    {/* More Filters Button (Date Toggle) */}
                    {enableDateFilter && onAdvancedFiltersToggle && (
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
                    )}

                    {/* Extra Actions */}
                    {extraActions && (
                        <Box sx={{ justifySelf: 'end' }}>
                            {extraActions}
                        </Box>
                    )}
                </Box>

                {/* Advanced Filters - Collapsible (Date Range) */}
                {enableDateFilter && (
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
                                {dateFilterTitle}
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
                                        ...datePickerSlotProps,
                                        textField: {
                                            ...datePickerSlotProps.textField,
                                            placeholder: 'From',
                                        }
                                    }}
                                />

                                {/* End Date */}
                                <DatePicker
                                    label="End Date"
                                    value={endDate}
                                    onChange={onEndDateChange}
                                    minDate={startDate || undefined}
                                    slotProps={{
                                        ...datePickerSlotProps,
                                        textField: {
                                            ...datePickerSlotProps.textField,
                                            placeholder: 'To',
                                        }
                                    }}
                                />
                            </Box>
                        </Box>
                    </Collapse>
                )}

                {/* Footer / Counts */}
                {showCounts && (
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
                            Showing <strong>{filteredCount}</strong> of <strong>{totalCount}</strong> {countLabel}
                        </Typography>
                    </Box>
                )}
            </Box>
        </LocalizationProvider>
    );
};

export default ReusableFilter;
