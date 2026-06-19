'use client';

import AppButton from '@/components/common/AppButton';
import { useEffect, useState, useRef, useMemo } from 'react';
import { useParams } from 'next/navigation';
import {
    Box,
    Typography,
    CircularProgress,
    Alert, 
    Paper,
    Tooltip,
    Chip,
    useTheme,
} from '@mui/material';
import { CheckCircle, Error as ErrorIcon } from '@mui/icons-material';
import dynamic from 'next/dynamic';
import { SignatureRequest } from '@/types/signature';
import { PartyConfiguration } from '@/types/template';

const BACKEND = '/api/backend';
import SignAllDialog from '@/components/contracts/SignAllDialog';
import WrongPartyWarningDialog from '@/components/viewer/pdfViewer/WrongPartyWarningDialog';
import PartyValidationWarningPopup from '@/components/viewer/pdfViewer/PartyValidationWarningPopup';

// Dynamically import PDFViewerContainer
const PDFViewerContainer = dynamic(
    () => import('@/components/viewer/PDFViewerContainer'),
    {
        ssr: false,
        loading: () => (
            <Box sx={{ width: '100%', height: '600px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                Loading PDF viewer...
            </Box>
        ),
    }
);

export default function PublicSigningPage() {
    const params = useParams();
    const token = params.token as string;
    const isDark = useTheme().palette.mode === 'dark';

    // State
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [signatureRequest, setSignatureRequest] = useState<SignatureRequest | null>(null);
    const [submitting, setSubmitting] = useState(false);
    const [completed, setCompleted] = useState(false);
    const [signedPdfBlob, setSignedPdfBlob] = useState<Blob | null>(null);
    const [documentUrl, setDocumentUrl] = useState<string>('');

    // Ref for PDF viewer
    const pdfViewerRef = useRef<any>(null);

    // Track field changes
    const [filledFieldValues, setFilledFieldValues] = useState<Record<string, string>>({});

    // ✅ Store initial field values (captured when page loads) for comparison
    const initialFieldValuesRef = useRef<Record<string, string>>({});
    const [initialValuesCapture, setInitialValuesCaptured] = useState(false);

    // ✅ "Sign All" dialog state
    const [showSignAllDialog, setShowSignAllDialog] = useState(false);
    const [emptySignFieldCount, setEmptySignFieldCount] = useState(0);
    const [hasDeclinedSignAll, setHasDeclinedSignAll] = useState(false);

    // ✅ Wrong party warning - shows when user tries to edit another party's field (empty or pre-filled)
    // Also shows when user tries to drag a pre-filled signature
    const [showWrongPartyWarning, setShowWrongPartyWarning] = useState(false);

    // ✅ Track which fields were pre-filled (had values when page loaded)
    const prefilledFieldNamesRef = useRef<Set<string>>(new Set());

    // ✅ Track if user has interacted with the document (clicked/focused on a field)
    const userHasInteractedRef = useRef(false);

    // ✅ Track if validation has been triggered (by clicking submit)
    const [validationTriggered, setValidationTriggered] = useState(false);

    // Suppress wrong-party field change events that fire internally during PDF export
    const isSubmittingRef = useRef(false);

    // Derive parties from formFields when signatureRequest.parties is empty (renewal contracts)
    const effectiveParties = useMemo((): PartyConfiguration[] => {
        if (!signatureRequest) return [];
        if (signatureRequest.parties && signatureRequest.parties.length > 0) {
            return signatureRequest.parties as PartyConfiguration[];
        }
        // Fallback: derive from formFields assignedParty metadata
        const seen = new Map<string, PartyConfiguration>();
        for (const f of (signatureRequest.formFields || [])) {
            if (f.assignedParty && !seen.has(f.assignedParty)) {
                seen.set(f.assignedParty, {
                    id: f.assignedParty,
                    label: f.partyLabel || f.assignedParty,
                    color: f.partyColor || '#888',
                    order: seen.size + 1,
                });
            }
        }
        return Array.from(seen.values());
    }, [signatureRequest]);

    // The current user's assigned party IDs (normalised to an array)
    const userPartyIds = useMemo(() => {
        if (!signatureRequest?.assignedParty) return [];
        return Array.isArray(signatureRequest.assignedParty)
            ? signatureRequest.assignedParty
            : [signatureRequest.assignedParty];
    }, [signatureRequest?.assignedParty]);

    // Get the user's assigned party label(s) for display
    const userPartyLabels = useMemo(() => {
        if (!signatureRequest?.assignedParty) return '';
        const partyIds = Array.isArray(signatureRequest.assignedParty)
            ? signatureRequest.assignedParty
            : [signatureRequest.assignedParty];
        const labels = partyIds
            .map(id => effectiveParties.find(p => p.id === id)?.label)
            .filter(Boolean);
        return labels.join(', ');
    }, [signatureRequest, effectiveParties]);

    const handleFieldChange = (fieldName: string, value: any) => {
        // Apryse fires change events for all fields during export — skip during submission
        if (isSubmittingRef.current) return;

        const newValue = value?.toString() || '';

        // ✅ Check if user is editing another party's field - show warning (only after user interaction)
        // This handles BOTH empty and pre-filled fields belonging to other parties
        if (userHasInteractedRef.current && signatureRequest?.formFields && signatureRequest?.assignedParty) {
            const field = signatureRequest.formFields.find((f: any) => f.name === fieldName);
            if (field?.assignedParty) {
                const userPartyIds = Array.isArray(signatureRequest.assignedParty)
                    ? signatureRequest.assignedParty
                    : [signatureRequest.assignedParty];

                // If this field belongs to a different party, restore to original value and show warning
                if (!userPartyIds.includes(field.assignedParty)) {
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
                        // If field was pre-filled, restore to that value
                        if (pdfViewerRef.current?.restoreFieldValue) {
                            pdfViewerRef.current.restoreFieldValue(fieldName, originalValue);
                        }
                    } else {
                        // If field was empty, clear it
                        if (pdfViewerRef.current?.clearField) {
                            pdfViewerRef.current.clearField(fieldName);
                        }
                    }

                    return; // Exit early, don't save the wrong party's value
                }
            }
        }

        // Always save the value (for comparison logic)
        setFilledFieldValues(prev => ({
            ...prev,
            [fieldName]: value?.toString() || ''
        }));
    };


    // ✅ Check if ANY other party field has been modified from initial values
    const hasModifiedOtherPartyFields = useMemo(() => {
        if (!signatureRequest?.formFields || !signatureRequest?.assignedParty || !initialValuesCapture) {
            return false;
        }

        const userPartyIds = Array.isArray(signatureRequest.assignedParty)
            ? signatureRequest.assignedParty
            : [signatureRequest.assignedParty];

        // Check all fields that belong to OTHER parties
        for (const field of signatureRequest.formFields) {
            if (!field.assignedParty || userPartyIds.includes(field.assignedParty)) {
                continue; // Skip user's own party fields
            }

            // This is another party's field - compare current value with initial
            const initialValue = initialFieldValuesRef.current[field.name] || '';
            const currentValue = filledFieldValues[field.name] || '';

            if (currentValue !== initialValue) {
                console.log(`⚠️ [OTHER PARTY MODIFIED] Field "${field.name}" changed: "${initialValue}" → "${currentValue}"`);
                return true; // Found a modified other party field
            }
        }

        return false; // All other party fields match initial values
    }, [filledFieldValues, signatureRequest, initialValuesCapture]);

    // ✅ Party validation: detect partially filled parties
    // If the external signer fills any field of a party, ALL fields for that party must be completed
    // Note: Fields already filled by contractor are in signatureRequest.fieldValues and are read-only
    // MULTI-PARTY: If signer has an assignedParty, only validate that party
    const partyValidationWarning = useMemo(() => {
        if (!signatureRequest?.formFields || effectiveParties.length === 0) return null;

        const formFields = signatureRequest.formFields;
        const prefilledValues = signatureRequest.fieldValues || {};

        // MULTI-PARTY: If signer has assigned party/parties, only validate those
        const partiesToValidate = signatureRequest.assignedParty
            ? (() => {
                const ids = Array.isArray(signatureRequest.assignedParty)
                    ? signatureRequest.assignedParty
                    : [signatureRequest.assignedParty];
                return effectiveParties.filter(p => ids.includes(p.id));
            })()
            : effectiveParties;

        const partialParties: { party: PartyConfiguration; filled: number; total: number; missing: string[] }[] = [];

        for (const party of partiesToValidate) {
            // Get fields for this party that the external signer CAN fill (empty fields only)
            const partyFields = formFields.filter((f: any) => f.assignedParty === party.id);
            const editableFields = partyFields.filter((f: any) => {
                const prefilledVal = prefilledValues[f.name];
                // Field is editable if it wasn't pre-filled by contractor
                return !prefilledVal || prefilledVal.toString().trim() === '';
            });

            // Count how many editable fields the signer has filled
            const filledEditableCount = editableFields.filter((f: any) => {
                const val = filledFieldValues[f.name];
                return val && val.toString().trim() !== '';
            }).length;

            // If signer has started filling editable fields but not all of them
            if (filledEditableCount > 0 && filledEditableCount < editableFields.length) {
                const unfilledFields = editableFields
                    .filter((f: any) => {
                        const val = filledFieldValues[f.name];
                        return !val || val.toString().trim() === '';
                    })
                    .map((f: any) => f.label || f.name);

                partialParties.push({
                    party,
                    filled: filledEditableCount,
                    total: editableFields.length,
                    missing: unfilledFields,
                });
            }
        }

        return partialParties.length > 0 ? partialParties : null;
    }, [filledFieldValues, signatureRequest]);

    const hasPartialParty = !!partyValidationWarning;

    // ✅ Check if client has filled ALL their assigned fields (required to submit)
    const { hasFilledAllAssignedFields, unfilledFieldCount, totalAssignedFieldCount } = useMemo(() => {
        if (!signatureRequest?.formFields || !signatureRequest?.assignedParty) {
            // Legacy mode (no assigned party) - allow submit
            return { hasFilledAllAssignedFields: true, unfilledFieldCount: 0, totalAssignedFieldCount: 0 };
        }

        const formFields = signatureRequest.formFields;
        const prefilledValues = signatureRequest.fieldValues || {};

        // Get the user's assigned party IDs
        const userPartyIds = Array.isArray(signatureRequest.assignedParty)
            ? signatureRequest.assignedParty
            : [signatureRequest.assignedParty];

        // Get all fields assigned to the user's party that they need to fill
        const userFields = formFields.filter((f: any) =>
            f.assignedParty && userPartyIds.includes(f.assignedParty)
        );

        // Filter to only editable fields (not pre-filled by contractor)
        const editableUserFields = userFields.filter((f: any) => {
            const prefilledVal = prefilledValues[f.name];
            return !prefilledVal || prefilledVal.toString().trim() === '';
        });

        // Count how many of these fields are filled
        const filledCount = editableUserFields.filter((f: any) => {
            const val = filledFieldValues[f.name];
            return val && val.toString().trim() !== '';
        }).length;

        const unfilled = editableUserFields.length - filledCount;
        const allFilled = unfilled === 0;

        console.log(`📋 [SUBMIT CHECK] User fields: ${editableUserFields.length}, Filled: ${filledCount}, Unfilled: ${unfilled}`);

        return {
            hasFilledAllAssignedFields: allFilled,
            unfilledFieldCount: unfilled,
            totalAssignedFieldCount: editableUserFields.length
        };
    }, [filledFieldValues, signatureRequest]);

    // ✅ Merge fieldValues into formFields for party validation
    const formFieldsWithValues = useMemo(() => {
        if (!signatureRequest?.formFields) return [];

        const fieldValues = signatureRequest.fieldValues || {};
        return signatureRequest.formFields.map((field: any) => ({
            ...field,
            value: fieldValues[field.name] || field.value || ''
        }));
    }, [signatureRequest]);

    // ✅ Called when a signature is applied to a field - shows "Sign All" prompt
    const handleSignatureApplied = (data: { emptySignatureFieldCount: number }) => {
        if (!hasDeclinedSignAll && data.emptySignatureFieldCount > 0) {
            setEmptySignFieldCount(data.emptySignatureFieldCount);
            setShowSignAllDialog(true);
        }
    };

    // ✅ Apply signature to all empty fields
    const handleSignAll = async () => {
        setShowSignAllDialog(false);
        if (pdfViewerRef.current?.applySignatureToAllEmptyFields) {
            const count = await pdfViewerRef.current.applySignatureToAllEmptyFields();
            console.log(`🖊️ [SIGN ALL] Applied signature to ${count} fields`);
        }
    };

    // ✅ User declined - don't ask again for this session
    const handleDeclineSignAll = () => {
        setShowSignAllDialog(false);
        setHasDeclinedSignAll(true);
    };

    /**
     * Load signature request data
     */
    useEffect(() => {
        const loadData = async () => {
            try {
                console.log(`📋 [PublicSigningPage] Loading signature request for token: ${token}`);
                const response = await fetch(`${BACKEND}/sign-requests/${token}`);

                if (!response.ok) {
                    const body = await response.json().catch(() => ({}));
                    setError(body.message || 'Unable to load document. The link may be invalid or expired.');
                    setLoading(false);
                    return;
                }

                const data = await response.json();

                // Fire-and-forget: mark as viewed
                fetch(`${BACKEND}/sign-requests/${token}/viewed`, { method: 'PATCH' }).catch(() => {});

                console.log(`📋 [PublicSigningPage] Loaded request:`, {
                    contractId: data.contractId,
                    contractTitle: data.contractTitle,
                    assignedParty: data.assignedParty || 'none',
                    assignedPartyLabel: data.assignedPartyLabel || 'N/A',
                    status: data.status,
                });

                if (new Date(data.expiresAt) < new Date()) {
                    setError('This signing link has expired. Please request a new one.');
                    setLoading(false);
                    return;
                }

                if (data.status === 'signed') {
                    setCompleted(true);
                }

                // ✅ Capture initial field values for comparison (to detect other party modifications)
                const initialValues: Record<string, string> = {};
                const prefilledNames = new Set<string>();

                if (data.fieldValues) {
                    Object.entries(data.fieldValues).forEach(([key, val]) => {
                        const strVal = val?.toString() || '';
                        initialValues[key] = strVal;
                        // Track fields that have non-empty values (pre-filled)
                        if (strVal.trim() !== '') {
                            prefilledNames.add(key);
                        }
                    });
                }
                // Also check formFields for pre-filled values (e.g., signature fields with 'signed')
                if (data.formFields) {
                    data.formFields.forEach((field: any) => {
                        if (!(field.name in initialValues)) {
                            initialValues[field.name] = '';
                        }
                        // Check if field has a value in formFields
                        const fieldVal = field.value?.toString() || '';
                        if (fieldVal.trim() !== '') {
                            prefilledNames.add(field.name);
                            initialValues[field.name] = fieldVal;
                        }
                    });
                }

                initialFieldValuesRef.current = initialValues;
                prefilledFieldNamesRef.current = prefilledNames;
                console.log('✅ [PRE-FILLED] Fields that were pre-filled:', Array.from(prefilledNames));

                // ✅ Pre-populate filledFieldValues with initial values so comparison works correctly
                setFilledFieldValues({ ...initialValues });

                setInitialValuesCaptured(true);
                console.log('✅ [INITIAL VALUES] Captured initial field values:', initialValues);

                setSignatureRequest(data);

                // Fetch presigned URL for PDF — browser loads directly from MinIO (bypasses proxy size limits)
                const fileUrlRes = await fetch(`${BACKEND}/sign-requests/${token}/file-url`);
                if (!fileUrlRes.ok) {
                    setError('Failed to load document. Please try again.');
                    setLoading(false);
                    return;
                }
                const { url: pdfUrl } = await fileUrlRes.json();
                setDocumentUrl(pdfUrl);

                setLoading(false);

            } catch (err) {
                console.error('Failed to load signing data:', err);
                setError('An error occurred. Please try again later.');
                setLoading(false);
            }
        };

        if (token) loadData();
    }, [token]);

    /**
     * ═══════════════════════════════════════════════════════════════════════════
     * MULTI-PARTY: Determine editable parties for this signer
     * ═══════════════════════════════════════════════════════════════════════════
     * If assignedParty is set, the signer can only edit fields assigned to that party.
     * Otherwise (legacy single-signer flow), they can edit all fields.
     */
    const editableParties = useMemo(() => {
        if (!signatureRequest) return undefined;

        // If this signer has an assigned party/parties, they can only edit those fields
        if (signatureRequest.assignedParty) {
            // Normalize to array (backward compat with single string)
            const parties = Array.isArray(signatureRequest.assignedParty)
                ? signatureRequest.assignedParty
                : [signatureRequest.assignedParty];
            console.log(`🏷️ [PublicSigningPage] Multi-party mode: Signer can only edit parties: ${parties.join(', ')}`);
            return parties;
        }

        // Legacy flow - can edit all fields (return undefined to not restrict)
        console.log(`📝 [PublicSigningPage] Legacy mode: Signer can edit all fields`);
        return undefined;
    }, [signatureRequest]);

    /**
     * Calculate protected party IDs (parties whose signatures the client cannot modify)
     * These are all parties EXCEPT the client's assigned party
     */
    const protectedPartyIds = useMemo(() => {
        if (!signatureRequest?.assignedParty || effectiveParties.length === 0) {
            // Legacy mode - protect nothing (undefined means no restrictions)
            return undefined;
        }

        const allPartyIds = effectiveParties.map(p => p.id);
        const userPartyIds = Array.isArray(signatureRequest.assignedParty)
            ? signatureRequest.assignedParty
            : [signatureRequest.assignedParty];

        // Protected = all parties EXCEPT the user's assigned parties
        const protectedIds = allPartyIds.filter(id => !userPartyIds.includes(id));
        console.log(`🛡️ [PublicSigningPage] Protected party IDs (cannot modify signatures): ${protectedIds.join(', ')}`);
        return protectedIds;
    }, [signatureRequest, effectiveParties]);

    /**
     * Get the assigned party configuration(s) for display
     */
    const assignedPartyConfigs = useMemo(() => {
        if (!signatureRequest?.assignedParty) return [];

        // Normalize to array
        const partyIds = Array.isArray(signatureRequest.assignedParty)
            ? signatureRequest.assignedParty
            : [signatureRequest.assignedParty];

        return partyIds
            .map(pid => effectiveParties.find(p => p.id === pid))
            .filter(Boolean) as PartyConfiguration[];
    }, [signatureRequest, effectiveParties]);

    /**
     * Handle signature submission
     * Matches contract creation flow: exports PDF, XFDF, fieldValues, and formFields
     */
    const handleSubmitSignature = async () => {
        if (!pdfViewerRef.current) return;

        // ✅ Check for validation before proceeding
        if (!hasFilledAllAssignedFields || hasPartialParty) {
            console.warn(`📋 [SUBMIT BLOCKED] Required fields missing. PartialParty: ${hasPartialParty}, AllAssigned: ${hasFilledAllAssignedFields}`);
            setValidationTriggered(true);
            return;
        }

        setSubmitting(true);
        isSubmittingRef.current = true;
        let uploadId: string | null = null;

        try {
            // ✅ FIX: Use flatten: false to keep form fields editable.
            // Passing { flatten: false } prevents signature and fields from being permanently embedded
            const exportResult = await pdfViewerRef.current?.exportAnnotations({}, { flatten: false });

            if (!exportResult || !exportResult.blob) {
                setError('Failed to capture signature. Please try again.');
                setSubmitting(false);
                return;
            }

            const { blob: pdfBlob, xfdfString } = exportResult;

            // ✅ FIX: Also export form fields like contract creation does
            let exportedFormFields: any[] | undefined;
            try {
                exportedFormFields = await pdfViewerRef.current?.exportFormFields();
                if (exportedFormFields) {
                    exportedFormFields = exportedFormFields.map((field: any) => ({
                        ...field,
                        value: filledFieldValues[field.name] || field.value || ''
                    }));
                }
            } catch (e) {
                console.warn('Could not export form fields:', e);
            }

            // Step 1: Initiate multipart upload
            const initiateRes = await fetch(`${BACKEND}/sign-requests/${token}/upload/initiate`, { method: 'POST' });
            if (!initiateRes.ok) throw new Error('Failed to initiate upload');
            const { uploadId: uid } = await initiateRes.json();
            uploadId = uid;

            // Steps 2+3: Upload chunks directly to MinIO via presigned URLs (bypasses Next.js proxy)
            const CHUNK_SIZE = 10 * 1024 * 1024; // 10 MB
            const parts: { partNumber: number; eTag: string }[] = [];
            let partNumber = 1;

            for (let offset = 0; offset < pdfBlob.size; offset += CHUNK_SIZE) {
                const chunk = pdfBlob.slice(offset, offset + CHUNK_SIZE);

                const presignRes = await fetch(`${BACKEND}/sign-requests/${token}/upload/presign?uploadId=${uploadId}&partNumber=${partNumber}`);
                if (!presignRes.ok) throw new Error('Failed to get presigned URL');
                const { url: presignUrl } = await presignRes.json();

                const uploadRes = await fetch(presignUrl, { method: 'PUT', body: chunk });
                if (!uploadRes.ok) throw new Error(`Failed to upload part ${partNumber}`);
                parts.push({ partNumber, eTag: uploadRes.headers.get('ETag') || '' });
                partNumber++;
            }

            // Step 4: Finalize upload and record signature
            const completeRes = await fetch(`${BACKEND}/sign-requests/${token}/upload/complete`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    uploadId,
                    parts,
                    xfdf: xfdfString,
                    fieldValues: filledFieldValues,
                    formFields: exportedFormFields || [],
                    autoSave: false,
                }),
            });

            if (completeRes.status === 409) {
                window.location.reload();
                return;
            }

            if (!completeRes.ok) {
                const body = await completeRes.json().catch(() => ({}));
                throw new Error(body.message || 'Failed to submit signature. Please try again.');
            }

            setCompleted(true);
        } catch (err: any) {
            console.error('Signature submission failed:', err);
            if (uploadId) {
                fetch(`${BACKEND}/sign-requests/${token}/upload/abort?uploadId=${uploadId}`, { method: 'POST' }).catch(() => {});
            }
            setError(err.message || 'An error occurred while submitting. Please try again.');
        } finally {
            isSubmittingRef.current = false;
            setSubmitting(false);
        }
    };

    // Loading state
    if (loading) {
        return (
            <Box sx={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', bgcolor: 'grey.50' }}>
                <Box sx={{ textAlign: 'center' }}>
                    <CircularProgress size={48} />
                    <Typography sx={{ mt: 2 }} color="text.secondary">Loading document...</Typography>
                </Box>
            </Box>
        );
    }

    // Error state
    if (error) {
        const isAlreadySubmitted = error.toLowerCase().includes('already submitted') || error.toLowerCase().includes('already signed');
        return (
            <Box sx={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', bgcolor: 'grey.50', p: 3 }}>
                <Paper sx={{ p: 4, maxWidth: 500, textAlign: 'center' }}>
                    {isAlreadySubmitted ? (
                        <CheckCircle sx={{ fontSize: 64, color: 'success.main', mb: 2 }} />
                    ) : (
                        <ErrorIcon sx={{ fontSize: 64, color: 'error.main', mb: 2 }} />
                    )}
                    <Typography variant="h5" gutterBottom>
                        {isAlreadySubmitted ? 'Signature Already Submitted' : 'Unable to Load Document'}
                    </Typography>
                    <Alert severity={isAlreadySubmitted ? 'success' : 'error'} sx={{ mt: 2 }}>{error}</Alert>
                </Paper>
            </Box>
        );
    }

    // Download the signed PDF
    // const handleDownloadSignedPdf = () => {
    //     if (!signedPdfBlob) return;
    //     const url = URL.createObjectURL(signedPdfBlob);
    //     const a = document.createElement('a');
    //     a.href = url;
    //     a.download = `${signatureRequest?.contractTitle || 'signed_contract'}.pdf`;
    //     document.body.appendChild(a);
    //     a.click();
    //     document.body.removeChild(a);
    //     URL.revokeObjectURL(url);
    // };

    // Completed state
    if (completed) {
        return (
            <Box sx={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', bgcolor: 'background.default', p: 3 }}>
                <Paper elevation={0} sx={{ p: 4, maxWidth: 500, textAlign: 'center', border: '1px solid', borderColor: 'divider', borderRadius: 3 }}>
                    <CheckCircle sx={{ fontSize: 56, color: 'success.main', mb: 2 }} />
                    <Typography variant="h5" gutterBottom>Document Signed Successfully!</Typography>
                    <Typography variant="body2" color="text.primary" sx={{ mb: 1.5 }}>
                        Thank you for signing <strong>{signatureRequest?.contractTitle}</strong>. The contract has been updated.
                    </Typography>
                    <Typography variant="body2" sx={{ mb: 3 }}>
                        You will get the signed document by email, once everyone has signed.
                    </Typography>
                    {/* {signedPdfBlob && (
                        <AppButton
                            variant="contained"
                            startIcon={<Download />}
                            onClick={handleDownloadSignedPdf}
                            sx={{
                                mb: 3,
                                bgcolor: '#115e59',
                                '&:hover': { bgcolor: '#0f4c47' },
                                textTransform: 'none',
                                px: 4,
                                py: 1,
                            }}
                        >
                            Download
                        </AppButton>
                    )} */}
                    <Alert severity="success" sx={{ color: isDark ? '#fefefe' : '#000' }}>You can close this window now.</Alert>
                </Paper>
            </Box>
        );
    }

    // Signing state - Full screen editor
    return (
        <Box sx={{ height: '100vh', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
            {/* Minimal Header Bar */}
            <Box sx={{
                bgcolor: 'primary.main',
                color: 'white',
                px: 2,
                py: 0.5,
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                flexShrink: 0
            }}>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
                    <Typography variant="body1" color='#fff' fontWeight={500}>
                        {signatureRequest?.contractTitle}
                    </Typography>
                    {/* Show assigned party badge(s) for multi-party flow */}
                    {assignedPartyConfigs.length > 0 && (
                        <Box sx={{ display: 'flex', gap: 0.5 }}>
                            {assignedPartyConfigs.map(config => (
                                <Chip
                                    key={config.id}
                                    label={`Your fields: ${config.label}`}
                                    size="small"
                                    sx={{
                                        bgcolor: config.color || '#666',
                                        color: '#fff',
                                        fontWeight: 600,
                                        fontSize: '0.75rem',
                                    }}
                                />
                            ))}
                        </Box>
                    )}
                </Box>
                <Tooltip
                    title={
                        hasModifiedOtherPartyFields
                            ? 'You modified fields not assigned to you. Restore them to submit.'
                            : !hasFilledAllAssignedFields
                                ? `Please fill all your assigned fields (${unfilledFieldCount} remaining)`
                                : hasPartialParty
                                    ? 'Complete all fields for the party you started filling'
                                    : ''
                    }
                    arrow
                >
                    <span>
                        <AppButton
                            variant="contained"
                            size="small"
                            loading={submitting}
                            onClick={handleSubmitSignature}
                            disabled={(validationTriggered && (!hasFilledAllAssignedFields || hasPartialParty)) || hasModifiedOtherPartyFields}
                            sx={{
                                bgcolor: 'white',
                                color: 'primary.main',
                                '&:hover': { bgcolor: 'grey.100' },
                                '&.Mui-disabled': { bgcolor: 'grey.300', color: 'grey.500' },
                                fontWeight: 600,
                                py: 0.5
                            }}
                        >
                            {submitting ? 'Sending...' : 'Send'}
                        </AppButton>
                    </span>
                </Tooltip>
            </Box>

            {/* Full-Screen PDF Viewer */}
            <Box
                sx={{ flex: 1, overflow: 'hidden', position: 'relative' }}
                onClick={() => { userHasInteractedRef.current = true; }}
            >
                {signatureRequest && documentUrl && (
                    <PDFViewerContainer
                        ref={pdfViewerRef}
                        documentUrl={documentUrl}
                        initialXfdf={signatureRequest.xfdfData}
                        formFields={formFieldsWithValues}
                        clientSigningMode={true}
                        readOnly={false}
                        currentUserRole="client"
                        currentUserEmail={signatureRequest.signerEmail}
                        onFieldChange={handleFieldChange}
                        showAnnotationNavigation={true}
                        onSignatureApplied={handleSignatureApplied}
                        // ✅ When user drags a pre-filled signature, show wrong party warning (position is auto-restored)
                        onSignaturePositionRestored={() => setShowWrongPartyWarning(true)}
                        // ✅ MULTI-PARTY: Restrict editing to assigned party's fields only
                        editableParties={editableParties}
                        // ✅ Protect signatures belonging to other parties (client can only modify their own party's signatures)
                        protectedPartyIds={protectedPartyIds}
                        // ✅ Auto-scroll to first assigned field after document loads
                        onDocumentLoaded={() => {
                            if (userPartyIds.length > 0) {
                                setTimeout(() => {
                                    pdfViewerRef.current?.navigateToFirstPartyField(userPartyIds);
                                }, 500);
                            }
                        }}
                    />
                )}

                {/* ✅ Wrong Party Warning Dialog - shows when user edits another party's field or drags a pre-filled signature */}
                <WrongPartyWarningDialog
                    open={showWrongPartyWarning}
                    title="Wrong Party Field"
                    description={<>You are assigned to fill fields as <strong>{userPartyLabels}</strong>.</>}
                    pdfViewerRef={pdfViewerRef}
                    navigateConfig={{ type: 'party', partyIds: userPartyIds }}
                    onClose={() => setShowWrongPartyWarning(false)}
                    zIndex={1100}
                />

                <PartyValidationWarningPopup
                    partyValidationWarning={validationTriggered ? partyValidationWarning : null}
                    onNavigateToField={(name) => pdfViewerRef.current?.navigateToField(name)}
                />
            </Box>
        </Box>
    );
}