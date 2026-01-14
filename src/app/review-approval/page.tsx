'use client';

import { Box, Typography, Tab, Tabs, Alert } from '@mui/material';
import AppLayout from '@/components/layout/AppLayout';
import { useState, useEffect } from 'react';
import { useSearchParams } from 'next/navigation';
import { contractService } from '@/services/contractService';
import { templateService } from '@/services/templateService';
import { Contract } from '@/types/contract';
import { authService } from '@/services/authService';
import DocumentViewerDialog from '@/components/viewer/DocumentViewerDialog';
import ReviewApprovalCard from '@/components/contracts/ReviewApprovalCard';
import ReviewConfirmationDialog from '@/components/contracts/ReviewConfirmationDialog';
import FurtherReviewDialog from '@/components/contracts/FurtherReviewDialog';
import NotificationSnackbar from '@/components/common/NotificationSnackbar';
import { AlertColor } from '@mui/material';

/**
 * Review & Approval Page
 * Shows contracts assigned to the current user for review or approval
 */
export default function ReviewApprovalPage() {
    const [contracts, setContracts] = useState<Contract[]>([]);
    const [loading, setLoading] = useState(true);
    const [tabValue, setTabValue] = useState(0); // 0 = As Reviewer, 1 = As Approver

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
    const loadContracts = () => {
        setLoading(true);
        const currentUser = authService.getCurrentUser();

        if (!currentUser) {
            setContracts([]);
            setLoading(false);
            return;
        }

        const assignedContracts = contractService.getContractsForReview(currentUser.email);
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
     * Filter contracts based on tab (reviewer vs approver)
     */
    const getFilteredContracts = (): Contract[] => {
        const currentUser = authService.getCurrentUser();
        if (!currentUser) return [];

        if (tabValue === 0) {
            // As Reviewer
            return contracts.filter(c =>
                c.reviewers?.some(r => r.email === currentUser.email)
            );
        } else {
            // As Approver
            return contracts.filter(c =>
                c.approver?.email === currentUser.email
            );
        }
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
     */
    const handleFurtherReviewSubmit = async (additionalReviewers: string[]) => {
        const currentUser = authService.getCurrentUser();
        if (!currentUser || !contractForFurtherReview) return;

        const result = await contractService.submitForFurtherReview(
            contractForFurtherReview.id,
            additionalReviewers,
            currentUser.email
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
            loadContracts();
        } else {
            showNotification(result.message, 'error');
        }
    };

    /**
     * Handle requesting modifications
     */
    const handleRequestModification = async (contractId: string, comments: string) => {
        const currentUser = authService.getCurrentUser();
        if (!currentUser) return;

        // Determine role based on active tab
        const role = tabValue === 0 ? 'reviewer' : 'approver';

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
                        <Tabs
                            value={tabValue}
                            onChange={(_, newValue) => setTabValue(newValue)}
                            sx={{
                                mb: 3,
                                borderBottom: 1,
                                borderColor: 'divider',
                            }}
                        >
                            <Tab
                                label="As Reviewer"
                                sx={{ textTransform: 'none', fontWeight: 600 }}
                            />
                            <Tab
                                label="As Approver"
                                sx={{ textTransform: 'none', fontWeight: 600 }}
                            />
                        </Tabs>

                        {/* Contracts Grid */}
                        {filteredContracts.length === 0 ? (
                            <Alert severity="info">
                                {tabValue === 0
                                    ? 'No contracts assigned to you for review.'
                                    : 'No contracts assigned to you for approval.'}
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
                                {filteredContracts.map((contract) => (
                                    <ReviewApprovalCard
                                        key={contract.id}
                                        contract={contract}
                                        userRole={tabValue === 0 ? 'reviewer' : 'approver'}
                                        onView={handleView}
                                        onMarkAsReviewed={handleOpenReviewConfirmation}
                                        onApprove={handleApprove}
                                        onRequestModification={handleRequestModification}
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
                            if (selectedContract.xfdfString && selectedContract.templateId) {
                                const template = templateService.getTemplateById(selectedContract.templateId);
                                console.log('📄 Template for review viewing:', template);
                                const url = template?.fileUrl || "";
                                console.log('📄 Using fileUrl:', url.substring(0, 50));
                                return url;
                            }
                            return "";
                        })()}
                        fileName={selectedContract.title}
                        title={selectedContract.title}
                        content={selectedContract.xfdfString ? undefined : selectedContract.content}
                        templateDocxBase64={selectedContract.templateDocxBase64}
                        fieldValues={selectedContract.fieldValues}
                        xfdfString={selectedContract.xfdfString}
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
