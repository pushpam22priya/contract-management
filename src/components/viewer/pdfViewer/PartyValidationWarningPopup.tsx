'use client';

import React, { useState, useRef, useEffect } from 'react';
import { Box, Alert, Typography, IconButton, Chip } from '@mui/material';
import { Close } from '@mui/icons-material';
import { PartyConfiguration } from '@/types/template';

export interface PartyValidationEntry {
    party: PartyConfiguration;
    filled: number;
    total: number;
    missing: string[];
}

interface PartyValidationWarningPopupProps {
    /** The validation warning data. Popup is hidden when null. */
    partyValidationWarning: PartyValidationEntry[] | null;
    /** Called when a missing field name is clicked — navigate to that field. */
    onNavigateToField: (fieldName: string) => void;
}

/**
 * Shared draggable popup that warns users about partially-filled party fields.
 * Manages its own dismiss state (auto-resets when warning content changes)
 * and drag-to-reposition logic internally.
 *
 * Used by CreateContractDialog, DocumentViewerDialog, and the external sign page.
 */
export default function PartyValidationWarningPopup({
    partyValidationWarning,
    onNavigateToField,
}: PartyValidationWarningPopupProps) {
    const [dismissed, setDismissed] = useState(false);
    const [popupPosition, setPopupPosition] = useState<{ x: number; y: number } | null>(null);
    const [isDragging, setIsDragging] = useState(false);
    const dragStartRef = useRef<{ x: number; y: number; posX: number; posY: number } | null>(null);

    // Reset dismissed state when warning content changes (user fills more fields)
    useEffect(() => {
        if (partyValidationWarning) {
            setDismissed(false);
        }
    }, [JSON.stringify(partyValidationWarning)]);

    // Drag move / up listeners
    useEffect(() => {
        if (!isDragging) return;

        const handleMouseMove = (e: MouseEvent) => {
            if (!dragStartRef.current) return;
            const dx = e.clientX - dragStartRef.current.x;
            const dy = e.clientY - dragStartRef.current.y;
            setPopupPosition({
                x: dragStartRef.current.posX + dx,
                y: dragStartRef.current.posY + dy,
            });
        };

        const handleMouseUp = () => {
            setIsDragging(false);
            dragStartRef.current = null;
        };

        document.addEventListener('mousemove', handleMouseMove);
        document.addEventListener('mouseup', handleMouseUp);
        return () => {
            document.removeEventListener('mousemove', handleMouseMove);
            document.removeEventListener('mouseup', handleMouseUp);
        };
    }, [isDragging]);

    const handleDragStart = (e: React.MouseEvent) => {
        e.preventDefault();
        const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
        dragStartRef.current = {
            x: e.clientX,
            y: e.clientY,
            posX: popupPosition?.x ?? rect.left,
            posY: popupPosition?.y ?? rect.top,
        };
        setIsDragging(true);
    };

    if (!partyValidationWarning || dismissed) return null;

    return (
        <Box
            sx={{
                ...(popupPosition ? {
                    position: 'fixed',
                    top: popupPosition.y,
                    left: popupPosition.x,
                    transform: 'none',
                } : {
                    position: 'absolute',
                    top: 8,
                    left: '50%',
                    transform: 'translateX(-50%)',
                }),
                zIndex: 1000,
                maxWidth: '90%',
                minWidth: 300,
            }}
        >
            <Alert
                severity="warning"
                sx={{
                    py: 0.5,
                    boxShadow: 3,
                    borderRadius: 2,
                    pr: 5,
                    bgcolor: (theme) => theme.palette.mode === 'dark' ? '#2d1f00' : '#fff4e5',
                    cursor: isDragging ? 'grabbing' : 'grab',
                    userSelect: 'none',
                }}
                onMouseDown={handleDragStart}
                action={
                    <IconButton
                        size="small"
                        onClick={() => setDismissed(true)}
                        onMouseDown={(e) => e.stopPropagation()}
                        sx={{ position: 'absolute', top: 4, right: 4 }}
                    >
                        <Close fontSize="small" />
                    </IconButton>
                }
            >
                <Typography variant="body2" fontWeight={600} sx={{ mb: 0.5 }}>
                    Complete all fields for the party you started filling:
                </Typography>
                <Box sx={{ maxHeight: 100, overflowY: 'auto' }}>
                    {partyValidationWarning.map(({ party, filled, total, missing }) => (
                        <Box key={party.id} sx={{ display: 'flex', alignItems: 'center', gap: 1, mt: 0.5 }}>
                            <Chip
                                label={party.label}
                                size="small"
                                sx={{ bgcolor: party.color, color: '#fff', fontWeight: 600, minWidth: 32 }}
                            />
                            <Typography variant="caption" component="span">
                                {filled}/{total} fields filled — missing:{' '}
                                {missing.map((name, i) => (
                                    <span key={name}>
                                        <Typography
                                            variant="caption"
                                            component="span"
                                            onClick={(e) => {
                                                e.stopPropagation();
                                                onNavigateToField(name);
                                            }}
                                            sx={{
                                                cursor: 'pointer',
                                                textDecoration: 'underline',
                                                color: 'primary.main',
                                                fontWeight: 600,
                                                '&:hover': { color: 'primary.dark' },
                                            }}
                                        >
                                            {name}
                                        </Typography>
                                        {i < missing.length - 1 ? ', ' : ''}
                                    </span>
                                ))}
                            </Typography>
                        </Box>
                    ))}
                </Box>
            </Alert>
        </Box>
    );
}
