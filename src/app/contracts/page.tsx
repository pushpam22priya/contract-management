'use client';

import { Box, Typography, Tooltip, IconButton, Button } from '@mui/material';
import { useState, useEffect, useCallback } from 'react';
import AddIcon from '@mui/icons-material/Add';
import AppLayout from '@/components/layout/AppLayout';
import { useRouter, useSearchParams } from 'next/navigation';
import { LocalizationProvider } from '@mui/x-date-pickers/LocalizationProvider';
import { AdapterDayjs } from '@mui/x-date-pickers/AdapterDayjs';
import dayjs, { Dayjs } from 'dayjs';
import ContractCard from '@/components/contracts/ContractCard';
import CreateContractDialog from '@/components/contracts/CreateContractDialog';
import { contractService } from '@/services/contractService';
import { Contract, ContractStatus } from '@/types/contract';
import DocumentViewerDialog from '@/components/viewer/DocumentViewerDialog';
import { authService } from '@/services/authService';
import SubmitForSignatureDialog from '@/components/contracts/SubmitForSignatureDialog';
import NotificationSnackbar from '@/components/common/NotificationSnackbar';
import { AlertColor } from '@mui/material';
import { templateService } from '@/services/templateService';
import { categoryService } from '@/services/categoryService';
import ReusableFilter from '@/components/common/ReusableFilter';
import { useSignaturePolling } from '@/hooks/useSignaturePolling';


const statusOptions = [
    { label: 'All Status', value: 'all' },
    { label: 'Active', value: ContractStatus.ACTIVE },
    { label: 'Expiring', value: ContractStatus.EXPIRING },
    { label: 'Approved', value: ContractStatus.APPROVED },
    { label: 'Waiting for Signature', value: ContractStatus.WAITING_FOR_SIGNATURE },
    { label: 'Signed', value: ContractStatus.SIGNED },
    { label: 'Expired', value: ContractStatus.EXPIRED },
];

export default function ContractsPage() {
    const router = useRouter();

    const [searchQuery, setSearchQuery] = useState('');
    const [statusFilter, setStatusFilter] = useState(statusOptions[0]);
    const [categoryFilter, setCategoryFilter] = useState({ label: 'All Categories', value: 'all' });
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

    // Get contracts waiting for signature (for polling)
    const waitingForSignatureIds = contracts
        .filter(c => c.status === ContractStatus.WAITING_FOR_SIGNATURE && c.externalSigningBinId)
        .map(c => c.id);

    // Callback when signature is detected
    const handleSignatureComplete = useCallback((contractId: string) => {
        console.log('🎉 [ContractsPage] Signature completed for contract:', contractId);
        const contract = contracts.find(c => c.id === contractId);
        showNotification(`Contract "${contract?.title || contractId}" has been signed!`, 'success');
        loadContracts();
    }, [contracts]);

    // Start polling for signature updates
    useSignaturePolling(
        waitingForSignatureIds,
        handleSignatureComplete,
        waitingForSignatureIds.length > 0
    );

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

    const [categoryOptions, setCategoryOptions] = useState<{ label: string; value: string }[]>([
        { label: 'All Categories', value: 'all' }
    ]);

    useEffect(() => {
        loadContracts();
        loadCategories();
    }, []);

    const loadCategories = () => {
        const categories = categoryService.getAllCategories();
        const options = [
            { label: 'All Categories', value: 'all' },
            ...categories.map(cat => ({ label: cat.name, value: cat.name }))
        ];
        setCategoryOptions(options);
    };

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
                return [
                    ContractStatus.APPROVED,
                    ContractStatus.WAITING_FOR_SIGNATURE,
                    ContractStatus.SIGNED,
                    ContractStatus.ACTIVE,
                    ContractStatus.EXPIRING,
                    ContractStatus.EXPIRED
                ].includes(c.status);
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
        // Navigate to the details page
        router.push(`/contracts/${id}`);
    };

    const handleShareContract = (id: string) => {
        const contract = contracts.find(c => c.id === id);
        if (!contract) return;

        setContractForSignature(contract);
        setSignatureDialogOpen(true);
    };


    const handleSignatureSubmit = async (signerEmail: string): Promise<{ success: boolean; signingUrl?: string }> => {
        console.log('📝 [ContractsPage] Handling signature submit...');
        console.log('📝 [ContractsPage] Contract:', contractForSignature?.id);
        console.log('📝 [ContractsPage] Signer:', signerEmail);

        if (!contractForSignature) {
            console.error('❌ [ContractsPage] No contract selected for signature');
            return { success: false };
        }

        // Get current user for sender name
        const currentUser = authService.getCurrentUser();
        const senderName = currentUser?.email || 'Contract System';

        console.log('📝 [ContractsPage] Sender:', senderName);

        // Call the new external signature method
        const result = await contractService.submitForExternalSignature(
            contractForSignature.id,
            signerEmail,
            senderName
        );

        if (result.success) {
            console.log('✅ [ContractsPage] Signature request sent successfully');
            showNotification('Signature request sent to ' + signerEmail, 'success');
            loadContracts();  // Reload to show updated status
            return { success: true, signingUrl: result.signingUrl };
        } else {
            console.error('❌ [ContractsPage] Failed to send signature request:', result.message);
            showNotification(result.message, 'error');
            return { success: false };
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
                    <ReusableFilter
                        searchQuery={searchQuery}
                        onSearchChange={setSearchQuery}
                        searchPlaceholder="Search contracts or clients..."
                        filters={[
                            {
                                label: 'Status',
                                value: statusFilter,
                                onChange: (newValue) => setStatusFilter(newValue || statusOptions[0]),
                                options: statusOptions,
                            },
                            {
                                label: 'Category',
                                value: categoryFilter,
                                onChange: (newValue) => setCategoryFilter(newValue || categoryOptions[0]),
                                options: categoryOptions,
                            }
                        ]}
                        enableDateFilter={true}
                        startDate={startDate}
                        onStartDateChange={setStartDate}
                        endDate={endDate}
                        onEndDateChange={setEndDate}
                        showAdvancedFilters={showAdvancedFilters}
                        onAdvancedFiltersToggle={() => setShowAdvancedFilters(!showAdvancedFilters)}
                        dateFilterTitle="Filter by Contract Date Range"
                        filteredCount={filteredCount}
                        totalCount={totalContracts}
                        countLabel="contracts"
                    />

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
                        currentUserRole="contractor"
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
