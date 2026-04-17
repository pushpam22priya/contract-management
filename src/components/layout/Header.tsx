'use client';

import { AppBar, Toolbar, Box, IconButton, Badge, Typography, Tooltip } from '@mui/material';
import NotificationsOutlinedIcon from '@mui/icons-material/NotificationsOutlined';
import LogoutOutlinedIcon from '@mui/icons-material/LogoutOutlined';
import ContractIcon from '@/components/ContractIcon';
import { useRouter } from 'next/navigation';
import { authService } from '@/services/authService';
import { useTranslations } from 'next-intl';
import LanguageToggle from './LanguageToggle';

export default function Header() {
    const router = useRouter();
    const t = useTranslations('header');

    const handleLogout = () => {
        authService.logout();
        router.push('/login');
    };

    return (
        <AppBar
            position="fixed"
            elevation={0}
            sx={{
                bgcolor: 'background.paper',
                borderBottom: '1px solid #88888854',
                boxShadow: '0 4px 12px rgba(15, 118, 110, 0.15)',
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

                {/* Left: Logo + Name */}
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                    <Box
                        sx={{
                            bgcolor: 'primary.main',
                            borderRadius: 1,
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            color: 'white',
                            p: 0.2,
                        }}
                    >
                        <ContractIcon sx={{ fontSize: 24 }} />
                    </Box>
                    <Typography
                        variant="h6"
                        sx={{
                            fontWeight: 600,
                            color: 'primary.main',
                            display: { xs: 'none', sm: 'block' },
                        }}
                    >
                        Contract Management
                    </Typography>
                </Box>

                {/* Right: Language Toggle + Notifications + Logout */}
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
                    <LanguageToggle />

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
                </Box>
            </Toolbar>
        </AppBar>
    );
}
