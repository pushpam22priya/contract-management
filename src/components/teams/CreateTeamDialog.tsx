'use client';

import { useState } from 'react';
import { Box, Button, TextField, Typography, LinearProgress } from '@mui/material';
import FolderIcon from '@mui/icons-material/FolderOutlined';
import BaseDialog from '@/components/common/BaseDialog';
import { Team } from '@/types/team';
import { authService } from '@/services/authService';

interface CreateTeamDialogProps {
    open: boolean;
    onClose: () => void;
    onCreated: (team: Team) => void;
}

const MAX_LENGTH = 50;

export default function CreateTeamDialog({ open, onClose, onCreated }: CreateTeamDialogProps) {
    const [name, setName] = useState('');
    const [error, setError] = useState('');
    const [loading, setLoading] = useState(false);

    const handleClose = () => {
        setName('');
        setError('');
        onClose();
    };

    const handleCreate = async () => {
        const trimmed = name.trim();
        if (!trimmed) {
            setError('Team name is required');
            return;
        }
        if (trimmed.length > MAX_LENGTH) {
            setError(`Team name must be ${MAX_LENGTH} characters or less`);
            return;
        }

        const currentUser = authService.getCurrentUser();
        if (!currentUser) {
            setError('You must be logged in to create a team');
            return;
        }

        setLoading(true);
        setError('');

        try {
            const res = await fetch('/api/teams', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ name: trimmed, createdBy: currentUser.email }),
            });

            const data = await res.json();
            if (!res.ok) {
                setError(data.error || 'Failed to create team');
                return;
            }

            onCreated(data.team);
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
            title="Create Team"
            maxWidth="xs"
            disableBackdropClick={loading}
            actions={
                <Box sx={{ display: 'flex', gap: 1, px: 0.5 }}>
                    <Button onClick={handleClose} disabled={loading} variant="outlined" color="inherit">
                        Cancel
                    </Button>
                    <Button
                        onClick={handleCreate}
                        disabled={loading || !name.trim()}
                        variant="contained"
                        // size="small"
                    >
                        {loading ? 'Creating…' : 'Create Team'}
                    </Button>
                </Box>
            }
        >
            {loading && (
                <LinearProgress sx={{ position: 'absolute', top: 0, left: 0, right: 0, borderRadius: '16px 16px 0 0' }} />
            )}

            {/* Icon + description */}
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, mb: 2.5 }}>
                {/* <Box
                    sx={{
                        // width: 44,
                        // height: 44,
                        borderRadius: 2,
                        bgcolor: 'primary.main',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        flexShrink: 0,
                    }}
                >
                    <FolderIcon sx={{ color: 'white', fontSize: 'medium' }} />
                </Box> */}
                <Typography variant="body2" color="text.secondary">
                    Create team to group contracts together.
                </Typography>
            </Box>

            <TextField
                label="Team Name"
                placeholder="e.g. Legal, HR, Client Projects…"
                value={name}
                onChange={e => {
                    setName(e.target.value.slice(0, MAX_LENGTH));
                    if (error) setError('');
                }}
                onKeyDown={e => { if (e.key === 'Enter') handleCreate(); }}
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
