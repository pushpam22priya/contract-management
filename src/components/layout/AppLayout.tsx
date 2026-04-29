'use client';

import { useState, ReactNode } from 'react';
import { Box, useTheme } from '@mui/material';
import Header from './Header';
import Sidebar from './Sidebar';

interface AppLayoutProps {
    children: ReactNode;
}

export default function AppLayout({ children }: AppLayoutProps) {
    const theme = useTheme();

    const [sidebarOpen, setSidebarOpen] = useState(() => {
        if (typeof window !== 'undefined') {
            const savedState = localStorage.getItem('sidebarOpen');
            if (savedState !== null) {
                return JSON.parse(savedState);
            }
        }
        return false;
    });
    const [mobileOpen, setMobileOpen] = useState(false);

    const handleSidebarToggle = () => {
        setSidebarOpen(!sidebarOpen);
    };

    const handleMobileToggle = () => {
        setMobileOpen(!mobileOpen);
    };

    return (
        <Box sx={{ display: 'flex', flexDirection: 'column', bgcolor: 'background.default', position: 'absolute', inset: 0, overflow: 'hidden' }}>
            {/* Header */}
            <Header onMobileMenuToggle={handleMobileToggle} />

            {/* Body: Sidebar + Main */}
            <Box sx={{ display: 'flex', flex: 1, mt: '40px', overflow: 'hidden' }}>
                <Sidebar
                    open={sidebarOpen}
                    onToggle={handleSidebarToggle}
                    mobileOpen={mobileOpen}
                    onMobileToggle={handleMobileToggle}
                />

                {/* Main Content */}
                <Box
                    component="main"
                    sx={{
                        flex: 1,
                        minWidth: 0,
                        overflow: 'hidden',
                        transition: theme.transitions.create('width', {
                            easing: theme.transitions.easing.sharp,
                            duration: theme.transitions.duration.enteringScreen,
                        }),
                    }}
                >
                    {children}
                </Box>
            </Box>
        </Box>
    );
}
