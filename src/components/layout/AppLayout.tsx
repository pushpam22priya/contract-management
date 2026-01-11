'use client';

import { useState, useEffect, ReactNode } from 'react';
import { Box, useMediaQuery, useTheme, IconButton } from '@mui/material';
import MenuIcon from '@mui/icons-material/Menu';
import Header from './Header';
import Sidebar from './Sidebar';

interface AppLayoutProps {
    children: ReactNode;
}

export default function AppLayout({ children }: AppLayoutProps) {
    const theme = useTheme();
    const isMobile = useMediaQuery(theme.breakpoints.down('md'));

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

    const drawerWidth = sidebarOpen ? 240 : 64;

    return (
        <Box sx={{ display: 'flex', minHeight: '100vh', bgcolor: 'background.default' }}>
            {/* Header */}
            <Header />

            {/* Sidebar */}
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
                    flexGrow: 1,
                    p: 1.5,
                    width: { xs: '100%', md: `calc(100% - ${drawerWidth}px)` },
                    mt: '60px', // AppBar height
                    transition: theme.transitions.create(['margin', 'width'], {
                        easing: theme.transitions.easing.sharp,
                        duration: theme.transitions.duration.enteringScreen,
                    }),
                }}
            >
                {/* Mobile Menu Button */}
                {isMobile && (
                    <IconButton
                        color="primary"
                        aria-label="open drawer"
                        edge="start"
                        onClick={handleMobileToggle}
                        sx={{ mb: 2 }}
                    >
                        <MenuIcon />
                    </IconButton>
                )}

                {children}
            </Box>
        </Box>
    );
}
