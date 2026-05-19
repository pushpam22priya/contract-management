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
import GridViewOutlinedIcon from '@mui/icons-material/GridViewOutlined';
import DescriptionOutlinedIcon from '@mui/icons-material/DescriptionOutlined';
import DraftsIcon from '@mui/icons-material/Drafts';
import ArticleOutlinedIcon from '@mui/icons-material/ArticleOutlined';
import DrawIcon from '@mui/icons-material/Draw';
import LayersOutlinedIcon from '@mui/icons-material/LayersOutlined';
import AllInboxIcon from '@mui/icons-material/AllInbox';
import MenuIcon from '@mui/icons-material/Menu';
import MenuOpenIcon from '@mui/icons-material/MenuOpen';
import { useTranslations } from 'next-intl';
import { useThemeName } from '@/context/ThemeContext';
import { authService } from '@/services/authService';

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
    const isAdmin = authService.getCurrentUser()?.isAdmin;

    const t = useTranslations('nav');
    useThemeName();

    type MenuItem = {
        text: string;
        icon: React.ReactNode;
        path: string;
    };

    const menuItems: MenuItem[] = [
        // { text: t('dashboard'), icon: <DashboardOutlinedIcon sx={{ fontSize: 20 }} />, path: '/dashboard' },
        { text: t('overview'), icon: <GridViewOutlinedIcon sx={{ fontSize: 20 }} />, path: '/overview' },
        // { text: t('allContracts'), icon: <LayersOutlinedIcon sx={{ fontSize: 20 }} />, path: '/all-contracts' },
        // { text: t('contracts'), icon: <ArticleOutlinedIcon sx={{ fontSize: 20 }} />, path: '/contracts' },
        // { text: t('signatures'), icon: <DrawIcon sx={{ fontSize: 20 }} />, path: '/signatures' },
        // { text: t('reviewApproval'), icon: <DraftsIcon sx={{ fontSize: 20 }} />, path: '/review-approval' },
        { text: t('inbox'), icon: <DraftsIcon sx={{ fontSize: 20 }} />, path: '/inbox' },
        ...(isAdmin ? [{
            text: t('template'),
            icon: <DescriptionOutlinedIcon sx={{ fontSize: 20 }} />,
            path: '/template'
        }] : [])
    ];

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

    // Dashboard uses a lighter sidebar variant; all other pages use the full sidebar style.
    // In dark mode this distinction is removed — always use sidebar tokens for consistency.
    const isDashboard = pathname === '/dashboard';

    // ── Dashboard mode: derive from palette tokens (adapts to all themes) ──────
    // ── Sidebar mode:   derive from theme.sidebar tokens ──────────────────────
    const { sidebar, palette } = theme;
    const primary = palette.primary.main;
    const isDarkMode = palette.mode === 'dark';
    // In dark mode use the dashboard-style (translucent violet) for all pages
    const effectiveIsDashboard = isDashboard || isDarkMode;

    const sidebarBg = effectiveIsDashboard ? palette.background.default : sidebar.background;
    // Mobile drawer overlays content — needs a solid background in light mode (many themes use transparent background.default)
    const mobileSidebarBg = effectiveIsDashboard && !isDarkMode ? palette.background.paper : sidebarBg;
    const toggleColor = effectiveIsDashboard ? palette.text.secondary : sidebar.unselected;
    const toggleHoverBg = effectiveIsDashboard ? `${primary}1a` : sidebar.hover;
    const isDarkSidebar = !effectiveIsDashboard && isDarkMode;

    const selectedBg = effectiveIsDashboard ? `${primary}20` : isDarkSidebar ? (sidebar.selectedGradient ?? sidebar.selectedItemBg) : sidebar.selectedItemBg;
    const selectedHoverBg = effectiveIsDashboard ? `${primary}28` : isDarkSidebar ? (sidebar.selectedGradientHover ?? sidebar.selectedItemBg) : sidebar.selectedItemBg;
    const hoverBg = effectiveIsDashboard ? `${primary}10` : sidebar.hover;
    const selectedIconColor = effectiveIsDashboard ? primary : sidebar.selected;
    const inactiveIconColor = effectiveIsDashboard ? palette.text.secondary : sidebar.unselected;
    const selectedTextColor = effectiveIsDashboard ? primary : sidebar.selected;
    const inactiveTextColor = effectiveIsDashboard ? palette.text.secondary : sidebar.unselected;
    const accentBarColor = effectiveIsDashboard ? primary : sidebar.selected;
    const accentBarBg = isDarkSidebar ? (sidebar.accentGradient ?? accentBarColor) : accentBarColor;

    const drawer = (
        <Box sx={{ height: '100%', display: 'flex', flexDirection: 'column', background: 'inherit' }}>
            {/* Toggle Button */}
            {!isMobile && (
                <Box sx={{ px: 1, pt: 1.5, pb: 0.5 }}>
                    <Tooltip title={!open ? 'Expand' : ''} placement="right" arrow>
                        <IconButton
                            onClick={onToggle}
                            sx={{
                                borderRadius: 2,
                                color: toggleColor,
                                width: 20,
                                height: 20,
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                mx: open ? 0 : 'auto',
                                '&:hover': { bgcolor: toggleHoverBg, color: isDashboard ? primary : sidebar.selected },
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
                                    justifyContent: showExpanded ? 'flex-start' : 'center',
                                    px: showExpanded ? 1.5 : 0,
                                    bgcolor: isSelected ? selectedBg : 'transparent',
                                    position: 'relative',
                                    overflow: 'hidden',
                                    // Accent bar on left
                                    '&::before': isSelected && showExpanded ? {
                                        content: '""',
                                        position: 'absolute',
                                        left: 0,
                                        top: '18%',
                                        bottom: '18%',
                                        width: 3,
                                        borderRadius: '0 3px 3px 0',
                                        background: accentBarBg,
                                    } : {},
                                    // Shine sweep on hover (dark sidebar only)
                                    '&::after': isSelected && isDarkSidebar ? {
                                        content: '""',
                                        position: 'absolute',
                                        top: '-50%',
                                        left: '-75%',
                                        width: '45%',
                                        height: '200%',
                                        background: 'linear-gradient(to right, rgba(255,255,255,0) 0%, rgba(255,255,255,0.12) 50%, rgba(255,255,255,0) 100%)',
                                        transform: 'skewX(-18deg)',
                                        transition: 'left 0.5s ease',
                                        pointerEvents: 'none',
                                    } : {},
                                    '&:hover::after': isSelected && isDarkSidebar ? {
                                        left: '130%',
                                    } : {},
                                    '&:hover': {
                                        bgcolor: isSelected ? selectedHoverBg : hoverBg,
                                    },
                                    transition: 'all 0.2s',
                                }}
                            >
                                <ListItemIcon
                                    sx={{
                                        minWidth: 0,
                                        mr: showExpanded ? 1.25 : 0,
                                        justifyContent: 'center',
                                        color: isSelected ? selectedIconColor : inactiveIconColor,
                                    }}
                                >
                                    {item.icon}
                                </ListItemIcon>

                                <ListItemText
                                    primary={item.text}
                                    sx={{ display: showExpanded ? 'block' : 'none', my: 0 }}
                                    slotProps={{
                                        primary: {
                                            sx: {
                                                fontSize: sidebar.itemFontSize,
                                                fontWeight: isSelected ? sidebar.itemFontWeightSelected : sidebar.itemFontWeight,
                                                color: isSelected ? selectedTextColor : inactiveTextColor,
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
                            background: mobileSidebarBg,
                            borderRight: '1px solid',
                            borderColor: 'divider',
                            top: '40px',
                            height: 'calc(100% - 40px)',
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
                            background: sidebarBg,
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
