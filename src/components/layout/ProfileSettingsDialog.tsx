'use client';

import { useState, useEffect } from 'react';
import {
    Box,
    Typography,
    TextField,
    Avatar,
    Chip,
    InputAdornment,
    CircularProgress,
    alpha,
    useTheme,
} from '@mui/material';
import PersonOutlinedIcon from '@mui/icons-material/PersonOutlined';
import BusinessOutlinedIcon from '@mui/icons-material/BusinessOutlined';
import CorporateFareOutlinedIcon from '@mui/icons-material/CorporateFare';
import EmailOutlinedIcon from '@mui/icons-material/EmailOutlined';
import BaseDialog from '@/components/common/BaseDialog';
import AppButton from '@/components/common/AppButton';
import NotificationSnackbar from '@/components/common/NotificationSnackbar';
import { authService } from '@/services/authService';
import { useTranslations } from 'next-intl';

interface ProfileSettingsDialogProps {
    open: boolean;
    onClose: () => void;
}

export default function ProfileSettingsDialog({ open, onClose }: ProfileSettingsDialogProps) {
    const t = useTranslations('profileSettings');
    const theme = useTheme();
    const isDark = theme.palette.mode === 'dark';

    const currentUser = authService.getCurrentUser();

    const [name, setName] = useState('');
    const [department, setDepartment] = useState('');
    const [organization, setOrganization] = useState('');
    const [fetching, setFetching] = useState(false);
    const [saving, setSaving] = useState(false);
    const [snackbar, setSnackbar] = useState<{ open: boolean; message: string; severity: 'success' | 'error' }>({
        open: false,
        message: '',
        severity: 'success',
    });

    useEffect(() => {
        if (!open || !currentUser?.email) return;

        const controller = new AbortController();

        setFetching(true);
        fetch(`/api/users/profile?email=${encodeURIComponent(currentUser.email)}`, {
            signal: controller.signal,
        })
            .then((r) => r.json())
            .then((data) => {
                setName(data.name || '');
                setDepartment(data.department || '');
                setOrganization(data.organization || '');
            })
            .catch((err) => {
                if (err.name === 'AbortError') return;
                setName(currentUser.name || '');
                setDepartment(currentUser.department || '');
                setOrganization(currentUser.organization || '');
            })
            .finally(() => {
                if (!controller.signal.aborted) setFetching(false);
            });

        return () => controller.abort();
    }, [open]);

    const getInitials = (email: string) => {
        if (name?.trim()) return name.trim()[0].toUpperCase();
        const local = email.split('@')[0];
        const parts = local.split(/[._-]/);
        if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
        return local.slice(0, 2).toUpperCase();
    };

    const handleSave = async () => {
        setSaving(true);
        const result = await authService.updateProfile({ name, department, organization });
        setSaving(false);

        setSnackbar({
            open: true,
            message: result.success ? t('saveSuccess') : (result.message || t('saveError')),
            severity: result.success ? 'success' : 'error',
        });

        if (result.success) {
            setTimeout(onClose, 1200);
        }
    };

    const gradientBg = isDark
        ? `linear-gradient(135deg, ${alpha(theme.palette.primary.dark, 0.85)} 0%, ${alpha(theme.palette.primary.main, 0.6)} 100%)`
        : `linear-gradient(135deg, ${theme.palette.primary.dark} 0%, ${theme.palette.primary.main} 100%)`;

    return (
        <>
            <BaseDialog
                open={open}
                onClose={onClose}
                title={t('title')}
                maxWidth="xs"
                noPadding
                actions={
                    <>
                        <AppButton variant="outlined" onClick={onClose} disabled={saving} size="small">
                            {t('cancel')}
                        </AppButton>
                        <AppButton
                            variant="contained"
                            onClick={handleSave}
                            disabled={fetching || saving}
                            size="small"
                            startIcon={saving ? <CircularProgress size={14} color="inherit" /> : undefined}
                        >
                            {saving ? t('saving') : t('saveChanges')}
                        </AppButton>
                    </>
                }
            >
                {/* Avatar banner */}
                <Box
                    sx={{
                        background: gradientBg,
                        px: 2,
                        py: 2,
                        m: 1,
                        borderRadius: 1,
                        display: 'flex',
                        flexDirection: 'column',
                        alignItems: 'center',
                        gap: 1.25,
                        position: 'relative',
                        overflow: 'hidden',
                    }}
                >
                    {/* Bubble 1 — top right large */}
                    <Box sx={{ position: 'absolute', top: -30, right: -30, width: 120, height: 120, borderRadius: '50%', bgcolor: 'rgba(255,255,255,0.10)', pointerEvents: 'none' }} />
                    {/* Bubble 2 — top right small */}
                    <Box sx={{ position: 'absolute', top: 18, right: 40, width: 55, height: 55, borderRadius: '50%', bgcolor: 'rgba(255,255,255,0.07)', pointerEvents: 'none' }} />
                    {/* Bubble 3 — top left large */}
                    <Box sx={{ position: 'absolute', top: -20, left: -25, width: 100, height: 100, borderRadius: '50%', bgcolor: 'rgba(255,255,255,0.09)', pointerEvents: 'none' }} />
                    {/* Bubble 4 — bottom left small */}
                    <Box sx={{ position: 'absolute', bottom: -10, left: 20, width: 60, height: 60, borderRadius: '50%', bgcolor: 'rgba(255,255,255,0.06)', pointerEvents: 'none' }} />
                    {/* Bubble 5 — bottom right tiny */}
                    <Box sx={{ position: 'absolute', bottom: 10, right: 20, width: 35, height: 35, borderRadius: '50%', bgcolor: 'rgba(255,255,255,0.08)', pointerEvents: 'none' }} />

                    <Avatar
                        sx={{
                            width: 68,
                            height: 68,
                            fontSize: '1.5rem',
                            fontWeight: 700,
                            bgcolor: 'rgba(255,255,255,0.22)',
                            color: '#fff',
                            border: '2.5px solid rgba(255,255,255,0.5)',
                            boxShadow: '0 4px 16px rgba(0,0,0,0.18)',
                        }}
                    >
                        {currentUser ? getInitials(currentUser.email) : '?'}
                    </Avatar>

                    <Box sx={{ textAlign: 'center' }}>
                        <Typography sx={{ color: '#fff', fontWeight: 700, fontSize: '1rem', lineHeight: 1.3 }}>
                            {name || currentUser?.email?.split('@')[0] || t('user')}
                        </Typography>
                        {/* <Typography sx={{ color: 'rgba(255,255,255,0.75)', fontSize: '0.78rem', mt: 0.25 }}>
                            {currentUser?.email}
                        </Typography> */}
                    </Box>

                    {/* {currentUser?.isAdmin && (
                        <Chip
                            label={t('admin')}
                            size="small"
                            sx={{
                                bgcolor: 'rgba(255,255,255,0.22)',
                                color: '#fff',
                                fontWeight: 600,
                                fontSize: '0.68rem',
                                height: 22,
                                border: '1px solid rgba(255,255,255,0.35)',
                            }}
                        />
                    )} */}
                </Box>

                {/* Form fields */}
                <Box sx={{ px: 2.5, py: 2.5, display: 'flex', flexDirection: 'column', gap: 2 }}>
                    {fetching ? (
                        <Box sx={{ display: 'flex', justifyContent: 'center', py: 3 }}>
                            <CircularProgress size={32} />
                        </Box>
                    ) : (
                        <>
                            <TextField
                                label={t('email')}
                                value={currentUser?.email || ''}
                                size="small"
                                fullWidth
                                disabled
                                slotProps={{
                                    input: {
                                        startAdornment: (
                                            <InputAdornment position="start">
                                                <EmailOutlinedIcon sx={{ fontSize: 18, color: 'text.disabled' }} />
                                            </InputAdornment>
                                        ),
                                    },
                                }}
                                sx={{ '& .MuiInputBase-root': { borderRadius: 2 } }}
                            />

                            <TextField
                                label={t('fullName')}
                                value={name}
                                onChange={(e) => setName(e.target.value)}
                                size="small"
                                fullWidth
                                placeholder={t('fullNamePlaceholder')}
                                slotProps={{
                                    input: {
                                        startAdornment: (
                                            <InputAdornment position="start">
                                                <PersonOutlinedIcon sx={{ fontSize: 18, color: 'text.secondary' }} />
                                            </InputAdornment>
                                        ),
                                    },
                                }}
                                sx={{ '& .MuiInputBase-root': { borderRadius: 2 } }}
                            />

                            <TextField
                                label={t('department')}
                                value={department}
                                onChange={(e) => setDepartment(e.target.value)}
                                size="small"
                                fullWidth
                                placeholder={t('departmentPlaceholder')}
                                slotProps={{
                                    input: {
                                        startAdornment: (
                                            <InputAdornment position="start">
                                                <BusinessOutlinedIcon sx={{ fontSize: 18, color: 'text.secondary' }} />
                                            </InputAdornment>
                                        ),
                                    },
                                }}
                                sx={{ '& .MuiInputBase-root': { borderRadius: 2 } }}
                            />

                            <TextField
                                label={t('organization')}
                                value={organization}
                                onChange={(e) => setOrganization(e.target.value)}
                                size="small"
                                fullWidth
                                placeholder={t('organizationPlaceholder')}
                                slotProps={{
                                    input: {
                                        startAdornment: (
                                            <InputAdornment position="start">
                                                <CorporateFareOutlinedIcon sx={{ fontSize: 18, color: 'text.secondary' }} />
                                            </InputAdornment>
                                        ),
                                    },
                                }}
                                sx={{ '& .MuiInputBase-root': { borderRadius: 2 } }}
                            />
                        </>
                    )}
                </Box>
            </BaseDialog>

            <NotificationSnackbar
                open={snackbar.open}
                message={snackbar.message}
                severity={snackbar.severity}
                onClose={() => setSnackbar((s) => ({ ...s, open: false }))}
            />
        </>
    );
}
