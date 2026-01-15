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
    xfdfString?: string; // NEW: XFDF data for filled PDFs
    contractId?: string; // NEW: Contract ID for saving changes
    onSave?: (xfdfString: string) => Promise<void>; // NEW: Save callback
    readOnly?: boolean; // NEW: Control annotation toolbar visibility
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
    xfdfString, // NEW
    contractId,
    onSave,
    readOnly = false // Default to false for backward compatibility
}: DocumentViewerDialogProps) {
    const pdfViewerRef = useRef<any>(null);
    const [saving, setSaving] = useState(false);

    // Handle save button click
    const handleSaveClick = async () => {
        if (!pdfViewerRef.current) return;

        setSaving(true);
        try {
            // Export current annotations from PDFViewerContainer
            const updatedXfdf = await pdfViewerRef.current.exportAnnotations();

            if (updatedXfdf && onSave) {
                await onSave(updatedXfdf);
                console.log('Changes saved successfully!');
            }
        } catch (error) {
            console.error('Error saving changes:', error);
        } finally {
            setSaving(false);
            onClose()
        }
    };

    // Action buttons for dialog footer
    const dialogActions = onSave && xfdfString ? (
        <Button
            variant="contained"
            startIcon={<SaveIcon />}
            onClick={handleSaveClick}
            disabled={saving}
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
                        hasXfdfString: !!xfdfString,
                        hasFileUrl: !!fileUrl,
                        fileUrl: fileUrl?.substring(0, 100),
                        xfdfString: xfdfString?.substring(0, 50)
                    });

                    // ALWAYS show PDFTron viewer with annotation toolbar enabled
                    console.log('Rendering PDFViewerContainer');
                    return (
                        <PDFViewerContainer
                            ref={pdfViewerRef}
                            documentUrl={fileUrl || ""}
                            xfdfString={xfdfString}
                            readOnly={readOnly}
                        />
                    );
                })()}
            </Box>
        </BaseDialog>
    );
}
