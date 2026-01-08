'use client';

import { Box, Typography, Tooltip, IconButton } from '@mui/material';
import AppLayout from '@/components/layout/AppLayout';
import AddIcon from '@mui/icons-material/Add';
import DraftCard from '@/components/contracts/DraftCard';
import { Contract } from '@/components/contracts/ContractCard';
import DraftFilters from '@/components/filters/DraftFilters';
import { useState } from 'react';
import { Dayjs } from 'dayjs';

export default function DraftPage() {
    // Mock draft contracts data
    const draftContracts: Contract[] = [
        {
            id: '1',
            title: 'Office Lease Agreement - Draft',
            description: 'New office space lease pending final approval and review',
            client: 'Prime Properties LLC',
            value: '₹420K',
            category: 'Legal',
            expiresInDays: 0,
            status: 'draft',
        },
        {
            id: '2',
            title: 'Partnership Agreement - Tech Ventures',
            description: 'Strategic partnership proposal for joint technology development',
            client: 'Tech Ventures Group',
            value: '₹890K',
            category: 'Legal',
            expiresInDays: 30,
            status: 'draft',
        },
        {
            id: '3',
            title: 'Marketing Services Contract',
            description: 'Annual marketing and branding services agreement draft',
            client: 'Brand Boost Inc.',
            value: '₹125K',
            category: 'Sales',
            expiresInDays: 45,
            status: 'draft',
        },
        {
            id: '4',
            title: 'IT Support Services - Draft',
            description: 'Comprehensive IT infrastructure support and maintenance contract',
            client: 'SecureTech Solutions',
            value: '₹275K',
            category: 'Service',
            expiresInDays: 60,
            status: 'draft',
        },
        {
            id: '5',
            title: 'Employee Benefits Package',
            description: 'Updated employee health and wellness benefits program',
            client: 'WellCare Partners',
            value: '₹180K',
            category: 'HR',
            expiresInDays: 15,
            status: 'draft',
        },
        {
            id: '6',
            title: 'Cloud Migration Agreement',
            description: 'Enterprise cloud infrastructure migration and setup services',
            client: 'CloudWorks Global',
            value: '₹650K',
            category: 'Finance',
            expiresInDays: 90,
            status: 'draft',
        },
    ];

    const handleDownload = (id: string) => {
        console.log('Download draft:', id);
        // TODO: Implement download functionality
    };

    const handleShare = (id: string) => {
        console.log('Share draft for review or approval:', id);
        // TODO: Implement share functionality
    };

    // Filter states
    const [searchQuery, setSearchQuery] = useState('');
    const [categoryFilter, setCategoryFilter] = useState({ label: 'All Categories', value: 'all' });
    const [startDate, setStartDate] = useState<Dayjs | null>(null);
    const [endDate, setEndDate] = useState<Dayjs | null>(null);
    const [showAdvancedFilters, setShowAdvancedFilters] = useState(false);

    const totalDrafts = draftContracts.length;
    const filteredCount = draftContracts.length;

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
                    {/* Title and Subtitle */}
                    <Box>
                        <Typography
                            // variant="h3"
                            fontWeight={600}
                            sx={{
                                color: 'primary.main',
                                fontSize: { xs: '1.75rem', sm: '2rem', md: '20px' },
                            }}
                        >
                            Draft Contracts
                        </Typography>
                        <Typography
                            variant="body2"
                            sx={{
                                color: 'text.secondary',
                                // fontSize: { xs: '0.95rem', sm: '1rem' },
                            }}
                        >
                            Review and manage your draft contracts
                        </Typography>
                    </Box>

                    {/* Create Draft Button */}
                    {/* <Box
                        sx={{
                            display: 'flex',
                            justifyContent: { xs: 'flex-end', sm: 'flex-start' },
                        }}
                    >
                        <Tooltip title="Create New Draft" arrow>
                            <IconButton
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
                                <AddIcon />
                            </IconButton>
                        </Tooltip>
                    </Box> */}
                </Box>

                {/* Filter Section */}
                <DraftFilters
                    searchQuery={searchQuery}
                    onSearchChange={setSearchQuery}
                    categoryFilter={categoryFilter}
                    onCategoryChange={setCategoryFilter}
                    startDate={startDate}
                    onStartDateChange={setStartDate}
                    endDate={endDate}
                    onEndDateChange={setEndDate}
                    showAdvancedFilters={showAdvancedFilters}
                    onAdvancedFiltersToggle={() => setShowAdvancedFilters(!showAdvancedFilters)}
                    totalCount={totalDrafts}
                    filteredCount={filteredCount}
                />

                {/* Drafts Grid */}
                <Box
                    sx={{
                        display: 'grid',
                        gridTemplateColumns: {
                            xs: '1fr',
                            sm: 'repeat(2, 1fr)',
                            lg: 'repeat(3, 1fr)',
                        },
                        gap: 1,
                    }}
                >
                    {draftContracts.map((contract) => (
                        <DraftCard
                            key={contract.id}
                            contract={contract}
                            onDownload={handleDownload}
                            onShare={handleShare}
                        />
                    ))}
                </Box>
            </Box>
        </AppLayout>
    );
}
