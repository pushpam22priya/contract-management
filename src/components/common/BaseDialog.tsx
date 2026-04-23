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
    Typography,
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
    /** Optional extra content rendered in the header bar, between the title and the close button */
    titleExtra?: React.ReactNode;
    children: React.ReactNode;
    actions?: React.ReactNode;
    maxWidth?: 'xs' | 'sm' | 'md' | 'lg' | 'xl';
    fullWidth?: boolean;
    fullScreen?: boolean; // Force full screen mode (overrides mobile detection)
    noPadding?: boolean; // Remove content padding (useful for full-screen editors)
    customHeight?: string; // Allow custom height like '100vh', '90vh', etc.
    disableEnforceFocus?: boolean; // Disable focus enforcement for embedded editors like PDFTron
    disableBackdropClick?: boolean; // Prevent closing dialog when clicking backdrop
    /** Override sx for the DialogActions area — useful to adjust button padding per dialog */
    actionsSx?: object;
}

export default function BaseDialog({
    open,
    onClose,
    title,
    titleExtra,
    children,
    actions,
    maxWidth = 'sm',
    fullWidth = true,
    fullScreen: fullScreenProp, // Force full screen mode
    noPadding = false, // Remove content padding
    customHeight,
    disableEnforceFocus = true, // Default to true for better compatibility with PDFTron
    disableBackdropClick = false,
    actionsSx,
}: BaseDialogProps) {
    const theme = useTheme();
    const isMobile = useMediaQuery(theme.breakpoints.down('sm'));
    const isFullScreen = fullScreenProp || isMobile;
    const isDark = theme.palette.mode === 'dark';
    const headerFooterBg = isDark ? 'rgba(255,255,255,0.04)' : '#fafafa';
    const borderColor = isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.08)';

    return (
        <Dialog
            open={open}
            onClose={(event, reason) => {
                if (disableBackdropClick && reason === 'backdropClick') {
                    return;
                }
                onClose();
            }}
            TransitionComponent={Transition}
            maxWidth={maxWidth}
            fullWidth={fullWidth}
            fullScreen={fullScreenProp ?? isMobile}
            disableEnforceFocus={disableEnforceFocus} // Allow embedded editors to manage their own focus
            disableScrollLock={true} // Prevent MUI from messing with body scroll overlay
            PaperProps={{
                sx: {
                    borderRadius: isFullScreen ? 0 : 3,
                    boxShadow: '0 20px 25px -5px rgb(0 0 0 / 0.1), 0 8px 10px -6px rgb(0 0 0 / 0.1)',
                    overflow: 'visible',
                    zIndex: 1300, // Ensure dialog paper is above backdrop but below PDFTron modals
                    ...(customHeight && { height: customHeight, maxHeight: customHeight }), // Apply custom height
                },
            }}
            sx={{
                '& .MuiBackdrop-root': {
                    backgroundColor: 'rgba(0, 0, 0, 0.5)',
                    backdropFilter: 'blur(4px)',
                    zIndex: 1299, // Backdrop should be below dialog paper
                },
                // Ensure PDFTron's internal modals and dialogs appear on top
                '& .webviewer': {
                    position: 'relative',
                    zIndex: 1,
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
                    borderColor,
                    bgcolor: headerFooterBg,
                    px: 1,
                    py: isFullScreen ? 0.3 : 0.7,
                    borderRadius: isFullScreen ? 0 : "16px 16px 0 0",
                }}
            >
                <Typography
                    sx={{
                        fontSize: { xs: '1rem', sm: '1rem' },
                        // fontWeight: 700,
                        color: 'text.primary',
                    }}
                >
                    {title}
                </Typography>
                {titleExtra && (
                    <Box sx={{ display: 'flex', alignItems: 'center', flex: 1, ml: 2 }}>
                        {titleExtra}
                    </Box>
                )}
                <IconButton
                    onClick={onClose}
                    sx={{
                        color: 'text.secondary',
                        transition: 'all 0.2s',
                        p: 0,
                        '&:hover': {
                            bgcolor: 'action.hover',
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
                    px: noPadding ? 0 : { xs: 2, sm: 1 },
                    py: noPadding ? 0 : { xs: 3, sm: 1 },
                    paddingTop: noPadding ? '0 !important' : '16px !important',
                    // Full screen mode: fill available space
                    ...(isFullScreen && noPadding && {
                        flex: 1,
                        display: 'flex',
                        flexDirection: 'column',
                        overflow: 'hidden',
                    }),
                }}
            >
                {children}
            </DialogContent>

            {/* Dialog Actions */}
            {actions && (
                <DialogActions
                    sx={{
                        p: isFullScreen ? 0.5 : 0.8,
                        borderTop: '1px solid',
                        borderColor,
                        bgcolor: headerFooterBg,
                        gap: 1,
                        borderRadius: isFullScreen ? 0 : "0 0 16px 16px",
                        '& .MuiButton-root': { py: 0.5, px: 1.5 },
                        ...actionsSx,
                    }}
                >
                    {actions}
                </DialogActions>
            )}
        </Dialog>
    );
}
