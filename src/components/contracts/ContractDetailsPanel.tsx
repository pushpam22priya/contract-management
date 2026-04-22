'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import {
    Box,
    Typography,
    Paper,
    Tabs,
    Tab,
    Button,
    Avatar,
    IconButton,
    Tooltip,
    useTheme,
} from '@mui/material';
import { alpha } from '@mui/material/styles';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import DescriptionOutlinedIcon from '@mui/icons-material/DescriptionOutlined';
import FileDownloadOutlinedIcon from '@mui/icons-material/FileDownloadOutlined';
import VisibilityOutlinedIcon from '@mui/icons-material/VisibilityOutlined';
import FiberManualRecordIcon from '@mui/icons-material/FiberManualRecord';
import { Chip } from '@mui/material';

export interface Document {
    id: string;
    name: string;
    size: string;
    uploadDate: string;
    url?: string;
    /** Renewal chain label shown as a chip on the document row */
    chainLabel?: 'Original' | 'Predecessor' | 'This contract' | 'Renewal' | 'Draft (Renewal)';
}

interface Activity {
    id: string;
    title: string;
    user: string;
    date: string;
}

interface ContractDetailsPanelProps {
    documents: Document[];
    activities: Activity[];
    onViewDocument?: (doc: Document) => void;
    onDownloadDocument?: (doc: Document) => void;
}

const ContractDetailsPanel = ({
    documents,
    activities,
    onViewDocument,
    onDownloadDocument,
}: ContractDetailsPanelProps) => {
    const [activeTab, setActiveTab] = useState(0);
    const t = useTranslations('contractDetail');
    const theme = useTheme();
    const isDark = theme.palette.mode === 'dark';
    const primaryColor = theme.palette.primary.main;
    const tabHeaderBg = isDark ? alpha('#ffffff', 0.03) : '#f9fafb';
    const docHoverBg = isDark ? alpha('#ffffff', 0.05) : '#f9fafb';
    const avatarBg = isDark ? alpha(primaryColor, 0.15) : '#e0e7ff';
    const avatarColor = isDark ? primaryColor : '#4f46e5';

    const handleTabChange = (event: React.SyntheticEvent, newValue: number) => {
        setActiveTab(newValue);
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
                    bgcolor: tabHeaderBg,
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
                            minHeight: 36, // Reduced height
                            height: 36,    // Force height
                            padding: '0 16px',
                            transition: 'all 0.2s',
                            '&.Mui-selected': {
                                color: '#fff',
                                bgcolor: 'primary.main',
                                borderRadius: '8px',
                            },
                        },
                        minHeight: 36,
                        '& .MuiTabs-indicator': {
                            display: 'none',
                        },
                    }}
                >
                    {/* <Tab label="Overview" /> */}
                    <Tab label={t('documents')} />
                    <Tab label={t('activity')} />
                </Tabs>
            </Box>

            {/* Tab Content */}
            <Box sx={{ p: { xs: 1, sm: 2 }, maxHeight: 350, overflowY: 'auto' }}>
                {/* Documents Tab */}
                {activeTab === 0 && (
                    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                        {documents.map((doc) => (
                            <Box
                                key={doc.id}
                                onClick={() => onViewDocument?.(doc)}
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
                                    cursor: onViewDocument ? 'pointer' : 'default',
                                    '&:hover': {
                                        bgcolor: docHoverBg,
                                        borderColor: 'primary.main',
                                        boxShadow: '0 2px 8px rgba(0,0,0,0.05)',
                                    },
                                }}
                            >
                                <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, flex: 1 }}>
                                    <Avatar
                                        sx={{
                                            bgcolor: avatarBg,
                                            color: avatarColor,
                                            width: { xs: 40, sm: 48 },
                                            height: { xs: 40, sm: 48 },
                                        }}
                                    >
                                        <DescriptionOutlinedIcon />
                                    </Avatar>
                                    <Box sx={{ flex: 1, minWidth: 0 }}>
                                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 0.5, flexWrap: 'wrap' }}>
                                            <Typography
                                                variant="body1"
                                                fontWeight={600}
                                                sx={{
                                                    color: 'text.primary',
                                                    fontSize: { xs: '0.95rem', sm: '1rem' },
                                                    overflow: 'hidden',
                                                    textOverflow: 'ellipsis',
                                                    whiteSpace: 'nowrap',
                                                    maxWidth: 200,
                                                }}
                                            >
                                                {doc.name}
                                            </Typography>
                                            {doc.chainLabel && (
                                                <Chip
                                                    label={doc.chainLabel}
                                                    size="small"
                                                    sx={{
                                                        height: 18,
                                                        fontSize: '0.65rem',
                                                        fontWeight: 600,
                                                        flexShrink: 0,
                                                        ...(doc.chainLabel === 'This contract' && { bgcolor: '#dbeafe', color: '#1e40af' }),
                                                        ...(doc.chainLabel === 'Original' && { bgcolor: '#dcfce7', color: '#166534' }),
                                                        ...(doc.chainLabel === 'Predecessor' && { bgcolor: '#f3f4f6', color: '#374151' }),
                                                        ...(doc.chainLabel === 'Renewal' && { bgcolor: '#ede9fe', color: '#5b21b6' }),
                                                        ...(doc.chainLabel === 'Draft (Renewal)' && { bgcolor: '#fef3c7', color: '#92400e' }),
                                                    }}
                                                />
                                            )}
                                        </Box>
                                        <Typography
                                            variant="body2"
                                            sx={{
                                                color: 'text.secondary',
                                                fontSize: { xs: '0.8rem', sm: '0.875rem' },
                                            }}
                                        >
                                            {doc.size} • {t('uploaded', { date: doc.uploadDate })}
                                        </Typography>
                                    </Box>
                                </Box>

                                {/* Action Buttons */}
                                <Box sx={{ display: 'flex', gap: 0.5 }}>
                                    <Tooltip title={t('viewDocument')} arrow>
                                        <IconButton
                                            size="small"
                                            onClick={(e) => {
                                                e.stopPropagation();
                                                onViewDocument?.(doc);
                                            }}
                                            sx={{
                                                 color: 'text.secondary',
                                                border: '1px solid',
                                                borderColor: 'divider',
                                                padding: '6px',
                                                transition: 'all 0.2s',
                                                '&:hover': {
                                                    bgcolor: 'action.hover',
                                                    color: 'primary.main',
                                                    borderColor: 'primary.main',
                                                    transform: 'translateY(-1px)',
                                                },
                                            }}
                                        >
                                            <VisibilityOutlinedIcon fontSize="small" />
                                        </IconButton>
                                    </Tooltip>

                                    <Tooltip title={t('downloadDocument')} arrow>
                                        <IconButton
                                            size="small"
                                            onClick={(e) => {
                                                e.stopPropagation();
                                                onDownloadDocument?.(doc);
                                            }}
                                            sx={{
                                                color: 'text.secondary',
                                                border: '1px solid',
                                                borderColor: 'divider',
                                                padding: '6px',
                                                transition: 'all 0.2s',
                                                '&:hover': {
                                                    bgcolor: 'action.hover',
                                                    color: 'primary.main',
                                                    borderColor: 'primary.main',
                                                    transform: 'translateY(-1px)',
                                                },
                                            }}
                                        >
                                            <FileDownloadOutlinedIcon fontSize="small" />
                                        </IconButton>
                                    </Tooltip>
                                </Box>
                            </Box>
                        ))}
                    </Box>
                )
                }

                {/* Activity Tab */}
                {
                    activeTab === 1 && (
                        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
                            {activities.length === 0 ? (
                                <Box sx={{ textAlign: 'center', py: 4 }}>
                                    <Typography
                                        variant="body2"
                                        sx={{ color: 'text.secondary' }}
                                    >
                                        {t('noActivity')}
                                    </Typography>
                                </Box>
                            ) : (
                                activities.map((activity, index) => (
                                    <Box
                                        key={activity.id}
                                        sx={{
                                            display: 'flex',
                                            alignItems: 'flex-start',
                                            gap: 2,
                                            position: 'relative',
                                            ...(index !== activities.length - 1 && {
                                                // pb: 3,
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
                                                    // mb: 0.5,
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
                                ))
                            )}
                        </Box>
                    )
                }
            </Box >
        </Paper >
    );
};

export default ContractDetailsPanel;
