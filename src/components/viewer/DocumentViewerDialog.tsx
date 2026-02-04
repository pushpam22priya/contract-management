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
    // ✅ CRITICAL: onSave now receives PDF Blob, XFDF string, fieldValues, and formFields for full persistence
    onSave?: (pdfBlob: Blob, xfdfString: string, fieldValues?: Record<string, string>, formFields?: any[]) => Promise<void>;
    readOnly?: boolean;
    commentsOnly?: boolean;
    clientSigningMode?: boolean;
    templateFormFields?: any[];
    formFields?: any[];
    currentUserRole?: 'contractor' | 'client';
    // ✅ NEW: Permission control props for field lifecycle
    canAddFormFields?: boolean;
    editableFieldMode?: 'all' | 'empty-only' | 'none';
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
    currentUserRole,
    canAddFormFields = false,
    editableFieldMode = 'all'
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

    // ✅ CRITICAL FIX: Handle save button click - now exports PDF Blob + XFDF + fieldValues + formFields
    // This matches the contract creation flow in CreateContractDialog
    const handleSaveClick = async () => {
        if (!pdfViewerRef.current) {
            console.error('PDF viewer ref not available');
            return;
        }

        setSaving(true);

        try {
            console.log('📝 [DocumentViewerDialog] Starting export from DRAFT with field values:', filledFieldValues);
            console.log('📝 [DocumentViewerDialog] Initial XFDF length:', initialXfdf?.length || 0);

            // ✅ CRITICAL: exportAnnotations now returns { blob, xfdfString }
            // Both are needed to persist signatures properly
            // ✅ FIX: Pass empty {} matching contract creation flow.
            // Values are already in the PDF. Passing filledFieldValues causes
            // redundant setValue calls which can invalidate signature appearances.
            const exportResult = await pdfViewerRef.current.exportAnnotations({}, { flatten: false });

            if (!exportResult) {
                console.error('Failed to export PDF - received null');
                return;
            }

            const { blob, xfdfString } = exportResult;

            console.log(`✅ PDF exported from DRAFT: ${blob.size} bytes`);
            console.log(`✅ XFDF exported from DRAFT: ${xfdfString.length} chars`);
            console.log(`📊 XFDF size comparison: Initial=${initialXfdf?.length || 0}, Exported=${xfdfString.length}`);

            // ✅ CRITICAL FIX: Also export formFields (same as CreateContractDialog)
            // This ensures field definitions, readOnly flags, and locked states persist
            let exportedFormFields: any[] | undefined;
            try {
                exportedFormFields = await pdfViewerRef.current.exportFormFields();
                // Sync values from filledFieldValues into exportedFormFields
                if (exportedFormFields) {
                    exportedFormFields = exportedFormFields.map((field: any) => ({
                        ...field,
                        value: filledFieldValues[field.name] || field.value || ''
                    }));
                }
                console.log(`✅ FormFields exported: ${exportedFormFields?.length || 0} fields`);
            } catch (e) {
                console.warn('⚠️ Could not export form fields:', e);
            }

            if (onSave) {
                // ✅ Pass PDF Blob, XFDF, fieldValues, and formFields to the save callback
                // This matches how CreateContractDialog saves contracts
                console.log(`📤 [DocumentViewerDialog] Triggering onSave with ${blob.size} byte Blob + XFDF + fieldValues + formFields`);
                await onSave(blob, xfdfString, filledFieldValues, exportedFormFields);
                console.log('✅ Changes saved to contract successfully!');

                // ✅ NEW: Clear the SignatureStore after successful save
                try {
                    pdfViewerRef.current?.clearSignatureStore?.();
                    console.log('🧹 [DocumentViewerDialog] Cleared SignatureStore after save');
                } catch (e) {
                    console.warn('⚠️ Could not clear signature store:', e);
                }

                // ✅ Close dialog after successful save
                onClose();
            }

        } catch (error) {
            console.error('❌ Error saving changes:', error);
        } finally {
            setSaving(false);
        }
    };

    // Action buttons for dialog footer
    // ✅ Show save button if onSave callback is provided
    // Note: xfdfString check removed - we now save full PDFs regardless
    const dialogActions = (
        <>
            {onSave && (
                <Button
                    variant="contained"
                    startIcon={<SaveIcon />}
                    onClick={handleSaveClick}
                    disabled={saving || (clientSigningMode && !signatureCommitted)}
                >
                    {saving ? 'Saving...' : 'Save Changes'}
                </Button>
            )}
        </>
    );

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
                            // ✅ CRITICAL FIX: ALWAYS pass initialXfdf for both templates AND contracts
                            // Contracts are saved with flatten=false (CreateContractDialog.tsx:144)
                            // So we NEED to import XFDF to restore signatures and field values
                            // Previous logic incorrectly skipped XFDF for contracts, causing signatures to disappear
                            initialXfdf={initialXfdf}
                            readOnly={readOnly}
                            commentsOnly={commentsOnly}
                            clientSigningMode={clientSigningMode}
                            templateFormFields={templateFormFields}
                            formFields={formFields}
                            currentUserRole={currentUserRole}
                            onFieldChange={handleFieldChange}
                            // ✅ NEW: Permission control props
                            canAddFormFields={canAddFormFields}
                            editableFieldMode={editableFieldMode}
                        />
                    );


                })()}
            </Box>
        </BaseDialog>
    );
}