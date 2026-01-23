'use client';

import { useEffect, useState, useCallback, useRef } from 'react';
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
import { CheckCircle, Error, AccessTime, Save } from '@mui/icons-material';
import dynamic from 'next/dynamic';
import { SignatureRequest } from '@/types/signature';
import {
    getSignatureRequestData,
    completeExternalSignature
} from '@/services/externalSignatureService';

// Dynamically import PDFViewerContainer (same pattern as DocumentViewerDialog)
const PDFViewerContainer = dynamic(
    () => import('@/components/viewer/PDFViewerContainer'),
    {
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
    }
);

/**
 * Public Signing Page
 *
 * This page is accessible WITHOUT login. Clients receive a link to this
 * page via email and can sign the contract directly.
 *
 * URL format: /sign/[token]?bin=[binId]
 */
export default function PublicSigningPage() {
    const params = useParams();
    const searchParams = useSearchParams();

    const token = params.token as string;
    const binId = searchParams.get('bin');

    console.log('🖥️ [PublicSigningPage] Rendered');
    console.log('🖥️ [PublicSigningPage] Token:', token);
    console.log('🖥️ [PublicSigningPage] Bin ID:', binId);

    // State
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [signatureRequest, setSignatureRequest] = useState<SignatureRequest | null>(null);
    const [submitting, setSubmitting] = useState(false);
    const [completed, setCompleted] = useState(false);

    // Ref for PDF viewer to export annotations
    const pdfViewerRef = useRef<any>(null);

    // Track field changes during signing
    const [filledFieldValues, setFilledFieldValues] = useState<Record<string, string>>({});

    /**
     * Handle form field changes from PDF viewer
     */
    const handleFieldChange = (fieldName: string, value: any) => {
        console.log(`📝 [PublicSigningPage] Field changed: ${fieldName} = ${value}`);
        setFilledFieldValues(prev => ({
            ...prev,
            [fieldName]: value?.toString() || ''
        }));
    };

    /**
     * Load signature request data on mount
     */
    useEffect(() => {
        const loadData = async () => {
            console.log('📥 [PublicSigningPage] Loading signature request data...');

            if (!binId) {
                console.error('❌ [PublicSigningPage] No bin ID in URL');
                setError('Invalid signing link. Please contact the sender.');
                setLoading(false);
                return;
            }

            try {
                const result = await getSignatureRequestData(binId);

                if (!result.success || !result.data) {
                    console.error('❌ [PublicSigningPage] Failed to load data:', result.error);
                    setError('Unable to load document. The link may be invalid or expired.');
                    setLoading(false);
                    return;
                }

                const data = result.data;
                console.log('✅ [PublicSigningPage] Data loaded successfully');
                console.log('✅ [PublicSigningPage] Contract:', data.contractTitle);
                console.log('✅ [PublicSigningPage] Status:', data.status);

                // Validate token matches
                if (data.token !== token) {
                    console.error('❌ [PublicSigningPage] Token mismatch');
                    setError('Invalid signing link. Please contact the sender.');
                    setLoading(false);
                    return;
                }

                // Check if expired
                if (new Date(data.expiresAt) < new Date()) {
                    console.error('❌ [PublicSigningPage] Link expired');
                    setError('This signing link has expired. Please request a new one.');
                    setLoading(false);
                    return;
                }

                // Check if already signed
                if (data.status === 'signed') {
                    console.log('ℹ️ [PublicSigningPage] Already signed');
                    setCompleted(true);
                }

                setSignatureRequest(data);
                setLoading(false);

            } catch (err: any) {
                console.error('❌ [PublicSigningPage] Error loading data:', err);
                setError('An error occurred. Please try again later.');
                setLoading(false);
            }
        };

        loadData();
    }, [token, binId]);

    /**
     * Handle signature submission
     */
    const handleSubmitSignature = async () => {
        console.log('✍️ [PublicSigningPage] Submit signature clicked');

        if (!pdfViewerRef.current || !binId) {
            console.error('❌ [PublicSigningPage] Missing ref or binId');
            return;
        }

        setSubmitting(true);

        try {
            // Export annotations from PDF viewer (same pattern as DocumentViewerDialog)
            console.log('📝 [PublicSigningPage] Exporting annotations with field values:', filledFieldValues);
            const signedXfdf = await pdfViewerRef.current.exportAnnotations(filledFieldValues);

            if (!signedXfdf) {
                console.error('❌ [PublicSigningPage] Failed to export annotations');
                setError('Failed to capture signature. Please try again.');
                setSubmitting(false);
                return;
            }

            console.log('✅ [PublicSigningPage] Annotations exported, submitting to server...');

            // Submit to JSONBin
            const result = await completeExternalSignature(binId, {
                signedXfdf,
            });

            if (result.success) {
                console.log('✅ [PublicSigningPage] Signature submitted successfully');
                setCompleted(true);
            } else {
                console.error('❌ [PublicSigningPage] Failed to submit:', result.error);
                setError('Failed to submit signature. Please try again.');
            }
        } catch (err: any) {
            console.error('❌ [PublicSigningPage] Error submitting:', err);
            setError('An error occurred while submitting. Please try again.');
        } finally {
            setSubmitting(false);
        }
    };

    // Loading state
    if (loading) {
        return (
            <Box
                sx={{
                    minHeight: '100vh',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    bgcolor: 'grey.50',
                }}
            >
                <Box sx={{ textAlign: 'center' }}>
                    <CircularProgress size={48} />
                    <Typography sx={{ mt: 2 }} color="text.secondary">
                        Loading document...
                    </Typography>
                </Box>
            </Box>
        );
    }

    // Error state
    if (error) {
        return (
            <Box
                sx={{
                    minHeight: '100vh',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    bgcolor: 'grey.50',
                    p: 3,
                }}
            >
                <Paper sx={{ p: 4, maxWidth: 500, textAlign: 'center' }}>
                    <Error sx={{ fontSize: 64, color: 'error.main', mb: 2 }} />
                    <Typography variant="h5" gutterBottom>
                        Unable to Load Document
                    </Typography>
                    <Alert severity="error" sx={{ mt: 2 }}>
                        {error}
                    </Alert>
                </Paper>
            </Box>
        );
    }

    // Completed state
    if (completed) {
        return (
            <Box
                sx={{
                    minHeight: '100vh',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    bgcolor: 'grey.50',
                    p: 3,
                }}
            >
                <Paper sx={{ p: 4, maxWidth: 500, textAlign: 'center' }}>
                    <CheckCircle sx={{ fontSize: 64, color: 'success.main', mb: 2 }} />
                    <Typography variant="h5" gutterBottom>
                        Document Signed Successfully!
                    </Typography>
                    <Typography color="text.secondary" sx={{ mb: 3 }}>
                        Thank you for signing "{signatureRequest?.contractTitle}".
                        The sender has been notified.
                    </Typography>
                    <Alert severity="success">
                        You can close this window now.
                    </Alert>
                </Paper>
            </Box>
        );
    }

    // Signing state - show PDF viewer
    return (
        <Box sx={{ minHeight: '100vh', bgcolor: 'grey.100' }}>
            {/* Header */}
            <Box
                sx={{
                    bgcolor: 'primary.main',
                    color: 'white',
                    py: 2,
                    px: 3,
                    boxShadow: 2,
                }}
            >
                <Container maxWidth="lg">
                    <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <Box>
                            <Typography variant="h6">
                                {signatureRequest?.contractTitle}
                            </Typography>
                            <Typography variant="body2" sx={{ opacity: 0.9 }}>
                                Requested by: {signatureRequest?.createdByName || signatureRequest?.createdBy}
                            </Typography>
                        </Box>
                        {/* Submit Button in Header */}
                        <Button
                            variant="contained"
                            color="secondary"
                            startIcon={submitting ? <CircularProgress size={20} color="inherit" /> : <Save />}
                            onClick={handleSubmitSignature}
                            disabled={submitting}
                            sx={{
                                bgcolor: 'white',
                                color: 'primary.main',
                                '&:hover': {
                                    bgcolor: 'grey.100',
                                },
                            }}
                        >
                            {submitting ? 'Submitting...' : 'Submit Signature'}
                        </Button>
                    </Box>
                </Container>
            </Box>

            {/* Expiry Warning */}
            {signatureRequest && (
                <Container maxWidth="lg" sx={{ mt: 2 }}>
                    <Alert
                        severity="info"
                        icon={<AccessTime />}
                        sx={{ mb: 2 }}
                    >
                        This link expires on {new Date(signatureRequest.expiresAt).toLocaleDateString('en-US', {
                            weekday: 'long',
                            year: 'numeric',
                            month: 'long',
                            day: 'numeric',
                        })}
                    </Alert>
                </Container>
            )}

            {/* PDF Viewer */}
            <Container maxWidth="lg" sx={{ py: 2 }}>
                <Paper sx={{ height: 'calc(100vh - 220px)', overflow: 'hidden' }}>
                    {signatureRequest && (
                        <PDFViewerContainer
                            ref={pdfViewerRef}
                            documentUrl={signatureRequest.templateFileUrl}
                            xfdfString={signatureRequest.xfdfString}
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
