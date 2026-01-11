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
                borderBottom: '1px solid',
                borderColor: 'divider',
                zIndex: (theme) => theme.zIndex.drawer + 1,
            }}
        >
            <Toolbar sx={{ justifyContent: 'space-between' }}>
                {/* Left: Logo + Name */}
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
                    <Box
                        sx={{
                            width: 40,
                            height: 40,
                            bgcolor: 'primary.main',
                            borderRadius: 2,
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            color: 'white',
                        }}
                    >
                        <ContractIcon sx={{ fontSize: 24 }} />
                    </Box>
                    <Typography
                        variant="h6"
                        sx={{
                            fontWeight: 700,
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
                        size="large"
                        color="inherit"
                        onClick={() => router.push('/notifications')}
                    >
                        <Badge badgeContent={3} color="error">
                            <NotificationsOutlinedIcon sx={{ color: 'text.secondary' }} />
                        </Badge>
                    </IconButton>
                    <Tooltip title={userEmail || 'User'} arrow>
                        <Avatar
                            sx={{
                                width: 36,
                                height: 36,
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
                            }}
                        >
                            <LogoutOutlinedIcon sx={{ color: 'text.secondary' }} />
                        </IconButton>
                    </Tooltip>
                </Box>
            </Toolbar>
        </AppBar>
    );
}
