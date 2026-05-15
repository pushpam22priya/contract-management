'use client';

import { useState } from 'react';
import { Box, Backdrop, useMediaQuery } from '@mui/material';
import { useTheme } from '@mui/material/styles';
import { useOverviewStats } from './useOverviewStats';
import ContractsContent from '@/components/contracts/ContractsContent';
import OverviewDrawer from './OverviewDrawer';
import OverviewSideTabs, { TabId } from './OverviewSideTabs';

export default function OverviewContent() {
    const [activeTab, setActiveTab] = useState<TabId | null>(null);
    const stats = useOverviewStats();
    const theme = useTheme();
    const isMobile = useMediaQuery(theme.breakpoints.down('md'));

    const isDrawerOpen = activeTab !== null;

    return (
        <Box
            sx={{
                display: 'flex',
                height: '100%',
                overflow: 'hidden',
                bgcolor: 'background.default',
            }}
        >
            {/* Contracts layer — full width by default, shrinks when drawer opens */}
            <Box sx={{ flex: 1, overflow: 'hidden', minWidth: 0, position: 'relative' }}>
                <ContractsContent basePath="/overview" />

                {/* Tab buttons overlay — inside the contracts area, no layout shift */}
                {!isDrawerOpen && (
                    <Box
                        sx={{
                            position: 'absolute',
                            right: 0,
                            top: '50%',
                            transform: 'translateY(-50%)',
                            zIndex: 2,
                            pointerEvents: 'auto',
                        }}
                    >
                        <OverviewSideTabs
                            activeTab={activeTab}
                            stats={stats}
                            onTabChange={setActiveTab}
                        />
                    </Box>
                )}
            </Box>

            {/* Mobile: backdrop behind drawer */}
            {isMobile && (
                <Backdrop
                    open={isDrawerOpen}
                    onClick={() => setActiveTab(null)}
                    sx={{ position: 'absolute', zIndex: 5, bgcolor: 'rgba(0,0,0,0.35)' }}
                />
            )}

            {/* Drawer — pushes contracts on desktop, overlays on mobile */}
            {isMobile ? (
                <Box
                    sx={{
                        position: 'absolute',
                        right: 0,
                        top: 0,
                        bottom: 0,
                        zIndex: 6,
                        display: 'flex',
                    }}
                >
                    <OverviewDrawer
                        activeTab={activeTab}
                        stats={stats}
                        onClose={() => setActiveTab(null)}
                        onTabChange={setActiveTab}
                    />
                </Box>
            ) : (
                <OverviewDrawer
                    activeTab={activeTab}
                    stats={stats}
                    onClose={() => setActiveTab(null)}
                    onTabChange={setActiveTab}
                />
            )}
        </Box>
    );
}
