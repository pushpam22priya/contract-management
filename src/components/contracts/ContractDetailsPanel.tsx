'use client';

import { useState } from 'react';
import {
    Box,
    Typography,
    Paper,
    Tabs,
    Tab,
    Button,
    Avatar,
} from '@mui/material';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import DescriptionOutlinedIcon from '@mui/icons-material/DescriptionOutlined';
import FileDownloadOutlinedIcon from '@mui/icons-material/FileDownloadOutlined';
import FiberManualRecordIcon from '@mui/icons-material/FiberManualRecord';

interface Document {
    id: string;
    name: string;
    size: string;
    uploadDate: string;
}

interface Activity {
    id: string;
    title: string;
    user: string;
    date: string;
}

interface ContractDetailsPanelProps {
    description: string;
    keyTerms: string[];
    documents: Document[];
    activities: Activity[];
}

const ContractDetailsPanel = ({
    description,
    keyTerms,
    documents,
    activities,
}: ContractDetailsPanelProps) => {
    const [activeTab, setActiveTab] = useState(0);

    const handleTabChange = (event: React.SyntheticEvent, newValue: number) => {
        setActiveTab(newValue);
    };

    const handleDownload = (docId: string) => {
        console.log('Download document:', docId);
    };

    return (
        <Paper
            elevation={0}
            sx={{
                borderRadius: 3,
                border: '1px solid',
                borderColor: 'divider',
                overflow: 'hidden',
                transition: 'box-shadow 0.3s ease',
                '&:hover': {
                    boxShadow: '0 4px 12px rgba(0,0,0,0.08)',
                },
            }}
        >
            {/* Tabs */}
            <Box
                sx={{
                    bgcolor: '#f9fafb',
                    borderBottom: '1px solid',
                    borderColor: 'divider',
                    px: { xs: 1, sm: 2 },
                    py: { xs: 0.5, sm: 0.5 },
                }}
            >
                <Tabs
                    value={activeTab}
                    onChange={handleTabChange}
                    sx={{
                        '& .MuiTab-root': {
                            textTransform: 'none',
                            fontWeight: 600,
                            fontSize: { xs: '0.9rem', sm: '1rem' },
                            // minHeight: { xs: 48, sm: 56 },
                            transition: 'all 0.2s',
                            '&.Mui-selected': {
                                color: '#fff',
                                bgcolor: 'primary.main',
                                borderRadius: '8px',
                            },
                        },
                        '& .MuiTabs-indicator': {
                            display: 'none',
                        },
                    }}
                >
                    <Tab label="Overview" />
                    <Tab label="Documents" />
                    <Tab label="Activity" />
                </Tabs>
            </Box>

            {/* Tab Content */}
            <Box sx={{ p: { xs: 1, sm: 2 } }}>
                {/* Overview Tab */}
                {activeTab === 0 && (
                    <Box>
                        {/* Description */}
                        <Box sx={{ mb: 1.5 }}>
                            <Typography
                                variant="h6"
                                fontWeight={700}
                                sx={{
                                    // mb: 1,
                                    color: 'text.primary',
                                    fontSize: { xs: '1.1rem', sm: '1.1rem' },
                                }}
                            >
                                Description
                            </Typography>
                            <Typography
                                variant="body1"
                                sx={{
                                    color: 'text.secondary',
                                    // lineHeight: 1.6,
                                    fontSize: { xs: '0.95rem', sm: '1rem' },
                                }}
                            >
                                {description}
                            </Typography>
                        </Box>

                        {/* Key Terms */}
                        <Box>
                            <Typography
                                variant="h6"
                                fontWeight={700}
                                sx={{
                                    // mb: 1,
                                    color: 'text.primary',
                                    fontSize: { xs: '1.1rem', sm: '1.1rem' },
                                }}
                            >
                                Key Terms
                            </Typography>
                            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
                                {keyTerms.map((term, index) => (
                                    <Box
                                        key={index}
                                        sx={{
                                            display: 'flex',
                                            alignItems: 'flex-start',
                                            gap: 1,
                                        }}
                                    >
                                        <CheckCircleIcon
                                            sx={{
                                                color: '#10b981',
                                                fontSize: '1.5rem',
                                                mt: 0.2,
                                                flexShrink: 0,
                                            }}
                                        />
                                        <Typography
                                            variant="body1"
                                            sx={{
                                                color: 'text.secondary',
                                                fontSize: { xs: '0.95rem', sm: '1rem' },
                                            }}
                                        >
                                            {term}
                                        </Typography>
                                    </Box>
                                ))}
                            </Box>
                        </Box>
                    </Box>
                )}

                {/* Documents Tab */}
                {activeTab === 1 && (
                    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                        {documents.map((doc) => (
                            <Box
                                key={doc.id}
                                sx={{
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'space-between',
                                    gap: 2,
                                    p: 2,
                                    borderRadius: 2,
                                    border: '1px solid',
                                    borderColor: 'divider',
                                    transition: 'all 0.2s',
                                    '&:hover': {
                                        bgcolor: '#f9fafb',
                                        borderColor: 'primary.main',
                                    },
                                }}
                            >
                                <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, flex: 1 }}>
                                    <Avatar
                                        sx={{
                                            bgcolor: '#e0e7ff',
                                            color: '#4f46e5',
                                            width: { xs: 40, sm: 48 },
                                            height: { xs: 40, sm: 48 },
                                        }}
                                    >
                                        <DescriptionOutlinedIcon />
                                    </Avatar>
                                    <Box sx={{ flex: 1, minWidth: 0 }}>
                                        <Typography
                                            variant="body1"
                                            fontWeight={600}
                                            sx={{
                                                color: 'text.primary',
                                                mb: 0.5,
                                                fontSize: { xs: '0.95rem', sm: '1rem' },
                                                overflow: 'hidden',
                                                textOverflow: 'ellipsis',
                                                whiteSpace: 'nowrap',
                                            }}
                                        >
                                            {doc.name}
                                        </Typography>
                                        <Typography
                                            variant="body2"
                                            sx={{
                                                color: 'text.secondary',
                                                fontSize: { xs: '0.8rem', sm: '0.875rem' },
                                            }}
                                        >
                                            {doc.size} • Uploaded {doc.uploadDate}
                                        </Typography>
                                    </Box>
                                </Box>
                                <Button
                                    variant="text"
                                    startIcon={<FileDownloadOutlinedIcon />}
                                    onClick={() => handleDownload(doc.id)}
                                    sx={{
                                        textTransform: 'none',
                                        fontWeight: 600,
                                        color: 'text.primary',
                                        flexShrink: 0,
                                        '&:hover': {
                                            bgcolor: 'action.hover',
                                        },
                                    }}
                                >
                                    <Box sx={{ display: { xs: 'none', sm: 'block' } }}>Download</Box>
                                </Button>
                            </Box>
                        ))}
                    </Box>
                )}

                {/* Activity Tab */}
                {activeTab === 2 && (
                    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
                        {activities.map((activity, index) => (
                            <Box
                                key={activity.id}
                                sx={{
                                    display: 'flex',
                                    alignItems: 'flex-start',
                                    gap: 2,
                                    position: 'relative',
                                    ...(index !== activities.length - 1 && {
                                        pb: 3,
                                    }),
                                }}
                            >
                                <FiberManualRecordIcon
                                    sx={{
                                        color: '#4f46e5',
                                        fontSize: '0.75rem',
                                        mt: 0.5,
                                        flexShrink: 0,
                                    }}
                                />
                                <Box sx={{ flex: 1 }}>
                                    <Typography
                                        variant="body1"
                                        fontWeight={600}
                                        sx={{
                                            color: 'text.primary',
                                            mb: 0.5,
                                            fontSize: { xs: '0.95rem', sm: '1rem' },
                                        }}
                                    >
                                        {activity.title}
                                    </Typography>
                                    <Typography
                                        variant="body2"
                                        sx={{
                                            color: 'text.secondary',
                                            fontSize: { xs: '0.8rem', sm: '0.875rem' },
                                        }}
                                    >
                                        {activity.user} • {activity.date}
                                    </Typography>
                                </Box>
                            </Box>
                        ))}
                    </Box>
                )}
            </Box>
        </Paper>
    );
};

export default ContractDetailsPanel;
