'use client';

import { useEffect, useState, useRef } from 'react';
import { useParams } from 'next/navigation';
import {
    Box,
    Typography,
    CircularProgress,
    Alert,
    Button,
    Paper,
} from '@mui/material';
import { CheckCircle, Error, Save, Download } from '@mui/icons-material';
import dynamic from 'next/dynamic';
import { SignatureRequest } from '@/types/signature';
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

    // ✅ "Sign All" dialog state
    const [showSignAllDialog, setShowSignAllDialog] = useState(false);
    const [emptySignFieldCount, setEmptySignFieldCount] = useState(0);
    const [hasDeclinedSignAll, setHasDeclinedSignAll] = useState(false);

    const handleFieldChange = (fieldName: string, value: any) => {
        setFilledFieldValues(prev => ({
            ...prev,
            [fieldName]: value?.toString() || ''
        }));
    };

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
                const result = await getSignatureRequestData(token);

                if (!result.success || !result.data) {
                    setError('Unable to load document. The link may be invalid or expired.');
                    setLoading(false);
                    return;
                }

                const data = result.data;

                if (new Date(data.expiresAt) < new Date()) {
                    setError('This signing link has expired. Please request a new one.');
                    setLoading(false);
                    return;
                }

                if (data.status === 'signed') {
                    setCompleted(true);
                }

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
     * Handle signature submission
     * Matches contract creation flow: exports PDF, XFDF, fieldValues, and formFields
     */
    const handleSubmitSignature = async () => {
        if (!pdfViewerRef.current) return;

        setSubmitting(true);

        try {
            // ✅ CRITICAL FIX: Use flatten: true to permanently embed signature in PDF
            // Pass empty {} to exportAnnotations - values are already in the PDF
            // Without flattening, signature appearance data is lost during XFDF import/export cycles
            const exportResult = await pdfViewerRef.current?.exportAnnotations({}, { flatten: true });

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
                if (signatureRequest?.signerEmail) {
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
    const handleDownloadSignedPdf = () => {
        if (!signedPdfBlob) return;
        const url = URL.createObjectURL(signedPdfBlob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `${signatureRequest?.contractTitle || 'signed_contract'}.pdf`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    };

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
                        You will get the signed document by email.
                    </Typography>
                    {signedPdfBlob && (
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
                    )}
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
                <Typography variant="body1" color='#fff' fontWeight={500}>
                    {signatureRequest?.contractTitle}
                </Typography>
                <Button
                    variant="contained"
                    size="small"
                    startIcon={submitting ? <CircularProgress size={16} color="inherit" /> : <Save />}
                    onClick={handleSubmitSignature}
                    disabled={submitting}
                    sx={{
                        bgcolor: 'white',
                        color: 'primary.main',
                        '&:hover': { bgcolor: 'grey.100' },
                        textTransform: 'none',
                        fontWeight: 600,
                        py: 0.5
                    }}
                >
                    {submitting ? 'Submitting...' : 'Submit Signature'}
                </Button>
            </Box>

            {/* Full-Screen PDF Viewer */}
            <Box sx={{ flex: 1, overflow: 'hidden' }}>
                {signatureRequest && (
                    <PDFViewerContainer
                        ref={pdfViewerRef}
                        documentUrl={`/api/sign-requests/${token}/file`}
                        initialXfdf={signatureRequest.xfdfData}
                        formFields={signatureRequest.formFields}
                        clientSigningMode={true}
                        readOnly={false}
                        currentUserRole="client"
                        onFieldChange={handleFieldChange}
                        editableFieldMode="empty-only"
                        showAnnotationNavigation={true}
                        onSignatureApplied={handleSignatureApplied}
                    />
                )}
            </Box>
        </Box>
    );
}