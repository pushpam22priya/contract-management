'use client';

import { Box, Typography } from '@mui/material';
import FolderIcon from '@mui/icons-material/Folder';
import ContractCard from '@/components/contracts/ContractCard';
import { useEffect, useState, useCallback } from 'react';
import dayjs, { Dayjs } from 'dayjs';
import { contractService } from '@/services/contractService';
import { Contract, ContractStatus } from '@/types/contract';
import DocumentViewerDialog from '@/components/viewer/DocumentViewerDialog';
import RequestReviewDialog from '@/components/contracts/RequestReviewDialog';
import { authService } from '@/services/authService';
import NotificationSnackbar from '@/components/common/NotificationSnackbar';
import { AlertColor } from '@mui/material';
import { templateService } from '@/services/templateService';
import { categoryService } from '@/services/categoryService';
import ReusableFilter, { FilterOption } from '@/components/common/ReusableFilter';
import { apiService } from '@/services/apiService';
import { ShimmerCardGrid } from '@/components/common/ShimmerCard';
import { Team } from '@/types/team';

const statusOptions: FilterOption[] = [
    { label: 'All Status', value: 'all' },
    { label: 'Draft', value: ContractStatus.DRAFT },
    { label: 'Under Review', value: ContractStatus.IN_REVIEW },
    { label: 'Under Approval', value: ContractStatus.IN_APPROVAL },
    { label: 'Review and Approve', value: ContractStatus.REVIEW_APPROVAL },
    { label: 'Reviewed', value: ContractStatus.REVIEWED },
    { label: 'Rejected by Reviewer', value: ContractStatus.REJECTED_BY_REVIEWER },
    { label: 'Rejected by Approver', value: ContractStatus.REJECTED_BY_APPROVER },
];

export default function DraftTab({ headerLeft }: { headerLeft?: React.ReactNode }) {
    const [teams, setTeams] = useState<Team[]>([]);
    const [draftContracts, setDraftContracts] = useState<Contract[]>([]);
    const [loading, setLoading] = useState(true);

    const [viewerOpen, setViewerOpen] = useState(false);
    const [selectedContract, setSelectedContract] = useState<Contract | null>(null);
    const [viewerData, setViewerData] = useState<{ fileUrl: string; initialXfdf?: string; formFields?: any[] } | null>(null);

    const [reviewDialogOpen, setReviewDialogOpen] = useState(false);
    const [contractForReview, setContractForReview] = useState<Contract | null>(null);

    const [snackbar, setSnackbar] = useState({ open: false, message: '', severity: 'success' as AlertColor });

    const [categoryOptions, setCategoryOptions] = useState<FilterOption[]>([{ label: 'All Categories', value: 'all' }]);
    const [categoryFilter, setCategoryFilter] = useState<FilterOption[]>([{ label: 'All Categories', value: 'all' }]);
    const [searchQuery, setSearchQuery] = useState('');
    const [statusFilter, setStatusFilter] = useState<FilterOption[]>([{ label: 'All Status', value: 'all' }]);
    const [teamFilter, setTeamFilter] = useState<FilterOption[]>([{ label: 'All Teams', value: 'all' }]);
    const [startDate, setStartDate] = useState<Dayjs | null>(null);
    const [endDate, setEndDate] = useState<Dayjs | null>(null);
    const [showAdvancedFilters, setShowAdvancedFilters] = useState(false);

    const showNotification = (message: string, severity: AlertColor = 'success') => {
        setSnackbar({ open: true, message, severity });
    };

    const loadCategories = () => {
        const categories = categoryService.getAllCategories();
        setCategoryOptions([{ label: 'All Categories', value: 'all' }, ...categories.map(cat => ({ label: cat.name, value: cat.name }))]);
    };

    const loadTeams = useCallback(async () => {
        const currentUser = authService.getCurrentUser();
        if (!currentUser) return;
        try {
            const res = await fetch(`/api/teams?createdBy=${encodeURIComponent(currentUser.email)}`);
            if (res.ok) setTeams(await res.json());
        } catch { /* silently fail */ }
    }, []);

    const loadDrafts = async () => {
        setLoading(true);
        const currentUser = authService.getCurrentUser();
        if (!currentUser) { setDraftContracts([]); setLoading(false); return; }
        const userContracts = await contractService.getContractsCreatedByUser(currentUser.email);
        const drafts = userContracts.filter(c =>
            c.status === ContractStatus.DRAFT ||
            c.status === ContractStatus.IN_REVIEW ||
            c.status === ContractStatus.IN_APPROVAL ||
            c.status === ContractStatus.REVIEW_APPROVAL ||
            c.status === ContractStatus.REVIEWED ||
            c.status === ContractStatus.REJECTED_BY_REVIEWER ||
            c.status === ContractStatus.REJECTED_BY_APPROVER
        );
        setDraftContracts(drafts);
        setLoading(false);
    };

    useEffect(() => {
        loadDrafts();
        loadTeams();
        loadCategories();
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    const handleView = async (id: string) => {
        const contract = draftContracts.find(c => c.id === id);
        if (!contract) return;
        setSelectedContract(contract);
        let fileUrl = '', initialXfdf: string | undefined, formFields: any[] | undefined;
        if (contract.fileUrl) {
            fileUrl = contract.fileUrl; initialXfdf = contract.xfdfData; formFields = contract.formFields;
        } else if (contract.fileData) {
            fileUrl = `data:application/pdf;base64,${contract.fileData}`; initialXfdf = contract.xfdfData; formFields = contract.formFields;
        } else if (contract.signedPdfBase64) {
            fileUrl = `data:application/pdf;base64,${contract.signedPdfBase64}`; initialXfdf = contract.xfdfData; formFields = contract.formFields;
        } else if (contract.templateId) {
            try {
                const template = await templateService.getTemplateById(contract.templateId);
                if (template) { fileUrl = template.fileData || template.fileUrl || ''; initialXfdf = contract.xfdfData || template.xfdfData; formFields = contract.formFields || template.formFields; }
            } catch { showNotification('Failed to load document template', 'error'); }
        }
        setViewerData({ fileUrl, initialXfdf, formFields });
        setViewerOpen(true);
    };

    const handleShare = (id: string) => {
        const contract = draftContracts.find(c => c.id === id);
        if (!contract) return;
        setContractForReview(contract);
        setReviewDialogOpen(true);
    };

    const handleSubmitForReview = async (newReviewers: string[], approver: string, reviewerMessage?: string, approverMessage?: string) => {
        if (!contractForReview) return;
        const currentUser = authService.getCurrentUser();
        const result = await contractService.submitForReview(contractForReview.id, newReviewers, approver, reviewerMessage, approverMessage, currentUser?.email);
        if (result.success) { showNotification(result.message, 'success'); loadDrafts(); }
        else { showNotification('Failed to submit: ' + result.message, 'error'); throw new Error(result.message); }
    };

    const handleSaveChanges = async (pdfBlob: Blob, xfdfString: string, fieldValues?: Record<string, string>, formFields?: any[]) => {
        if (!selectedContract) return;
        try {
            const arrayBuffer = await pdfBlob.arrayBuffer();
            const bytes = new Uint8Array(arrayBuffer);
            const header = String.fromCharCode(...bytes.slice(0, 5));
            if (!header.startsWith('%PDF-')) { showNotification('Failed to save: Invalid PDF data', 'error'); return; }
            let binary = '';
            for (let i = 0; i < bytes.byteLength; i++) binary += String.fromCharCode(bytes[i]);
            const pdfBase64 = btoa(binary);
            const result = await contractService.updateContractSignedPdf(selectedContract.id, pdfBase64, xfdfString);
            if (result.success) {
                const metadataUpdates: Record<string, any> = {};
                if (fieldValues && Object.keys(fieldValues).length > 0) metadataUpdates.fieldValues = { ...(selectedContract.fieldValues || {}), ...fieldValues };
                if (formFields && formFields.length > 0) { metadataUpdates.formFields = formFields; metadataUpdates.hasFormFields = formFields.length > 0; }
                if (Object.keys(metadataUpdates).length > 0) await apiService.updateContractMetadata(selectedContract.id, metadataUpdates);
                showNotification('Changes saved successfully!', 'success');
            } else { showNotification('Failed to save changes: ' + result.message, 'error'); throw new Error(result.message); }
        } catch (error) { console.error('❌ Error saving PDF:', error); showNotification('Failed to save changes', 'error'); }
    };

    // Derived data
    const teamNameById: Record<string, string> = Object.fromEntries(teams.map(t => [t._id, t.name]));
    const teamFilterOptions: FilterOption[] = [{ label: 'All Teams', value: 'all' }, ...teams.map(t => ({ label: t.name, value: t._id }))];

    const filteredDrafts = draftContracts.filter(contract => {
        const matchesStatus = statusFilter.some(f => f.value === 'all') || statusFilter.some(f => contract.status === f.value);
        const matchesSearch = searchQuery === '' || contract.title.toLowerCase().includes(searchQuery.toLowerCase()) || contract.client?.toLowerCase().includes(searchQuery.toLowerCase());
        const matchesCategory = categoryFilter.some(f => f.value === 'all') || categoryFilter.some(f => contract.category === f.value);
        const matchesTeam = teamFilter.some(f => f.value === 'all') || teamFilter.some(f => contract.teamId === f.value);
        let matchesDate = true;
        if (startDate || endDate) {
            const d = dayjs(contract.createdAt);
            if (startDate && d.isBefore(startDate, 'day')) matchesDate = false;
            if (endDate && d.isAfter(endDate, 'day')) matchesDate = false;
        }
        return matchesStatus && matchesSearch && matchesCategory && matchesTeam && matchesDate;
    });

    return (
        <>
            <Box sx={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
                {/* Header */}
                <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: { xs: 'flex-start', md: 'center' }, flexDirection: { xs: 'column', md: 'row' }, gap: { xs: 3, md: 2 }, mb: 1 }}>
                    {headerLeft || (
                        <Box>
                            <Typography fontWeight={600} sx={{ color: 'primary.main', fontSize: { xs: '1.75rem', sm: '2rem', md: '20px' } }}>
                                Draft Contracts
                            </Typography>
                            <Typography variant="body2" sx={{ color: 'text.secondary' }}>
                                Review and manage your draft contracts
                            </Typography>
                        </Box>
                    )}
                </Box>

                {/* Filter */}
                <ReusableFilter
                    searchQuery={searchQuery}
                    onSearchChange={setSearchQuery}
                    searchPlaceholder="Search drafts or clients"
                    filters={[
                        { label: 'Status', value: statusFilter, onChange: (v) => setStatusFilter(v || []), options: statusOptions, multiple: true },
                        { label: 'Category', value: categoryFilter, onChange: (v) => setCategoryFilter(v || [{ label: 'All Categories', value: 'all' }]), options: categoryOptions, multiple: true },
                        { label: 'Team', value: teamFilter, onChange: (v) => setTeamFilter(v || [{ label: 'All Teams', value: 'all' }]), options: teamFilterOptions, multiple: true },
                    ]}
                    enableDateFilter={true}
                    startDate={startDate}
                    onStartDateChange={setStartDate}
                    endDate={endDate}
                    onEndDateChange={setEndDate}
                    showAdvancedFilters={showAdvancedFilters}
                    onAdvancedFiltersToggle={() => setShowAdvancedFilters(!showAdvancedFilters)}
                    dateFilterTitle="Filter by Draft Date Range"
                    filteredCount={filteredDrafts.length}
                    totalCount={draftContracts.length}
                    countLabel="drafts"
                    hasActiveFilters={searchQuery !== '' || statusFilter.every(f => f.value !== 'all') || categoryFilter.every(f => f.value !== 'all') || teamFilter.every(f => f.value !== 'all') || startDate !== null || endDate !== null}
                    onClearFilters={() => { setSearchQuery(''); setStatusFilter([{ label: 'All Status', value: 'all' }]); setCategoryFilter([{ label: 'All Categories', value: 'all' }]); setTeamFilter([{ label: 'All Teams', value: 'all' }]); setStartDate(null); setEndDate(null); setShowAdvancedFilters(false); }}
                />

                {/* Grid */}
                <Box sx={{ flex: 1, overflowY: 'auto', minHeight: 0, pb: 2 }}>
                    <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: 'repeat(2, 1fr)', lg: 'repeat(4, 1fr)' }, gap: 0.75 }}>
                    {loading ? (
                        <ShimmerCardGrid count={8} variant="contract" />
                    ) : filteredDrafts.length === 0 ? (
                        <Box sx={{ gridColumn: '1 / -1', textAlign: 'center', py: 8 }}>
                            <FolderIcon sx={{ fontSize: 48, color: 'text.disabled', mb: 1 }} />
                            <Typography color="text.secondary">No draft contracts found.</Typography>
                        </Box>
                    ) : (
                        filteredDrafts.map((contract) => (
                            <ContractCard variant="draft" key={contract.id} contract={contract} onView={handleView} onShare={handleShare} teamName={contract.teamId ? teamNameById[contract.teamId] : undefined} />
                        ))
                    )}
                    </Box>
                </Box>
            </Box>

            {selectedContract && viewerData && (
                <DocumentViewerDialog
                    open={viewerOpen}
                    onClose={() => { setViewerOpen(false); setSelectedContract(null); setViewerData(null); loadDrafts(); }}
                    fileUrl={viewerData.fileUrl}
                    fileName={`${selectedContract.title.replace(/\s*\(Renewal\d*\)$/i, '')}.pdf`}
                    title={selectedContract.title.replace(/\s*\(Renewal\d*\)$/i, '')}
                    content={selectedContract.content}
                    templateDocxBase64={selectedContract.templateDocxBase64}
                    fieldValues={selectedContract.fieldValues}
                    signatureImage={selectedContract.signer?.signatureImage}
                    contractId={selectedContract.id}
                    onSave={handleSaveChanges}
                    currentUserRole="contractor"
                    initialXfdf={viewerData.initialXfdf}
                    formFields={viewerData.formFields}
                    canAddFormFields={false}
                    editableFieldMode="all"
                    showAnnotationNavigation={true}
                    parties={selectedContract.parties}
                    externalSigners={selectedContract.externalSigners}
                    internalSigners={selectedContract.internalSigners}
                />
            )}

            {contractForReview && (
                <RequestReviewDialog
                    open={reviewDialogOpen}
                    onClose={() => { setReviewDialogOpen(false); setContractForReview(null); }}
                    contractId={contractForReview.id}
                    contractTitle={contractForReview.title}
                    onSubmit={handleSubmitForReview}
                />
            )}

            <NotificationSnackbar open={snackbar.open} message={snackbar.message} severity={snackbar.severity} onClose={() => setSnackbar({ ...snackbar, open: false })} />
        </>
    );
}