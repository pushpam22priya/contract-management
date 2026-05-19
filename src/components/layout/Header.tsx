'use client';

import { useState } from 'react';
import { AppBar, Toolbar, Box, IconButton, Badge, Typography, Tooltip, useMediaQuery, useTheme, Menu, MenuItem, Divider } from '@mui/material';
import { alpha } from '@mui/material/styles';
import NotificationsOutlinedIcon from '@mui/icons-material/NotificationsOutlined';
import LogoutOutlinedIcon from '@mui/icons-material/LogoutOutlined';
import SettingsOutlinedIcon from '@mui/icons-material/SettingsOutlined';
import MenuIcon from '@mui/icons-material/Menu';
import MoreVertIcon from '@mui/icons-material/MoreVert';
import ContractIcon from '@/components/ContractIcon';
import { useRouter } from 'next/navigation';
import { authService } from '@/services/authService';
import { useTranslations } from 'next-intl';
import LanguageToggle from './LanguageToggle';
import ThemeToggle from './ThemeToggle';
import ProfileSettingsDialog from './ProfileSettingsDialog';

interface HeaderProps {
    onMobileMenuToggle?: () => void;
}

export default function Header({ onMobileMenuToggle }: HeaderProps) {
    const router = useRouter();
    const t = useTranslations('header');
    const theme = useTheme();
    const isMobile = useMediaQuery(theme.breakpoints.down('md'));
    const [moreAnchorEl, setMoreAnchorEl] = useState<null | HTMLElement>(null);
    const [profileOpen, setProfileOpen] = useState(false);

    const handleLogout = () => {
        authService.logout();
        router.push('/login');
    };

    const handleMoreOpen = (e: React.MouseEvent<HTMLElement>) => setMoreAnchorEl(e.currentTarget);
    const handleMoreClose = () => setMoreAnchorEl(null);

    return (
        <>
        <AppBar
            position="fixed"
            elevation={0}
            sx={{
                bgcolor: 'background.paper',
                borderBottom: '1px solid',
                borderColor: 'divider',
                boxShadow: (theme) => `0 4px 12px ${theme.palette.mode === 'dark' ? 'rgba(0,0,0,0.3)' : `rgba(0,0,0,0.08)`}`,
                zIndex: (theme) => theme.zIndex.drawer + 1,
            }}
        >
            <Toolbar sx={{
                justifyContent: 'space-between',
                minHeight: '0 !important',
                '@media (min-width: 0px)': { minHeight: '0 !important' },
                '@media (min-width: 600px)': { minHeight: '0 !important' },
                p: '4px 8px',
            }}>

                {/* Left: Hamburger (mobile) + Logo + Name */}
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                    {isMobile && (
                        <IconButton
                            size="small"
                            onClick={onMobileMenuToggle}
                            sx={{ p: 0.5, ml: 0, color: 'text.secondary' }}
                        >
                            <MenuIcon sx={{ fontSize: 22 }} />
                        </IconButton>
                    )}
                    <Box
                        sx={{
                            bgcolor: (theme) => theme.palette.mode === 'dark' ? alpha(theme.palette.primary.main, 0.18) : 'primary.main',
                            border: (theme) => theme.palette.mode === 'dark' ? `1px solid ${alpha(theme.palette.primary.main, 0.30)}` : 'none',
                            borderRadius: 1,
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            color: (theme) => theme.palette.mode === 'dark' ? '#c0b4e0' : 'white',
                            p: 0.2,
                        }}
                    >
                        <ContractIcon sx={{ fontSize: 24 }} />
                    </Box>
                    <Typography
                        variant="h6"
                        sx={{
                            fontWeight: 600,
                            color: 'text.primary',
                            display: { xs: 'none', sm: 'block' },
                        }}
                    >
                        Contract Management
                    </Typography>
                </Box>

                {/* Right */}
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
                    {/* Desktop: show all controls inline */}
                    {!isMobile && (
                        <>
                            <ThemeToggle />
                            <LanguageToggle />
                        </>
                    )}

                    {/* Notifications — always visible */}
                    <Tooltip title={t('notifications')} arrow placement="bottom">
                        <IconButton
                            size="small"
                            onClick={() => router.push('/notifications')}
                            sx={{ p: 0.5 }}
                        >
                            <Badge
                                badgeContent={3}
                                color="error"
                                sx={{
                                    '& .MuiBadge-badge': {
                                        fontSize: '0.6rem',
                                        height: 16,
                                        minWidth: 16,
                                        padding: '0 4px',
                                        top: 4,
                                        right: 4,
                                    },
                                }}
                            >
                                <NotificationsOutlinedIcon sx={{ color: 'text.secondary', fontSize: '22px' }} />
                            </Badge>
                        </IconButton>
                    </Tooltip>

                    {/* Desktop: settings + logout inline */}
                    {!isMobile && (
                        <>
                            <Tooltip title={t('settings')} arrow placement="bottom">
                                <IconButton
                                    size="small"
                                    onClick={() => setProfileOpen(true)}
                                    sx={{ p: 0.5, color: 'text.secondary' }}
                                >
                                    <SettingsOutlinedIcon sx={{ fontSize: '22px' }} />
                                </IconButton>
                            </Tooltip>
                            <Tooltip title={t('logout')} arrow placement="bottom">
                                <IconButton
                                    onClick={handleLogout}
                                    size="small"
                                    sx={{
                                        p: 0.5,
                                        color: 'text.secondary',
                                        '&:hover': {
                                            color: 'error.main',
                                            bgcolor: 'rgba(211, 47, 47, 0.08)',
                                        },
                                    }}
                                >
                                    <LogoutOutlinedIcon sx={{ fontSize: '22px' }} />
                                </IconButton>
                            </Tooltip>
                        </>
                    )}

                    {/* Mobile: three-dot overflow menu */}
                    {isMobile && (
                        <>
                            <IconButton
                                size="small"
                                onClick={handleMoreOpen}
                                sx={{ p: 0.5, color: 'text.secondary' }}
                            >
                                <MoreVertIcon sx={{ fontSize: 22 }} />
                            </IconButton>

                            <Menu
                                anchorEl={moreAnchorEl}
                                open={Boolean(moreAnchorEl)}
                                onClose={handleMoreClose}
                                anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
                                transformOrigin={{ vertical: 'top', horizontal: 'right' }}
                                slotProps={{
                                    paper: {
                                        sx: {
                                            mt: 0.75,
                                            minWidth: 220,
                                            borderRadius: 2.5,
                                            py: 0.5,
                                            overflow: 'visible',
                                        },
                                    },
                                }}
                            >
                                {/* Theme section */}
                                <Box sx={{ px: 2, pt: 1.25, pb: 1 }}>
                                    <Typography sx={{
                                        fontSize: '0.62rem',
                                        fontWeight: 700,
                                        color: 'text.disabled',
                                        textTransform: 'uppercase',
                                        letterSpacing: '0.07em',
                                        mb: 0.75,
                                    }}>
                                        {t('theme')}
                                    </Typography>
                                    <ThemeToggle />
                                </Box>

                                <Divider sx={{ mx: 1.5 }} />

                                {/* Language section */}
                                <Box sx={{ px: 2, py: 1 }}>
                                    <Typography sx={{
                                        fontSize: '0.62rem',
                                        fontWeight: 700,
                                        color: 'text.disabled',
                                        textTransform: 'uppercase',
                                        letterSpacing: '0.07em',
                                        mb: 0.75,
                                    }}>
                                        {t('language')}
                                    </Typography>
                                    <LanguageToggle />
                                </Box>

                                <Divider sx={{ mx: 1.5 }} />

                                {/* Settings */}
                                <MenuItem
                                    onClick={() => { handleMoreClose(); setProfileOpen(true); }}
                                    sx={{
                                        mx: 0.75,
                                        mt: 0.5,
                                        borderRadius: 1.5,
                                        px: 1.5,
                                        py: 1,
                                        '&:hover': { bgcolor: 'action.hover' },
                                    }}
                                >
                                    <SettingsOutlinedIcon sx={{ fontSize: 18, mr: 1.25, color: 'text.secondary' }} />
                                    <Typography sx={{ fontSize: '0.82rem', fontWeight: 500 }}>
                                        {t('settings')}
                                    </Typography>
                                </MenuItem>

                                <Divider sx={{ mx: 1.5 }} />

                                {/* Logout */}
                                <MenuItem
                                    onClick={() => { handleMoreClose(); handleLogout(); }}
                                    sx={{
                                        mx: 0.75,
                                        mt: 0.5,
                                        mb: 0.5,
                                        borderRadius: 1.5,
                                        px: 1.5,
                                        py: 1,
                                        color: 'error.main',
                                        '&:hover': { bgcolor: 'rgba(211,47,47,0.08)' },
                                    }}
                                >
                                    <LogoutOutlinedIcon sx={{ fontSize: 18, mr: 1.25 }} />
                                    <Typography sx={{ fontSize: '0.82rem', fontWeight: 500, color: 'error.main' }}>
                                        {t('logout')}
                                    </Typography>
                                </MenuItem>
                            </Menu>
                        </>
                    )}
                </Box>
            </Toolbar>
        </AppBar>

        <ProfileSettingsDialog open={profileOpen} onClose={() => setProfileOpen(false)} />
        </>
    );
}
