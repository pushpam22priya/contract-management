'use client';

import React, { useState, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useForm, Controller } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { makeLoginSchema, type LoginForm } from '@/schemas/loginSchema';
import {
    Box,
    TextField,
    Typography,
    Paper,
    InputAdornment,
    useTheme,
    Stack,
    Alert,
} from '@mui/material';
import EmailOutlinedIcon from '@mui/icons-material/EmailOutlined';
import LockOutlinedIcon from '@mui/icons-material/LockOutlined';
import ArrowForwardIcon from '@mui/icons-material/ArrowForward';
import ContractIcon from '@/components/ContractIcon';
import { authService } from '@/services/authService';
import AppButton from '@/components/common/AppButton';

// ─────────────────────────────────────────────────────────────────────────────

export default function LoginPage() {
    const theme = useTheme();
    const router = useRouter();
    const t = useTranslations('login');

    const [loading, setLoading] = useState(false);
    const [apiError, setApiError] = useState('');
    const [success, setSuccess] = useState('');

    const loginSchema = useMemo(() => makeLoginSchema(t), [t]);

    const { control, handleSubmit } = useForm<LoginForm>({
        resolver: zodResolver(loginSchema),
        defaultValues: { email: '', password: '' },
    });

    // ── Pull every colour from the active theme ───────────────────────────────
    const loginTheme = theme.login;
    const isDark = theme.palette.mode === 'dark';

    const onSubmit = async (data: LoginForm) => {
        setApiError('');
        setSuccess('');
        setLoading(true);
        try {
            const response = await authService.login(data);
            if (response.success) {
                setSuccess(response.message);
                setTimeout(() => router.push('/dashboard'), 800);
            } else {
                setApiError(response.message);
            }
        } catch {
            setApiError(t('unexpectedError'));
        } finally {
            setLoading(false);
        }
    };

    // Shared sx for both TextFields — preserves the login panel colour theming
    const fieldSx = {
        '& .MuiInputLabel-root': { color: `${loginTheme.rightPanelText}99` },
        '& .MuiOutlinedInput-root': {
            color: loginTheme.rightPanelText,
            bgcolor: isDark ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.03)',
            '& fieldset': { borderColor: `${loginTheme.rightPanelText}33` },
            '&:hover fieldset': { borderColor: `${loginTheme.rightPanelText}66` },
            '&.Mui-focused fieldset': { borderColor: loginTheme.buttonBackground },
        },
        '& .MuiSvgIcon-root': { color: `${loginTheme.rightPanelText}80` },
    };

    return (
        <Box
            sx={{
                minHeight: '100vh',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                background: loginTheme.pageBackground,
                backgroundSize: '400% 400%',
                animation: 'loginGradientShift 15s ease infinite',
                p: 2,
                position: 'relative',
                overflow: 'hidden',
                '@keyframes loginGradientShift': {
                    '0%':   { backgroundPosition: '0% 50%' },
                    '50%':  { backgroundPosition: '100% 50%' },
                    '100%': { backgroundPosition: '0% 50%' },
                },
                '&::before': {
                    content: '""',
                    position: 'absolute',
                    inset: 0,
                    background:
                        'radial-gradient(circle at 20% 80%, rgba(255,255,255,0.08) 0%, transparent 50%), ' +
                        'radial-gradient(circle at 80% 20%, rgba(255,255,255,0.12) 0%, transparent 50%)',
                    pointerEvents: 'none',
                },
            }}
        >
            {/* Floating ambient circles */}
            <Box
                sx={{
                    position: 'absolute',
                    top: '10%', left: '15%',
                    width: 300, height: 300,
                    borderRadius: '50%',
                    background: 'radial-gradient(circle, rgba(255,255,255,0.15) 0%, rgba(255,255,255,0) 70%)',
                    animation: 'loginFloat 8s ease-in-out infinite',
                    '@keyframes loginFloat': {
                        '0%, 100%': { transform: 'translate(0,0) scale(1)' },
                        '50%':      { transform: 'translate(30px,-30px) scale(1.1)' },
                    },
                }}
            />
            <Box
                sx={{
                    position: 'absolute',
                    bottom: '15%', right: '10%',
                    width: 400, height: 400,
                    borderRadius: '50%',
                    background: 'radial-gradient(circle, rgba(255,255,255,0.10) 0%, rgba(255,255,255,0) 70%)',
                    animation: 'loginFloat 10s ease-in-out infinite reverse',
                }}
            />
            <Box
                sx={{
                    position: 'absolute',
                    top: '50%', right: '25%',
                    width: 200, height: 200,
                    borderRadius: '50%',
                    background: 'radial-gradient(circle, rgba(255,255,255,0.08) 0%, rgba(255,255,255,0) 70%)',
                    animation: 'loginFloat 12s ease-in-out infinite',
                }}
            />

            <Paper
                elevation={0}
                sx={{
                    maxWidth: 1000,
                    width: '100%',
                    display: 'flex',
                    overflow: 'hidden',
                    borderRadius: 4,
                    boxShadow: '0 25px 50px -12px rgba(0,0,0,0.35)',
                    flexDirection: { xs: 'column', md: 'row' },
                    position: 'relative',
                    zIndex: 1,
                    bgcolor: 'transparent',
                    background: 'transparent',
                    backdropFilter: 'none',
                    border: isDark ? '1px solid rgba(255,255,255,0.08)' : 'none',
                }}
            >
                {/* ── Left Side — Branding ────────────────────────────────────── */}
                <Box
                    sx={{
                        display: { xs: 'none', md: 'flex' },
                        width: { md: '50%' },
                        flexDirection: 'column',
                        justifyContent: 'center',
                        alignItems: 'center',
                        p: 6,
                        background: loginTheme.leftPanelBackground,
                        color: 'white',
                        position: 'relative',
                        overflow: 'hidden',
                        '& .MuiTypography-root': { color: 'white' },
                    }}
                >
                    {/* Decorative circles */}
                    <Box
                        sx={{
                            position: 'absolute',
                            top: -50, left: -50,
                            width: 200, height: 200,
                            borderRadius: '50%',
                            background: isDark ? 'rgba(132,116,180,0.22)' : 'rgba(255,255,255,0.12)',
                            animation: 'loginPulse1 4s ease-in-out infinite',
                            '@keyframes loginPulse1': {
                                '0%, 100%': { transform: 'scale(1)' },
                                '50%':      { transform: 'scale(1.08)' },
                            },
                        }}
                    />
                    <Box
                        sx={{
                            position: 'absolute',
                            bottom: -80, right: -80,
                            width: 300, height: 300,
                            borderRadius: '50%',
                            background: isDark ? 'rgba(132,116,180,0.15)' : 'rgba(255,255,255,0.08)',
                            animation: 'loginPulse2 6s ease-in-out infinite',
                            '@keyframes loginPulse2': {
                                '0%, 100%': { transform: 'scale(1)' },
                                '50%':      { transform: 'scale(1.05)' },
                            },
                        }}
                    />

                    <Box sx={{ zIndex: 1, textAlign: 'center' }}>
                        {/* Logo box */}
                        <Box
                            sx={{
                                width: 80, height: 80,
                                bgcolor: 'rgba(255,255,255,0.25)',
                                borderRadius: 3,
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                mb: 3, mx: 'auto',
                                backdropFilter: 'blur(10px)',
                                boxShadow: '0 8px 32px rgba(0,0,0,0.15)',
                                border: '1px solid rgba(255,255,255,0.20)',
                            }}
                        >
                            <ContractIcon sx={{ fontSize: 45 }} />
                        </Box>

                        <Typography variant="h4" fontWeight="bold" gutterBottom>
                            {t('title')}
                        </Typography>
                        <Typography
                            variant="body2"
                            sx={{ opacity: 0.90, mb: 4, maxWidth: 350, mx: 'auto', lineHeight: 1.6 }}
                        >
                            {t('description').split('\n').map((line, i) => (
                                <React.Fragment key={i}>
                                    {line}
                                    {i === 0 && <br />}
                                </React.Fragment>
                            ))}
                        </Typography>
                    </Box>
                </Box>

                {/* ── Right Side — Login Form ─────────────────────────────────── */}
                <Box
                    sx={{
                        width: { xs: '100%', md: '50%' },
                        p: { xs: 4, md: 8 },
                        display: 'flex',
                        flexDirection: 'column',
                        justifyContent: 'center',
                        bgcolor: loginTheme.rightPanelBackground,
                        color: loginTheme.rightPanelText,
                        '& .MuiTypography-root': {
                            color: loginTheme.rightPanelText,
                        },
                        '& .MuiTypography-colorTextSecondary, & .MuiTypography-root[color="text.secondary"]': {
                            color: loginTheme.rightPanelText,
                            opacity: 0.65,
                        },
                    }}
                >
                    <Box sx={{ mb: 4 }}>
                        <Typography variant="h4" gutterBottom fontWeight="600">
                            {t('welcomeBack')}
                        </Typography>
                        <Typography variant="body2" sx={{ opacity: 0.65 }}>
                            {t('pleaseEnterDetails')}
                        </Typography>
                    </Box>

                    <Box component="form" noValidate onSubmit={handleSubmit(onSubmit)}>
                        {apiError && (
                            <Alert severity="error" sx={{ mb: 2 }}>
                                <Typography variant="body2" color="inherit">{apiError}</Typography>
                            </Alert>
                        )}
                        {success && (
                            <Alert severity="success" sx={{ mb: 2 }}>
                                <Typography variant="body2" color="inherit">{success}</Typography>
                            </Alert>
                        )}

                        <Stack spacing={2}>
                            <Controller
                                name="email"
                                control={control}
                                render={({ field, fieldState }) => (
                                    <TextField
                                        {...field}
                                        required
                                        fullWidth
                                        label={t('emailAddress')}
                                        autoComplete="email"
                                        autoFocus
                                        disabled={loading}
                                        error={!!fieldState.error}
                                        helperText={fieldState.error?.message}
                                        sx={fieldSx}
                                        slotProps={{ input: { startAdornment: (
                                            <InputAdornment position="start">
                                                <EmailOutlinedIcon />
                                            </InputAdornment>
                                        ) } }}
                                    />
                                )}
                            />
                            <Controller
                                name="password"
                                control={control}
                                render={({ field, fieldState }) => (
                                    <TextField
                                        {...field}
                                        required
                                        fullWidth
                                        label={t('password')}
                                        type="password"
                                        autoComplete="current-password"
                                        disabled={loading}
                                        error={!!fieldState.error}
                                        helperText={fieldState.error?.message}
                                        sx={fieldSx}
                                        slotProps={{ input: { startAdornment: (
                                            <InputAdornment position="start">
                                                <LockOutlinedIcon />
                                            </InputAdornment>
                                        ) } }}
                                    />
                                )}
                            />
                        </Stack>

                        <AppButton
                            type="submit"
                            fullWidth
                            variant="contained"
                            size="large"
                            loading={loading}
                            endIcon={<ArrowForwardIcon />}
                            sx={{
                                py: 1.5,
                                mt: 3,
                                fontSize: '1rem',
                                fontWeight: 600,
                                borderRadius: 2,
                                background: loginTheme.buttonBackground,
                                color: '#ffffff',
                                boxShadow: 'none',
                                '&:hover': {
                                    background: loginTheme.buttonHover,
                                    boxShadow: `0 8px 24px ${loginTheme.buttonBackground}55`,
                                },
                                '&.Mui-disabled': {
                                    background: loginTheme.buttonDisabled,
                                    color: 'rgba(255,255,255,0.6)',
                                },
                            }}
                        >
                            {loading ? t('signingIn') : t('signIn')}
                        </AppButton>
                    </Box>
                </Box>
            </Paper>
        </Box>
    );
}
