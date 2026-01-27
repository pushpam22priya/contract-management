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
import { mockApiService } from '@/services/mockApiService';
import DocumentViewerDialog from '@/components/viewer/DocumentViewerDialog';
import { Document } from '@/components/contracts/ContractDetailsPanel';

export default function ContractViewPage({ params }: { params: Promise<{ id: string }> }) {
    const router = useRouter();
    const resolvedParams = use(params);
    const id = resolvedParams?.id;

    // State
    const [loading, setLoading] = useState(true);
    const [contract, setContract] = useState<any | null>(null);
    const [details, setDetails] = useState<any | null>(null);
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
                // 1. Try to find contract in LocalStorage directly (Most reliable source)
                let found = null;
                const localData = localStorage.getItem('cms_contracts');
                if (localData) {
                    const parsed = JSON.parse(localData);
                    found = parsed.find((c: any) => c.id === id);
                }

                // 2. Fallback to service if not found in raw storage
                if (!found) {
                    const serviceContracts = contractService.getAllContracts();
                    found = serviceContracts.find(c => c.id === id);
                }

                // 3. Handle Not Found
                if (!found) {
                    throw new Error(`Contract ${id} not found in storage.`);
                }

                if (isMounted) setContract(found);

                // 4. Load extra details (Mock API)
                const extra = await mockApiService.getContractDetails(id);
                if (isMounted && extra.success) {
                    setDetails(extra.details);
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
                <Box sx={{ display: 'flex', justifyContent: 'center', mt: 10 }}>
                    <Typography>Loading contract details...</Typography>
                </Box>
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
                                progressPercentage={50} // Mock progress
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

            {/* Document Viewer Dialog */}
            <DocumentViewerDialog
                open={viewerOpen}
                onClose={() => setViewerOpen(false)}
                // Priority: URL from selected doc -> Template URL -> Empty string
                fileUrl={selectedDoc?.url || contract.fileUrl || ''}
                // Priority: Name from selected doc -> Contract Title
                fileName={selectedDoc?.name || contract.title}
                title={selectedDoc?.name || contract.title}
                contractId={contract.id}
                xfdfString={contract.xfdfString}
            />
        </AppLayout>
    );
}