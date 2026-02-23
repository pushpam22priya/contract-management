/* eslint-disable @typescript-eslint/no-explicit-any */
/* eslint-disable @typescript-eslint/no-unused-vars */
'use client';

import { Box, Button, Alert, Typography, Chip, IconButton, Tooltip } from '@mui/material';
import SaveIcon from '@mui/icons-material/Save';
import { Close } from '@mui/icons-material';
import dynamic from 'next/dynamic';
import { useRef, useState, useEffect, useMemo } from 'react';
import BaseDialog from '@/components/common/BaseDialog';
import { validatePartyFields } from '@/utils/partyValidation';
import { PartyConfiguration } from '@/types/template';

// Dynamically import viewers
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
            Loading document viewer...
        </Box>
    ),
});

const SimpleContractViewer = dynamic(() => import('./SimpleContractViewer'), {
    ssr: false,
});

const PDFViewerContainer = dynamic(() => import('./PDFViewerContainer'), {
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
            Loading PDF viewer...
        </Box>
    ),
});

interface DocumentViewerDialogProps {
    open: boolean;
    onClose: () => void;
    fileUrl: string;
    fileName?: string;
    title?: string;
    content?: string;
    templateDocxBase64?: string;
    fieldValues?: Record<string, string>;
    signatureImage?: string;
    // ✅ NEW: XFDF data to restore annotations on load
    initialXfdf?: string;
    contractId?: string;
    // ✅ CRITICAL: onSave now receives PDF Blob, XFDF string, fieldValues, and formFields for full persistence
    onSave?: (pdfBlob: Blob, xfdfString: string, fieldValues?: Record<string, string>, formFields?: any[]) => Promise<void>;
    readOnly?: boolean;
    commentsOnly?: boolean;
    clientSigningMode?: boolean;
    templateFormFields?: any[];
    formFields?: any[];
    currentUserRole?: 'contractor' | 'client';
    // ✅ NEW: Permission control props for field lifecycle
    canAddFormFields?: boolean;
    editableFieldMode?: 'all' | 'empty-only' | 'none';
    showAnnotationNavigation?: boolean; // ✅ Show floating navigation button for annotations
    parties?: any[]; // ✅ Party configurations for validation
    externalSigners?: any[]; // ✅ External signers to determine client parties (contractor protection)
}

export default function DocumentViewerDialog({
    open,
    onClose,
    fileUrl,
    fileName,
    title,
    content,
    templateDocxBase64,
    fieldValues,
    signatureImage,
    initialXfdf,
    contractId,
    onSave,
    readOnly = false,
    commentsOnly = false,
    clientSigningMode = false,
    templateFormFields,
    formFields,
    currentUserRole,
    canAddFormFields = false,
    editableFieldMode = 'all',
    showAnnotationNavigation = false,
    parties,
    externalSigners,
}: DocumentViewerDialogProps) {


    const pdfViewerRef = useRef<any>(null);
    const [saving, setSaving] = useState(false);
    const [signatureCommitted, setSignatureCommitted] = useState(false);

    // ✅ Wrong party warning for contractor - shows when contractor tries to edit client party field
    const [showWrongPartyWarning, setShowWrongPartyWarning] = useState(false);

    // ✅ Calculate client party IDs (parties that have external signers assigned)
    const clientPartyIds = useMemo(() => {
        console.log(`📋 [DocumentViewerDialog] Computing clientPartyIds from externalSigners:`, externalSigners);
        if (!externalSigners || externalSigners.length === 0) {
            console.log(`📋 [DocumentViewerDialog] No externalSigners - clientPartyIds = []`);
            return [];
        }
        // Handle both single partyId (string) and multiple partyIds (array)
        const partyIds: string[] = [];
        externalSigners.forEach((signer: any) => {
            if (signer.partyId) {
                // partyId could be a string or an array of strings
                if (Array.isArray(signer.partyId)) {
                    partyIds.push(...signer.partyId);
                } else {
                    partyIds.push(signer.partyId);
                }
            }
        });
        const uniqueIds = [...new Set(partyIds)];
        console.log(`📋 [DocumentViewerDialog] Computed clientPartyIds = [${uniqueIds.join(', ')}]`);
        return uniqueIds; // Remove duplicates
    }, [externalSigners]);

    // ✅ Store initial field values for restoration (for contractor protection)
    const initialFieldValuesRef = useRef<Record<string, string>>({});

    // ✅ Track if user has interacted with the document (to avoid warning on initial load)
    const userHasInteractedRef = useRef(false);


    // Track field changes during client signing (same pattern as CreateContractDialog)
    // ✅ CRITICAL FIX: Initialize with existing field values from formFields
    // so that pre-filled fields (from a previously saved contract) are recognized
    const [filledFieldValues, setFilledFieldValues] = useState<Record<string, string>>(() => {
        if (!formFields) return {};
        const initial: Record<string, string> = {};
        formFields.forEach((field: any) => {
            if (field.value && field.value.toString().trim() !== '') {
                initial[field.name] = field.value.toString();
            }
        });
        console.log(`📋 [DocumentViewerDialog] Initialized filledFieldValues from ${Object.keys(initial).length} pre-filled formFields`);
        return initial;
    });

    // ✅ CRITICAL FIX: Reset all transient state when dialog reopens
    // If user closed without saving, discard in-session edits and re-seed from formFields
    useEffect(() => {
        if (open) {
            const initial: Record<string, string> = {};
            const partyAssignments: Record<string, string> = {};
            if (formFields) {
                formFields.forEach((field: any) => {
                    if (field.value && field.value.toString().trim() !== '') {
                        initial[field.name] = field.value.toString();
                    }
                    if (field.assignedParty) {
                        partyAssignments[field.name] = field.assignedParty;
                    }
                });
            }
            setFilledFieldValues(initial);
            setDismissedPartyWarning(false);
            setPopupPosition(null);
            setSignatureCommitted(false);
            setShowWrongPartyWarning(false);
            // ✅ Capture initial values for contractor protection (to restore if they edit client fields)
            initialFieldValuesRef.current = { ...initial };
            // ✅ Reset user interaction flag - will be set to true after initial load completes
            userHasInteractedRef.current = false;
            // Set interaction flag after a delay to skip initial PDF load events
            setTimeout(() => {
                userHasInteractedRef.current = true;
                console.log(`✅ [DocumentViewerDialog] User interaction tracking enabled`);
            }, 2000); // 2 second delay to let PDF finish loading
            console.log(`🔄 [DocumentViewerDialog] Dialog opened — currentUserRole: ${currentUserRole}`);
            console.log(`🔄 [DocumentViewerDialog] Dialog opened — ${Object.keys(initial).length} pre-filled values`);
            console.log(`🔄 [DocumentViewerDialog] Dialog opened — Party assignments:`, partyAssignments);
            console.log(`🔄 [DocumentViewerDialog] Dialog opened — clientPartyIds: [${clientPartyIds.join(', ')}]`);
        }
    }, [open, currentUserRole, clientPartyIds]);

    // Track if user dismissed the party validation warning popup
    const [dismissedPartyWarning, setDismissedPartyWarning] = useState(false);

    // Draggable popup state
    const [popupPosition, setPopupPosition] = useState<{ x: number; y: number } | null>(null);
    const [isDragging, setIsDragging] = useState(false);
    const dragStartRef = useRef<{ x: number; y: number; posX: number; posY: number } | null>(null);

    // Handle form field changes
    const handleFieldChange = (fieldName: string, value: any) => {
        // ✅ SIGNATURE COMMIT SIGNAL — DO NOT STORE AS FIELD
        if (fieldName === '__signature_committed__') {
            setSignatureCommitted(true);
            return;
        }

        // Get the initial value and current value
        const initialValue = initialFieldValuesRef.current[fieldName] || '';
        const newValue = value?.toString() || '';

        // ✅ Skip if this is just restoring/importing the same value (not a real user edit)
        // This happens during XFDF import when signatures are loaded
        if (newValue === initialValue || (initialValue && newValue === 'signed')) {
            console.log(`📝 [DocumentViewerDialog] Skipping protection for ${fieldName} - value matches initial or is signature import`);
            // Still update state for tracking
            setFilledFieldValues(prev => ({
                ...prev,
                [fieldName]: newValue
            }));
            return;
        }

        // ✅ CONTRACTOR PROTECTION: Prevent contractor from editing client party fields
        const isContractor = currentUserRole === 'contractor';
        const hasClientParties = clientPartyIds.length > 0;
        const hasFormFields = !!formFields;

        if (isContractor && hasClientParties && hasFormFields) {
            const field = formFields.find((f: any) => f.name === fieldName);

            // Check exact values and comparison
            const fieldParty = field?.assignedParty;
            const includesResult = clientPartyIds.includes(fieldParty);

            if (field?.assignedParty && includesResult) {
                console.log(`🚫 [DocumentViewerDialog] BLOCKING! Contractor tried to edit client party field: ${fieldName} (party: ${field.assignedParty})`);
                setShowWrongPartyWarning(true);

                // Get the original value and restore it
                const originalValue = initialFieldValuesRef.current[fieldName] || '';
                setFilledFieldValues(prev => ({
                    ...prev,
                    [fieldName]: originalValue
                }));

                // Restore the field in the PDF viewer
                if (originalValue) {
                    if (pdfViewerRef.current?.restoreFieldValue) {
                        pdfViewerRef.current.restoreFieldValue(fieldName, originalValue);
                    }
                } else {
                    if (pdfViewerRef.current?.clearField) {
                        pdfViewerRef.current.clearField(fieldName);
                    }
                }

                return; // Don't save the change
            }
        }

        // ✅ NORMAL FORM FIELD
        setFilledFieldValues(prev => ({
            ...prev,
            [fieldName]: value?.toString() || ''
        }));
    };

    // ✅ Party validation: detect partially filled parties (same pattern as CreateContractDialog)
    const partyValidationWarning = useMemo(() => {
        if (!formFields || !parties) return null;

        const partialParties: { party: PartyConfiguration; filled: number; total: number; missing: string[] }[] = [];

        for (const party of parties) {
            const result = validatePartyFields(party.id, formFields, filledFieldValues);
            if (result.filledCount > 0 && result.filledCount < result.totalCount) {
                const partyFields = formFields.filter((f: any) => f.assignedParty === party.id);
                const unfilledFields = partyFields
                    .filter((f: any) => {
                        const val = filledFieldValues[f.name];
                        return !val || val.toString().trim() === '';
                    })
                    .map((f: any) => f.name);

                partialParties.push({
                    party,
                    filled: result.filledCount,
                    total: result.totalCount,
                    missing: unfilledFields,
                });
            }
        }

        return partialParties.length > 0 ? partialParties : null;
    }, [filledFieldValues, formFields, parties]);

    const hasPartialParty = !!partyValidationWarning;

    // Reset dismissed state when warning content changes (user fills more fields)
    useEffect(() => {
        if (partyValidationWarning) {
            setDismissedPartyWarning(false);
        }
    }, [JSON.stringify(partyValidationWarning)]);

    // Drag handlers for warning popup
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


    // Log form fields when component mounts/updates
    if (formFields && formFields.length > 0) {
        console.log('📋 DocumentViewerDialog: Received form fields:', formFields.length);
    }

    // ✅ CRITICAL FIX: Handle save button click - now exports PDF Blob + XFDF + fieldValues + formFields
    // This matches the contract creation flow in CreateContractDialog
    const handleSaveClick = async () => {
        if (!pdfViewerRef.current) {
            console.error('PDF viewer ref not available');
            return;
        }

        setSaving(true);

        try {
            console.log('📝 [DocumentViewerDialog] Starting export from DRAFT with field values:', filledFieldValues);
            console.log('📝 [DocumentViewerDialog] Initial XFDF length:', initialXfdf?.length || 0);

            // ✅ FIX: Use flatten: false to keep annotations interactive in drafts
            // Flattening (true) burns annotations into the PDF image, making them permanent.
            // By using false, we preserve the ability to edit/delete annotations using the XFDF data.
            const exportResult = await pdfViewerRef.current.exportAnnotations({}, { flatten: false });

            if (!exportResult) {
                console.error('Failed to export PDF - received null');
                return;
            }

            const { blob, xfdfString } = exportResult;

            console.log(`✅ PDF exported from DRAFT: ${blob.size} bytes`);
            console.log(`✅ XFDF exported from DRAFT: ${xfdfString.length} chars`);
            console.log(`📊 XFDF size comparison: Initial=${initialXfdf?.length || 0}, Exported=${xfdfString.length}`);

            // ✅ CRITICAL FIX: Also export formFields (same as CreateContractDialog)
            // This ensures field definitions, readOnly flags, and locked states persist
            let exportedFormFields: any[] | undefined;
            try {
                exportedFormFields = await pdfViewerRef.current.exportFormFields();
                // Sync values from filledFieldValues into exportedFormFields
                if (exportedFormFields) {
                    exportedFormFields = exportedFormFields.map((field: any) => ({
                        ...field,
                        value: filledFieldValues[field.name] || field.value || ''
                    }));
                }
                console.log(`✅ FormFields exported: ${exportedFormFields?.length || 0} fields`);
            } catch (e) {
                console.warn('⚠️ Could not export form fields:', e);
            }

            if (onSave) {
                // ✅ Pass PDF Blob, XFDF, fieldValues, and formFields to the save callback
                // This matches how CreateContractDialog saves contracts
                console.log(`📤 [DocumentViewerDialog] Triggering onSave with ${blob.size} byte Blob + XFDF + fieldValues + formFields`);
                await onSave(blob, xfdfString, filledFieldValues, exportedFormFields);
                console.log('✅ Changes saved to contract successfully!');

                // ✅ NEW: Clear the SignatureStore after successful save
                try {
                    pdfViewerRef.current?.clearSignatureStore?.();
                    console.log('🧹 [DocumentViewerDialog] Cleared SignatureStore after save');
                } catch (e) {
                    console.warn('⚠️ Could not clear signature store:', e);
                }

                // ✅ Close dialog after successful save
                onClose();
            }

        } catch (error) {
            console.error('❌ Error saving changes:', error);
        } finally {
            setSaving(false);
        }
    };

    // Action buttons for dialog footer
    // ✅ Show save button if onSave callback is provided
    // ✅ Disable save when party fields are partially filled
    const dialogActions = (
        <>
            {onSave && (
                <Tooltip title={hasPartialParty ? 'Complete all fields for the party you started' : ''} arrow>
                    <span>
                        <Button
                            variant="contained"
                            startIcon={<SaveIcon />}
                            onClick={handleSaveClick}
                            disabled={saving || hasPartialParty || (clientSigningMode && !signatureCommitted)}
                            sx={{ py: 0.6 }}
                        >
                            {saving ? 'Saving...' : 'Save Changes'}
                        </Button>
                    </span>
                </Tooltip>
            )}
        </>
    );

    return (
        <BaseDialog
            open={open}
            onClose={onClose}
            title={title || fileName || 'Document Viewer'}
            maxWidth="lg"
            fullWidth
            fullScreen
            noPadding
            actions={dialogActions}
        >
            <Box sx={{ display: 'flex', flexDirection: 'column', flex: 1, overflow: 'hidden' }}>
                <Box sx={{ flex: 1, overflow: 'hidden', position: 'relative' }}>
                    <PDFViewerContainer
                        ref={pdfViewerRef}
                        documentUrl={fileUrl || ""}
                        initialXfdf={initialXfdf}
                        readOnly={readOnly}
                        commentsOnly={commentsOnly}
                        clientSigningMode={clientSigningMode}
                        templateFormFields={templateFormFields}
                        formFields={formFields}
                        currentUserRole={currentUserRole}
                        onFieldChange={handleFieldChange}
                        canAddFormFields={canAddFormFields}
                        editableFieldMode={editableFieldMode}
                        showAnnotationNavigation={showAnnotationNavigation}
                        // ✅ For contractor: Show warning when signature position is restored (silent restore + warning)
                        silentPositionRestore={readOnly}
                        onSignaturePositionRestored={currentUserRole === 'contractor' && clientPartyIds.length > 0 ? () => setShowWrongPartyWarning(true) : undefined}
                    />

                    {/* ✅ Party Validation Warning Popup (same as CreateContractDialog) */}
                    {partyValidationWarning && !dismissedPartyWarning && (
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
                                    cursor: isDragging ? 'grabbing' : 'grab',
                                    userSelect: 'none',
                                }}
                                onMouseDown={handleDragStart}
                                action={
                                    <IconButton
                                        size="small"
                                        onClick={() => setDismissedPartyWarning(true)}
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
                                            <Typography variant="caption">
                                                {filled}/{total} fields filled — missing: {missing.join(', ')}
                                            </Typography>
                                        </Box>
                                    ))}
                                </Box>
                            </Alert>
                        </Box>
                    )}

                    {/* ✅ Wrong Party Warning Dialog - for contractor trying to edit client party fields */}
                    {showWrongPartyWarning && currentUserRole === 'contractor' && (
                        <Box
                            sx={{
                                position: 'fixed',
                                top: '50%',
                                left: '50%',
                                transform: 'translate(-50%, -50%)',
                                zIndex: 1200,
                                maxWidth: 420,
                                minWidth: 340,
                            }}
                        >
                            <Alert
                                severity="warning"
                                sx={{
                                    py: 2,
                                    px: 2.5,
                                    boxShadow: 8,
                                    borderRadius: 2,
                                    border: '2px solid',
                                    borderColor: 'warning.main',
                                }}
                            >
                                <Typography variant="h6" fontWeight={700} sx={{ mb: 1 }}>
                                    Client Party Field
                                </Typography>
                                <Typography variant="body1" sx={{ mb: 2 }}>
                                    This field is assigned to a client party and cannot be edited by the contractor.
                                </Typography>
                                <Typography variant="body2" sx={{ color: 'text.secondary', mb: 2 }}>
                                    Your changes have been automatically reverted. Only clients assigned to this party can fill these fields.
                                </Typography>
                                <Button
                                    fullWidth
                                    variant="contained"
                                    color="warning"
                                    onClick={() => setShowWrongPartyWarning(false)}
                                    sx={{ textTransform: 'none', fontWeight: 600 }}
                                >
                                    I Understand
                                </Button>
                            </Alert>
                        </Box>
                    )}
                </Box>
            </Box>
        </BaseDialog>
    );
}