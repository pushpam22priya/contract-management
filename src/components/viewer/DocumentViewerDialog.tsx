/* eslint-disable @typescript-eslint/no-explicit-any */
/* eslint-disable @typescript-eslint/no-unused-vars */
'use client';

import AppButton from '@/components/common/AppButton';
import { Box,  Alert, AlertColor, Typography, Chip, Tooltip } from '@mui/material';
import SaveIcon from '@mui/icons-material/Save';
import { authService } from '@/services/authService';
import { buildProfileData } from '@/utils/profileKeyOptions';
import dynamic from 'next/dynamic';
import { useRef, useState, useEffect, useMemo } from 'react';
import BaseDialog from '@/components/common/BaseDialog';
import ConfirmationDialog from '@/components/common/ConfirmationDialog';
import NotificationSnackbar from '@/components/common/NotificationSnackbar';
import WrongPartyWarningDialog from '@/components/viewer/pdfViewer/WrongPartyWarningDialog';
import PartyValidationWarningPopup from '@/components/viewer/pdfViewer/PartyValidationWarningPopup';
import AutofillPartyDialog from '@/components/contracts/AutofillPartyDialog';
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
    extraActions?: React.ReactNode;
    // ✅ Unified flow: participant role and party type info for field-level access control
    unifiedParticipantRole?: 'REVIEWER' | 'APPROVER';
    contractParties?: any[]; // PartyConfiguration[] — INTERNAL parties are editable, EXTERNAL are read-only
    /** Specific field names to force read-only regardless of party (e.g. the approver's applied signature for the owner) */
    lockedFieldNames?: string[];
    /** Ref exposed to parent panels so they can trigger PDF export before marking complete */
    saveRef?: React.RefObject<(() => Promise<void>) | null>;
    /** When true, hides the built-in Save/Send button while onSave still works via saveRef */
    hideSaveButton?: boolean;
    /** Externally supplied warning to show in the draggable popup — bypasses the internal validationTriggered guard */
    externalWarning?: import('./pdfViewer/PartyValidationWarningPopup').PartyValidationEntry[] | null;
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
    extraActions,
    unifiedParticipantRole,
    contractParties,
    lockedFieldNames,
    saveRef,
    hideSaveButton,
    externalWarning,
}: DocumentViewerDialogProps) {


    const pdfViewerRef = useRef<any>(null);
    const hasAutoFilledRef = useRef(false);
    const [saving, setSaving] = useState(false);
    const [showUnsavedDialog, setShowUnsavedDialog] = useState(false);
    const [signatureCommitted, setSignatureCommitted] = useState(false);
    // ✅ Track if validation has been triggered (by clicking save)
    const [validationTriggered, setValidationTriggered] = useState(false);

    // ✅ Wrong party warning for contractor - shows when contractor tries to edit client party field
    const [showWrongPartyWarning, setShowWrongPartyWarning] = useState(false);

    // ✅ Autofill party picker — shown when contractor hasn't committed to a party yet
    const [showAutofillPartyPicker, setShowAutofillPartyPicker] = useState(false);
    // Track values at last save to detect unsaved changes
    const lastSavedValuesRef = useRef<Record<string, string>>({});

    // Notification snackbar
    const [snackbar, setSnackbar] = useState<{ open: boolean; message: string; severity: AlertColor }>({
        open: false, message: '', severity: 'success',
    });

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

    // ✅ Compute editable parties (INTERNAL + unassigned). EXTERNAL party fields become read-only
    // via the editableParties restriction in PDFViewerContainer. Memoised so the array reference
    // stays stable across renders.
    const unifiedEditableParties = useMemo<string[] | undefined>(() => {
        // Unified-flow reviewer / approver.
        if (unifiedParticipantRole) {
            if (!contractParties?.length) return undefined; // no party info → default (all interactive)
            const internalIds = contractParties
                .filter((p: any) => p.type !== 'EXTERNAL')
                .map((p: any) => p.id as string);
            return [...internalIds, 'unassigned'];
        }
        // Contract owner on a MULTI-PARTY contract: keep INTERNAL fields editable (so the owner can
        // still edit after a party signs) while EXTERNAL fields — including the external signer's
        // signature — stay read-only. Without this, editableParties is undefined, the multi-party
        // editability pass never runs, and once a party signs the signed PDF's locked field flags make
        // everything view-only for the owner. Engaged whenever the contract has external parties or
        // assigned signers, so single-party / draft editing keeps its default all-interactive behavior.
        const hasExternalParty = (parties as any[] | undefined)?.some((p) => p.type === 'EXTERNAL');
        if (currentUserRole === 'contractor'
                && parties?.length
                && (hasExternalParty || clientPartyIds.length > 0 || internalClientPartyIds.length > 0)) {
            const internalIds = (parties as any[])
                .filter((p) => p.type !== 'EXTERNAL')
                .map((p) => p.id as string);
            return [...internalIds, 'unassigned'];
        }
        return undefined;
    }, [unifiedParticipantRole, contractParties, currentUserRole, parties, clientPartyIds, internalClientPartyIds]);

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

    // IDs of parties marked EXTERNAL on the contract — contractor cannot edit these fields
    const externalTypePartyIds = useMemo(() => {
        if (!parties?.length) return [] as string[];
        return (parties as any[]).filter((p) => p.type === 'EXTERNAL').map((p) => p.id as string);
    }, [parties]);

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
            hasAutoFilledRef.current = false;

            // ✅ Capture initial values for contractor protection (to restore if they edit external party fields)
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

        // ✅ CONTRACTOR PROTECTION: block EXTERNAL party fields
        const isContractor = currentUserRole === 'contractor';

        if (isContractor && hasFormFields && userHasInteractedRef.current) {
            const field = formFields!.find((f: any) => f.name === fieldName);
            const fieldParty = (field as any)?.assignedParty;

            if (fieldParty && externalTypePartyIds.includes(fieldParty)) {
                console.log(`🚫 [DocumentViewerDialog] Contractor blocked — EXTERNAL party field: ${fieldName} (${fieldParty})`);
                setShowWrongPartyWarning(true);
                const orig = initialFieldValuesRef.current[fieldName] || '';
                if (orig) pdfViewerRef.current?.restoreFieldValue?.(fieldName, orig);
                else pdfViewerRef.current?.clearField?.(fieldName);
                return;
            }
        }

        // ✅ UNIFIED FLOW PROTECTION: block EXTERNAL party fields for reviewers/approvers
        if (unifiedParticipantRole && userHasInteractedRef.current) {
            const fieldEntry = formFields?.find((f: any) => f.name === fieldName);
            const fieldPartyId = fieldEntry?.assignedParty;

            if (fieldPartyId) {
                const isExternalField = contractParties?.some(
                    (p: any) => p.id === fieldPartyId && p.type === 'EXTERNAL'
                );
                if (isExternalField) {
                    setShowWrongPartyWarning(true);
                    const orig = initialFieldValuesRef.current[fieldName] || '';
                    if (orig) pdfViewerRef.current?.restoreFieldValue?.(fieldName, orig);
                    else pdfViewerRef.current?.clearField?.(fieldName);
                    return;
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
        if (!formFields) return null;

        // If parties prop is missing or empty, derive them from formFields' party metadata.
        // This handles old renewal drafts that were created before parties were copied to the renewal.
        const effectiveParties: PartyConfiguration[] = (parties && parties.length > 0)
            ? parties
            : (() => {
                const seen = new Map<string, PartyConfiguration>();
                for (const f of formFields) {
                    if (f.assignedParty && !seen.has(f.assignedParty)) {
                        seen.set(f.assignedParty, {
                            id: f.assignedParty,
                            label: f.partyLabel || f.assignedParty,
                            color: f.partyColor || '#888',
                        } as PartyConfiguration);
                    }
                }
                return Array.from(seen.values());
            })();

        if (effectiveParties.length === 0) return null;

        const partialParties: { party: PartyConfiguration; filled: number; total: number; missing: string[] }[] = [];

        for (const party of effectiveParties) {
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

    // true = dialog was opened by the Send button; false = opened by the close button
    const [isSendConfirm, setIsSendConfirm] = useState(false);

    // ✅ Handle close attempt - always show confirmation dialog when onSave is available (edit mode)
    const handleCloseAttempt = () => {
        if (onSave) {
            setIsSendConfirm(false);
            setShowUnsavedDialog(true);
        } else {
            onClose();
        }
    };

    // ✅ Handle Send button click (internal signers only) — validate first, then confirm
    const handleSendButtonClick = () => {
        if (assignedPartyId && !hasFilledAllAssignedFields) {
            setValidationTriggered(true);
            return;
        }
        setIsSendConfirm(true);
        setShowUnsavedDialog(true);
    };

    // ✅ Handle confirmation dialog: Yes - save and close
    const handleUnsavedYes = async () => {
        if (assignedPartyId && !hasFilledAllAssignedFields) {
            setShowUnsavedDialog(false);
            setValidationTriggered(true);
            return;
        }
        setShowUnsavedDialog(false);
        await handleSaveClick();
        onClose();
    };

    // ✅ Handle confirmation dialog: No
    // Send-confirm mode: just dismiss the dialog, keep editor open
    // Close mode: close the editor without saving
    const handleUnsavedNo = () => {
        setShowUnsavedDialog(false);
        if (!isSendConfirm) {
            onClose();
        }
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

        // ✅ Check for validation before proceeding (skip for unified flow — reviewer/approver panels handle their own validation)
        if (!unifiedParticipantRole && (hasPartialParty || (assignedPartyId && !hasFilledAllAssignedFields))) {
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
                // and merge back party assignments that exportFormFields() strips
                if (exportedFormFields) {
                    exportedFormFields = exportedFormFields.map((exportedField: any) => {
                        const original = formFields?.find((f: any) => f.name === exportedField.name);
                        return {
                            ...exportedField,
                            value: filledFieldValues[exportedField.name] || exportedField.value || '',
                            ...(original?.assignedParty !== undefined && { assignedParty: original.assignedParty }),
                            ...(original?.partyLabel !== undefined && { partyLabel: original.partyLabel }),
                            ...(original?.partyColor !== undefined && { partyColor: original.partyColor }),
                            ...(original?.profileKey !== undefined && { profileKey: original.profileKey }),
                        };
                    });
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

                // ✅ Show success notification
                setSnackbar({
                    open: true,
                    message: assignedPartyId ? 'Fields sent successfully!' : 'Changes saved successfully!',
                    severity: 'success',
                });

                // ✅ NOTE: Don't close dialog after saving - user can continue editing
                // Dialog closes when user clicks the close button (with unsaved changes confirmation)
            }

        } catch (error) {
            console.error('❌ Error saving changes:', error);
        } finally {
            setSaving(false);
        }
    };

    // Expose handleSaveClick to parent panels via saveRef (for Mark Complete triggering PDF export first)
    if (saveRef) saveRef.current = handleSaveClick;

    // Core autofill execution — called after a party is resolved
    const runAutofill = (targetPartyId: string | null) => {
        const currentUser = authService.getCurrentUser();
        if (!currentUser) {
            setSnackbar({ open: true, message: 'Please log in to use autofill', severity: 'warning' });
            return;
        }
        const profileData = buildProfileData(currentUser);
        if (Object.values(profileData).every(v => !v.trim())) {
            setSnackbar({ open: true, message: 'Please complete your profile in Settings first', severity: 'warning' });
            return;
        }
        try {
            const count = pdfViewerRef.current?.autofillFields(targetPartyId, profileData) ?? 0;
            if (count === 0) {
                setSnackbar({ open: true, message: 'No matching fields found for your profile data', severity: 'warning' });
            } else {
                setSnackbar({ open: true, message: `${count} field${count !== 1 ? 's' : ''} filled from your profile`, severity: 'success' });
            }
        } catch {
            setSnackbar({ open: true, message: 'Something went wrong during autofill. Please try manually.', severity: 'error' });
        }
    };

    // Called when user selects a party from the autofill picker
    const handleAutofillPartySelected = (partyId: string) => {
        setShowAutofillPartyPicker(false);
        runAutofill(partyId);
    };

    const handleAutofill = (silent = false) => {
        const currentUser = authService.getCurrentUser();
        if (!currentUser) {
            if (!silent) setSnackbar({ open: true, message: 'Please log in to use autofill', severity: 'warning' });
            return;
        }
        const profileData = buildProfileData(currentUser);
        if (Object.values(profileData).every(v => !v.trim())) {
            if (!silent) setSnackbar({ open: true, message: 'Please complete your profile in Settings first', severity: 'warning' });
            return;
        }

        if (assignedPartyId) {
            // Internal signer: always fill their specific assigned party
            runAutofill(assignedPartyId);
            return;
        }

        // Contractor path: only INTERNAL (non-EXTERNAL) parties are autofillable
        const contractorParties = (parties || []).filter((p: any) => p.type !== 'EXTERNAL');

        if (contractorParties.length === 0) {
            runAutofill(null); // No party config — fill all empty fields
            return;
        }

        if (contractorParties.length === 1) {
            runAutofill(contractorParties[0].id);
            return;
        }

        // Multiple internal parties — show party picker
        setShowAutofillPartyPicker(true);
    };

    // ✅ Determine if save button should be disabled
    const getSaveDisabledReason = (): string => {
        if (assignedPartyId && !hasFilledAllAssignedFields) {
            return `Please fill all your assigned fields (${unfilledFieldCount} remaining)`;
        }
        if (clientSigningMode && !assignedPartyId && !signatureCommitted) {
            return 'Please add your signature before saving';
        }
        return '';
    };

    const saveDisabled = saving || (validationTriggered && assignedPartyId && !hasFilledAllAssignedFields) ||
        (!validationTriggered && clientSigningMode && !assignedPartyId && !signatureCommitted);

    // Action buttons for dialog footer
    // ✅ Show save button if onSave callback is provided
    // ✅ Disable save when party fields are partially filled or not all assigned fields are complete
    const dialogActions = (
        <>
            {extraActions}
            {(assignedPartyId || currentUserRole === 'contractor') && !readOnly && (
                <Tooltip title="Fill fields from your profile" arrow>
                    <span>
                        <AppButton
                            variant="outlined"
                            onClick={() => handleAutofill()}
                            disabled={saving}
                            size="small"
                            sx={{ borderRadius: 2, py: 0.6 }}
                        >
                            Autofill
                        </AppButton>
                    </span>
                </Tooltip>
            )}
            {onSave && !hideSaveButton && (
                <Tooltip title={getSaveDisabledReason()} arrow>
                    <span>
                        <AppButton
                            variant="contained"
                            onClick={assignedPartyId ? handleSendButtonClick : handleSaveClick}
                            loading={saving}
                            disabled={saveDisabled}
                            sx={{ py: 0.6 }}
                        >
                            {saving ? (assignedPartyId ? 'Sending...' : 'Saving...') : (assignedPartyId ? 'Send' : 'Save Changes')}
                        </AppButton>
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
                        // ✅ Show warning when signature position is restored (contractor, internal signer, or reviewer)
                        onSignaturePositionRestored={(currentUserRole === 'contractor' || assignedPartyId || unifiedParticipantRole === 'REVIEWER') ? () => {
                            setShowWrongPartyWarning(true);
                        } : undefined}
                        // ✅ For contractor: Protect EXTERNAL type party signatures
                        // ✅ For internal signer: Protect other party signatures (all parties except assigned)
                        protectedPartyIds={
                            currentUserRole === 'contractor'
                                ? externalTypePartyIds
                                : assignedPartyId && parties
                                    ? parties.filter((p: any) => p.id !== assignedPartyId).map((p: any) => p.id)
                                    : undefined
                        }
                        // ✅ Unified flow: restrict to INTERNAL party fields. Legacy internal signer: restrict to assigned party only.
                        editableParties={unifiedEditableParties ?? (assignedPartyId ? [assignedPartyId] : undefined)}
                        // ✅ Block all new signatures for unified flow REVIEWERs
                        blockAllNewSignatures={unifiedParticipantRole === 'REVIEWER' && !readOnly}
                        // ✅ Force-lock specific fields (e.g. the approver's applied signature for the owner)
                        lockedFieldNames={lockedFieldNames}
                        // ✅ Auto-scroll to first relevant field + autofill on document load.
                        // PDFViewerContainer already defers this callback by 1 s (after widget rebuild),
                        // so no extra setTimeout is needed here.
                        onDocumentLoaded={(!readOnly && (assignedPartyId || currentUserRole === 'contractor' || unifiedParticipantRole)) ? () => {
                            if (assignedPartyId) {
                                // Internal signer: jump to their assigned party's first field
                                pdfViewerRef.current?.navigateToFirstPartyField([assignedPartyId]);
                            } else if (unifiedParticipantRole && unifiedEditableParties && unifiedEditableParties.length > 0) {
                                // Unified reviewer / approver: jump to first internal party field
                                pdfViewerRef.current?.navigateToFirstPartyField(unifiedEditableParties);
                            }
                            // Autofill only for contractor or assigned internal signer
                            if ((assignedPartyId || currentUserRole === 'contractor') && !hasAutoFilledRef.current) {
                                hasAutoFilledRef.current = true;
                                handleAutofill(true);
                            }
                        } : undefined}
                    />

                    <PartyValidationWarningPopup
                        partyValidationWarning={
                            externalWarning != null || validationTriggered
                                ? partyValidationWarning
                                : null
                        }
                        onNavigateToField={(name) => pdfViewerRef.current?.navigateToField(name)}
                    />

                    {/* ✅ Wrong Party Warning Dialog - for contractor or internal signer trying to edit other party fields */}
                    <WrongPartyWarningDialog
                        open={showWrongPartyWarning}
                        title={
                            unifiedParticipantRole === 'REVIEWER'
                                ? 'Cannot Sign as Reviewer'
                                : currentUserRole === 'contractor'
                                    ? 'External Party Field'
                                    : 'Wrong Party Field'
                        }
                        description={
                            unifiedParticipantRole === 'REVIEWER'
                                ? 'Reviewers can only read and edit text fields belongs to Internal Parties. Signing the contract is reserved for approvers.'
                                : currentUserRole === 'contractor'
                                    ? 'This field belongs to an external party and cannot be edited by your organisation.'
                                    : assignedPartyLabel
                                        ? `You are assigned to fill fields as "${assignedPartyLabel}". This field belongs to another party.`
                                        : 'This field belongs to another party and cannot be edited by you.'
                        }
                        pdfViewerRef={pdfViewerRef}
                        navigateConfig={
                            assignedPartyId
                                ? { type: 'party', partyIds: [assignedPartyId] }
                                : { type: 'nonClient', excludePartyIds: externalTypePartyIds }
                        }
                        onClose={() => setShowWrongPartyWarning(false)}
                        zIndex={1200}
                    />
                </Box>
            </Box>
        </BaseDialog>

        <NotificationSnackbar
            open={snackbar.open}
            message={snackbar.message}
            severity={snackbar.severity}
            onClose={() => setSnackbar(prev => ({ ...prev, open: false }))}
            autoHideDuration={3000}
        />

        {/* ✅ Unsaved Changes / Send Confirmation Dialog */}
        <ConfirmationDialog
            open={showUnsavedDialog}
            title={isSendConfirm ? 'Confirm Send' : 'Unsaved Changes'}
            message={isSendConfirm
                ? 'Are you sure you want to send your completed fields? This will submit your signature and fields to the contract.'
                : 'Do you want to save changes?'
            }
            onYes={handleUnsavedYes}
            onNo={handleUnsavedNo}
            onClose={handleUnsavedCancel}
            loading={saving}
            disableYes={saveDisabled}
            yesTooltip={getSaveDisabledReason()}
        />

        {/* ✅ Autofill party picker — shown when contractor hasn't committed to a party yet */}
        <AutofillPartyDialog
            open={showAutofillPartyPicker}
            onClose={() => setShowAutofillPartyPicker(false)}
            onConfirm={handleAutofillPartySelected}
            parties={((parties || []).filter((p: any) => p.type !== 'EXTERNAL')) as PartyConfiguration[]}
            formFields={formFields || []}
        />
        </>
    );
}