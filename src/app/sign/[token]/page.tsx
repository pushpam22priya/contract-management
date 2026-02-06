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

export default function PublicSigningPage() {
    const params = useParams();
    const token = params.token as string;

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
                setCompleted(true);
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

    // Completed state
    if (completed) {
        return (
            <Box sx={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', bgcolor: 'grey.50', p: 3 }}>
                <Paper sx={{ p: 4, maxWidth: 500, textAlign: 'center' }}>
                    <CheckCircle sx={{ fontSize: 64, color: 'success.main', mb: 2 }} />
                    <Typography variant="h5" gutterBottom>Document Signed Successfully!</Typography>
                    <Typography color="text.secondary" sx={{ mb: 3 }}>
                        Thank you for signing "{signatureRequest?.contractTitle}". The contract has been updated.
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
                            documentUrl={`/api/sign-requests/${token}/file`}
                            // ✅ FIX: Re-enable XFDF import so contractor signatures and filled values
                            // are visible to the external signer. Without this, signature appearances
                            // and field values from contract creation are not displayed.
                            initialXfdf={signatureRequest.xfdfData}
                            formFields={signatureRequest.formFields}
                            clientSigningMode={true}
                            readOnly={false}
                            currentUserRole="client"
                            onFieldChange={handleFieldChange}
                            // ✅ NEW: External signers can ONLY fill empty fields, NOT modify pre-filled values
                            editableFieldMode="empty-only"
                            // ✅ Enable annotation navigation for external signature
                            showAnnotationNavigation={true}
                        />
                    )}
                </Paper>
            </Container>
        </Box>
    );
}