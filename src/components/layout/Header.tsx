'use client';

import { AppBar, Toolbar, Box, IconButton, Badge, Avatar, Typography, Tooltip } from '@mui/material';
import NotificationsOutlinedIcon from '@mui/icons-material/NotificationsOutlined';
import LogoutOutlinedIcon from '@mui/icons-material/LogoutOutlined';
import ContractIcon from '@/components/ContractIcon';
import { useRouter } from 'next/navigation';
import { authService } from '@/services/authService';
import { useState, useEffect } from 'react';

export default function Header() {
    const router = useRouter();
    const [userInitial, setUserInitial] = useState('U');
    const [userEmail, setUserEmail] = useState('');

    useEffect(() => {
        const currentUser = authService.getCurrentUser();
        if (currentUser && currentUser.email) {
            // Get first letter of email and capitalize it
            const initial = currentUser.email.charAt(0).toUpperCase();
            setUserInitial(initial);
            setUserEmail(currentUser.email);
        }
    }, []);

    const handleLogout = () => {
        authService.logout();
        console.log('Logging out...');
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
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1}}>
                    <Box
                        sx={{
                            // width: 40,
                            // height: 40,
                            bgcolor: 'primary.main',
                            borderRadius: 1,
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            color: 'white',
                            p: 0.2
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

                {/* Right: Notifications + Avatar */}
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                    <IconButton
                        size="small"
                        color="inherit"
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
                            <NotificationsOutlinedIcon sx={{ color: 'text.secondary', fontSize: '24px' }} />
                        </Badge>
                    </IconButton>
                    <Tooltip title={userEmail || 'User'} arrow>
                        <Avatar
                            sx={{
                                width: 24,
                                height: 24,
                                bgcolor: 'primary.main',
                                fontSize: '0.875rem',
                                fontWeight: 600,
                                cursor: 'pointer',
                            }}
                        >
                            {userInitial}
                        </Avatar>
                    </Tooltip>

                    <Tooltip title="Logout" arrow>
                        <IconButton
                            onClick={handleLogout}
                            size="medium"
                            sx={{
                                color: 'text.secondary',
                                '&:hover': {
                                    color: 'error.main',
                                    bgcolor: 'rgba(211, 47, 47, 0.08)',
                                },
                                p: 0
                            }}
                        >
                            <LogoutOutlinedIcon sx={{ color: 'text.secondary', fontSize: '24px' }} />
                        </IconButton>
                    </Tooltip>
                </Box>
            </Toolbar>
        </AppBar>
    );
}
