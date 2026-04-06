'use client';

import { Box, Typography, Tooltip, IconButton, Button, Chip } from '@mui/material';
import { useState, useEffect, useCallback } from 'react';
import AddIcon from '@mui/icons-material/Add';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import FolderIcon from '@mui/icons-material/Folder';
import CreateNewFolderOutlinedIcon from '@mui/icons-material/CreateNewFolderOutlined';
import AppLayout from '@/components/layout/AppLayout';
import { useRouter, useSearchParams } from 'next/navigation';
import { LocalizationProvider } from '@mui/x-date-pickers/LocalizationProvider';
import { AdapterDayjs } from '@mui/x-date-pickers/AdapterDayjs';
import dayjs, { Dayjs } from 'dayjs';
import ContractCard from '@/components/contracts/ContractCard';
import CreateContractDialog from '@/components/contracts/CreateContractDialog';
import RenewContractDialog from '@/components/contracts/RenewContractDialog';
import { contractService } from '@/services/contractService';
import { Contract, ContractStatus, SignerAssignment } from '@/types/contract';
import DocumentViewerDialog from '@/components/viewer/DocumentViewerDialog';
import { authService } from '@/services/authService';
import SubmitForSignatureDialog from '@/components/contracts/SubmitForSignatureDialog';
import MultiPartySignatureDialog from '@/components/contracts/MultiPartySignatureDialog';
import NotificationSnackbar from '@/components/common/NotificationSnackbar';
import { submitForMixedSignature } from '@/services/externalSignatureService';
import { AlertColor } from '@mui/material';
import { templateService } from '@/services/templateService';
import { categoryService } from '@/services/categoryService';
import ReusableFilter, { FilterOption } from '@/components/common/ReusableFilter';
import { useSignaturePolling } from '@/hooks/useSignaturePolling';
import { ShimmerCardGrid } from '@/components/common/ShimmerCard';
import TeamCard from '@/components/teams/TeamCard';
import CreateTeamDialog from '@/components/teams/CreateTeamDialog';
import RenameTeamDialog from '@/components/teams/RenameTeamDialog';
import { Team } from '@/types/team';

// Statuses that belong on the Contracts page
const CONTRACT_PAGE_STATUSES = [
    ContractStatus.APPROVED,
    ContractStatus.READY_FOR_SIGNATURE,
    ContractStatus.WAITING_FOR_SIGNATURE,
    ContractStatus.SIGNED_BY_EVERYONE,
    ContractStatus.SIGNED,
    ContractStatus.ACTIVE,
    ContractStatus.EXPIRING,
    ContractStatus.EXPIRED,
];

const statusOptions = [
    { label: 'All Status', value: 'all' },
    { label: 'Active', value: ContractStatus.ACTIVE },
    { label: 'Expiring', value: ContractStatus.EXPIRING },
    { label: 'Approved', value: ContractStatus.APPROVED },
    { label: 'Ready for Signature', value: ContractStatus.READY_FOR_SIGNATURE },
    { label: 'Waiting for Signature', value: ContractStatus.WAITING_FOR_SIGNATURE },
    { label: 'Signed by Assigned Parties', value: ContractStatus.SIGNED_BY_EVERYONE },
    { label: 'Signed', value: ContractStatus.SIGNED },
    { label: 'Expired', value: ContractStatus.EXPIRED },
];

export default function ContractsPage() {
    const router = useRouter();
    const searchParams = useSearchParams();

    // Team navigation state
    const activeTeamId = searchParams.get('team');
    const statusFromUrl = searchParams.get('status');
    // Flat view: no team selected but a status param exists (e.g. from dashboard card)
    const isFlatView = !activeTeamId && statusFromUrl !== null;
    const [teams, setTeams] = useState<Team[]>([]);
    const [teamsLoading, setTeamsLoading] = useState(true);
    const [createTeamOpen, setCreateTeamOpen] = useState(false);
    const [renameTeamOpen, setRenameTeamOpen] = useState(false);
    const [teamToRename, setTeamToRename] = useState<Team | null>(null);

    const [searchQuery, setSearchQuery] = useState('');
    const [statusFilter, setStatusFilter] = useState<FilterOption[]>([statusOptions[0]]);
    const [categoryFilter, setCategoryFilter] = useState<FilterOption[]>([{ label: 'All Categories', value: 'all' }]);
    const [teamFilterValue, setTeamFilterValue] = useState<FilterOption[]>([{ label: 'All Teams', value: 'all' }]);
    const [startDate, setStartDate] = useState<Dayjs | null>(null);
    const [endDate, setEndDate] = useState<Dayjs | null>(null);
    const [showAdvancedFilters, setShowAdvancedFilters] = useState(false);
    const [wizardOpen, setWizardOpen] = useState(false);

    const [contracts, setContracts] = useState<Contract[]>([]);
    const [loading, setLoading] = useState(true);

    const [contractViewerOpen, setContractViewerOpen] = useState(false);
    const [selectedContract, setSelectedContract] = useState<Contract | null>(null);

    // Signature Dialog State
    const [signatureDialogOpen, setSignatureDialogOpen] = useState(false);
    const [contractForSignature, setContractForSignature] = useState<Contract | null>(null);

    // Multi-Party Signature Dialog State
    const [multiPartyDialogOpen, setMultiPartyDialogOpen] = useState(false);

    // Snackbar state
    const [snackbar, setSnackbar] = useState({
        open: false,
        message: '',
        severity: 'success' as AlertColor,
    });

    // Renew dialog state
    const [renewDialogOpen, setRenewDialogOpen] = useState(false);
    const [contractForRenewal, setContractForRenewal] = useState<Contract | null>(null);

    const showNotification = (message: string, severity: AlertColor = 'success') => {
        setSnackbar({ open: true, message, severity });
    };

    const [categoryOptions, setCategoryOptions] = useState<FilterOption[]>([
        { label: 'All Categories', value: 'all' }
    ]);

    // ─── Data loading ────────────────────────────────────────────────────────
    const loadCategories = () => {
        const categories = categoryService.getAllCategories();
        setCategoryOptions([
            { label: 'All Categories', value: 'all' },
            ...categories.map(cat => ({ label: cat.name, value: cat.name }))
        ]);
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

    const loadContracts = useCallback(async () => {
        setLoading(true);
        const currentUser = authService.getCurrentUser();
        if (!currentUser) { setContracts([]); setLoading(false); return; }

        try {
            const allContracts = await contractService.getAllContracts();
            if (!Array.isArray(allContracts)) { setContracts([]); setLoading(false); return; }

            // Build a quick status lookup by contract ID for the superseded check below
            const statusById = new Map(allContracts.map(c => [c.id, c.status]));

            const relevantContracts = allContracts.filter(c => {
                const isCreator = c.createdBy === currentUser.email;
                const isSigner = c.signer?.email === currentUser.email;
                const isValidSignerStatus = ['signed', 'active', 'expiring', 'expired'].includes(c.status);
                const isSignerAndVisible = isSigner && isValidSignerStatus;

                // Hide expired contracts whose renewal is now active or expiring
                // (the renewal card takes over as the visible one)
                if (c.status === ContractStatus.EXPIRED && c.renewedContractId) {
                    const renewalStatus = statusById.get(c.renewedContractId);
                    if (renewalStatus === ContractStatus.ACTIVE || renewalStatus === ContractStatus.EXPIRING) {
                        return false;
                    }
                }

                if (isCreator) return CONTRACT_PAGE_STATUSES.includes(c.status);
                return isSignerAndVisible;
            });

            setContracts(relevantContracts);
        } catch { setContracts([]); }
        finally { setLoading(false); }
    }, []);

    useEffect(() => {
        const statusParam = searchParams.get('status');
        const searchParam = searchParams.get('search');
        if (statusParam) {
            const found = statusOptions.find(opt => opt.value === statusParam);
            setStatusFilter(found ? [found] : [statusOptions[0]]);
        } else {
            setStatusFilter([statusOptions[0]]);
        }
        if (searchParam) setSearchQuery(searchParam);
    }, [searchParams]);

    useEffect(() => {
        loadContracts();
        loadTeams();
        loadCategories();
    }, []);

    // Reset search + team filter when switching between root and team view
    useEffect(() => {
        setSearchQuery('');
        setTeamFilterValue([{ label: 'All Teams', value: 'all' }]);
    }, [activeTeamId]);

    // ─── Derived data ─────────────────────────────────────────────────────────
    const activeTeam = teams.find(t => t._id === activeTeamId) ?? null;

    // Flat view: map URL status values to page titles
    const statusLabelMap: Record<string, string> = {
        [ContractStatus.ACTIVE]: 'Active Contracts',
        [ContractStatus.EXPIRING]: 'Expiring Soon',
        [ContractStatus.EXPIRED]: 'Expired / Terminated',
        [ContractStatus.WAITING_FOR_SIGNATURE]: 'Requested Contracts',
        [ContractStatus.SIGNED_BY_EVERYONE]: 'Received Signed',
        [ContractStatus.APPROVED]: 'Approved Contracts',
        [ContractStatus.READY_FOR_SIGNATURE]: 'Ready for Signature',
        [ContractStatus.SIGNED]: 'Signed Contracts',
    };
    const flatViewTitle = statusFromUrl ? (statusLabelMap[statusFromUrl] ?? 'Contracts') : 'Contracts';
    // Total count for flat view = contracts matching only the URL status (before additional filters)
    const flatViewBaseContracts = isFlatView && statusFromUrl
        ? contracts.filter(c => c.status === statusFromUrl)
        : contracts;

    // Root-level: team filter options + filtered teams list
    const teamFilterOptions: FilterOption[] = [
        { label: 'All Teams', value: 'all' },
        ...teams.map(t => ({ label: t.name, value: t._id })),
    ];
    const filteredTeams = teams.filter(t => {
        const matchesSearch = searchQuery === '' || t.name.toLowerCase().includes(searchQuery.toLowerCase());
        const matchesFilter = teamFilterValue.some(f => f.value === 'all') || teamFilterValue.some(f => f.value === t._id);
        let matchesDate = true;
        if (startDate || endDate) {
            const d = dayjs(t.createdAt);
            if (startDate && d.isBefore(startDate, 'day')) matchesDate = false;
            if (endDate && d.isAfter(endDate, 'day')) matchesDate = false;
        }
        return matchesSearch && matchesFilter && matchesDate;
    });

    // Contracts shown inside a team (or all when no team selected)
    const teamContracts = activeTeamId
        ? contracts.filter(c => c.teamId === activeTeamId)
        : contracts;

    const filteredContracts = teamContracts.filter(contract => {
        const matchesSearch = searchQuery === '' ||
            contract.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
            contract.client?.toLowerCase().includes(searchQuery.toLowerCase());
        const matchesStatus = statusFilter.some(f => f.value === 'all') || statusFilter.some(f => f.value === contract.status);
        const matchesCategory = categoryFilter.some(f => f.value === 'all') || categoryFilter.some(f => f.value === contract.category);
        let matchesDate = true;
        if (startDate || endDate) {
            const d = dayjs(contract.createdAt);
            if (startDate && d.isBefore(startDate, 'day')) matchesDate = false;
            if (endDate && d.isAfter(endDate, 'day')) matchesDate = false;
        }
        return matchesSearch && matchesStatus && matchesCategory && matchesDate;
    });

    // Count of contract-page-status contracts per team (for TeamCard badge)
    const contractCountByTeam = (teamId: string) =>
        contracts.filter(c => c.teamId === teamId).length;

    // ─── Polling ──────────────────────────────────────────────────────────────
    const waitingForSignatureIds = contracts
        .filter(c => c.status === ContractStatus.WAITING_FOR_SIGNATURE)
        .map(c => c.id);

    const handleSignatureComplete = useCallback((contractId: string) => {
        const contract = contracts.find(c => c.id === contractId);
        showNotification(`Contract "${contract?.title || contractId}" has been signed!`, 'success');
        loadContracts();
    }, [contracts]);

    useSignaturePolling(waitingForSignatureIds, handleSignatureComplete, waitingForSignatureIds.length > 0);

    // ─── Handlers ─────────────────────────────────────────────────────────────
    const handleViewContract = (id: string) => router.push(`/contracts/${id}`);

    const handleShareContract = (id: string) => {
        const contract = contracts.find(c => c.id === id);
        if (!contract) return;
        setContractForSignature(contract);
        const formFields = contract.formFields || [];
        const effectiveParties = (contract.parties && contract.parties.length > 0)
            ? contract.parties
            : Array.from(
                formFields.reduce((seen: Map<string, any>, f: any) => {
                    if (f.assignedParty && !seen.has(f.assignedParty)) {
                        seen.set(f.assignedParty, { id: f.assignedParty, label: f.partyLabel || f.assignedParty, color: f.partyColor || '#888' });
                    }
                    return seen;
                }, new Map()).values()
              );
        const partiesWithFields = effectiveParties.filter((party: any) =>
            formFields.some((field: any) => field.assignedParty === party.id)
        );
        if (partiesWithFields.length > 1) setMultiPartyDialogOpen(true);
        else setSignatureDialogOpen(true);
    };

    const handleSignatureSubmit = async (signerEmail: string): Promise<{ success: boolean; signingUrl?: string }> => {
        if (!contractForSignature) return { success: false };
        const currentUser = authService.getCurrentUser();
        const result = await contractService.submitForSignature(contractForSignature.id, signerEmail);
        if (result.success) {
            showNotification('Signature request sent to ' + signerEmail, 'success');
            loadContracts();
            return { success: true, signingUrl: result.signingUrl };
        }
        showNotification(result.message, 'error');
        return { success: false };
    };

    const handleMixedSignatureSubmit = async (assignments: SignerAssignment[]): Promise<{ success: boolean; error?: string }> => {
        if (!contractForSignature) return { success: false, error: 'No contract selected' };
        const currentUser = authService.getCurrentUser();
        const senderName = currentUser?.email || 'Contract System';
        try {
            const result = await submitForMixedSignature(contractForSignature, assignments, senderName);
            if (result.success) {
                const internalCount = assignments.filter(a => a.type === 'internal').length;
                const externalCount = assignments.filter(a => a.type === 'external').length;
                showNotification(`Send successfully`, 'success');
                loadContracts();
                try {
                    const refreshRes = await fetch(`/api/contracts/${contractForSignature.id}`);
                    if (refreshRes.ok) setContractForSignature(await refreshRes.json());
                } catch { /* ignore */ }
                return { success: true };
            }
            showNotification(result.error || 'Failed to create assignments', 'error');
            return { success: false, error: result.error };
        } catch (error: any) {
            showNotification(error.message || 'An unexpected error occurred', 'error');
            return { success: false, error: error.message };
        }
    };

    const handleRenewContract = (id: string) => {
        const contract = contracts.find(c => c.id === id);
        if (!contract) return;
        setContractForRenewal(contract);
        setRenewDialogOpen(true);
    };

    const handleRenewalSuccess = (renewalId: string) => {
        showNotification('Contract renewed! New draft has been created.', 'success');
        loadContracts();
    };

    const handleTeamClick = (teamId: string) => router.push(`/contracts?team=${teamId}`);

    const handleRenameTeam = (team: Team) => {
        setTeamToRename(team);
        setRenameTeamOpen(true);
    };

    const handleTeamRenamed = (updated: Team) => {
        setTeams(prev => prev.map(t => t._id === updated._id ? updated : t));
        showNotification(`Team renamed to "${updated.name}"`, 'success');
    };

    const handleTeamCreated = (team: Team) => {
        setTeams(prev => [team, ...prev]);
        showNotification(`Team "${team.name}" created`, 'success');
    };

    // ─── Render ───────────────────────────────────────────────────────────────
    return (
        <LocalizationProvider dateAdapter={AdapterDayjs}>
            <AppLayout>
                <Box>
                    {/* Header */}
                    <Box
                        sx={{
                            display: 'flex',
                            justifyContent: 'space-between',
                            alignItems: { xs: 'flex-start', md: 'center' },
                            flexDirection: { xs: 'column', md: 'row' },
                            gap: { xs: 2, md: 2 },
                            mb: 1,
                        }}
                    >
                        {/* Title / breadcrumb */}
                        <Box sx={{ display: 'flex', alignItems: 'flex-start', gap: 1 }}>
                            {(activeTeamId || isFlatView) && (
                                <Tooltip title={isFlatView ? 'Back to Contracts' : 'Back to Teams'} arrow>
                                    <IconButton
                                        size="small"
                                        onClick={() => router.push('/contracts')}
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
                                    sx={{ color: 'primary.main', fontSize: { xs: '1.75rem', sm: '2rem', md: '20px' } }}
                                >
                                    {activeTeam ? activeTeam.name : isFlatView ? flatViewTitle : 'Contracts'}
                                </Typography>

                                {/* Subtitle — breadcrumb when inside team or flat view, generic text at root */}
                                {activeTeamId ? (
                                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, mt: 0.25 }}>
                                        <Typography
                                            variant="body2"
                                            sx={{ color: 'text.secondary', cursor: 'pointer', '&:hover': { color: 'primary.main' } }}
                                            onClick={() => router.push('/contracts')}
                                        >
                                            Contracts
                                        </Typography>
                                        <Typography variant="body2" sx={{ color: 'text.disabled' }}>/</Typography>
                                        <FolderIcon sx={{ fontSize: 14, color: 'primary.main' }} />
                                        <Typography variant="body2" sx={{ color: 'text.secondary' }}>
                                            {activeTeam?.name}
                                        </Typography>
                                        <Chip
                                            label={`${filteredContracts.length} contract${filteredContracts.length !== 1 ? 's' : ''}`}
                                            size="small"
                                            sx={{ height: 18, fontSize: '0.65rem', bgcolor: 'rgba(15,118,110,0.08)', color: 'primary.main' }}
                                        />
                                    </Box>
                                ) : isFlatView ? (
                                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, mt: 0.25 }}>
                                        <Typography
                                            variant="body2"
                                            sx={{ color: 'text.secondary', cursor: 'pointer', '&:hover': { color: 'primary.main' } }}
                                            onClick={() => router.push('/contracts')}
                                        >
                                            Contracts
                                        </Typography>
                                        <Typography variant="body2" sx={{ color: 'text.disabled' }}>/</Typography>
                                        <Typography variant="body2" sx={{ color: 'text.secondary' }}>
                                            {flatViewTitle}
                                        </Typography>
                                        <Chip
                                            label={`${filteredContracts.length} contract${filteredContracts.length !== 1 ? 's' : ''}`}
                                            size="small"
                                            sx={{ height: 18, fontSize: '0.65rem', bgcolor: 'rgba(15,118,110,0.08)', color: 'primary.main' }}
                                        />
                                    </Box>
                                ) : (
                                    <Typography variant="body2" sx={{ color: 'text.secondary' }}>
                                        Manage your teams and contracts
                                    </Typography>
                                )}
                            </Box>
                        </Box>

                        {/* Action button — hidden in flat cross-team view (no team context for creation) */}
                        {!isFlatView && (
                            <Box sx={{ display: 'flex', justifyContent: { xs: 'flex-end', sm: 'flex-start' } }}>
                                <Tooltip title={activeTeamId ? 'Create Contract' : 'Create Team'} arrow>
                                    <IconButton
                                        onClick={() => activeTeamId ? setWizardOpen(true) : setCreateTeamOpen(true)}
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
                                        {activeTeamId ? <AddIcon /> : <CreateNewFolderOutlinedIcon />}
                                    </IconButton>
                                </Tooltip>
                            </Box>
                        )}
                    </Box>

                    {/* Filter */}
                    <ReusableFilter
                        searchQuery={searchQuery}
                        onSearchChange={setSearchQuery}
                        searchPlaceholder={activeTeamId || isFlatView ? 'Search contracts or clients' : 'Search teams'}
                        filters={activeTeamId || isFlatView ? [
                            {
                                label: 'Status',
                                value: statusFilter,
                                onChange: (newValue) => setStatusFilter(newValue || [statusOptions[0]]),
                                options: statusOptions,
                                multiple: true,
                                disabled: isFlatView && !!statusFromUrl && statusFromUrl !== 'all',
                            },
                            {
                                label: 'Category',
                                value: categoryFilter,
                                onChange: (newValue) => setCategoryFilter(newValue || [{ label: 'All Categories', value: 'all' }]),
                                options: categoryOptions,
                                multiple: true,
                            },
                        ] : [
                            {
                                label: 'Team',
                                value: teamFilterValue,
                                onChange: (newValue) => setTeamFilterValue(newValue || [{ label: 'All Teams', value: 'all' }]),
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
                        dateFilterTitle={activeTeamId || isFlatView ? 'Filter by Contract Date Range' : 'Filter by Team Creation Date'}
                        filteredCount={activeTeamId || isFlatView ? filteredContracts.length : filteredTeams.length}
                        totalCount={activeTeamId ? teamContracts.length : isFlatView ? flatViewBaseContracts.length : teams.length}
                        countLabel={activeTeamId || isFlatView ? 'contracts' : 'teams'}
                        hasActiveFilters={
                            (activeTeamId || isFlatView)
                                ? (searchQuery !== '' || (!(isFlatView && statusFromUrl && statusFromUrl !== 'all') && statusFilter.every(f => f.value !== 'all')) || categoryFilter.every(f => f.value !== 'all') || startDate !== null || endDate !== null)
                                : (searchQuery !== '' || teamFilterValue.every(f => f.value !== 'all') || startDate !== null || endDate !== null)
                        }
                        onClearFilters={() => {
                            setSearchQuery('');
                            if (isFlatView && statusFromUrl) {
                                const found = statusOptions.find(opt => opt.value === statusFromUrl);
                                setStatusFilter(found ? [found] : [statusOptions[0]]);
                            } else {
                                setStatusFilter([statusOptions[0]]);
                            }
                            setCategoryFilter([{ label: 'All Categories', value: 'all' }]);
                            setTeamFilterValue([{ label: 'All Teams', value: 'all' }]);
                            setStartDate(null);
                            setEndDate(null);
                            setShowAdvancedFilters(false);
                        }}
                    />

                    {/* Grid */}
                    <Box
                        sx={{
                            display: 'grid',
                            gridTemplateColumns: { xs: '1fr', sm: 'repeat(2, 1fr)', lg: 'repeat(4, 1fr)' },
                            gap: 0.75,
                        }}
                    >
                        {isFlatView ? (
                            /* ── Flat cross-team view: all contracts filtered by URL status ── */
                            loading ? (
                                <ShimmerCardGrid count={8} variant="contract" />
                            ) : filteredContracts.length === 0 ? (
                                <Box sx={{ gridColumn: '1 / -1', textAlign: 'center', py: 8 }}>
                                    <FolderIcon sx={{ fontSize: 48, color: 'text.disabled', mb: 1 }} />
                                    <Typography color="text.secondary">
                                        No contracts found with the selected filters.
                                    </Typography>
                                </Box>
                            ) : (
                                filteredContracts.map(contract => (
                                    <ContractCard
                                        key={contract.id}
                                        contract={contract}
                                        onView={handleViewContract}
                                        onShare={handleShareContract}
                                        onRenew={handleRenewContract}
                                    />
                                ))
                            )
                        ) : activeTeamId ? (
                            /* ── Inside a team: show contract cards ── */
                            loading ? (
                                <ShimmerCardGrid count={8} variant="contract" />
                            ) : filteredContracts.length === 0 ? (
                                <Box sx={{ gridColumn: '1 / -1', textAlign: 'center', py: 8 }}>
                                    <FolderIcon sx={{ fontSize: 48, color: 'text.disabled', mb: 1 }} />
                                    <Typography color="text.secondary">
                                        No contracts in this team yet. Click <strong>+</strong> to create one.
                                    </Typography>
                                </Box>
                            ) : (
                                filteredContracts.map(contract => (
                                    <ContractCard
                                        key={contract.id}
                                        contract={contract}
                                        onView={handleViewContract}
                                        onShare={handleShareContract}
                                        onRenew={handleRenewContract}
                                    />
                                ))
                            )
                        ) : (
                            /* ── Root: show team cards ── */
                            teamsLoading ? (
                                <ShimmerCardGrid count={6} variant="contract" />
                            ) : teams.length === 0 ? (
                                <Box sx={{ gridColumn: '1 / -1', textAlign: 'center', py: 8 }}>
                                    <FolderIcon sx={{ fontSize: 48, color: 'text.disabled', mb: 1 }} />
                                    <Typography color="text.secondary" gutterBottom>
                                        No teams yet.
                                    </Typography>
                                    <Button
                                        variant="outlined"
                                        startIcon={<AddIcon />}
                                        onClick={() => setCreateTeamOpen(true)}
                                        size="small"
                                    >
                                        Create your first team
                                    </Button>
                                </Box>
                            ) : filteredTeams.length === 0 ? (
                                <Box sx={{ gridColumn: '1 / -1', textAlign: 'center', py: 8 }}>
                                    <FolderIcon sx={{ fontSize: 48, color: 'text.disabled', mb: 1 }} />
                                    <Typography color="text.secondary">No teams match your search.</Typography>
                                </Box>
                            ) : (
                                filteredTeams.map(team => (
                                    <TeamCard
                                        key={team._id}
                                        team={team}
                                        contractCount={contractCountByTeam(team._id)}
                                        onClick={handleTeamClick}
                                        onRename={handleRenameTeam}
                                    />
                                ))
                            )
                        )}
                    </Box>
                </Box>

                {/* Dialogs */}
                <CreateContractDialog
                    open={wizardOpen}
                    onClose={() => setWizardOpen(false)}
                    onSuccess={loadContracts}
                    teamId={activeTeamId}
                />

                <CreateTeamDialog
                    open={createTeamOpen}
                    onClose={() => setCreateTeamOpen(false)}
                    onCreated={handleTeamCreated}
                />

                <RenameTeamDialog
                    open={renameTeamOpen}
                    team={teamToRename}
                    onClose={() => setRenameTeamOpen(false)}
                    onRenamed={handleTeamRenamed}
                />

                {selectedContract && (
                    <DocumentViewerDialog
                        open={contractViewerOpen}
                        onClose={() => { setContractViewerOpen(false); setSelectedContract(null); loadContracts(); }}
                        fileUrl={(() => {
                            if (selectedContract.fileUrl) return selectedContract.fileUrl;
                            if (selectedContract.fileData) return selectedContract.fileData;
                            if (selectedContract.signedPdfBase64) return `data:application/pdf;base64,${selectedContract.signedPdfBase64}`;
                            if (selectedContract.templateId) return `/api/file/${selectedContract.templateId}?type=template`;
                            return '';
                        })()}
                        fileName={`${selectedContract.title}.pdf`}
                        title={selectedContract.title}
                        content={selectedContract.signedPdfBase64 ? undefined : selectedContract.content}
                        templateDocxBase64={selectedContract.templateDocxBase64}
                        fieldValues={selectedContract.fieldValues}
                        signatureImage={selectedContract.signer?.signatureImage}
                        initialXfdf={(() => {
                            if (selectedContract.fileUrl || selectedContract.fileData || selectedContract.signedPdfBase64) return undefined;
                            return selectedContract.xfdfData;
                        })()}
                        contractId={selectedContract.id}
                        formFields={(() => {
                            if (selectedContract.fileUrl || selectedContract.fileData || selectedContract.signedPdfBase64) return undefined;
                            return selectedContract.formFields;
                        })()}
                        currentUserRole="contractor"
                        readOnly={true}
                    />
                )}

                <SubmitForSignatureDialog
                    open={signatureDialogOpen}
                    onClose={() => setSignatureDialogOpen(false)}
                    onSubmit={handleSignatureSubmit}
                    contractTitle={contractForSignature?.title}
                />

                <MultiPartySignatureDialog
                    open={multiPartyDialogOpen}
                    onClose={() => setMultiPartyDialogOpen(false)}
                    onSubmit={handleMixedSignatureSubmit}
                    contractTitle={contractForSignature?.title}
                    parties={(() => {
                        if (!contractForSignature) return [];
                        const ff = contractForSignature.formFields || [];
                        return (contractForSignature.parties && contractForSignature.parties.length > 0)
                            ? contractForSignature.parties
                            : Array.from(
                                ff.reduce((seen: Map<string, any>, f: any) => {
                                    if (f.assignedParty && !seen.has(f.assignedParty)) {
                                        seen.set(f.assignedParty, { id: f.assignedParty, label: f.partyLabel || f.assignedParty, color: f.partyColor || '#888' });
                                    }
                                    return seen;
                                }, new Map()).values()
                              );
                    })()}
                    formFields={contractForSignature?.formFields}
                    existingExternalSigners={contractForSignature?.externalSigners}
                    existingInternalSigners={contractForSignature?.internalSigners}
                    fieldValues={contractForSignature?.fieldValues}
                />

                {contractForRenewal && (
                    <RenewContractDialog
                        open={renewDialogOpen}
                        onClose={() => { setRenewDialogOpen(false); setContractForRenewal(null); }}
                        contractId={contractForRenewal.id}
                        contractTitle={contractForRenewal.title}
                        contractEndDate={contractForRenewal.endDate || ''}
                        onSuccess={handleRenewalSuccess}
                    />
                )}

                <NotificationSnackbar
                    open={snackbar.open}
                    message={snackbar.message}
                    severity={snackbar.severity}
                    onClose={() => setSnackbar({ ...snackbar, open: false })}
                />
            </AppLayout>
        </LocalizationProvider>
    );
}
