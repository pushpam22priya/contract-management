'use client';

import { useState } from 'react';
import { Box, Typography, Button, TextField, InputAdornment, Paper, Autocomplete, Tooltip, IconButton } from '@mui/material';
import AppLayout from '@/components/layout/AppLayout';
import UploadIcon from '@mui/icons-material/Upload';
import AddIcon from '@mui/icons-material/Add';
import SearchIcon from '@mui/icons-material/Search';
import TemplateCard from '@/components/template/TemplateCard';
import UploadTemplateDialog from '@/components/template/UploadTemplateDialog';
import CreateContractWizard from '@/components/contracts/CreateContractWizard';

const templates = [
    {
        id: 1,
        category: 'Service',
        title: 'Service Agreement Template',
        description: 'Standard service agreement for ongoing services',
        timesUsed: 45,
        lastUsed: '12/28/2025',
    },
    {
        id: 2,
        category: 'Legal',
        title: 'NDA Template',
        description: 'Non-disclosure agreement for confidential information',
        timesUsed: 32,
        lastUsed: '12/30/2025',
    },
    {
        id: 3,
        category: 'HR',
        title: 'Employment Contract',
        description: 'Standard employment agreement template',
        timesUsed: 28,
        lastUsed: '12/25/2025',
    },
    {
        id: 4,
        category: 'Procurement',
        title: 'Procurement Agreement',
        description: 'Standard procurement contract template',
        timesUsed: 19,
        lastUsed: '12/22/2025',
    },
    {
        id: 5,
        category: 'Technology',
        title: 'Licensing Agreement',
        description: 'Software and technology licensing template',
        timesUsed: 15,
        lastUsed: '12/20/2025',
    },
];

export default function TemplatePage() {
    const [uploadDialogOpen, setUploadDialogOpen] = useState(false);
    const [wizardOpen, setWizardOpen] = useState(false);
    const [selectedTemplateForUse, setSelectedTemplateForUse] = useState<string | undefined>(undefined);

    const handleUseTemplate = (templateTitle: string) => {
        setSelectedTemplateForUse(templateTitle);
        setWizardOpen(true);
    };

    const handleCloseWizard = () => {
        setWizardOpen(false);
        setSelectedTemplateForUse(undefined);
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
                            Contract Templates
                        </Typography>
                        <Typography
                            variant="body2"
                            sx={{
                                color: 'text.secondary',
                                // fontSize: { xs: '0.95rem', sm: '1rem' },
                            }}
                        >
                            Manage and create reusable contract templates
                        </Typography>
                    </Box>

                    {/* Action Buttons */}
                    <Box
                        sx={{
                            display: 'flex',
                            gap: 1.5,
                            width: { xs: '100%', sm: 'auto' },
                            justifyContent: { xs: 'flex-end', sm: 'flex-start' },
                        }}
                    >
                        <Tooltip title="Upload Template" arrow>
                            <IconButton
                                onClick={() => setUploadDialogOpen(true)}
                                sx={{
                                    bgcolor: 'white',
                                    border: '1px solid',
                                    borderColor: 'rgba(0, 0, 0, 0.23)',
                                    color: 'text.primary',
                                    width: 44,
                                    height: 44,
                                    transition: 'all 0.3s',
                                    '&:hover': {
                                        bgcolor: 'rgba(15, 118, 110, 0.04)',
                                        borderColor: 'primary.main',
                                        transform: 'translateY(-2px)',
                                        boxShadow: '0 4px 8px rgba(0, 0, 0, 0.1)',
                                    },
                                }}
                            >
                                <UploadIcon />
                            </IconButton>
                        </Tooltip>
                        <Tooltip title="Create Template" arrow>
                            <IconButton                                sx={{
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
                    </Box>
                </Box>

                {/* Search and Filters Section */}
                <Paper
                    elevation={0}
                    sx={{
                        mb: 1.5,
                        p: 1,
                        bgcolor: '#fff',
                        borderRadius: 2,
                        border: '1px solid',
                        borderColor: 'rgba(0, 0, 0, 0.06)',
                    }}
                >
                    <Box
                        sx={{
                            display: 'flex',
                            gap: 2,
                            alignItems: 'center',
                            flexDirection: { xs: 'column', md: 'row' },
                        }}
                    >
                        {/* Search Bar */}
                        <TextField
                            fullWidth
                            placeholder="Search templates..."
                            variant="outlined"
                            InputProps={{
                                startAdornment: (
                                    <InputAdornment position="start">
                                        <SearchIcon sx={{ color: 'text.secondary', fontSize: 20 }} />
                                    </InputAdornment>
                                ),
                            }}
                            sx={{
                                flex: { md: 1 },
                                '& .MuiOutlinedInput-root': {
                                    borderRadius: 2,
                                    bgcolor: '#fafafa',
                                    border: 'none',
                                    '& fieldset': {
                                        border: '1px solid',
                                        borderColor: 'rgba(0, 0, 0, 0.1)',
                                    },
                                    '&:hover': {
                                        '& fieldset': {
                                            borderColor: 'rgba(0, 0, 0, 0.2)',
                                        },
                                    },
                                    '&.Mui-focused': {
                                        '& fieldset': {
                                            borderColor: 'primary.main',
                                            borderWidth: 2,
                                        },
                                    },
                                },
                                '& .MuiOutlinedInput-input': {
                                    py: 1.25,
                                    fontSize: '0.95rem',
                                },
                            }}
                        />

                        {/* Filters Container */}
                        <Box
                            sx={{
                                display: 'flex',
                                gap: 2,
                                width: { xs: '100%', md: 'auto' },
                                flexDirection: { xs: 'column', sm: 'row' },
                            }}
                        >
                            {/* Category Filter */}
                            <Autocomplete
                                options={['All Categories', 'Service', 'Legal', 'HR', 'Procurement', 'Technology']}
                                defaultValue="All Categories"
                                disableClearable
                                sx={{
                                    minWidth: { xs: '100%', sm: 220 },
                                }}
                                renderInput={(params) => (
                                    <TextField
                                        {...params}
                                        placeholder="All Categories"
                                        sx={{
                                            '& .MuiOutlinedInput-root': {
                                                borderRadius: 2,
                                                padding: 0.5,
                                                bgcolor: '#fafafa',
                                                '& fieldset': {
                                                    border: '1px solid',
                                                    borderColor: 'rgba(0, 0, 0, 0.1)',
                                                },
                                                '&:hover': {
                                                    '& fieldset': {
                                                        borderColor: 'rgba(0, 0, 0, 0.2)',
                                                    },
                                                },
                                                '&.Mui-focused': {
                                                    '& fieldset': {
                                                        borderColor: 'primary.main',
                                                        borderWidth: 2,
                                                    },
                                                },
                                            },
                                            '& .MuiOutlinedInput-input': {
                                                // py: 1.25,
                                                fontSize: '0.95rem',
                                                fontWeight: 500,
                                            },
                                        }}
                                    />
                                )}
                            />
                        </Box>
                    </Box>
                </Paper>

                {/* Template Cards Grid */}
                <Box
                    sx={{
                        display: 'grid',
                        gridTemplateColumns: {
                            xs: '1fr',
                            sm: 'repeat(2, 1fr)',
                            md: 'repeat(4, 1fr)',
                        },
                        gap: 1,
                    }}
                >
                    {templates.map((template, index) => (
                        <TemplateCard
                            key={template.id}
                            category={template.category}
                            title={template.title}
                            description={template.description}
                            timesUsed={template.timesUsed}
                            lastUsed={template.lastUsed}
                            index={index}
                            onUse={() => handleUseTemplate(template.title)}
                        />
                    ))}
                </Box>

                {/* Upload Template Dialog */}
                <UploadTemplateDialog
                    open={uploadDialogOpen}
                    onClose={() => setUploadDialogOpen(false)}
                />

                {/* Create Contract Wizard */}
                <CreateContractWizard
                    open={wizardOpen}
                    onClose={handleCloseWizard}
                    initialTemplate={selectedTemplateForUse}
                />
            </Box>
        </AppLayout>
    );
}
