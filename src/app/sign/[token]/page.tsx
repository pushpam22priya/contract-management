'use client';

import { useEffect, useState, useRef } from 'react';
import { useParams, useSearchParams } from 'next/navigation';
import {
    Box,
    Typography,
    CircularProgress,
    Alert,
    Button,
    Paper,
    Container,
} from '@mui/material';
import { CheckCircle, Error, Save } from '@mui/icons-material';
import dynamic from 'next/dynamic';
import { SignatureRequest } from '@/types/signature';
import {
    getSignatureRequestData,
    completeExternalSignature
} from '@/services/externalSignatureService';

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

/**
 * Helper function to convert Blob to base64 string
 * ✅ CRITICAL: This is required to store PDFs properly
 */
function blobToBase64(blob: Blob): Promise<string> {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onloadend = () => {
            const base64 = reader.result as string;
            // Remove data URL prefix (data:application/pdf;base64,)
            const base64Data = base64.split(',')[1];
            resolve(base64Data);
        };
        reader.onerror = reject;
        reader.readAsDataURL(blob);
    });
}

export default function PublicSigningPage() {
    const params = useParams();
    const searchParams = useSearchParams();

    const token = params.token as string;
    const binId = searchParams.get('bin');

    console.log('🖥️ [PublicSigningPage] Rendered - Token:', token, 'Bin:', binId);

    // State
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [signatureRequest, setSignatureRequest] = useState<SignatureRequest | null>(null);
    const [submitting, setSubmitting] = useState(false);
    const [completed, setCompleted] = useState(false);

    // Ref for PDF viewer
    const pdfViewerRef = useRef<any>(null);

    // Track field changes
    const [filledFieldValues, setFilledFieldValues] = useState<Record<string, string>>({});

    const handleFieldChange = (fieldName: string, value: any) => {
        console.log(`📝 [PublicSigningPage] Field changed: ${fieldName} = ${value}`);
        setFilledFieldValues(prev => ({
            ...prev,
            [fieldName]: value?.toString() || ''
        }));
    };

    /**
     * Load signature request data
     */
    useEffect(() => {
        const loadData = async () => {
            console.log('📥 [PublicSigningPage] Loading signature request...');

            if (!binId) {
                setError('Invalid signing link. Please contact the sender.');
                setLoading(false);
                return;
            }

            try {
                const result = await getSignatureRequestData(binId);

                if (!result.success || !result.data) {
                    setError('Unable to load document. The link may be invalid or expired.');
                    setLoading(false);
                    return;
                }

                const data = result.data;
                console.log('✅ [PublicSigningPage] Data loaded - Contract:', data.contractTitle);

                if (data.token !== token) {
                    setError('Invalid signing link. Please contact the sender.');
                    setLoading(false);
                    return;
                }

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
                console.error('❌ [PublicSigningPage] Error:', err);
                setError('An error occurred. Please try again later.');
                setLoading(false);
            }
        };

        loadData();
    }, [token, binId]);

    /**
     * Handle signature submission
     * ✅ CRITICAL FIX: Properly convert Blob to base64
     */
    const handleSubmitSignature = async () => {
        console.log('✍️ [PublicSigningPage] Submit clicked');

        if (!pdfViewerRef.current || !binId) {
            console.error('❌ Missing ref or binId');
            return;
        }

        setSubmitting(true);

        try {
            // ✅ STEP 1: Export PDF Blob and XFDF from PDF viewer
            // CRITICAL: exportAnnotations now returns { blob, xfdfString }
            console.log('📝 [PublicSigningPage] Exporting PDF and XFDF with field values:', filledFieldValues);
            const exportResult = await pdfViewerRef.current?.exportAnnotations(filledFieldValues);

            if (!exportResult || !exportResult.blob) {
                console.error('❌ Export failed - received null or empty data');
                setError('Failed to capture signature. Please try again.');
                setSubmitting(false);
                return;
            }

            const { blob: pdfBlob, xfdfString } = exportResult;
            console.log('✅ PDF Blob exported:', pdfBlob.size, 'bytes');
            console.log('✅ XFDF exported:', xfdfString.length, 'chars');

            // ✅ STEP 2: Convert Blob to base64
            const base64Pdf = await blobToBase64(pdfBlob);
            console.log('✅ Converted to base64:', base64Pdf.length, 'characters');

            // ✅ STEP 3: Submit to JSONBin
            console.log('📤 Submitting to server...');
            const result = await completeExternalSignature(binId, {
                signedPdfBase64: base64Pdf,
                signedXfdf: xfdfString,     // ✅ Pass XFDF too
            });

            if (result.success) {
                console.log('✅ Signature submitted successfully!');
                setCompleted(true);
            } else {
                console.error('❌ Submit failed:', result.error);
                setError('Failed to submit signature. Please try again.');
            }
        } catch (err) {
            console.error('❌ Error during submission:', err);
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

    // Completed state
    if (completed) {
        return (
            <Box sx={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', bgcolor: 'grey.50', p: 3 }}>
                <Paper sx={{ p: 4, maxWidth: 500, textAlign: 'center' }}>
                    <CheckCircle sx={{ fontSize: 64, color: 'success.main', mb: 2 }} />
                    <Typography variant="h5" gutterBottom>Document Signed Successfully!</Typography>
                    <Typography color="text.secondary" sx={{ mb: 3 }}>
                        Thank you for signing "{signatureRequest?.contractTitle}". The sender has been notified.
                    </Typography>
                    <Alert severity="success">You can close this window now.</Alert>
                </Paper>
            </Box>
        );
    }

    // Signing state
    return (
        <Box sx={{ minHeight: '100vh', bgcolor: 'grey.100' }}>
            <Box sx={{ bgcolor: 'primary.main', color: 'white', boxShadow: 2 }}>
                <Container maxWidth="lg">
                    <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', py: 2 }}>
                        <Box>
                            <Typography variant="h6">{signatureRequest?.contractTitle}</Typography>
                            <Typography variant="body2" sx={{ opacity: 0.9 }}>
                                Requested by: {signatureRequest?.createdByName || signatureRequest?.createdBy}
                            </Typography>
                        </Box>
                        <Button
                            variant="contained"
                            color="secondary"
                            startIcon={submitting ? <CircularProgress size={20} color="inherit" /> : <Save />}
                            onClick={handleSubmitSignature}
                            disabled={submitting}
                            sx={{ bgcolor: 'white', color: 'primary.main', '&:hover': { bgcolor: 'grey.100' } }}
                        >
                            {submitting ? 'Submitting...' : 'Submit Signature'}
                        </Button>
                    </Box>
                </Container>
            </Box>

            <Container maxWidth="lg" sx={{ py: 2 }}>
                <Paper sx={{ height: 'calc(100vh - 140px)', overflow: 'hidden' }}>
                    {signatureRequest && (
                        <PDFViewerContainer
                            ref={pdfViewerRef}
                            documentUrl={
                                signatureRequest.signedPdfBase64
                                    ? `data:application/pdf;base64,${signatureRequest.signedPdfBase64}`
                                    : signatureRequest.templateFileUrl
                            }
                            formFields={signatureRequest.formFields}
                            clientSigningMode={true}
                            readOnly={false}
                            currentUserRole="client"
                            onFieldChange={handleFieldChange}
                        />
                    )}
                </Paper>
            </Container>
        </Box>
    );
}