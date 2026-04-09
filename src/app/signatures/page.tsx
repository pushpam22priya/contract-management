'use client';

import { Box, Typography, AlertColor, Paper } from '@mui/material';
import AppLayout from '@/components/layout/AppLayout';
import { useState, useEffect, useMemo, useRef, Suspense, useCallback } from 'react';
import dayjs, { Dayjs } from 'dayjs';
import { contractService } from '@/services/contractService';
import { Contract, ContractStatus } from '@/types/contract';
import { authService } from '@/services/authService';
import DocumentViewerDialog from '@/components/viewer/DocumentViewerDialog';
import NotificationSnackbar from '@/components/common/NotificationSnackbar';
import ContractCard from '@/components/contracts/ContractCard';
import DrawIcon from '@mui/icons-material/Draw';
import SignaturePadDialog from '@/components/contracts/SignaturePadDialog';
import { blobToBase64, verifyPdfBase64 } from '@/utils/pdfUtils';
import { sendSignatureRequestEmail } from '@/services/emailService';
import ReusableFilter, { FilterOption } from '@/components/common/ReusableFilter';
import { categoryService } from '@/services/categoryService';
import { ShimmerCardGrid } from '@/components/common/ShimmerCard';
import { useSearchParams } from 'next/navigation';
import ContractHistoryPanel from '@/components/contracts/ContractHistoryPanel';
import ContractHistoryDialog from '@/components/contracts/ContractHistoryDialog';
import type { HistoryEntry } from '@/components/contracts/ContractHistoryPanel';

const signingStatusOptions = [
    { label: 'All Status', value: 'all' },
    { label: 'Pending My Signature', value: 'pending' },
    { label: 'Signed', value: 'completed' },
    { label: 'Terminated', value: 'terminated' },
];

function SearchParamsReader({ onStatus }: { onStatus: (status: string) => void }) {
    const searchParams = useSearchParams();
    useEffect(() => {
        const param = searchParams.get('status');
        if (param) onStatus(param);
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);
    return null;
}

/**
 * Signatures Page
 * Shows contracts assigned to the current user for signature
 */
export default function SignaturesPage() {
    const [contracts, setContracts] = useState<Contract[]>([]);
    const [loading, setLoading] = useState(true);

    // Filter state
    const [searchQuery, setSearchQuery] = useState('');
    const [signingStatusFilter, setSigningStatusFilter] = useState<FilterOption[]>([signingStatusOptions[0]]);
    const [categoryFilter, setCategoryFilter] = useState<FilterOption[]>([{ label: 'All Categories', value: 'all' }]);
    const [startDate, setStartDate] = useState<Dayjs | null>(null);
    const [endDate, setEndDate] = useState<Dayjs | null>(null);
    const [showAdvancedFilters, setShowAdvancedFilters] = useState(false);
    const [categoryOptions, setCategoryOptions] = useState<FilterOption[]>([
        { label: 'All Categories', value: 'all' }
    ]);

    // Sync URL param → signing status filter on initial navigation (e.g. from dashboard)

    // Viewer state
    const [viewerOpen, setViewerOpen] = useState(false);
    const [selectedContract, setSelectedContract] = useState<Contract | null>(null);

    // ✅ Get the current user's internal signer assignment for the selected contract
    //    Includes both 'unlocked' (active signing) and 'completed' (view-only after submission)
    const currentUserInternalSigner = useMemo(() => {
        const currentUser = authService.getCurrentUser();
        if (!currentUser || !selectedContract?.internalSigners) return null;

        return selectedContract.internalSigners.find(
            s => s.email === currentUser.email && (s.status === 'unlocked' || s.status === 'completed')
        ) || null;
    }, [selectedContract]);

    // True when the current user already submitted their part — open viewer in read-only mode
    const isInternalSignerCompleted = currentUserInternalSigner?.status === 'completed';

    // ✅ Get the party configuration for the internal signer's assigned party
    const assignedPartyConfig = useMemo(() => {
        if (!currentUserInternalSigner || !selectedContract?.parties) return null;

        const party = selectedContract.parties.find(
            p => p.id === currentUserInternalSigner.partyId
        );
        return party || null;
    }, [currentUserInternalSigner, selectedContract]);

    // History panel state
    const [historyAnchorEl, setHistoryAnchorEl] = useState<HTMLElement | null>(null);
    const [historyContractId, setHistoryContractId] = useState<string | null>(null);
    const [historyDialogEntry, setHistoryDialogEntry] = useState<HistoryEntry | null>(null);

    // Signature Pad state
    const [signaturePadOpen, setSignaturePadOpen] = useState(false);
    const [contractToSign, setContractToSign] = useState<Contract | null>(null);

    // Snackbar state
    const [snackbar, setSnackbar] = useState({
        open: false,
        message: '',
        severity: 'success' as AlertColor,
    });

    // Load contracts and categories on mount
    useEffect(() => {
        loadContracts();
        loadCategories();
    }, []);

    // ═══════════════════════════════════════════════════════════════════
    // REAL-TIME POLLING: Auto-refresh when new contracts become available
    // ═══════════════════════════════════════════════════════════════════
    const pollIntervalRef = useRef<NodeJS.Timeout | null>(null);
    useEffect(() => {
        // Don't poll while viewer is open (to avoid refreshing mid-sign)
        if (viewerOpen) return;

        pollIntervalRef.current = setInterval(() => {
            // Close the history panel before refreshing so it doesn't shift during re-render
            setHistoryAnchorEl(null);
            loadContracts();
        }, 12000); // Every 12 seconds

        return () => {
            if (pollIntervalRef.current) {
                clearInterval(pollIntervalRef.current);
            }
        };
    }, [viewerOpen]);

    const loadCategories = () => {
        const categories = categoryService.getAllCategories();
        const options = [
            { label: 'All Categories', value: 'all' },
            ...categories.map(cat => ({ label: cat.name, value: cat.name }))
        ];
        setCategoryOptions(options);
    };

    /**
     * Load contracts assigned to current user for signature
     * Includes:
     * - Legacy single-signer contracts (c.signer?.email)
     * - Multi-party contracts where user is an internal signer with status 'unlocked'
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

        // Filter contracts assigned to current user for signature
        const assignedContracts = allContracts.filter(c => {
            // Check 1: Legacy single-signer flow — only while contract is waiting for signature
            if (c.signer?.email === currentUser.email && c.status === ContractStatus.WAITING_FOR_SIGNATURE) {
                return true;
            }

            // Check 2: Multi-party internal signer — always show once unlocked or completed,
            // regardless of overall contract status (stays visible even after everyone signs)
            const internalSigners = c.internalSigners || [];
            const isInternalSigner = internalSigners.some(
                s => s.email === currentUser.email && (s.status === 'unlocked' || s.status === 'completed')
            );
            if (isInternalSigner) {
                return true;
            }

            return false;
        });

        // Chain-head filtering: hide older versions when a newer version is also assigned.
        // Terminated contracts are now included in the list so the natural check handles
        // chains ending in termination too — the terminated entry IS in assignedIds.
        const assignedIds = new Set(assignedContracts.map(c => c.id));
        const headContracts = assignedContracts.filter(c => {
            // If this contract's renewal is also assigned, this is an older version — hide it.
            if (c.renewedContractId && assignedIds.has(c.renewedContractId)) return false;
            return true;
        });

        setContracts(headContracts);
        setLoading(false);
    };

    // Total contracts count
    const totalContracts = contracts.length;

    // Filter Logic
    const filteredContracts = contracts.filter(contract => {
        const currentUser = authService.getCurrentUser();

        // Signing Status Filter (multiselect) — based on THIS user's signer status
        const signingStatusActive = signingStatusFilter.length > 0 &&
            !signingStatusFilter.some(f => f.value === 'all');
        if (signingStatusActive) {
            const internalSigner = (contract.internalSigners || []).find(
                s => s.email === currentUser?.email
            );
            const wantsPending = signingStatusFilter.some(f => f.value === 'pending');
            const wantsCompleted = signingStatusFilter.some(f => f.value === 'completed');
            const wantsTerminated = signingStatusFilter.some(f => f.value === 'terminated');
            let passes = false;
            if (wantsTerminated && contract.status === ContractStatus.TERMINATED) passes = true;
            if (wantsPending) {
                const isPending =
                    (internalSigner?.status === 'unlocked') ||
                    (!internalSigner && contract.signer?.email === currentUser?.email &&
                        contract.status === ContractStatus.WAITING_FOR_SIGNATURE);
                if (isPending) passes = true;
            }
            if (wantsCompleted) {
                const isCompleted =
                    (internalSigner?.status === 'completed') ||
                    (!internalSigner && contract.signer?.email === currentUser?.email &&
                        contract.status !== ContractStatus.WAITING_FOR_SIGNATURE);
                if (isCompleted) passes = true;
            }
            if (!passes) return false;
        }

        // Search Filter
        const matchesSearch = searchQuery === '' ||
            contract.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
            contract.client?.toLowerCase().includes(searchQuery.toLowerCase());

        // Category Filter (multiselect)
        const matchesCategory = categoryFilter.some(f => f.value === 'all') ||
            categoryFilter.some(f => f.value === contract.category);

        // Date Filter
        let matchesDate = true;
        if (startDate || endDate) {
            const contractDate = dayjs(contract.createdAt);
            if (startDate && contractDate.isBefore(startDate, 'day')) matchesDate = false;
            if (endDate && contractDate.isAfter(endDate, 'day')) matchesDate = false;
        }

        return matchesSearch && matchesCategory && matchesDate;
    });

    const filteredCount = filteredContracts.length;

    /**
     * Show snackbar notification
     */
    const showNotification = (message: string, severity: AlertColor = 'success') => {
        setSnackbar({ open: true, message, severity });
    };

    /**
     * Download contract PDF via the existing download API
     */
    const handleDownload = (id: string) => {
        window.open(`/api/contracts/${id}/download`, '_blank');
    };

    /**
     * Handle View Contract
     */
    const handleView = (id: string) => {
        const contract = contracts.find(c => c.id === id);
        if (contract) {
            setSelectedContract(contract);
            setViewerOpen(true);
        }
    };

    /**
     * Open Signature Pad
     */
    const handleOpenSignaturePad = (contract: Contract) => {
        setContractToSign(contract);
        setSignaturePadOpen(true);
    };

    /**
     * Handle saving client signature (from PDF viewer)
     * This also marks the contract as signed automatically
     *
     * ✅ IMPORTANT: All pending changes are ALREADY COMMITTED before this function is called
     * The commit process happens in PDFViewerContainer.exportAnnotations() which includes:
     * - Deselecting active annotations
     * - Switching tools to finalize edits
     * - Calling field.commit() on all form fields
     * - Refreshing the document viewer
     * - Redrawing all annotations
     */
    const handleSaveSignature = async (pdfBlob: Blob, xfdfString?: string, fieldValues?: Record<string, string>, formFields?: any[]) => {
        const currentUser = authService.getCurrentUser();
        if (!currentUser || !selectedContract) return;

        console.log('═══════════════════════════════════════════════════════════════════');
        console.log('💾 [SignaturesPage] Saving client signature to contract:', selectedContract.id);
        console.log('✅ [SignaturesPage] All pending changes were committed before this callback');
        console.log('═══════════════════════════════════════════════════════════════════');
        console.log(`📄 PDF Blob size: ${pdfBlob.size} bytes`);
        console.log(`📋 XFDF string length: ${xfdfString?.length || 0} chars`);
        console.log(`📋 XFDF preview: ${xfdfString?.substring(0, 500)}...`);
        console.log(`📝 Field values count: ${fieldValues ? Object.keys(fieldValues).length : 0}`);
        console.log(`📋 Form fields count: ${formFields?.length || 0}`);
        console.log(`📋 Previous XFDF length: ${selectedContract.xfdfData?.length || 0} chars`);

        try {
            // Convert Blob to base64
            console.log('📄 [SignaturesPage] Converting PDF Blob to base64...');
            const pdfBase64 = await blobToBase64(pdfBlob);

            if (!verifyPdfBase64(pdfBase64)) {
                console.error('❌ Invalid PDF: does not start with %PDF-');
                showNotification('Failed to save: Invalid PDF data', 'error');
                return;
            }
            console.log(`   - Base64 length: ${pdfBase64.length} chars`);

            // ✅ Check if this is an internal signer (multi-party flow)
            const internalSigner = selectedContract.internalSigners?.find(
                s => s.email === currentUser.email && s.status === 'unlocked'
            );

            if (internalSigner) {
                // ✅ INTERNAL SIGNER FLOW: Use dedicated internal-sign endpoint
                console.log('📝 [SignaturesPage] Using internal-sign endpoint for multi-party flow');
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
                    const errorText = await response.text();
                    console.error(`❌ [SignaturesPage] internal-sign failed with status ${response.status}:`, errorText);
                    showNotification(`Failed to save signature: Server returned ${response.status}`, 'error');
                    return;
                }

                const result = await response.json();

                if (result.success) {
                    // Send emails to newly unlocked external signers (auto-advance notification)
                    if (result.unlockedExternalSigners?.length > 0) {
                        console.log(`📧 [SignaturesPage] Sending emails to ${result.unlockedExternalSigners.length} newly unlocked external signer(s)...`);
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
                            }).then(emailResult => {
                                if (emailResult.success) {
                                    console.log(`✅ [SignaturesPage] Email sent to ${signer.email}`);
                                } else {
                                    console.warn(`⚠️ [SignaturesPage] Email failed for ${signer.email}:`, emailResult.error);
                                }
                            }).catch(err => {
                                console.error(`❌ [SignaturesPage] Email error for ${signer.email}:`, err);
                            });
                        }
                    }

                    showNotification(`Fields for ${internalSigner.partyLabel} completed successfully!`, 'success');

                    // ✅ Close the viewer first to prevent stale data display
                    setViewerOpen(false);
                    setSelectedContract(null);

                    // Then reload to remove from signatures list
                    await loadContracts();
                } else {
                    showNotification(result.error || 'Failed to save signature', 'error');
                }
            } else {
                // ✅ LEGACY SINGLE-SIGNER FLOW
                console.log('📝 [SignaturesPage] Using legacy single-signer flow');

                // First, save the signed PDF with XFDF data
                const updateResult = await contractService.updateContractSignedPdf(
                    selectedContract.id,
                    pdfBase64,
                    xfdfString // ✅ Include XFDF to preserve annotations
                );

                if (!updateResult.success) {
                    showNotification(updateResult.message || 'Failed to save signature', 'error');
                    return;
                }

                // Then, mark the contract as signed
                const signResult = await contractService.signContract(
                    selectedContract.id,
                    currentUser.email,
                    '' // No separate signature image needed since it's in the PDF
                );

                if (signResult.success) {
                    showNotification('Contract signed successfully!', 'success');

                    // ✅ Close the viewer first to prevent stale data display
                    setViewerOpen(false);
                    setSelectedContract(null);

                    // Then reload to remove from signatures list
                    await loadContracts();
                } else {
                    showNotification(signResult.message || 'Signature saved but failed to update status', 'warning');

                    // ✅ Close viewer and reload
                    setViewerOpen(false);
                    setSelectedContract(null);
                    await loadContracts();
                }
            }
        } catch (error) {
            console.error('Error saving signature:', error);
            showNotification('Failed to save signature', 'error');
        }
    };

    /**
     * Handle Sign Contract (from signature pad dialog)
     */
    const handleSign = async (signatureImage: string) => {
        const currentUser = authService.getCurrentUser();
        if (!currentUser || !contractToSign) return;

        const result = await contractService.signContract(contractToSign.id, currentUser.email, signatureImage);

        if (result.success) {
            showNotification(result.message, 'success');
            loadContracts(); // Reload to remove signed contract from list
        } else {
            showNotification(result.message, 'error');
        }
    };

    return (
        <AppLayout>
            <Suspense fallback={null}>
                <SearchParamsReader onStatus={(status) => {
                    const matched = signingStatusOptions.find(opt => opt.value === status);
                    if (matched) setSigningStatusFilter([matched]);
                }} />
            </Suspense>
            <Box>
                {/* Header Section */}
                <Box sx={{ mb: 1 }}>
                    <Typography
                        fontWeight={600}
                        sx={{
                            color: 'primary.main',
                            fontSize: { xs: '1rem', sm: '1.5rem', md: '20px' },
                        }}
                    >
                        Contracts for Signature
                    </Typography>
                    <Typography variant="body2" sx={{ color: 'text.secondary' }}>
                        Review and sign contracts assigned to you
                    </Typography>
                </Box>

                {/* Filter Section */}
                <ReusableFilter
                    searchQuery={searchQuery}
                    onSearchChange={setSearchQuery}
                    searchPlaceholder="Search contracts or clients"
                    filters={[
                        {
                            label: 'Status',
                            value: signingStatusFilter,
                            onChange: (newValue) => setSigningStatusFilter(newValue || [signingStatusOptions[0]]),
                            options: signingStatusOptions,
                            multiple: true,
                        },
                        {
                            label: 'Category',
                            value: categoryFilter,
                            onChange: (newValue) => setCategoryFilter(newValue || [{ label: 'All Categories', value: 'all' }]),
                            options: categoryOptions,
                            multiple: true,
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
                    hasActiveFilters={
                        searchQuery !== '' ||
                        signingStatusFilter.every(f => f.value !== 'all') ||
                        categoryFilter.every(f => f.value !== 'all') ||
                        startDate !== null || endDate !== null
                    }
                    onClearFilters={() => {
                        setSearchQuery('');
                        setSigningStatusFilter([signingStatusOptions[0]]);
                        setCategoryFilter([{ label: 'All Categories', value: 'all' }]);
                        setStartDate(null);
                        setEndDate(null);
                        setShowAdvancedFilters(false);
                    }}
                />

                {/* Contracts Grid */}
                {filteredContracts.length === 0 && !loading ? (
                    <Paper
                        sx={{
                            p: 4,
                            textAlign: 'center',
                            bgcolor: 'background.paper',
                            borderRadius: 2,
                            border: '1px dashed',
                            borderColor: 'divider'
                        }}
                    >
                        <DrawIcon sx={{ fontSize: 48, color: 'text.secondary', opacity: 0.5, mb: 2 }} />
                        <Typography variant="h6" color="text.secondary" gutterBottom>
                            No Contracts to Sign
                        </Typography>
                        <Typography variant="body2" color="text.secondary">
                            You don't have any contracts waiting for your signature at the moment.
                        </Typography>
                    </Paper>
                ) : (
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
                        {loading ? (
                            <ShimmerCardGrid count={8} variant="contract" />
                        ) : (
                            filteredContracts.map((contract) => (
                                <ContractCard
                                    key={contract.id}
                                    contract={contract}
                                    onView={handleView}
                                    onDownload={handleDownload}
                                    onHistory={(id, event) => {
                                        setHistoryContractId(id);
                                        setHistoryAnchorEl(event.currentTarget);
                                    }}
                                />
                            ))
                        )}
                    </Box>
                )}

                {/* Viewer Dialog */}
                {selectedContract && (
                    <DocumentViewerDialog
                        open={viewerOpen}
                        onClose={() => {
                            setViewerOpen(false);
                            setSelectedContract(null);
                        }}
                        fileUrl={(() => {
                            // ✅ PRIORITY 1: Use fileUrl (latest saved contract PDF from API)
                            if (selectedContract.fileUrl) {
                                console.log('📄 [SignaturesPage] Using contract.fileUrl (latest saved PDF)');
                                return selectedContract.fileUrl;
                            }
                            // Priority 2: Use fileData if available (base64 contract PDF)
                            if (selectedContract.fileData) {
                                console.log('📄 [SignaturesPage] Using contract.fileData (base64)');
                                return `data:application/pdf;base64,${selectedContract.fileData}`;
                            }
                            // Priority 3: Use signedPdfBase64 (legacy/fallback)
                            if (selectedContract.signedPdfBase64) {
                                console.log('📄 [SignaturesPage] Using signedPdfBase64 (legacy)');
                                return `data:application/pdf;base64,${selectedContract.signedPdfBase64}`;
                            }
                            // Priority 4: Fall back to template URL (should rarely happen)
                            if (selectedContract.templateId) {
                                console.log('⚠️ [SignaturesPage] Falling back to template URL - contract PDF not found!');
                                return `/api/file/${selectedContract.templateId}?type=template`;
                            }
                            return "";
                        })()}
                        fileName={`${selectedContract.title}.pdf`}
                        title={selectedContract.title}
                        content={selectedContract.signedPdfBase64 ? undefined : selectedContract.content}
                        templateDocxBase64={selectedContract.templateDocxBase64}
                        fieldValues={selectedContract.fieldValues}
                        // ✅ CRITICAL: Load XFDF to display form fields and annotations
                        initialXfdf={selectedContract.xfdfData}
                        contractId={selectedContract.id}
                        // Read-only after the user has already submitted their part
                        readOnly={isInternalSignerCompleted}
                        onSave={isInternalSignerCompleted ? undefined : handleSaveSignature}
                        clientSigningMode={!isInternalSignerCompleted}
                        currentUserRole="client"
                        // Use contract's formFields (with saved ReadOnly flags)
                        formFields={selectedContract.formFields}
                        // Completed signers are view-only; active signers can only edit empty fields
                        editableFieldMode={isInternalSignerCompleted ? 'none' : 'empty-only'}
                        // ✅ Pass parties for party validation (must complete all fields of a party)
                        parties={selectedContract.parties}
                        // ✅ Show navigation button so internal signer can jump between their assigned fields
                        showAnnotationNavigation={!isInternalSignerCompleted}
                        // ✅ Pass assigned party info for internal signers
                        assignedPartyId={currentUserInternalSigner?.partyId}
                        assignedPartyLabel={currentUserInternalSigner?.partyLabel || assignedPartyConfig?.label}
                        assignedPartyColor={assignedPartyConfig?.color}
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

                {/* History detail dialog */}
                <ContractHistoryDialog
                    open={!!historyDialogEntry}
                    onClose={() => setHistoryDialogEntry(null)}
                    entry={historyDialogEntry}
                    currentContractId={historyContractId || ''}
                />

                {/* Signature Pad Dialog */}
                <SignaturePadDialog
                    open={signaturePadOpen}
                    onClose={() => setSignaturePadOpen(false)}
                    onSign={handleSign}
                />

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
