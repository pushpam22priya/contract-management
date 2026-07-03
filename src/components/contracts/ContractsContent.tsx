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
import EditContractDialog from '@/components/contracts/EditContractDialog';
import RenewContractDialog from '@/components/contracts/RenewContractDialog';
import TerminateContractDialog from '@/components/contracts/TerminateContractDialog';
import RequestReviewDialog from '@/components/contracts/RequestReviewDialog';
import UnifiedFlowSubmitDialog from '@/components/unified-flow/UnifiedFlowSubmitDialog';
import ContractHistoryPanel from '@/components/contracts/ContractHistoryPanel';
import ContractHistoryDialog from '@/components/contracts/ContractHistoryDialog';
import DeleteContractDialog from '@/components/contracts/DeleteContractDialog';
import { contractService } from '@/services/contractService';
import { Contract, ContractStatus, SignerAssignment, WorkflowMode } from '@/types/contract';
import DocumentViewerDialog from '@/components/viewer/DocumentViewerDialog';
import { authService } from '@/services/authService';
import SubmitForSignatureDialog from '@/components/contracts/SubmitForSignatureDialog';
import MultiPartySignatureDialog from '@/components/contracts/MultiPartySignatureDialog';
import NotificationSnackbar from '@/components/common/NotificationSnackbar';
import { submitForSignature, finalizeContract } from '@/services/externalSignatureService';
import { AlertColor } from '@mui/material';
import { templateService } from '@/services/templateService';
import { categoryService } from '@/services/categoryService';
import { apiService } from '@/services/apiService';
import CompactFilter, { FilterOption } from '@/components/common/CompactFilter';
import { useSignaturePolling } from '@/hooks/useSignaturePolling';
import { ShimmerCardGrid } from '@/components/common/ShimmerCard';
import FolderCard from '@/components/folders/FolderCard';
import CreateFolderDialog from '@/components/folders/CreateFolderDialog';
import RenameFolderDialog from '@/components/folders/RenameFolderDialog';
import ConfirmationDialog from '@/components/common/ConfirmationDialog';
import { Folder } from '@/types/folder';
import { httpClient } from '@/lib/httpClient';
import { useTranslations } from 'next-intl';
import type { HistoryEntry } from '@/components/contracts/ContractHistoryPanel';

const DRAFT_STATUSES: ContractStatus[] = [
    ContractStatus.DRAFT,
    ContractStatus.IN_REVIEW,
    ContractStatus.IN_APPROVAL,
    ContractStatus.REJECTED_BY_REVIEWER,
    ContractStatus.REJECTED_BY_APPROVER,
];

const CONTRACT_PAGE_STATUSES: ContractStatus[] = [
    ContractStatus.READY_FOR_SIGNATURE,
    ContractStatus.IN_SIGNATURE,
    ContractStatus.SIGNED_BY_EVERYONE,
    ContractStatus.SIGNED,
    ContractStatus.ACTIVE,
    ContractStatus.EXPIRING,
    ContractStatus.EXPIRED,
];

export default function ContractsContent() {
    const basePath = '/overview';
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
        { label: tFilters('rejectedByReviewer'), value: ContractStatus.REJECTED_BY_REVIEWER },
        { label: tFilters('rejectedByApprover'), value: ContractStatus.REJECTED_BY_APPROVER },
        { label: tFilters('readyForSignature'), value: ContractStatus.READY_FOR_SIGNATURE },
        { label: tFilters('inSignature'), value: ContractStatus.IN_SIGNATURE },
        { label: tFilters('signedByAssignedParties'), value: ContractStatus.SIGNED_BY_EVERYONE },
        { label: tFilters('signed'), value: ContractStatus.SIGNED },
        { label: tFilters('active'), value: ContractStatus.ACTIVE },
        { label: tFilters('expiring'), value: ContractStatus.EXPIRING },
        { label: tFilters('expired'), value: ContractStatus.EXPIRED },
        { label: tFilters('terminated'), value: ContractStatus.TERMINATED },
    ];

    const activeFolderId = searchParams.get('folder');
    const statusFromUrl = searchParams.get('status');
    const isFlatView = !activeFolderId && statusFromUrl !== null;
    const [folders, setFolders] = useState<Folder[]>([]);
    const [foldersLoading, setFoldersLoading] = useState(true);
    const [createFolderOpen, setCreateFolderOpen] = useState(false);
    const [renameFolderOpen, setRenameFolderOpen] = useState(false);
    const [folderToRename, setFolderToRename] = useState<Folder | null>(null);
    const [deleteFolderOpen, setDeleteFolderOpen] = useState(false);
    const [folderToDelete, setFolderToDelete] = useState<Folder | null>(null);
    const [deletingFolder, setDeletingFolder] = useState(false);

    const [searchQuery, setSearchQuery] = useState('');
    const [statusFilter, setStatusFilter] = useState<FilterOption[]>([statusOptions[0]]);
    const [categoryFilter, setCategoryFilter] = useState<FilterOption[]>([{ label: tFilters('allCategories'), value: 'all' }]);
    const [folderFilterValue, setFolderFilterValue] = useState<FilterOption[]>([{ label: tFilters('allFolders'), value: 'all' }]);
    const [startDate, setStartDate] = useState<Dayjs | null>(null);
    const [endDate, setEndDate] = useState<Dayjs | null>(null);
    const [showAdvancedFilters, setShowAdvancedFilters] = useState(false);
    const [categoryOptions, setCategoryOptions] = useState<FilterOption[]>([{ label: tFilters('allCategories'), value: 'all' }]);
    const [wizardOpen, setWizardOpen] = useState(false);
    const [editDialogOpen, setEditDialogOpen] = useState(false);
    const [contractForEdit, setContractForEdit] = useState<Contract | null>(null);

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

    const [unifiedSubmitOpen, setUnifiedSubmitOpen] = useState(false);
    const [contractForUnifiedSubmit, setContractForUnifiedSubmit] = useState<Contract | null>(null);

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

    const loadFolders = useCallback(async () => {
        setFoldersLoading(true);
        // Backend derives the user from the JWT token — no query params needed
        const response = await httpClient.get<Folder[]>('/folders');
        if (response.ok && Array.isArray(response.data)) {
            setFolders(response.data);
        }
        setFoldersLoading(false);
    }, []);

    const loadContracts = useCallback(async () => {
        setLoading(true);

        try {
            const allContracts = await contractService.getAllContracts();
            if (!Array.isArray(allContracts)) { setContracts([]); setLoading(false); return; }

            const statusById = new Map(allContracts.map(c => [c.id, c.status]));

            // Spring Boot already filters contracts server-side by JWT — all returned
            // contracts belong to the current user. We only apply renewal/termination
            // chain filters here to hide superseded contracts from the list.
            const relevantContracts = allContracts.filter(c => {
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
        loadFolders();
        loadCategories();
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    useEffect(() => {
        setSearchQuery('');
        setFolderFilterValue([{ label: tFilters('allFolders'), value: 'all' }]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [activeFolderId]);

    const activeFolder = folders.find(f => f.id === activeFolderId) ?? null;

    const statusLabelMap: Record<string, string> = {
        [ContractStatus.ACTIVE]: 'Active Contracts',
        [ContractStatus.EXPIRING]: 'Expiring Soon',
        [ContractStatus.EXPIRED]: 'Expired Contracts',
        [ContractStatus.TERMINATED]: 'Terminated Contracts',
        [ContractStatus.IN_SIGNATURE]: 'Requested Contracts',
        [ContractStatus.SIGNED_BY_EVERYONE]: 'Received Signed',
        [ContractStatus.READY_FOR_SIGNATURE]: 'Ready for Signature',
        [ContractStatus.SIGNED]: 'Signed Contracts',
        [ContractStatus.DRAFT]: 'Draft Contracts',
    };
    const flatViewTitle = statusFromUrl ? (statusLabelMap[statusFromUrl] ?? 'Contracts') : 'Contracts';

    const flatViewBaseContracts = isFlatView && statusFromUrl
        ? contracts.filter(c => c.status === statusFromUrl)
        : contracts;

    const folderFilterOptions: FilterOption[] = [
        { label: tFilters('allFolders'), value: 'all' },
        ...folders.map(f => ({ label: f.name, value: f.id })),
    ];

    const filteredFolders = folders.filter(f => {
        const matchesSearch = searchQuery === '' || f.name.toLowerCase().includes(searchQuery.toLowerCase());
        const matchesFilter = folderFilterValue.some(fv => fv.value === 'all') || folderFilterValue.some(fv => fv.value === f.id);
        let matchesDate = true;
        if (startDate || endDate) {
            const d = dayjs(f.createdAt);
            if (startDate && d.isBefore(startDate, 'day')) matchesDate = false;
            if (endDate && d.isAfter(endDate, 'day')) matchesDate = false;
        }
        return matchesSearch && matchesFilter && matchesDate;
    });

    const folderContracts = activeFolderId
        ? contracts.filter(c => c.folderId === activeFolderId)
        : contracts;

    const filteredContracts = folderContracts.filter(contract => {
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

    const contractCountByFolder = (folderId: string) =>
        contracts.filter(c => c.folderId === folderId).length;

    const waitingForSignatureIds = contracts
        .filter(c => c.status === ContractStatus.IN_SIGNATURE)
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

        // ── Primary path: contract file is in MinIO (Spring Boot integration) ──
        // fileUploaded is set to true by the backend after a successful upload.
        // The presigned URL is valid for 15 minutes and passed directly to
        // Apryse WebViewer — no Authorization header required on that URL.
        if (contract.fileUploaded) {
            console.log(`[handleView] id="${id}" | fileUploaded=true → fetching MinIO presigned URL`);
            const viewUrl = await apiService.getContractViewUrl(id);
            if (viewUrl) {
                fileUrl     = viewUrl;
                initialXfdf = contract.xfdfData;
                formFields  = contract.formFields;
                console.log(`[handleView] ✓ MinIO presigned URL ready for id="${id}"`);
            } else {
                console.warn(`[handleView] ⚠ Could not get MinIO URL for id="${id}" — falling through to legacy paths`);
            }
        }

        // ── Legacy fallback paths (contracts created before MinIO migration) ──
        if (!fileUrl) {
            if (contract.fileUrl) {
                console.log(`[handleView] id="${id}" | using contract.fileUrl`);
                fileUrl     = contract.fileUrl;
                initialXfdf = contract.xfdfData;
                formFields  = contract.formFields;
            } else if (contract.fileData) {
                console.log(`[handleView] id="${id}" | using contract.fileData (base64)`);
                fileUrl     = `data:application/pdf;base64,${contract.fileData}`;
                initialXfdf = contract.xfdfData;
                formFields  = contract.formFields;
            } else if (contract.signedPdfBase64) {
                console.log(`[handleView] id="${id}" | using contract.signedPdfBase64`);
                fileUrl     = `data:application/pdf;base64,${contract.signedPdfBase64}`;
                initialXfdf = contract.xfdfData;
                formFields  = contract.formFields;
            } else if (contract.templateId) {
                console.log(`[handleView] id="${id}" | loading from templateId="${contract.templateId}"`);
                try {
                    const template = await templateService.getTemplateById(contract.templateId);
                    if (template) {
                        fileUrl     = template.fileData || template.fileUrl || '';
                        initialXfdf = contract.xfdfData || template.xfdfData;
                        formFields  = contract.formFields || template.formFields;
                        console.log(`[handleView] ✓ Template loaded for id="${id}"`);
                    }
                } catch {
                    showNotification('Failed to load document template', 'error');
                }
            }
        }

        if (!fileUrl) {
            console.warn(`[handleView] ⚠ No file source found for contract id="${id}"`);
        }

        // fileUrl is passed to DocumentViewerDialog → PDFViewerContainer as documentUrl.
        // All Apryse/WebViewer logic is unchanged.
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
                // fieldValues and formFields are document-level fields — must go to
                // Spring Boot PATCH, not the internal Next.js route, because the contract
                // was created by Spring Boot and the internal route returns 404 for it.
                const docUpdates: Record<string, any> = {};
                if (fieldValues && Object.keys(fieldValues).length > 0) {
                    docUpdates.fieldValues = { ...(selectedContract.fieldValues || {}), ...fieldValues };
                }
                if (formFields && formFields.length > 0) {
                    docUpdates.formFields = formFields;
                    docUpdates.hasFormFields = formFields.length > 0;
                }
                if (Object.keys(docUpdates).length > 0) {
                    console.log(`[handleSaveChanges] updating document fields via Spring Boot | id="${selectedContract.id}" | fields=[${Object.keys(docUpdates).join(', ')}]`);
                    await apiService.updateContractDocument(selectedContract.id, docUpdates);
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

    const handleEdit = (id: string) => {
        const contract = contracts.find(c => c.id === id);
        if (!contract) return;
        setContractForEdit(contract);
        setEditDialogOpen(true);
    };

    const handleShare = (id: string) => {
        const contract = contracts.find(c => c.id === id);
        if (!contract) return;
        setContractForReview(contract);
        setReviewDialogOpen(true);
    };

    const handleSubmitForReview = async (
        mode: WorkflowMode,
        newReviewers: string[],
        approver: string,
        reviewerMessage?: string,
        approverMessage?: string,
    ) => {
        if (!contractForReview) return;
        const result = await contractService.submitForWorkflow(
            contractForReview.id, mode, newReviewers, approver, reviewerMessage, approverMessage,
        );
        if (result.success) {
            showNotification(result.message, 'success');
            loadContracts();
        } else {
            showNotification('Failed to submit: ' + result.message, 'error');
            throw new Error(result.message);
        }
    };

    const handleShareContract = async (id: string) => {
        // The list endpoint omits formFields and parties for performance.
        // Fetch the full contract so the dialog has everything it needs.
        const full = await apiService.getContractDetails(id);
        const contract = (full as any) ?? contracts.find(c => c.id === id);
        if (!contract) return;
        setContractForSignature(contract);
        setMultiPartyDialogOpen(true);
    };

    // Unified flow entry points — replace the legacy share handlers visually;
    // the original handleShare / handleShareContract remain intact below for easy rollback.
    const handleUnifiedShare = (id: string) => {
        const contract = contracts.find(c => c.id === id);
        if (!contract) return;
        if ((contract.participants?.length ?? 0) > 0) {
            router.push(`/contracts/${id}`);
            return;
        }
        setContractForUnifiedSubmit(contract);
        setUnifiedSubmitOpen(true);
    };

    const handleUnifiedShareContract = async (id: string) => {
        const full = await apiService.getContractDetails(id);
        const contract = (full as any) ?? contracts.find(c => c.id === id);
        if (!contract) return;
        if ((contract.participants?.length ?? 0) > 0) {
            router.push(`/contracts/${id}`);
            return;
        }
        setContractForSignature(contract);
        setMultiPartyDialogOpen(true);
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
            const result = await submitForSignature(contractForSignature.id, assignments, senderName);
            if (result.success) {
                showNotification('Send successfully', 'success');
                loadContracts();
                if (result.contract) setContractForSignature(result.contract);
                return { success: true };
            }
            showNotification(result.message || 'Failed to create assignments', 'error');
            return { success: false, error: result.message };
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

    const handleFinalize = async (id: string) => {
        try {
            const result = await finalizeContract(id);
            if (result.success) {
                showNotification('Contract finalized successfully!', 'success');
                loadContracts();
            } else {
                showNotification(result.message || 'Failed to finalize contract', 'error');
            }
        } catch {
            showNotification('Failed to finalize contract', 'error');
        }
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

    const handleFolderClick = (folderId: string) => router.push(`${basePath}?folder=${folderId}`);

    const handleRenameFolder = (folder: Folder) => {
        setFolderToRename(folder);
        setRenameFolderOpen(true);
    };

    const handleFolderRenamed = (updated: Folder) => {
        setFolders(prev => prev.map(f => f.id === updated.id ? updated : f));
        showNotification(`Folder renamed to "${updated.name}"`, 'success');
    };

    const handleFolderCreated = (folder: Folder) => {
        setFolders(prev => [folder, ...prev]);
        showNotification(`Folder "${folder.name}" created`, 'success');
    };

    const handleDeleteFolderClick = (folder: Folder) => {
        setFolderToDelete(folder);
        setDeleteFolderOpen(true);
    };

    const handleConfirmDeleteFolder = async () => {
        if (!folderToDelete) return;
        setDeletingFolder(true);
        const response = await httpClient.delete(`/folders/${folderToDelete.id}`);
        setDeletingFolder(false);
        if (response.ok || response.status === 204) {
            setFolders(prev => prev.filter(f => f.id !== folderToDelete.id));
            showNotification(`Folder "${folderToDelete.name}" deleted`, 'success');
        } else {
            showNotification(response.message || 'Failed to delete folder', 'error');
        }
        setDeleteFolderOpen(false);
        setFolderToDelete(null);
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
                        {(activeFolderId || isFlatView) && (
                            <Tooltip title={isFlatView ? 'Back to Contracts' : 'Back to Folders'} arrow>
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
                            {activeFolder ? activeFolder.name : isFlatView ? flatViewTitle : tContracts('title')}
                        </Typography>

                        {activeFolderId ? (
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
                                    {activeFolder?.name}
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
                        <Tooltip title={activeFolderId ? tTooltips('createContract') : tTooltips('createFolder')} arrow>
                            <IconButton
                                onClick={() => activeFolderId ? setWizardOpen(true) : setCreateFolderOpen(true)}
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
                                {activeFolderId ? <NoteAddIcon sx={{ fontSize: '20px' }} /> : <CreateNewFolderIcon sx={{ fontSize: '20px' }} />}
                            </IconButton>
                        </Tooltip>
                    )}
                </Box>

                {/* Filter */}
                <CompactFilter
                    searchQuery={searchQuery}
                    onSearchChange={setSearchQuery}
                    searchPlaceholder={activeFolderId || isFlatView ? tFilters('searchContracts') : tFilters('searchFolders')}
                    filters={activeFolderId || isFlatView ? [
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
                            label: tFilters('folder'),
                            value: folderFilterValue,
                            onChange: (newValue) => setFolderFilterValue(newValue || [{ label: tFilters('allFolders'), value: 'all' }]),
                            options: folderFilterOptions,
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
                    dateFilterTitle={activeFolderId || isFlatView ? 'Filter by Contract Date Range' : 'Filter by Folder Creation Date'}
                    filteredCount={activeFolderId || isFlatView ? filteredContracts.length : filteredFolders.length}
                    totalCount={activeFolderId ? folderContracts.length : isFlatView ? flatViewBaseContracts.length : folders.length}
                    countLabel={activeFolderId || isFlatView ? tFilters('countContracts') : tFilters('countFolders')}
                    hasActiveFilters={
                        (activeFolderId || isFlatView)
                            ? (searchQuery !== '' || (!(isFlatView && statusFromUrl && statusFromUrl !== 'all' && !statusFromUrl.includes(',')) && statusFilter.every(f => f.value !== 'all')) || categoryFilter.every(f => f.value !== 'all') || startDate !== null || endDate !== null)
                            : (searchQuery !== '' || folderFilterValue.every(f => f.value !== 'all') || startDate !== null || endDate !== null)
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
                        setFolderFilterValue([{ label: tFilters('allFolders'), value: 'all' }]);
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
                        {isFlatView ? (                            loading ? (
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
                                            onEdit={cardVariant === 'draft' ? handleEdit : undefined}
                                            onShare={cardVariant === 'draft' ? handleUnifiedShare : cardVariant === 'contract' ? handleUnifiedShareContract : undefined}
                                            onRenew={cardVariant === 'contract' ? handleRenewContract : undefined}
                                            onTerminate={cardVariant === 'contract' ? handleTerminateContract : undefined}
                                            onFinalize={cardVariant === 'contract' ? handleFinalize : undefined}
                                            onHistory={cardVariant === 'terminated' || contract.renewedFromId || contract.renewedContractId ? handleHistory : undefined}
                                            onDelete={cardVariant === 'terminated' ? handleDeleteContract : undefined}
                                        />
                                    );
                                })
                            )
                        ) : activeFolderId ? (
                            loading ? (
                                <ShimmerCardGrid count={8} variant="contract" />
                            ) : filteredContracts.length === 0 ? (
                                <Box sx={{ gridColumn: '1 / -1' }}>
                                    <EmptyState
                                        icon={<FolderIcon />}
                                        title="No contracts in this folder yet"
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
                                            onEdit={cardVariant === 'draft' ? handleEdit : undefined}
                                            onShare={cardVariant === 'draft' ? handleUnifiedShare : cardVariant === 'contract' ? handleUnifiedShareContract : undefined}
                                            onRenew={cardVariant === 'contract' ? handleRenewContract : undefined}
                                            onTerminate={cardVariant === 'contract' ? handleTerminateContract : undefined}
                                            onFinalize={cardVariant === 'contract' ? handleFinalize : undefined}
                                            onHistory={cardVariant === 'terminated' || contract.renewedFromId || contract.renewedContractId ? handleHistory : undefined}
                                            onDelete={cardVariant === 'terminated' ? handleDeleteContract : undefined}
                                        />
                                    );
                                })
                            )
                        ) : (
                            foldersLoading ? (
                                <ShimmerCardGrid count={6} variant="contract" />
                            ) : folders.length === 0 ? (
                                <Box sx={{ gridColumn: '1 / -1' }}>
                                    <EmptyState
                                        icon={<FolderIcon />}
                                        title="No folders yet"
                                        description="Organize your contracts by creating a folder."
                                        action={{
                                            label: 'Create your first folder',
                                            onClick: () => setCreateFolderOpen(true),
                                            startIcon: <CreateNewFolderIcon />,
                                            variant: 'outlined',
                                        }}
                                        sx={{ minHeight: '55vh' }}
                                    />
                                </Box>
                            ) : filteredFolders.length === 0 ? (
                                <Box sx={{ gridColumn: '1 / -1' }}>
                                    <EmptyState
                                        icon={<FolderIcon />}
                                        title="No folders match your search."
                                        sx={{ minHeight: '55vh' }}
                                    />
                                </Box>
                            ) : (
                                filteredFolders.map(folder => (
                                    <FolderCard
                                        key={folder.id}
                                        folder={folder}
                                        contractCount={contractCountByFolder(folder.id)}
                                        onClick={handleFolderClick}
                                        onRename={handleRenameFolder}
                                        onDelete={handleDeleteFolderClick}
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
                folderId={activeFolderId}
            />

            {contractForEdit && (
                <EditContractDialog
                    open={editDialogOpen}
                    onClose={() => { setEditDialogOpen(false); setContractForEdit(null); }}
                    onSuccess={loadContracts}
                    contract={contractForEdit}
                />
            )}

            <CreateFolderDialog
                open={createFolderOpen}
                onClose={() => setCreateFolderOpen(false)}
                onCreated={handleFolderCreated}
            />

            <RenameFolderDialog
                open={renameFolderOpen}
                folder={folderToRename}
                onClose={() => setRenameFolderOpen(false)}
                onRenamed={handleFolderRenamed}
            />

            <ConfirmationDialog
                open={deleteFolderOpen}
                title="Delete Folder"
                message={`Are you sure you want to delete "${folderToDelete?.name}"? This action cannot be undone.`}
                onYes={handleConfirmDeleteFolder}
                onNo={() => { setDeleteFolderOpen(false); setFolderToDelete(null); }}
                onClose={() => { setDeleteFolderOpen(false); setFolderToDelete(null); }}
                loading={deletingFolder}
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

            {contractForUnifiedSubmit && (
                <UnifiedFlowSubmitDialog
                    open={unifiedSubmitOpen}
                    onClose={() => { setUnifiedSubmitOpen(false); setContractForUnifiedSubmit(null); }}
                    onSubmitted={() => { setUnifiedSubmitOpen(false); setContractForUnifiedSubmit(null); loadContracts(); }}
                    contractId={contractForUnifiedSubmit.id}
                    contractTitle={contractForUnifiedSubmit.title}
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
                formFields={contractForSignature?.formFields ?? []}
                existingExternalSigners={contractForSignature?.externalSigners ?? []}
                existingInternalSigners={contractForSignature?.internalSigners ?? []}
                fieldValues={contractForSignature?.fieldValues ?? {}}
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
