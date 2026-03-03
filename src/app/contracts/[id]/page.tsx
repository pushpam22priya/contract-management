'use client';

import { use, useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import {
    Box,
    Typography,
    IconButton,
    Tooltip,
    Chip,
    Fade,
    Button,
    Paper,
    Alert,
    CircularProgress,
    Divider,
} from '@mui/material';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import EditOutlinedIcon from '@mui/icons-material/EditOutlined';
import FileDownloadOutlinedIcon from '@mui/icons-material/FileDownloadOutlined';
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import HourglassEmptyIcon from '@mui/icons-material/HourglassEmpty';
import SendIcon from '@mui/icons-material/Send';
import DoneAllIcon from '@mui/icons-material/DoneAll';
import PersonIcon from '@mui/icons-material/Person';
import EmailIcon from '@mui/icons-material/Email';
import AppLayout from '@/components/layout/AppLayout';
import ContractInformation from '@/components/contracts/ContractInformation';
import ContractDetailsPanel from '@/components/contracts/ContractDetailsPanel';
import { contractService } from '@/services/contractService';
import { apiService } from '@/services/apiService';
import { templateService } from '@/services/templateService';
import { sendFinalizedContractEmails } from '@/services/externalSignatureService';
import { authService } from '@/services/authService';
import DocumentViewerDialog from '@/components/viewer/DocumentViewerDialog';
import { Document } from '@/components/contracts/ContractDetailsPanel';
import { useContractPolling } from '@/hooks/useContractPolling';
import { ContractDetailShimmer } from '@/components/common/ShimmerCard';

export default function ContractViewPage({ params }: { params: Promise<{ id: string }> }) {
    const router = useRouter();
    const resolvedParams = use(params);
    const id = resolvedParams?.id;

    // State
    const [loading, setLoading] = useState(true);
    const [contract, setContract] = useState<any | null>(null);
    const [details, setDetails] = useState<any | null>(null);
    const [contractTemplate, setContractTemplate] = useState<any | null>(null); // New state for template
    const [viewerOpen, setViewerOpen] = useState(false);
    const [selectedDoc, setSelectedDoc] = useState<Document | null>(null);

    // Multi-party finalization state
    const [finalizing, setFinalizing] = useState(false);
    const [finalizeError, setFinalizeError] = useState<string | null>(null);
    const [finalizeSuccess, setFinalizeSuccess] = useState(false);

    // --- ROBUST DATA FETCHING LOGIC ---
    useEffect(() => {
        let isMounted = true;
        const loadData = async () => {
            console.log("🚀 Starting load for ID:", id);

            // 0. Safety Check
            if (!id) {
                console.warn("⚠️ No ID found in URL params yet");
                return;
            }

            setLoading(true);

            try {
                let found = null;
                // LocalStorage fallback removed to enforce API usage

                // 2. Fallback to service if not found in raw storage
                if (!found) {
                    const serviceContracts = await contractService.getAllContracts();
                    if (Array.isArray(serviceContracts)) {
                        found = serviceContracts.find(c => c.id === id);
                    } else {
                        console.error("ContractViewPage: getAllContracts returned non-array", serviceContracts);
                    }
                }

                // 3. Handle Not Found
                if (!found) {
                    throw new Error(`Contract ${id} not found in storage.`);
                }

                if (isMounted) setContract(found);

                // 3.5 Fetch Template if needed
                if (found.templateId) {
                    try {
                        const tmpl = await templateService.getTemplateById(found.templateId);
                        if (isMounted && tmpl) setContractTemplate(tmpl);
                    } catch (e) {
                        console.warn("Could not fetch template:", e);
                    }
                }

                // 4. Load extra details (from service or mock local)
                // Build activities timeline from contract data
                if (isMounted) {
                    const activities: { id: string; title: string; user: string; date: string }[] = [];

                    // Helper function to safely format dates
                    const formatDate = (dateStr: string | undefined): string => {
                        if (!dateStr) return 'Date not available';
                        try {
                            const date = new Date(dateStr);
                            if (isNaN(date.getTime())) return 'Date not available';
                            return date.toLocaleDateString();
                        } catch {
                            return 'Date not available';
                        }
                    };

                    // 1. Contract Created
                    if (found.createdAt) {
                        activities.push({
                            id: 'created',
                            title: 'Contract Created',
                            user: found.createdBy || 'System',
                            date: formatDate(found.createdAt)
                        });
                    }

                    // 2. Submitted for Review (if reviewers exist)
                    if (found.reviewers && found.reviewers.length > 0) {
                        activities.push({
                            id: 'submitted-review',
                            title: 'Submitted for Review',
                            user: found.createdBy || 'System',
                            date: formatDate(found.updatedAt || found.createdAt)
                        });

                        // 3. Each Reviewer's Action
                        found.reviewers.forEach((reviewer: any, idx: number) => {
                            if (reviewer.status === 'reviewed' && reviewer.reviewedAt) {
                                activities.push({
                                    id: `reviewed-${idx}`,
                                    title: 'Reviewed',
                                    user: reviewer.email || 'Reviewer',
                                    date: formatDate(reviewer.reviewedAt)
                                });
                            } else if (reviewer.status === 'requested_changes') {
                                activities.push({
                                    id: `changes-requested-${idx}`,
                                    title: 'Changes Requested',
                                    user: reviewer.email || 'Reviewer',
                                    date: formatDate(reviewer.reviewedAt || found.updatedAt)
                                });
                            }
                        });
                    }

                    // 4. Approver Action
                    if (found.approver) {
                        if (found.approver.status === 'approved' && found.approver.approvedAt) {
                            activities.push({
                                id: 'approved',
                                title: 'Approved',
                                user: found.approver.email || 'Approver',
                                date: formatDate(found.approver.approvedAt)
                            });
                        } else if (found.approver.status === 'rejected') {
                            activities.push({
                                id: 'rejected',
                                title: 'Rejected',
                                user: found.approver.email || 'Approver',
                                date: formatDate(found.updatedAt || found.createdAt)
                            });
                        }
                    }

                    // 5. Contractor filled party fields (multi-party)
                    if (found.partyCompletions && found.partyCompletions.length > 0) {
                        found.partyCompletions.forEach((completion: any, idx: number) => {
                            if (completion.isContractor && completion.status === 'completed' && completion.completedAt) {
                                activities.push({
                                    id: `contractor-filled-${idx}`,
                                    title: `Contractor filled ${completion.partyLabel || completion.partyId} fields`,
                                    user: completion.completedByName || completion.completedBy || found.createdBy || 'Contractor',
                                    date: formatDate(completion.completedAt)
                                });
                            }
                        });
                    }

                    // 6. Signature Request Sent (legacy single-signer flow)
                    if (found.signingRequest && !found.externalSigners?.length) {
                        activities.push({
                            id: 'signature-requested',
                            title: 'Signature Request Sent',
                            user: found.createdBy || 'System',
                            date: formatDate(found.externalSigningSentAt || found.signingRequest?.createdAt)
                        });
                    }

                    // 7. Multi-party: Internal signers assignments and completions
                    if (found.internalSigners && found.internalSigners.length > 0) {
                        found.internalSigners.forEach((signer: any, idx: number) => {
                            const partyLabel = signer.partyLabel || 'Party';

                            // Internal signer assigned
                            if (signer.assignedAt) {
                                activities.push({
                                    id: `internal-assigned-${idx}`,
                                    title: `Internal signer assigned for ${partyLabel} (Order ${signer.order})`,
                                    user: signer.name || signer.email,
                                    date: formatDate(signer.assignedAt)
                                });
                            }

                            // Internal signer unlocked
                            if (signer.unlockedAt && signer.unlockedAt !== signer.assignedAt) {
                                activities.push({
                                    id: `internal-unlocked-${idx}`,
                                    title: `Order ${signer.order} unlocked for ${partyLabel}`,
                                    user: signer.name || signer.email,
                                    date: formatDate(signer.unlockedAt)
                                });
                            }

                            // Internal signer completed
                            if (signer.status === 'completed' && signer.completedAt) {
                                activities.push({
                                    id: `internal-completed-${idx}`,
                                    title: `Completed ${partyLabel} fields`,
                                    user: signer.name || signer.email,
                                    date: formatDate(signer.completedAt)
                                });
                            }
                        });
                    }

                    // 8. Multi-party: External signers requests sent
                    if (found.externalSigners && found.externalSigners.length > 0) {
                        found.externalSigners.forEach((signer: any, idx: number) => {
                            // Get party label for display
                            const partyLabel = signer.partyLabel || 'Party';

                            // External signer assigned
                            if (signer.sentAt) {
                                activities.push({
                                    id: `external-assigned-${idx}`,
                                    title: `External signer assigned for ${partyLabel} (Order ${signer.order})`,
                                    user: signer.name || signer.email,
                                    date: formatDate(signer.sentAt)
                                });
                            }

                            // External signer unlocked (email sent)
                            if (signer.unlockedAt && signer.unlockedAt !== signer.sentAt) {
                                activities.push({
                                    id: `external-unlocked-${idx}`,
                                    title: `Order ${signer.order} unlocked - email sent for ${partyLabel}`,
                                    user: signer.name || signer.email,
                                    date: formatDate(signer.unlockedAt)
                                });
                            }

                            // Signer viewed the contract
                            if (signer.viewedAt) {
                                activities.push({
                                    id: `external-viewed-${idx}`,
                                    title: `Viewed contract`,
                                    user: signer.name || signer.email,
                                    date: formatDate(signer.viewedAt)
                                });
                            }

                            // Signer completed their party fields
                            if (signer.status === 'completed' && signer.completedAt) {
                                activities.push({
                                    id: `external-completed-${idx}`,
                                    title: `Completed ${partyLabel} fields`,
                                    user: signer.name || signer.email,
                                    date: formatDate(signer.completedAt)
                                });
                            }
                        });
                    }

                    // 8. Client party completions (from partyCompletions, non-contractor)
                    if (found.partyCompletions && found.partyCompletions.length > 0) {
                        found.partyCompletions.forEach((completion: any, idx: number) => {
                            if (!completion.isContractor && completion.status === 'completed' && completion.completedAt) {
                                activities.push({
                                    id: `client-completed-${idx}`,
                                    title: `Completed ${completion.partyLabel || completion.partyId} fields`,
                                    user: completion.completedByName || completion.completedBy || 'Client',
                                    date: formatDate(completion.completedAt)
                                });
                            }
                        });
                    }

                    // 9. Signed (legacy single-signer flow)
                    if (found.signer?.status === 'signed' && found.signer?.signedAt) {
                        activities.push({
                            id: 'signed',
                            title: 'Contract Signed',
                            user: found.signer.email || found.signer.name || 'Client',
                            date: formatDate(found.signer.signedAt)
                        });
                    } else if (found.signingRequest?.status === 'signed' && found.signingRequest?.signedAt && !found.externalSigners?.length) {
                        activities.push({
                            id: 'signed',
                            title: 'Contract Signed',
                            user: found.signingRequest.signerEmail || 'Client',
                            date: formatDate(found.signingRequest.signedAt)
                        });
                    }

                    // 10. Contract Finalized (multi-party flow)
                    if (found.finalizedAt) {
                        activities.push({
                            id: 'finalized',
                            title: 'Contract Finalized',
                            user: found.finalizedBy || found.createdBy || 'System',
                            date: formatDate(found.finalizedAt)
                        });
                    }

                    // Sort activities by date (oldest first for chronological order)
                    activities.sort((a, b) => {
                        const dateA = new Date(a.date).getTime();
                        const dateB = new Date(b.date).getTime();
                        // Handle invalid dates
                        if (isNaN(dateA)) return 1;
                        if (isNaN(dateB)) return -1;
                        return dateA - dateB;
                    });

                    setDetails({
                        documents: [{
                            id: 'main-contract',
                            name: `${found.title}.pdf`,
                            size: 'PDF',
                            uploadDate: new Date(found.createdAt).toLocaleDateString(),
                            url: found.fileUrl
                        }],
                        activities,
                        ...found
                    });
                }
            } catch (err) {
                console.error("💥 Load Error:", err);
            } finally {
                if (isMounted) setLoading(false);
            }
        };

        loadData();
        return () => { isMounted = false; };
    }, [id]);

    // ═══════════════════════════════════════════════════════════════════
    // REAL-TIME POLLING: Auto-refresh when workflow state changes
    // ═══════════════════════════════════════════════════════════════════
    const shouldPoll = !loading && !!contract && (
        contract.status === 'waiting_for_signature' ||
        contract.status === 'signed_by_everyone' ||
        (contract.signatureFlowStatus && contract.signatureFlowStatus !== 'finalized')
    );

    const handleContractUpdate = useCallback((freshContract: any) => {
        console.log('🔄 [ContractViewPage] Auto-refresh triggered — updating UI');
        setContract(freshContract);

        // Rebuild the details/activities from fresh data
        // (same logic as in loadData, but simplified for the update path)
        const formatDate = (dateStr: string | undefined): string => {
            if (!dateStr) return 'Date not available';
            try {
                const date = new Date(dateStr);
                if (isNaN(date.getTime())) return 'Date not available';
                return date.toLocaleDateString();
            } catch { return 'Date not available'; }
        };

        setDetails((prev: any) => ({
            ...prev,
            ...freshContract,
            documents: [{
                id: 'main-contract',
                name: `${freshContract.title}.pdf`,
                size: 'PDF',
                uploadDate: new Date(freshContract.createdAt).toLocaleDateString(),
                url: freshContract.fileUrl
            }],
        }));
    }, []);

    useContractPolling(
        id,
        contract?.updatedAt,
        handleContractUpdate,
        shouldPoll,
        12000 // 12 seconds
    );


    // Handlers
    const handleBack = () => router.back();
    const handleEdit = () => console.log('Edit contract:', contract?.id);
    const handleDownload = () => {
        if (contract) {
            handleDownloadDocument({
                id: 'main-contract',
                name: `${contract.title}.pdf`,
                size: 'PDF',
                uploadDate: new Date(contract.createdAt).toLocaleDateString(),
                url: contract.fileUrl
            });
        }
    };

    /**
     * Helper to download a document (PDF)
     */
    const handleDownloadDocument = (doc: Document) => {
        console.log('📥 [ContractViewPage] Downloading document:', doc.id);

        let downloadUrl = doc.url;

        // Use signedPdfBase64 if available for the main contract
        if (doc.id === 'main-contract' && contract?.signedPdfBase64) {
            console.log('📄 [ContractViewPage] Using signedPdfBase64 for download');
            downloadUrl = `data:application/pdf;base64,${contract.signedPdfBase64}`;
        }

        if (!downloadUrl) {
            console.error('❌ [ContractViewPage] No URL or data found for download');
            return;
        }

        try {
            const link = document.createElement('a');
            link.href = downloadUrl;
            link.download = doc.name || 'document.pdf';
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
            console.log('✅ [ContractViewPage] Download triggered');
        } catch (error) {
            console.error('❌ [ContractViewPage] Download failed:', error);
        }
    };
    const handleDelete = () => console.log('Delete contract:', contract?.id);

    /**
     * Handle finalizing the contract after all parties have completed
     */
    const handleFinalize = async () => {
        if (!contract) return;

        console.log('🏁 [ContractViewPage] Finalizing contract:', contract.id);
        setFinalizing(true);
        setFinalizeError(null);

        try {
            const currentUser = authService.getCurrentUser();
            const finalizedBy = currentUser?.email || 'system';
            const finalizedByName = currentUser?.email || 'System';

            // Call finalize API
            const response = await fetch(`/api/contracts/${contract.id}/finalize`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    finalizedBy,
                    finalizedByName,
                }),
            });

            const result = await response.json();

            if (!response.ok) {
                throw new Error(result.error || 'Failed to finalize contract');
            }

            console.log('✅ [ContractViewPage] Contract finalized successfully');

            // Send emails to all external signers
            console.log('📧 [ContractViewPage] Sending finalized emails...');
            const emailResult = await sendFinalizedContractEmails(contract, finalizedByName);

            if (!emailResult.success) {
                console.warn('⚠️ [ContractViewPage] Some emails failed:', emailResult.errors);
            } else {
                console.log(`✅ [ContractViewPage] Sent ${emailResult.sentCount} emails`);
            }

            setFinalizeSuccess(true);

            // Refresh contract data
            const updatedContract = await contractService.getContractById(contract.id);
            if (updatedContract) {
                setContract(updatedContract);
            }

        } catch (error: any) {
            console.error('❌ [ContractViewPage] Finalize error:', error);
            setFinalizeError(error.message || 'Failed to finalize contract');
        } finally {
            setFinalizing(false);
        }
    };

    /**
     * Check if this is a multi-party contract
     */
    const isMultiPartyContract = (contract?.externalSigners && contract.externalSigners.length > 0) ||
        (contract?.internalSigners && contract.internalSigners.length > 0);

    /**
     * Check if all signers (internal + external) have completed
     */
    const allSignersCompleted = isMultiPartyContract &&
        (contract.externalSigners || []).every((signer: any) => signer.status === 'completed') &&
        (contract.internalSigners || []).every((signer: any) => signer.status === 'completed');

    const currentOrder = contract?.currentSigningOrder;

    const allOrders = [
        ...(contract?.internalSigners || []).map((s: any) => s.order),
        ...(contract?.externalSigners || []).map((s: any) => s.order),
    ];
    const uniqueOrders = [...new Set(allOrders)].sort((a: number, b: number) => a - b);

    /**
     * Check if contract can be finalized
     */
    const canFinalize = allSignersCompleted &&
        contract?.signatureFlowStatus === 'all_completed';

    /**
     * Check if contract is already finalized
     */
    const isFinalized = contract?.signatureFlowStatus === 'finalized';

    /**
     * Save contract changes from PDF viewer
     */
    const handleSaveChanges = async (pdfBlob: Blob, xfdfString: string, fieldValues?: Record<string, string>, formFields?: any[]) => {
        if (!contract) return;

        try {
            const arrayBuffer = await pdfBlob.arrayBuffer();
            const bytes = new Uint8Array(arrayBuffer);
            let binary = '';
            for (let i = 0; i < bytes.byteLength; i++) {
                binary += String.fromCharCode(bytes[i]);
            }
            const pdfBase64 = btoa(binary);

            const result = await contractService.updateContractSignedPdf(contract.id, pdfBase64, xfdfString);

            if (result.success) {
                const metadataUpdates: Record<string, any> = {};
                if (fieldValues && Object.keys(fieldValues).length > 0) {
                    metadataUpdates.fieldValues = { ...(contract.fieldValues || {}), ...fieldValues };
                }
                if (formFields && formFields.length > 0) {
                    metadataUpdates.formFields = formFields;
                    metadataUpdates.hasFormFields = true;
                }
                if (Object.keys(metadataUpdates).length > 0) {
                    await apiService.updateContractMetadata(contract.id, metadataUpdates);
                }

                // Refresh contract data
                const updatedContract = await contractService.getContractById(contract.id);
                if (updatedContract) setContract(updatedContract);
            }
        } catch (error) {
            console.error('❌ Error saving contract:', error);
        }
    };

    // View Document Handler
    const handleViewDocument = (doc: Document) => {
        setSelectedDoc(doc);
        setViewerOpen(true);
    };

    // Helper: Status Color
    const getStatusColor = (status: string) => {
        switch (status) {
            case 'active': return { bgcolor: '#d1fae5', color: '#065f46' };
            case 'expiring': return { bgcolor: '#fef3c7', color: '#92400e' };
            case 'expired': return { bgcolor: '#fee2e2', color: '#991b1b' };
            default: return { bgcolor: '#e5e7eb', color: '#374151' };
        }
    };


    // --- RENDER: LOADING STATE ---
    if (loading) {
        return (
            <AppLayout>
                <ContractDetailShimmer />
            </AppLayout>
        );
    }

    // --- RENDER: NOT FOUND STATE ---
    if (!contract) {
        return (
            <AppLayout>
                <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', mt: 10, gap: 2 }}>
                    <Typography variant="h6">Contract Not Found</Typography>
                    <Typography color="text.secondary">ID: {id}</Typography>
                    <IconButton onClick={handleBack}><ArrowBackIcon /> Go Back</IconButton>
                </Box>
            </AppLayout>
        );
    }

    // --- MAIN RENDER ---
    const statusColors = getStatusColor(contract.status);

    // Fallback data for details in case loading failed partially
    const displayDetails = details || {
        description: contract.description,
        keyTerms: [],
        documents: [],
        activities: []
    };

    return (
        <AppLayout>
            <Fade in timeout={400}>
                <Box>
                    {/* Header Section */}
                    <Box
                        sx={{
                            display: 'flex',
                            alignItems: { xs: 'flex-start', md: 'center' },
                            justifyContent: 'space-between',
                            flexDirection: { xs: 'column', md: 'row' },
                            gap: 2,
                            // pb: 1,
                            borderBottom: '1px solid',
                            borderColor: 'divider',
                        }}
                    >
                        {/* Left: Back Button + Title */}
                        <Box sx={{ display: 'flex', alignItems: 'flex-start', gap: 1.5, flex: 1 }}>
                            <Tooltip title="Go back" arrow>
                                <IconButton
                                    onClick={handleBack}
                                    sx={{
                                        color: 'text.secondary',
                                        '&:hover': {
                                            bgcolor: 'action.hover',
                                            color: 'primary.main',
                                        },
                                    }}
                                >
                                    <ArrowBackIcon />
                                </IconButton>
                            </Tooltip>

                            <Box sx={{ flex: 1 }}>
                                {/* Title and Badge */}
                                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap' }}>
                                    <Typography
                                        fontWeight={600}
                                        sx={{
                                            color: 'text.primary',
                                            fontSize: { xs: '1rem', sm: '20px' },
                                        }}
                                    >
                                        {contract.title}
                                    </Typography>
                                    <Chip
                                        label={contract.status}
                                        size="small"
                                        sx={{
                                            bgcolor: statusColors.bgcolor,
                                            color: statusColors.color,
                                            fontWeight: 600,
                                            fontSize: '0.75rem',
                                            textTransform: 'capitalize',
                                            height: 24,
                                            borderRadius: 1.5,
                                        }}
                                    />
                                </Box>

                                {/* Subtitle */}
                                <Typography
                                    variant="body2"
                                    sx={{
                                        color: 'text.secondary',
                                        fontSize: '0.9rem',
                                    }}
                                >
                                    {contract.description || 'No description provided'}
                                </Typography>
                            </Box>
                        </Box>

                        {/* Right: Action Buttons */}
                        <Box
                            sx={{
                                display: 'flex',
                                gap: 1,
                                alignSelf: { xs: 'flex-end', md: 'center' },
                            }}
                        >
                            {/* <Tooltip title="Download Contract" arrow>
                                <IconButton
                                    onClick={handleDownload}
                                    sx={{
                                        bgcolor: 'transparent',
                                        border: '1px solid',
                                        borderColor: 'divider',
                                        color: 'text.secondary',
                                        width: 36,
                                        height: 36,
                                        transition: 'all 0.2s',
                                        '&:hover': {
                                            bgcolor: 'primary.main',
                                            borderColor: 'primary.main',
                                            color: 'white',
                                            transform: 'translateY(-2px)',
                                            boxShadow: '0 4px 8px rgba(15, 118, 110, 0.2)',
                                        },
                                    }}
                                >
                                    <FileDownloadOutlinedIcon fontSize="small" />
                                </IconButton>
                            </Tooltip> */}
                        </Box>
                    </Box>

                    {/* ═══════════════════════════════════════════════════════════════════════════ */}
                    {/* MULTI-PARTY SIGNATURE STATUS */}
                    {/* ═══════════════════════════════════════════════════════════════════════════ */}
                    {isMultiPartyContract && (
                        <Paper
                            elevation={0}
                            sx={{
                                mt: 2,
                                p: 2,
                                border: '1px solid',
                                borderColor: isFinalized ? 'success.light' : 'divider',
                                borderRadius: 2,
                                bgcolor: isFinalized ? 'success.50' : 'background.paper',
                            }}
                        >
                            <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 2 }}>
                                <Typography variant="subtitle1" fontWeight={600}>
                                    {isFinalized ? '✅ Contract Finalized' : '📝 Multi-Party Signature Status'}
                                </Typography>
                                {currentOrder && !isFinalized && (
                                    <Chip
                                        label={`Current Order: ${currentOrder}`}
                                        size="small"
                                        sx={{ bgcolor: 'primary.main', color: '#fff', fontWeight: 600 }}
                                    />
                                )}
                                {isFinalized && contract.finalizedAt && (
                                    <Typography variant="body2" color="text.secondary">
                                        Finalized on {new Date(contract.finalizedAt).toLocaleDateString()}
                                    </Typography>
                                )}
                            </Box>

                            {/* Signers grouped by order */}
                            {uniqueOrders.map((order: number) => {
                                const internalAtOrder = (contract.internalSigners || []).filter((s: any) => s.order === order);
                                const externalAtOrder = (contract.externalSigners || []).filter((s: any) => s.order === order);
                                const allAtOrder = [...internalAtOrder, ...externalAtOrder];
                                const allComplete = allAtOrder.every((s: any) => s.status === 'completed');
                                const isCurrentOrder = order === currentOrder;
                                const isPastOrder = currentOrder ? order < currentOrder : false;
                                const isFutureOrder = currentOrder ? order > currentOrder : true;

                                return (
                                    <Box
                                        key={order}
                                        sx={{
                                            mb: 2,
                                            p: 1.5,
                                            borderRadius: 2,
                                            border: '1px solid',
                                            borderColor: allComplete ? 'success.light' : isCurrentOrder ? 'primary.light' : 'grey.300',
                                            bgcolor: allComplete ? 'success.50' : isCurrentOrder ? 'primary.50' : isFutureOrder ? 'grey.50' : 'background.paper',
                                        }}
                                    >
                                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1 }}>
                                            <Chip
                                                label={`Order ${order}`}
                                                size="small"
                                                sx={{
                                                    bgcolor: allComplete ? 'success.main' : isCurrentOrder ? 'primary.main' : 'grey.500',
                                                    color: '#fff',
                                                    fontWeight: 700,
                                                    fontSize: '0.75rem',
                                                }}
                                            />
                                            {allComplete && (
                                                <CheckCircleIcon sx={{ color: 'success.main', fontSize: 18 }} />
                                            )}
                                            {isCurrentOrder && !allComplete && (
                                                <Typography variant="caption" sx={{ color: 'primary.main', fontWeight: 600 }}>
                                                    In Progress
                                                </Typography>
                                            )}
                                            {isFutureOrder && (
                                                <Typography variant="caption" sx={{ color: 'text.secondary' }}>
                                                    Waiting
                                                </Typography>
                                            )}
                                        </Box>

                                        <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1.5 }}>
                                            {allAtOrder.map((signer: any, index: number) => {
                                                const isInternal = internalAtOrder.includes(signer);
                                                return (
                                                    <Box
                                                        key={signer.token || signer.email || index}
                                                        sx={{
                                                            display: 'flex',
                                                            alignItems: 'center',
                                                            gap: 1,
                                                            p: 1,
                                                            borderRadius: 1,
                                                            bgcolor: signer.status === 'completed' ? 'success.100' : 'background.paper',
                                                            border: '1px solid',
                                                            borderColor: signer.status === 'completed' ? 'success.light' : 'grey.200',
                                                            minWidth: 180,
                                                        }}
                                                    >
                                                        {signer.status === 'completed' ? (
                                                            <CheckCircleIcon sx={{ color: 'success.main', fontSize: 18 }} />
                                                        ) : signer.status === 'unlocked' ? (
                                                            <HourglassEmptyIcon sx={{ color: 'warning.main', fontSize: 18 }} />
                                                        ) : (
                                                            <HourglassEmptyIcon sx={{ color: 'grey.400', fontSize: 18 }} />
                                                        )}
                                                        <Box sx={{ flex: 1, minWidth: 0 }}>
                                                            <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, flexWrap: 'wrap' }}>
                                                                <Chip
                                                                    label={signer.partyLabel}
                                                                    size="small"
                                                                    sx={{
                                                                        bgcolor: contract.parties?.find((p: any) => p.id === signer.partyId)?.color || '#666',
                                                                        color: '#fff',
                                                                        fontWeight: 600,
                                                                        fontSize: '0.65rem',
                                                                        height: 18,
                                                                    }}
                                                                />
                                                                <Chip
                                                                    icon={isInternal ? <PersonIcon sx={{ fontSize: 12 }} /> : <EmailIcon sx={{ fontSize: 12 }} />}
                                                                    label={isInternal ? 'Internal' : 'External'}
                                                                    size="small"
                                                                    sx={{
                                                                        bgcolor: isInternal ? '#e3f2fd' : '#fff3e0',
                                                                        color: isInternal ? '#1565c0' : '#e65100',
                                                                        fontWeight: 500,
                                                                        fontSize: '0.6rem',
                                                                        height: 18,
                                                                        '& .MuiChip-icon': { fontSize: 12 },
                                                                    }}
                                                                />
                                                            </Box>
                                                            <Typography
                                                                variant="caption"
                                                                sx={{
                                                                    display: 'block',
                                                                    overflow: 'hidden',
                                                                    textOverflow: 'ellipsis',
                                                                    whiteSpace: 'nowrap',
                                                                    fontWeight: 500,
                                                                }}
                                                            >
                                                                {signer.email}
                                                            </Typography>
                                                            <Typography variant="caption" color="text.secondary" sx={{ fontSize: '0.65rem' }}>
                                                                {signer.status === 'completed'
                                                                    ? `Completed ${signer.completedAt ? new Date(signer.completedAt).toLocaleDateString() : ''}`
                                                                    : signer.status === 'unlocked'
                                                                        ? 'Awaiting signature'
                                                                        : 'Pending unlock'
                                                                }
                                                            </Typography>
                                                        </Box>
                                                    </Box>
                                                );
                                            })}
                                        </Box>
                                    </Box>
                                );
                            })}

                            <Divider sx={{ my: 2 }} />

                            {/* Finalize / waiting section */}
                            {!isFinalized && (
                                <Box>
                                    {canFinalize ? (
                                        <Box>
                                            <Alert severity="success" sx={{ mb: 2 }}>
                                                <strong>All parties have completed!</strong> You can now finalize this contract.
                                                Finalizing will mark the contract as active and send a copy to all signers.
                                            </Alert>
                                            {finalizeError && (
                                                <Alert severity="error" sx={{ mb: 2 }}>
                                                    {finalizeError}
                                                </Alert>
                                            )}
                                            {finalizeSuccess && (
                                                <Alert severity="success" sx={{ mb: 2 }}>
                                                    Contract finalized successfully! Emails have been sent to all signers.
                                                </Alert>
                                            )}
                                            <Button
                                                variant="contained"
                                                color="primary"
                                                onClick={handleFinalize}
                                                disabled={finalizing || finalizeSuccess}
                                                startIcon={finalizing ? <CircularProgress size={20} color="inherit" /> : <DoneAllIcon />}
                                                sx={{ fontWeight: 600 }}
                                            >
                                                {finalizing ? 'Finalizing...' : 'Finalize Contract'}
                                            </Button>
                                        </Box>
                                    ) : (
                                        <Alert severity="info">
                                            {currentOrder
                                                ? `Waiting for signers at Order ${currentOrder} to complete their fields.`
                                                : 'Waiting for all parties to complete their fields before finalization.'
                                            }
                                        </Alert>
                                    )}
                                </Box>
                            )}

                            {isFinalized && (
                                <Alert severity="success" icon={<DoneAllIcon />}>
                                    This contract has been finalized. All signers have received a copy.
                                </Alert>
                            )}
                        </Paper>
                    )}

                    {/* Content Grid: Contract Info + Details Panel */}
                    <Box
                        sx={{
                            mt: 1.5,
                            display: 'grid',
                            gridTemplateColumns: { xs: '1fr', lg: '1.5fr 1fr' },
                            gap: 2,
                        }}
                    >
                        {/* Contract Information Section (Left) */}
                        <Box>
                            <ContractInformation
                                client={contract.client || 'N/A'}
                                contractValue={contract.value || 'N/A'}
                                category={contract.category || 'N/A'}
                                template={contract.templateName || 'Custom Template'}
                                startDate={contract.startDate || 'N/A'}
                                endDate={contract.endDate || 'N/A'}
                                daysRemaining={contract.expiresInDays || 0}
                                progressPercentage={(() => {
                                    // Calculate REMAINING progress based on dates
                                    // 100% = full duration remaining, 0% = expired
                                    if (!contract.startDate || !contract.endDate) return 100;

                                    const start = new Date(contract.startDate).getTime();
                                    const end = new Date(contract.endDate).getTime();
                                    const now = new Date().getTime();

                                    // If contract hasn't started yet - 100% remaining
                                    if (now < start) return 100;
                                    // If contract has ended - 0% remaining
                                    if (now > end) return 0;

                                    // Calculate percentage REMAINING (not elapsed)
                                    const totalDuration = end - start;
                                    const remaining = end - now;
                                    const percentage = Math.round((remaining / totalDuration) * 100);

                                    return Math.min(100, Math.max(0, percentage));
                                })()}
                                status={contract.status}
                                description={displayDetails.description}
                            />
                        </Box>

                        {/* Contract Details Panel Section (Right) */}
                        <Box>
                            <ContractDetailsPanel
                                documents={displayDetails.documents}
                                activities={displayDetails.activities}
                                onViewDocument={handleViewDocument}
                                onDownloadDocument={handleDownloadDocument}
                            />
                        </Box>
                    </Box>
                </Box>
            </Fade>

            {/* Debug: Log what's being passed to viewer */}
            {viewerOpen && (() => {
                console.log('🔍 [ContractViewPage] Opening DocumentViewer with:', {
                    hasSignedPdfBase64: !!contract.signedPdfBase64,
                    signedPdfBase64Length: contract.signedPdfBase64?.length || 0,
                    hasXfdfData: !!contract.xfdfData,
                    xfdfDataLength: contract.xfdfData?.length || 0,
                    xfdfDataPreview: contract.xfdfData?.substring(0, 100) || 'none',
                    formFieldsCount: contract.formFields?.length || 0,
                    templateId: contract.templateId,
                });
                return null;
            })()}
            <DocumentViewerDialog
                open={viewerOpen}
                onClose={() => setViewerOpen(false)}
                fileUrl={(() => {
                    // 1. Signed PDF Base64 (highest priority if available locally)
                    if (contract.signedPdfBase64) {
                        console.log('📄 [ContractViewPage] Using signedPdfBase64');
                        return `data:application/pdf;base64,${contract.signedPdfBase64}`;
                    }

                    // 2. Selected Document from panel
                    if (selectedDoc?.url) {
                        console.log('📄 [ContractViewPage] Using selectedDoc.url');
                        return selectedDoc.url;
                    }

                    // 3. Contract's main file URL (points to saved PDF)
                    if (contract.fileUrl) {
                        console.log('📄 [ContractViewPage] Using contract.fileUrl');
                        return contract.fileUrl;
                    }

                    // 4. Fallback to Template (only if no contract file exists)
                    if (contract.templateId && contractTemplate) {
                        console.log('📄 [ContractViewPage] Fallback: Using template URL');
                        return contractTemplate.fileData || contractTemplate.fileUrl || "";
                    }

                    return '';
                })()}
                fileName={selectedDoc?.name || contract.title}
                title={selectedDoc?.name || contract.title}
                contractId={contract.id}
                // Always pass XFDF - the saved PDF may not embed form fields
                initialXfdf={contract.xfdfData}
                formFields={contract.formFields}
                currentUserRole="contractor"
                // ✅ Only allow saving if contract is NOT finalized
                onSave={isFinalized ? undefined : handleSaveChanges}
                readOnly={isFinalized}
                editableFieldMode={isFinalized ? 'none' : 'empty-only'}
                showAnnotationNavigation={true}
                parties={contract.parties}
                // ✅ Pass external signers info so contractor can't edit client party fields
                externalSigners={contract.externalSigners}
                // ✅ Pass internal signers info so contractor can't edit internal client party fields
                internalSigners={contract.internalSigners}
            />
        </AppLayout>
    );
}