'use client';

import {
    Dialog,
    DialogTitle,
    DialogContent,
    DialogActions,
    Button,
    Typography,
    Box,
} from '@mui/material';
import DrawOutlined from '@mui/icons-material/DrawOutlined';

interface SignAllDialogProps {
    open: boolean;
    onClose: () => void;
    onSignAll: () => void;
    emptyFieldCount: number;
}

export default function SignAllDialog({ open, onClose, onSignAll, emptyFieldCount }: SignAllDialogProps) {
    return (
        <Dialog open={open} onClose={onClose} maxWidth="xs" fullWidth>
            <DialogTitle sx={{ pb: 1 }}>Apply Signature to All Fields?</DialogTitle>
            <DialogContent>
                <Box sx={{ display: 'flex', alignItems: 'flex-start', gap: 2 }}>
                    <DrawOutlined sx={{ fontSize: 36, color: 'primary.main', mt: 0.5 }} />
                    <Typography variant="body1" color="text.secondary">
                        There {emptyFieldCount === 1 ? 'is' : 'are'} <strong>{emptyFieldCount}</strong> more
                        empty signature {emptyFieldCount === 1 ? 'field' : 'fields'} in this document.
                        Would you like to apply your signature to all of them?
                    </Typography>
                </Box>
            </DialogContent>
            <DialogActions sx={{ px: 3, pb: 2 }}>
                <Button onClick={onClose} color="inherit">
                    No, Just This One
                </Button>
                <Button
                    onClick={onSignAll}
                    variant="contained"
                    sx={{
                        bgcolor: '#115e59',
                        '&:hover': { bgcolor: '#0f4c47' },
                        textTransform: 'none',
                        fontWeight: 600,
                    }}
                >
                    Yes, Sign All ({emptyFieldCount})
                </Button>
            </DialogActions>
        </Dialog>
    );
}
