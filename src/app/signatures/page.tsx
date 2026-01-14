'use client';

import { Box, Typography, Alert, AlertColor, Button, Paper } from '@mui/material';
import AppLayout from '@/components/layout/AppLayout';
import { useState, useEffect, useRef } from 'react';
import { contractService } from '@/services/contractService';
import { templateService } from '@/services/templateService';
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
     * Handle saving client signature (from PDF viewer)
     * This also marks the contract as signed automatically
     */
    const handleSaveSignature = async (xfdfString: string) => {
        const currentUser = authService.getCurrentUser();
        if (!currentUser || !selectedContract) return;

        console.log('💾 Saving client signature to contract:', selectedContract.id);
        console.log('📋 Updated XFDF length:', xfdfString.length);

        try {
            // First, update the XFDF data
            const updateResult = await contractService.updateContractXfdf(selectedContract.id, xfdfString);

            if (!updateResult.success) {
                showNotification(updateResult.message || 'Failed to save signature', 'error');
                return;
            }

            // Then, mark the contract as signed
            const signResult = await contractService.signContract(
                selectedContract.id,
                currentUser.email,
                '' // No separate signature image needed since it's in the XFDF
            );

            if (signResult.success) {
                showNotification('Contract signed successfully!', 'success');
                setViewerOpen(false); // Close the viewer
                setSelectedContract(null);
                loadContracts(); // Reload to remove from signatures list
            } else {
                showNotification(signResult.message || 'Signature saved but failed to update status', 'warning');
                loadContracts(); // Still reload to show updated XFDF
            }
        } catch (error) {
            console.error('Error saving signature:', error);
            showNotification('Failed to save signature', 'error');
        }
    };

    /**
     * Handle Sign Contract (from signature pad dialog)
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
                            <ContractCard
                                key={contract.id}
                                contract={contract}
                                onView={handleView}
                            />
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
                        fileUrl={(() => {
                            if (selectedContract.xfdfString && selectedContract.templateId) {
                                const template = templateService.getTemplateById(selectedContract.templateId);
                                console.log('📄 Template for signature viewing:', template);
                                const url = template?.fileUrl || "";
                                console.log('📄 Using fileUrl:', url.substring(0, 50));
                                return url;
                            }
                            return "";
                        })()}
                        fileName={`${selectedContract.title}.pdf`}
                        title={selectedContract.title}
                        content={selectedContract.xfdfString ? undefined : selectedContract.content}
                        templateDocxBase64={selectedContract.templateDocxBase64}
                        fieldValues={selectedContract.fieldValues}
                        xfdfString={selectedContract.xfdfString}
                        contractId={selectedContract.id}
                        onSave={handleSaveSignature}
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
