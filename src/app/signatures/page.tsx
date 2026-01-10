'use client';

import { Box, Typography, Alert, AlertColor, Button, Paper } from '@mui/material';
import AppLayout from '@/components/layout/AppLayout';
import { useState, useEffect } from 'react';
import { contractService } from '@/services/contractService';
import { Contract } from '@/types/contract';
import { authService } from '@/services/authService';
import DocumentViewerDialog from '@/components/viewer/DocumentViewerDialog';
import NotificationSnackbar from '@/components/common/NotificationSnackbar';
import ContractCard from '@/components/contracts/ContractCard';
import DrawIcon from '@mui/icons-material/Draw';
import SignaturePadDialog from '@/components/contracts/SignaturePadDialog';

/**
 * Signatures Page
 * Shows contracts assigned to the current user for signature
 */
export default function SignaturesPage() {
    const [contracts, setContracts] = useState<Contract[]>([]);
    const [loading, setLoading] = useState(true);

    // Viewer state
    const [viewerOpen, setViewerOpen] = useState(false);
    const [selectedContract, setSelectedContract] = useState<Contract | null>(null);

    // Signature Pad state
    const [signaturePadOpen, setSignaturePadOpen] = useState(false);
    const [contractToSign, setContractToSign] = useState<Contract | null>(null);

    // Snackbar state
    const [snackbar, setSnackbar] = useState({
        open: false,
        message: '',
        severity: 'success' as AlertColor,
    });

    // Load contracts on mount
    useEffect(() => {
        loadContracts();
    }, []);

    /**
     * Load contracts assigned to current user for signature
     */
    const loadContracts = () => {
        setLoading(true);
        const currentUser = authService.getCurrentUser();

        if (!currentUser) {
            setContracts([]);
            setLoading(false);
            return;
        }

        const assignedContracts = contractService.getContractsForSignature(currentUser.email);
        setContracts(assignedContracts);
        setLoading(false);
    };

    /**
     * Show snackbar notification
     */
    const showNotification = (message: string, severity: AlertColor = 'success') => {
        setSnackbar({ open: true, message, severity });
    };

    /**
     * Handle View Contract
     */
    const handleView = (id: string) => {
        const contract = contracts.find(c => c.id === id);
        if (contract) {
            setSelectedContract(contract);
            setViewerOpen(true);
        }
    };

    /**
     * Open Signature Pad
     */
    const handleOpenSignaturePad = (contract: Contract) => {
        setContractToSign(contract);
        setSignaturePadOpen(true);
    };

    /**
     * Handle Sign Contract
     */
    const handleSign = async (signatureImage: string) => {
        const currentUser = authService.getCurrentUser();
        if (!currentUser || !contractToSign) return;

        const result = await contractService.signContract(contractToSign.id, currentUser.email, signatureImage);

        if (result.success) {
            showNotification(result.message, 'success');
            loadContracts(); // Reload to remove signed contract from list
        } else {
            showNotification(result.message, 'error');
        }
    };

    return (
        <AppLayout>
            <Box>
                {/* Header Section */}
                <Box sx={{ mb: 3 }}>
                    <Typography
                        fontWeight={600}
                        sx={{
                            color: 'primary.main',
                            fontSize: { xs: '1rem', sm: '1.5rem', md: '20px' },
                        }}
                    >
                        Contracts for Signature
                    </Typography>
                    <Typography variant="body2" sx={{ color: 'text.secondary' }}>
                        Review and sign contracts assigned to you
                    </Typography>
                </Box>

                {/* Contracts Grid */}
                {contracts.length === 0 && !loading ? (
                    <Paper
                        sx={{
                            p: 4,
                            textAlign: 'center',
                            bgcolor: 'background.paper',
                            borderRadius: 2,
                            border: '1px dashed',
                            borderColor: 'divider'
                        }}
                    >
                        <DrawIcon sx={{ fontSize: 48, color: 'text.secondary', opacity: 0.5, mb: 2 }} />
                        <Typography variant="h6" color="text.secondary" gutterBottom>
                            No Contracts to Sign
                        </Typography>
                        <Typography variant="body2" color="text.secondary">
                            You don't have any contracts waiting for your signature at the moment.
                        </Typography>
                    </Paper>
                ) : (
                    <Box
                        sx={{
                            display: 'grid',
                            gridTemplateColumns: {
                                xs: '1fr',
                                sm: 'repeat(2, 1fr)',
                                lg: 'repeat(3, 1fr)',
                            },
                            gap: 2,
                        }}
                    >
                        {contracts.map((contract) => (
                            <Box key={contract.id} sx={{ position: 'relative' }}>
                                <ContractCard
                                    contract={contract}
                                    onView={handleView}
                                // We can reuse onShare or add a custom action button prop to ContractCard if needed.
                                // For now, let's just use the card display and maybe add a "Sign" button below/over it
                                // OR we can rely on opening the viewer to sign (common pattern)
                                />
                                <Button
                                    variant="contained"
                                    startIcon={<DrawIcon />}
                                    onClick={() => handleOpenSignaturePad(contract)}
                                    className="action-button" // Reuse existing hover styles if we want
                                    sx={{
                                        mt: 1,
                                        width: '100%',
                                        bgcolor: '#f57f17', // Match waiting_for_signature color
                                        '&:hover': { bgcolor: '#f9a825' },
                                    }}
                                >
                                    Sign Contract
                                </Button>
                            </Box>
                        ))}
                    </Box>
                )}

                {/* Viewer Dialog */}
                {selectedContract && (
                    <DocumentViewerDialog
                        open={viewerOpen}
                        onClose={() => {
                            setViewerOpen(false);
                            setSelectedContract(null);
                        }}
                        fileUrl=""
                        fileName={`${selectedContract.title}.txt`}
                        title={selectedContract.title}
                        content={selectedContract.content}
                        templateDocxBase64={selectedContract.templateDocxBase64}
                        fieldValues={selectedContract.fieldValues}
                    />
                )}

                {/* Signature Pad Dialog */}
                <SignaturePadDialog
                    open={signaturePadOpen}
                    onClose={() => setSignaturePadOpen(false)}
                    onSign={handleSign}
                />

                {/* Notification Snackbar */}
                <NotificationSnackbar
                    open={snackbar.open}
                    message={snackbar.message}
                    severity={snackbar.severity}
                    onClose={() => setSnackbar({ ...snackbar, open: false })}
                />
            </Box>
        </AppLayout>
    );
}
