'use client';

import AppButton from '@/components/common/AppButton';
import { useState } from 'react';
import { TextField,
    Box,
    Typography,
    Alert,
    InputAdornment,
} from '@mui/material';
import { Email, Send, CheckCircle, ContentCopy, Check } from '@mui/icons-material';
import BaseDialog from '@/components/common/BaseDialog';

interface SubmitForSignatureDialogProps {
    open: boolean;
    onClose: () => void;
    onSubmit: (signerEmail: string) => Promise<{ success: boolean; signingUrl?: string }>;
    contractTitle?: string;
}

/**
 * Dialog for submitting a contract for external signature.
 * 
 * This dialog collects the signer's email address and sends them
 * a signing link via email. The client can then sign without
 * logging into the system.
 */
const SubmitForSignatureDialog = ({
    open,
    onClose,
    onSubmit,
    contractTitle,
}: SubmitForSignatureDialogProps) => {
    const [signerEmail, setSignerEmail] = useState('');
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [success, setSuccess] = useState(false);
    const [signingUrl, setSigningUrl] = useState<string | null>(null);
    const [copied, setCopied] = useState(false);

    console.log('🖥️ [SubmitForSignatureDialog] Rendered, open:', open);

    /**
     * Validate email format
     */
    const isValidEmail = (email: string): boolean => {
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        return emailRegex.test(email);
    };

    /**
     * Handle form submission
     */
    const handleSubmit = async () => {
        console.log('📤 [SubmitForSignatureDialog] Submit clicked');
        console.log('📤 [SubmitForSignatureDialog] Signer email:', signerEmail);

        // Validate email
        if (!signerEmail.trim()) {
            setError('Please enter an email address');
            return;
        }

        if (!isValidEmail(signerEmail)) {
            setError('Please enter a valid email address');
            return;
        }

        setLoading(true);
        setError(null);

        try {
            console.log('📤 [SubmitForSignatureDialog] Calling onSubmit...');
            const result = await onSubmit(signerEmail.trim());

            if (result.success) {
                console.log('✅ [SubmitForSignatureDialog] Submission successful');
                console.log('✅ [SubmitForSignatureDialog] Signing URL:', result.signingUrl);
                setSuccess(true);
                setSigningUrl(result.signingUrl || null);
            } else {
                console.error('❌ [SubmitForSignatureDialog] Submission failed');
                setError('Failed to send signature request. Please try again.');
            }
        } catch (err: any) {
            console.error('❌ [SubmitForSignatureDialog] Error:', err);
            setError(err.message || 'An unexpected error occurred');
        } finally {
            setLoading(false);
        }
    };

    /**
     * Copy signing URL to clipboard
     */
    const handleCopyUrl = async () => {
        if (signingUrl) {
            await navigator.clipboard.writeText(signingUrl);
            console.log('📋 [SubmitForSignatureDialog] URL copied to clipboard');
            setCopied(true);
            setTimeout(() => setCopied(false), 2000);
        }
    };

    /**
     * Handle dialog close - reset state
     */
    const handleClose = () => {
        console.log('🚪 [SubmitForSignatureDialog] Closing dialog');
        setSignerEmail('');
        setError(null);
        setSuccess(false);
        setSigningUrl(null);
        setLoading(false);
        onClose();
    };

    return (
        <BaseDialog
            open={open}
            onClose={loading ? () => {} : handleClose}
            title={success ? 'Signature Request Sent!' : 'Request Signature'}
            maxWidth="sm"
            actions={
                success ? (
                    <AppButton onClick={handleClose} variant="contained">
                        Done
                    </AppButton>
                ) : (
                    <>
                        <AppButton
                            variant="outlined"
                            onClick={handleClose}
                            disabled={loading}
                        >
                            Cancel
                        </AppButton>
                        <AppButton
                            onClick={handleSubmit}
                            variant="contained"
                            loading={loading}
                            disabled={!signerEmail.trim()}
                            startIcon={<Send />}
                        >
                            {loading ? 'Sending...' : 'Send Request'}
                        </AppButton>
                    </>
                )
            }
        >
            {/* Contract Title */}
            {contractTitle && (
                <Typography
                    variant="body2"
                    color="text.secondary"
                    sx={{ mb: 3 }}
                >
                    Contract: <strong>{contractTitle}</strong>
                </Typography>
            )}

            {/* Success State */}
            {success ? (
                <Box>
                    <Alert
                        severity="success"
                        icon={<CheckCircle />}
                        sx={{ mb: 3 }}
                    >
                        Signature request has been sent to <strong>{signerEmail}</strong>
                    </Alert>

                    <Typography variant="body2" sx={{ mb: 2 }}>
                        The recipient will receive an email with a link to sign the document.
                        You will be notified when they complete the signature.
                    </Typography>

                    {/* Show signing URL for manual sharing */}
                    {signingUrl && (
                        <Box sx={{ mt: 3 }}>
                            <Typography variant="subtitle2" sx={{ mb: 1 }}>
                                Signing Link (for manual sharing):
                            </Typography>
                            <Box
                                sx={{
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: 1,
                                    p: 1.5,
                                    bgcolor: 'grey.100',
                                    borderRadius: 1,
                                    wordBreak: 'break-all',
                                }}
                            >
                                <Typography
                                    variant="caption"
                                    sx={{ flex: 1, fontFamily: 'monospace' }}
                                >
                                    {signingUrl}
                                </Typography>
                                <AppButton
                                    variant="outlined"
                                    size="small"
                                    startIcon={copied ? <Check /> : <ContentCopy />}
                                    onClick={handleCopyUrl}
                                    color={copied ? 'success' : 'primary'}
                                >
                                    {copied ? 'Copied' : 'Copy'}
                                </AppButton>
                            </Box>
                        </Box>
                    )}
                </Box>
            ) : (
                /* Input State */
                <Box>
                    <Typography variant="body2" sx={{ mb: 3 }}>
                        Enter the email address of the person who needs to sign this contract.
                        They will receive an email with a secure link to review and sign the document.
                    </Typography>

                    {/* Error Alert */}
                    {error && (
                        <Alert severity="error" sx={{ mb: 2 }}>
                            {error}
                        </Alert>
                    )}

                    {/* Email Input */}
                    <TextField
                        fullWidth
                        label="Signer's Email Address"
                        type="email"
                        value={signerEmail}
                        onChange={(e) => setSignerEmail(e.target.value)}
                        disabled={loading}
                        placeholder="client@example.com"
                        InputProps={{
                            startAdornment: (
                                <InputAdornment position="start">
                                    <Email color="action" />
                                </InputAdornment>
                            ),
                        }}
                        onKeyPress={(e) => {
                            if (e.key === 'Enter' && !loading) {
                                handleSubmit();
                            }
                        }}
                        autoFocus
                    />

                    {/* Info Text */}
                    <Typography
                        variant="caption"
                        color="text.secondary"
                        sx={{ mt: 1, display: 'block' }}
                    >
                        The signer will not need to create an account. They can sign directly from the email link.
                    </Typography>
                </Box>
            )}
        </BaseDialog>
    );
};

export default SubmitForSignatureDialog;
