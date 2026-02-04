'use client';

import { Box, Typography, Tooltip, IconButton } from '@mui/material';
import AppLayout from '@/components/layout/AppLayout';
import AddIcon from '@mui/icons-material/Add';
import ContractCard from '@/components/contracts/ContractCard';
import { useEffect, useState } from 'react';
import dayjs, { Dayjs } from 'dayjs';
import { contractService } from '@/services/contractService';
import { Contract, ContractStatus } from '@/types/contract';
import DocumentViewerDialog from '@/components/viewer/DocumentViewerDialog';
import RequestReviewDialog from '@/components/contracts/RequestReviewDialog';
import { authService } from '@/services/authService';
import NotificationSnackbar from '@/components/common/NotificationSnackbar';
import { AlertColor } from '@mui/material';
import { useSearchParams } from 'next/navigation';
import { templateService } from '@/services/templateService';
import { categoryService } from '@/services/categoryService';
import ReusableFilter from '@/components/common/ReusableFilter';
import { apiService } from '@/services/apiService';

export default function DraftPage() {
    const [draftContracts, setDraftContracts] = useState<Contract[]>([]);
    const [loading, setLoading] = useState(true);

    const [viewerOpen, setViewerOpen] = useState(false);
    const [selectedContract, setSelectedContract] = useState<Contract | null>(null);

    // Request Review Dialog state
    const [reviewDialogOpen, setReviewDialogOpen] = useState(false);
    const [contractForReview, setContractForReview] = useState<Contract | null>(null);

    // Snackbar state
    const [snackbar, setSnackbar] = useState({
        open: false,
        message: '',
        severity: 'success' as AlertColor,
    });

    const [categoryOptions, setCategoryOptions] = useState<{ label: string; value: string }[]>([
        { label: 'All Categories', value: 'all' }
    ]);
    const [categoryFilter, setCategoryFilter] = useState({ label: 'All Categories', value: 'all' });

    // Load draft contracts
    useEffect(() => {
        loadDrafts();
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

    /**
     * Show snackbar notification
     */
    const showNotification = (message: string, severity: AlertColor = 'success') => {
        setSnackbar({ open: true, message, severity });
    };

    // State for viewer data (preloaded)
    const [viewerData, setViewerData] = useState<{
        fileUrl: string;
        initialXfdf?: string;
        formFields?: any[];
    } | null>(null);

    const handleView = async (id: string) => {
        const contract = draftContracts.find(c => c.id === id);
        if (!contract) return;

        setSelectedContract(contract);

        // Preload data logic
        let fileUrl = "";
        let initialXfdf: string | undefined = undefined;
        let formFields: any[] | undefined = undefined;

        // Priority 1: Use fileData if available (points to the saved binary)
        if (contract.fileData) {
            console.log('📄 [DraftPage] Using contract.fileData');
            console.log('📄 [DraftPage] XFDF length:', contract.xfdfData?.length || 0);
            console.log('📄 [DraftPage] FormFields count:', contract.formFields?.length || 0);
            console.log('📄 [DraftPage] Contract ID:', contract.id);
            fileUrl = `data:application/pdf;base64,${contract.fileData}`;
            // ✅ CRITICAL FIX: Always load XFDF/FormFields to ensure signatures/inputs are restored
            // even if they are baked into the PDF, this ensures interactivity and appearance
            initialXfdf = contract.xfdfData;
            formFields = contract.formFields;
        }
        // Priority 2: Use fileUrl (from API - points to /api/file/[id])
        // ✅ CRITICAL FIX: This is the PRIMARY path for contracts saved via updateContractSignedPdf
        else if (contract.fileUrl) {
            console.log('📄 [DraftPage] Using contract.fileUrl (fetching from API)');
            console.log('📄 [DraftPage] File URL:', contract.fileUrl);
            console.log('📄 [DraftPage] XFDF length:', contract.xfdfData?.length || 0);
            console.log('📄 [DraftPage] FormFields count:', contract.formFields?.length || 0);
            fileUrl = contract.fileUrl;
            // ✅ Load the contract's XFDF and formFields (NOT template's!)
            initialXfdf = contract.xfdfData;
            formFields = contract.formFields;
        }
        // Priority 3: Use signedPdfBase64 (fallback/legacy)
        else if (contract.signedPdfBase64) {
            console.log('📄 [DraftPage] Using signedPdfBase64 (baked signatures)');
            fileUrl = `data:application/pdf;base64,${contract.signedPdfBase64}`;
            initialXfdf = contract.xfdfData;
            formFields = contract.formFields;
        }
        // Priority 4: Fallback to template PDF (last resort)
        else if (contract.templateId) {
            console.log('📄 [DraftPage] Fallback: Fetching template PDF...');
            try {
                const template = await templateService.getTemplateById(contract.templateId);
                if (template) {
                    fileUrl = template.fileData || template.fileUrl || "";
                    initialXfdf = contract.xfdfData || template.xfdfData;
                    formFields = contract.formFields || template.formFields;
                }
            } catch (err) {
                console.error('Failed to load template:', err);
                showNotification('Failed to load document template', 'error');
            }
        }

        setViewerData({
            fileUrl,
            initialXfdf,
            formFields
        });
        setViewerOpen(true);
    };

    const loadDrafts = async () => {
        setLoading(true);
        const currentUser = authService.getCurrentUser();

        if (!currentUser) {
            setDraftContracts([]);
            setLoading(false);
            return;
        }

        // Get contracts created by user
        const userContracts = await contractService.getContractsCreatedByUser(currentUser.email);

        // Show Drafts AND Reviewed (Waiting for Approval)
        const drafts = userContracts.filter(c =>
            c.status === ContractStatus.DRAFT ||
            c.status === ContractStatus.REVIEW_APPROVAL ||
            c.status === ContractStatus.REVIEWED
        );
        setDraftContracts(drafts);
        setLoading(false);
    };

    const handleApprove = async (id: string) => {
        const currentUser = authService.getCurrentUser();
        if (!currentUser) return;

        const result = await contractService.approveContract(id, currentUser.email);
        if (result.success) {
            showNotification('Contract approved! Moved to Contracts page', 'success');
            loadDrafts(); // Reload drafts
        } else {
            showNotification('Failed to approve contract: ' + result.message, 'error');
        }
    };
    const handleReject = async (id: string) => {
        const confirmed = confirm('Are you sure you want to reject this contract?');
        if (!confirmed) return;
        const result = await contractService.deleteContract(id);
        if (result.success) {
            showNotification('Contract rejected and deleted', 'success');
            loadDrafts(); // Reload drafts
        } else {
            showNotification('Failed to reject contract: ' + result.message, 'error');
        }
    };
    const handleShare = (id: string) => {
        const contract = draftContracts.find(c => c.id === id);
        if (!contract) return;

        setContractForReview(contract);
        setReviewDialogOpen(true);
    };

    /**
     * Submit contract for review and approval
     */
    const handleSubmitForReview = async (newReviewers: string[], approver: string) => {
        if (!contractForReview) return;

        // Get existing reviewers if any
        const existingReviewerEmails = contractForReview.reviewers?.map(r => r.email) || [];

        // Merge existing and new reviewers (removing duplicates)
        const allReviewers = Array.from(new Set([
            ...existingReviewerEmails,
            ...newReviewers
        ]));

        const result = await contractService.submitForReview(
            contractForReview.id,
            allReviewers,
            approver
        );

        if (result.success) {
            showNotification('Contract submitted for review and approval!', 'success');
            loadDrafts(); // Reload drafts
        } else {
            showNotification('Failed to submit: ' + result.message, 'error');
            throw new Error(result.message);
        }
    };

    /**
     * Save contract changes from PDF viewer
     * Now accepts pdfBlob, xfdfString, fieldValues, and formFields - matching contract creation flow
     */
    const handleSaveChanges = async (pdfBlob: Blob, xfdfString: string, fieldValues?: Record<string, string>, formFields?: any[]) => {
        if (!selectedContract) return;

        try {
            // Convert Blob to base64
            console.log('📄 [DraftPage] Converting PDF Blob to base64...');
            const arrayBuffer = await pdfBlob.arrayBuffer();
            const bytes = new Uint8Array(arrayBuffer);

            // Verify PDF header
            const header = String.fromCharCode(...bytes.slice(0, 5));
            if (!header.startsWith('%PDF-')) {
                console.error('❌ Invalid PDF: does not start with %PDF-');
                showNotification('Failed to save: Invalid PDF data', 'error');
                return;
            }

            // Convert to base64
            let binary = '';
            for (let i = 0; i < bytes.byteLength; i++) {
                binary += String.fromCharCode(bytes[i]);
            }
            const pdfBase64 = btoa(binary);

            // ✅ CRITICAL: Pass both pdfBase64 AND xfdfString to contract service
            const result = await contractService.updateContractSignedPdf(selectedContract.id, pdfBase64, xfdfString);

            if (result.success) {
                // ✅ CRITICAL FIX: Also persist fieldValues and formFields like contract creation does
                // This ensures field tracking works identically to CreateContractDialog
                const metadataUpdates: Record<string, any> = {};

                if (fieldValues && Object.keys(fieldValues).length > 0) {
                    // Merge with existing fieldValues so we don't lose values from contract creation
                    metadataUpdates.fieldValues = {
                        ...(selectedContract.fieldValues || {}),
                        ...fieldValues
                    };
                    console.log('📝 [DraftPage] Persisting fieldValues:', metadataUpdates.fieldValues);
                }

                if (formFields && formFields.length > 0) {
                    metadataUpdates.formFields = formFields;
                    metadataUpdates.hasFormFields = formFields.length > 0;
                    console.log('📝 [DraftPage] Persisting formFields:', formFields.length, 'fields');
                }

                if (Object.keys(metadataUpdates).length > 0) {
                    // const { apiService } = await import('@/services/apiService');
                    await apiService.updateContractMetadata(selectedContract.id, metadataUpdates);
                    console.log('✅ [DraftPage] Field metadata updated successfully');
                }

                showNotification('Changes saved successfully!', 'success');
                loadDrafts(); // Reload to get updated contract
            } else {
                showNotification('Failed to save changes: ' + result.message, 'error');
                throw new Error(result.message);
            }
        } catch (error) {
            console.error('❌ Error saving PDF:', error);
            showNotification('Failed to save changes', 'error');
        }
    };

    // Filter states
    const statusOptions = [
        { label: 'All Status', value: 'all' },
        { label: 'Draft', value: ContractStatus.DRAFT },
        { label: 'Review and Approve', value: ContractStatus.REVIEW_APPROVAL },
    ];

    const [searchQuery, setSearchQuery] = useState('');
    const [statusFilter, setStatusFilter] = useState(statusOptions[0]);
    // categoryFilter removed (declared above)
    const [startDate, setStartDate] = useState<Dayjs | null>(null);
    const [endDate, setEndDate] = useState<Dayjs | null>(null);
    const [showAdvancedFilters, setShowAdvancedFilters] = useState(false);

    const totalDrafts = draftContracts.length;

    // URL params for deep linking (e.g. from Dashboard)
    const searchParams = useSearchParams();

    // Filter logic
    const filteredDrafts = draftContracts.filter(contract => {
        // Status Param Filter (from URL)
        const statusParam = searchParams.get('status');
        if (statusParam && contract.status !== statusParam) {
            return false;
        }

        // Local Status Filter
        const matchesStatus = statusFilter.value === 'all' ||
            contract.status === statusFilter.value;

        // Search Filter
        const matchesSearch = searchQuery === '' ||
            contract.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
            contract.client?.toLowerCase().includes(searchQuery.toLowerCase());

        // Category Filter
        const matchesCategory = categoryFilter.value === 'all' ||
            contract.category === categoryFilter.value;

        // Date Filter
        let matchesDate = true;
        if (startDate || endDate) {
            const contractDate = dayjs(contract.createdAt);
            if (startDate && contractDate.isBefore(startDate, 'day')) matchesDate = false;
            if (endDate && contractDate.isAfter(endDate, 'day')) matchesDate = false;
        }

        return matchesStatus && matchesSearch && matchesCategory && matchesDate;
    });

    const filteredCount = filteredDrafts.length;

    return (
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
                            // variant="h3"
                            fontWeight={600}
                            sx={{
                                color: 'primary.main',
                                fontSize: { xs: '1.75rem', sm: '2rem', md: '20px' },
                            }}
                        >
                            {/* Dynamic Title based on filter? Or just keep generic */}
                            {searchParams.get('status') === 'review_approval' ? 'Pending Approvals' : 'Draft Contracts'}
                        </Typography>
                        <Typography
                            variant="body2"
                            sx={{
                                color: 'text.secondary',
                                // fontSize: { xs: '0.95rem', sm: '1rem' },
                            }}
                        >
                            Review and manage your draft contracts
                        </Typography>
                    </Box>

                    {/* Create Draft Button */}
                    {/* <Box
                        sx={{
                            display: 'flex',
                            justifyContent: { xs: 'flex-end', sm: 'flex-start' },
                        }}
                    >
                        <Tooltip title="Create New Draft" arrow>
                            <IconButton
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
                    </Box> */}
                </Box>

                {/* Filter Section */}
                <ReusableFilter
                    searchQuery={searchQuery}
                    onSearchChange={setSearchQuery}
                    searchPlaceholder="Search drafts or clients..."
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
                            onChange: (newValue) => setCategoryFilter(newValue || { label: 'All Categories', value: 'all' }),
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
                    dateFilterTitle="Filter by Draft Date Range"
                    filteredCount={filteredCount}
                    totalCount={totalDrafts}
                    countLabel="drafts"
                />

                {/* Drafts Grid */}
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
                    {filteredDrafts.map((contract) => (
                        <ContractCard variant="draft"
                            key={contract.id}
                            contract={contract}
                            onView={handleView}
                            onShare={handleShare}
                        />
                    ))}
                </Box>
            </Box>
            {/* ← ADD VIEWER DIALOG */}
            {selectedContract && viewerData && (
                <DocumentViewerDialog
                    open={viewerOpen}
                    onClose={() => {
                        setViewerOpen(false);
                        setSelectedContract(null);
                        setViewerData(null);
                    }}
                    fileUrl={viewerData.fileUrl}
                    fileName={`${selectedContract.title}.pdf`}
                    title={selectedContract.title}
                    content={selectedContract.content}
                    templateDocxBase64={selectedContract.templateDocxBase64}
                    fieldValues={selectedContract.fieldValues}
                    signatureImage={selectedContract.signer?.signatureImage}
                    contractId={selectedContract.id}
                    onSave={handleSaveChanges}
                    currentUserRole="contractor"
                    initialXfdf={viewerData.initialXfdf}
                    formFields={viewerData.formFields}
                    // ✅ NEW: Contractors can edit field values but NOT add new form fields in draft mode
                    canAddFormFields={false}
                    editableFieldMode="all"
                />
            )}

            {/* Request Review Dialog */}
            {contractForReview && (
                <RequestReviewDialog
                    open={reviewDialogOpen}
                    onClose={() => {
                        setReviewDialogOpen(false);
                        setContractForReview(null);
                    }}
                    contractId={contractForReview.id}
                    contractTitle={contractForReview.title}
                    onSubmit={handleSubmitForReview}
                />
            )}

            {/* Notification Snackbar */}
            <NotificationSnackbar
                open={snackbar.open}
                message={snackbar.message}
                severity={snackbar.severity}
                onClose={() => setSnackbar({ ...snackbar, open: false })}
            />
        </AppLayout>
    );
}
