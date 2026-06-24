'use client';

import { useState, useEffect } from 'react';
import { useForm, Controller } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Box, TextField, Typography, LinearProgress } from '@mui/material';
import BaseDialog from '@/components/common/BaseDialog';
import AppButton from '@/components/common/AppButton';
import { Folder } from '@/types/folder';
import { httpClient } from '@/lib/httpClient';

interface RenameFolderDialogProps {
    open: boolean;
    folder: Folder | null;
    onClose: () => void;
    onRenamed: (folder: Folder) => void;
}

const MAX_LENGTH = 50;

const renameFolderSchema = z.object({
    name: z.string()
        .min(1, 'Folder name is required')
        .max(MAX_LENGTH, `Folder name must be ${MAX_LENGTH} characters or less`),
});

type RenameFolderForm = z.infer<typeof renameFolderSchema>;

export default function RenameFolderDialog({ open, folder, onClose, onRenamed }: RenameFolderDialogProps) {
    const [loading, setLoading] = useState(false);
    const [apiError, setApiError] = useState('');

    const { control, handleSubmit, reset, watch } = useForm<RenameFolderForm>({
        resolver: zodResolver(renameFolderSchema),
        defaultValues: { name: '' },
    });

    const watchedName = watch('name');
    const remaining = MAX_LENGTH - watchedName.length;
    const isNearLimit = watchedName.length >= MAX_LENGTH - 10;

    useEffect(() => {
        if (folder) {
            reset({ name: folder.name });
            setApiError('');
        }
    }, [folder, reset]);

    const handleClose = () => {
        setApiError('');
        onClose();
    };

    const onSubmit = async (data: RenameFolderForm) => {
        if (!folder) return;

        setLoading(true);
        setApiError('');

        // createdBy is derived from JWT on the backend — not sent in the body
        const response = await httpClient.put<Folder>(`/folders/${folder.id}`, {
            name: data.name.trim(),
        });

        setLoading(false);

        if (!response.ok) {
            setApiError(response.message || 'Failed to rename folder');
            return;
        }

        // Backend returns the full updated folder object
        const updatedFolder = response.data ?? { ...folder, name: data.name.trim() };
        onRenamed(updatedFolder);
        handleClose();
    };

    return (
        <BaseDialog
            open={open}
            onClose={handleClose}
            title="Rename Folder"
            maxWidth="xs"
            disableBackdropClick={loading}
            actions={
                <Box sx={{ display: 'flex', gap: 1, px: 0.5 }}>
                    <AppButton variant="outlined" onClick={handleClose} disabled={loading} size="small">
                        Cancel
                    </AppButton>
                    <AppButton
                        variant="contained"
                        onClick={handleSubmit(onSubmit)}
                        loading={loading}
                        disabled={!watchedName.trim() || watchedName.trim() === folder?.name}
                        size="small"
                        sx={{ minWidth: 80 }}
                    >
                        {loading ? 'Saving…' : 'Save'}
                    </AppButton>
                </Box>
            }
        >
            {loading && (
                <LinearProgress sx={{ position: 'absolute', top: 0, left: 0, right: 0, borderRadius: '16px 16px 0 0' }} />
            )}

            <Controller
                name="name"
                control={control}
                render={({ field, fieldState }) => (
                    <TextField
                        {...field}
                        onChange={e => field.onChange(e.target.value.slice(0, MAX_LENGTH))}
                        onKeyDown={e => { if (e.key === 'Enter') handleSubmit(onSubmit)(); }}
                        label="Folder Name"
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
