'use client';

import { Box, Tooltip } from '@mui/material';
import { useTheme, alpha } from '@mui/material/styles';
import BarChartIcon from '@mui/icons-material/BarChart';
import BoltOutlinedIcon from '@mui/icons-material/BoltOutlined';
import WarningAmberIcon from '@mui/icons-material/WarningAmber';
import { useTranslations } from 'next-intl';
import { OverviewStats } from './useOverviewStats';

export type TabId = 'stats' | 'active' | 'expiring';

interface OverviewSideTabsProps {
    activeTab: TabId | null;
    stats: OverviewStats;
    onTabChange: (tab: TabId | null) => void;
}

export default function OverviewSideTabs({ activeTab, onTabChange }: OverviewSideTabsProps) {
    const theme = useTheme();
    const t = useTranslations('dashboard');

    // Guarantee a fully opaque base regardless of whether background.paper
    // contains an alpha channel (as some dark themes do).
    // Stacking paper over a solid black/white fallback absorbs any alpha.
    const solidFallback = theme.palette.mode === 'dark' ? '#000' : '#fff';
    const paper = theme.palette.background.paper;
    const solidPaper = `linear-gradient(${paper}, ${paper}), ${solidFallback}`;

    const tabs = [
        {
            id: 'stats' as TabId,
            label: 'Status Overview',
            icon: <BarChartIcon sx={{ fontSize: 15, flexShrink: 0 }} />,
            color: theme.palette.primary.main,
        },
        {
            id: 'active' as TabId,
            label: t('activeContracts'),
            icon: <BoltOutlinedIcon sx={{ fontSize: 15, flexShrink: 0 }} />,
            color: '#10b981',
        },
        {
            id: 'expiring' as TabId,
            label: t('expiringSoon'),
            icon: <WarningAmberIcon sx={{ fontSize: 15, flexShrink: 0 }} />,
            color: '#f59e0b',
        },
    ];

    return (
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
            {tabs.map((tab) => {
                const isActive = activeTab === tab.id;
                return (
                    <Tooltip key={tab.id} title={tab.label} placement="left" arrow>
                        <Box
                            onClick={() => onTabChange(isActive ? null : tab.id)}
                            sx={{
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                p: 1,
                                cursor: 'pointer',
                                borderRadius: '8px 0 0 8px',
                                // Always fully opaque — paper stacked over solid fallback
                                // eliminates transparency even when paper has an alpha channel
                                background: isActive ? tab.color : solidPaper,
                                border: '1px solid',
                                borderRight: 'none',
                                borderColor: isActive ? tab.color : alpha(tab.color, 0.35),
                                color: isActive ? '#fff' : tab.color,
                                transition: 'all 0.2s ease',
                                userSelect: 'none',
                                boxShadow: isActive
                                    ? `0 2px 10px ${alpha(tab.color, 0.4)}`
                                    : theme.palette.mode === 'dark'
                                    ? `0 1px 4px rgba(0,0,0,0.4)`
                                    : `0 1px 4px rgba(0,0,0,0.1)`,
                                // Hover: layer a tint ON TOP of the solid paper colour so
                                // the result is always opaque (CSS paint-model stacking)
                                '&:hover': {
                                    background: isActive
                                        ? tab.color
                                        : `linear-gradient(${alpha(tab.color, 0.13)}, ${alpha(tab.color, 0.13)}), ${paper}, ${solidFallback}`,
                                    transform: 'translateX(-4px)',
                                    boxShadow: `0 4px 14px ${alpha(tab.color, 0.35)}`,
                                    borderColor: tab.color,
                                },
                            }}
                        >
                            {tab.icon}
                        </Box>
                    </Tooltip>
                );
            })}
        </Box>
    );
}
