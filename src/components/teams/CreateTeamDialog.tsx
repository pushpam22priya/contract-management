'use client';

import { useState } from 'react';
import { useForm, Controller } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Box, TextField, Typography, LinearProgress } from '@mui/material';
import BaseDialog from '@/components/common/BaseDialog';
import AppButton from '@/components/common/AppButton';
import { Team } from '@/types/team';
import { authService } from '@/services/authService';

interface CreateTeamDialogProps {
    open: boolean;
    onClose: () => void;
    onCreated: (team: Team) => void;
}

const MAX_LENGTH = 50;

const teamSchema = z.object({
    name: z.string()
        .min(1, 'Team name is required')
        .max(MAX_LENGTH, `Team name must be ${MAX_LENGTH} characters or less`),
});

type TeamForm = z.infer<typeof teamSchema>;

export default function CreateTeamDialog({ open, onClose, onCreated }: CreateTeamDialogProps) {
    const [loading, setLoading] = useState(false);
    const [apiError, setApiError] = useState('');

    const { control, handleSubmit, reset, watch } = useForm<TeamForm>({
        resolver: zodResolver(teamSchema),
        defaultValues: { name: '' },
    });

    const watchedName = watch('name');
    const remaining = MAX_LENGTH - watchedName.length;
    const isNearLimit = watchedName.length >= MAX_LENGTH - 10;

    const handleClose = () => {
        reset();
        setApiError('');
        onClose();
    };

    const onSubmit = async (data: TeamForm) => {
        const currentUser = authService.getCurrentUser();
        if (!currentUser) {
            setApiError('You must be logged in to create a team');
            return;
        }

        setLoading(true);
        setApiError('');

        try {
            const res = await fetch('/api/teams', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ name: data.name.trim(), createdBy: currentUser.email }),
            });

            const json = await res.json();
            if (!res.ok) {
                setApiError(json.error || 'Failed to create team');
                return;
            }

            onCreated(json.team);
            handleClose();
        } catch {
            setApiError('An unexpected error occurred');
        } finally {
            setLoading(false);
        }
    };

    return (
        <BaseDialog
            open={open}
            onClose={handleClose}
            title="Create Team"
            maxWidth="xs"
            disableBackdropClick={loading}
            actions={
                <Box sx={{ display: 'flex', gap: 1, px: 0.5 }}>
                    <AppButton variant="outlined" onClick={handleClose} disabled={loading}>
                        Cancel
                    </AppButton>
                    <AppButton
                        variant="contained"
                        onClick={handleSubmit(onSubmit)}
                        loading={loading}
                        disabled={!watchedName.trim()}
                    >
                        {loading ? 'Creating…' : 'Create Team'}
                    </AppButton>
                </Box>
            }
        >
            {loading && (
                <LinearProgress sx={{ position: 'absolute', top: 0, left: 0, right: 0, borderRadius: '16px 16px 0 0' }} />
            )}

            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, mb: 2.5 }}>
                <Typography variant="body2" color="text.secondary">
                    Create team to group contracts together.
                </Typography>
            </Box>

            <Controller
                name="name"
                control={control}
                render={({ field, fieldState }) => (
                    <TextField
                        {...field}
                        onChange={e => field.onChange(e.target.value.slice(0, MAX_LENGTH))}
                        onKeyDown={e => { if (e.key === 'Enter') handleSubmit(onSubmit)(); }}
                        label="Team Name"
                        placeholder="e.g. Legal, HR, Client Projects…"
                        fullWidth
                        autoFocus
                        size="small"
                        error={!!fieldState.error || !!apiError}
                        helperText={
                            fieldState.error?.message || apiError || (
                                <Typography
                                    component="span"
                                    variant="caption"
                                    sx={{ color: isNearLimit ? 'warning.main' : 'text.secondary' }}
                                >
                                    {remaining} / {MAX_LENGTH} characters remaining
                                </Typography>
                            )
                        }
                        slotProps={{ htmlInput: { maxLength: MAX_LENGTH } }}
                    />
                )}
            />
        </BaseDialog>
    );
}
