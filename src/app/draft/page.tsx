'use client';

import { Box, Typography, Tooltip, IconButton } from '@mui/material';
import AppLayout from '@/components/layout/AppLayout';
import AddIcon from '@mui/icons-material/Add';
import DraftCard from '@/components/contracts/DraftCard';
import DraftFilters from '@/components/filters/DraftFilters';
import { useEffect, useState } from 'react';
import dayjs, { Dayjs } from 'dayjs';
import { contractService } from '@/services/contractService';
import { Contract } from '@/types/contract';
import DocumentViewerDialog from '@/components/viewer/DocumentViewerDialog';
import RequestReviewDialog from '@/components/contracts/RequestReviewDialog';
import { authService } from '@/services/authService';
import NotificationSnackbar from '@/components/common/NotificationSnackbar';
import { AlertColor } from '@mui/material';
import { useSearchParams } from 'next/navigation';
import { templateService } from '@/services/templateService';

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

    // Load draft contracts
    useEffect(() => {
        loadDrafts();
    }, []);

    /**
     * Show snackbar notification
     */
    const showNotification = (message: string, severity: AlertColor = 'success') => {
        setSnackbar({ open: true, message, severity });
    };

    const handleView = (id: string) => {
        const contract = draftContracts.find(c => c.id === id);
        if (!contract) return;

        setSelectedContract(contract);
        setViewerOpen(true);
    };
    const loadDrafts = () => {
        setLoading(true);
        const currentUser = authService.getCurrentUser();

        if (!currentUser) {
            setDraftContracts([]);
            setLoading(false);
            return;
        }

        // Get contracts created by user
        const userContracts = contractService.getContractsCreatedByUser(currentUser.email);

        // Filter for drafts and review_approval
        const drafts = userContracts.filter(c => c.status === 'draft' || c.status === 'review_approval');
        setDraftContracts(drafts);
        setLoading(false);
    };
    const handleApprove = async (id: string) => {
        const result = await contractService.approveContract(id);
        if (result.success) {
            showNotification('Contract approved! ✅ Moved to Contracts page', 'success');
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
    const handleDownload = (id: string) => {
        console.log('Download draft:', id);
        // TODO: Implement download functionality
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

    // Filter states
    const [searchQuery, setSearchQuery] = useState('');
    const [categoryFilter, setCategoryFilter] = useState({ label: 'All Categories', value: 'all' });
    const [startDate, setStartDate] = useState<Dayjs | null>(null);
    const [endDate, setEndDate] = useState<Dayjs | null>(null);
    const [showAdvancedFilters, setShowAdvancedFilters] = useState(false);

    const totalDrafts = draftContracts.length;

    // URL params for deep linking (e.g. from Dashboard)
    const searchParams = useSearchParams();

    // Filter logic
    const filteredDrafts = draftContracts.filter(contract => {
        // Status Param Filter (from URL)
        // If ?status=review_approval, only show those.
        const statusParam = searchParams.get('status');
        if (statusParam && contract.status !== statusParam) {
            return false;
        }

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

        return matchesSearch && matchesCategory && matchesDate;
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
                <DraftFilters
                    searchQuery={searchQuery}
                    onSearchChange={setSearchQuery}
                    categoryFilter={categoryFilter}
                    onCategoryChange={setCategoryFilter}
                    startDate={startDate}
                    onStartDateChange={setStartDate}
                    endDate={endDate}
                    onEndDateChange={setEndDate}
                    showAdvancedFilters={showAdvancedFilters}
                    onAdvancedFiltersToggle={() => setShowAdvancedFilters(!showAdvancedFilters)}
                    totalCount={totalDrafts}
                    filteredCount={filteredCount}
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
                        <DraftCard
                            key={contract.id}
                            contract={contract}
                            onView={handleView}  // ← ADD THIS
                            onDownload={handleDownload}
                            onShare={handleShare}
                        />
                    ))}
                </Box>
            </Box>
            {/* ← ADD VIEWER DIALOG */}
            {selectedContract && (
                <DocumentViewerDialog
                    open={viewerOpen}
                    onClose={() => {
                        setViewerOpen(false);
                        setSelectedContract(null);
                    }}
                    fileUrl={(() => {
                        // Get template fileUrl if XFDF data exists
                        if (selectedContract.xfdfString && selectedContract.templateId) {
                            const template = templateService.getTemplateById(selectedContract.templateId);
                            console.log('📄 Template for viewing:', template);
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
