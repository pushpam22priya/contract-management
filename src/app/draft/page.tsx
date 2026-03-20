'use client';

import { Box, Typography, Tooltip, IconButton, Button, Chip } from '@mui/material';
import AppLayout from '@/components/layout/AppLayout';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
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
import ReusableFilter, { FilterOption } from '@/components/common/ReusableFilter';
import { apiService } from '@/services/apiService';
import { ShimmerCardGrid } from '@/components/common/ShimmerCard';
import TeamCard from '@/components/teams/TeamCard';
import RenameTeamDialog from '@/components/teams/RenameTeamDialog';
import { Team } from '@/types/team';

// Draft-page relevant statuses
const DRAFT_PAGE_STATUSES = [
    ContractStatus.DRAFT,
    ContractStatus.IN_REVIEW,
    ContractStatus.IN_APPROVAL,
    ContractStatus.REVIEW_APPROVAL,
    ContractStatus.REVIEWED,
    ContractStatus.REJECTED_BY_REVIEWER,
    ContractStatus.REJECTED_BY_APPROVER,
];

export default function DraftPage() {
    const router = useRouter();
    const searchParams = useSearchParams();

    // Team navigation state
    const activeTeamId = searchParams.get('team');
    const [teams, setTeams] = useState<Team[]>([]);
    const [teamsLoading, setTeamsLoading] = useState(true);
    const [renameTeamOpen, setRenameTeamOpen] = useState(false);
    const [teamToRename, setTeamToRename] = useState<Team | null>(null);

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
        if (!currentUser) { setTeamsLoading(false); return; }
        setTeamsLoading(true);
        try {
            const res = await fetch(`/api/teams?createdBy=${encodeURIComponent(currentUser.email)}`);
            if (res.ok) setTeams(await res.json());
        } catch { /* silently fail */ }
        finally { setTeamsLoading(false); }
    }, []);

    // Load draft contracts
    useEffect(() => {
        loadDrafts();
        loadTeams();
        loadCategories();
    }, []);

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

        // ✅ PRIORITY 1: Use fileUrl (from API) - always fetches the latest saved PDF
        // This ensures we get the most recent version after each save
        if (contract.fileUrl) {
            console.log('📄 [DraftPage] Using contract.fileUrl (fetching latest from API)');
            console.log('📄 [DraftPage] File URL:', contract.fileUrl);
            console.log('📄 [DraftPage] XFDF length:', contract.xfdfData?.length || 0);
            console.log('📄 [DraftPage] FormFields count:', contract.formFields?.length || 0);
            fileUrl = contract.fileUrl;
            // ✅ Load the contract's XFDF and formFields (NOT template's!)
            initialXfdf = contract.xfdfData;
            formFields = contract.formFields;
        }
        // Priority 2: Use fileData if fileUrl not available (legacy/fallback)
        else if (contract.fileData) {
            console.log('📄 [DraftPage] Using contract.fileData (base64)');
            console.log('📄 [DraftPage] XFDF length:', contract.xfdfData?.length || 0);
            console.log('📄 [DraftPage] FormFields count:', contract.formFields?.length || 0);
            console.log('📄 [DraftPage] Contract ID:', contract.id);
            fileUrl = `data:application/pdf;base64,${contract.fileData}`;
            // ✅ CRITICAL FIX: Always load XFDF/FormFields to ensure signatures/inputs are restored
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

        // Show Drafts, In Review, In Approval, and Rejected contracts
        const drafts = userContracts.filter(c =>
            c.status === ContractStatus.DRAFT ||
            c.status === ContractStatus.IN_REVIEW ||
            c.status === ContractStatus.IN_APPROVAL ||
            c.status === ContractStatus.REVIEW_APPROVAL || // backward compat
            c.status === ContractStatus.REVIEWED ||        // backward compat
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
     * Note: The service handles preserving existing reviewers and approver
     */
    const handleSubmitForReview = async (
        newReviewers: string[],
        approver: string,
        reviewerMessage?: string,
        approverMessage?: string
    ) => {
        if (!contractForReview) return;

        const currentUser = authService.getCurrentUser();

        // Pass only NEW reviewers - service will preserve existing ones
        const result = await contractService.submitForReview(
            contractForReview.id,
            newReviewers,
            approver,
            reviewerMessage,
            approverMessage,
            currentUser?.email // Pass sender email
        );

        if (result.success) {
            showNotification(result.message, 'success');
            loadDrafts(); // Reload drafts
        } else {
            showNotification('Failed to submit: ' + result.message, 'error');
            throw new Error(result.message);
        }
    };

    /**
     * Save contract changes from PDF viewer
     * Now accepts pdfBlob, xfdfString, fieldValues, formFields, and isAutoSave flag
     *
     * ✅ IMPORTANT: All pending changes are ALREADY COMMITTED before this function is called
     * The commit process happens in PDFViewerContainer.exportAnnotations() which includes:
     * - Deselecting active annotations
     * - Switching tools to finalize edits
     * - Calling field.commit() on all form fields
     * - Refreshing the document viewer
     * - Redrawing all annotations
     *
     * @param isAutoSave - If true, don't close the dialog (background save)
     */
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
                    await apiService.updateContractMetadata(selectedContract.id, metadataUpdates);
                    console.log('✅ [DraftPage] Field metadata updated successfully');
                }

                // ✅ Show notification on save (don't close - DocumentViewerDialog handles closing)
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
    const statusOptions = [
        { label: 'All Status', value: 'all' },
        { label: 'Draft', value: ContractStatus.DRAFT },
        { label: 'Under Review', value: ContractStatus.IN_REVIEW },
        { label: 'Under Approval', value: ContractStatus.IN_APPROVAL },
        { label: 'Review and Approve', value: ContractStatus.REVIEW_APPROVAL },
        { label: 'Rejected by Reviewer', value: ContractStatus.REJECTED_BY_REVIEWER },
        { label: 'Rejected by Approver', value: ContractStatus.REJECTED_BY_APPROVER },
    ];

    const [searchQuery, setSearchQuery] = useState('');
    const [statusFilter, setStatusFilter] = useState(statusOptions[0]);
    const [teamFilterValue, setTeamFilterValue] = useState<FilterOption>({ label: 'All Teams', value: 'all' });
    const [startDate, setStartDate] = useState<Dayjs | null>(null);
    const [endDate, setEndDate] = useState<Dayjs | null>(null);
    const [showAdvancedFilters, setShowAdvancedFilters] = useState(false);

    // URL params for deep linking (e.g. from Dashboard)
    // Sync URL param → status filter dropdown on initial navigation
    useEffect(() => {
        const statusParam = searchParams.get('status');
        if (!statusParam) return;
        const matched = statusOptions.find(opt => opt.value === statusParam);
        if (matched) setStatusFilter(matched);
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    // Reset search + team filter when switching between root and team view
    useEffect(() => {
        setSearchQuery('');
        setTeamFilterValue({ label: 'All Teams', value: 'all' });
    }, [activeTeamId]);

    // ─── Derived data ─────────────────────────────────────────────────────────
    const activeTeam = teams.find(t => t._id === activeTeamId) ?? null;

    // Teams that have at least one draft-status contract
    const teamsWithDrafts = teams.filter(t =>
        draftContracts.some(c => c.teamId === t._id)
    );

    // Root-level: team filter options + filtered teams list
    const teamFilterOptions: FilterOption[] = [
        { label: 'All Teams', value: 'all' },
        ...teamsWithDrafts.map(t => ({ label: t.name, value: t._id })),
    ];
    const filteredTeamsWithDrafts = teamsWithDrafts.filter(t => {
        const matchesSearch = searchQuery === '' || t.name.toLowerCase().includes(searchQuery.toLowerCase());
        const matchesFilter = teamFilterValue.value === 'all' || t._id === teamFilterValue.value;
        let matchesDate = true;
        if (startDate || endDate) {
            const d = dayjs(t.createdAt);
            if (startDate && d.isBefore(startDate, 'day')) matchesDate = false;
            if (endDate && d.isAfter(endDate, 'day')) matchesDate = false;
        }
        return matchesSearch && matchesFilter && matchesDate;
    });

    // Contracts shown when inside a team
    const teamDraftContracts = activeTeamId
        ? draftContracts.filter(c => c.teamId === activeTeamId)
        : draftContracts;

    // Count draft contracts per team (for TeamCard badge)
    const draftCountByTeam = (teamId: string) =>
        draftContracts.filter(c => c.teamId === teamId).length;

    // Filter logic (applied only when inside a team)
    const filteredDrafts = teamDraftContracts.filter(contract => {
        // Local Status Filter (pre-populated from URL param on mount)
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

    // ─── Team handlers ─────────────────────────────────────────────────────────
    const handleTeamClick = (teamId: string) => router.push(`/draft?team=${teamId}`);

    const handleRenameTeam = (team: Team) => {
        setTeamToRename(team);
        setRenameTeamOpen(true);
    };

    const handleTeamRenamed = (updated: Team) => {
        setTeams(prev => prev.map(t => t._id === updated._id ? updated : t));
        showNotification(`Team renamed to "${updated.name}"`, 'success');
    };

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
                    {/* Title / breadcrumb */}
                    <Box sx={{ display: 'flex', alignItems: 'flex-start', gap: 1 }}>
                        {activeTeamId && (
                            <Tooltip title="Back to Teams" arrow>
                                <IconButton
                                    size="small"
                                    onClick={() => router.push('/draft')}
                                    sx={{
                                        mt: '2px',
                                        color: 'text.secondary',
                                        '&:hover': { color: 'primary.main', bgcolor: 'rgba(15,118,110,0.06)' },
                                    }}
                                >
                                    <ArrowBackIcon fontSize="small" />
                                </IconButton>
                            </Tooltip>
                        )}
                        <Box>
                            {/* Title — just the page/team name */}
                            <Typography
                                fontWeight={600}
                                sx={{
                                    color: 'primary.main',
                                    fontSize: { xs: '1.75rem', sm: '2rem', md: '20px' },
                                }}
                            >
                                {activeTeam
                                    ? activeTeam.name
                                    : (statusFilter.value === ContractStatus.IN_REVIEW ? 'Under Review Contracts'
                                        : statusFilter.value === ContractStatus.IN_APPROVAL ? 'Under Approval Contracts'
                                        : 'Draft Contracts')}
                            </Typography>

                            {/* Subtitle — breadcrumb when inside team, generic text at root */}
                            {activeTeamId ? (
                                <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, mt: 0.25 }}>
                                    <Typography
                                        variant="body2"
                                        sx={{ color: 'text.secondary', cursor: 'pointer', '&:hover': { color: 'primary.main' } }}
                                        onClick={() => router.push('/draft')}
                                    >
                                        Drafts
                                    </Typography>
                                    <Typography variant="body2" sx={{ color: 'text.disabled' }}>/</Typography>
                                    <FolderIcon sx={{ fontSize: 14, color: 'primary.main' }} />
                                    <Typography variant="body2" sx={{ color: 'text.secondary' }}>
                                        {activeTeam?.name}
                                    </Typography>
                                    <Chip
                                        label={`${filteredDrafts.length} draft${filteredDrafts.length !== 1 ? 's' : ''}`}
                                        size="small"
                                        sx={{ height: 18, fontSize: '0.65rem', bgcolor: 'rgba(15,118,110,0.08)', color: 'primary.main' }}
                                    />
                                </Box>
                            ) : (
                                <Typography variant="body2" sx={{ color: 'text.secondary' }}>
                                    Review and manage your draft contracts
                                </Typography>
                            )}
                        </Box>
                    </Box>
                </Box>

                {/* Filter Section */}
                <ReusableFilter
                    searchQuery={searchQuery}
                    onSearchChange={setSearchQuery}
                    searchPlaceholder={activeTeamId ? 'Search drafts or clients' : 'Search teams'}
                    filters={activeTeamId ? [
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
                        },
                    ] : [
                        {
                            label: 'Team',
                            value: teamFilterValue,
                            onChange: (newValue) => setTeamFilterValue(newValue || { label: 'All Teams', value: 'all' }),
                            options: teamFilterOptions,
                        },
                    ]}
                    enableDateFilter={true}
                    startDate={startDate}
                    onStartDateChange={setStartDate}
                    endDate={endDate}
                    onEndDateChange={setEndDate}
                    showAdvancedFilters={showAdvancedFilters}
                    onAdvancedFiltersToggle={() => setShowAdvancedFilters(!showAdvancedFilters)}
                    dateFilterTitle={activeTeamId ? 'Filter by Draft Date Range' : 'Filter by Team Creation Date'}
                    filteredCount={activeTeamId ? filteredDrafts.length : filteredTeamsWithDrafts.length}
                    totalCount={activeTeamId ? teamDraftContracts.length : teamsWithDrafts.length}
                    countLabel={activeTeamId ? 'drafts' : 'teams'}
                    hasActiveFilters={activeTeamId
                        ? (searchQuery !== '' || statusFilter.value !== 'all' || categoryFilter.value !== 'all' || startDate !== null || endDate !== null)
                        : (searchQuery !== '' || teamFilterValue.value !== 'all' || startDate !== null || endDate !== null)
                    }
                    onClearFilters={() => {
                        setSearchQuery('');
                        setStatusFilter(statusOptions[0]);
                        setCategoryFilter({ label: 'All Categories', value: 'all' });
                        setTeamFilterValue({ label: 'All Teams', value: 'all' });
                        setStartDate(null);
                        setEndDate(null);
                        setShowAdvancedFilters(false);
                    }}
                />

                {/* Grid */}
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
                    {activeTeamId ? (
                        /* ── Inside a team: show draft contract cards ── */
                        loading ? (
                            <ShimmerCardGrid count={8} variant="contract" />
                        ) : filteredDrafts.length === 0 ? (
                            <Box sx={{ gridColumn: '1 / -1', textAlign: 'center', py: 8 }}>
                                <FolderIcon sx={{ fontSize: 48, color: 'text.disabled', mb: 1 }} />
                                <Typography color="text.secondary">
                                    No draft contracts in this team yet.
                                </Typography>
                            </Box>
                        ) : (
                            filteredDrafts.map((contract) => (
                                <ContractCard variant="draft"
                                    key={contract.id}
                                    contract={contract}
                                    onView={handleView}
                                    onShare={handleShare}
                                />
                            ))
                        )
                    ) : (
                        /* ── Root: show team cards (only teams with ≥1 draft contract) ── */
                        teamsLoading || loading ? (
                            <ShimmerCardGrid count={6} variant="contract" />
                        ) : teamsWithDrafts.length === 0 ? (
                            <Box sx={{ gridColumn: '1 / -1', textAlign: 'center', py: 8 }}>
                                <FolderIcon sx={{ fontSize: 48, color: 'text.disabled', mb: 1 }} />
                                <Typography color="text.secondary" gutterBottom>
                                    No teams with draft contracts yet.
                                </Typography>
                                <Typography variant="body2" color="text.disabled">
                                    Create contracts inside a team from the Contracts page.
                                </Typography>
                            </Box>
                        ) : filteredTeamsWithDrafts.length === 0 ? (
                            <Box sx={{ gridColumn: '1 / -1', textAlign: 'center', py: 8 }}>
                                <FolderIcon sx={{ fontSize: 48, color: 'text.disabled', mb: 1 }} />
                                <Typography color="text.secondary">No teams match your search.</Typography>
                            </Box>
                        ) : (
                            filteredTeamsWithDrafts.map(team => (
                                <TeamCard
                                    key={team._id}
                                    team={team}
                                    contractCount={draftCountByTeam(team._id)}
                                    onClick={handleTeamClick}
                                    onRename={handleRenameTeam}
                                />
                            ))
                        )
                    )}
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
                        // ✅ Reload drafts when dialog closes to reflect any saved changes
                        loadDrafts();
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
                    // ✅ Enable annotation navigation for draft editing
                    showAnnotationNavigation={true}
                    // ✅ Pass parties for party validation (must complete all fields of a party)
                    parties={selectedContract.parties}
                    // ✅ Pass external signers to protect client party fields from contractor editing
                    externalSigners={selectedContract.externalSigners}
                    // ✅ Pass internal signers to protect internal client party fields from contractor editing
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

            {/* Rename Team Dialog */}
            <RenameTeamDialog
                open={renameTeamOpen}
                team={teamToRename}
                onClose={() => setRenameTeamOpen(false)}
                onRenamed={handleTeamRenamed}
            />

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
