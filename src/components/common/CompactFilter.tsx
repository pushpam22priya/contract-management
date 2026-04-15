'use client';

import {
    Box, Typography, TextField, InputAdornment,
    Autocomplete, Tooltip, IconButton,
} from '@mui/material';
import { Search, FilterListOff } from '@mui/icons-material';
import { KeyboardArrowDown } from '@mui/icons-material';
import { LocalizationProvider } from '@mui/x-date-pickers/LocalizationProvider';
import { AdapterDayjs } from '@mui/x-date-pickers/AdapterDayjs';
import { DatePicker } from '@mui/x-date-pickers/DatePicker';
import { Dayjs } from 'dayjs';

// Re-export types so consumers can swap import paths without touching type imports
export type { FilterOption, FilterConfig } from './ReusableFilter';
import type { FilterOption, FilterConfig } from './ReusableFilter';

// ─── Props ────────────────────────────────────────────────────────────────────
interface CompactFilterProps {
    searchQuery?: string;
    onSearchChange?: (value: string) => void;
    searchPlaceholder?: string;
    filters?: FilterConfig[];
    enableDateFilter?: boolean;
    startDate?: Dayjs | null;
    onStartDateChange?: (date: Dayjs | null) => void;
    endDate?: Dayjs | null;
    onEndDateChange?: (date: Dayjs | null) => void;
    // kept for API compat — no longer used (dates are always inline)
    showAdvancedFilters?: boolean;
    onAdvancedFiltersToggle?: () => void;
    dateFilterTitle?: string;
    showCounts?: boolean;
    filteredCount?: number;
    totalCount?: number;
    countLabel?: string;
    hasActiveFilters?: boolean;
    onClearFilters?: () => void;
    extraActions?: React.ReactNode;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function isFilterActive(filter: FilterConfig): boolean {
    if (filter.multiple) {
        const vals = (filter.value as FilterOption[]) ?? [];
        return vals.length > 0 && !vals.every(v => v.value === 'all');
    }
    return filter.value?.value !== 'all';
}

function getDisplayLabel(filter: FilterConfig): string {
    if (filter.multiple) {
        const vals = (filter.value as FilterOption[]) ?? [];
        const active = vals.filter(v => v.value !== 'all');
        if (active.length === 0) return filter.label;
        if (active.length === 1) return active[0].label;
        return `${active[0].label} +${active.length - 1}`;
    }
    const val = filter.value as FilterOption | null;
    if (!val || val.value === 'all') return filter.label;
    return val.label;
}

// ─── Shared styles ────────────────────────────────────────────────────────────

const FILTER_HEIGHT = 34;
const PRIMARY_BG = 'rgba(15, 118, 110, 0.06)';

const filterRootSx = (active: boolean) => ({
    minWidth: 110,
    '& .MuiOutlinedInput-root': {
        height: FILTER_HEIGHT,
        borderRadius: '4px',
        bgcolor: active ? PRIMARY_BG : 'transparent',
        fontSize: '0.8rem',
        cursor: 'pointer',
        '& fieldset': { borderColor: active ? 'primary.main' : 'rgba(0,0,0,0.2)' },
        '&:hover fieldset': { borderColor: 'primary.main' },
        '&.Mui-focused fieldset': { borderColor: 'primary.main' },
    },
    '& .MuiOutlinedInput-input': {
        py: '0 !important',
        color: active ? 'primary.main' : 'text.secondary',
        fontWeight: active ? 600 : 400,
        fontSize: '0.8rem',
    },
    '& .MuiAutocomplete-endAdornment': { right: 4 },
    '& .MuiAutocomplete-popupIndicator': {
        color: active ? 'primary.main' : 'text.disabled',
    },
});

const dateSx = (active: boolean) => ({
    minWidth: 130,
    '& .MuiOutlinedInput-root': {
        height: `${FILTER_HEIGHT}px !important`,
        borderRadius: '4px !important',
        bgcolor: active ? PRIMARY_BG : 'transparent',
        fontSize: '0.8rem',
        paddingRight: '4px !important',
        '& fieldset': {
            borderColor: active ? 'primary.main' : 'rgba(0,0,0,0.2)',
            '& legend': { width: 0 },
        },
        '&:hover fieldset': { borderColor: 'primary.main' },
        '&.Mui-focused fieldset': { borderColor: 'primary.main' },
    },
    '& .MuiOutlinedInput-input': {
        padding: '0 8px !important',
        fontSize: '0.8rem',
        color: active ? 'primary.main' : 'text.secondary',
        fontWeight: active ? 600 : 400,
        height: `${FILTER_HEIGHT}px !important`,
        boxSizing: 'border-box',
    },
    '& .MuiInputAdornment-root': { marginLeft: 0 },
    '& .MuiInputAdornment-root .MuiIconButton-root': {
        padding: '2px',
        color: active ? 'primary.main' : 'text.disabled',
        '& svg': { fontSize: '18px' },
    },
    '& .MuiInputLabel-root': { display: 'none' },
    '& .MuiInputLabel-shrink': { display: 'none' },
    // DatePicker sections container (DD/MM/YYYY)
    '& .MuiPickersOutlinedInput-sectionsContainer': {
        padding: '0 8px',
    },
    '& .MuiPickersSectionList-root': {
        padding: '7.5px',
    },
    // Section text color — match other filter dropdowns
    '& .MuiPickersSection-content, & .MuiPickersSectionList-section': {
        color: active ? 'primary.main' : 'text.secondary',
        fontSize: '0.8rem',
        fontWeight: active ? 600 : 400,
    },
    '& .MuiPickersSectionList-sectionSeparator': {
        color: active ? 'primary.main' : 'text.secondary',
        fontSize: '0.8rem',
    },
});

// ─── Component ────────────────────────────────────────────────────────────────

const CompactFilter = ({
    searchQuery = '',
    onSearchChange,
    searchPlaceholder = 'Search...',
    filters = [],
    enableDateFilter = false,
    startDate,
    onStartDateChange,
    endDate,
    onEndDateChange,
    showCounts = true,
    filteredCount = 0,
    totalCount = 0,
    countLabel = 'items',
    hasActiveFilters = false,
    onClearFilters,
    extraActions,
}: CompactFilterProps) => {

    return (
        <LocalizationProvider dateAdapter={AdapterDayjs}>
            <Box sx={{
                bgcolor: 'background.paper',
                px: 2,
                py: 0.75,
                borderBottom: '1px solid',
                borderColor: 'divider',
            }}>
                <Box sx={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: 1 }}>

                    {/* Search */}
                    {onSearchChange && (
                        <TextField
                            size="small"
                            placeholder={searchPlaceholder}
                            value={searchQuery}
                            onChange={(e) => onSearchChange(e.target.value)}
                            slotProps={{
                                input: {
                                    startAdornment: (
                                        <InputAdornment position="start">
                                            <Search sx={{ fontSize: 17, color: 'text.disabled' }} />
                                        </InputAdornment>
                                    ),
                                },
                            }}
                            sx={{
                                flex: '1 1 160px',
                                minWidth: 140,
                                maxWidth: 280,
                                '& .MuiOutlinedInput-root': {
                                    height: FILTER_HEIGHT,
                                    borderRadius: '4px',
                                    bgcolor: '#f8fafc',
                                    fontSize: '0.85rem',
                                    '&:hover': { bgcolor: '#f1f5f9' },
                                    '&.Mui-focused': { bgcolor: 'background.paper' },
                                },
                                '& .MuiOutlinedInput-input': { py: '0 !important', fontSize: '0.85rem' },
                            }}
                        />
                    )}

                    {/* Dynamic filter dropdowns */}
                    {filters.map((filter, index) => {
                        const active = isFilterActive(filter);
                        const displayLabel = getDisplayLabel(filter);

                        if (filter.multiple) {
                            return (
                                <Autocomplete
                                    key={index}
                                    size="small"
                                    multiple
                                    disabled={filter.disabled}
                                    value={filter.value || []}
                                    onChange={(_, newValue) => filter.onChange(newValue)}
                                    options={filter.options}
                                    getOptionLabel={(opt) => opt.label}
                                    isOptionEqualToValue={(opt, val) => opt.value === val.value}
                                    disableCloseOnSelect
                                    popupIcon={<KeyboardArrowDown sx={{ fontSize: 16 }} />}
                                    renderInput={(params) => (
                                        <TextField
                                            {...params}
                                            slotProps={{
                                                htmlInput: {
                                                    ...params.inputProps,
                                                    placeholder: displayLabel,
                                                },
                                                input: params.InputProps,
                                            }}
                                            sx={filterRootSx(active)}
                                        />
                                    )}
                                    slotProps={{ listbox: { sx: { fontSize: '0.78rem', '& .MuiAutocomplete-option': { fontSize: '0.78rem', py: 0.5, minHeight: 'unset' } } } }}
                                    sx={{
                                        minWidth: 120,
                                        width: 'auto',
                                        // hide selected chips inside the input — placeholder shows the summary instead
                                        '& .MuiAutocomplete-tag': { display: 'none' },
                                    }}
                                />
                            );
                        }

                        return (
                            <Autocomplete
                                key={index}
                                size="small"
                                disabled={filter.disabled}
                                value={filter.value}
                                onChange={(_, newValue) => filter.onChange(newValue)}
                                options={filter.options}
                                getOptionLabel={(opt) => opt.label}
                                isOptionEqualToValue={(opt, val) => opt.value === val.value}
                                disableClearable
                                popupIcon={<KeyboardArrowDown sx={{ fontSize: 16 }} />}
                                renderInput={(params) => (
                                    <TextField
                                        {...params}
                                        placeholder={filter.label}
                                        sx={filterRootSx(active)}
                                    />
                                )}
                                slotProps={{ listbox: { sx: { fontSize: '0.85rem' } } }}
                                sx={{ minWidth: 120, width: 'auto' }}
                            />
                        );
                    })}

                    {/* Inline date pickers — always visible when enableDateFilter */}
                    {enableDateFilter && (
                        <>
                            <DatePicker
                                value={startDate ?? null}
                                onChange={onStartDateChange}
                                format="DD/MM/YYYY"
                                slotProps={{
                                    textField: {
                                        size: 'small',
                                        placeholder: 'Start date',
                                        sx: dateSx(!!startDate),
                                    },
                                    field: { clearable: true },
                                }}
                            />
                            <DatePicker
                                value={endDate ?? null}
                                onChange={onEndDateChange}
                                minDate={startDate || undefined}
                                format="DD/MM/YYYY"
                                slotProps={{
                                    textField: {
                                        size: 'small',
                                        placeholder: 'End date',
                                        sx: dateSx(!!endDate),
                                    },
                                    field: { clearable: true },
                                }}
                            />
                        </>
                    )}

                    {/* Clear all filters */}
                    {hasActiveFilters && onClearFilters && (
                        <Tooltip title="Clear all filters" arrow>
                            <IconButton
                                size="small"
                                onClick={onClearFilters}
                                sx={{
                                    height: FILTER_HEIGHT,
                                    width: FILTER_HEIGHT,
                                    borderRadius: 1.5,
                                    border: '1px solid',
                                    borderColor: 'rgba(211,47,47,0.4)',
                                    color: 'error.main',
                                    '&:hover': {
                                        bgcolor: 'rgba(211,47,47,0.06)',
                                        borderColor: 'error.main',
                                    },
                                }}
                            >
                                <FilterListOff sx={{ fontSize: 17 }} />
                            </IconButton>
                        </Tooltip>
                    )}

                    {/* Extra actions */}
                    {extraActions && <Box sx={{ ml: 'auto' }}>{extraActions}</Box>}

                    {/* Count pill */}
                    {showCounts && (
                        <Box
                            sx={{
                                ml: extraActions ? 0.5 : 'auto',
                                display: 'flex',
                                alignItems: 'center',
                                gap: 0.4,
                                px: 1,
                                py: 1,
                                borderRadius: 1,
                                bgcolor: 'rgba(15, 118, 110, 0.07)',
                                border: '1px solid rgba(15, 118, 110, 0.18)',
                                whiteSpace: 'nowrap',
                            }}
                        >
                            <Typography sx={{ fontWeight: 700, color: 'text.secondary', fontSize: '0.78rem', lineHeight: 1 }}>
                                {filteredCount}
                            </Typography>
                            <Typography sx={{ color: 'text.secondary', fontSize: '0.78rem', lineHeight: 1 }}>
                                / {totalCount} {countLabel}
                            </Typography>
                        </Box>
                    )}
                </Box>
            </Box>
        </LocalizationProvider>
    );
};

export default CompactFilter;
