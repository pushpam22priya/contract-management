'use client';

import AppButton from '@/components/common/AppButton';
import React from 'react';
import { Box, Alert, Typography } from '@mui/material';

/**
 * Describes which fields to navigate to when the user dismisses the warning.
 * - 'party': navigate to the first field belonging to the given party IDs
 * - 'nonClient': navigate to the first field NOT belonging to the excluded party IDs (contractor case)
 */
export type NavigateConfig =
    | { type: 'party'; partyIds: string[] }
    | { type: 'nonClient'; excludePartyIds: string[] };

interface WrongPartyWarningDialogProps {
    open: boolean;
    title: string;
    description: React.ReactNode;
    /** Ref to PDFViewerContainer — used to call navigation methods on dismiss */
    pdfViewerRef: React.RefObject<any>;
    /** Describes which fields to navigate to on dismiss */
    navigateConfig: NavigateConfig;
    /** Called to close the dialog (set state to false) */
    onClose: () => void;
    zIndex?: number;
}

/**
 * Shared warning dialog shown when a user tries to edit a field that belongs to another party.
 * Handles both showing the warning and navigating to the user's assigned fields on dismiss.
 * Used by the external sign page and DocumentViewerDialog.
 */
export default function WrongPartyWarningDialog({
    open,
    title,
    description,
    pdfViewerRef,
    navigateConfig,
    onClose,
    zIndex = 1100,
}: WrongPartyWarningDialogProps) {
    if (!open) return null;

    const handleDismiss = async () => {
        onClose();
        if (!pdfViewerRef.current) return;
        if (navigateConfig.type === 'party') {
            if (navigateConfig.partyIds.length > 0) {
                await pdfViewerRef.current.navigateToFirstPartyField(navigateConfig.partyIds);
            }
        } else {
            await pdfViewerRef.current.navigateToFirstNonClientField(navigateConfig.excludePartyIds);
        }
    };

    return (
        <Box
            sx={{
                position: 'fixed',
                top: '50%',
                left: '50%',
                transform: 'translate(-50%, -50%)',
                zIndex,
                maxWidth: 420,
                minWidth: 340,
            }}
        >
            <Alert
                severity="warning"
                sx={{
                    py: 1,
                    px: 2,
                    boxShadow: 8,
                    borderRadius: 2,
                    border: '2px solid',
                    borderColor: 'warning.main',

                    '& .MuiAlert-icon': {
                        padding: '12px 0'
                    }
                }}
            >
                <Typography variant="h6" fontWeight={700} sx={{ mb: 1 }}>
                    {title}
                </Typography>
                <Typography variant="body1" sx={{ mb: 2 }}>
                    {description}
                </Typography>
                <Typography variant="body2" sx={{ color: 'text.secondary', mb: 2 }}>
                    Please only fill the fields that belong to you.
                </Typography>
                <AppButton
                    fullWidth
                    variant="contained"
                    color="warning"
                    onClick={handleDismiss}
                    sx={{ fontWeight: 600, py: 0.8 }}
                >
                    I Understand — Go to My Fields
                </AppButton>
            </Alert>
        </Box>
    );
}
