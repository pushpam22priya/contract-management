'use client';

import { use } from 'react';
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

export default function ContractViewPage({ params }: { params: Promise<{ id: string }> }) {
    const router = useRouter();
    const { id } = use(params);

    // Mock data - would come from API based on id
    const contract = {
        id: id,
        title: 'Consulting Services - Global Industries',
        description: 'Strategic consulting services for Q1 2025',
        status: 'expiring',
        client: 'Global Industries Inc.',
        value: '₹89K',
        category: 'Service',
        startDate: '2025-01-15',
        endDate: '2025-03-31',
    };

    const handleBack = () => {
        router.back();
    };

    const handleEdit = () => {
        console.log('Edit contract:', contract.id);
    };

    const handleDownload = () => {
        console.log('Download contract:', contract.id);
    };

    const handleDelete = () => {
        console.log('Delete contract:', contract.id);
    };

    const getStatusColor = (status: string) => {
        switch (status) {
            case 'active':
                return { bgcolor: '#d1fae5', color: '#065f46' };
            case 'expiring':
                return { bgcolor: '#fef3c7', color: '#92400e' };
            case 'expired':
                return { bgcolor: '#fee2e2', color: '#991b1b' };
            default:
                return { bgcolor: '#e5e7eb', color: '#374151' };
        }
    };

    const statusColors = getStatusColor(contract.status);

    // Mock data for ContractDetailsPanel
    const mockDocuments = [
        { id: '1', name: 'Contract Document 1.pdf', size: '2.4 MB', uploadDate: 'Dec 1, 2025' },
        { id: '2', name: 'Contract Document 2.pdf', size: '2.4 MB', uploadDate: 'Dec 2, 2025' },
        { id: '3', name: 'Contract Document 3.pdf', size: '2.4 MB', uploadDate: 'Dec 3, 2025' },
    ];

    const mockActivities = [
        { id: '1', title: 'Contract created', user: 'John Anderson', date: '12/15/2024' },
        { id: '2', title: 'Document uploaded', user: 'John Anderson', date: '12/15/2024' },
        { id: '3', title: 'Status changed to active', user: 'System', date: '1/1/2025' },
    ];

    const mockKeyTerms = [
        'Payment terms: Net 30 days',
        'Renewal: Automatic with 60 days notice',
        'Termination: 30 days written notice required',
    ];

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
                            // mb: 3,
                            pb: 1,
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
                                    {contract.description}
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
                            <Tooltip title="Edit" arrow>
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
                            </Tooltip>

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
                            </Tooltip>

                            <Tooltip title="Delete" arrow>
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
                            </Tooltip>
                        </Box>
                    </Box>

                    {/* Content Grid: Contract Info + Details Panel */}
                    <Box
                        sx={{
                            mt: 1.5,
                            display: 'grid',
                            gridTemplateColumns: { xs: '1fr', lg: '600px 1fr' },
                            gap: 2,
                        }}
                    >
                        {/* Contract Information Section */}
                        <Box>
                            <ContractInformation
                                client={contract.client}
                                contractValue={contract.value}
                                category={contract.category}
                                template="Service Agreement Template"
                                startDate="January 1, 2025"
                                endDate="December 31, 2025"
                                daysRemaining={362}
                                progressPercentage={1}
                            />
                        </Box>

                        {/* Contract Details Panel Section */}
                        <Box>
                            <ContractDetailsPanel
                                description="Yearly maintenance and support contract for enterprise software"
                                keyTerms={mockKeyTerms}
                                documents={mockDocuments}
                                activities={mockActivities}
                            />
                        </Box>
                    </Box>
                </Box>
            </Fade>
        </AppLayout>
    );
}
