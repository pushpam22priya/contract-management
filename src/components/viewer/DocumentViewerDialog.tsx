/* eslint-disable @typescript-eslint/no-explicit-any */
/* eslint-disable @typescript-eslint/no-unused-vars */
'use client';

import { Box, Button, Alert, Typography, Chip, Tooltip } from '@mui/material';
import SaveIcon from '@mui/icons-material/Save';
import dynamic from 'next/dynamic';
import { useRef, useState, useEffect, useMemo } from 'react';
import BaseDialog from '@/components/common/BaseDialog';
import ConfirmationDialog from '@/components/common/ConfirmationDialog';
import WrongPartyWarningDialog from '@/components/viewer/pdfViewer/WrongPartyWarningDialog';
import PartyValidationWarningPopup from '@/components/viewer/pdfViewer/PartyValidationWarningPopup';
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
    internalSigners?: any[]; // ✅ Internal signers to determine internal client parties (contractor protection)
    // ✅ NEW: Assigned party for internal signer - displays chip and validates completion
    assignedPartyId?: string;
    assignedPartyLabel?: string;
    assignedPartyColor?: string;
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
    internalSigners,
    assignedPartyId,
    assignedPartyLabel,
    assignedPartyColor,
}: DocumentViewerDialogProps) {


    const pdfViewerRef = useRef<any>(null);
    const [saving, setSaving] = useState(false);
    const [showUnsavedDialog, setShowUnsavedDialog] = useState(false);
    const [signatureCommitted, setSignatureCommitted] = useState(false);
    // ✅ Track if validation has been triggered (by clicking save)
    const [validationTriggered, setValidationTriggered] = useState(false);

    // ✅ Wrong party warning for contractor - shows when contractor tries to edit client party field
    const [showWrongPartyWarning, setShowWrongPartyWarning] = useState(false);
    // Track values at last save to detect unsaved changes
    const lastSavedValuesRef = useRef<Record<string, string>>({});

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

    // ✅ Calculate internal client party IDs (parties that have internal signers assigned)
    const internalClientPartyIds = useMemo(() => {
        if (!internalSigners || internalSigners.length === 0) return [];
        const partyIds: string[] = [];
        internalSigners.forEach((signer: any) => {
            if (signer.partyId) {
                if (Array.isArray(signer.partyId)) {
                    partyIds.push(...signer.partyId);
                } else {
                    partyIds.push(signer.partyId);
                }
            }
        });
        const uniqueIds = [...new Set(partyIds)];
        console.log(`📋 [DocumentViewerDialog] Computed internalClientPartyIds = [${uniqueIds.join(', ')}]`);
        return uniqueIds;
    }, [internalSigners]);

    // ✅ All protected party IDs for contractor (both external + internal client parties)
    const allClientPartyIds = useMemo(() => {
        const combined = [...new Set([...clientPartyIds, ...internalClientPartyIds])];
        if (combined.length > 0) {
            console.log(`📋 [DocumentViewerDialog] allClientPartyIds (for contractor protection) = [${combined.join(', ')}]`);
        }
        return combined;
    }, [clientPartyIds, internalClientPartyIds]);

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

    // ✅ Contractor single-party restriction.
    // Managed as explicit state+ref (NOT derived from filledFieldValues) to avoid:
    //   - stale closure / async useEffect timing issues
    //   - false positives during the 2-second PDF load window
    // The ref is updated SYNCHRONOUSLY inside handleFieldChange so it is always current.
    const [contractorCommittedPartyId, setContractorCommittedPartyId] = useState<string | null>(null);
    const contractorCommittedPartyIdRef = useRef<string | null>(null);
    // Tracks which kind of warning to show ('client-party' or 'single-party')
    const [contractorWarnType, setContractorWarnType] = useState<'client-party' | 'single-party'>('client-party');

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
            setSignatureCommitted(false);
            setShowWrongPartyWarning(false);
            setShowUnsavedDialog(false);
            setValidationTriggered(false);

            // ✅ Initialise contractor committed party from pre-filled values
            // (the party the contractor filled when they created the contract)
            if (currentUserRole === 'contractor' && formFields) {
                const firstFilledParty = (formFields as any[]).find(
                    (f) => f.assignedParty && initial[f.name]?.trim()
                )?.assignedParty ?? null;
                setContractorCommittedPartyId(firstFilledParty);
                contractorCommittedPartyIdRef.current = firstFilledParty;
            } else {
                setContractorCommittedPartyId(null);
                contractorCommittedPartyIdRef.current = null;
            }
            // ✅ Capture initial values for contractor protection (to restore if they edit client fields)
            initialFieldValuesRef.current = { ...initial };
            // ✅ Track last saved values to detect unsaved changes
            lastSavedValuesRef.current = { ...initial };
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

        // ✅ Skip if value matches initial (restore/reload — field is returning to its saved state)
        // NOTE: Do NOT skip 'signed' unconditionally — user-placed signatures also emit 'signed',
        // so skipping it would let contractors bypass signature-field protection.
        if (newValue === initialValue) {
            // Still update state for tracking
            setFilledFieldValues(prev => ({
                ...prev,
                [fieldName]: newValue
            }));
            return;
        }

        // ✅ INTERNAL SIGNER PROTECTION: Prevent internal signer from editing OTHER party's fields
        // This is similar to external signer protection in the public signing page
        const isInternalSigner = !!assignedPartyId && currentUserRole === 'client';
        const hasFormFields = !!formFields;

        if (isInternalSigner && hasFormFields && userHasInteractedRef.current) {
            const field = formFields.find((f: any) => f.name === fieldName);
            const fieldParty = field?.assignedParty;

            // If this field belongs to a different party, restore to original value and show warning
            if (fieldParty && fieldParty !== assignedPartyId) {
                console.log(`🚫 [DocumentViewerDialog] BLOCKING! Internal signer tried to edit other party field: ${fieldName} (field party: ${fieldParty}, assigned party: ${assignedPartyId})`);
                setShowWrongPartyWarning(true);

                // Get the original value (may be empty or pre-filled)
                const originalValue = initialFieldValuesRef.current[fieldName] || '';

                // Restore the field value in state to original
                setFilledFieldValues(prev => ({
                    ...prev,
                    [fieldName]: originalValue
                }));

                // Restore the field in the PDF viewer to original value
                if (originalValue) {
                    if (pdfViewerRef.current?.restoreFieldValue) {
                        pdfViewerRef.current.restoreFieldValue(fieldName, originalValue);
                    }
                } else {
                    if (pdfViewerRef.current?.clearField) {
                        pdfViewerRef.current.clearField(fieldName);
                    }
                }

                return; // Exit early, don't save the wrong party's value
            }
        }

        // ✅ CONTRACTOR PROTECTION (unified)
        const isContractor = currentUserRole === 'contractor';

        if (isContractor && hasFormFields) {
            const field = formFields!.find((f: any) => f.name === fieldName);
            const fieldParty = (field as any)?.assignedParty;

            if (fieldParty) {
                const revert = () => {
                    const orig = initialFieldValuesRef.current[fieldName] || '';
                    if (orig) pdfViewerRef.current?.restoreFieldValue?.(fieldName, orig);
                    else pdfViewerRef.current?.clearField?.(fieldName);
                };

                // Case 1: Field belongs to an already-assigned signer party — block after interaction starts
                // (userHasInteractedRef guard prevents false positives during XFDF restoration on load)
                if (allClientPartyIds.includes(fieldParty) && userHasInteractedRef.current) {
                    console.log(`🚫 [DocumentViewerDialog] Contractor blocked — client party field: ${fieldName} (${fieldParty})`);
                    setContractorWarnType('client-party');
                    setShowWrongPartyWarning(true);
                    revert();
                    return;
                }

                // Case 2: Single-party restriction — only apply after interaction tracking starts
                // (avoids false positives during the 2-second PDF load window)
                if (userHasInteractedRef.current) {
                    if (contractorCommittedPartyIdRef.current === null) {
                        // First party the contractor fills → commit to it (update ref synchronously)
                        contractorCommittedPartyIdRef.current = fieldParty;
                        setContractorCommittedPartyId(fieldParty);
                    } else if (contractorCommittedPartyIdRef.current !== fieldParty) {
                        // Different party → block
                        console.log(`🚫 [DocumentViewerDialog] Contractor blocked — already committed to ${contractorCommittedPartyIdRef.current}, tried ${fieldParty}`);
                        setContractorWarnType('single-party');
                        setShowWrongPartyWarning(true);
                        revert();
                        return;
                    }
                }
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

    // ✅ Check if internal signer has filled ALL their assigned party fields
    const { hasFilledAllAssignedFields, unfilledFieldCount } = useMemo(() => {
        // If no assigned party (not an internal signer flow), allow submit
        if (!assignedPartyId || !formFields) {
            return { hasFilledAllAssignedFields: true, unfilledFieldCount: 0 };
        }

        // Get all fields assigned to this internal signer's party
        const partyFields = formFields.filter((f: any) => f.assignedParty === assignedPartyId);

        // Filter to only editable fields (fields that are empty or were not pre-filled)
        const editableFields = partyFields.filter((f: any) => {
            const prefilledVal = initialFieldValuesRef.current[f.name];
            // Field is editable if it wasn't pre-filled
            return !prefilledVal || prefilledVal.toString().trim() === '';
        });

        // Count how many of these fields are filled
        const filledCount = editableFields.filter((f: any) => {
            const val = filledFieldValues[f.name];
            return val && val.toString().trim() !== '';
        }).length;

        const unfilled = editableFields.length - filledCount;
        const allFilled = unfilled === 0;

        console.log(`📋 [INTERNAL SIGNER CHECK] Party: ${assignedPartyId}, Fields: ${editableFields.length}, Filled: ${filledCount}, Unfilled: ${unfilled}`);

        return {
            hasFilledAllAssignedFields: allFilled,
            unfilledFieldCount: unfilled
        };
    }, [assignedPartyId, formFields, filledFieldValues]);

    // ✅ Check if there are unsaved changes (comparing current values to last saved values)
    const hasUnsavedChanges = (): boolean => {
        // Only track unsaved changes if onSave is provided (edit mode)
        if (!onSave) return false;

        const currentKeys = Object.keys(filledFieldValues);
        const savedKeys = Object.keys(lastSavedValuesRef.current);

        // Check if any new fields were filled
        if (currentKeys.length !== savedKeys.length) return true;

        // Check if any values changed
        for (const key of currentKeys) {
            if (filledFieldValues[key] !== lastSavedValuesRef.current[key]) {
                return true;
            }
        }

        return false;
    };

    // ✅ Handle close attempt - always show confirmation dialog when onSave is available (edit mode)
    const handleCloseAttempt = () => {
        if (onSave) {
            // Edit mode: always show confirmation dialog
            setShowUnsavedDialog(true);
        } else {
            // Read-only mode: close directly
            onClose();
        }
    };

    // ✅ Handle confirmation dialog: Yes - save and close
    const handleUnsavedYes = async () => {
        setShowUnsavedDialog(false);
        await handleSaveClick();
        onClose();
    };

    // ✅ Handle confirmation dialog: No - close without saving
    const handleUnsavedNo = () => {
        setShowUnsavedDialog(false);
        onClose();
    };

    // ✅ Handle confirmation dialog: Cancel - stay in dialog
    const handleUnsavedCancel = () => {
        setShowUnsavedDialog(false);
    };

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

        // ✅ Check for validation before proceeding
        if (hasPartialParty || (assignedPartyId && !hasFilledAllAssignedFields)) {
            console.warn(`📋 [SAVE BLOCKED] Required fields missing. PartialParty: ${hasPartialParty}, AllAssigned: ${hasFilledAllAssignedFields}`);
            setValidationTriggered(true);
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

                // ✅ Update last saved values to track unsaved changes correctly
                lastSavedValuesRef.current = { ...filledFieldValues };
                console.log('📝 [DocumentViewerDialog] Updated lastSavedValuesRef after save');

                // ✅ NOTE: Don't close dialog after saving - user can continue editing
                // Dialog closes when user clicks the close button (with unsaved changes confirmation)
            }

        } catch (error) {
            console.error('❌ Error saving changes:', error);
        } finally {
            setSaving(false);
        }
    };

    // ✅ Determine if save button should be disabled
    // For internal signers (assignedPartyId is set): require all assigned party fields to be filled
    // For legacy client signing mode: require signature committed
    const getSaveDisabledReason = (): string => {
        if (hasPartialParty) return 'Complete all fields for the party you started';
        if (assignedPartyId && !hasFilledAllAssignedFields) {
            return `Please fill all your assigned fields (${unfilledFieldCount} remaining)`;
        }
        if (clientSigningMode && !assignedPartyId && !signatureCommitted) {
            return 'Please add your signature before saving';
        }
        return '';
    };

    const saveDisabled = saving || (validationTriggered && (hasPartialParty || (assignedPartyId && !hasFilledAllAssignedFields))) ||
        (!validationTriggered && clientSigningMode && !assignedPartyId && !signatureCommitted);

    // Action buttons for dialog footer
    // ✅ Show save button if onSave callback is provided
    // ✅ Disable save when party fields are partially filled or not all assigned fields are complete
    const dialogActions = (
        <>
            {onSave && (
                <Tooltip title={getSaveDisabledReason()} arrow>
                    <span>
                        <Button
                            variant="contained"
                            startIcon={<SaveIcon />}
                            onClick={handleSaveClick}
                            disabled={saveDisabled}
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
        <>
        <BaseDialog
            open={open}
            onClose={handleCloseAttempt}
            title={title || fileName || 'Document Viewer'}
            titleExtra={assignedPartyId && assignedPartyLabel ? (
                <>
                    <Typography variant="body2" sx={{ color: 'text.secondary', fontWeight: 500, fontSize: '0.8rem', whiteSpace: 'nowrap' }}>
                        Your fields:
                    </Typography>
                    <Chip
                        label={assignedPartyLabel}
                        size="small"
                        sx={{
                            ml: 0.75,
                            bgcolor: assignedPartyColor || '#1976d2',
                            color: '#fff',
                            fontWeight: 600,
                            fontSize: '0.75rem',
                        }}
                    />
                    {!hasFilledAllAssignedFields && unfilledFieldCount > 0 ? (
                        <Typography variant="caption" sx={{ ml: 0.75, color: 'warning.main', fontWeight: 500, whiteSpace: 'nowrap' }}>
                            ({unfilledFieldCount} field{unfilledFieldCount > 1 ? 's' : ''} remaining)
                        </Typography>
                    ) : hasFilledAllAssignedFields ? (
                        <Typography variant="caption" sx={{ ml: 0.75, color: 'success.main', fontWeight: 500, whiteSpace: 'nowrap' }}>
                            (All fields complete)
                        </Typography>
                    ) : null}
                </>
            ) : undefined}
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
                        // ✅ Show warning when signature position is restored (for both contractor and internal signer)
                        // onSignaturePositionRestored only fires for CLIENT party signatures (protectedPartyIds match),
                        // so for contractors we must always reset contractorWarnType to 'client-party' here —
                        // otherwise a stale 'single-party' type from a previous text-field warning would show.
                        onSignaturePositionRestored={(currentUserRole === 'contractor' || assignedPartyId) ? () => {
                            if (currentUserRole === 'contractor') {
                                setContractorWarnType('client-party');
                            }
                            setShowWrongPartyWarning(true);
                        } : undefined}
                        // ✅ For contractor: Protect ALL client signatures (external + internal)
                        // ✅ For internal signer: Protect other party signatures (all parties except assigned)
                        protectedPartyIds={
                            currentUserRole === 'contractor'
                                ? allClientPartyIds
                                : assignedPartyId && parties
                                    ? parties.filter((p: any) => p.id !== assignedPartyId).map((p: any) => p.id)
                                    : undefined
                        }
                        // ✅ For internal signer: Restrict editing to only assigned party's fields
                        editableParties={assignedPartyId ? [assignedPartyId] : undefined}
                        // ✅ Auto-scroll to first assigned field after document loads (internal signers only)
                        onDocumentLoaded={assignedPartyId ? () => {
                            setTimeout(() => {
                                pdfViewerRef.current?.navigateToFirstPartyField([assignedPartyId]);
                            }, 500);
                        } : undefined}
                    />

                    <PartyValidationWarningPopup
                        partyValidationWarning={validationTriggered ? partyValidationWarning : null}
                        onNavigateToField={(name) => pdfViewerRef.current?.navigateToField(name)}
                    />

                    {/* ✅ Wrong Party Warning Dialog - for contractor or internal signer trying to edit other party fields */}
                    <WrongPartyWarningDialog
                        open={showWrongPartyWarning}
                        title={
                            currentUserRole === 'contractor'
                                ? contractorWarnType === 'single-party'
                                    ? 'One Party Per Contractor'
                                    : 'Client Party Field'
                                : 'Wrong Party Field'
                        }
                        description={
                            currentUserRole === 'contractor'
                                ? contractorWarnType === 'single-party'
                                    ? <>You have already started filling <strong>{parties?.find((p: any) => p.id === contractorCommittedPartyId)?.label || contractorCommittedPartyId}</strong> fields. You can only fill one party&apos;s fields — assign the other parties to signers.</>
                                    : 'This field is assigned to a client party and cannot be edited by the contractor.'
                                : assignedPartyLabel
                                    ? `You are assigned to fill fields as "${assignedPartyLabel}". This field belongs to another party.`
                                    : 'This field belongs to another party and cannot be edited by you.'
                        }
                        pdfViewerRef={pdfViewerRef}
                        navigateConfig={
                            assignedPartyId
                                ? { type: 'party', partyIds: [assignedPartyId] }
                                : contractorWarnType === 'single-party' && contractorCommittedPartyId
                                    ? { type: 'party', partyIds: [contractorCommittedPartyId] }
                                    : { type: 'nonClient', excludePartyIds: allClientPartyIds }
                        }
                        onClose={() => setShowWrongPartyWarning(false)}
                        zIndex={1200}
                    />
                </Box>
            </Box>
        </BaseDialog>

        {/* ✅ Unsaved Changes Confirmation Dialog */}
        <ConfirmationDialog
            open={showUnsavedDialog}
            title="Unsaved Changes"
            message="Do you want to save changes?"
            onYes={handleUnsavedYes}
            onNo={handleUnsavedNo}
            onClose={handleUnsavedCancel}
            loading={saving}
        />
        </>
    );
}