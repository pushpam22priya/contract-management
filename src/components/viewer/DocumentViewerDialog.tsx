/* eslint-disable @typescript-eslint/no-explicit-any */
/* eslint-disable @typescript-eslint/no-unused-vars */
'use client';

import { Box, Button } from '@mui/material';
import SaveIcon from '@mui/icons-material/Save';
import dynamic from 'next/dynamic';
import { useRef, useState } from 'react';
import BaseDialog from '@/components/common/BaseDialog';

// Dynamically import viewers
const DocumentViewer = dynamic(() => import('./DocumentViewer'), {
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
            Loading document viewer...
        </Box>
    ),
});

const SimpleContractViewer = dynamic(() => import('./SimpleContractViewer'), {
    ssr: false,
});

const PDFViewerContainer = dynamic(() => import('./PDFViewerContainer'), {
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
});

interface DocumentViewerDialogProps {
    open: boolean;
    onClose: () => void;
    fileUrl: string;
    fileName?: string;
    title?: string;
    content?: string;
    templateDocxBase64?: string;
    fieldValues?: Record<string, string>;
    signatureImage?: string;
    // ✅ NEW: XFDF data to restore annotations on load
    initialXfdf?: string;
    contractId?: string;
    // ✅ CRITICAL: onSave now receives PDF Blob AND XFDF string for signature persistence
    onSave?: (pdfBlob: Blob, xfdfString: string) => Promise<void>;
    readOnly?: boolean;
    commentsOnly?: boolean;
    clientSigningMode?: boolean;
    templateFormFields?: any[];
    formFields?: any[];
    currentUserRole?: 'contractor' | 'client';
}

export default function DocumentViewerDialog({
    open,
    onClose,
    fileUrl,
    fileName,
    title,
    content,
    templateDocxBase64,
    fieldValues,
    signatureImage,
    initialXfdf,
    contractId,
    onSave,
    readOnly = false,
    commentsOnly = false,
    clientSigningMode = false,
    templateFormFields,
    formFields,
    currentUserRole
}: DocumentViewerDialogProps) {


    const pdfViewerRef = useRef<any>(null);
    const [saving, setSaving] = useState(false);
    const [signatureCommitted, setSignatureCommitted] = useState(false);


    // Track field changes during client signing (same pattern as CreateContractDialog)
    const [filledFieldValues, setFilledFieldValues] = useState<Record<string, string>>({});

    // Handle form field changes
    const handleFieldChange = (fieldName: string, value: any) => {
        console.log(`📝 [DocumentViewerDialog] Field changed: ${fieldName} = ${value}`);

        // ✅ SIGNATURE COMMIT SIGNAL — DO NOT STORE AS FIELD
        if (fieldName === '__signature_committed__') {
            setSignatureCommitted(true);
            return;
        }

        // ✅ NORMAL FORM FIELD
        setFilledFieldValues(prev => ({
            ...prev,
            [fieldName]: value?.toString() || ''
        }));
    };


    // Log form fields when component mounts/updates
    if (formFields && formFields.length > 0) {
        console.log('📋 DocumentViewerDialog: Received form fields:', formFields.length);
    }

    // ✅ CRITICAL FIX: Handle save button click - now exports PDF Blob + XFDF
    const handleSaveClick = async () => {
        if (!pdfViewerRef.current) {
            console.error('PDF viewer ref not available');
            return;
        }

        setSaving(true);
        try {
            console.log('📝 [DocumentViewerDialog] Starting export with field values:', filledFieldValues);

            // ✅ CRITICAL: exportAnnotations now returns { blob, xfdfString }
            // Both are needed to persist signatures properly
            const exportResult = await pdfViewerRef.current.exportAnnotations(filledFieldValues);

            if (!exportResult) {
                console.error('Failed to export PDF - received null');
                return;
            }

            const { blob, xfdfString } = exportResult;

            console.log(`✅ PDF exported successfully: ${blob.size} bytes`);
            console.log(`✅ XFDF exported successfully: ${xfdfString.length} chars`);

            if (onSave) {
                // Pass both PDF Blob and XFDF to the save callback
                console.log(`📤 [DocumentViewerDialog] Triggering onSave with ${blob.size} byte Blob + XFDF`);
                await onSave(blob, xfdfString);
                console.log('✅ Changes saved successfully!');

                // ✅ Close dialog after successful save
                onClose();
            }
        } catch (error) {
            console.error('❌ Error saving changes:', error);
            // Optional: Show error notification to user
        } finally {
            setSaving(false);
        }
    };

    // Action buttons for dialog footer
    // ✅ Show save button if onSave callback is provided
    // Note: xfdfString check removed - we now save full PDFs regardless
    const dialogActions = onSave ? (
        <Button
            variant="contained"
            startIcon={<SaveIcon />}
            onClick={handleSaveClick}
            disabled={saving || (clientSigningMode && !signatureCommitted)}
        >
            {saving ? 'Saving...' : 'Save Changes'}
        </Button>
    ) : undefined;

    return (
        <BaseDialog
            open={open}
            onClose={onClose}
            title={title || fileName || 'Document Viewer'}
            maxWidth="lg"
            fullWidth
            customHeight="98vh"
            actions={dialogActions}
        >
            <Box sx={{
                height: dialogActions ? 'calc(100vh - 160px)' : 'calc(100vh - 100px)',
                overflow: 'hidden',
                p: 0,
                m: 0
            }}>
                {(() => {
                    // Debug logging
                    console.log('DocumentViewerDialog render:', {
                        hasFileUrl: !!fileUrl,
                        fileUrl: fileUrl?.substring?.(0, 100) || fileUrl,
                        readOnly,
                        commentsOnly,
                        clientSigningMode
                    });

                    console.log('📄 DocumentViewerDialog source analysis:', {
                        isDataUrl: fileUrl?.startsWith('data:'),
                        fileUrlLength: fileUrl?.length || 0,
                        contractId,
                        currentUserRole
                    });

                    // ✅ ALWAYS show PDFTron viewer
                    console.log('Rendering PDFViewerContainer');
                    return (
                        <PDFViewerContainer
                            ref={pdfViewerRef}
                            documentUrl={fileUrl || ""}
                            // ✅ NEW: Restore annotations from XFDF on load
                            initialXfdf={initialXfdf}
                            readOnly={readOnly}
                            commentsOnly={commentsOnly}
                            clientSigningMode={clientSigningMode}
                            templateFormFields={templateFormFields}
                            formFields={formFields}
                            currentUserRole={currentUserRole}
                            onFieldChange={handleFieldChange}
                        />
                    );


                })()}
            </Box>
        </BaseDialog>
    );
}