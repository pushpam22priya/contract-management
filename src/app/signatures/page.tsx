'use client';

import { Box, Typography, Alert, AlertColor, Button, Paper } from '@mui/material';
import AppLayout from '@/components/layout/AppLayout';
import { useState, useEffect, useRef } from 'react';
import { contractService } from '@/services/contractService';
import { templateService } from '@/services/templateService';
import { Contract, ContractStatus } from '@/types/contract';
import { authService } from '@/services/authService';
import DocumentViewerDialog from '@/components/viewer/DocumentViewerDialog';
import NotificationSnackbar from '@/components/common/NotificationSnackbar';
import ContractCard from '@/components/contracts/ContractCard';
import DrawIcon from '@mui/icons-material/Draw';
import SignaturePadDialog from '@/components/contracts/SignaturePadDialog';
import { blobToBase64, verifyPdfBase64 } from '@/utils/pdfUtils';

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
    const loadContracts = async () => {
        setLoading(true);
        const currentUser = authService.getCurrentUser();

        if (!currentUser) {
            setContracts([]);
            setLoading(false);
            return;
        }

        const allContracts = await contractService.getAllContracts();
        // Filter contracts waiting for signature by current user
        const assignedContracts = allContracts.filter(c =>
            c.status === ContractStatus.WAITING_FOR_SIGNATURE &&
            c.signer?.email === currentUser.email
        );
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
     *
     * ✅ IMPORTANT: All pending changes are ALREADY COMMITTED before this function is called
     * The commit process happens in PDFViewerContainer.exportAnnotations() which includes:
     * - Deselecting active annotations
     * - Switching tools to finalize edits
     * - Calling field.commit() on all form fields
     * - Refreshing the document viewer
     * - Redrawing all annotations
     */
    const handleSaveSignature = async (pdfBlob: Blob, xfdfString?: string, fieldValues?: Record<string, string>, formFields?: any[]) => {
        const currentUser = authService.getCurrentUser();
        if (!currentUser || !selectedContract) return;

        console.log('═══════════════════════════════════════════════════════════════════');
        console.log('💾 [SignaturesPage] Saving client signature to contract:', selectedContract.id);
        console.log('✅ [SignaturesPage] All pending changes were committed before this callback');
        console.log('═══════════════════════════════════════════════════════════════════');
        console.log(`📄 PDF Blob size: ${pdfBlob.size} bytes`);
        console.log(`📋 XFDF string length: ${xfdfString?.length || 0} chars`);
        console.log(`📋 XFDF preview: ${xfdfString?.substring(0, 500)}...`);
        console.log(`📝 Field values count: ${fieldValues ? Object.keys(fieldValues).length : 0}`);
        console.log(`📋 Form fields count: ${formFields?.length || 0}`);
        console.log(`📋 Previous XFDF length: ${selectedContract.xfdfData?.length || 0} chars`);

        try {
            // Convert Blob to base64
            console.log('📄 [SignaturesPage] Converting PDF Blob to base64...');
            const pdfBase64 = await blobToBase64(pdfBlob);

            if (!verifyPdfBase64(pdfBase64)) {
                console.error('❌ Invalid PDF: does not start with %PDF-');
                showNotification('Failed to save: Invalid PDF data', 'error');
                return;
            }
            console.log(`   - Base64 length: ${pdfBase64.length} chars`);

            // First, save the signed PDF with XFDF data
            const updateResult = await contractService.updateContractSignedPdf(
                selectedContract.id,
                pdfBase64,
                xfdfString // ✅ Include XFDF to preserve annotations
            );

            if (!updateResult.success) {
                showNotification(updateResult.message || 'Failed to save signature', 'error');
                return;
            }

            // Then, mark the contract as signed
            const signResult = await contractService.signContract(
                selectedContract.id,
                currentUser.email,
                '' // No separate signature image needed since it's in the PDF
            );

            if (signResult.success) {
                showNotification('Contract signed successfully!', 'success');

                // ✅ Close the viewer first to prevent stale data display
                setViewerOpen(false);
                setSelectedContract(null);

                // Then reload to remove from signatures list
                await loadContracts();
            } else {
                showNotification(signResult.message || 'Signature saved but failed to update status', 'warning');

                // ✅ Close viewer and reload
                setViewerOpen(false);
                setSelectedContract(null);
                await loadContracts();
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
                            // ✅ PRIORITY 1: Use fileUrl (latest saved contract PDF from API)
                            if (selectedContract.fileUrl) {
                                console.log('📄 [SignaturesPage] Using contract.fileUrl (latest saved PDF)');
                                return selectedContract.fileUrl;
                            }
                            // Priority 2: Use fileData if available (base64 contract PDF)
                            if (selectedContract.fileData) {
                                console.log('📄 [SignaturesPage] Using contract.fileData (base64)');
                                return `data:application/pdf;base64,${selectedContract.fileData}`;
                            }
                            // Priority 3: Use signedPdfBase64 (legacy/fallback)
                            if (selectedContract.signedPdfBase64) {
                                console.log('📄 [SignaturesPage] Using signedPdfBase64 (legacy)');
                                return `data:application/pdf;base64,${selectedContract.signedPdfBase64}`;
                            }
                            // Priority 4: Fall back to template URL (should rarely happen)
                            if (selectedContract.templateId) {
                                console.log('⚠️ [SignaturesPage] Falling back to template URL - contract PDF not found!');
                                return `/api/file/${selectedContract.templateId}?type=template`;
                            }
                            return "";
                        })()}
                        fileName={`${selectedContract.title}.pdf`}
                        title={selectedContract.title}
                        content={selectedContract.signedPdfBase64 ? undefined : selectedContract.content}
                        templateDocxBase64={selectedContract.templateDocxBase64}
                        fieldValues={selectedContract.fieldValues}
                        // ✅ CRITICAL: Load XFDF to display form fields and annotations
                        initialXfdf={selectedContract.xfdfData}
                        contractId={selectedContract.id}
                        onSave={handleSaveSignature}
                        clientSigningMode={true}
                        currentUserRole="client"
                        // Use contract's formFields (with saved ReadOnly flags)
                        formFields={selectedContract.formFields}
                        // ✅ CRITICAL: External signers can only edit empty fields, filled fields are read-only
                        editableFieldMode="empty-only"
                        // ✅ Pass parties for party validation (must complete all fields of a party)
                        parties={selectedContract.parties}
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
