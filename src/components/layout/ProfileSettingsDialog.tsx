'use client';

import { useState, useEffect } from 'react';
import {
    Box,
    Typography,
    TextField,
    Avatar,
    InputAdornment,
    CircularProgress,
    alpha,
    useTheme,
    Select,
    MenuItem,
    FormControl,
    InputLabel,
} from '@mui/material';
import PersonOutlinedIcon from '@mui/icons-material/PersonOutlined';
import BusinessOutlinedIcon from '@mui/icons-material/BusinessOutlined';
import CorporateFareOutlinedIcon from '@mui/icons-material/CorporateFare';
import EmailOutlinedIcon from '@mui/icons-material/EmailOutlined';
import HomeOutlinedIcon from '@mui/icons-material/HomeOutlined';
import CakeOutlinedIcon from '@mui/icons-material/CakeOutlined';
import WcOutlinedIcon from '@mui/icons-material/WcOutlined';
import CreditCardOutlinedIcon from '@mui/icons-material/CreditCardOutlined';
import FingerprintOutlinedIcon from '@mui/icons-material/FingerprintOutlined';
import WorkOutlineIcon from '@mui/icons-material/WorkOutline';
import PersonPinOutlinedIcon from '@mui/icons-material/PersonPinOutlined';
import BadgeOutlinedIcon from '@mui/icons-material/BadgeOutlined';
import BaseDialog from '@/components/common/BaseDialog';
import AppButton from '@/components/common/AppButton';
import NotificationSnackbar from '@/components/common/NotificationSnackbar';
import { authService } from '@/services/authService';
import { useTranslations } from 'next-intl';

interface ProfileSettingsDialogProps {
    open: boolean;
    onClose: () => void;
}

const fieldSx = { '& .MuiInputBase-root': { borderRadius: 2 } };

function SectionHeader({ icon, label }: { icon: React.ReactNode; label: string }) {
    const theme = useTheme();
    return (
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1.5 }}>
            <Box sx={{ width: 3, height: 16, borderRadius: 2, bgcolor: 'primary.main', flexShrink: 0 }} />
            <Box sx={{ color: 'primary.main', display: 'flex', alignItems: 'center', fontSize: 15 }}>{icon}</Box>
            <Typography
                variant="caption"
                sx={{
                    fontWeight: 700,
                    color: 'text.secondary',
                    textTransform: 'uppercase',
                    letterSpacing: 0.9,
                    fontSize: '0.68rem',
                    fontFamily: theme.typography.fontFamily,
                }}
            >
                {label}
            </Typography>
        </Box>
    );
}

function SectionBox({ children }: { children: React.ReactNode }) {
    return (
        <Box
            sx={{
                display: 'flex',
                flexDirection: 'column',
                gap: 1.5,
                p: 1.5,
                borderRadius: 2,
                border: '1px solid',
                borderColor: 'divider',
                bgcolor: (t) => t.palette.mode === 'dark' ? 'rgba(255,255,255,0.03)' : 'rgba(0,0,0,0.015)',
            }}
        >
            {children}
        </Box>
    );
}

export default function ProfileSettingsDialog({ open, onClose }: ProfileSettingsDialogProps) {
    const t = useTranslations('profileSettings');
    const theme = useTheme();
    const isDark = theme.palette.mode === 'dark';

    const currentUser = authService.getCurrentUser();

    // Work info
    const [name, setName] = useState('');
    const [department, setDepartment] = useState('');
    const [organization, setOrganization] = useState('');
    // Personal details
    const [dateOfBirth, setDateOfBirth] = useState('');
    const [gender, setGender] = useState('');
    const [permanentAddress, setPermanentAddress] = useState('');
    // Identity info
    const [panCard, setPanCard] = useState('');
    const [aadharCard, setAadharCard] = useState('');

    const [fetching, setFetching] = useState(false);
    const [saving, setSaving] = useState(false);
    const [snackbar, setSnackbar] = useState<{ open: boolean; message: string; severity: 'success' | 'error' }>({
        open: false, message: '', severity: 'success',
    });

    useEffect(() => {
        if (!open || !currentUser?.email) return;
        const controller = new AbortController();
        setFetching(true);
        fetch(`/api/users/profile?email=${encodeURIComponent(currentUser.email)}`, { signal: controller.signal })
            .then((r) => r.json())
            .then((data) => {
                setName(data.name || '');
                setDepartment(data.department || '');
                setOrganization(data.organization || '');
                setDateOfBirth(data.dateOfBirth || '');
                setGender(data.gender || '');
                setPermanentAddress(data.permanentAddress || '');
                setPanCard(data.panCard || '');
                setAadharCard(data.aadharCard || '');
            })
            .catch((err) => {
                if (err.name === 'AbortError') return;
                setName(currentUser.name || '');
                setDepartment(currentUser.department || '');
                setOrganization(currentUser.organization || '');
                setDateOfBirth(currentUser.dateOfBirth || '');
                setGender(currentUser.gender || '');
                setPermanentAddress(currentUser.permanentAddress || '');
                setPanCard(currentUser.panCard || '');
                setAadharCard(currentUser.aadharCard || '');
            })
            .finally(() => { if (!controller.signal.aborted) setFetching(false); });
        return () => controller.abort();
    }, [open]); // eslint-disable-line react-hooks/exhaustive-deps

    const getInitials = (email: string) => {
        if (name?.trim()) return name.trim()[0].toUpperCase();
        const local = email.split('@')[0];
        const parts = local.split(/[._-]/);
        if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
        return local.slice(0, 2).toUpperCase();
    };

    const handleSave = async () => {
        setSaving(true);
        const result = await authService.updateProfile({
            name, department, organization,
            dateOfBirth, gender, permanentAddress,
            panCard: panCard.toUpperCase(), aadharCard,
        });
        setSaving(false);
        setSnackbar({
            open: true,
            message: result.success ? t('saveSuccess') : (result.message || t('saveError')),
            severity: result.success ? 'success' : 'error',
        });
        if (result.success) setTimeout(onClose, 1200);
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
                maxWidth="sm"
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
                        px: 2, py: 2, m: 1, borderRadius: 1,
                        display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 1.25,
                        position: 'relative', overflow: 'hidden',
                    }}
                >
                    <Box sx={{ position: 'absolute', top: -30, right: -30, width: 120, height: 120, borderRadius: '50%', bgcolor: 'rgba(255,255,255,0.10)', pointerEvents: 'none' }} />
                    <Box sx={{ position: 'absolute', top: 18, right: 40, width: 55, height: 55, borderRadius: '50%', bgcolor: 'rgba(255,255,255,0.07)', pointerEvents: 'none' }} />
                    <Box sx={{ position: 'absolute', top: -20, left: -25, width: 100, height: 100, borderRadius: '50%', bgcolor: 'rgba(255,255,255,0.09)', pointerEvents: 'none' }} />
                    <Box sx={{ position: 'absolute', bottom: -10, left: 20, width: 60, height: 60, borderRadius: '50%', bgcolor: 'rgba(255,255,255,0.06)', pointerEvents: 'none' }} />
                    <Box sx={{ position: 'absolute', bottom: 10, right: 20, width: 35, height: 35, borderRadius: '50%', bgcolor: 'rgba(255,255,255,0.08)', pointerEvents: 'none' }} />
                    <Avatar
                        sx={{
                            width: 68, height: 68, fontSize: '1.5rem', fontWeight: 700,
                            bgcolor: 'rgba(255,255,255,0.22)', color: '#fff',
                            border: '2.5px solid rgba(255,255,255,0.5)',
                            boxShadow: '0 4px 16px rgba(0,0,0,0.18)',
                        }}
                    >
                        {currentUser ? getInitials(currentUser.email) : '?'}
                    </Avatar>
                    <Typography sx={{ color: '#fff', fontWeight: 700, fontSize: '1rem', lineHeight: 1.3 }}>
                        {name || currentUser?.email?.split('@')[0] || t('user')}
                    </Typography>
                    <Typography sx={{ color: 'rgba(255,255,255,0.75)', fontSize: '0.75rem', mt: -0.5 }}>
                        {currentUser?.email}
                    </Typography>
                </Box>

                {/* Form */}
                <Box sx={{ px: 2, pb: 2, pt: 1.5, display: 'flex', flexDirection: 'column', gap: 2 }}>
                    {fetching ? (
                        <Box sx={{ display: 'flex', justifyContent: 'center', py: 4 }}>
                            <CircularProgress size={32} />
                        </Box>
                    ) : (
                        <>
                            {/* ── Work Information ── */}
                            <SectionBox>
                                <SectionHeader icon={<WorkOutlineIcon sx={{ fontSize: 15 }} />} label={t('sectionWork')} />
                                <TextField
                                    label={t('email')}
                                    value={currentUser?.email || ''}
                                    size="small" fullWidth disabled
                                    slotProps={{ input: { startAdornment: <InputAdornment position="start"><EmailOutlinedIcon sx={{ fontSize: 18, color: 'text.disabled' }} /></InputAdornment> } }}
                                    sx={fieldSx}
                                />
                                <TextField
                                    label={t('fullName')}
                                    value={name}
                                    onChange={(e) => setName(e.target.value)}
                                    size="small" fullWidth placeholder={t('fullNamePlaceholder')}
                                    slotProps={{ input: { startAdornment: <InputAdornment position="start"><PersonOutlinedIcon sx={{ fontSize: 18, color: 'text.secondary' }} /></InputAdornment> } }}
                                    sx={fieldSx}
                                />
                                <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 1.5 }}>
                                    <TextField
                                        label={t('department')}
                                        value={department}
                                        onChange={(e) => setDepartment(e.target.value)}
                                        size="small" fullWidth placeholder={t('departmentPlaceholder')}
                                        slotProps={{ input: { startAdornment: <InputAdornment position="start"><BusinessOutlinedIcon sx={{ fontSize: 18, color: 'text.secondary' }} /></InputAdornment> } }}
                                        sx={fieldSx}
                                    />
                                    <TextField
                                        label={t('organization')}
                                        value={organization}
                                        onChange={(e) => setOrganization(e.target.value)}
                                        size="small" fullWidth placeholder={t('organizationPlaceholder')}
                                        slotProps={{ input: { startAdornment: <InputAdornment position="start"><CorporateFareOutlinedIcon sx={{ fontSize: 18, color: 'text.secondary' }} /></InputAdornment> } }}
                                        sx={fieldSx}
                                    />
                                </Box>
                            </SectionBox>

                            {/* ── Personal Details ── */}
                            <SectionBox>
                                <SectionHeader icon={<PersonPinOutlinedIcon sx={{ fontSize: 15 }} />} label={t('sectionPersonal')} />
                                <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 1.5 }}>
                                    <TextField
                                        label={t('dateOfBirth')}
                                        type="date"
                                        value={dateOfBirth}
                                        onChange={(e) => setDateOfBirth(e.target.value)}
                                        size="small" fullWidth
                                        slotProps={{
                                            inputLabel: { shrink: true },
                                            input: { startAdornment: <InputAdornment position="start"><CakeOutlinedIcon sx={{ fontSize: 18, color: 'text.secondary' }} /></InputAdornment> },
                                        }}
                                        sx={fieldSx}
                                    />
                                    <FormControl size="small" fullWidth sx={{ '& .MuiInputBase-root': { borderRadius: 2 } }}>
                                        <InputLabel shrink>{t('gender')}</InputLabel>
                                        <Select
                                            value={gender}
                                            onChange={(e) => setGender(e.target.value)}
                                            label={t('gender')}
                                            displayEmpty
                                            notched
                                            startAdornment={<InputAdornment position="start"><WcOutlinedIcon sx={{ fontSize: 18, color: 'text.secondary', ml: 0.5 }} /></InputAdornment>}
                                        >
                                            <MenuItem value=""><em style={{ color: isDark ? 'rgba(255,255,255,0.3)' : 'rgba(0,0,0,0.38)' }}>Select</em></MenuItem>
                                            <MenuItem value="Male">{t('genderMale')}</MenuItem>
                                            <MenuItem value="Female">{t('genderFemale')}</MenuItem>
                                            <MenuItem value="Other">{t('genderOther')}</MenuItem>
                                            <MenuItem value="Prefer not to say">{t('genderPreferNot')}</MenuItem>
                                        </Select>
                                    </FormControl>
                                </Box>
                                <TextField
                                    label={t('permanentAddress')}
                                    value={permanentAddress}
                                    onChange={(e) => setPermanentAddress(e.target.value)}
                                    size="small" fullWidth multiline rows={2}
                                    placeholder={t('permanentAddressPlaceholder')}
                                    slotProps={{ input: { startAdornment: <InputAdornment position="start" sx={{ alignSelf: 'flex-start', mt: 1 }}><HomeOutlinedIcon sx={{ fontSize: 18, color: 'text.secondary' }} /></InputAdornment> } }}
                                    sx={fieldSx}
                                />
                            </SectionBox>

                            {/* ── Identity Information ── */}
                            <SectionBox>
                                <SectionHeader icon={<BadgeOutlinedIcon sx={{ fontSize: 15 }} />} label={t('sectionIdentity')} />
                                <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 1.5 }}>
                                    <TextField
                                        label={t('panCard')}
                                        value={panCard}
                                        onChange={(e) => setPanCard(e.target.value.toUpperCase())}
                                        size="small" fullWidth placeholder={t('panCardPlaceholder')}
                                        inputProps={{ maxLength: 10 }}
                                        slotProps={{ input: { startAdornment: <InputAdornment position="start"><CreditCardOutlinedIcon sx={{ fontSize: 18, color: 'text.secondary' }} /></InputAdornment> } }}
                                        sx={fieldSx}
                                    />
                                    <TextField
                                        label={t('aadharCard')}
                                        value={aadharCard}
                                        onChange={(e) => setAadharCard(e.target.value.replace(/\D/g, '').slice(0, 12))}
                                        size="small" fullWidth placeholder={t('aadharCardPlaceholder')}
                                        inputProps={{ maxLength: 12 }}
                                        slotProps={{ input: { startAdornment: <InputAdornment position="start"><FingerprintOutlinedIcon sx={{ fontSize: 18, color: 'text.secondary' }} /></InputAdornment> } }}
                                        sx={fieldSx}
                                    />
                                </Box>
                            </SectionBox>
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
