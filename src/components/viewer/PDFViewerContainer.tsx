'use client';

import { useRef, useEffect, useState, forwardRef, useImperativeHandle } from 'react';
import { Box, CircularProgress, Alert } from '@mui/material';

interface PDFViewerContainerProps {
    documentUrl?: string;
    xfdfString?: string;
    readOnly?: boolean;
    onDocumentLoaded?: () => void;
    onError?: (error: string) => void;
}

export interface PDFViewerHandle {
    exportAnnotations: () => Promise<string>;
    dispose: () => void;
}

const PDFViewerContainer = forwardRef<PDFViewerHandle, PDFViewerContainerProps>(
    ({ documentUrl, xfdfString, readOnly = false, onDocumentLoaded, onError }, ref) => {
        const viewerDiv = useRef<HTMLDivElement>(null);
        const viewerInstance = useRef<any>(null);
        const [loading, setLoading] = useState(true);
        const [error, setError] = useState<string>('');

        // Manual annotation storage to work around PDFTron losing annotations
        const manualAnnotations = useRef<any[]>([]);

        useImperativeHandle(ref, () => ({
            /**
             * Export annotations as XFDF string
             */
            exportAnnotations: async () => {
                if (!viewerInstance.current) {
                    console.error('❌ Cannot export: Viewer instance not initialized');
                    return null;
                }

                try {
                    const { Core } = viewerInstance.current;
                    const annotationManager = Core.annotationManager;

                    console.log('📦 Manually stored annotations:', manualAnnotations.current.length);

                    // Add manually stored annotations back to the manager
                    if (manualAnnotations.current.length > 0) {
                        console.log('➕ Adding manually stored annotations to manager...');
                        manualAnnotations.current.forEach((annot: any) => {
                            try {
                                // Check if annotation is already in the manager
                                const existing = annotationManager.getAnnotationById(annot.Id);
                                if (!existing) {
                                    annotationManager.addAnnotation(annot);
                                    console.log('✅ Added annotation:', annot.Id);
                                }
                            } catch (e) {
                                console.warn('Failed to add annotation:', e);
                            }
                        });

                        // Force redraw
                        annotationManager.drawAnnotationsFromList(manualAnnotations.current);
                    }

                    // Get all annotations including selected ones
                    const annotations = annotationManager.getAnnotationsList();
                    const selectedAnnotations = annotationManager.getSelectedAnnotations();

                    console.log('📊 Selected annotations:', selectedAnnotations.length);

                    // Get form field values
                    const fieldManager = annotationManager.getFieldManager();
                    const fields = fieldManager.getFields();
                    const formFieldsWithValues = [];

                    for (const fieldName in fields) {
                        const field = fields[fieldName];
                        const value = field.getValue();
                        if (value) {
                            formFieldsWithValues.push({ name: fieldName, value });
                        }
                    }

                    console.log('📤 Exporting annotations and form data...');
                    console.log('📊 Total annotations in document:', annotations.length);
                    console.log('📊 Total filled form fields:', formFieldsWithValues.length);
                    console.log('📝 Form field values:', formFieldsWithValues);
                    console.log('📊 Annotation details:', annotations.map((a: any) => ({
                        type: a.Subject,
                        content: a.getContents(),
                        id: a.Id,
                        className: a.constructor.name
                    })));

                    if (annotations.length === 0 && formFieldsWithValues.length === 0) {
                        console.warn('⚠️ WARNING: No annotations OR form fields found to export!');
                        console.warn('⚠️ This means the XFDF will be empty');
                    }

                    // Force a redraw to ensure all annotations are committed
                    console.log('🔄 Drawing annotations to ensure they are committed...');
                    if (annotations.length > 0) {
                        annotationManager.drawAnnotationsFromList(annotations);
                    }

                    // Wait a moment for draw to complete
                    await new Promise(resolve => setTimeout(resolve, 200));

                    // Export ALL annotations including widgets
                    const xfdfString = await annotationManager.exportAnnotations();

                    console.log('✅ XFDF exported (ALL annotations)');
                    console.log('📋 XFDF length:', xfdfString.length);
                    console.log('📋 XFDF preview:', xfdfString.substring(0, 500));
                    console.log('📋 Full XFDF:', xfdfString);

                    return xfdfString;
                } catch (error) {
                    console.error('❌ Error exporting annotations:', error);
                    return null;
                }
            },
            dispose: () => {
                if (viewerInstance.current) {
                    try {
                        viewerInstance.current.UI.dispose();
                    } catch (e) {
                        // console.log('Cleanup:', e);
                    }
                    viewerInstance.current = null;
                }
            },
        }));

        useEffect(() => {
            const initializeViewer = async () => {
                if (!viewerDiv.current || viewerInstance.current) return;

                try {
                    setLoading(true);
                    setError('');

                    // Dynamically import WebViewer
                    const WebViewerModule = await import('@pdftron/webviewer');
                    const WebViewer = WebViewerModule.default;

                    const instance = await WebViewer(
                        {
                            path: '/webviewer',
                            licenseKey: process.env.NEXT_PUBLIC_PDFTRON_LICENSE_KEY,
                        },
                        viewerDiv.current
                    );

                    viewerInstance.current = instance;
                    const { UI, Core } = instance;

                    // Configure for our use case
                    UI.setTheme(UI.Theme.LIGHT);

                    if (readOnly) {
                        // Read-only mode for viewing filled contracts
                        UI.disableFeatures([
                            UI.Feature.Annotations,
                            UI.Feature.FilePicker,
                            UI.Feature.Print,
                            UI.Feature.Download,
                        ]);
                    } else {
                        // Editing mode - show annotation toolbar
                        // Set toolbar to show annotation tools
                        UI.setToolbarGroup('toolbarGroup-Annotate');

                        // Enable all necessary features for annotation
                        UI.enableFeatures([
                            UI.Feature.Annotations,
                            UI.Feature.TextSelection,
                            UI.Feature.NotesPanel,
                        ]);

                        console.log('📝 Annotation toolbar enabled');

                        // Listen for annotation changes and manually store them
                        Core.annotationManager.addEventListener('annotationChanged', (annotations: any, action: string) => {
                            console.log('🎨 Annotation changed:', {
                                action,
                                count: annotations.length,
                                types: annotations.map((a: any) => a.constructor.name)
                            });

                            // Manually store annotations when added
                            if (action === 'add') {
                                annotations.forEach((annot: any) => {
                                    // Check if not already stored
                                    const exists = manualAnnotations.current.find((a: any) => a.Id === annot.Id);
                                    if (!exists) {
                                        console.log('💾 Manually storing annotation:', annot.Id);
                                        manualAnnotations.current.push(annot);
                                    }
                                });
                                console.log('📦 Total manually stored annotations:', manualAnnotations.current.length);
                            }

                            // Remove from manual storage when deleted
                            if (action === 'delete') {
                                annotations.forEach((annot: any) => {
                                    const index = manualAnnotations.current.findIndex((a: any) => a.Id === annot.Id);
                                    if (index > -1) {
                                        console.log('🗑️ Removing annotation from manual storage:', annot.Id);
                                        manualAnnotations.current.splice(index, 1);
                                    }
                                });
                            }
                        });
                    }

                    // Listen for document load
                    Core.documentViewer.addEventListener('documentLoaded', async () => {
                        console.log('✅ Document loaded in PDFTron');
                        console.log('📋 XFDF String provided:', !!xfdfString);
                        console.log('📋 XFDF Length:', xfdfString?.length || 0);
                        console.log('📋 XFDF Preview:', xfdfString?.substring(0, 200));

                        // Import XFDF if provided (for viewing filled contracts)
                        if (xfdfString) {
                            try {
                                console.log('🔄 Attempting to import XFDF annotations...');
                                await Core.annotationManager.importAnnotations(xfdfString);
                                console.log('✅ XFDF annotations imported successfully!');

                                // Check how many annotations were imported
                                const annotations = Core.annotationManager.getAnnotationsList();
                                console.log('📊 Total annotations imported:', annotations.length);
                                console.log('📊 Annotation types:', annotations.map(a => a.Subject || a.getContents()));

                            } catch (err) {
                                console.error('❌ Error importing XFDF:', err);
                                console.error('❌ XFDF that failed:', xfdfString);
                            }
                        } else {
                            console.log('⚠️ No XFDF string provided - skipping import');
                        }

                        setLoading(false);
                        if (onDocumentLoaded) onDocumentLoaded();
                    });

                    console.log('✅ PDFTron WebViewer initialized');

                    // Load initial document if provided
                    if (documentUrl) {
                        console.log('📄 Loading initial document:', documentUrl);
                        await UI.loadDocument(documentUrl);
                    } else {
                        // No document to load, stop loading state
                        setLoading(false);
                    }
                } catch (err: any) {
                    console.error('❌ Error initializing PDFTron:', err);
                    const errorMsg = 'Failed to initialize PDF viewer';
                    setError(errorMsg);
                    setLoading(false);
                    if (onError) onError(errorMsg);
                }
            };

            initializeViewer();

            // Cleanup on unmount
            return () => {
                if (viewerInstance.current) {
                    try {
                        viewerInstance.current.UI.dispose();
                    } catch (e) {
                        // console.log('Cleanup:', e);
                    }
                    viewerInstance.current = null;
                }
            };
        }, []); // Only run once on mount

        // Load document when URL changes
        useEffect(() => {
            if (documentUrl && viewerInstance.current) {
                const loadDocument = async () => {
                    try {
                        setLoading(true);
                        console.log('📄 Loading document:', documentUrl);
                        const { UI } = viewerInstance.current;
                        await UI.loadDocument(documentUrl);
                    } catch (err) {
                        console.error('Error loading document:', err);
                        const errorMsg = 'Failed to load document';
                        setError(errorMsg);
                        if (onError) onError(errorMsg);
                    }
                };
                loadDocument();
            }
        }, [documentUrl]);

        return (
            <Box sx={{ position: 'relative', width: '100%', height: '100%' }}>
                <Box
                    ref={viewerDiv}
                    sx={{
                        width: '100%',
                        height: '100%',
                        minHeight: 600,
                    }}
                />

                {loading && (
                    <Box
                        sx={{
                            position: 'absolute',
                            top: 0,
                            left: 0,
                            right: 0,
                            bottom: 0,
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            bgcolor: 'rgba(255, 255, 255, 0.9)',
                            zIndex: 10,
                        }}
                    >
                        <CircularProgress />
                    </Box>
                )}

                {error && (
                    <Box sx={{ position: 'absolute', top: 16, left: 16, right: 16, zIndex: 11 }}>
                        <Alert severity="error">{error}</Alert>
                    </Box>
                )}
            </Box>
        );
    }
);

PDFViewerContainer.displayName = 'PDFViewerContainer';

export default PDFViewerContainer;
