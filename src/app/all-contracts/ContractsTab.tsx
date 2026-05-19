'use client';

import { Box, Typography, Tooltip, IconButton } from '@mui/material';
import EmptyState from '@/components/common/EmptyState';
import { useState, useEffect, useCallback } from 'react';
import FolderIcon from '@mui/icons-material/Folder';
import CreateNewFolderIcon from '@mui/icons-material/CreateNewFolder';
import { useRouter } from 'next/navigation';
import dayjs, { Dayjs } from 'dayjs';
import ContractCard from '@/components/contracts/ContractCard';
import CreateContractDialog from '@/components/contracts/CreateContractDialog';
import RenewContractDialog from '@/components/contracts/RenewContractDialog';
import TerminateContractDialog from '@/components/contracts/TerminateContractDialog';
import { contractService } from '@/services/contractService';
import { Contract, ContractStatus, SignerAssignment } from '@/types/contract';
import DocumentViewerDialog from '@/components/viewer/DocumentViewerDialog';
import { authService } from '@/services/authService';
import SubmitForSignatureDialog from '@/components/contracts/SubmitForSignatureDialog';
import MultiPartySignatureDialog from '@/components/contracts/MultiPartySignatureDialog';
import NotificationSnackbar from '@/components/common/NotificationSnackbar';
import { submitForMixedSignature } from '@/services/externalSignatureService';
import { AlertColor } from '@mui/material';
import { categoryService } from '@/services/categoryService';
// import ReusableFilter, { FilterOption } from '@/components/common/ReusableFilter';
import CompactFilter, { FilterOption } from '@/components/common/CompactFilter';
import { useSignaturePolling } from '@/hooks/useSignaturePolling';
import { ShimmerCardGrid } from '@/components/common/ShimmerCard';
import TeamCard from '@/components/teams/TeamCard';
import CreateTeamDialog from '@/components/teams/CreateTeamDialog';
import RenameTeamDialog from '@/components/teams/RenameTeamDialog';
import { Team } from '@/types/team';
import { useTranslations } from 'next-intl';

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

export default function ContractsTab({ headerLeft }: { headerLeft?: React.ReactNode }) {
    const router = useRouter();
    const tTooltips = useTranslations('tooltips');
    const tContracts = useTranslations('contracts');
    const tFilters = useTranslations('filters');

    const statusOptions = [
        { label: tFilters('allStatus'), value: 'all' },
        { label: tFilters('active'), value: ContractStatus.ACTIVE },
        { label: tFilters('expiring'), value: ContractStatus.EXPIRING },
        { label: tFilters('approved'), value: ContractStatus.APPROVED },
        { label: tFilters('readyForSignature'), value: ContractStatus.READY_FOR_SIGNATURE },
        { label: tFilters('waitingForSignature'), value: ContractStatus.WAITING_FOR_SIGNATURE },
        { label: tFilters('signedByAssignedParties'), value: ContractStatus.SIGNED_BY_EVERYONE },
        { label: tFilters('signed'), value: ContractStatus.SIGNED },
        { label: tFilters('expired'), value: ContractStatus.EXPIRED },
    ];

    const [teams, setTeams] = useState<Team[]>([]);
    const [teamsLoading, setTeamsLoading] = useState(true);
    const [createTeamOpen, setCreateTeamOpen] = useState(false);
    const [renameTeamOpen, setRenameTeamOpen] = useState(false);
    const [teamToRename, setTeamToRename] = useState<Team | null>(null);
    const [wizardOpen, setWizardOpen] = useState(false);

    const [searchQuery, setSearchQuery] = useState('');
    const [statusFilter, setStatusFilter] = useState<FilterOption[]>([statusOptions[0]]);
    const [categoryFilter, setCategoryFilter] = useState<FilterOption[]>([{ label: tFilters('allCategories'), value: 'all' }]);
    const [teamFilterValue, setTeamFilterValue] = useState<FilterOption[]>([{ label: tFilters('allTeams'), value: 'all' }]);
    const [startDate, setStartDate] = useState<Dayjs | null>(null);
    const [endDate, setEndDate] = useState<Dayjs | null>(null);
    const [showAdvancedFilters, setShowAdvancedFilters] = useState(false);

    const [contracts, setContracts] = useState<Contract[]>([]);
    const [loading, setLoading] = useState(true);

    const [contractViewerOpen, setContractViewerOpen] = useState(false);
    const [selectedContract, setSelectedContract] = useState<Contract | null>(null);
    const [signatureDialogOpen, setSignatureDialogOpen] = useState(false);
    const [contractForSignature, setContractForSignature] = useState<Contract | null>(null);
    const [multiPartyDialogOpen, setMultiPartyDialogOpen] = useState(false);

    const [snackbar, setSnackbar] = useState({ open: false, message: '', severity: 'success' as AlertColor });
    const [renewDialogOpen, setRenewDialogOpen] = useState(false);
    const [contractForRenewal, setContractForRenewal] = useState<Contract | null>(null);
    const [terminateDialogOpen, setTerminateDialogOpen] = useState(false);
    const [contractForTermination, setContractForTermination] = useState<Contract | null>(null);

    const [categoryOptions, setCategoryOptions] = useState<FilterOption[]>([{ label: tFilters('allCategories'), value: 'all' }]);

    const showNotification = (message: string, severity: AlertColor = 'success') => {
        setSnackbar({ open: true, message, severity });
    };

    const loadCategories = () => {
        const categories = categoryService.getAllCategories();
        setCategoryOptions([
            { label: tFilters('allCategories'), value: 'all' },
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
            const statusById = new Map(allContracts.map(c => [c.id, c.status]));
            const relevantContracts = allContracts.filter(c => {
                if (c.status === ContractStatus.TERMINATED) return false;
                const isCreator = c.createdBy === currentUser.email;
                const isSigner = c.signer?.email === currentUser.email;
                const isValidSignerStatus = ['signed', 'active', 'expiring', 'expired'].includes(c.status);
                const isSignerAndVisible = isSigner && isValidSignerStatus;
                if (c.status === ContractStatus.EXPIRED && c.renewedContractId) {
                    const renewalStatus = statusById.get(c.renewedContractId);
                    if (renewalStatus && (CONTRACT_PAGE_STATUSES.includes(renewalStatus as ContractStatus) || renewalStatus === ContractStatus.TERMINATED)) return false;
                }
                if (isCreator) return CONTRACT_PAGE_STATUSES.includes(c.status);
                return isSignerAndVisible;
            });
            setContracts(relevantContracts);
        } catch { setContracts([]); }
        finally { setLoading(false); }
    }, []);

    useEffect(() => {
        loadContracts();
        loadTeams();
        loadCategories();
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    // Derived data
    const teamFilterOptions: FilterOption[] = [
        { label: tFilters('allTeams'), value: 'all' },
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

    const contractCountByTeam = (teamId: string) => contracts.filter(c => c.teamId === teamId).length;

    // Signature polling
    const waitingForSignatureIds = contracts.filter(c => c.status === ContractStatus.WAITING_FOR_SIGNATURE).map(c => c.id);
    const handleSignatureComplete = useCallback((contractId: string) => {
        const contract = contracts.find(c => c.id === contractId);
        showNotification(`Contract "${contract?.title || contractId}" has been signed!`, 'success');
        loadContracts();
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [contracts]);
    useSignaturePolling(waitingForSignatureIds, handleSignatureComplete, waitingForSignatureIds.length > 0);

    // Handlers
    const handleViewContract = (id: string) => router.push(`/contracts/${id}`);

    const handleShareContract = (id: string) => {
        const contract = contracts.find(c => c.id === id);
        if (!contract) return;
        setContractForSignature(contract);
        const formFields = contract.formFields || [];
        const effectiveParties = (contract.parties && contract.parties.length > 0)
            ? contract.parties
            : Array.from(formFields.reduce((seen: Map<string, any>, f: any) => {
                if (f.assignedParty && !seen.has(f.assignedParty)) seen.set(f.assignedParty, { id: f.assignedParty, label: f.partyLabel || f.assignedParty, color: f.partyColor || '#888' });
                return seen;
            }, new Map()).values());
        const partiesWithFields = effectiveParties.filter((party: any) => formFields.some((field: any) => field.assignedParty === party.id));
        if (partiesWithFields.length > 1) setMultiPartyDialogOpen(true);
        else setSignatureDialogOpen(true);
    };

    const handleSignatureSubmit = async (signerEmail: string): Promise<{ success: boolean; signingUrl?: string }> => {
        if (!contractForSignature) return { success: false };
        const result = await contractService.submitForSignature(contractForSignature.id, signerEmail);
        if (result.success) { showNotification('Signature request sent to ' + signerEmail, 'success'); loadContracts(); return { success: true, signingUrl: result.signingUrl }; }
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
                showNotification('Send successfully', 'success');
                loadContracts();
                try { const r = await fetch(`/api/contracts/${contractForSignature.id}`); if (r.ok) setContractForSignature(await r.json()); } catch { /* ignore */ }
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
        showNotification('Contract renewed successfully!', 'success');
        loadContracts();
    };

    const handleTerminateContract = (id: string) => {
        const contract = contracts.find(c => c.id === id);
        if (!contract) return;
        setContractForTermination(contract);
        setTerminateDialogOpen(true);
    };

    const handleTeamClick = (teamId: string) => router.push(`/contracts?team=${teamId}`);
    const handleRenameTeam = (team: Team) => { setTeamToRename(team); setRenameTeamOpen(true); };
    const handleTeamRenamed = (updated: Team) => { setTeams(prev => prev.map(t => t._id === updated._id ? updated : t)); showNotification(`Team renamed to "${updated.name}"`, 'success'); };
    const handleTeamCreated = (team: Team) => { setTeams(prev => [team, ...prev]); showNotification(`Team "${team.name}" created`, 'success'); };

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
                    px: 1,
                    py: 0.6,
                    borderBottom: '1px solid',
                    boxShadow: (theme) => `0 4px 12px ${theme.palette.primary.main}26`,
                    borderColor: 'divider',
                }}>
                    {headerLeft || (
                        <Box>
                            <Typography variant="h5">
                                {tContracts('title')}
                            </Typography>
                            <Typography variant="body2" sx={{ color: 'text.secondary' }}>
                                {tContracts('description')}
                            </Typography>
                        </Box>
                    )}
                    <Tooltip title={tTooltips('createTeam')} arrow>
                        <IconButton
                            onClick={() => setCreateTeamOpen(true)}
                            sx={{
                                p: 0.5,
                                borderRadius: 1,
                                bgcolor: 'primary.main',
                                color: 'white',
                                transition: 'all 0.2s',
                                '&:hover': {
                                    bgcolor: 'primary.dark',
                                    boxShadow: (theme) => `0 4px 12px ${theme.palette.primary.main}4d`,
                                },
                            }}
                        >
                            <CreateNewFolderIcon sx={{ fontSize: '20px' }} />
                        </IconButton>
                    </Tooltip>
                </Box>

                {/* Filter */}
                {/* <ReusableFilter */}
                <CompactFilter
                    searchQuery={searchQuery}
                    onSearchChange={setSearchQuery}
                    searchPlaceholder={tFilters('searchTeams')}
                    filters={[{ label: tFilters('team'), value: teamFilterValue, onChange: (v) => setTeamFilterValue(v || [{ label: tFilters('allTeams'), value: 'all' }]), options: teamFilterOptions, multiple: true }]}
                    enableDateFilter={true}
                    startDate={startDate}
                    onStartDateChange={setStartDate}
                    endDate={endDate}
                    onEndDateChange={setEndDate}
                    showAdvancedFilters={showAdvancedFilters}
                    onAdvancedFiltersToggle={() => setShowAdvancedFilters(!showAdvancedFilters)}
                    dateFilterTitle="Filter by Team Creation Date"
                    filteredCount={filteredTeams.length}
                    totalCount={teams.length}
                    countLabel={tFilters('countTeams')}
                    hasActiveFilters={searchQuery !== '' || teamFilterValue.every(f => f.value !== 'all') || startDate !== null || endDate !== null}
                    onClearFilters={() => { setSearchQuery(''); setStatusFilter([statusOptions[0]]); setCategoryFilter([{ label: tFilters('allCategories'), value: 'all' }]); setTeamFilterValue([{ label: tFilters('allTeams'), value: 'all' }]); setStartDate(null); setEndDate(null); setShowAdvancedFilters(false); }}
                />

                {/* Grid — Root: team cards */}
                <Box sx={{ flex: 1, overflowY: 'auto', minHeight: 0, p: 1 }}>
                    <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: 'repeat(2, 1fr)', lg: 'repeat(4, 1fr)' }, gap: 0.75 }}>
                    {teamsLoading ? (
                        <ShimmerCardGrid count={6} variant="contract" />
                    ) : teams.length === 0 ? (
                        <Box sx={{ gridColumn: '1 / -1' }}>
                            <EmptyState
                                icon={<FolderIcon />}
                                title="No teams yet"
                                description="Organize your contracts by creating a team."
                                action={{
                                    label: 'Create your first team',
                                    onClick: () => setCreateTeamOpen(true),
                                    startIcon: <CreateNewFolderIcon />,
                                    variant: 'outlined',
                                }}
                                sx={{ minHeight: '55vh' }}
                            />
                        </Box>
                    ) : filteredTeams.length === 0 ? (
                        <Box sx={{ gridColumn: '1 / -1' }}>
                            <EmptyState
                                icon={<FolderIcon />}
                                title="No teams match your search."
                                sx={{ minHeight: '55vh' }}
                            />
                        </Box>
                    ) : (
                        filteredTeams.map(team => (
                            <TeamCard key={team._id} team={team} contractCount={contractCountByTeam(team._id)} onClick={handleTeamClick} onRename={handleRenameTeam} />
                        ))
                    )}
                    </Box>
                </Box>
            </Box>

            {/* Dialogs */}
            <CreateContractDialog open={wizardOpen} onClose={() => setWizardOpen(false)} onSuccess={loadContracts} teamId={null} />
            <CreateTeamDialog open={createTeamOpen} onClose={() => setCreateTeamOpen(false)} onCreated={handleTeamCreated} />
            <RenameTeamDialog open={renameTeamOpen} team={teamToRename} onClose={() => setRenameTeamOpen(false)} onRenamed={handleTeamRenamed} />

            {selectedContract && (
                <DocumentViewerDialog
                    open={contractViewerOpen}
                    onClose={() => { setContractViewerOpen(false); setSelectedContract(null); loadContracts(); }}
                    fileUrl={(() => { if (selectedContract.fileUrl) return selectedContract.fileUrl; if (selectedContract.fileData) return selectedContract.fileData; if (selectedContract.signedPdfBase64) return `data:application/pdf;base64,${selectedContract.signedPdfBase64}`; if (selectedContract.templateId) return `/api/file/${selectedContract.templateId}?type=template`; return ''; })()}
                    fileName={`${selectedContract.title}.pdf`}
                    title={selectedContract.title}
                    content={selectedContract.signedPdfBase64 ? undefined : selectedContract.content}
                    templateDocxBase64={selectedContract.templateDocxBase64}
                    fieldValues={selectedContract.fieldValues}
                    signatureImage={selectedContract.signer?.signatureImage}
                    initialXfdf={(() => { if (selectedContract.fileUrl || selectedContract.fileData || selectedContract.signedPdfBase64) return undefined; return selectedContract.xfdfData; })()}
                    contractId={selectedContract.id}
                    formFields={(() => { if (selectedContract.fileUrl || selectedContract.fileData || selectedContract.signedPdfBase64) return undefined; return selectedContract.formFields; })()}
                    currentUserRole="contractor"
                    readOnly={true}
                />
            )}

            <SubmitForSignatureDialog open={signatureDialogOpen} onClose={() => setSignatureDialogOpen(false)} onSubmit={handleSignatureSubmit} contractTitle={contractForSignature?.title} />

            <MultiPartySignatureDialog
                open={multiPartyDialogOpen}
                onClose={() => setMultiPartyDialogOpen(false)}
                onSubmit={handleMixedSignatureSubmit}
                contractTitle={contractForSignature?.title}
                parties={(() => { if (!contractForSignature) return []; const ff = contractForSignature.formFields || []; return (contractForSignature.parties && contractForSignature.parties.length > 0) ? contractForSignature.parties : Array.from(ff.reduce((seen: Map<string, any>, f: any) => { if (f.assignedParty && !seen.has(f.assignedParty)) seen.set(f.assignedParty, { id: f.assignedParty, label: f.partyLabel || f.assignedParty, color: f.partyColor || '#888' }); return seen; }, new Map()).values()); })()}
                formFields={contractForSignature?.formFields}
                existingExternalSigners={contractForSignature?.externalSigners}
                existingInternalSigners={contractForSignature?.internalSigners}
                fieldValues={contractForSignature?.fieldValues}
            />

            {contractForRenewal && (
                <RenewContractDialog open={renewDialogOpen} onClose={() => { setRenewDialogOpen(false); setContractForRenewal(null); }} contractId={contractForRenewal.id} contractTitle={contractForRenewal.title} contractEndDate={contractForRenewal.endDate || ''} onSuccess={handleRenewalSuccess} />
            )}

            {contractForTermination && (
                <TerminateContractDialog
                    open={terminateDialogOpen}
                    onClose={() => { setTerminateDialogOpen(false); setContractForTermination(null); }}
                    contractId={contractForTermination.id}
                    contractTitle={contractForTermination.title.replace(/\s*\(Renewal\d*\)$/i, '')}
                    onSuccess={() => { setTerminateDialogOpen(false); setContractForTermination(null); showNotification('Contract has been terminated.', 'success'); loadContracts(); }}
                />
            )}

            <NotificationSnackbar open={snackbar.open} message={snackbar.message} severity={snackbar.severity} onClose={() => setSnackbar({ ...snackbar, open: false })} />
        </>
    );
}