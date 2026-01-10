'use client';

import { useState, useEffect } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import {
    Drawer,
    List,
    ListItemButton,
    ListItemIcon,
    ListItemText,
    IconButton,
    Box,
    useTheme,
    useMediaQuery,
    Tooltip,
} from '@mui/material';
import DashboardOutlinedIcon from '@mui/icons-material/DashboardOutlined';
import DescriptionOutlinedIcon from '@mui/icons-material/DescriptionOutlined';
import DraftsIcon from '@mui/icons-material/Drafts';
import PeopleOutlineIcon from '@mui/icons-material/PeopleOutline';
import ArticleOutlinedIcon from '@mui/icons-material/ArticleOutlined';
import RateReviewIcon from '@mui/icons-material/RateReview';
import DrawIcon from '@mui/icons-material/Draw';
import MenuIcon from '@mui/icons-material/Menu';
import MenuOpenIcon from '@mui/icons-material/MenuOpen';

const menuItems = [
    { text: 'Dashboard', icon: <DashboardOutlinedIcon />, path: '/dashboard' },
    { text: 'Template', icon: <DescriptionOutlinedIcon />, path: '/template' },
    { text: 'Contracts', icon: <ArticleOutlinedIcon />, path: '/contracts' },
    { text: 'Draft', icon: <DraftsIcon />, path: '/draft' },
    { text: 'Review & Approval', icon: <RateReviewIcon />, path: '/review-approval' },
    { text: 'Contract for Signature', icon: <DrawIcon />, path: '/signatures' },
];

interface SidebarProps {
    open: boolean;
    onToggle: () => void;
    mobileOpen: boolean;
    onMobileToggle: () => void;
}

export default function Sidebar({ open, onToggle, mobileOpen, onMobileToggle }: SidebarProps) {
    const theme = useTheme();
    const isMobile = useMediaQuery(theme.breakpoints.down('md'));
    const pathname = usePathname();
    const router = useRouter();

    // Persist sidebar state in localStorage
    useEffect(() => {
        if (typeof window !== 'undefined') {
            localStorage.setItem('sidebarOpen', JSON.stringify(open));
        }
    }, [open]);

    const handleNavigation = (path: string) => {
        router.push(path);
        if (isMobile) {
            onMobileToggle();
        }
    };

    const drawerWidth = open ? 240 : 64;

    const drawer = (
        <Box sx={{ height: '100%', display: 'flex', flexDirection: 'column', backgroundColor: "primary.main" }}>
            {/* Spacer for AppBar */}
            <Box sx={{ height: 64, borderBottom: '1px solid', borderColor: 'divider' }} />

            {/* Toggle Button - Above Menu Items */}
            <Box sx={{ px: 1, pt: 2, pb: 1 }}>
                <Tooltip title={!open ? 'Expand' : ''} placement="right" arrow>
                    <IconButton
                        onClick={onToggle}
                        sx={{
                            borderRadius: 2,
                            color: 'white',
                            // width: open ? '100%' : 48,
                            width: 48,
                            height: 48,
                            display: 'flex',
                            justifyContent: open ? 'flex-start' : 'center',
                            mx: open ? 0 : 'auto',
                            '&:hover': {
                                bgcolor: 'rgba(255, 255, 255, 0.1)',
                            },
                        }}
                    >
                        {open ? <MenuOpenIcon /> : <MenuIcon />}
                    </IconButton>
                </Tooltip>
            </Box>

            {/* Menu Items */}
            <List sx={{ flex: 1, px: 1, pt: 0 }}>
                {menuItems.map((item) => {
                    const isSelected = pathname === item.path;

                    return (
                        <Tooltip
                            key={item.text}
                            title={!open ? item.text : ''}
                            placement="right"
                            arrow
                        >
                            <ListItemButton
                                onClick={() => handleNavigation(item.path)}
                                sx={{
                                    mb: 0.5,
                                    borderRadius: 2,
                                    minHeight: 48,
                                    justifyContent: open ? 'initial' : 'center',
                                    px: 2.5,
                                    bgcolor: isSelected ? 'white' : 'transparent',
                                    color: isSelected ? '#0f766e' : '#f8fff8ff',
                                    '&:hover': {
                                        bgcolor: isSelected ? 'white' : 'rgba(255, 255, 255, 0.1)',
                                    },
                                    transition: 'all 0.2s',
                                }}
                            >
                                <ListItemIcon
                                    sx={{
                                        minWidth: 0,
                                        mr: open ? 2 : 'auto',
                                        justifyContent: 'center',
                                        color: isSelected ? '#0f766e' : 'white',
                                    }}
                                >
                                    {item.icon}
                                </ListItemIcon>
                                <ListItemText
                                    primary={item.text}
                                    sx={{
                                        opacity: open ? 1 : 0,
                                        display: open ? 'block' : 'none',
                                    }}
                                    primaryTypographyProps={{
                                        sx: {
                                            color: isSelected ? '#0f766e' : 'white',
                                            fontSize: '14px'
                                        }
                                    }}
                                />
                            </ListItemButton>
                        </Tooltip>
                    );
                })}
            </List>
        </Box>
    );

    return (
        <>
            {/* Mobile Drawer */}
            {isMobile ? (
                <Drawer
                    variant="temporary"
                    open={mobileOpen}
                    onClose={onMobileToggle}
                    ModalProps={{ keepMounted: true }}
                    sx={{
                        display: { xs: 'block', md: 'none' },
                        '& .MuiDrawer-paper': {
                            width: 240,
                            boxSizing: 'border-box',
                            bgcolor: 'sidebar.background',
                            borderRight: '1px solid',
                            borderColor: 'divider',
                        },
                    }}
                >
                    {drawer}
                </Drawer>
            ) : (
                /* Desktop Drawer */
                <Drawer
                    variant="permanent"
                    sx={{
                        display: { xs: 'none', md: 'block' },
                        width: drawerWidth,
                        flexShrink: 0,
                        '& .MuiDrawer-paper': {
                            width: drawerWidth,
                            boxSizing: 'border-box',
                            bgcolor: 'sidebar.background',
                            borderRight: '1px solid',
                            borderColor: 'divider',
                            transition: theme.transitions.create('width', {
                                easing: theme.transitions.easing.sharp,
                                duration: theme.transitions.duration.enteringScreen,
                            }),
                            overflowX: 'hidden',
                        },
                    }}
                    open
                >
                    {drawer}
                </Drawer>
            )}
        </>
    );
}
