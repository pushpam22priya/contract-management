'use client';

import { Box, Typography, Tooltip, IconButton, Chip } from '@mui/material';
import EmptyState from '@/components/common/EmptyState';
import { useState, useEffect, useCallback } from 'react';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import FolderIcon from '@mui/icons-material/Folder';
import CreateNewFolderIcon from '@mui/icons-material/CreateNewFolder';
import NoteAddIcon from '@mui/icons-material/NoteAddOutlined';
import { useRouter, useSearchParams } from 'next/navigation';
import { LocalizationProvider } from '@mui/x-date-pickers/LocalizationProvider';
import { AdapterDayjs } from '@mui/x-date-pickers/AdapterDayjs';
import dayjs, { Dayjs } from 'dayjs';
import ContractCard from '@/components/contracts/ContractCard';
import CreateContractDialog from '@/components/contracts/CreateContractDialog';
import RenewContractDialog from '@/components/contracts/RenewContractDialog';
import TerminateContractDialog from '@/components/contracts/TerminateContractDialog';
import RequestReviewDialog from '@/components/contracts/RequestReviewDialog';
import ContractHistoryPanel from '@/components/contracts/ContractHistoryPanel';
import ContractHistoryDialog from '@/components/contracts/ContractHistoryDialog';
import DeleteContractDialog from '@/components/contracts/DeleteContractDialog';
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
import { apiService } from '@/services/apiService';
import CompactFilter, { FilterOption } from '@/components/common/CompactFilter';
import { useSignaturePolling } from '@/hooks/useSignaturePolling';
import { ShimmerCardGrid } from '@/components/common/ShimmerCard';
import TeamCard from '@/components/teams/TeamCard';
import CreateTeamDialog from '@/components/teams/CreateTeamDialog';
import RenameTeamDialog from '@/components/teams/RenameTeamDialog';
import { Team } from '@/types/team';
import { useTranslations } from 'next-intl';
import type { HistoryEntry } from '@/components/contracts/ContractHistoryPanel';

const DRAFT_STATUSES: ContractStatus[] = [
    ContractStatus.DRAFT,
    ContractStatus.IN_REVIEW,
    ContractStatus.IN_APPROVAL,
    ContractStatus.REVIEW_APPROVAL,
    ContractStatus.REVIEWED,
    ContractStatus.REJECTED_BY_REVIEWER,
    ContractStatus.REJECTED_BY_APPROVER,
];

const CONTRACT_PAGE_STATUSES: ContractStatus[] = [
    ContractStatus.APPROVED,
    ContractStatus.READY_FOR_SIGNATURE,
    ContractStatus.WAITING_FOR_SIGNATURE,
    ContractStatus.SIGNED_BY_EVERYONE,
    ContractStatus.SIGNED,
    ContractStatus.ACTIVE,
    ContractStatus.EXPIRING,
    ContractStatus.EXPIRED,
];

interface ContractsContentProps {
    basePath?: string;
}

export default function ContractsContent({ basePath = '/contracts' }: ContractsContentProps) {
    const router = useRouter();
    const searchParams = useSearchParams();
    const tTooltips = useTranslations('tooltips');
    const tContracts = useTranslations('contracts');
    const tFilters = useTranslations('filters');

    const statusOptions = [
        { label: tFilters('allStatus'), value: 'all' },
        { label: tFilters('draft'), value: ContractStatus.DRAFT },
        { label: tFilters('underReview'), value: ContractStatus.IN_REVIEW },
        { label: tFilters('underApproval'), value: ContractStatus.IN_APPROVAL },
        { label: tFilters('reviewAndApprove'), value: ContractStatus.REVIEW_APPROVAL },
        { label: tFilters('reviewed'), value: ContractStatus.REVIEWED },
        { label: tFilters('rejectedByReviewer'), value: ContractStatus.REJECTED_BY_REVIEWER },
        { label: tFilters('rejectedByApprover'), value: ContractStatus.REJECTED_BY_APPROVER },
        { label: tFilters('approved'), value: ContractStatus.APPROVED },
        { label: tFilters('readyForSignature'), value: ContractStatus.READY_FOR_SIGNATURE },
        { label: tFilters('waitingForSignature'), value: ContractStatus.WAITING_FOR_SIGNATURE },
        { label: tFilters('signedByAssignedParties'), value: ContractStatus.SIGNED_BY_EVERYONE },
        { label: tFilters('signed'), value: ContractStatus.SIGNED },
        { label: tFilters('active'), value: ContractStatus.ACTIVE },
        { label: tFilters('expiring'), value: ContractStatus.EXPIRING },
        { label: tFilters('expired'), value: ContractStatus.EXPIRED },
        { label: tFilters('terminated'), value: ContractStatus.TERMINATED },
    ];

    const activeTeamId = searchParams.get('team');
    const statusFromUrl = searchParams.get('status');
    const isFlatView = !activeTeamId && statusFromUrl !== null;
    const [teams, setTeams] = useState<Team[]>([]);
    const [teamsLoading, setTeamsLoading] = useState(true);
    const [createTeamOpen, setCreateTeamOpen] = useState(false);
    const [renameTeamOpen, setRenameTeamOpen] = useState(false);
    const [teamToRename, setTeamToRename] = useState<Team | null>(null);

    const [searchQuery, setSearchQuery] = useState('');
    const [statusFilter, setStatusFilter] = useState<FilterOption[]>([statusOptions[0]]);
    const [categoryFilter, setCategoryFilter] = useState<FilterOption[]>([{ label: tFilters('allCategories'), value: 'all' }]);
    const [teamFilterValue, setTeamFilterValue] = useState<FilterOption[]>([{ label: tFilters('allTeams'), value: 'all' }]);
    const [startDate, setStartDate] = useState<Dayjs | null>(null);
    const [endDate, setEndDate] = useState<Dayjs | null>(null);
    const [showAdvancedFilters, setShowAdvancedFilters] = useState(false);
    const [categoryOptions, setCategoryOptions] = useState<FilterOption[]>([{ label: tFilters('allCategories'), value: 'all' }]);
    const [wizardOpen, setWizardOpen] = useState(false);

    const [contracts, setContracts] = useState<Contract[]>([]);
    const [loading, setLoading] = useState(true);

    const [viewerOpen, setViewerOpen] = useState(false);
    const [selectedContract, setSelectedContract] = useState<Contract | null>(null);
    const [viewerData, setViewerData] = useState<{
        fileUrl: string;
        initialXfdf?: string;
        formFields?: any[];
    } | null>(null);

    const [reviewDialogOpen, setReviewDialogOpen] = useState(false);
    const [contractForReview, setContractForReview] = useState<Contract | null>(null);

    const [signatureDialogOpen, setSignatureDialogOpen] = useState(false);
    const [multiPartyDialogOpen, setMultiPartyDialogOpen] = useState(false);
    const [contractForSignature, setContractForSignature] = useState<Contract | null>(null);

    const [renewDialogOpen, setRenewDialogOpen] = useState(false);
    const [contractForRenewal, setContractForRenewal] = useState<Contract | null>(null);
    const [terminateDialogOpen, setTerminateDialogOpen] = useState(false);
    const [contractForTermination, setContractForTermination] = useState<Contract | null>(null);

    const [historyAnchorEl, setHistoryAnchorEl] = useState<HTMLElement | null>(null);
    const [historyContractId, setHistoryContractId] = useState<string | null>(null);
    const [historyDialogEntry, setHistoryDialogEntry] = useState<HistoryEntry | null>(null);
    const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
    const [contractForDeletion, setContractForDeletion] = useState<Contract | null>(null);

    const [snackbar, setSnackbar] = useState({ open: false, message: '', severity: 'success' as AlertColor });
    const showNotification = (message: string, severity: AlertColor = 'success') =>
        setSnackbar({ open: true, message, severity });

    const loadCategories = async () => {
        const categories = await categoryService.getAllCategories();
        setCategoryOptions([
            { label: tFilters('allCategories'), value: 'all' },
            ...categories.map(cat => ({ label: cat.name, value: cat.name })),
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
                const isCreator = c.createdBy === currentUser.email;
                const isSigner = c.signer?.email === currentUser.email;
                const isValidSignerStatus = ['signed', 'active', 'expiring', 'expired'].includes(c.status);

                if (!isCreator && !(isSigner && isValidSignerStatus)) return false;

                if ((c.status === ContractStatus.EXPIRED || c.status === ContractStatus.EXPIRING) && c.renewedContractId) {
                    const renewalStatus = statusById.get(c.renewedContractId);
                    if (renewalStatus && (
                        DRAFT_STATUSES.includes(renewalStatus as ContractStatus) ||
                        CONTRACT_PAGE_STATUSES.includes(renewalStatus as ContractStatus) ||
                        renewalStatus === ContractStatus.TERMINATED
                    )) {
                        return false;
                    }
                }

                if (c.status === ContractStatus.TERMINATED && c.renewedFromId) {
                    const parentStatus = statusById.get(c.renewedFromId);
                    if (parentStatus === ContractStatus.TERMINATED) return false;
                }

                return true;
            });

            setContracts(relevantContracts);
        } catch { setContracts([]); }
        finally { setLoading(false); }
    }, []);

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

    useEffect(() => {
        loadContracts();
        loadTeams();
        loadCategories();
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    useEffect(() => {
        setSearchQuery('');
        setTeamFilterValue([{ label: tFilters('allTeams'), value: 'all' }]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [activeTeamId]);

    const activeTeam = teams.find(t => t._id === activeTeamId) ?? null;

    const statusLabelMap: Record<string, string> = {
        [ContractStatus.ACTIVE]: 'Active Contracts',
        [ContractStatus.EXPIRING]: 'Expiring Soon',
        [ContractStatus.EXPIRED]: 'Expired Contracts',
        [ContractStatus.TERMINATED]: 'Terminated Contracts',
        [ContractStatus.WAITING_FOR_SIGNATURE]: 'Requested Contracts',
        [ContractStatus.SIGNED_BY_EVERYONE]: 'Received Signed',
        [ContractStatus.APPROVED]: 'Approved Contracts',
        [ContractStatus.READY_FOR_SIGNATURE]: 'Ready for Signature',
        [ContractStatus.SIGNED]: 'Signed Contracts',
        [ContractStatus.DRAFT]: 'Draft Contracts',
    };
    const flatViewTitle = statusFromUrl ? (statusLabelMap[statusFromUrl] ?? 'Contracts') : 'Contracts';

    const flatViewBaseContracts = isFlatView && statusFromUrl
        ? contracts.filter(c => c.status === statusFromUrl)
        : contracts;

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

    const teamContracts = activeTeamId
        ? contracts.filter(c => c.teamId === activeTeamId)
        : contracts;

    const filteredContracts = teamContracts.filter(contract => {
        const matchesSearch = searchQuery === '' ||
            contract.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
            (contract.client || '').toLowerCase().includes(searchQuery.toLowerCase());
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

    const contractCountByTeam = (teamId: string) =>
        contracts.filter(c => c.teamId === teamId).length;

    const waitingForSignatureIds = contracts
        .filter(c => c.status === ContractStatus.WAITING_FOR_SIGNATURE)
        .map(c => c.id);

    const handleSignatureComplete = useCallback((contractId: string) => {
        const contract = contracts.find(c => c.id === contractId);
        showNotification(`Contract "${contract?.title || contractId}" has been signed!`, 'success');
        loadContracts();
    }, [contracts]);

    useSignaturePolling(waitingForSignatureIds, handleSignatureComplete, waitingForSignatureIds.length > 0);

    const getCardVariant = (status: ContractStatus) => {
        if (DRAFT_STATUSES.includes(status)) return 'draft' as const;
        if (status === ContractStatus.TERMINATED) return 'terminated' as const;
        return 'contract' as const;
    };

    const handleView = async (id: string) => {
        const contract = contracts.find(c => c.id === id);
        if (!contract) return;

        if (CONTRACT_PAGE_STATUSES.includes(contract.status as ContractStatus)) {
            router.push(`/contracts/${id}`);
            return;
        }

        setSelectedContract(contract);

        let fileUrl = '';
        let initialXfdf: string | undefined;
        let formFields: any[] | undefined;

        if (contract.fileUrl) {
            fileUrl = contract.fileUrl;
            initialXfdf = contract.xfdfData;
            formFields = contract.formFields;
        } else if (contract.fileData) {
            fileUrl = `data:application/pdf;base64,${contract.fileData}`;
            initialXfdf = contract.xfdfData;
            formFields = contract.formFields;
        } else if (contract.signedPdfBase64) {
            fileUrl = `data:application/pdf;base64,${contract.signedPdfBase64}`;
            initialXfdf = contract.xfdfData;
            formFields = contract.formFields;
        } else if (contract.templateId) {
            try {
                const template = await templateService.getTemplateById(contract.templateId);
                if (template) {
                    fileUrl = template.fileData || template.fileUrl || '';
                    initialXfdf = contract.xfdfData || template.xfdfData;
                    formFields = contract.formFields || template.formFields;
                }
            } catch {
                showNotification('Failed to load document template', 'error');
            }
        }

        setViewerData({ fileUrl, initialXfdf, formFields });
        setViewerOpen(true);
    };

    const handleSaveChanges = async (pdfBlob: Blob, xfdfString: string, fieldValues?: Record<string, string>, formFields?: any[]) => {
        if (!selectedContract) return;
        try {
            const arrayBuffer = await pdfBlob.arrayBuffer();
            const bytes = new Uint8Array(arrayBuffer);
            const header = String.fromCharCode(...bytes.slice(0, 5));
            if (!header.startsWith('%PDF-')) {
                showNotification('Failed to save: Invalid PDF data', 'error');
                return;
            }
            let binary = '';
            for (let i = 0; i < bytes.byteLength; i++) binary += String.fromCharCode(bytes[i]);
            const pdfBase64 = btoa(binary);

            const result = await contractService.updateContractSignedPdf(selectedContract.id, pdfBase64, xfdfString);
            if (result.success) {
                const metadataUpdates: Record<string, any> = {};
                if (fieldValues && Object.keys(fieldValues).length > 0) {
                    metadataUpdates.fieldValues = { ...(selectedContract.fieldValues || {}), ...fieldValues };
                }
                if (formFields && formFields.length > 0) {
                    metadataUpdates.formFields = formFields;
                    metadataUpdates.hasFormFields = formFields.length > 0;
                }
                if (Object.keys(metadataUpdates).length > 0) {
                    await apiService.updateContractMetadata(selectedContract.id, metadataUpdates);
                }
                showNotification('Changes saved successfully!', 'success');
            } else {
                showNotification('Failed to save changes: ' + result.message, 'error');
                throw new Error(result.message);
            }
        } catch {
            showNotification('Failed to save changes', 'error');
        }
    };

    const handleShare = (id: string) => {
        const contract = contracts.find(c => c.id === id);
        if (!contract) return;
        setContractForReview(contract);
        setReviewDialogOpen(true);
    };

    const handleSubmitForReview = async (
        newReviewers: string[],
        approver: string,
        reviewerMessage?: string,
        approverMessage?: string,
    ) => {
        if (!contractForReview) return;
        const currentUser = authService.getCurrentUser();
        const result = await contractService.submitForReview(
            contractForReview.id, newReviewers, approver, reviewerMessage, approverMessage, currentUser?.email,
        );
        if (result.success) {
            showNotification(result.message, 'success');
            loadContracts();
        } else {
            showNotification('Failed to submit: ' + result.message, 'error');
            throw new Error(result.message);
        }
    };

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
                showNotification('Send successfully', 'success');
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

    const handleTerminateContract = (id: string) => {
        const contract = contracts.find(c => c.id === id);
        if (!contract) return;
        setContractForTermination(contract);
        setTerminateDialogOpen(true);
    };

    const handleHistory = (id: string, event: React.MouseEvent<HTMLButtonElement>) => {
        setHistoryContractId(id);
        setHistoryAnchorEl(event.currentTarget);
    };

    const handleDeleteContract = (id: string) => {
        const c = contracts.find(x => x.id === id) || null;
        setContractForDeletion(c);
        setDeleteDialogOpen(true);
    };

    const handleTeamClick = (teamId: string) => router.push(`${basePath}?team=${teamId}`);

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

    return (
        <LocalizationProvider dateAdapter={AdapterDayjs}>
            <Box sx={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
                {/* Header */}
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
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75 }}>
                        {(activeTeamId || isFlatView) && (
                            <Tooltip title={isFlatView ? 'Back to Contracts' : 'Back to Teams'} arrow>
                                <IconButton
                                    size="small"
                                    onClick={() => router.push(basePath)}
                                    sx={{
                                        color: 'text.secondary',
                                        p: 0.25,
                                        '&:hover': { color: 'primary.main', bgcolor: 'action.hover' },
                                    }}
                                >
                                    <ArrowBackIcon sx={{ fontSize: 16 }} />
                                </IconButton>
                            </Tooltip>
                        )}

                        <Typography variant="h5">
                            {activeTeam ? activeTeam.name : isFlatView ? flatViewTitle : tContracts('title')}
                        </Typography>

                        {activeTeamId ? (
                            <>
                                <Box sx={{ width: 5, height: 5, borderRadius: '50%', bgcolor: 'text.disabled', flexShrink: 0 }} />
                                <Typography
                                    sx={{ color: 'text.secondary', fontSize: '0.78rem', cursor: 'pointer', '&:hover': { color: 'primary.main' } }}
                                    onClick={() => router.push(basePath)}
                                >
                                    {tContracts('title')}
                                </Typography>
                                <Typography sx={{ color: 'text.disabled', fontSize: '0.78rem' }}>/</Typography>
                                <FolderIcon sx={{ fontSize: 12, color: 'primary.main' }} />
                                <Typography sx={{ color: 'text.secondary', fontSize: '0.78rem' }}>
                                    {activeTeam?.name}
                                </Typography>
                                <Chip
                                    label={`${filteredContracts.length} contract${filteredContracts.length !== 1 ? 's' : ''}`}
                                    size="small"
                                    sx={{ height: 16, fontSize: '0.6rem', bgcolor: (theme) => `${theme.palette.primary.main}14`, color: 'primary.main' }}
                                />
                            </>
                        ) : isFlatView ? (
                            <>
                                <Box sx={{ width: 5, height: 5, borderRadius: '50%', bgcolor: 'text.disabled', flexShrink: 0 }} />
                                <Typography
                                    sx={{ color: 'text.secondary', fontSize: '0.78rem', cursor: 'pointer', '&:hover': { color: 'primary.main' } }}
                                    onClick={() => router.push(basePath)}
                                >
                                    {tContracts('title')}
                                </Typography>
                                <Typography sx={{ color: 'text.disabled', fontSize: '0.78rem' }}>/</Typography>
                                <Typography sx={{ color: 'text.secondary', fontSize: '0.78rem' }}>
                                    {flatViewTitle}
                                </Typography>
                                <Chip
                                    label={`${filteredContracts.length} contract${filteredContracts.length !== 1 ? 's' : ''}`}
                                    size="small"
                                    sx={{ height: 16, fontSize: '0.6rem', bgcolor: (theme) => `${theme.palette.primary.main}14`, color: 'primary.main' }}
                                />
                            </>
                        ) : (
                            <>
                                <Box sx={{ width: 5, height: 5, borderRadius: '50%', bgcolor: 'text.disabled', flexShrink: 0 }} />
                                <Typography sx={{ color: 'text.secondary', fontSize: '0.78rem' }}>
                                    {tContracts('description')}
                                </Typography>
                            </>
                        )}
                    </Box>

                    {!isFlatView && (
                        <Tooltip title={activeTeamId ? tTooltips('createContract') : tTooltips('createTeam')} arrow>
                            <IconButton
                                onClick={() => activeTeamId ? setWizardOpen(true) : setCreateTeamOpen(true)}
                                size="small"
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
                                {activeTeamId ? <NoteAddIcon sx={{ fontSize: '20px' }} /> : <CreateNewFolderIcon sx={{ fontSize: '20px' }} />}
                            </IconButton>
                        </Tooltip>
                    )}
                </Box>

                {/* Filter */}
                <CompactFilter
                    searchQuery={searchQuery}
                    onSearchChange={setSearchQuery}
                    searchPlaceholder={activeTeamId || isFlatView ? tFilters('searchContracts') : tFilters('searchTeams')}
                    filters={activeTeamId || isFlatView ? [
                        {
                            label: tFilters('status'),
                            value: statusFilter,
                            onChange: (newValue) => setStatusFilter(newValue || [statusOptions[0]]),
                            options: statusOptions,
                            multiple: true,
                            disabled: isFlatView && !!statusFromUrl && statusFromUrl !== 'all' && !statusFromUrl.includes(','),
                        },
                        {
                            label: tFilters('category'),
                            value: categoryFilter,
                            onChange: (newValue) => setCategoryFilter(newValue || [{ label: tFilters('allCategories'), value: 'all' }]),
                            options: categoryOptions,
                            multiple: true,
                        },
                    ] : [
                        {
                            label: tFilters('team'),
                            value: teamFilterValue,
                            onChange: (newValue) => setTeamFilterValue(newValue || [{ label: tFilters('allTeams'), value: 'all' }]),
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
                    countLabel={activeTeamId || isFlatView ? tFilters('countContracts') : tFilters('countTeams')}
                    hasActiveFilters={
                        (activeTeamId || isFlatView)
                            ? (searchQuery !== '' || (!(isFlatView && statusFromUrl && statusFromUrl !== 'all' && !statusFromUrl.includes(',')) && statusFilter.every(f => f.value !== 'all')) || categoryFilter.every(f => f.value !== 'all') || startDate !== null || endDate !== null)
                            : (searchQuery !== '' || teamFilterValue.every(f => f.value !== 'all') || startDate !== null || endDate !== null)
                    }
                    onClearFilters={() => {
                        setSearchQuery('');
                        if (isFlatView && statusFromUrl && !statusFromUrl.includes(',')) {
                            const found = statusOptions.find(opt => opt.value === statusFromUrl);
                            setStatusFilter(found ? [found] : [statusOptions[0]]);
                        } else {
                            setStatusFilter([statusOptions[0]]);
                        }
                        setCategoryFilter([{ label: tFilters('allCategories'), value: 'all' }]);
                        setTeamFilterValue([{ label: tFilters('allTeams'), value: 'all' }]);
                        setStartDate(null);
                        setEndDate(null);
                        setShowAdvancedFilters(false);
                    }}
                />

                {/* Grid */}
                <Box sx={{ flex: 1, overflowY: 'auto', minHeight: 0, p: 1 }}>
                    <Box sx={{
                        display: 'grid',
                        gridTemplateColumns: { xs: '1fr', sm: 'repeat(2, 1fr)', lg: 'repeat(4, 1fr)' },
                        gap: 1,
                    }}>
                        {isFlatView ? (
                            loading ? (
                                <ShimmerCardGrid count={8} variant="contract" />
                            ) : filteredContracts.length === 0 ? (
                                <Box sx={{ gridColumn: '1 / -1' }}>
                                    <EmptyState
                                        icon={<FolderIcon />}
                                        title="No contracts found"
                                        description="Try adjusting your filters."
                                        sx={{ minHeight: '55vh' }}
                                    />
                                </Box>
                            ) : (
                                filteredContracts.map(contract => {
                                    const cardVariant = getCardVariant(contract.status as ContractStatus);
                                    return (
                                        <ContractCard
                                            key={contract.id}
                                            variant={cardVariant}
                                            contract={contract}
                                            onView={cardVariant !== 'terminated' ? handleView : undefined}
                                            onShare={cardVariant === 'draft' ? handleShare : cardVariant === 'contract' ? handleShareContract : undefined}
                                            onRenew={cardVariant === 'contract' ? handleRenewContract : undefined}
                                            onTerminate={cardVariant === 'contract' ? handleTerminateContract : undefined}
                                            onHistory={cardVariant === 'terminated' || contract.renewedFromId || contract.renewedContractId ? handleHistory : undefined}
                                            onDelete={cardVariant === 'terminated' ? handleDeleteContract : undefined}
                                        />
                                    );
                                })
                            )
                        ) : activeTeamId ? (
                            loading ? (
                                <ShimmerCardGrid count={8} variant="contract" />
                            ) : filteredContracts.length === 0 ? (
                                <Box sx={{ gridColumn: '1 / -1' }}>
                                    <EmptyState
                                        icon={<FolderIcon />}
                                        title="No contracts in this team yet"
                                        description="Click the + button in the top right to create one."
                                        sx={{ minHeight: '55vh' }}
                                    />
                                </Box>
                            ) : (
                                filteredContracts.map(contract => {
                                    const cardVariant = getCardVariant(contract.status as ContractStatus);
                                    return (
                                        <ContractCard
                                            key={contract.id}
                                            variant={cardVariant}
                                            contract={contract}
                                            onView={cardVariant !== 'terminated' ? handleView : undefined}
                                            onShare={cardVariant === 'draft' ? handleShare : cardVariant === 'contract' ? handleShareContract : undefined}
                                            onRenew={cardVariant === 'contract' ? handleRenewContract : undefined}
                                            onTerminate={cardVariant === 'contract' ? handleTerminateContract : undefined}
                                            onHistory={cardVariant === 'terminated' || contract.renewedFromId || contract.renewedContractId ? handleHistory : undefined}
                                            onDelete={cardVariant === 'terminated' ? handleDeleteContract : undefined}
                                        />
                                    );
                                })
                            )
                        ) : (
                            teamsLoading ? (
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

            {selectedContract && viewerData && (
                <DocumentViewerDialog
                    open={viewerOpen}
                    onClose={() => {
                        setViewerOpen(false);
                        setSelectedContract(null);
                        setViewerData(null);
                        loadContracts();
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

            {contractForReview && (
                <RequestReviewDialog
                    open={reviewDialogOpen}
                    onClose={() => { setReviewDialogOpen(false); setContractForReview(null); }}
                    contractId={contractForReview.id}
                    contractTitle={contractForReview.title}
                    onSubmit={handleSubmitForReview}
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
                    onSuccess={() => {
                        showNotification('Contract renewed successfully!', 'success');
                        loadContracts();
                    }}
                />
            )}

            {contractForTermination && (
                <TerminateContractDialog
                    open={terminateDialogOpen}
                    onClose={() => { setTerminateDialogOpen(false); setContractForTermination(null); }}
                    contractId={contractForTermination.id}
                    contractTitle={contractForTermination.title.replace(/\s*\(Renewal\d*\)$/i, '')}
                    onSuccess={() => {
                        setTerminateDialogOpen(false);
                        setContractForTermination(null);
                        showNotification('Contract has been terminated.', 'success');
                        loadContracts();
                    }}
                />
            )}

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

            <DeleteContractDialog
                open={deleteDialogOpen}
                onClose={() => { setDeleteDialogOpen(false); setContractForDeletion(null); }}
                contractId={contractForDeletion?.id || ''}
                contractTitle={contractForDeletion?.title?.replace(/\s*\(Renewal\d*\)$/i, '') || ''}
                onSuccess={loadContracts}
            />

            <NotificationSnackbar
                open={snackbar.open}
                message={snackbar.message}
                severity={snackbar.severity}
                onClose={() => setSnackbar({ ...snackbar, open: false })}
            />
        </LocalizationProvider>
    );
}
