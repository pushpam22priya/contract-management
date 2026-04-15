'use client';

import { useEffect } from 'react';
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
import ArticleOutlinedIcon from '@mui/icons-material/ArticleOutlined';
import RateReviewIcon from '@mui/icons-material/RateReview';
import DrawIcon from '@mui/icons-material/Draw';
import BlockOutlinedIcon from '@mui/icons-material/BlockOutlined';
import LayersOutlinedIcon from '@mui/icons-material/LayersOutlined';
import MenuIcon from '@mui/icons-material/Menu';
import MenuOpenIcon from '@mui/icons-material/MenuOpen';

const menuItems = [
    { text: 'Dashboard',              icon: <DashboardOutlinedIcon sx={{ fontSize: 20 }} />,  path: '/dashboard' },
    { text: 'All Contracts',          icon: <LayersOutlinedIcon sx={{ fontSize: 20 }} />,      path: '/all-contracts' },
    { text: 'Contracts',              icon: <ArticleOutlinedIcon sx={{ fontSize: 20 }} />,     path: '/contracts' },
    { text: 'Draft',                  icon: <RateReviewIcon sx={{ fontSize: 20 }} />,          path: '/draft' },
    { text: 'Contract for Signature', icon: <DrawIcon sx={{ fontSize: 20 }} />,                path: '/signatures' },
    { text: 'Review & Approval',      icon: <DraftsIcon sx={{ fontSize: 20 }} />,              path: '/review-approval' },
    { text: 'Template',               icon: <DescriptionOutlinedIcon sx={{ fontSize: 20 }} />, path: '/template' },
    { text: 'Terminated',             icon: <BlockOutlinedIcon sx={{ fontSize: 20 }} />,       path: '/terminated' },
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

    useEffect(() => {
        if (typeof window !== 'undefined') {
            localStorage.setItem('sidebarOpen', JSON.stringify(open));
        }
    }, [open]);

    const handleNavigation = (path: string) => {
        router.push(path);
        if (isMobile) onMobileToggle();
    };

    const drawerWidth = open ? 220 : 56;
    const showExpanded = isMobile ? true : open;

    const drawer = (
        <Box sx={{ height: '100%', display: 'flex', flexDirection: 'column', backgroundColor: 'primary.main' }}>
            {/* Toggle Button */}
            {!isMobile && (
                <Box sx={{ px: 1, pt: 1.5, pb: 0.5 }}>
                    <Tooltip title={!open ? 'Expand' : ''} placement="right" arrow>
                        <IconButton
                            onClick={onToggle}
                            sx={{
                                borderRadius: 2,
                                color: 'white',
                                width: 20,
                                height: 20,
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                mx: open ? 0 : 'auto',
                                '&:hover': { bgcolor: 'rgba(255, 255, 255, 0.1)' },
                            }}
                        >
                            {open ? <MenuOpenIcon sx={{ fontSize: 18 }} /> : <MenuIcon sx={{ fontSize: 18 }} />}
                        </IconButton>
                    </Tooltip>
                </Box>
            )}

            {/* Menu Items */}
            <List sx={{ flex: 1, px: 1, pt: !isMobile ? 0.5 : 2 }} disablePadding>
                {menuItems.map((item) => {
                    const isSelected = pathname === item.path || pathname.startsWith(item.path + '/');

                    return (
                        <Tooltip
                            key={item.text}
                            title={!showExpanded ? item.text : ''}
                            placement="right"
                            arrow
                        >
                            <ListItemButton
                                onClick={() => handleNavigation(item.path)}
                                sx={{
                                    mb: 0.5,
                                    borderRadius: 2,
                                    minHeight: 40,
                                    // When collapsed: center everything; when expanded: left-align
                                    justifyContent: showExpanded ? 'flex-start' : 'center',
                                    px: showExpanded ? 1.5 : 0,
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
                                        // Only add right margin when text is visible
                                        mr: showExpanded ? 1.25 : 0,
                                        justifyContent: 'center',
                                        color: isSelected ? '#0f766e' : 'white',
                                    }}
                                >
                                    {item.icon}
                                </ListItemIcon>

                                <ListItemText
                                    primary={item.text}
                                    sx={{
                                        opacity: showExpanded ? 1 : 0,
                                        display: showExpanded ? 'block' : 'none',
                                        my: 0,
                                    }}
                                    slotProps={{
                                        primary: {
                                            sx: {
                                                fontSize: '0.82rem',
                                                fontWeight: isSelected ? 600 : 400,
                                                color: isSelected ? '#0f766e' : 'white',
                                            },
                                        },
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
                            width: 220,
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
                            top: '40px',
                            height: 'calc(100% - 40px)',
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
