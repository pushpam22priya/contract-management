'use client';

import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import {
    Box,
    Button,
    TextField,
    Typography,
    Checkbox,
    FormControlLabel,
    Link,
    Paper,
    InputAdornment,
    useMediaQuery,
    useTheme,
    Stack,
    Alert,
    CircularProgress,
} from '@mui/material';
import EmailOutlinedIcon from '@mui/icons-material/EmailOutlined';
import LockOutlinedIcon from '@mui/icons-material/LockOutlined';
import GavelIcon from '@mui/icons-material/Gavel';
import ArrowForwardIcon from '@mui/icons-material/ArrowForward';
import ContractIcon from '@/components/ContractIcon';
import { authService } from '@/services/authService';

export default function LoginPage() {
    const theme = useTheme();
    const router = useRouter();
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const isMobile = useMediaQuery(theme.breakpoints.down('md'));

    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');
    const [success, setSuccess] = useState('');

    const handleSignIn = async (e: React.FormEvent) => {
        e.preventDefault();
        setError('');
        setSuccess('');
        setLoading(true);

        try {
            const response = await authService.login({ email, password });

            if (response.success) {
                setSuccess(response.message);
                // Navigate to dashboard after a short delay to show success message
                setTimeout(() => {
                    router.push('/dashboard');
                }, 800);
            } else {
                setError(response.message);
            }
        } catch (err) {
            setError('An unexpected error occurred. Please try again.');
        } finally {
            setLoading(false);
        }
    };

    return (
        <Box
            sx={{
                minHeight: '100vh',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                background: 'linear-gradient(135deg, #129191ff 0%, #115e59 50%, #134e4a 100%)',
                backgroundSize: '400% 400%',
                animation: 'gradientShift 15s ease infinite',
                p: 2,
                position: 'relative',
                overflow: 'hidden',
                '@keyframes gradientShift': {
                    '0%': { backgroundPosition: '0% 50%' },
                    '50%': { backgroundPosition: '100% 50%' },
                    '100%': { backgroundPosition: '0% 50%' },
                },
                '&::before': {
                    content: '""',
                    position: 'absolute',
                    top: 0,
                    left: 0,
                    right: 0,
                    bottom: 0,
                    background: 'radial-gradient(circle at 20% 80%, rgba(255, 255, 255, 0.1) 0%, transparent 50%), radial-gradient(circle at 80% 20%, rgba(255, 255, 255, 0.15) 0%, transparent 50%)',
                    pointerEvents: 'none',
                },
            }}
        >
            {/* Floating animated circles */}
            <Box
                sx={{
                    position: 'absolute',
                    top: '10%',
                    left: '15%',
                    width: 300,
                    height: 300,
                    borderRadius: '50%',
                    background: 'radial-gradient(circle, rgba(255,255,255,0.2) 0%, rgba(255,255,255,0) 70%)',
                    animation: 'float 8s ease-in-out infinite',
                    '@keyframes float': {
                        '0%, 100%': { transform: 'translate(0, 0) scale(1)' },
                        '50%': { transform: 'translate(30px, -30px) scale(1.1)' },
                    },
                }}
            />
            <Box
                sx={{
                    position: 'absolute',
                    bottom: '15%',
                    right: '10%',
                    width: 400,
                    height: 400,
                    borderRadius: '50%',
                    background: 'radial-gradient(circle, rgba(255,255,255,0.15) 0%, rgba(255,255,255,0) 70%)',
                    animation: 'float 10s ease-in-out infinite reverse',
                }}
            />
            <Box
                sx={{
                    position: 'absolute',
                    top: '50%',
                    right: '25%',
                    width: 200,
                    height: 200,
                    borderRadius: '50%',
                    background: 'radial-gradient(circle, rgba(255,255,255,0.1) 0%, rgba(255,255,255,0) 70%)',
                    animation: 'float 12s ease-in-out infinite',
                }}
            />

            <Paper
                elevation={0}
                sx={{
                    maxWidth: 1000,
                    width: '100%',
                    display: 'flex',
                    overflow: 'hidden',
                    borderRadius: 8,
                    boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.25)',
                    flexDirection: { xs: 'column', md: 'row' },
                    position: 'relative',
                    zIndex: 1,
                }}
            >
                {/* Left Side - Branding (Hidden on Mobile) */}
                <Box
                    sx={{
                        display: { xs: 'none', md: 'flex' },
                        width: { md: '50%' },
                        flexDirection: 'column',
                        justifyContent: 'center',
                        alignItems: 'center',
                        p: 6,
                        background: 'linear-gradient(135deg, #0f766e 0%, #115e59 50%, #134e4a 100%)',
                        color: 'white',
                        position: 'relative',
                        overflow: 'hidden',
                    }}
                >
                    {/* Decorative Circles */}
                    <Box
                        sx={{
                            position: 'absolute',
                            top: -50,
                            left: -50,
                            width: 200,
                            height: 200,
                            borderRadius: '50%',
                            background: 'rgba(255,255,255,0.15)',
                            animation: 'pulse 4s ease-in-out infinite',
                            '@keyframes pulse': {
                                '0%, 100%': { transform: 'scale(1)', opacity: 0.15 },
                                '50%': { transform: 'scale(1.1)', opacity: 0.25 },
                            },
                        }}
                    />
                    <Box
                        sx={{
                            position: 'absolute',
                            bottom: -80,
                            right: -80,
                            width: 300,
                            height: 300,
                            borderRadius: '50%',
                            background: 'rgba(255,255,255,0.1)',
                            animation: 'pulse 6s ease-in-out infinite reverse',
                        }}
                    />

                    <Box sx={{ zIndex: 1, textAlign: 'center' }}>
                        <Box
                            sx={{
                                width: 80,
                                height: 80,
                                bgcolor: 'rgba(255,255,255,0.25)',
                                borderRadius: 3,
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                mb: 3,
                                mx: 'auto',
                                backdropFilter: 'blur(10px)',
                                boxShadow: '0 8px 32px rgba(0,0,0,0.1)',
                            }}
                        >
                            <ContractIcon sx={{ fontSize: 45 }} />
                        </Box>
                        <Typography variant="h3" fontWeight="bold" gutterBottom>
                            Contract Management
                        </Typography>
                        <Typography variant="subtitle1" sx={{ opacity: 0.95, mb: 4, maxWidth: 350, mx: 'auto', lineHeight: 1.6 }}>
                            Effortless contract lifecycle management. Create, track, and sign documents with confidence and security.
                        </Typography>
                    </Box>
                </Box>

                {/* Right Side - Login Form */}
                <Box
                    sx={{
                        width: { xs: '100%', md: '50%' },
                        p: { xs: 4, md: 8 },
                        display: 'flex',
                        flexDirection: 'column',
                        justifyContent: 'center',
                        bgcolor: '#f0fff7ff',
                    }}
                >
                    <Box sx={{ mb: 4 }}>
                        <Typography variant="h4" gutterBottom fontWeight="600">
                            Welcome Back
                        </Typography>
                        <Typography variant="body1" color="text.secondary">
                            Please enter your details to sign in.
                        </Typography>
                    </Box>

                    <Box component="form" noValidate onSubmit={handleSignIn}>
                        {error && (
                            <Alert severity="error" sx={{ mb: 2 }}>
                                {error}
                            </Alert>
                        )}
                        {success && (
                            <Alert severity="success" sx={{ mb: 2 }}>
                                {success}
                            </Alert>
                        )}

                        <Stack spacing={2}>
                            <TextField
                                required
                                fullWidth
                                id="email"
                                label="Email Address"
                                name="email"
                                autoComplete="email"
                                autoFocus
                                value={email}
                                onChange={(e) => setEmail(e.target.value)}
                                disabled={loading}
                                InputProps={{
                                    startAdornment: (
                                        <InputAdornment position="start">
                                            <EmailOutlinedIcon color="action" />
                                        </InputAdornment>
                                    ),
                                }}
                            />
                            <TextField
                                required
                                fullWidth
                                name="password"
                                label="Password"
                                type="password"
                                id="password"
                                autoComplete="current-password"
                                value={password}
                                onChange={(e) => setPassword(e.target.value)}
                                disabled={loading}
                                InputProps={{
                                    startAdornment: (
                                        <InputAdornment position="start">
                                            <LockOutlinedIcon color="action" />
                                        </InputAdornment>
                                    ),
                                }}
                            />
                        </Stack>

                        <Button
                            type="submit"
                            fullWidth
                            variant="contained"
                            size="large"
                            endIcon={loading ? <CircularProgress size={20} color="inherit" /> : <ArrowForwardIcon />}
                            disabled={loading}
                            sx={{
                                py: 1.5,
                                mt: 2,
                                fontSize: '1rem',
                                textTransform: 'none',
                                background: '#115e59',
                                '&:hover': {
                                    background: '#0f4c47',
                                    boxShadow: '0 8px 24px rgba(15, 118, 110, 0.4)',
                                },
                                '&:disabled': {
                                    background: '#115e5980',
                                },
                            }}
                        >
                            {loading ? 'Signing In...' : 'Sign In'}
                        </Button>

                    </Box>
                </Box>
            </Paper>
        </Box>
    );
}
