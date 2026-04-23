'use client';

import { Box, useTheme } from '@mui/material';
import { alpha } from '@mui/material/styles';
import { useState } from 'react';
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
    const theme = useTheme();
    const primary = theme.palette.primary.main;

    const TABS = [
        { label: t('contracts'),  Icon: ArticleOutlinedIcon },
        { label: t('draft'),      Icon: RateReviewIcon },
        { label: t('signatures'), Icon: DrawIcon },
    ];

    const [activeTab, setActiveTab] = useState(0);

    const tabBar = (
        <Box
            sx={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 0.5,
                p: 0.5,
                borderRadius: 2,
                bgcolor: alpha(primary, 0.06),
                border: `1px solid ${alpha(primary, 0.18)}`,
                overflowX: 'auto',
                maxWidth: '100%',
                '&::-webkit-scrollbar': { display: 'none' },
                msOverflowStyle: 'none',
                scrollbarWidth: 'none',
            }}
        >
            {TABS.map((tab, index) => {
                const isActive = activeTab === index;
                const { Icon } = tab;
                return (
                    <Box
                        key={tab.label}
                        onClick={() => activeTab !== index && setActiveTab(index)}
                        sx={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: 0.75,
                            px: 1,
                            py: 0.5,
                            borderRadius: 1.5,
                            cursor: isActive ? 'default' : 'pointer',
                            userSelect: 'none',
                            whiteSpace: 'nowrap',
                            bgcolor: isActive ? alpha(primary, 0.15) : 'transparent',
                            color: isActive ? primary : 'text.secondary',
                            fontWeight: isActive ? 600 : 400,
                            fontSize: '0.75rem',
                            border: `1px solid ${isActive ? alpha(primary, 0.35) : 'transparent'}`,
                            boxShadow: 'none',
                            transition: 'all 0.22s cubic-bezier(0.4, 0, 0.2, 1)',
                            '&:hover': {
                                color: primary,
                                bgcolor: alpha(primary, 0.09),
                                border: `1px solid ${alpha(primary, 0.20)}`,
                            },
                        }}
                    >
                        <Icon sx={{ fontSize: 15, flexShrink: 0, transition: 'transform 0.2s', transform: isActive ? 'scale(1.12)' : 'scale(1)' }} />
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