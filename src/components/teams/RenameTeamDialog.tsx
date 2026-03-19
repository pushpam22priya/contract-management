'use client';

import { useState, useEffect } from 'react';
import { Box, Button, TextField, Typography, LinearProgress } from '@mui/material';
import BaseDialog from '@/components/common/BaseDialog';
import { Team } from '@/types/team';
import { authService } from '@/services/authService';

interface RenameTeamDialogProps {
    open: boolean;
    team: Team | null;
    onClose: () => void;
    onRenamed: (team: Team) => void;
}

const MAX_LENGTH = 50;

export default function RenameTeamDialog({ open, team, onClose, onRenamed }: RenameTeamDialogProps) {
    const [name, setName] = useState('');
    const [error, setError] = useState('');
    const [loading, setLoading] = useState(false);

    useEffect(() => {
        if (team) {
            setName(team.name);
            setError('');
        }
    }, [team]);

    const handleClose = () => {
        setError('');
        onClose();
    };

    const handleSave = async () => {
        const trimmed = name.trim();
        if (!trimmed) {
            setError('Team name is required');
            return;
        }
        if (trimmed.length > MAX_LENGTH) {
            setError(`Team name must be ${MAX_LENGTH} characters or less`);
            return;
        }
        if (!team) return;

        const currentUser = authService.getCurrentUser();
        if (!currentUser) {
            setError('You must be logged in');
            return;
        }

        setLoading(true);
        setError('');

        try {
            const res = await fetch(`/api/teams/${team._id}`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ name: trimmed, createdBy: currentUser.email }),
            });

            const data = await res.json();
            if (!res.ok) {
                setError(data.error || 'Failed to rename team');
                return;
            }

            onRenamed({ ...team, name: trimmed });
            handleClose();
        } catch {
            setError('An unexpected error occurred');
        } finally {
            setLoading(false);
        }
    };

    const remaining = MAX_LENGTH - name.length;
    const isNearLimit = name.length >= MAX_LENGTH - 10;

    return (
        <BaseDialog
            open={open}
            onClose={handleClose}
            title="Rename Team"
            maxWidth="xs"
            disableBackdropClick={loading}
            actions={
                <Box sx={{ display: 'flex', gap: 1, px: 0.5 }}>
                    <Button onClick={handleClose} disabled={loading} variant="outlined" size="small" color="inherit">
                        Cancel
                    </Button>
                    <Button
                        onClick={handleSave}
                        disabled={loading || !name.trim() || name.trim() === team?.name}
                        variant="contained"
                        size="small"
                        sx={{ minWidth: 80 }}
                    >
                        {loading ? 'Saving…' : 'Save'}
                    </Button>
                </Box>
            }
        >
            {loading && (
                <LinearProgress sx={{ position: 'absolute', top: 0, left: 0, right: 0, borderRadius: '16px 16px 0 0' }} />
            )}

            <TextField
                label="Team Name"
                value={name}
                onChange={e => {
                    setName(e.target.value.slice(0, MAX_LENGTH));
                    if (error) setError('');
                }}
                onKeyDown={e => { if (e.key === 'Enter') handleSave(); }}
                error={!!error}
                helperText={
                    error || (
                        <Typography
                            component="span"
                            variant="caption"
                            sx={{ color: isNearLimit ? 'warning.main' : 'text.secondary' }}
                        >
                            {remaining} / {MAX_LENGTH} characters remaining
                        </Typography>
                    )
                }
                fullWidth
                autoFocus
                size="small"
                inputProps={{ maxLength: MAX_LENGTH }}
            />
        </BaseDialog>
    );
}
