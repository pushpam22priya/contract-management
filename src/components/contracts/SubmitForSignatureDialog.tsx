'use client';

import {
    Dialog,
    DialogTitle,
    DialogContent,
    DialogActions,
    Button,
    Autocomplete,
    TextField,
    Box,
    Typography,
    Avatar,
    Chip,
    Alert,
} from '@mui/material';
import { useState, useEffect } from 'react';
import { userService, User } from '@/services/userService';
import { stringAvatar } from '@/utils/stringAvatar';

interface SubmitForSignatureDialogProps {
    open: boolean;
    onClose: () => void;
    onSubmit: (signerEmail: string) => void;
    contractTitle?: string;
}

export default function SubmitForSignatureDialog({
    open,
    onClose,
    onSubmit,
    contractTitle,
}: SubmitForSignatureDialogProps) {
    const [users, setUsers] = useState<User[]>([]);
    const [selectedSigner, setSelectedSigner] = useState<User | null>(null);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');

    useEffect(() => {
        if (open) {
            loadUsers();
            setSelectedSigner(null);
            setError('');
        }
    }, [open]);

    const loadUsers = async () => {
        setLoading(true);
        try {
            const allUsers = await userService.getAllUsers();
            setUsers(allUsers);
        } catch (err) {
            console.error('Failed to load users:', err);
            setError('Failed to load users');
        } finally {
            setLoading(false);
        }
    };

    const handleSubmit = () => {
        if (!selectedSigner) {
            setError('Please select a signer');
            return;
        }
        onSubmit(selectedSigner.email);
        onClose();
    };

    return (
        <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth>
            <DialogTitle>
                Submit for Signature
                {contractTitle && (
                    <Typography component="div" variant="subtitle2" color="text.secondary" sx={{ mt: 0.5 }}>
                        {contractTitle}
                    </Typography>
                )}
            </DialogTitle>

            <DialogContent dividers>
                {error && (
                    <Alert severity="error" sx={{ mb: 2 }}>
                        {error}
                    </Alert>
                )}

                <Box sx={{ mb: 3 }}>

                    <Typography variant="subtitle2" gutterBottom>
                        Select Signer <span style={{ color: 'red' }}>*</span>
                    </Typography>

                    <Autocomplete
                        options={users}
                        getOptionLabel={(option) => option.name || option.email}
                        value={selectedSigner}
                        onChange={(_, newValue) => setSelectedSigner(newValue)}
                        renderOption={(props, option) => {
                            const { key, ...otherProps } = props;
                            return (
                                <li key={key} {...otherProps}>
                                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
                                        <Avatar {...stringAvatar(option.name, 32)} />
                                        <Box>
                                            <Typography variant="body2" fontWeight={500}>
                                                {option.name}
                                            </Typography>
                                            <Typography variant="caption" color="text.secondary">
                                                {option.email}
                                            </Typography>
                                        </Box>
                                    </Box>
                                </li>
                            );
                        }}
                        renderInput={(params) => (
                            <TextField
                                {...params}
                                placeholder="Search by name or email"
                                fullWidth
                                variant="outlined"
                            />
                        )}
                        renderTags={(value, getTagProps) =>
                            value.map((option, index) => {
                                const { key, ...otherProps } = getTagProps({ index });
                                return (
                                    <Chip
                                        key={key}
                                        label={option.name}
                                        {...otherProps}
                                        avatar={<Avatar {...stringAvatar(option.name)} />}
                                    />
                                );
                            })
                        }
                    />
                </Box>
            </DialogContent>

            <DialogActions sx={{ px: 3, py: 2 }}>
                <Button onClick={onClose} sx={{ color: 'text.secondary' }}>
                    Cancel
                </Button>
                <Button
                    variant="contained"
                    onClick={handleSubmit}
                    disabled={!selectedSigner}
                    sx={{
                        bgcolor: '#115e59', // Teal color matching other dialogs
                        '&:hover': { bgcolor: '#0f514d' },
                    }}
                >
                    Submit
                </Button>
            </DialogActions>
        </Dialog>
    );
}
