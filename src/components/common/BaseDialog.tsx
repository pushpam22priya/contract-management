'use client';

import {
    Dialog,
    DialogTitle,
    DialogContent,
    DialogActions,
    IconButton,
    Box,
    Slide,
    useMediaQuery,
    useTheme,
} from '@mui/material';
import CloseIcon from '@mui/icons-material/Close';
import { TransitionProps } from '@mui/material/transitions';
import React from 'react';

const Transition = React.forwardRef(function Transition(
    props: TransitionProps & {
        children: React.ReactElement;
    },
    ref: React.Ref<unknown>,
) {
    return <Slide direction="up" ref={ref} {...props} />;
});

interface BaseDialogProps {
    open: boolean;
    onClose: () => void;
    title: string;
    children: React.ReactNode;
    actions?: React.ReactNode;
    maxWidth?: 'xs' | 'sm' | 'md' | 'lg' | 'xl';
    fullWidth?: boolean;
    customHeight?: string; // NEW: Allow custom height like '100vh', '90vh', etc.
}

export default function BaseDialog({
    open,
    onClose,
    title,
    children,
    actions,
    maxWidth = 'sm',
    fullWidth = true,
    customHeight, // NEW
}: BaseDialogProps) {
    const theme = useTheme();
    const isMobile = useMediaQuery(theme.breakpoints.down('sm'));

    return (
        <Dialog
            open={open}
            onClose={onClose}
            TransitionComponent={Transition}
            maxWidth={maxWidth}
            fullWidth={fullWidth}
            fullScreen={isMobile}
            PaperProps={{
                sx: {
                    borderRadius: isMobile ? 0 : 3,
                    boxShadow: '0 20px 25px -5px rgb(0 0 0 / 0.1), 0 8px 10px -6px rgb(0 0 0 / 0.1)',
                    overflow: 'visible',
                    ...(customHeight && { height: customHeight, maxHeight: customHeight }), // Apply custom height
                },
            }}
            sx={{
                '& .MuiBackdrop-root': {
                    backgroundColor: 'rgba(0, 0, 0, 0.5)',
                    backdropFilter: 'blur(4px)',
                },
            }}
        >
            {/* Dialog Title */}
            <DialogTitle
                sx={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    borderBottom: '1px solid',
                    borderColor: 'rgba(0, 0, 0, 0.08)',
                    bgcolor: '#fafafa',
                    px: 1.2,
                    py: 0.5,
                    borderRadius: "16px 16px 0 0",
                }}
            >
                <Box
                    sx={{
                        // fontSize: { xs: '1rem', sm: '1.25rem' },
                        // fontWeight: 700,
                        color: 'text.primary',
                    }}
                >
                    {title}
                </Box>
                <IconButton
                    onClick={onClose}
                    sx={{
                        color: 'text.secondary',
                        transition: 'all 0.2s',
                        '&:hover': {
                            bgcolor: 'rgba(0, 0, 0, 0.08)',
                            color: 'text.primary',
                            transform: 'rotate(90deg)',
                        },
                    }}
                    aria-label="close"
                >
                    <CloseIcon />
                </IconButton>
            </DialogTitle>

            {/* Dialog Content */}
            <DialogContent
                sx={{
                    px: { xs: 2, sm: 2 },
                    py: { xs: 3, sm: 2 },
                    paddingTop: '16px !important',
                }}
            >
                {children}
            </DialogContent>

            {/* Dialog Actions */}
            {actions && (
                <DialogActions
                    sx={{
                        p: 1,
                        borderTop: '1px solid',
                        borderColor: 'rgba(0, 0, 0, 0.08)',
                        bgcolor: '#fafafa',
                        gap: 1.5,
                        borderRadius: "0 0 16px 16px",
                    }}
                >
                    {actions}
                </DialogActions>
            )}
        </Dialog>
    );
}
