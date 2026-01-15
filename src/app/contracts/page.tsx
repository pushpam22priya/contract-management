'use client';

import { Box, Typography, Tooltip, IconButton, TextField, InputAdornment, Autocomplete, Collapse, Button } from '@mui/material';
import { useState, useEffect } from 'react';
import AddIcon from '@mui/icons-material/Add';
import AppLayout from '@/components/layout/AppLayout';
import { Search, FilterList, ExpandMore, ExpandLess } from '@mui/icons-material';
import { useRouter, useSearchParams } from 'next/navigation';
import { LocalizationProvider } from '@mui/x-date-pickers/LocalizationProvider';
import { AdapterDayjs } from '@mui/x-date-pickers/AdapterDayjs';
import { DatePicker } from '@mui/x-date-pickers/DatePicker';
import dayjs, { Dayjs } from 'dayjs';
import ContractCard from '@/components/contracts/ContractCard';
import CreateContractDialog from '@/components/contracts/CreateContractDialog';
import { contractService } from '@/services/contractService';
import { Contract } from '@/types/contract';
import DocumentViewerDialog from '@/components/viewer/DocumentViewerDialog';
import { authService } from '@/services/authService';
import SubmitForSignatureDialog from '@/components/contracts/SubmitForSignatureDialog';
import NotificationSnackbar from '@/components/common/NotificationSnackbar';
import { AlertColor } from '@mui/material';
import { templateService } from '@/services/templateService';

const statusOptions = [
    { label: 'All Status', value: 'all' },
    { label: 'Active', value: 'active' },
    { label: 'Expiring', value: 'expiring' },
    { label: 'Pending', value: 'pending' },
    { label: 'Waiting for Signature', value: 'waiting_for_signature' },
    { label: 'Signed', value: 'signed' },
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

    const [contracts, setContracts] = useState<Contract[]>([]);
    const [loading, setLoading] = useState(true);

    // Track which contract to view and whether the viewer dialog is open.
    const [contractViewerOpen, setContractViewerOpen] = useState(false);
    const [selectedContract, setSelectedContract] = useState<Contract | null>(null);

    // Signature Dialog State
    const [signatureDialogOpen, setSignatureDialogOpen] = useState(false);
    const [contractForSignature, setContractForSignature] = useState<Contract | null>(null);

    // Snackbar state
    const [snackbar, setSnackbar] = useState({
        open: false,
        message: '',
        severity: 'success' as AlertColor,
    });

    const showNotification = (message: string, severity: AlertColor = 'success') => {
        setSnackbar({ open: true, message, severity });
    };

    const searchParams = useSearchParams();

    useEffect(() => {
        // Handle URL filters
        const statusParam = searchParams.get('status');
        const searchParam = searchParams.get('search');

        if (statusParam) {
            const foundStatus = statusOptions.find(opt => opt.value === statusParam);
            if (foundStatus) setStatusFilter(foundStatus);
        }

        if (searchParam) {
            setSearchQuery(searchParam);
        }
    }, [searchParams]);

    useEffect(() => {
        loadContracts();
    }, []);

    const loadContracts = () => {
        setLoading(true);
        // ... (rest of loadContracts logic)
        const currentUser = authService.getCurrentUser();

        if (!currentUser) {
            setContracts([]);
            setLoading(false);
            return;
        }

        const allContracts = contractService.getAllContracts(); // Fetch ALL to filter

        // Show contracts created by user OR signed by user
        const relevantContracts = allContracts.filter(c => {
            const isCreator = c.createdBy === currentUser.email;

            // For signer: show if they are the signer AND status is one of the lifecycle statuses
            const isSigner = c.signer?.email === currentUser.email;
            const isValidSignerStatus = ['signed', 'active', 'expiring', 'expired'].includes(c.status);
            const isSignerAndVisible = isSigner && isValidSignerStatus;

            if (isCreator) {
                return ['active', 'expiring', 'expired', 'waiting_for_signature', 'signed'].includes(c.status);
            }

            return isSignerAndVisible;
        });

        setContracts(relevantContracts || []);
        setLoading(false);
    };

    const totalContracts = contracts.length;

    // Filter Logic
    const filteredContracts = contracts.filter(contract => {
        // Search Filter
        const matchesSearch = searchQuery === '' ||
            contract.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
            contract.client?.toLowerCase().includes(searchQuery.toLowerCase());

        // Status Filter
        const matchesStatus = statusFilter.value === 'all' ||
            contract.status === statusFilter.value;

        // Category Filter
        const matchesCategory = categoryFilter.value === 'all' ||
            contract.category === categoryFilter.value;

        // Date Filter
        let matchesDate = true;
        if (startDate || endDate) {
            const contractDate = dayjs(contract.createdAt); // Using createdAt primarily, could be startDate
            if (startDate && contractDate.isBefore(startDate, 'day')) matchesDate = false;
            if (endDate && contractDate.isAfter(endDate, 'day')) matchesDate = false;
        }

        return matchesSearch && matchesStatus && matchesCategory && matchesDate;
    });

    const filteredCount = filteredContracts.length;

    const handleViewContract = (id: string) => {
        console.log('📄 View Contract Clicked:', id);
        const contract = contracts.find(c => c.id === id);

        if (!contract) return;

        setSelectedContract(contract);
        setContractViewerOpen(true);
    };

    const handleExportContract = (id: string) => {
        console.log('Export contract:', id);
        // TODO: Implement export functionality
    };

    const handleShareContract = (id: string) => {
        const contract = contracts.find(c => c.id === id);
        if (!contract) return;

        setContractForSignature(contract);
        setSignatureDialogOpen(true);
    };

    const handleSignatureSubmit = async (signerEmail: string) => {
        if (!contractForSignature) return;

        const result = await contractService.submitForSignature(contractForSignature.id, signerEmail);

        if (result.success) {
            showNotification(result.message, 'success');
            loadContracts();
        } else {
            showNotification(result.message, 'error');
        }
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
                                lg: 'repeat(4, 1fr)',
                            },
                            gap: 0.75,
                        }}
                    >
                        {(filteredContracts || []).map((contract) => (
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

                {/* Create Contract Dialog with PDFTron */}
                <CreateContractDialog open={wizardOpen} onClose={() => setWizardOpen(false)} />

                {selectedContract && (
                    <DocumentViewerDialog
                        open={contractViewerOpen}
                        onClose={() => {
                            setContractViewerOpen(false);
                            setSelectedContract(null);
                        }}
                        fileUrl={(() => {
                            // Get template fileUrl if XFDF data exists
                            if (selectedContract.xfdfString && selectedContract.templateId) {
                                const template = templateService.getTemplateById(selectedContract.templateId);
                                console.log('📄 Template for viewing:', template);
                                // Use the template's fileUrl which contains base64 data
                                const url = template?.fileUrl || "";
                                console.log('📄 Using fileUrl:', url.substring(0, 50));
                                return url;
                            }
                            return "";
                        })()}
                        fileName={`${selectedContract.title}.${selectedContract.xfdfString ? 'pdf' : 'txt'}`}
                        title={selectedContract.title}
                        content={selectedContract.xfdfString ? undefined : selectedContract.content}
                        templateDocxBase64={selectedContract.templateDocxBase64}
                        fieldValues={selectedContract.fieldValues}
                        signatureImage={selectedContract.signer?.signatureImage}
                        xfdfString={selectedContract.xfdfString}
                    />
                )}

                <SubmitForSignatureDialog
                    open={signatureDialogOpen}
                    onClose={() => setSignatureDialogOpen(false)}
                    onSubmit={handleSignatureSubmit}
                    contractTitle={contractForSignature?.title}
                />

                <NotificationSnackbar
                    open={snackbar.open}
                    message={snackbar.message}
                    severity={snackbar.severity}
                    onClose={() => setSnackbar({ ...snackbar, open: false })}
                />
            </AppLayout>
        </LocalizationProvider>
    );
}
