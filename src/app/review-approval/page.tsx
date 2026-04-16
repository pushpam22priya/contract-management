'use client';

import { Box, Typography, Alert, ToggleButtonGroup, ToggleButton } from '@mui/material';
import { AlertColor } from '@mui/material';
import AppLayout from '@/components/layout/AppLayout';
import { useState, useEffect } from 'react';
import { useSearchParams } from 'next/navigation';
import { contractService } from '@/services/contractService';
import { Contract, ContractStatus } from '@/types/contract';
import { authService } from '@/services/authService';
import DocumentViewerDialog from '@/components/viewer/DocumentViewerDialog';
import ReviewApprovalCard from '@/components/contracts/ReviewApprovalCard';
import ReviewConfirmationDialog from '@/components/contracts/ReviewConfirmationDialog';
import FurtherReviewDialog from '@/components/contracts/FurtherReviewDialog';
import NotificationSnackbar from '@/components/common/NotificationSnackbar';
import { useRouter } from 'next/navigation';
import { ReviewApprovalShimmerGrid } from '@/components/common/ShimmerCard';
// import ReusableFilter, { FilterOption } from '@/components/common/ReusableFilter';
import CompactFilter, { FilterOption } from '@/components/common/CompactFilter';
import { Dayjs } from 'dayjs';
import dayjs from 'dayjs';

/**
 * Review & Approval Page
 * Shows contracts assigned to the current user for review or approval
 */
export default function ReviewApprovalPage() {
    const [contracts, setContracts] = useState<Contract[]>([]);
    const [loading, setLoading] = useState(true);
    const [tabValue, setTabValue] = useState(0); // 0 = My Tasks, 1 = History

    const router = useRouter();

    // Viewer state
    const [viewerOpen, setViewerOpen] = useState(false);
    const [selectedContract, setSelectedContract] = useState<Contract | null>(null);

    // Review Confirmation Dialog state
    const [reviewConfirmOpen, setReviewConfirmOpen] = useState(false);
    const [contractForReviewConfirm, setContractForReviewConfirm] = useState<Contract | null>(null);

    // Further Review Dialog state
    const [furtherReviewOpen, setFurtherReviewOpen] = useState(false);
    const [contractForFurtherReview, setContractForFurtherReview] = useState<Contract | null>(null);

    // Snackbar state
    const [snackbar, setSnackbar] = useState({
        open: false,
        message: '',
        severity: 'success' as AlertColor,
    });

    // Filter state (multiselect — empty array = no filter applied)
    const [searchQuery, setSearchQuery] = useState('');
    const [roleFilterValues, setRoleFilterValues] = useState<FilterOption[]>([]);
    const [statusFilterValues, setStatusFilterValues] = useState<FilterOption[]>([]);
    const [startDate, setStartDate] = useState<Dayjs | null>(null);
    const [endDate, setEndDate] = useState<Dayjs | null>(null);
    const [showAdvancedFilters, setShowAdvancedFilters] = useState(false);

    // Role filter options
    const roleOptions: FilterOption[] = [
        { label: 'All Roles', value: 'all' },
        { label: 'As Reviewer', value: 'reviewer' },
        { label: 'As Approver', value: 'approver' },
    ];

    // Status filter options based on tab
    const getStatusOptions = (): FilterOption[] => {
        if (tabValue === 0) {
            return [
                { label: 'All Status', value: 'all' },
                { label: 'Pending Review', value: 'pending_review' },
                { label: 'Ready for Approval', value: 'ready_approval' },
                { label: 'Awaiting Reviews', value: 'awaiting_reviews' },
            ];
        } else {
            return [
                { label: 'All Status', value: 'all' },
                { label: 'Reviewed', value: 'reviewed' },
                { label: 'Approved', value: 'approved' },
                { label: 'Rejected', value: 'rejected' },
            ];
        }
    };

    // Reset filters when tab changes
    const handleTabChange = (newValue: number) => {
        setTabValue(newValue);
        setSearchQuery('');
        setRoleFilterValues([]);
        setStatusFilterValues([]);
        setStartDate(null);
        setEndDate(null);
        setShowAdvancedFilters(false);
    };

    const handleClearFilters = () => {
        setSearchQuery('');
        setRoleFilterValues([]);
        setStatusFilterValues([]);
        setStartDate(null);
        setEndDate(null);
    };

    const hasActiveFilters =
        searchQuery !== '' ||
        roleFilterValues.length > 0 ||
        statusFilterValues.length > 0 ||
        startDate !== null ||
        endDate !== null;

    // Load contracts on mount
    const searchParams = useSearchParams();

    useEffect(() => {
        loadContracts();

        // Handle tab param
        const tabParam = searchParams.get('tab');
        if (tabParam === 'approver') {
            setTabValue(1);
        } else if (tabParam === 'reviewer') {
            setTabValue(0);
        }

        // Pre-populate search from URL (e.g. from dashboard Recent Contracts)
        const searchParam = searchParams.get('search');
        if (searchParam) setSearchQuery(searchParam);
    }, [searchParams]);

    /**
     * Load contracts assigned to current user
     */
    const loadContracts = async () => {
        setLoading(true);
        const currentUser = authService.getCurrentUser();

        if (!currentUser) {
            setContracts([]);
            setLoading(false);
            return;
        }

        const allContracts = await contractService.getAllContracts();
        const assignedContracts = allContracts.filter(c => {
            const isReviewer = c.reviewers?.some(r => r.email === currentUser.email);
            const isApprover = c.approver?.email === currentUser.email;
            const inWorkflow =
                c.status === ContractStatus.IN_REVIEW ||
                c.status === ContractStatus.IN_APPROVAL ||
                c.status === ContractStatus.REVIEW_APPROVAL ||
                c.status === ContractStatus.REVIEWED ||
                c.status === ContractStatus.REJECTED_BY_REVIEWER ||
                c.status === ContractStatus.REJECTED_BY_APPROVER;
            return inWorkflow || isReviewer || isApprover;
        });
        setContracts(assignedContracts);
        setLoading(false);
    };

    /**
     * Show snackbar notification
     */
    const showNotification = (message: string, severity: AlertColor = 'success') => {
        setSnackbar({ open: true, message, severity });
    };

    /**
     * Get base contracts for the current tab (before user-applied filters)
     */
    const getTabContracts = (): { contract: Contract; role: 'reviewer' | 'approver' }[] => {
        const currentUser = authService.getCurrentUser();
        if (!currentUser) return [];

        const result: { contract: Contract; role: 'reviewer' | 'approver' }[] = [];

        contracts.forEach(c => {
            const myReviewerInfo = c.reviewers?.find(r => r.email === currentUser.email);
            const isReviewer = !!myReviewerInfo;
            const hasReviewed = myReviewerInfo?.status === 'reviewed';
            const hasRejectedAsReviewer = myReviewerInfo?.status === 'rejected';
            const isApprover = c.approver?.email === currentUser.email;
            const hasApproved = c.approver?.status === 'approved';
            const hasRejectedAsApprover = c.approver?.status === 'rejected';

            if (tabValue === 0) {
                if (isReviewer && !hasReviewed && !hasRejectedAsReviewer) {
                    result.push({ contract: c, role: 'reviewer' });
                }
                if (isApprover && !hasApproved && !hasRejectedAsApprover) {
                    result.push({ contract: c, role: 'approver' });
                }
            } else {
                if (isReviewer && (hasReviewed || hasRejectedAsReviewer)) {
                    result.push({ contract: c, role: 'reviewer' });
                }
                if (isApprover && (hasApproved || hasRejectedAsApprover)) {
                    result.push({ contract: c, role: 'approver' });
                }
            }
        });

        return result;
    };

    /**
     * Filter contracts based on tab + search + role + status filters
     */
    const getFilteredContracts = (): { contract: Contract; role: 'reviewer' | 'approver' }[] => {
        let filtered = getTabContracts();

        // Search filter
        if (searchQuery.trim()) {
            const q = searchQuery.toLowerCase();
            filtered = filtered.filter(item =>
                item.contract.title?.toLowerCase().includes(q) ||
                item.contract.client?.toLowerCase().includes(q)
            );
        }

        // Role filter (multiselect — OR logic)
        if (roleFilterValues.length > 0) {
            filtered = filtered.filter(item => roleFilterValues.some(r => r.value === item.role));
        }

        // Date filter — by sentAt (when contract was sent for review/approval)
        if (startDate || endDate) {
            filtered = filtered.filter(item => {
                const user = authService.getCurrentUser();
                let sentAt: string | undefined;
                if (item.role === 'reviewer') {
                    const myInfo = item.contract.reviewers?.find(r => r.email === user?.email);
                    sentAt = myInfo?.sentAt || item.contract.createdAt;
                } else {
                    sentAt = item.contract.approver?.sentAt || item.contract.createdAt;
                }
                if (!sentAt) return true;
                const itemDate = dayjs(sentAt);
                if (startDate && itemDate.isBefore(startDate, 'day')) return false;
                if (endDate && itemDate.isAfter(endDate, 'day')) return false;
                return true;
            });
        }

        // Status filter (multiselect — OR logic)
        if (statusFilterValues.length > 0) {
            filtered = filtered.filter(item => {
                const c = item.contract;
                const currentUser = authService.getCurrentUser();
                const myReviewerInfo = c.reviewers?.find(r => r.email === currentUser?.email);
                const allReviewersComplete = !c.reviewers || c.reviewers.length === 0 ||
                    c.reviewers.every(r => r.status === 'reviewed');

                return statusFilterValues.some(sv => {
                    if (tabValue === 0) {
                        switch (sv.value) {
                            case 'pending_review': return item.role === 'reviewer';
                            case 'ready_approval': return item.role === 'approver' && allReviewersComplete;
                            case 'awaiting_reviews': return item.role === 'approver' && !allReviewersComplete;
                            default: return false;
                        }
                    } else {
                        switch (sv.value) {
                            case 'reviewed': return item.role === 'reviewer' && myReviewerInfo?.status === 'reviewed';
                            case 'approved': return item.role === 'approver' && c.approver?.status === 'approved';
                            case 'rejected':
                                return (item.role === 'reviewer' && myReviewerInfo?.status === 'rejected') ||
                                       (item.role === 'approver' && c.approver?.status === 'rejected');
                            default: return false;
                        }
                    }
                });
            });
        }

        return filtered;
    };

    /**
     * Handle opening review confirmation dialog
     */
    const handleOpenReviewConfirmation = (contractId: string) => {
        const contract = contracts.find(c => c.id === contractId);
        if (!contract) return;

        setContractForReviewConfirm(contract);
        setReviewConfirmOpen(true);
    };

    /**
     * Handle marking contract as reviewed (without further review)
     */
    const handleMarkAsReviewed = async () => {
        const currentUser = authService.getCurrentUser();
        if (!currentUser || !contractForReviewConfirm) return;

        const result = await contractService.markAsReviewed(contractForReviewConfirm.id, currentUser.email);

        if (result.success) {
            showNotification(result.message, 'success');
            await loadContracts();
            setTabValue(1);
        } else {
            showNotification(result.message, 'error');
        }
    };

    /**
     * Handle marking as reviewed and sending for further review
     */
    const handleMarkAndSendForFurtherReview = async () => {
        const currentUser = authService.getCurrentUser();
        if (!currentUser || !contractForReviewConfirm) return;

        const result = await contractService.markAsReviewed(contractForReviewConfirm.id, currentUser.email);

        if (result.success) {
            setContractForFurtherReview(contractForReviewConfirm);
            setFurtherReviewOpen(true);
        } else {
            showNotification(result.message, 'error');
        }
    };

    /**
     * Handle submitting for further review
     */
    const handleFurtherReviewSubmit = async (additionalReviewers: string[]) => {
        const currentUser = authService.getCurrentUser();
        if (!currentUser || !contractForFurtherReview) return;

        const result = await contractService.addAdditionalReviewers(
            contractForFurtherReview.id,
            additionalReviewers
        );

        if (result.success) {
            showNotification(result.message, 'success');
            loadContracts();
        } else {
            showNotification(result.message, 'error');
        }
    };

    /**
     * Handle approving contract
     */
    const handleApprove = async (contractId: string) => {
        const currentUser = authService.getCurrentUser();
        if (!currentUser) return;

        const result = await contractService.approveContract(contractId, currentUser.email);

        if (result.success) {
            showNotification(result.message, 'success');
            await loadContracts();
            setTabValue(1);
        } else {
            showNotification(result.message, 'error');
        }
    };

    /**
     * Handle rejecting contract (by reviewer or approver)
     */
    const handleReject = async (contractId: string, role: 'reviewer' | 'approver') => {
        const currentUser = authService.getCurrentUser();
        if (!currentUser) return;

        let result;
        if (role === 'reviewer') {
            result = await contractService.rejectByReviewer(contractId, currentUser.email);
        } else {
            result = await contractService.rejectByApprover(contractId, currentUser.email);
        }

        if (result.success) {
            showNotification(result.message, 'success');
            await loadContracts();
            setTabValue(1);
        } else {
            showNotification(result.message, 'error');
        }
    };

    /**
     * Handle requesting modifications with explicit role
     */
    const handleRequestModification = async (
        contractId: string,
        comments: string,
        role: 'reviewer' | 'approver'
    ) => {
        const currentUser = authService.getCurrentUser();
        if (!currentUser) return;

        const result = await contractService.requestModification(
            contractId,
            currentUser.email,
            role,
            comments
        );

        if (result.success) {
            showNotification(result.message, 'success');
            loadContracts();
        } else {
            showNotification(result.message, 'error');
        }
    };

    /**
     * Handle viewing contract
     */
    const handleView = (id: string) => {
        const contract = contracts.find(c => c.id === id);
        if (!contract) return;

        setSelectedContract(contract);
        setViewerOpen(true);
    };

    const tabContracts = getTabContracts();
    const filteredContracts = getFilteredContracts();
    const currentUser = authService.getCurrentUser();

    return (
        <AppLayout>
            <Box sx={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
                {/* Header Section */}
                <Box sx={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    bgcolor: 'background.paper',
                    px: 2,
                    py: 1,
                    borderBottom: '1px solid',
                    borderColor: 'divider',
                }}>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                        <Typography fontWeight={600} sx={{ color: 'primary.main', fontSize: '0.95rem' }}>
                            Review & Approval
                        </Typography>
                        <Box sx={{ width: 5, height: 5, borderRadius: '50%', bgcolor: 'text.disabled', flexShrink: 0 }} />
                        <Typography sx={{ color: 'text.secondary', fontSize: '0.78rem' }}>
                            Manage contracts assigned to you for review or approval
                        </Typography>
                    </Box>

                    {currentUser && (
                        <ToggleButtonGroup
                            value={tabValue === 0 ? 'tasks' : 'history'}
                            exclusive
                            onChange={(_, val) => { if (val !== null) handleTabChange(val === 'tasks' ? 0 : 1); }}
                            size="small"
                            sx={{
                                '& .MuiToggleButton-root': {
                                    textTransform: 'none',
                                    fontWeight: 600,
                                    fontSize: '0.8rem',
                                    px: 1.5,
                                    py: 0.5,
                                    borderColor: 'divider',
                                    color: 'text.secondary',
                                    '&.Mui-selected': {
                                        bgcolor: 'primary.main',
                                        color: 'white',
                                        '&:hover': { bgcolor: 'primary.dark' },
                                    },
                                },
                            }}
                        >
                            <ToggleButton value="tasks">My Tasks</ToggleButton>
                            <ToggleButton value="history">History</ToggleButton>
                        </ToggleButtonGroup>
                    )}
                </Box>

                {/* No user logged in */}
                {!currentUser && (
                    <Alert severity="warning">
                        Please log in to view contracts assigned to you.
                    </Alert>
                )}

                {currentUser && (
                    <>

                          {/* Filters */}
                        {/* <ReusableFilter */}
                        <CompactFilter
                            searchQuery={searchQuery}
                            onSearchChange={setSearchQuery}
                            searchPlaceholder="Search by contract or client name"
                            filters={[
                                {
                                    label: 'Role',
                                    value: roleFilterValues,
                                    onChange: setRoleFilterValues,
                                    options: roleOptions.filter(o => o.value !== 'all'),
                                    multiple: true,
                                },
                                {
                                    label: 'Status',
                                    value: statusFilterValues,
                                    onChange: setStatusFilterValues,
                                    options: getStatusOptions().filter(o => o.value !== 'all'),
                                    multiple: true,
                                },
                            ]}
                            enableDateFilter={true}
                            startDate={startDate}
                            onStartDateChange={setStartDate}
                            endDate={endDate}
                            onEndDateChange={setEndDate}
                            showAdvancedFilters={showAdvancedFilters}
                            onAdvancedFiltersToggle={() => setShowAdvancedFilters(prev => !prev)}
                            dateFilterTitle="Filter by Sent Date"
                            showCounts={true}
                            filteredCount={filteredContracts.length}
                            totalCount={tabContracts.length}
                            countLabel={tabValue === 0 ? 'tasks' : 'items'}
                            hasActiveFilters={hasActiveFilters}
                            onClearFilters={handleClearFilters}
                        />


                        {/* Contracts Grid */}
                        <Box sx={{ flex: 1, overflowY: 'auto', minHeight: 0, p: 1 }}>
                        {loading ? (
                            <Box
                                sx={{
                                    display: 'grid',
                                    gridTemplateColumns: {
                                        xs: '1fr',
                                        sm: 'repeat(2, 1fr)',
                                        md: 'repeat(3, 1fr)',
                                        xl: 'repeat(4, 1fr)',
                                    },
                                    gap: 2,
                                }}
                            >
                                <ReviewApprovalShimmerGrid count={6} />
                            </Box>
                        ) : filteredContracts.length === 0 ? (
                            <Alert severity="info">
                                {tabValue === 0
                                    ? 'No pending contracts for review or approval.'
                                    : 'No completed reviews or approvals yet.'}
                            </Alert>
                        ) : (
                            <Box
                                sx={{
                                    display: 'grid',
                                    gridTemplateColumns: {
                                        xs: '1fr',
                                        sm: 'repeat(2, 1fr)',
                                        md: 'repeat(3, 1fr)',
                                        xl: 'repeat(4, 1fr)',
                                    },
                                    gap: 2,
                                }}
                            >
                                {filteredContracts.map((item, index) => (
                                    <ReviewApprovalCard
                                        key={`${item.contract.id}-${item.role}-${index}`}
                                        contract={item.contract}
                                        userRole={item.role}
                                        onView={handleView}
                                        onMarkAsReviewed={handleOpenReviewConfirmation}
                                        onApprove={handleApprove}
                                        onRequestModification={(id, comments) =>
                                            handleRequestModification(id, comments, item.role)
                                        }
                                        onReject={(id) => handleReject(id, item.role)}
                                    />
                                ))}
                            </Box>
                        )}
                        </Box>
                    </>
                )}

                {/* Document Viewer Dialog */}
                {selectedContract && (
                    <DocumentViewerDialog
                        open={viewerOpen}
                        onClose={() => {
                            setViewerOpen(false);
                            setSelectedContract(null);
                        }}
                        fileUrl={(() => {
                            if (selectedContract.fileUrl) {
                                return selectedContract.fileUrl;
                            }
                            if (selectedContract.fileData) {
                                return selectedContract.fileData;
                            }
                            if (selectedContract.signedPdfBase64) {
                                return `data:application/pdf;base64,${selectedContract.signedPdfBase64}`;
                            }
                            if (selectedContract.templateId) {
                                return `/api/file/${selectedContract.templateId}?type=template`;
                            }
                            return "";
                        })()}
                        fileName={selectedContract.title}
                        title={selectedContract.title}
                        content={selectedContract.signedPdfBase64 ? undefined : selectedContract.content}
                        templateDocxBase64={selectedContract.templateDocxBase64}
                        fieldValues={selectedContract.fieldValues}
                        initialXfdf={selectedContract.xfdfData}
                        contractId={selectedContract.id}
                        formFields={selectedContract.formFields}
                        readOnly={true}
                    />
                )}

                {/* Review Confirmation Dialog */}
                {contractForReviewConfirm && (
                    <ReviewConfirmationDialog
                        open={reviewConfirmOpen}
                        onClose={() => {
                            setReviewConfirmOpen(false);
                            setContractForReviewConfirm(null);
                        }}
                        contractTitle={contractForReviewConfirm.title}
                        onMarkAsReviewed={handleMarkAsReviewed}
                        onMarkAndSendForFurtherReview={handleMarkAndSendForFurtherReview}
                    />
                )}

                {/* Further Review Dialog */}
                {contractForFurtherReview && (
                    <FurtherReviewDialog
                        open={furtherReviewOpen}
                        onClose={() => {
                            setFurtherReviewOpen(false);
                            setContractForFurtherReview(null);
                        }}
                        contractId={contractForFurtherReview.id}
                        contractTitle={contractForFurtherReview.title}
                        existingReviewers={contractForFurtherReview.reviewers?.map(r => r.email) || []}
                        existingApprover={contractForFurtherReview.approver?.email || null}
                        contractInitiator={contractForFurtherReview.createdBy}
                        onSubmit={handleFurtherReviewSubmit}
                    />
                )}

                {/* Notification Snackbar */}
                <NotificationSnackbar
                    open={snackbar.open}
                    message={snackbar.message}
                    severity={snackbar.severity}
                    onClose={() => setSnackbar({ ...snackbar, open: false })}
                />
            </Box>
        </AppLayout>
    );
}
