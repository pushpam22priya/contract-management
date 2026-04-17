'use client';

import { Box, useTheme } from '@mui/material';
import { useState, useEffect, useRef } from 'react';
import AppLayout from '@/components/layout/AppLayout';
import { LocalizationProvider } from '@mui/x-date-pickers/LocalizationProvider';
import { AdapterDayjs } from '@mui/x-date-pickers/AdapterDayjs';
import ArticleOutlinedIcon from '@mui/icons-material/ArticleOutlined';
import RateReviewIcon from '@mui/icons-material/RateReview';
import DrawIcon from '@mui/icons-material/Draw';
import ContractsTab from './ContractsTab';
import DraftTab from './DraftTab';
import SignaturesTab from './SignaturesTab';
import { useTranslations } from 'next-intl';

export default function AllContractsPage() {
    const t = useTranslations('nav');
    const TABS = [
        { label: t('contracts'),  Icon: ArticleOutlinedIcon },
        { label: t('draft'),      Icon: RateReviewIcon },
        { label: t('signatures'), Icon: DrawIcon },
    ];

    const [activeTab, setActiveTab] = useState(0);

    const handleTabChange = (index: number) => {
        if (index === activeTab) return;
        setActiveTab(index);
    };

    const tabBar = (
        <Box sx={{ 
            display: 'inline-flex', 
            bgcolor: 'rgba(15, 118, 110, 0.04)', 
            // p: 0.5, 
            borderRadius: 0,
            // gap: 1,
            border: '1px solid rgba(15, 118, 110, 0.1)',
            overflowX: 'auto', // For mobile responsiveness
            maxWidth: '100%',
            '&::-webkit-scrollbar': { display: 'none' }, // Hide scrollbar for clean look
            msOverflowStyle: 'none',
            scrollbarWidth: 'none',
        }}>
            {TABS.map((tab, index) => {
                const isActive = activeTab === index;
                const { Icon } = tab;

                return (
                    <Box
                        key={tab.label}
                        onClick={() => handleTabChange(index)}
                        sx={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: 1,
                            px: { xs: 1, sm: 1 },
                            py: 0.5,
                            // borderRadius: 1,
                            cursor: 'pointer',
                            userSelect: 'none',
                            whiteSpace: 'nowrap',
                            bgcolor: isActive ? 'primary.main' : 'transparent',
                            color: isActive ? '#fff' : 'text.secondary',
                            fontWeight: isActive ? 600 : 500,
                            fontSize: '0.875rem',
                            boxShadow: isActive ? '0 4px 12px rgba(15, 118, 110, 0.12)' : 'none',
                            transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
                            '&:hover': {
                                color: 'primary.main',
                                bgcolor: isActive 
                                    ? 'background.paper' 
                                    : 'rgba(15, 118, 110, 0.06)',
                            }
                        }}
                    >
                        <Icon sx={{ fontSize: 18, flexShrink: 0, transition: 'transform 0.2s', transform: isActive ? 'scale(1.1)' : 'scale(1)' }} />
                        {tab.label}
                    </Box>
                );
            })}
        </Box>
    );

    return (
        <LocalizationProvider dateAdapter={AdapterDayjs}>
            <AppLayout>
                <Box sx={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
                    {activeTab === 0 && <ContractsTab headerLeft={tabBar} />}
                    {activeTab === 1 && <DraftTab headerLeft={tabBar} />}
                    {activeTab === 2 && <SignaturesTab headerLeft={tabBar} />}
                </Box>
            </AppLayout>
        </LocalizationProvider>
    );
}
