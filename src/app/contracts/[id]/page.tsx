'use client';

import { use, useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import {
    Box,
    Typography,
    IconButton,
    Tooltip,
    Chip,
    Fade,
} from '@mui/material';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import EditOutlinedIcon from '@mui/icons-material/EditOutlined';
import FileDownloadOutlinedIcon from '@mui/icons-material/FileDownloadOutlined';
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline';
import AppLayout from '@/components/layout/AppLayout';
import ContractInformation from '@/components/contracts/ContractInformation';
import ContractDetailsPanel from '@/components/contracts/ContractDetailsPanel';
import { contractService } from '@/services/contractService';
import { templateService } from '@/services/templateService';
import DocumentViewerDialog from '@/components/viewer/DocumentViewerDialog';
import { Document } from '@/components/contracts/ContractDetailsPanel';

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

                    // 5. Signature Request Sent
                    if (found.signingRequest || found.externalSigningSentAt) {
                        activities.push({
                            id: 'signature-requested',
                            title: 'Signature Request Sent',
                            user: found.createdBy || 'System',
                            date: formatDate(found.externalSigningSentAt || found.signingRequest?.createdAt)
                        });
                    }

                    // 6. Signed
                    if (found.signer?.status === 'signed' && found.signer?.signedAt) {
                        activities.push({
                            id: 'signed',
                            title: 'Contract Signed',
                            user: found.signer.email || found.signer.name || 'Client',
                            date: formatDate(found.signer.signedAt)
                        });
                    } else if (found.signingRequest?.status === 'signed' && found.signingRequest?.signedAt) {
                        activities.push({
                            id: 'signed',
                            title: 'Contract Signed',
                            user: found.signingRequest.signerEmail || 'Client',
                            date: formatDate(found.signingRequest.signedAt)
                        });
                    }

                    // Sort activities by date (newest first) - optional
                    // activities.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

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


    // Handlers
    const handleBack = () => router.back();
    const handleEdit = () => console.log('Edit contract:', contract?.id);
    const handleDownload = () => console.log('Download contract:', contract?.id);
    const handleDelete = () => console.log('Delete contract:', contract?.id);

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
                            {/* <Tooltip title="Edit" arrow>
                                <IconButton
                                    onClick={handleEdit}
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
                                    <EditOutlinedIcon fontSize="small" />
                                </IconButton>
                            </Tooltip> */}
                            {/* 
                            <Tooltip title="Download" arrow>
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

                            {/* <Tooltip title="Delete" arrow>
                                <IconButton
                                    onClick={handleDelete}
                                    sx={{
                                        bgcolor: 'transparent',
                                        border: '1px solid',
                                        borderColor: 'divider',
                                        color: 'text.secondary',
                                        width: 36,
                                        height: 36,
                                        transition: 'all 0.2s',
                                        '&:hover': {
                                            bgcolor: 'error.main',
                                            borderColor: 'error.main',
                                            color: 'white',
                                            transform: 'translateY(-2px)',
                                            boxShadow: '0 4px 8px rgba(211, 47, 47, 0.2)',
                                        },
                                    }}
                                >
                                    <DeleteOutlineIcon fontSize="small" />
                                </IconButton>
                            </Tooltip> */}
                        </Box>
                    </Box>

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
                // ✅ CRITICAL FIX: Do NOT import XFDF when loading a saved contract PDF
                // The PDF already has annotations embedded from previous saves.
                // Importing XFDF causes "appearanceReference" errors because XFDF
                // references appearance streams that are now baked into the PDF.
                // Only pass XFDF when falling back to template (no saved contract PDF).
                initialXfdf={(() => {
                    // Skip XFDF if contract has its own saved PDF
                    if (contract.signedPdfBase64 || contract.fileUrl || selectedDoc?.url) {
                        console.log('📄 [ContractViewPage] Skipping XFDF - using saved contract PDF');
                        return undefined;
                    }
                    // Only use XFDF when falling back to template
                    console.log('📄 [ContractViewPage] Using XFDF - falling back to template');
                    return contract.xfdfData;
                })()}
                formFields={(() => {
                    // Same logic as XFDF - skip if using saved contract PDF
                    if (contract.signedPdfBase64 || contract.fileUrl || selectedDoc?.url) {
                        return undefined;
                    }
                    return contract.formFields;
                })()}
                currentUserRole="contractor"
                // ✅ NEW: Contract view page is always read-only
                readOnly={true}
            />
        </AppLayout>
    );
}