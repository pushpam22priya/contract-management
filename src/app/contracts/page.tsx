'use client';

import { Box, Typography, Tooltip, IconButton, TextField, InputAdornment, Autocomplete, Collapse, Button } from '@mui/material';
import { useState } from 'react';
import AddIcon from '@mui/icons-material/Add';
import AppLayout from '@/components/layout/AppLayout';
import { Search, FilterList, ExpandMore, ExpandLess } from '@mui/icons-material';
import { useRouter } from 'next/navigation';
import { LocalizationProvider } from '@mui/x-date-pickers/LocalizationProvider';
import { AdapterDayjs } from '@mui/x-date-pickers/AdapterDayjs';
import { DatePicker } from '@mui/x-date-pickers/DatePicker';
import dayjs, { Dayjs } from 'dayjs';
import ContractCard, { Contract } from '@/components/contracts/ContractCard';
import CreateContractWizard from '@/components/contracts/CreateContractWizard';

const statusOptions = [
    { label: 'All Status', value: 'all' },
    { label: 'Active', value: 'active' },
    { label: 'Pending', value: 'pending' },
    { label: 'Expired', value: 'expired' },
    { label: 'Draft', value: 'draft' },
];

const categoryOptions = [
    { label: 'All Categories', value: 'all' },
    { label: 'Legal', value: 'legal' },
    { label: 'Finance', value: 'finance' },
    { label: 'HR', value: 'hr' },
    { label: 'Sales', value: 'sales' },
];

export default function ContractsPage() {
    const router = useRouter();

    const [searchQuery, setSearchQuery] = useState('');
    const [statusFilter, setStatusFilter] = useState(statusOptions[0]);
    const [categoryFilter, setCategoryFilter] = useState(categoryOptions[0]);
    const [startDate, setStartDate] = useState<Dayjs | null>(null);
    const [endDate, setEndDate] = useState<Dayjs | null>(null);
    const [showAdvancedFilters, setShowAdvancedFilters] = useState(false);
    const [wizardOpen, setWizardOpen] = useState(false);

    // Mock contract data - would come from API in real app
    const mockContracts: Contract[] = [
        {
            id: '1',
            title: 'Annual Software Maintenance - TechCorp',
            description: 'Yearly maintenance and support contract for enterprise software',
            client: 'TechCorp Solutions',
            value: '₹125K',
            category: 'Service',
            expiresInDays: 362,
            status: 'active',
        },
        {
            id: '2',
            title: 'Consulting Services - Global Industries',
            description: 'Strategic consulting services for Q1 2025',
            client: 'Global Industries Inc.',
            value: '₹89K',
            category: 'Service',
            expiresInDays: 28,
            status: 'expiring',
        },
        {
            id: '3',
            title: 'Cloud Infrastructure Agreement',
            description: 'Multi-year cloud hosting and infrastructure management',
            client: 'DataFlow Systems',
            value: '₹250K',
            category: 'Finance',
            expiresInDays: 180,
            status: 'active',
        },
        {
            id: '4',
            title: 'Legal Retainer - Smith & Associates',
            description: 'General corporate legal services and consultation',
            client: 'Smith & Associates',
            value: '₹45K',
            category: 'Legal',
            expiresInDays: 90,
            status: 'active',
        },
        {
            id: '5',
            title: 'HR Training Program',
            description: 'Employee development and leadership training initiative',
            client: 'Talent Hub Inc.',
            value: '₹32K',
            category: 'HR',
            expiresInDays: 15,
            status: 'expiring',
        },
        {
            id: '6',
            title: 'Marketing Campaign Partnership',
            description: 'Q4 digital marketing and brand awareness campaign',
            client: 'Creative Minds Agency',
            value: '₹78K',
            category: 'Sales',
            expiresInDays: -5,
            status: 'expired',
        },
        {
            id: '7',
            title: 'Enterprise Software License',
            description: 'Annual licensing agreement for business analytics platform',
            client: 'Analytics Pro',
            value: '₹156K',
            category: 'Finance',
            expiresInDays: 240,
            status: 'active',
        },
        {
            id: '8',
            title: 'Office Lease Agreement - Draft',
            description: 'New office space lease pending final approval',
            client: 'Prime Properties LLC',
            value: '₹420K',
            category: 'Legal',
            expiresInDays: 0,
            status: 'active',
        },
    ];

    const totalContracts = mockContracts.length;
    const filteredCount = mockContracts.length;

    const handleViewContract = (id: string) => {
        router.push(`/contracts/${id}`);
    };

    const handleExportContract = (id: string) => {
        console.log('Export contract:', id);
        // TODO: Implement export functionality
    };

    const handleShareContract = (id: string) => {
        console.log('Share contract for signature:', id);
        // TODO: Implement share for signature functionality
    };

    return (
        <LocalizationProvider dateAdapter={AdapterDayjs}>
            <AppLayout>
                <Box>
                    {/* Header Section */}
                    <Box
                        sx={{
                            display: 'flex',
                            justifyContent: 'space-between',
                            alignItems: { xs: 'flex-start', md: 'center' },
                            flexDirection: { xs: 'column', md: 'row' },
                            gap: { xs: 3, md: 2 },
                            mb: 1,
                        }}
                    >
                        {/* Title and Subtitle */}
                        <Box>
                            <Typography
                                fontWeight={600}
                                sx={{
                                    color: 'primary.main',
                                    fontSize: { xs: '1rem', sm: '1.5rem', md: '20px' },
                                }}
                            >
                                Contracts
                            </Typography>
                            <Typography
                                variant="body2"
                                sx={{
                                    color: 'text.secondary',
                                    // fontSize: { xs: '0.95rem', sm: '1rem' },
                                }}
                            >
                                Manage your contracts and relationships
                            </Typography>
                        </Box>

                        {/* Create Contract Button */}
                        <Box
                            sx={{
                                display: 'flex',
                                justifyContent: { xs: 'flex-end', sm: 'flex-start' },
                            }}
                        >
                            <Tooltip title="Create Contract" arrow>
                                <IconButton
                                    onClick={() => setWizardOpen(true)}
                                    sx={{
                                        bgcolor: 'primary.main',
                                        color: 'white',
                                        width: 44,
                                        height: 44,
                                        boxShadow: '0 2px 8px rgba(15, 118, 110, 0.25)',
                                        transition: 'all 0.3s',
                                        '&:hover': {
                                            bgcolor: 'primary.dark',
                                            transform: 'translateY(-2px)',
                                            boxShadow: '0 6px 16px rgba(15, 118, 110, 0.35)',
                                        },
                                    }}
                                >
                                    <AddIcon />
                                </IconButton>
                            </Tooltip>
                        </Box>
                    </Box>
                    {/* Filter Section */}
                    <Box
                        sx={{
                            bgcolor: 'background.paper',
                            borderRadius: 3,
                            p: 1,
                            mb: 1.5,
                            boxShadow: '0 1px 3px rgba(0,0,0,0.08)',
                        }}
                    >
                        {/* Filters Row: Search + Status + Category + More Filters */}
                        <Box
                            sx={{
                                display: 'grid',
                                gridTemplateColumns: {
                                    xs: '1fr',
                                    sm: 'repeat(2, 1fr)',
                                    md: 'repeat(3, 1fr)',
                                    lg: '2fr 1fr 1fr auto',
                                },
                                gap: 2,
                                mb: 1,
                                alignItems: 'center',
                            }}
                        >
                            {/* Search Input */}
                            <TextField
                                fullWidth
                                placeholder="Search contracts or clients..."
                                value={searchQuery}
                                onChange={(e) => setSearchQuery(e.target.value)}
                                InputProps={{
                                    startAdornment: (
                                        <InputAdornment position="start">
                                            <Search sx={{ color: 'text.secondary' }} />
                                        </InputAdornment>
                                    ),
                                }}
                                sx={{
                                    gridColumn: { xs: '1', sm: '1 / -1', md: '1 / -1', lg: '1' },
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

                            {/* Status Filter */}
                            <Autocomplete
                                value={statusFilter}
                                onChange={(event, newValue) => {
                                    setStatusFilter(newValue || statusOptions[0]);
                                }}
                                options={statusOptions}
                                disableClearable
                                renderInput={(params) => (
                                    <TextField
                                        {...params}
                                        placeholder="Status"
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

                            {/* Category Filter */}
                            <Autocomplete
                                value={categoryFilter}
                                onChange={(event, newValue) => {
                                    setCategoryFilter(newValue || categoryOptions[0]);
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
                                    onClick={() => setShowAdvancedFilters(!showAdvancedFilters)}
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
                                        gridColumn: { xs: '1', sm: '1 / -1', md: '1 / -1', lg: 'auto' },
                                        justifySelf: { xs: 'stretch', sm: 'stretch', md: 'stretch', lg: 'start' },
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
                                    Filter by Contract Date Range
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
                                        onChange={(newValue) => setStartDate(newValue)}
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
                                        onChange={(newValue) => setEndDate(newValue)}
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

                        {/* Bottom Row: Results Count + Export */}
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
                                Showing <strong>{filteredCount}</strong> of <strong>{totalContracts}</strong> contracts
                            </Typography>

                        </Box>
                    </Box>

                    {/* Contracts Grid */}
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
                        {mockContracts.map((contract) => (
                            <ContractCard
                                key={contract.id}
                                contract={contract}
                                onView={handleViewContract}
                                onExport={handleExportContract}
                                onShare={handleShareContract}
                            />
                        ))}
                    </Box>
                </Box>

                {/* Create Contract Wizard */}
                <CreateContractWizard open={wizardOpen} onClose={() => setWizardOpen(false)} />
            </AppLayout>
        </LocalizationProvider>
    );
}
