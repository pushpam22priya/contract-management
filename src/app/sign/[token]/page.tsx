'use client';

import { useEffect, useState, useRef, useMemo } from 'react';
import { useParams } from 'next/navigation';
import {
    Box,
    Typography,
    CircularProgress,
    Alert,
    Button,
    Paper,
    Tooltip,
    IconButton,
    Chip,
} from '@mui/material';
import { CheckCircle, Error, Save, Download, Close } from '@mui/icons-material';
import dynamic from 'next/dynamic';
import { SignatureRequest } from '@/types/signature';
import { PartyConfiguration } from '@/types/template';
import {
    getSignatureRequestData,
    completeExternalSignature
} from '@/services/externalSignatureService';
import { sendSignedCopyEmail } from '@/services/emailService';
import SignAllDialog from '@/components/contracts/SignAllDialog';

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

    // State
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [signatureRequest, setSignatureRequest] = useState<SignatureRequest | null>(null);
    const [submitting, setSubmitting] = useState(false);
    const [completed, setCompleted] = useState(false);
    const [signedPdfBlob, setSignedPdfBlob] = useState<Blob | null>(null);

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

    // Track if user dismissed the party validation warning popup
    const [dismissedPartyWarning, setDismissedPartyWarning] = useState(false);

    // ✅ Wrong party warning - shows when user tries to edit another party's field
    const [showWrongPartyWarning, setShowWrongPartyWarning] = useState(false);

    // ✅ Pre-filled field modified warning - shows when user modifies a field that was already filled
    const [showPrefilledModifiedWarning, setShowPrefilledModifiedWarning] = useState(false);

    // ✅ Track which fields were pre-filled (had values when page loaded)
    const prefilledFieldNamesRef = useRef<Set<string>>(new Set());

    // ✅ Track if user has interacted with the document (clicked/focused on a field)
    const userHasInteractedRef = useRef(false);

    // Draggable popup state
    const [popupPosition, setPopupPosition] = useState<{ x: number; y: number } | null>(null);
    const [isDragging, setIsDragging] = useState(false);
    const dragStartRef = useRef<{ x: number; y: number; posX: number; posY: number } | null>(null);

    // Get the user's assigned party label(s) for display
    const userPartyLabels = useMemo(() => {
        if (!signatureRequest?.assignedParty || !signatureRequest?.parties) return '';
        const partyIds = Array.isArray(signatureRequest.assignedParty)
            ? signatureRequest.assignedParty
            : [signatureRequest.assignedParty];
        const labels = partyIds
            .map(id => signatureRequest.parties?.find((p: PartyConfiguration) => p.id === id)?.label)
            .filter(Boolean);
        return labels.join(', ');
    }, [signatureRequest]);

    const handleFieldChange = (fieldName: string, value: any) => {
        const newValue = value?.toString() || '';

        // ✅ For pre-filled fields, only warn if user has interacted AND value differs from initial
        if (userHasInteractedRef.current && prefilledFieldNamesRef.current.has(fieldName)) {
            const initialValue = initialFieldValuesRef.current[fieldName] || '';
            if (newValue !== initialValue) {
                console.log(`⚠️ [PRE-FILLED MODIFIED] Field "${fieldName}" changed: "${initialValue}" → "${newValue}"`);
                setShowPrefilledModifiedWarning(true);
            }
        }

        // ✅ Check if user is editing another party's field - show warning (only after user interaction)
        if (userHasInteractedRef.current && signatureRequest?.formFields && signatureRequest?.assignedParty) {
            const field = signatureRequest.formFields.find((f: any) => f.name === fieldName);
            if (field?.assignedParty) {
                const userPartyIds = Array.isArray(signatureRequest.assignedParty)
                    ? signatureRequest.assignedParty
                    : [signatureRequest.assignedParty];

                // If this field belongs to a different party, clear the value and show warning
                if (!userPartyIds.includes(field.assignedParty)) {
                    setShowWrongPartyWarning(true);

                    // Clear the field value in state
                    setFilledFieldValues(prev => ({
                        ...prev,
                        [fieldName]: ''
                    }));

                    // Clear the field in the PDF viewer
                    if (pdfViewerRef.current?.clearField) {
                        pdfViewerRef.current.clearField(fieldName);
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
        if (!signatureRequest?.formFields || !signatureRequest?.parties) return null;

        const formFields = signatureRequest.formFields;
        const allParties = signatureRequest.parties as PartyConfiguration[];
        const prefilledValues = signatureRequest.fieldValues || {};

        // MULTI-PARTY: If signer has assigned party/parties, only validate those
        const partiesToValidate = signatureRequest.assignedParty
            ? (() => {
                const ids = Array.isArray(signatureRequest.assignedParty)
                    ? signatureRequest.assignedParty
                    : [signatureRequest.assignedParty];
                return allParties.filter(p => ids.includes(p.id));
            })()
            : allParties;

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
                const result = await getSignatureRequestData(token);

                if (!result.success || !result.data) {
                    setError('Unable to load document. The link may be invalid or expired.');
                    setLoading(false);
                    return;
                }

                const data = result.data;

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
     * Get the assigned party configuration(s) for display
     */
    const assignedPartyConfigs = useMemo(() => {
        if (!signatureRequest?.assignedParty || !signatureRequest?.parties) return [];

        // Normalize to array
        const partyIds = Array.isArray(signatureRequest.assignedParty)
            ? signatureRequest.assignedParty
            : [signatureRequest.assignedParty];

        return partyIds
            .map(pid => signatureRequest.parties?.find((p: PartyConfiguration) => p.id === pid))
            .filter(Boolean) as PartyConfiguration[];
    }, [signatureRequest]);

    /**
     * Handle signature submission
     * Matches contract creation flow: exports PDF, XFDF, fieldValues, and formFields
     */
    const handleSubmitSignature = async () => {
        if (!pdfViewerRef.current) return;

        setSubmitting(true);

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

            const result = await completeExternalSignature(
                token,
                pdfBlob,
                xfdfString,
                filledFieldValues,
                exportedFormFields
            );

            if (result.success) {
                // Store the signed PDF blob for download
                setSignedPdfBlob(pdfBlob);
                setCompleted(true);

                // Send signed copy email to the client (fire-and-forget)
                // Skip for multi-party flow - the contractor will send finalized emails
                if (signatureRequest?.signerEmail && !signatureRequest?.assignedParty) {
                    const signerName = signatureRequest.signerName ||
                        signatureRequest.signerEmail.split('@')[0];
                    const downloadUrl = `${window.location.origin}/api/sign-requests/${token}/download`;
                    sendSignedCopyEmail({
                        to_email: signatureRequest.signerEmail,
                        contract_title: signatureRequest.contractTitle,
                        signer_name: signerName,
                        signed_date: new Date().toLocaleDateString(),
                        download_url: downloadUrl,
                    }).then((emailResult: { success: boolean; error?: string }) => {
                        if (emailResult.success) {
                            console.log('Signed copy email sent to client');
                        } else {
                            console.warn('Could not send signed copy email:', emailResult.error);
                        }
                    });
                }
            } else {
                setError('Failed to submit signature. Please try again.');
            }
        } catch (err) {
            console.error('Signature submission failed:', err);
            setError('An error occurred while submitting. Please try again.');
        } finally {
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
        return (
            <Box sx={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', bgcolor: 'grey.50', p: 3 }}>
                <Paper sx={{ p: 4, maxWidth: 500, textAlign: 'center' }}>
                    <Error sx={{ fontSize: 64, color: 'error.main', mb: 2 }} />
                    <Typography variant="h5" gutterBottom>Unable to Load Document</Typography>
                    <Alert severity="error" sx={{ mt: 2 }}>{error}</Alert>
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
            <Box sx={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', bgcolor: 'grey.50', p: 3 }}>
                <Paper sx={{ p: 4, maxWidth: 500, textAlign: 'center' }}>
                    <CheckCircle sx={{ fontSize: 64, color: 'success.main', mb: 2 }} />
                    <Typography variant="h5" gutterBottom>Document Signed Successfully!</Typography>
                    <Typography color="text.secondary" sx={{ mb: 2 }}>
                        Thank you for signing "{signatureRequest?.contractTitle}". The contract has been updated.
                    </Typography>
                    <Typography color="text.secondary" sx={{ mb: 3 }}>
                        You will get the signed document by email, once everyone has signed.
                    </Typography>
                    {/* {signedPdfBlob && (
                        <Button
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
                        </Button>
                    )} */}
                    <Alert severity="success">You can close this window now.</Alert>
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
                py: 1,
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
                        showPrefilledModifiedWarning
                            ? 'You modified a pre-filled field. Please refresh the page.'
                            : hasModifiedOtherPartyFields
                                ? 'You modified fields not assigned to you. Restore them to submit.'
                                : hasPartialParty
                                    ? 'Complete all fields for the party you started filling'
                                    : ''
                    }
                    arrow
                >
                    <span>
                        <Button
                            variant="contained"
                            size="small"
                            startIcon={submitting ? <CircularProgress size={16} color="inherit" /> : <Save />}
                            onClick={handleSubmitSignature}
                            disabled={submitting || hasPartialParty || hasModifiedOtherPartyFields || showPrefilledModifiedWarning}
                            sx={{
                                bgcolor: 'white',
                                color: 'primary.main',
                                '&:hover': { bgcolor: 'grey.100' },
                                '&:disabled': { bgcolor: 'grey.300', color: 'grey.500' },
                                textTransform: 'none',
                                fontWeight: 600,
                                py: 0.5
                            }}
                        >
                            {submitting ? 'Submitting...' : 'Submit Signature'}
                        </Button>
                    </span>
                </Tooltip>
            </Box>

            {/* Full-Screen PDF Viewer */}
            <Box
                sx={{ flex: 1, overflow: 'hidden', position: 'relative' }}
                onClick={() => { userHasInteractedRef.current = true; }}
            >
                {signatureRequest && (
                    <PDFViewerContainer
                        ref={pdfViewerRef}
                        documentUrl={`/api/sign-requests/${token}/file`}
                        initialXfdf={signatureRequest.xfdfData}
                        formFields={formFieldsWithValues}
                        clientSigningMode={true}
                        readOnly={false}
                        currentUserRole="client"
                        onFieldChange={handleFieldChange}
                        showAnnotationNavigation={true}
                        onSignatureApplied={handleSignatureApplied}
                        onPrefilledFieldModified={() => setShowPrefilledModifiedWarning(true)}
                        // ✅ MULTI-PARTY: Restrict editing to assigned party's fields only
                        editableParties={editableParties}
                    />
                )}

                {/* ✅ Wrong Party Warning Dialog - shows when user edits another party's field */}
                {showWrongPartyWarning && !showPrefilledModifiedWarning && (
                    <Box
                        sx={{
                            position: 'fixed',
                            top: '50%',
                            left: '50%',
                            transform: 'translate(-50%, -50%)',
                            zIndex: 1100,
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
                                Wrong Party Field
                            </Typography>
                            <Typography variant="body1" sx={{ mb: 2 }}>
                                You are assigned to fill fields as <strong>{userPartyLabels}</strong>.
                            </Typography>
                            <Typography variant="body2" sx={{ color: 'text.secondary', mb: 2 }}>
                                Please only fill the fields that belong to your assigned party.
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

                {/* ✅ Pre-filled Field Modified Warning - shows when user modifies a field that was already filled */}
                {showPrefilledModifiedWarning && (
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
                            severity="error"
                            sx={{
                                py: 2,
                                px: 2.5,
                                boxShadow: 8,
                                borderRadius: 2,
                                border: '2px solid',
                                borderColor: 'error.main',
                            }}
                        >
                            <Typography variant="h6" fontWeight={700} sx={{ mb: 1 }}>
                                Field Already Filled
                            </Typography>
                            <Typography variant="body1" sx={{ mb: 2 }}>
                                You modified a field that was already filled by another party.
                            </Typography>
                            <Typography variant="body2" sx={{ color: 'text.secondary', mb: 2 }}>
                                Please refresh the page and try again. Only fill the empty fields assigned to you.
                            </Typography>
                            <Button
                                fullWidth
                                variant="contained"
                                color="error"
                                onClick={() => window.location.reload()}
                                sx={{ textTransform: 'none', fontWeight: 600 }}
                            >
                                Refresh Page
                            </Button>
                        </Alert>
                    </Box>
                )}

                {/* Party Validation Warning Popup */}
                {partyValidationWarning && !dismissedPartyWarning && (
                    <Box
                        sx={{
                            ...(popupPosition ? {
                                top: popupPosition.y,
                                left: popupPosition.x,
                                transform: 'none',
                                position: 'fixed',
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
            </Box>
        </Box>
    );
}