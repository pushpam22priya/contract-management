'use client';

import { useState } from 'react';
import { useForm, Controller } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Box, TextField, Typography, LinearProgress } from '@mui/material';
import BaseDialog from '@/components/common/BaseDialog';
import AppButton from '@/components/common/AppButton';
import { Folder } from '@/types/folder';
import { httpClient } from '@/lib/httpClient';

interface CreateFolderDialogProps {
    open: boolean;
    onClose: () => void;
    onCreated: (folder: Folder) => void;
}

const MAX_LENGTH = 50;

const folderSchema = z.object({
    name: z.string()
        .min(1, 'Folder name is required')
        .max(MAX_LENGTH, `Folder name must be ${MAX_LENGTH} characters or less`),
});

type FolderForm = z.infer<typeof folderSchema>;

export default function CreateFolderDialog({ open, onClose, onCreated }: CreateFolderDialogProps) {
    const [loading, setLoading] = useState(false);
    const [apiError, setApiError] = useState('');

    const { control, handleSubmit, reset, watch } = useForm<FolderForm>({
        resolver: zodResolver(folderSchema),
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

    const onSubmit = async (data: FolderForm) => {
        setLoading(true);
        setApiError('');

        // createdBy is derived from the JWT token on the backend — not sent in the body
        const response = await httpClient.post<Folder>('/folders', {
            name: data.name.trim(),
        });

        setLoading(false);

        if (!response.ok || !response.data) {
            setApiError(response.message || 'Failed to create folder');
            return;
        }

        onCreated(response.data);
        handleClose();
    };

    return (
        <BaseDialog
            open={open}
            onClose={handleClose}
            title="Create Folder"
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
                        {loading ? 'Creating…' : 'Create Folder'}
                    </AppButton>
                </Box>
            }
        >
            {loading && (
                <LinearProgress sx={{ position: 'absolute', top: 0, left: 0, right: 0, borderRadius: '16px 16px 0 0' }} />
            )}

            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, mb: 2.5 }}>
                <Typography variant="body2" color="text.secondary">
                    Create folder to group contracts together.
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
                        label="Folder Name"
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
