'use client';

import { Box, Typography, Tab, Tabs, Alert, Autocomplete, TextField, Chip, InputAdornment } from '@mui/material';
import { Person, Assignment } from '@mui/icons-material';
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
import { AlertColor } from '@mui/material';
import { useRouter } from 'next/navigation';
import { ReviewApprovalShimmerGrid } from '@/components/common/ShimmerCard';

/**
 * Review & Approval Page
 * Shows contracts assigned to the current user for review or approval
 */
export default function ReviewApprovalPage() {
    const [contracts, setContracts] = useState<Contract[]>([]);
    const [loading, setLoading] = useState(true);
    const [tabValue, setTabValue] = useState(0); // 0 = As Reviewer, 1 = As Approver

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

    // Filter state
    type FilterOption = { label: string; value: string };
    const [statusFilter, setStatusFilter] = useState<FilterOption | null>(null);
    const [roleFilter, setRoleFilter] = useState<FilterOption | null>(null);

    // Status filter options based on tab
    const getStatusOptions = (): FilterOption[] => {
        if (tabValue === 0) {
            // My Tasks: Pending states
            return [
                { label: 'All Status', value: 'all' },
                { label: 'Pending Review', value: 'pending_review' },
                { label: 'Ready for Approval', value: 'ready_approval' },
                { label: 'Awaiting Reviews', value: 'awaiting_reviews' },
            ];
        } else {
            // History: Completed states
            return [
                { label: 'All Status', value: 'all' },
                { label: 'Reviewed', value: 'reviewed' },
                { label: 'Approved', value: 'approved' },
                { label: 'Rejected', value: 'rejected' },
            ];
        }
    };

    // Role filter options
    const roleOptions: FilterOption[] = [
        { label: 'All Roles', value: 'all' },
        { label: 'As Reviewer', value: 'reviewer' },
        { label: 'As Approver', value: 'approver' },
    ];

    // Reset filter when tab changes
    const handleTabChange = (_: React.SyntheticEvent, newValue: number) => {
        setTabValue(newValue);
        setStatusFilter(null); // Reset filter when switching tabs
        setRoleFilter(null);
    };

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
        // Filter contracts for review/approval (including approved and rejected for history)
        const assignedContracts = allContracts.filter(c =>
            c.status === ContractStatus.IN_REVIEW ||
            c.status === ContractStatus.IN_APPROVAL ||
            c.status === ContractStatus.REVIEW_APPROVAL || // backward compat
            c.status === ContractStatus.REVIEWED ||        // backward compat
            c.status === ContractStatus.APPROVED ||
            c.status === ContractStatus.REJECTED_BY_REVIEWER ||
            c.status === ContractStatus.REJECTED_BY_APPROVER
        );
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
     * Filter contracts based on tab
     * Tab 0 (My Tasks): Show pending review/approval items
     * Tab 1 (History): Show completed review/approval items (including rejected)
     */
    const getFilteredContracts = (): { contract: Contract; role: 'reviewer' | 'approver' }[] => {
        const currentUser = authService.getCurrentUser();
        if (!currentUser) return [];

        const result: { contract: Contract; role: 'reviewer' | 'approver' }[] = [];

        contracts.forEach(c => {
            // Check reviewer status for current user
            const myReviewerInfo = c.reviewers?.find(r => r.email === currentUser.email);
            const isReviewer = !!myReviewerInfo;
            const hasReviewed = myReviewerInfo?.status === 'reviewed';
            const hasRejectedAsReviewer = myReviewerInfo?.status === 'rejected';

            // Check approver status for current user
            const isApprover = c.approver?.email === currentUser.email;
            const hasApproved = c.approver?.status === 'approved';
            const hasRejectedAsApprover = c.approver?.status === 'rejected';

            // Check if all reviewers have completed
            const allReviewersComplete = !c.reviewers || c.reviewers.length === 0 ||
                c.reviewers.every(r => r.status === 'reviewed');

            if (tabValue === 0) {
                // My Tasks: Show pending items only
                // Add as reviewer card if user is a reviewer and hasn't reviewed/rejected yet
                if (isReviewer && !hasReviewed && !hasRejectedAsReviewer) {
                    result.push({ contract: c, role: 'reviewer' });
                }
                // Add as approver card if user is the approver and hasn't approved/rejected yet
                if (isApprover && !hasApproved && !hasRejectedAsApprover) {
                    result.push({ contract: c, role: 'approver' });
                }
            } else {
                // History: Show completed items only (reviewed, approved, or rejected)
                // Add as reviewer card if user reviewed or rejected this contract
                if (isReviewer && (hasReviewed || hasRejectedAsReviewer)) {
                    result.push({ contract: c, role: 'reviewer' });
                }
                // Add as approver card if user approved or rejected this contract
                if (isApprover && (hasApproved || hasRejectedAsApprover)) {
                    result.push({ contract: c, role: 'approver' });
                }
            }
        });

        // Apply filters
        let filtered = result;

        // Apply role filter
        if (roleFilter && roleFilter.value !== 'all') {
            filtered = filtered.filter(item => item.role === roleFilter.value);
        }

        // Apply status filter if selected
        if (statusFilter && statusFilter.value !== 'all') {
            filtered = filtered.filter(item => {
                const c = item.contract;
                const currentUser = authService.getCurrentUser();
                const myReviewerInfo = c.reviewers?.find(r => r.email === currentUser?.email);
                const allReviewersComplete = !c.reviewers || c.reviewers.length === 0 ||
                    c.reviewers.every(r => r.status === 'reviewed');

                if (tabValue === 0) {
                    // My Tasks filters
                    switch (statusFilter.value) {
                        case 'pending_review':
                            return item.role === 'reviewer';
                        case 'ready_approval':
                            return item.role === 'approver' && allReviewersComplete;
                        case 'awaiting_reviews':
                            return item.role === 'approver' && !allReviewersComplete;
                        default:
                            return true;
                    }
                } else {
                    // History filters
                    switch (statusFilter.value) {
                        case 'reviewed':
                            return item.role === 'reviewer' && myReviewerInfo?.status === 'reviewed';
                        case 'approved':
                            return item.role === 'approver' && c.approver?.status === 'approved';
                        case 'rejected':
                            return (item.role === 'reviewer' && myReviewerInfo?.status === 'rejected') ||
                                   (item.role === 'approver' && c.approver?.status === 'rejected');
                        default:
                            return true;
                    }
                }
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
            loadContracts();
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

        // First mark as reviewed
        const result = await contractService.markAsReviewed(contractForReviewConfirm.id, currentUser.email);

        if (result.success) {
            // Then open further review dialog
            setContractForFurtherReview(contractForReviewConfirm);
            setFurtherReviewOpen(true);
        } else {
            showNotification(result.message, 'error');
        }
    };

    /**
     * Handle submitting for further review
     * Uses addAdditionalReviewers to preserve existing reviewer statuses and approver
     */
    const handleFurtherReviewSubmit = async (additionalReviewers: string[]) => {
        const currentUser = authService.getCurrentUser();
        if (!currentUser || !contractForFurtherReview) return;

        // ✅ FIX: Use addAdditionalReviewers instead of submitForReview
        // submitForReview resets all reviewer statuses and replaces the approver
        // addAdditionalReviewers preserves existing reviewer statuses and keeps the approver
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
            // Reload contracts and switch to History tab to show approved card
            await loadContracts();
            setTabValue(1); // Switch to History tab
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
            // Reload contracts and switch to History tab to show rejected card
            await loadContracts();
            setTabValue(1); // Switch to History tab
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

    const filteredContracts = getFilteredContracts();
    const currentUser = authService.getCurrentUser();

    return (
        <AppLayout>
            <Box>
                {/* Header Section */}
                <Box sx={{ mb: 3 }}>
                    <Typography
                        fontWeight={600}
                        sx={{
                            color: 'primary.main',
                            fontSize: { xs: '1.75rem', sm: '2rem', md: '20px' },
                            mb: 0.5,
                        }}
                    >
                        Review & Approval
                    </Typography>
                    <Typography variant="body2" sx={{ color: 'text.secondary' }}>
                        Manage contracts assigned to you for review or approval
                    </Typography>
                </Box>

                {/* No user logged in */}
                {!currentUser && (
                    <Alert severity="warning">
                        Please log in to view contracts assigned to you.
                    </Alert>
                )}

                {/* Tabs for Reviewer vs Approver */}
                {currentUser && (
                    <>
                        {/* Tab bar — border spans full width */}
                        <Box
                            sx={{
                                display: 'flex',
                                justifyContent: 'space-between',
                                alignItems: 'flex-end',
                                borderBottom: '2px solid',
                                borderColor: 'divider',
                                mb: 2,
                                flexWrap: 'wrap',
                                gap: 1,
                            }}
                        >
                            <Tabs
                                value={tabValue}
                                onChange={handleTabChange}
                                sx={{
                                    minHeight: 40,
                                    '& .MuiTabs-indicator': {
                                        height: 3,
                                        borderRadius: '3px 3px 0 0',
                                        bgcolor: 'primary.main',
                                    },
                                    '& .MuiTab-root': {
                                        minHeight: 40,
                                        py: 0.5,
                                    },
                                }}
                            >
                                <Tab
                                    label="My Tasks"
                                    sx={{
                                        textTransform: 'none',
                                        fontWeight: 600,
                                        fontSize: '0.95rem',
                                        color: 'text.secondary',
                                        '&.Mui-selected': { color: 'primary.main' },
                                    }}
                                />
                                <Tab
                                    label="History"
                                    sx={{
                                        textTransform: 'none',
                                        fontWeight: 600,
                                        fontSize: '0.95rem',
                                        color: 'text.secondary',
                                        '&.Mui-selected': { color: 'primary.main' },
                                    }}
                                />
                            </Tabs>

                            {/* Filters */}
                            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, pb: 0.5 }}>
                                {/* Role Filter */}
                                <Autocomplete
                                    size="small"
                                    options={roleOptions}
                                    value={roleFilter}
                                    onChange={(_, newValue) => setRoleFilter(newValue)}
                                    getOptionLabel={(option) => option.label}
                                    isOptionEqualToValue={(option, value) => option.value === value.value}
                                    renderInput={(params) => (
                                        <TextField
                                            {...params}
                                            label="Role"
                                            InputProps={{
                                                ...params.InputProps,
                                                startAdornment: (
                                                    <InputAdornment position="start">
                                                        <Person sx={{ fontSize: 18, color: 'primary.main' }} />
                                                    </InputAdornment>
                                                ),
                                            }}
                                            sx={{
                                                '& .MuiOutlinedInput-root': {
                                                    borderRadius: 2,
                                                    bgcolor: 'white',
                                                    '& fieldset': {
                                                        borderColor: '#e0e0e0',
                                                    },
                                                    '&:hover fieldset': {
                                                        borderColor: 'primary.main',
                                                    },
                                                },
                                                '& .MuiInputLabel-root': {
                                                    fontSize: '0.875rem',
                                                },
                                            }}
                                        />
                                    )}
                                    sx={{ width: 160 }}
                                />

                                {/* Status Filter */}
                                <Autocomplete
                                    size="small"
                                    options={getStatusOptions()}
                                    value={statusFilter}
                                    onChange={(_, newValue) => setStatusFilter(newValue)}
                                    getOptionLabel={(option) => option.label}
                                    isOptionEqualToValue={(option, value) => option.value === value.value}
                                    renderInput={(params) => (
                                        <TextField
                                            {...params}
                                            label="Status"
                                            InputProps={{
                                                ...params.InputProps,
                                                startAdornment: (
                                                    <InputAdornment position="start">
                                                        <Assignment sx={{ fontSize: 18, color: 'primary.main' }} />
                                                    </InputAdornment>
                                                ),
                                            }}
                                            sx={{
                                                '& .MuiOutlinedInput-root': {
                                                    borderRadius: 2,
                                                    bgcolor: 'white',
                                                    '& fieldset': {
                                                        borderColor: '#e0e0e0',
                                                    },
                                                    '&:hover fieldset': {
                                                        borderColor: 'primary.main',
                                                    },
                                                },
                                                '& .MuiInputLabel-root': {
                                                    fontSize: '0.875rem',
                                                },
                                            }}
                                        />
                                    )}
                                    sx={{ width: 180 }}
                                />

                                {/* Result Count */}
                                {((statusFilter && statusFilter.value !== 'all') || (roleFilter && roleFilter.value !== 'all')) && (
                                    <Chip
                                        label={`${filteredContracts.length} found`}
                                        size="small"
                                        sx={{
                                            fontWeight: 600,
                                            bgcolor: 'primary.main',
                                            color: 'white',
                                        }}
                                    />
                                )}
                            </Box>
                        </Box>

                        {/* Contracts Grid */}
                        {loading ? (
                            <Box
                                sx={{
                                    display: 'grid',
                                    gridTemplateColumns: {
                                        xs: '1fr',
                                        sm: 'repeat(2, 1fr)',
                                        lg: 'repeat(3, 1fr)',
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
                                        lg: 'repeat(3, 1fr)',
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
                            // ✅ CRITICAL FIX: Load contract's saved PDF, not template
                            // Priority 1: Use contract's fileUrl (points to saved contract PDF with signatures)
                            if (selectedContract.fileUrl) {
                                console.log('📄 [ReviewApproval] Using contract.fileUrl (contract PDF)');
                                return selectedContract.fileUrl;
                            }
                            // Priority 2: Use fileData (base64) if available
                            if (selectedContract.fileData) {
                                console.log('📄 [ReviewApproval] Using contract.fileData (base64)');
                                return selectedContract.fileData;
                            }
                            // Priority 3: Use signedPdfBase64 if available
                            if (selectedContract.signedPdfBase64) {
                                console.log('📄 [ReviewApproval] Using signedPdfBase64');
                                return `data:application/pdf;base64,${selectedContract.signedPdfBase64}`;
                            }
                            // Priority 4: Fall back to template URL (last resort)
                            if (selectedContract.templateId) {
                                const url = `/api/file/${selectedContract.templateId}?type=template`;
                                console.log('📄 [ReviewApproval] Fallback: Using template URL:', url);
                                return url;
                            }
                            return "";
                        })()}
                        fileName={selectedContract.title}
                        title={selectedContract.title}
                        content={selectedContract.signedPdfBase64 ? undefined : selectedContract.content}
                        templateDocxBase64={selectedContract.templateDocxBase64}
                        fieldValues={selectedContract.fieldValues}
                        // ✅ CRITICAL FIX: Pass XFDF data to restore signatures and field values
                        initialXfdf={selectedContract.xfdfData}
                        contractId={selectedContract.id}
                        // ✅ CRITICAL FIX: Pass form fields for proper rendering
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
