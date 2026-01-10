'use client';

import { useEffect, useRef, useState } from 'react';
import WebViewer from '@pdftron/webviewer';
import { contractToHtml } from '@/utils/contractToHtml';
import { contractToDocx } from '@/utils/contractToDocx';
import { fillDocxTemplate } from '@/utils/fillDocxTemplate';


interface DocumentViewerProps {
    fileUrl: string;
    fileName?: string;
    content?: string;
    templateDocxBase64?: string;  // ← Template DOCX file
    fieldValues?: Record<string, string>; // ← Field values to fill
}

export default function DocumentViewer({ fileUrl, fileName, content, templateDocxBase64, fieldValues }: DocumentViewerProps) {
    const viewerDiv = useRef<HTMLDivElement>(null);
    const instance = useRef<any>(null);
    const [isInstanceReady, setIsInstanceReady] = useState(false);

    useEffect(() => {
        if (!viewerDiv.current) return;
        console.log('🔧 Initializing WebViewer...');

        // Initialize WebViewer
        WebViewer(
            {
                path: '/webviewer',
                initialDoc: fileUrl || undefined,
                // licenseKey: 'your-license-key', // Add your license key or use demo mode
                filename: fileName || 'document',
            },
            viewerDiv.current
        ).then((webViewerInstance) => {
            instance.current = webViewerInstance;

            const { UI, Core } = webViewerInstance;

            // Customize UI
            UI.setTheme(UI.Theme.LIGHT);

            // Disable certain features if needed
            UI.disableElements([
                'toolsHeader',
                'pageNavOverlay',
            ]);

            // Enable features
            UI.enableFeatures([UI.Feature.Download]);

            // Listen for document load
            Core.documentViewer.addEventListener('documentLoaded', () => {
                console.log('Document loaded successfully');
            });

            // Mark instance as ready
            setIsInstanceReady(true);
        });

        // Cleanup
        return () => {
            if (instance.current) {
                console.log('🧹 Cleaning up WebViewer instance');
                instance.current = null;
                setIsInstanceReady(false);
            }
        };
    }, []);

    // Load content or fileUrl when they change
    // useEffect(() => {
    //     console.log('🔍 DocumentViewer Load Effect Triggered');
    //     console.log('  - instance.current:', !!instance.current);
    //     console.log('  - content length:', content?.length || 0);
    //     console.log('  - content preview:', content?.substring(0, 100));
    //     console.log('  - fileUrl:', fileUrl);
    //     console.log('  - fileName:', fileName);

    //     if (!isInstanceReady || !instance.current) {
    //         console.log('⏳ Waiting for instance to be ready...');
    //         return;
    //     }

    //     // If content is provided, create a text blob and load it
    //     if (content) {
    //         console.log('✅ Loading content as HTML');

    //         // Convert text content to formatted HTML
    //         const htmlContent = contractToHtml(content, fileName || 'Contract');
    //         console.log('  - HTML content length:', htmlContent.length);

    //         const blob = new Blob([htmlContent], { type: 'text/html' });
    //         const url = URL.createObjectURL(blob);
    //         console.log('  - Blob URL:', url);

    //         instance.current.UI.loadDocument(url, {
    //             filename: (fileName || 'contract') + '.html',
    //             extension: 'html',
    //         });

    //         console.log('  - Document load initiated');

    //         return () => {
    //             console.log('  - Cleaning up blob URL');
    //             URL.revokeObjectURL(url);
    //         };
    //     }
    //     // Otherwise load from fileUrl
    //     else if (fileUrl) {
    //         console.log('✅ Loading from fileUrl');
    //         instance.current.UI.loadDocument(fileUrl, {
    //             filename: fileName,
    //         });
    //     } else {
    //         console.log('⚠️ No content or fileUrl provided');
    //     }
    // }, [isInstanceReady, content, fileUrl, fileName]); // ← Re-run when content/fileUrl changes

    useEffect(() => {
        console.log('🔍 DocumentViewer Load Effect Triggered');
        console.log('  - isInstanceReady:', isInstanceReady);
        console.log('  - templateDocxBase64:', !!templateDocxBase64);
        console.log('  - fieldValues:', fieldValues);
        console.log('  - content length:', content?.length || 0);

        if (!isInstanceReady || !instance.current) {
            console.log('⏳ Waiting for instance to be ready...');
            return;
        }

        // PRIORITY 1: If template DOCX and field values are provided, fill the template
        if (templateDocxBase64 && fieldValues) {
            console.log('✅ Filling DOCX template with field values...');

            fillDocxTemplate(templateDocxBase64, fieldValues)
                .then((docxBlob) => {
                    console.log('  - Filled DOCX created, size:', docxBlob.size);
                    const url = URL.createObjectURL(docxBlob);

                    if (instance.current) {
                        instance.current.UI.loadDocument(url, {
                            filename: fileName || 'contract.docx',
                            extension: 'docx',
                        });

                        console.log('  - Filled DOCX loaded into PDFTron ✅');
                    }

                    return () => URL.revokeObjectURL(url);
                })
                .catch((error) => {
                    console.error('❌ Error filling template:', error);
                });
        }
        // PRIORITY 2: If only content is provided (fallback - old contracts without template)
        else if (content) {
            console.log('⚠️ No template DOCX, converting content to DOCX...');

            contractToDocx(content, fileName || 'Contract')
                .then((docxBlob) => {
                    console.log('  - DOCX blob created, size:', docxBlob.size);
                    const url = URL.createObjectURL(docxBlob);

                    if (instance.current) {
                        instance.current.UI.loadDocument(url, {
                            filename: (fileName || 'contract') + '.docx',
                            extension: 'docx',
                        });

                        console.log('  - DOCX document loaded into PDFTron');
                    }

                    return () => {
                        URL.revokeObjectURL(url);
                    };
                })
                .catch((error) => {
                    console.error('❌ Error creating DOCX:', error);
                });
        }
        // PRIORITY 3: Otherwise load from fileUrl (for template preview)
        else if (fileUrl) {
            console.log('✅ Loading from fileUrl');
            instance.current.UI.loadDocument(fileUrl, {
                filename: fileName,
            });
        } else {
            console.log('⚠️ No content or fileUrl provided');
        }
    }, [isInstanceReady, templateDocxBase64, fieldValues, content, fileUrl, fileName]);

    return (
        <div
            ref={viewerDiv}
            style={{
                width: '100%',
                height: '100%',
                minHeight: '600px',
            }}
        />
    );
}
