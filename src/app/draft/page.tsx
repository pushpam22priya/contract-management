'use client';
import { Box, Typography } from '@mui/material';
import AppLayout from '@/components/layout/AppLayout';
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
import { useRouter, useSearchParams } from 'next/navigation';
import { templateService } from '@/services/templateService';
import { categoryService } from '@/services/categoryService';
// import ReusableFilter, { FilterOption } from '@/components/common/ReusableFilter';
import CompactFilter, { FilterOption } from '@/components/common/CompactFilter';
import { apiService } from '@/services/apiService';
import { ShimmerCardGrid } from '@/components/common/ShimmerCard';
import { Team } from '@/types/team';
import { useTranslations } from 'next-intl';

export default function DraftPage() {
    const t = useTranslations('draft');
    const router = useRouter();
    const searchParams = useSearchParams();

    const statusFromUrl = searchParams.get('status');
    // isFlatView: came here from dashboard with a specific status (for back button)
    const isFlatView = statusFromUrl !== null;

    // Teams — loaded only for team name lookup on contract cards
    const [teams, setTeams] = useState<Team[]>([]);

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

    const [categoryOptions, setCategoryOptions] = useState<FilterOption[]>([
        { label: 'All Categories', value: 'all' }
    ]);
    const [categoryFilter, setCategoryFilter] = useState<FilterOption[]>([{ label: 'All Categories', value: 'all' }]);

    const loadCategories = () => {
        const categories = categoryService.getAllCategories();
        const options = [
            { label: 'All Categories', value: 'all' },
            ...categories.map(cat => ({ label: cat.name, value: cat.name }))
        ];
        setCategoryOptions(options);
    };

    const loadTeams = useCallback(async () => {
        const currentUser = authService.getCurrentUser();
        if (!currentUser) return;
        try {
            const res = await fetch(`/api/teams?createdBy=${encodeURIComponent(currentUser.email)}`);
            if (res.ok) setTeams(await res.json());
        } catch { /* silently fail */ }
    }, []);

    useEffect(() => {
        loadDrafts();
        loadTeams();
        loadCategories();
    }, []);

    const showNotification = (message: string, severity: AlertColor = 'success') => {
        setSnackbar({ open: true, message, severity });
    };

    const [viewerData, setViewerData] = useState<{
        fileUrl: string;
        initialXfdf?: string;
        formFields?: any[];
    } | null>(null);

    const handleView = async (id: string) => {
        const contract = draftContracts.find(c => c.id === id);
        if (!contract) return;

        setSelectedContract(contract);

        let fileUrl = "";
        let initialXfdf: string | undefined = undefined;
        let formFields: any[] | undefined = undefined;

        if (contract.fileUrl) {
            console.log('📄 [DraftPage] Using contract.fileUrl (fetching latest from API)');
            console.log('📄 [DraftPage] File URL:', contract.fileUrl);
            console.log('📄 [DraftPage] XFDF length:', contract.xfdfData?.length || 0);
            console.log('📄 [DraftPage] FormFields count:', contract.formFields?.length || 0);
            fileUrl = contract.fileUrl;
            initialXfdf = contract.xfdfData;
            formFields = contract.formFields;
        } else if (contract.fileData) {
            console.log('📄 [DraftPage] Using contract.fileData (base64)');
            fileUrl = `data:application/pdf;base64,${contract.fileData}`;
            // ✅ CRITICAL FIX: Always load XFDF/FormFields to ensure signatures/inputs are restored
            initialXfdf = contract.xfdfData;
            formFields = contract.formFields;
        } else if (contract.signedPdfBase64) {
            console.log('📄 [DraftPage] Using signedPdfBase64 (baked signatures)');
            fileUrl = `data:application/pdf;base64,${contract.signedPdfBase64}`;
            initialXfdf = contract.xfdfData;
            formFields = contract.formFields;
        } else if (contract.templateId) {
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

        setViewerData({ fileUrl, initialXfdf, formFields });
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

    const handleApprove = async (id: string) => {
        const currentUser = authService.getCurrentUser();
        if (!currentUser) return;

        const result = await contractService.approveContract(id, currentUser.email);
        if (result.success) {
            showNotification('Contract approved! Moved to Contracts page', 'success');
            loadDrafts();
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
            loadDrafts();
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

    const handleSubmitForReview = async (
        newReviewers: string[],
        approver: string,
        reviewerMessage?: string,
        approverMessage?: string
    ) => {
        if (!contractForReview) return;

        const currentUser = authService.getCurrentUser();

        const result = await contractService.submitForReview(
            contractForReview.id,
            newReviewers,
            approver,
            reviewerMessage,
            approverMessage,
            currentUser?.email
        );

        if (result.success) {
            showNotification(result.message, 'success');
            loadDrafts();
        } else {
            showNotification('Failed to submit: ' + result.message, 'error');
            throw new Error(result.message);
        }
    };

    const handleSaveChanges = async (pdfBlob: Blob, xfdfString: string, fieldValues?: Record<string, string>, formFields?: any[], isAutoSave?: boolean) => {
        if (!selectedContract) return;

        console.log('═══════════════════════════════════════════════════════════════════');
        console.log('💾 [DraftPage] Saving contract changes:', selectedContract.id);
        console.log('✅ [DraftPage] All pending changes were committed before this callback');
        console.log('═══════════════════════════════════════════════════════════════════');
        console.log(`📄 PDF Blob size: ${pdfBlob.size} bytes`);
        console.log(`📋 XFDF string length: ${xfdfString?.length || 0} chars`);
        console.log(`📋 XFDF preview: ${xfdfString?.substring(0, 500)}...`);
        console.log(`📝 Field values count: ${fieldValues ? Object.keys(fieldValues).length : 0}`);
        console.log(`📋 Form fields count: ${formFields?.length || 0}`);
        console.log(`📋 Previous XFDF length: ${selectedContract.xfdfData?.length || 0} chars`);

        try {
            console.log('📄 [DraftPage] Converting PDF Blob to base64...');
            const arrayBuffer = await pdfBlob.arrayBuffer();
            const bytes = new Uint8Array(arrayBuffer);

            const header = String.fromCharCode(...bytes.slice(0, 5));
            if (!header.startsWith('%PDF-')) {
                console.error('❌ Invalid PDF: does not start with %PDF-');
                showNotification('Failed to save: Invalid PDF data', 'error');
                return;
            }

            let binary = '';
            for (let i = 0; i < bytes.byteLength; i++) {
                binary += String.fromCharCode(bytes[i]);
            }
            const pdfBase64 = btoa(binary);

            const result = await contractService.updateContractSignedPdf(selectedContract.id, pdfBase64, xfdfString);

            if (result.success) {
                const metadataUpdates: Record<string, any> = {};

                if (fieldValues && Object.keys(fieldValues).length > 0) {
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
                    await apiService.updateContractMetadata(selectedContract.id, metadataUpdates);
                    console.log('✅ [DraftPage] Field metadata updated successfully');
                }

                showNotification('Changes saved successfully!', 'success');
                console.log('💾 [DraftPage] Save completed - dialog stays open for continued editing');
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

    const [searchQuery, setSearchQuery] = useState('');
    const [statusFilter, setStatusFilter] = useState<FilterOption[]>([{ label: 'All Status', value: 'all' }]);
    const [teamFilter, setTeamFilter] = useState<FilterOption[]>([{ label: 'All Teams', value: 'all' }]);
    const [startDate, setStartDate] = useState<Dayjs | null>(null);
    const [endDate, setEndDate] = useState<Dayjs | null>(null);
    const [showAdvancedFilters, setShowAdvancedFilters] = useState(false);

    // URL params for deep linking (e.g. from Dashboard Recent Contracts)
    // Supports comma-separated status values, e.g. ?status=draft,in_review
    useEffect(() => {
        const statusParam = searchParams.get('status');
        const searchParam = searchParams.get('search');
        if (statusParam) {
            const statusValues = statusParam.split(',');
            const matched = statusOptions.filter(opt => statusValues.includes(opt.value));
            setStatusFilter(matched.length > 0 ? matched : [statusOptions[0]]);
        } else {
            setStatusFilter([statusOptions[0]]);
        }
        if (searchParam) setSearchQuery(searchParam);
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [searchParams]);

    // ─── Derived data ─────────────────────────────────────────────────────────

    // Team name lookup map (for contract card display)
    const teamNameById: Record<string, string> = Object.fromEntries(
        teams.map(t => [t._id, t.name])
    );

    // Flat view title from URL param (for breadcrumb when coming from dashboard)
    const draftStatusLabelMap: Record<string, string> = {
        [ContractStatus.DRAFT]: 'Draft Contracts',
        [ContractStatus.IN_REVIEW]: 'Under Review',
        [ContractStatus.IN_APPROVAL]: 'Under Approval',
        [ContractStatus.REVIEWED]: 'Reviewed',
        [ContractStatus.REJECTED_BY_REVIEWER]: 'Rejected by Reviewer',
        [ContractStatus.REJECTED_BY_APPROVER]: 'Rejected by Approver',
    };
    const titleParam = searchParams.get('title');
    const pageTitle = titleParam || (statusFromUrl && statusFromUrl !== 'all'
        ? (draftStatusLabelMap[statusFromUrl] ?? 'Draft Contracts')
        : 'Draft Contracts');

    // All teams created by the user (for team filter dropdown)
    const teamFilterOptions: FilterOption[] = [
        { label: 'All Teams', value: 'all' },
        ...teams.map(t => ({ label: t.name, value: t._id })),
    ];

    const filteredDrafts = draftContracts.filter(contract => {
        const matchesStatus = statusFilter.length === 0 ||
            statusFilter.some(f => f.value === 'all') ||
            statusFilter.some(f => contract.status === f.value);

        const matchesSearch = searchQuery === '' ||
            contract.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
            contract.client?.toLowerCase().includes(searchQuery.toLowerCase());

        const matchesCategory = categoryFilter.length === 0 ||
            categoryFilter.some(f => f.value === 'all') ||
            categoryFilter.some(f => contract.category === f.value);

        const matchesTeam = teamFilter.length === 0 ||
            teamFilter.some(f => f.value === 'all') ||
            teamFilter.some(f => contract.teamId === f.value);

        let matchesDate = true;
        if (startDate || endDate) {
            const contractDate = dayjs(contract.createdAt);
            if (startDate && contractDate.isBefore(startDate, 'day')) matchesDate = false;
            if (endDate && contractDate.isAfter(endDate, 'day')) matchesDate = false;
        }

        return matchesStatus && matchesSearch && matchesCategory && matchesTeam && matchesDate;
    });

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
                        <Typography variant="h5">
                            {pageTitle}
                        </Typography>
                        <Box sx={{ width: 5, height: 5, borderRadius: '50%', bgcolor: 'text.disabled', flexShrink: 0 }} />
                        <Typography sx={{ color: 'text.secondary', fontSize: '0.78rem' }}>
                            {t('description')}
                        </Typography>
                    </Box>
                </Box>

                {/* Filter Section */}
                {/* <ReusableFilter */}
                <CompactFilter
                    searchQuery={searchQuery}
                    onSearchChange={setSearchQuery}
                    searchPlaceholder="Search drafts or clients"
                    filters={[
                        {
                            label: 'Status',
                            value: statusFilter,
                            onChange: (newValue) => setStatusFilter(newValue || []),
                            options: statusOptions,
                            multiple: true,
                            disabled: isFlatView && !!statusFromUrl && statusFromUrl !== 'all' && !statusFromUrl.includes(','),
                        },
                        {
                            label: 'Category',
                            value: categoryFilter,
                            onChange: (newValue) => setCategoryFilter(newValue || [{ label: 'All Categories', value: 'all' }]),
                            options: categoryOptions,
                            multiple: true,
                        },
                        {
                            label: 'Team',
                            value: teamFilter,
                            onChange: (newValue) => setTeamFilter(newValue || [{ label: 'All Teams', value: 'all' }]),
                            options: teamFilterOptions,
                            multiple: true,
                        },
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
                    hasActiveFilters={
                        searchQuery !== '' ||
                        (!(isFlatView && statusFromUrl && !statusFromUrl.includes(',')) && statusFilter.every(f => f.value !== 'all')) ||
                        categoryFilter.every(f => f.value !== 'all') ||
                        teamFilter.every(f => f.value !== 'all') ||
                        startDate !== null ||
                        endDate !== null
                    }
                    onClearFilters={() => {
                        setSearchQuery('');
                        if (isFlatView && statusFromUrl) {
                            const statusValues = statusFromUrl.split(',');
                            setStatusFilter(statusOptions.filter(opt => statusValues.includes(opt.value)));
                        } else {
                            setStatusFilter([{ label: 'All Status', value: 'all' }]);
                        }
                        setCategoryFilter([{ label: 'All Categories', value: 'all' }]);
                        setTeamFilter([{ label: 'All Teams', value: 'all' }]);
                        setStartDate(null);
                        setEndDate(null);
                        setShowAdvancedFilters(false);
                    }}
                />

                {/* Grid */}
                <Box sx={{ flex: 1, overflowY: 'auto', minHeight: 0, p: 1 }}>
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
                    ) : filteredDrafts.length === 0 ? (
                        <Box sx={{ gridColumn: '1 / -1', textAlign: 'center', py: 8 }}>
                            <FolderIcon sx={{ fontSize: 48, color: 'text.disabled', mb: 1 }} />
                            <Typography color="text.secondary">No draft contracts found.</Typography>
                        </Box>
                    ) : (
                        filteredDrafts.map((contract) => (
                            <ContractCard
                                variant="draft"
                                key={contract.id}
                                contract={contract}
                                onView={handleView}
                                onShare={handleShare}
                                teamName={contract.teamId ? teamNameById[contract.teamId] : undefined}
                            />
                        ))
                    )}
                </Box>
                </Box>
            </Box>

            {/* ← VIEWER DIALOG */}
            {selectedContract && viewerData && (
                <DocumentViewerDialog
                    open={viewerOpen}
                    onClose={() => {
                        setViewerOpen(false);
                        setSelectedContract(null);
                        setViewerData(null);
                        loadDrafts();
                    }}
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
