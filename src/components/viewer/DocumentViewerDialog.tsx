'use client';

import { Dialog, DialogContent, DialogTitle, IconButton, Box, Typography } from '@mui/material';
import CloseIcon from '@mui/icons-material/Close';
import dynamic from 'next/dynamic';

// Dynamically import DocumentViewer to avoid SSR issues
const DocumentViewer = dynamic(() => import('./DocumentViewer'), {
    ssr: false,
    loading: () => (
        <Box
            sx={{
                width: '100%',
                height: '600px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
            }}
        >
            <Typography variant="body1" color="text.secondary">
                Loading document viewer...
            </Typography>
        </Box>
    ),
});

interface DocumentViewerDialogProps {
    open: boolean;
    onClose: () => void;
    fileUrl: string;
    fileName?: string;
    title?: string;
}

export default function DocumentViewerDialog({
    open,
    onClose,
    fileUrl,
    fileName,
    title,
}: DocumentViewerDialogProps) {
    return (
        <Dialog
            open={open}
            onClose={onClose}
            maxWidth="lg"
            fullWidth
            PaperProps={{
                sx: {
                    height: '90vh',
                    maxHeight: '90vh',
                },
            }}
        >
            <DialogTitle
                sx={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    borderBottom: '1px solid',
                    borderColor: 'divider',
                    py: 2,
                    px: 3,
                }}
            >
                    {title || fileName || 'Document Viewer'}

                <IconButton
                    onClick={onClose}
                    sx={{
                        ml: 2,
                        color: 'text.secondary',
                        '&:hover': {
                            bgcolor: 'rgba(0, 0, 0, 0.04)',
                        },
                    }}
                >
                    <CloseIcon />
                </IconButton>
            </DialogTitle>
            <DialogContent
                sx={{
                    p: 0,
                    height: '100%',
                    overflow: 'hidden',
                }}
            >
                <DocumentViewer fileUrl={fileUrl} fileName={fileName} />
            </DialogContent>
        </Dialog>
    );
}
