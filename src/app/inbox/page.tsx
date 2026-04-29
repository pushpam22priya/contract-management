'use client';

import { useState, useEffect, useMemo, useRef } from 'react';
import { Box, Typography, Tabs, Tab, AlertColor } from '@mui/material';
import { AllInboxOutlined as AllInboxOutlinedIcon, OutboxOutlined as OutboxOutlinedIcon, CheckCircle, Cancel } from '@mui/icons-material';
import AppLayout from '@/components/layout/AppLayout';
import AppButton from '@/components/common/AppButton';
import EmptyState from '@/components/common/EmptyState';
import CompactFilter, { FilterOption } from '@/components/common/CompactFilter';
import ReviewApprovalCard from '@/components/contracts/ReviewApprovalCard';
import ContractCard from '@/components/contracts/ContractCard';
import DocumentViewerDialog from '@/components/viewer/DocumentViewerDialog';
import ReviewConfirmationDialog from '@/components/contracts/ReviewConfirmationDialog';
import FurtherReviewDialog from '@/components/contracts/FurtherReviewDialog';
import SignaturePadDialog from '@/components/contracts/SignaturePadDialog';
import NotificationSnackbar from '@/components/common/NotificationSnackbar';
import ContractHistoryPanel from '@/components/contracts/ContractHistoryPanel';
import ContractHistoryDialog from '@/components/contracts/ContractHistoryDialog';
import { ReviewApprovalShimmerGrid } from '@/components/common/ShimmerCard';
import { contractService } from '@/services/contractService';
import { authService } from '@/services/authService';
import { Contract, ContractStatus } from '@/types/contract';
import type { HistoryEntry } from '@/components/contracts/ContractHistoryPanel';
import { blobToBase64, verifyPdfBase64 } from '@/utils/pdfUtils';
import { sendSignatureRequestEmail } from '@/services/emailService';
import { useTranslations } from 'next-intl';
import { Dayjs } from 'dayjs';
import dayjs from 'dayjs';

type ReviewItem = { type: 'review'; contract: Contract; role: 'reviewer' | 'approver' };
type SignatureItem = { type: 'signature'; contract: Contract };
type InboxItem = ReviewItem | SignatureItem;

export default function InboxPage() {
    const t = useTranslations('inbox');
    const tFilters = useTranslations('filters');

    const [allContracts, setAllContracts] = useState<Contract[]>([]);
    const [loading, setLoading] = useState(true);
    const [tabValue, setTabValue] = useState(0); // 0 = Inbox, 1 = Sendbox

    // Viewer state
    const [viewerOpen, setViewerOpen] = useState(false);
    const [selectedContract, setSelectedContract] = useState<Contract | null>(null);
    const [viewerMode, setViewerMode] = useState<'review' | 'signature'>('review');

    // Review dialogs
    const [reviewConfirmOpen, setReviewConfirmOpen] = useState(false);
    const [contractForReviewConfirm, setContractForReviewConfirm] = useState<Contract | null>(null);
    const [furtherReviewOpen, setFurtherReviewOpen] = useState(false);
    const [contractForFurtherReview, setContractForFurtherReview] = useState<Contract | null>(null);

    // Signature dialogs
    const [signaturePadOpen, setSignaturePadOpen] = useState(false);
    const [contractToSign, setContractToSign] = useState<Contract | null>(null);

    // History panel
    const [historyAnchorEl, setHistoryAnchorEl] = useState<HTMLElement | null>(null);
    const [historyContractId, setHistoryContractId] = useState<string | null>(null);
    const [historyDialogEntry, setHistoryDialogEntry] = useState<HistoryEntry | null>(null);

    // Snackbar
    const [snackbar, setSnackbar] = useState({
        open: false,
        message: '',
        severity: 'success' as AlertColor,
    });

    // Filters
    const [searchQuery, setSearchQuery] = useState('');
    const [typeFilter, setTypeFilter] = useState<FilterOption[]>([]);
    const [startDate, setStartDate] = useState<Dayjs | null>(null);
    const [endDate, setEndDate] = useState<Dayjs | null>(null);
    const [showAdvancedFilters, setShowAdvancedFilters] = useState(false);

    const typeOptions: FilterOption[] = [
        { label: t('typeReviewApproval'), value: 'review' },
        { label: t('typeSignature'), value: 'signature' },
    ];

    const hasActiveFilters =
        searchQuery !== '' ||
        typeFilter.length > 0 ||
        startDate !== null ||
        endDate !== null;

    // ── Load contracts ────────────────────────────────────────────────────────
    const loadContracts = async () => {
        setLoading(true);
        const currentUser = authService.getCurrentUser();
        if (!currentUser) { setAllContracts([]); setLoading(false); return; }

        const contracts = await contractService.getAllContracts();

        // R&A: contracts in review/approval workflow where user is assigned
        const raContracts = contracts.filter(c => {
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

        // Signature: contracts assigned to current user for signing
        const sigContracts = contracts.filter(c => {
            if (c.signer?.email === currentUser.email && c.status === ContractStatus.WAITING_FOR_SIGNATURE) return true;
            return (c.internalSigners || []).some(
                s => s.email === currentUser.email && (s.status === 'unlocked' || s.status === 'completed')
            );
        });

        // Chain-head filtering for signature contracts
        const assignedIds = new Set(sigContracts.map(c => c.id));
        const headSigContracts = sigContracts.filter(
            c => !(c.renewedContractId && assignedIds.has(c.renewedContractId))
        );

        // Merge (dedup by id)
        const merged = [...raContracts];
        headSigContracts.forEach(c => {
            if (!merged.some(r => r.id === c.id)) merged.push(c);
        });

        setAllContracts(merged);
        setLoading(false);
    };

    useEffect(() => { loadContracts(); }, []);

    // Polling for real-time signature unlock updates
    const pollRef = useRef<NodeJS.Timeout | null>(null);
    useEffect(() => {
        if (viewerOpen) return;
        pollRef.current = setInterval(() => {
            setHistoryAnchorEl(null);
            loadContracts();
        }, 15000);
        return () => { if (pollRef.current) clearInterval(pollRef.current); };
    }, [viewerOpen]);

    // ── Classify items ────────────────────────────────────────────────────────
    const currentUser = authService.getCurrentUser();

    const inboxItems = useMemo((): InboxItem[] => {
        if (!currentUser) return [];
        const result: InboxItem[] = [];

        allContracts.forEach(c => {
            // R&A: pending actions
            const myReviewerInfo = c.reviewers?.find(r => r.email === currentUser.email);
            const hasReviewed = myReviewerInfo?.status === 'reviewed';
            const hasRejectedAsReviewer = myReviewerInfo?.status === 'rejected';
            const isApprover = c.approver?.email === currentUser.email;
            const hasApproved = c.approver?.status === 'approved';
            const hasRejectedAsApprover = c.approver?.status === 'rejected';

            if (myReviewerInfo && !hasReviewed && !hasRejectedAsReviewer)
                result.push({ type: 'review', contract: c, role: 'reviewer' });
            if (isApprover && !hasApproved && !hasRejectedAsApprover)
                result.push({ type: 'review', contract: c, role: 'approver' });

            // Signature: pending signing
            const internalSigner = (c.internalSigners || []).find(s => s.email === currentUser.email);
            const isPending =
                internalSigner?.status === 'unlocked' ||
                (!internalSigner && c.signer?.email === currentUser.email && c.status === ContractStatus.WAITING_FOR_SIGNATURE);

            if (isPending)
                result.push({ type: 'signature', contract: c });
        });

        return result;
    }, [allContracts, currentUser]);

    const sendboxItems = useMemo((): InboxItem[] => {
        if (!currentUser) return [];
        const result: InboxItem[] = [];

        allContracts.forEach(c => {
            // R&A: completed actions
            const myReviewerInfo = c.reviewers?.find(r => r.email === currentUser.email);
            const hasReviewed = myReviewerInfo?.status === 'reviewed';
            const hasRejectedAsReviewer = myReviewerInfo?.status === 'rejected';
            const isApprover = c.approver?.email === currentUser.email;
            const hasApproved = c.approver?.status === 'approved';
            const hasRejectedAsApprover = c.approver?.status === 'rejected';

            if (myReviewerInfo && (hasReviewed || hasRejectedAsReviewer))
                result.push({ type: 'review', contract: c, role: 'reviewer' });
            if (isApprover && (hasApproved || hasRejectedAsApprover))
                result.push({ type: 'review', contract: c, role: 'approver' });

            // Signature: completed signing
            const internalSigner = (c.internalSigners || []).find(s => s.email === currentUser.email);
            const isCompleted =
                internalSigner?.status === 'completed' ||
                (!internalSigner && c.signer?.email === currentUser.email &&
                    c.status !== ContractStatus.WAITING_FOR_SIGNATURE);

            if (isCompleted)
                result.push({ type: 'signature', contract: c });
        });

        return result;
    }, [allContracts, currentUser]);

    const tabItems = tabValue === 0 ? inboxItems : sendboxItems;

    // ── Filter items ──────────────────────────────────────────────────────────
    const filteredItems = useMemo((): InboxItem[] => {
        let items = [...tabItems];

        if (typeFilter.length > 0)
            items = items.filter(item => typeFilter.some(f => f.value === item.type));

        if (searchQuery.trim()) {
            const q = searchQuery.toLowerCase();
            items = items.filter(item =>
                item.contract.title?.toLowerCase().includes(q) ||
                item.contract.client?.toLowerCase().includes(q)
            );
        }

        if (startDate || endDate) {
            items = items.filter(item => {
                const d = dayjs(item.contract.createdAt);
                if (startDate && d.isBefore(startDate, 'day')) return false;
                if (endDate && d.isAfter(endDate, 'day')) return false;
                return true;
            });
        }

        return items;
    }, [tabItems, typeFilter, searchQuery, startDate, endDate]);

    // ── Helpers ───────────────────────────────────────────────────────────────
    const showNotification = (message: string, severity: AlertColor = 'success') =>
        setSnackbar({ open: true, message, severity });

    const handleTabChange = (_: React.SyntheticEvent, newValue: number) => {
        setTabValue(newValue);
        setSearchQuery('');
        setTypeFilter([]);
        setStartDate(null);
        setEndDate(null);
        setShowAdvancedFilters(false);
    };

    const handleClearFilters = () => {
        setSearchQuery('');
        setTypeFilter([]);
        setStartDate(null);
        setEndDate(null);
    };

    const getFileUrl = (contract: Contract): string => {
        if (contract.fileUrl) return contract.fileUrl;
        if (contract.fileData) return contract.fileData;
        if (contract.signedPdfBase64) return `data:application/pdf;base64,${contract.signedPdfBase64}`;
        if (contract.templateId) return `/api/file/${contract.templateId}?type=template`;
        return '';
    };

    // ── Viewer ────────────────────────────────────────────────────────────────
    const handleViewReview = (id: string) => {
        const contract = allContracts.find(c => c.id === id);
        if (!contract) return;
        setViewerMode('review');
        setSelectedContract(contract);
        setViewerOpen(true);
    };

    const handleViewSignature = (id: string) => {
        const contract = allContracts.find(c => c.id === id);
        if (!contract) return;
        setViewerMode('signature');
        setSelectedContract(contract);
        setViewerOpen(true);
    };

    const getViewerExtraActions = () => {
        if (viewerMode !== 'review' || !selectedContract || !currentUser) return null;

        const myReviewerInfo = selectedContract.reviewers?.find(r => r.email === currentUser.email);
        const isReviewer = !!myReviewerInfo;
        const myReviewerStatus = myReviewerInfo?.status;

        const isApprover = selectedContract.approver?.email === currentUser.email;
        const approverStatus = selectedContract.approver?.status;

        const allReviewersComplete = !selectedContract.reviewers || selectedContract.reviewers.length === 0 || 
            selectedContract.reviewers.every(r => r.status === 'reviewed');

        return (
            <Box sx={{ display: 'flex', gap: 1 }}>
                {isReviewer && myReviewerStatus !== 'reviewed' && myReviewerStatus !== 'rejected' && (
                    <>
                        <AppButton
                            variant="contained"
                            color="success"
                            onClick={() => handleOpenReviewConfirmation(selectedContract.id)}
                            sx={{ py: 0.6 }}
                        >
                            Mark as Reviewed
                        </AppButton>
                        <AppButton
                            variant="outlined"
                            color="error"
                            onClick={() => handleReject(selectedContract.id, 'reviewer')}
                            sx={{ py: 0.6 }}
                        >
                            Reject
                        </AppButton>
                    </>
                )}

                {isApprover && allReviewersComplete && approverStatus !== 'approved' && approverStatus !== 'rejected' && (
                    <>
                        <AppButton
                            variant="contained"
                            color="success"
                            onClick={() => handleApprove(selectedContract.id)}
                            sx={{ py: 0.6 }}
                        >
                            Approve
                        </AppButton>
                        <AppButton
                            variant="outlined"
                            color="error"
                            onClick={() => handleReject(selectedContract.id, 'approver')}
                            sx={{ py: 0.6 }}
                        >
                            Reject
                        </AppButton>
                    </>
                )}
            </Box>
        );
    };

    // Signature viewer props
    const currentUserInternalSigner = useMemo(() => {
        if (!currentUser || !selectedContract?.internalSigners) return null;
        return selectedContract.internalSigners.find(
            s => s.email === currentUser.email && (s.status === 'unlocked' || s.status === 'completed')
        ) || null;
    }, [selectedContract, currentUser]);

    const isInternalSignerCompleted = currentUserInternalSigner?.status === 'completed';

    const assignedPartyConfig = useMemo(() => {
        if (!currentUserInternalSigner || !selectedContract?.parties) return null;
        return selectedContract.parties.find(p => p.id === currentUserInternalSigner.partyId) || null;
    }, [currentUserInternalSigner, selectedContract]);

    const isViewerReadOnly = viewerMode === 'review' || isInternalSignerCompleted;

    // ── Review handlers ───────────────────────────────────────────────────────
    const handleOpenReviewConfirmation = (contractId: string) => {
        const contract = allContracts.find(c => c.id === contractId);
        if (!contract) return;
        setContractForReviewConfirm(contract);
        setReviewConfirmOpen(true);
    };

    const handleMarkAsReviewed = async () => {
        if (!currentUser || !contractForReviewConfirm) return;
        const result = await contractService.markAsReviewed(contractForReviewConfirm.id, currentUser.email);
        if (result.success) {
            showNotification(result.message, 'success');
            await loadContracts();
            setTabValue(1);
            setViewerOpen(false);
        } else {
            showNotification(result.message, 'error');
        }
    };

    const handleMarkAndSendForFurtherReview = async () => {
        if (!currentUser || !contractForReviewConfirm) return;
        const result = await contractService.markAsReviewed(contractForReviewConfirm.id, currentUser.email);
        if (result.success) {
            setContractForFurtherReview(contractForReviewConfirm);
            setFurtherReviewOpen(true);
            setViewerOpen(false);
        } else {
            showNotification(result.message, 'error');
        }
    };

    const handleFurtherReviewSubmit = async (additionalReviewers: string[]) => {
        if (!currentUser || !contractForFurtherReview) return;
        const result = await contractService.addAdditionalReviewers(contractForFurtherReview.id, additionalReviewers);
        if (result.success) {
            showNotification(result.message, 'success');
            loadContracts();
            setViewerOpen(false);
        } else {
            showNotification(result.message, 'error');
        }
    };

    const handleApprove = async (contractId: string) => {
        if (!currentUser) return;
        const result = await contractService.approveContract(contractId, currentUser.email);
        if (result.success) {
            showNotification(result.message, 'success');
            await loadContracts();
            setTabValue(1);
            setViewerOpen(false);
        } else {
            showNotification(result.message, 'error');
        }
    };

    const handleReject = async (contractId: string, role: 'reviewer' | 'approver') => {
        if (!currentUser) return;
        const result = role === 'reviewer'
            ? await contractService.rejectByReviewer(contractId, currentUser.email)
            : await contractService.rejectByApprover(contractId, currentUser.email);
        if (result.success) {
            showNotification(result.message, 'success');
            await loadContracts();
            setTabValue(1);
            setViewerOpen(false);
        } else {
            showNotification(result.message, 'error');
        }
    };

    const handleRequestModification = async (contractId: string, comments: string, role: 'reviewer' | 'approver') => {
        if (!currentUser) return;
        const result = await contractService.requestModification(contractId, currentUser.email, role, comments);
        if (result.success) {
            showNotification(result.message, 'success');
            loadContracts();
        } else {
            showNotification(result.message, 'error');
        }
    };

    // ── Signature handlers ────────────────────────────────────────────────────
    const handleSaveSignature = async (
        pdfBlob: Blob,
        xfdfString?: string,
        fieldValues?: Record<string, string>,
        formFields?: any[]
    ) => {
        if (!currentUser || !selectedContract) return;

        try {
            const pdfBase64 = await blobToBase64(pdfBlob);
            if (!verifyPdfBase64(pdfBase64)) {
                showNotification('Failed to save: Invalid PDF data', 'error');
                return;
            }

            const internalSigner = selectedContract.internalSigners?.find(
                s => s.email === currentUser.email && s.status === 'unlocked'
            );

            if (internalSigner) {
                const response = await fetch(`/api/contracts/${selectedContract.id}/internal-sign`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        signerEmail: currentUser.email,
                        pdfBase64,
                        xfdfData: xfdfString,
                        fieldValues,
                        formFields,
                    }),
                });

                if (!response.ok) {
                    showNotification(`Failed to save signature: Server returned ${response.status}`, 'error');
                    return;
                }

                const result = await response.json();

                if (result.success) {
                    if (result.unlockedExternalSigners?.length > 0) {
                        const baseUrl = window.location.origin;
                        const sentDate = new Date().toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
                        const expiryDate = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
                        for (const signer of result.unlockedExternalSigners) {
                            sendSignatureRequestEmail({
                                to_email: signer.email,
                                contract_title: selectedContract.title,
                                sender_name: selectedContract.createdBy,
                                sent_date: sentDate,
                                expiry_date: expiryDate,
                                signing_url: `${baseUrl}/sign/${signer.token}`,
                            });
                        }
                    }
                    showNotification(`Fields for ${internalSigner.partyLabel} completed successfully!`, 'success');
                    setViewerOpen(false);
                    setSelectedContract(null);
                    await loadContracts();
                } else {
                    showNotification(result.error || 'Failed to save signature', 'error');
                }
            } else {
                const updateResult = await contractService.updateContractSignedPdf(
                    selectedContract.id, pdfBase64, xfdfString
                );
                if (!updateResult.success) {
                    showNotification(updateResult.message || 'Failed to save signature', 'error');
                    return;
                }
                const signResult = await contractService.signContract(selectedContract.id, currentUser.email, '');
                showNotification(
                    signResult.success ? 'Contract signed successfully!' : (signResult.message || 'Signature saved but failed to update status'),
                    signResult.success ? 'success' : 'warning'
                );
                setViewerOpen(false);
                setSelectedContract(null);
                await loadContracts();
            }
        } catch {
            showNotification('Failed to save signature', 'error');
        }
    };

    const handleSign = async (signatureImage: string) => {
        if (!currentUser || !contractToSign) return;
        const result = await contractService.signContract(contractToSign.id, currentUser.email, signatureImage);
        if (result.success) {
            showNotification(result.message, 'success');
            loadContracts();
        } else {
            showNotification(result.message, 'error');
        }
    };

    const handleDownload = (id: string) => window.open(`/api/contracts/${id}/download`, '_blank');

    return (
        <AppLayout>
            <Box sx={{ display: 'flex', flexDirection: 'column', height: '100%' }}>

                {/* Page Header */}
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
                        <Typography variant="h5">{t('title')}</Typography>
                        <Box sx={{ width: 5, height: 5, borderRadius: '50%', bgcolor: 'text.disabled', flexShrink: 0 }} />
                        <Typography sx={{ color: 'text.secondary', fontSize: '0.78rem' }}>
                            {loading ? t('loading') : t('description')}
                        </Typography>
                    </Box>

                    <Tabs
                        value={tabValue}
                        onChange={handleTabChange}
                        sx={{
                            minHeight: 0,
                            '& .MuiTabs-indicator': { height: 2, borderRadius: 1 },
                            '& .MuiTab-root': {
                                minHeight: 0,
                                minWidth: 0,
                                textTransform: 'none',
                                fontSize: '0.8rem',
                                fontWeight: 500,
                                px: 1.5,
                                py: 0.75,
                                color: 'text.secondary',
                                '&.Mui-selected': { fontWeight: 600 },
                            },
                        }}
                    >
                        <Tab label={t('inboxTab')} />
                        <Tab label={t('sendboxTab')} />
                    </Tabs>
                </Box>

                {/* Filters */}
                <CompactFilter
                    searchQuery={searchQuery}
                    onSearchChange={setSearchQuery}
                    searchPlaceholder={tFilters('searchByContract')}
                    filters={[
                        {
                            label: t('type'),
                            value: typeFilter,
                            onChange: setTypeFilter,
                            options: typeOptions,
                            multiple: true,
                        },
                    ]}
                    enableDateFilter={true}
                    startDate={startDate}
                    onStartDateChange={setStartDate}
                    endDate={endDate}
                    onEndDateChange={setEndDate}
                    showAdvancedFilters={showAdvancedFilters}
                    onAdvancedFiltersToggle={() => setShowAdvancedFilters(p => !p)}
                    dateFilterTitle="Filter by Date Range"
                    showCounts={true}
                    filteredCount={filteredItems.length}
                    totalCount={tabItems.length}
                    countLabel={tabValue === 0 ? tFilters('countTasks') : tFilters('countItems')}
                    hasActiveFilters={hasActiveFilters}
                    onClearFilters={handleClearFilters}
                />

                {/* Content */}
                <Box sx={{ flex: 1, overflowY: 'auto', minHeight: 0, p: 1 }}>
                    {loading ? (
                        <Box sx={{
                            display: 'grid',
                            gridTemplateColumns: { xs: '1fr', sm: 'repeat(2, 1fr)', md: 'repeat(3, 1fr)', xl: 'repeat(4, 1fr)' },
                            gap: 2,
                        }}>
                            <ReviewApprovalShimmerGrid count={6} />
                        </Box>
                    ) : filteredItems.length === 0 ? (
                        <EmptyState
                            icon={tabValue === 0 ? <AllInboxOutlinedIcon /> : <OutboxOutlinedIcon />}
                            title={tabValue === 0 ? t('noInboxTitle') : t('noSendboxTitle')}
                            description={hasActiveFilters ? t('noFilteredDescription') : (tabValue === 0 ? t('noInboxDescription') : t('noSendboxDescription'))}
                            sx={{ minHeight: '55vh' }}
                        />
                    ) : (
                        <Box sx={{
                            display: 'grid',
                            gridTemplateColumns: { xs: '1fr', sm: 'repeat(2, 1fr)', md: 'repeat(3, 1fr)', xl: 'repeat(4, 1fr)' },
                            gap: 2,
                        }}>
                            {filteredItems.map((item, index) => {
                                if (item.type === 'review') {
                                    return (
                                        <ReviewApprovalCard
                                            key={`review-${item.contract.id}-${item.role}-${index}`}
                                            contract={item.contract}
                                            userRole={item.role}
                                            onView={handleViewReview}
                                            onMarkAsReviewed={handleOpenReviewConfirmation}
                                            onApprove={handleApprove}
                                            onRequestModification={(id, comments) =>
                                                handleRequestModification(id, comments, item.role)
                                            }
                                            onReject={(id) => handleReject(id, item.role)}
                                        />
                                    );
                                }
                                return (
                                    <ContractCard
                                        key={`sig-${item.contract.id}-${index}`}
                                        contract={item.contract}
                                        onView={handleViewSignature}
                                        onDownload={handleDownload}
                                        onHistory={(id, event) => {
                                            setHistoryContractId(id);
                                            setHistoryAnchorEl(event.currentTarget);
                                        }}
                                    />
                                );
                            })}
                        </Box>
                    )}
                </Box>

                {/* Document Viewer */}
                {selectedContract && (
                    <DocumentViewerDialog
                        open={viewerOpen}
                        onClose={() => { setViewerOpen(false); setSelectedContract(null); }}
                        fileUrl={getFileUrl(selectedContract)}
                        fileName={`${selectedContract.title}.pdf`}
                        title={selectedContract.title}
                        content={selectedContract.signedPdfBase64 ? undefined : selectedContract.content}
                        templateDocxBase64={selectedContract.templateDocxBase64}
                        fieldValues={selectedContract.fieldValues}
                        initialXfdf={selectedContract.xfdfData}
                        contractId={selectedContract.id}
                        formFields={selectedContract.formFields}
                        readOnly={isViewerReadOnly}
                        onSave={isViewerReadOnly ? undefined : handleSaveSignature}
                        clientSigningMode={viewerMode === 'signature' && !isInternalSignerCompleted}
                        currentUserRole="client"
                        editableFieldMode={isViewerReadOnly ? 'none' : 'empty-only'}
                        parties={selectedContract.parties}
                        showAnnotationNavigation={viewerMode === 'signature' && !isInternalSignerCompleted}
                        assignedPartyId={currentUserInternalSigner?.partyId}
                        assignedPartyLabel={currentUserInternalSigner?.partyLabel || assignedPartyConfig?.label}
                        assignedPartyColor={assignedPartyConfig?.color}
                        extraActions={getViewerExtraActions()}
                    />
                )}

                {/* Review Confirmation Dialog */}
                {contractForReviewConfirm && (
                    <ReviewConfirmationDialog
                        open={reviewConfirmOpen}
                        onClose={() => { setReviewConfirmOpen(false); setContractForReviewConfirm(null); }}
                        contractTitle={contractForReviewConfirm.title}
                        onMarkAsReviewed={handleMarkAsReviewed}
                        onMarkAndSendForFurtherReview={handleMarkAndSendForFurtherReview}
                    />
                )}

                {/* Further Review Dialog */}
                {contractForFurtherReview && (
                    <FurtherReviewDialog
                        open={furtherReviewOpen}
                        onClose={() => { setFurtherReviewOpen(false); setContractForFurtherReview(null); }}
                        contractId={contractForFurtherReview.id}
                        contractTitle={contractForFurtherReview.title}
                        existingReviewers={contractForFurtherReview.reviewers?.map(r => r.email) || []}
                        existingApprover={contractForFurtherReview.approver?.email || null}
                        contractInitiator={contractForFurtherReview.createdBy}
                        onSubmit={handleFurtherReviewSubmit}
                    />
                )}

                {/* Contract History Panel */}
                <ContractHistoryPanel
                    open={Boolean(historyAnchorEl)}
                    anchorEl={historyAnchorEl}
                    onClose={() => setHistoryAnchorEl(null)}
                    contractId={historyContractId || ''}
                    currentContractId={historyContractId || ''}
                    onSelectEntry={(entry) => setHistoryDialogEntry(entry)}
                />

                <ContractHistoryDialog
                    open={!!historyDialogEntry}
                    onClose={() => setHistoryDialogEntry(null)}
                    entry={historyDialogEntry}
                    currentContractId={historyContractId || ''}
                />

                {/* Signature Pad */}
                <SignaturePadDialog
                    open={signaturePadOpen}
                    onClose={() => setSignaturePadOpen(false)}
                    onSign={handleSign}
                />

                {/* Snackbar */}
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
