'use client';

import { Box, Typography, AlertColor, Paper } from '@mui/material';
import { useState, useEffect, useMemo, useRef } from 'react';
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
// import ReusableFilter, { FilterOption } from '@/components/common/ReusableFilter';
import CompactFilter, { FilterOption } from '@/components/common/CompactFilter';
import { categoryService } from '@/services/categoryService';
import { ShimmerCardGrid } from '@/components/common/ShimmerCard';
import ContractHistoryPanel from '@/components/contracts/ContractHistoryPanel';
import ContractHistoryDialog from '@/components/contracts/ContractHistoryDialog';
import type { HistoryEntry } from '@/components/contracts/ContractHistoryPanel';

const signingStatusOptions = [
    { label: 'All Status', value: 'all' },
    { label: 'Pending My Signature', value: 'pending' },
    { label: 'Signed', value: 'completed' },
    { label: 'Terminated', value: 'terminated' },
];

export default function SignaturesTab({ headerLeft }: { headerLeft?: React.ReactNode }) {
    const [contracts, setContracts] = useState<Contract[]>([]);
    const [loading, setLoading] = useState(true);

    const [searchQuery, setSearchQuery] = useState('');
    const [signingStatusFilter, setSigningStatusFilter] = useState<FilterOption[]>([signingStatusOptions[0]]);
    const [categoryFilter, setCategoryFilter] = useState<FilterOption[]>([{ label: 'All Categories', value: 'all' }]);
    const [startDate, setStartDate] = useState<Dayjs | null>(null);
    const [endDate, setEndDate] = useState<Dayjs | null>(null);
    const [showAdvancedFilters, setShowAdvancedFilters] = useState(false);
    const [categoryOptions, setCategoryOptions] = useState<FilterOption[]>([{ label: 'All Categories', value: 'all' }]);

    const [viewerOpen, setViewerOpen] = useState(false);
    const [selectedContract, setSelectedContract] = useState<Contract | null>(null);

    const [historyAnchorEl, setHistoryAnchorEl] = useState<HTMLElement | null>(null);
    const [historyContractId, setHistoryContractId] = useState<string | null>(null);
    const [historyDialogEntry, setHistoryDialogEntry] = useState<HistoryEntry | null>(null);

    const [signaturePadOpen, setSignaturePadOpen] = useState(false);
    const [contractToSign, setContractToSign] = useState<Contract | null>(null);

    const [snackbar, setSnackbar] = useState({ open: false, message: '', severity: 'success' as AlertColor });

    const currentUserInternalSigner = useMemo(() => {
        const currentUser = authService.getCurrentUser();
        if (!currentUser || !selectedContract?.internalSigners) return null;
        return selectedContract.internalSigners.find(s => s.email === currentUser.email && (s.status === 'unlocked' || s.status === 'completed')) || null;
    }, [selectedContract]);

    const isInternalSignerCompleted = currentUserInternalSigner?.status === 'completed';

    const assignedPartyConfig = useMemo(() => {
        if (!currentUserInternalSigner || !selectedContract?.parties) return null;
        return selectedContract.parties.find(p => p.id === currentUserInternalSigner.partyId) || null;
    }, [currentUserInternalSigner, selectedContract]);

    const showNotification = (message: string, severity: AlertColor = 'success') => {
        setSnackbar({ open: true, message, severity });
    };

    const loadCategories = () => {
        const categories = categoryService.getAllCategories();
        setCategoryOptions([{ label: 'All Categories', value: 'all' }, ...categories.map(cat => ({ label: cat.name, value: cat.name }))]);
    };

    const loadContracts = async () => {
        setLoading(true);
        const currentUser = authService.getCurrentUser();
        if (!currentUser) { setContracts([]); setLoading(false); return; }
        const allContracts = await contractService.getAllContracts();
        const assignedContracts = allContracts.filter(c => {
            if (c.signer?.email === currentUser.email && c.status === ContractStatus.WAITING_FOR_SIGNATURE) return true;
            const internalSigners = c.internalSigners || [];
            return internalSigners.some(s => s.email === currentUser.email && (s.status === 'unlocked' || s.status === 'completed'));
        });
        const assignedIds = new Set(assignedContracts.map(c => c.id));
        const headContracts = assignedContracts.filter(c => !(c.renewedContractId && assignedIds.has(c.renewedContractId)));
        setContracts(headContracts);
        setLoading(false);
    };

    useEffect(() => {
        loadContracts();
        loadCategories();
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    // Real-time polling
    const pollIntervalRef = useRef<NodeJS.Timeout | null>(null);
    useEffect(() => {
        if (viewerOpen) return;
        pollIntervalRef.current = setInterval(() => { setHistoryAnchorEl(null); loadContracts(); }, 12000);
        return () => { if (pollIntervalRef.current) clearInterval(pollIntervalRef.current); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [viewerOpen]);

    const filteredContracts = contracts.filter(contract => {
        const currentUser = authService.getCurrentUser();
        const signingStatusActive = signingStatusFilter.length > 0 && !signingStatusFilter.some(f => f.value === 'all');
        if (signingStatusActive) {
            const internalSigner = (contract.internalSigners || []).find(s => s.email === currentUser?.email);
            const wantsPending = signingStatusFilter.some(f => f.value === 'pending');
            const wantsCompleted = signingStatusFilter.some(f => f.value === 'completed');
            const wantsTerminated = signingStatusFilter.some(f => f.value === 'terminated');
            let passes = false;
            if (wantsTerminated && contract.status === ContractStatus.TERMINATED) passes = true;
            if (wantsPending) {
                const isPending = (internalSigner?.status === 'unlocked') || (!internalSigner && contract.signer?.email === currentUser?.email && contract.status === ContractStatus.WAITING_FOR_SIGNATURE);
                if (isPending) passes = true;
            }
            if (wantsCompleted) {
                const isCompleted = (internalSigner?.status === 'completed') || (!internalSigner && contract.signer?.email === currentUser?.email && contract.status !== ContractStatus.WAITING_FOR_SIGNATURE);
                if (isCompleted) passes = true;
            }
            if (!passes) return false;
        }
        const matchesSearch = searchQuery === '' || contract.title.toLowerCase().includes(searchQuery.toLowerCase()) || contract.client?.toLowerCase().includes(searchQuery.toLowerCase());
        const matchesCategory = categoryFilter.some(f => f.value === 'all') || categoryFilter.some(f => f.value === contract.category);
        let matchesDate = true;
        if (startDate || endDate) {
            const d = dayjs(contract.createdAt);
            if (startDate && d.isBefore(startDate, 'day')) matchesDate = false;
            if (endDate && d.isAfter(endDate, 'day')) matchesDate = false;
        }
        return matchesSearch && matchesCategory && matchesDate;
    });

    const handleDownload = (id: string) => { window.open(`/api/contracts/${id}/download`, '_blank'); };

    const handleView = (id: string) => {
        const contract = contracts.find(c => c.id === id);
        if (contract) { setSelectedContract(contract); setViewerOpen(true); }
    };

    const handleSaveSignature = async (pdfBlob: Blob, xfdfString?: string, fieldValues?: Record<string, string>, formFields?: any[]) => {
        const currentUser = authService.getCurrentUser();
        if (!currentUser || !selectedContract) return;
        try {
            const pdfBase64 = await blobToBase64(pdfBlob);
            if (!verifyPdfBase64(pdfBase64)) { showNotification('Failed to save: Invalid PDF data', 'error'); return; }

            const internalSigner = selectedContract.internalSigners?.find(s => s.email === currentUser.email && s.status === 'unlocked');
            if (internalSigner) {
                const response = await fetch(`/api/contracts/${selectedContract.id}/internal-sign`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ signerEmail: currentUser.email, pdfBase64, xfdfData: xfdfString, fieldValues, formFields }),
                });
                if (!response.ok) { showNotification(`Failed to save signature: Server returned ${response.status}`, 'error'); return; }
                const result = await response.json();
                if (result.success) {
                    if (result.unlockedExternalSigners?.length > 0) {
                        const baseUrl = window.location.origin;
                        const sentDate = new Date().toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
                        const expiryDate = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
                        for (const signer of result.unlockedExternalSigners) {
                            sendSignatureRequestEmail({ to_email: signer.email, contract_title: selectedContract.title, sender_name: selectedContract.createdBy, sent_date: sentDate, expiry_date: expiryDate, signing_url: `${baseUrl}/sign/${signer.token}` }).catch(() => {});
                        }
                    }
                    showNotification(`Fields for ${internalSigner.partyLabel} completed successfully!`, 'success');
                    setViewerOpen(false); setSelectedContract(null);
                    await loadContracts();
                } else { showNotification(result.error || 'Failed to save signature', 'error'); }
            } else {
                const updateResult = await contractService.updateContractSignedPdf(selectedContract.id, pdfBase64, xfdfString);
                if (!updateResult.success) { showNotification(updateResult.message || 'Failed to save signature', 'error'); return; }
                const signResult = await contractService.signContract(selectedContract.id, currentUser.email, '');
                if (signResult.success) { showNotification('Contract signed successfully!', 'success'); }
                else { showNotification(signResult.message || 'Signature saved but failed to update status', 'warning'); }
                setViewerOpen(false); setSelectedContract(null);
                await loadContracts();
            }
        } catch { showNotification('Failed to save signature', 'error'); }
    };

    const handleSign = async (signatureImage: string) => {
        const currentUser = authService.getCurrentUser();
        if (!currentUser || !contractToSign) return;
        const result = await contractService.signContract(contractToSign.id, currentUser.email, signatureImage);
        if (result.success) { showNotification(result.message, 'success'); loadContracts(); }
        else { showNotification(result.message, 'error'); }
    };

    return (
        <>
            <Box sx={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
                {/* Header */}
                <Box sx={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    flexWrap: 'wrap',
                    gap: 1,
                    bgcolor: 'background.paper',
                    px: 2,
                    py: 1,
                    borderBottom: '1px solid',
                    borderColor: 'divider',
                }}>
                    {headerLeft || (
                        <Box>
                            <Typography fontWeight={600} sx={{ color: 'primary.main', fontSize: { xs: '1rem', sm: '1.5rem', md: '20px' } }}>
                                Contracts for Signature
                            </Typography>
                            <Typography variant="body2" sx={{ color: 'text.secondary' }}>
                                Review and sign contracts assigned to you
                            </Typography>
                        </Box>
                    )}
                </Box>

                {/* Filter */}
                {/* <ReusableFilter */}
                <CompactFilter
                    searchQuery={searchQuery}
                    onSearchChange={setSearchQuery}
                    searchPlaceholder="Search contracts or clients"
                    filters={[
                        { label: 'Status', value: signingStatusFilter, onChange: (v) => setSigningStatusFilter(v || [signingStatusOptions[0]]), options: signingStatusOptions, multiple: true },
                        { label: 'Category', value: categoryFilter, onChange: (v) => setCategoryFilter(v || [{ label: 'All Categories', value: 'all' }]), options: categoryOptions, multiple: true },
                    ]}
                    enableDateFilter={true}
                    startDate={startDate}
                    onStartDateChange={setStartDate}
                    endDate={endDate}
                    onEndDateChange={setEndDate}
                    showAdvancedFilters={showAdvancedFilters}
                    onAdvancedFiltersToggle={() => setShowAdvancedFilters(!showAdvancedFilters)}
                    dateFilterTitle="Filter by Contract Date Range"
                    filteredCount={filteredContracts.length}
                    totalCount={contracts.length}
                    countLabel="contracts"
                    hasActiveFilters={searchQuery !== '' || signingStatusFilter.every(f => f.value !== 'all') || categoryFilter.every(f => f.value !== 'all') || startDate !== null || endDate !== null}
                    onClearFilters={() => { setSearchQuery(''); setSigningStatusFilter([signingStatusOptions[0]]); setCategoryFilter([{ label: 'All Categories', value: 'all' }]); setStartDate(null); setEndDate(null); setShowAdvancedFilters(false); }}
                />

                {/* Grid */}
                <Box sx={{ flex: 1, overflowY: 'auto', minHeight: 0, pb: 2 }}>
                {filteredContracts.length === 0 && !loading ? (
                    <Paper sx={{ p: 4, textAlign: 'center', bgcolor: 'background.paper', borderRadius: 2, border: '1px dashed', borderColor: 'divider' }}>
                        <DrawIcon sx={{ fontSize: 48, color: 'text.secondary', opacity: 0.5, mb: 2 }} />
                        <Typography variant="h6" color="text.secondary" gutterBottom>No Contracts to Sign</Typography>
                        <Typography variant="body2" color="text.secondary">You don't have any contracts waiting for your signature at the moment.</Typography>
                    </Paper>
                ) : (
                    <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: 'repeat(2, 1fr)', lg: 'repeat(4, 1fr)' }, gap: 0.75 }}>
                        {loading ? (
                            <ShimmerCardGrid count={8} variant="contract" />
                        ) : (
                            filteredContracts.map((contract) => (
                                <ContractCard key={contract.id} contract={contract} onView={handleView} onDownload={handleDownload} onHistory={(id, event) => { setHistoryContractId(id); setHistoryAnchorEl(event.currentTarget); }} />
                            ))
                        )}
                    </Box>
                )}
                </Box>
            </Box>

            {selectedContract && (
                <DocumentViewerDialog
                    open={viewerOpen}
                    onClose={() => { setViewerOpen(false); setSelectedContract(null); }}
                    fileUrl={(() => { if (selectedContract.fileUrl) return selectedContract.fileUrl; if (selectedContract.fileData) return `data:application/pdf;base64,${selectedContract.fileData}`; if (selectedContract.signedPdfBase64) return `data:application/pdf;base64,${selectedContract.signedPdfBase64}`; if (selectedContract.templateId) return `/api/file/${selectedContract.templateId}?type=template`; return ''; })()}
                    fileName={`${selectedContract.title}.pdf`}
                    title={selectedContract.title}
                    content={selectedContract.signedPdfBase64 ? undefined : selectedContract.content}
                    templateDocxBase64={selectedContract.templateDocxBase64}
                    fieldValues={selectedContract.fieldValues}
                    initialXfdf={selectedContract.xfdfData}
                    contractId={selectedContract.id}
                    readOnly={isInternalSignerCompleted}
                    onSave={isInternalSignerCompleted ? undefined : handleSaveSignature}
                    clientSigningMode={!isInternalSignerCompleted}
                    currentUserRole="client"
                    formFields={selectedContract.formFields}
                    editableFieldMode={isInternalSignerCompleted ? 'none' : 'empty-only'}
                    parties={selectedContract.parties}
                    showAnnotationNavigation={!isInternalSignerCompleted}
                    assignedPartyId={currentUserInternalSigner?.partyId}
                    assignedPartyLabel={currentUserInternalSigner?.partyLabel || assignedPartyConfig?.label}
                    assignedPartyColor={assignedPartyConfig?.color}
                />
            )}

            <ContractHistoryPanel open={Boolean(historyAnchorEl)} anchorEl={historyAnchorEl} onClose={() => setHistoryAnchorEl(null)} contractId={historyContractId || ''} currentContractId={historyContractId || ''} onSelectEntry={(entry) => setHistoryDialogEntry(entry)} />
            <ContractHistoryDialog open={!!historyDialogEntry} onClose={() => setHistoryDialogEntry(null)} entry={historyDialogEntry} currentContractId={historyContractId || ''} />
            <SignaturePadDialog open={signaturePadOpen} onClose={() => setSignaturePadOpen(false)} onSign={handleSign} />
            <NotificationSnackbar open={snackbar.open} message={snackbar.message} severity={snackbar.severity} onClose={() => setSnackbar({ ...snackbar, open: false })} />
        </>
    );
}