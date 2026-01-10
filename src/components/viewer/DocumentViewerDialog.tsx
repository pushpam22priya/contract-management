// 'use client';

// import { Dialog, DialogContent, DialogTitle, IconButton, Box, Typography } from '@mui/material';
// import CloseIcon from '@mui/icons-material/Close';
// import dynamic from 'next/dynamic';
// import { useEffect } from 'react';

// // Dynamically import DocumentViewer to avoid SSR issues
// const DocumentViewer = dynamic(() => import('./DocumentViewer'), {
//     ssr: false,
//     loading: () => (
//         <Box
//             sx={{
//                 width: '100%',
//                 height: '600px',
//                 display: 'flex',
//                 alignItems: 'center',
//                 justifyContent: 'center',
//             }}
//         >
//             <Typography variant="body1" color="text.secondary">
//                 Loading document viewer...
//             </Typography>
//         </Box>
//     ),
// });

// interface DocumentViewerDialogProps {
//     open: boolean;
//     onClose: () => void;
//     fileUrl: string;
//     fileName?: string;
//     title?: string;
//     content?: string;
// }

// export default function DocumentViewerDialog({
//     open,
//     onClose,
//     fileUrl,
//     fileName,
//     title,
//     content
// }: DocumentViewerDialogProps) {

//     return (
//         <Dialog
//             open={open}
//             onClose={onClose}
//             maxWidth="lg"
//             fullWidth
//             PaperProps={{
//                 sx: {
//                     height: '90vh',
//                     maxHeight: '90vh',
//                 },
//             }}
//         >
//             <DialogTitle
//                 sx={{
//                     display: 'flex',
//                     justifyContent: 'space-between',
//                     alignItems: 'center',
//                     borderBottom: '1px solid',
//                     borderColor: 'divider',
//                     py: 2,
//                     px: 3,
//                 }}
//             >
//                     {title || fileName || 'Document Viewer'}

//                 <IconButton
//                     onClick={onClose}
//                     sx={{
//                         ml: 2,
//                         color: 'text.secondary',
//                         '&:hover': {
//                             bgcolor: 'rgba(0, 0, 0, 0.04)',
//                         },
//                     }}
//                 >
//                     <CloseIcon />
//                 </IconButton>
//             </DialogTitle>
//             <DialogContent
//                 sx={{
//                     p: 0,
//                     height: '100%',
//                     overflow: 'hidden',
//                 }}
//             >
//                 <DocumentViewer fileUrl={fileUrl} fileName={fileName} content={content} />
//             </DialogContent>
//         </Dialog>
//     );
// }


'use client';

import { Dialog, DialogContent, DialogTitle, IconButton, Box, Typography } from '@mui/material';
import CloseIcon from '@mui/icons-material/Close';
import dynamic from 'next/dynamic';

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
            <Typography variant="body1" color="text.secondary">
                Loading document viewer...
            </Typography>
        </Box>
    ),
});

const SimpleContractViewer = dynamic(() => import('./SimpleContractViewer'), {
    ssr: false,
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
    signatureImage
}: DocumentViewerDialogProps) {

    return (
        <Dialog
            open={open}
            onClose={onClose}
            maxWidth="lg"
            fullWidth
            PaperProps={{
                sx: {
                    height: '90vh',
                    maxHeight: '90vh',
                },
            }}
        >
            <DialogTitle
                sx={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    borderBottom: '1px solid',
                    borderColor: 'divider',
                    // py: 2,
                    // px: 3,
                }}
            >
                {title || fileName || 'Document Viewer'}

                <IconButton
                    onClick={onClose}
                    sx={{
                        ml: 2,
                        color: 'text.secondary',
                        '&:hover': {
                            bgcolor: 'rgba(0, 0, 0, 0.04)',
                        },
                    }}
                >
                    <CloseIcon />
                </IconButton>
            </DialogTitle>
            <DialogContent
                sx={{
                    p: 0,
                    height: '100%',
                    overflow: 'hidden',
                }}
            >
                {/* Use SimpleContractViewer for contracts, DocumentViewer for templates */}
                {content ? (
                    <SimpleContractViewer
                        content={content}
                        title={title || 'Contract'}
                    />
                ) : (
                    <DocumentViewer
                        fileUrl={fileUrl}
                        fileName={fileName}
                        templateDocxBase64={templateDocxBase64}  // ← ADD THIS
                        fieldValues={fieldValues}  // ← ADD THIS
                    />
                )}

                {/* PRIORITY: Use DocumentViewer with template if available, otherwise SimpleContractViewer */}
                {/* {templateDocxBase64 && fieldValues ? (
                    <DocumentViewer
                        fileUrl={fileUrl}
                        fileName={fileName}
                        content={content}
                        templateDocxBase64={templateDocxBase64}
                        fieldValues={fieldValues}
                    />
                ) : content ? (
                    <SimpleContractViewer
                        content={content}
                        title={title || 'Contract'}
                    />
                ) : (
                    <DocumentViewer
                        fileUrl={fileUrl}
                        fileName={fileName}
                    />
                )} */}
            </DialogContent>
        </Dialog>
    );
}
