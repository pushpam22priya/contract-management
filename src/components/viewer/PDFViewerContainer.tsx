'use client';

import { useRef, useEffect, useState, forwardRef, useImperativeHandle } from 'react';
import { Box, CircularProgress, Fab, Tooltip } from '@mui/material';
import NavigateNextIcon from '@mui/icons-material/NavigateNext';

interface PDFViewerContainerProps {
    documentUrl?: string;
    initialXfdf?: string;
    readOnly?: boolean;
    isReadOnly?: boolean;
    onSave?: (fileData: string, xfdfData: string) => void;
    onDocumentLoaded?: () => void;
    onError?: (error: string) => void;
    onDocumentModified?: () => void;
    // Legacy props (ignored but kept for backward compatibility)
    commentsOnly?: boolean;
    clientSigningMode?: boolean;
    templateFormFields?: any[];
    formFields?: any[];
    currentUserRole?: 'contractor' | 'client';
    onFieldChange?: (fieldName: string, value: any) => void;
    canAddFormFields?: boolean;
    editableFieldMode?: 'all' | 'empty-only' | 'none'; // Controls which fields are editable
    toolbarMode?: 'forms' | 'annotations' | 'all';
    defaultToolbar?: 'view' | 'annotate' | 'insert';
    initialToolbarGroup?: string; // ✅ New prop for controlling initial toolbar
    showAnnotationNavigation?: boolean; // ✅ Show floating navigation button for annotations
}

export interface PDFViewerHandle {
    exportAnnotations: (fieldValues?: Record<string, string>, options?: { flatten?: boolean }) => Promise<{ blob: Blob; xfdfString: string } | null>;
    exportFormFields: () => Promise<any[]>;
    clearSignatureStore: () => void;
    dispose: () => void;
    save: () => Promise<{ fileData: string; xfdfData: string } | null>;
    setToolbarGroup: (group: string) => void;
    setToolMode: (mode: string) => void;
}

const PDFViewerContainer = forwardRef<PDFViewerHandle, PDFViewerContainerProps>(
    ({ documentUrl, initialXfdf, readOnly, isReadOnly, onSave, onDocumentLoaded, onDocumentModified, onError, editableFieldMode = 'all', initialToolbarGroup, showAnnotationNavigation = false }, ref) => {
        const viewerDiv = useRef<HTMLDivElement>(null);
        const viewerInstance = useRef<any>(null);
        const [loading, setLoading] = useState(true);
        const [error, setError] = useState<string>('');
        const loadTimeoutRef = useRef<NodeJS.Timeout | null>(null);
        const initialLoadDone = useRef(false);
        const autoSaveTimeoutRef = useRef<NodeJS.Timeout | null>(null);
        const hasUnsavedChanges = useRef(false);

        // ✅ Annotation Navigation State
        const [annotations, setAnnotations] = useState<any[]>([]);
        const [currentAnnotationIndex, setCurrentAnnotationIndex] = useState(0);
        const [showNavButton, setShowNavButton] = useState(false);
        // ✅ CRITICAL FIX: Store fieldMetadataStore as a component-level ref
        // This ensures the same Map instance persists throughout the component lifecycle
        const fieldMetadataStoreRef = useRef<Map<string, any>>(new Map());

        // ✅ CRITICAL FIX: Store signature annotations separately
        // WebViewer 11's appearance mode deletes FreeHand signatures after applying to widget
        // We capture them here and re-add before export
        const capturedSignatureAnnotationsRef = useRef<Map<string, any>>(new Map());

        // ✅ CRITICAL FIX: Store text field values when they change
        // field.getValue() may return empty at export time if the blur event hasn't been processed
        // We capture values in fieldChanged listener and re-apply before export
        const capturedFieldValuesRef = useRef<Map<string, string>>(new Map());

        const effectiveReadOnly = isReadOnly ?? readOnly;

        // ✅ Helper function to get form field annotations (accessible throughout component)
        const getFormFieldAnnotations = (Core: any) => {
            if (!Core?.annotationManager) return [];

            const annotationManager = Core.annotationManager;
            const allAnnotations = annotationManager.getAnnotationsList();

            // Filter for widget annotations (form fields) and sort by page then position
            const formAnnotations = allAnnotations
                .filter((annot: any) => annot instanceof Core.Annotations.WidgetAnnotation)
                .sort((a: any, b: any) => {
                    // Sort by page number first
                    if (a.PageNumber !== b.PageNumber) {
                        return a.PageNumber - b.PageNumber;
                    }
                    // Then by Y position (top to bottom)
                    return a.Y - b.Y;
                });

            return formAnnotations;
        };

        useImperativeHandle(ref, () => ({
            exportAnnotations: async (fieldValues?: Record<string, string>, options?: { flatten?: boolean }) => {
                if (!viewerInstance.current) {
                    console.error('Cannot export: Viewer instance not initialized');
                    return null;
                }

                try {
                    const { Core, UI } = viewerInstance.current;
                    const documentViewer = Core.documentViewer;
                    const annotationManager = Core.annotationManager;
                    const fieldManager = annotationManager.getFieldManager();
                    const doc = documentViewer.getDocument();

                    if (!doc) {
                        console.error('Cannot export: Document not loaded');
                        return null;
                    }

                    // ══════════════════════════════════════════════════════════════════
                    // PRE-EXPORT: Force PDFTron to commit any pending annotations
                    // CRITICAL: ALL steps execute WITHOUT exceptions - no conditional checks
                    // ══════════════════════════════════════════════════════════════════
                    console.log('═══════════════════════════════════════════════════════════════════');
                    console.log('🔄 [PRE-EXPORT COMMIT] Starting pending changes commit process...');
                    console.log('═══════════════════════════════════════════════════════════════════');

                    // Step 1: Programmatically select a different tool to deselect active annotation
                    console.log('📌 [PRE-EXPORT COMMIT] Step 1: Selecting different tool to deselect active annotation...');
                    try {
                        UI.setToolMode('AnnotationEdit');
                        console.log('✅ [PRE-EXPORT COMMIT] Switched to AnnotationEdit tool');
                    } catch (e) {
                        console.error('❌ [PRE-EXPORT COMMIT] Step 1 failed:', e);
                    }

                    // Step 2: Deselect all active annotations to finalize any in-progress edits
                    console.log('📌 [PRE-EXPORT COMMIT] Step 2: Deselecting all annotations...');
                    try {
                        annotationManager.deselectAllAnnotations();
                        console.log('✅ [PRE-EXPORT COMMIT] All annotations deselected');
                    } catch (e) {
                        console.error('❌ [PRE-EXPORT COMMIT] Step 2 failed:', e);
                    }

                    // Step 3: Switch to Pan tool to finalize form field creation
                    console.log('📌 [PRE-EXPORT COMMIT] Step 3: Switching to Pan tool...');
                    try {
                        UI.setToolMode('Pan');
                        console.log('✅ [PRE-EXPORT COMMIT] Switched to Pan tool');
                    } catch (e) {
                        console.error('❌ [PRE-EXPORT COMMIT] Step 3 failed:', e);
                    }

                    // Step 3b: CRITICAL - Restore captured field values before commit
                    // field.getValue() may return empty if blur hasn't been processed
                    // We restore values from our capture store before committing
                    console.log('📌 [PRE-EXPORT COMMIT] Step 3b: Restoring captured field values...');
                    try {
                        const capturedCount = capturedFieldValuesRef.current.size;
                        console.log(`📝 [RESTORE VALUES] Found ${capturedCount} captured field values`);

                        if (capturedCount > 0) {
                            const allFields = fieldManager.getFields() || [];
                            const fieldsArray = Array.isArray(allFields) ? allFields : Array.from(allFields);
                            let restoredCount = 0;

                            capturedFieldValuesRef.current.forEach((capturedValue, fieldName) => {
                                // Find the field by name
                                const field = fieldsArray.find((f: any) => f.name === fieldName);
                                if (field && capturedValue) {
                                    try {
                                        const currentValue = field.getValue ? field.getValue() : '';

                                        // Only restore if current value is empty but we have a captured value
                                        if ((!currentValue || currentValue === '') && capturedValue !== '') {
                                            console.log(`📝 [RESTORE VALUES] Restoring: ${fieldName} = "${capturedValue}" (was empty)`);

                                            if (field.setValue && typeof field.setValue === 'function') {
                                                field.setValue(capturedValue);
                                                restoredCount++;
                                            }
                                        } else if (currentValue && currentValue !== '') {
                                            console.log(`📝 [RESTORE VALUES] Field ${fieldName} already has value: "${currentValue}"`);
                                        }
                                    } catch (fieldError) {
                                        console.warn(`⚠️ [RESTORE VALUES] Failed to restore ${fieldName}:`, fieldError);
                                    }
                                }
                            });

                            console.log(`✅ [RESTORE VALUES] Restored ${restoredCount} field values`);
                        }
                    } catch (e) {
                        console.error('❌ [PRE-EXPORT COMMIT] Step 3b failed:', e);
                    }

                    // Step 4: Commit all form field values using field.commit() (Apryse API)
                    console.log('📌 [PRE-EXPORT COMMIT] Step 4: Committing all form field values...');
                    try {
                        const allFields = fieldManager.getFields() || [];
                        const fieldsArray = Array.isArray(allFields) ? allFields : Array.from(allFields);

                        console.log(`📝 [PRE-EXPORT COMMIT] Found ${fieldsArray.length} fields to commit`);

                        let committedCount = 0;
                        fieldsArray.forEach((field: any) => {
                            try {
                                const currentValue = field.getValue ? field.getValue() : field.value;
                                const widgets = field.widgets || [];

                                if (field.commit && typeof field.commit === 'function') {
                                    if (widgets.length > 0) {
                                        field.commit(currentValue, widgets[0]);
                                    } else {
                                        field.commit(currentValue);
                                    }
                                    committedCount++;
                                }
                            } catch (fieldError) {
                                console.warn(`⚠️ [PRE-EXPORT COMMIT] Failed to commit field ${field.name}:`, fieldError);
                            }
                        });

                        console.log(`✅ [PRE-EXPORT COMMIT] Successfully committed ${committedCount}/${fieldsArray.length} field values`);
                    } catch (e) {
                        console.error('❌ [PRE-EXPORT COMMIT] Step 4 failed:', e);
                    }

                    // Step 4b: Explicitly refresh signature widget appearances
                    // ✅ CRITICAL FIX: Signature fields need their appearances regenerated to capture visual data
                    console.log('📌 [PRE-EXPORT COMMIT] Step 4b: Refreshing signature widget appearances...');
                    try {
                        const allAnnotations = annotationManager.getAnnotationsList();
                        let signatureWidgetsUpdated = 0;
                        let linkedAnnotationsAdded = 0;

                        for (const annot of allAnnotations) {
                            // Check if this is a signature widget
                            const isSignatureWidget =
                                annot instanceof Core.Annotations.SignatureWidgetAnnotation ||
                                (annot instanceof Core.Annotations.WidgetAnnotation &&
                                    (annot.getField?.()?.type === 'Sig' ||
                                        (annot as any).fieldName?.includes('Signature')));

                            if (isSignatureWidget) {
                                try {
                                    // ✅ CRITICAL FIX: In WebViewer 11, when using ANNOTATION mode,
                                    // the signature annotation is linked to the widget via the 'annot' property
                                    // but may not be in the main annotation list. We need to explicitly add it.
                                    const linkedAnnotation = (annot as any).annot;
                                    if (linkedAnnotation) {
                                        console.log(`🖊️ [SIGNATURE] Found linked annotation for: ${(annot as any).fieldName}`);
                                        console.log(`🖊️ [SIGNATURE] Linked annot type: ${linkedAnnotation.constructor?.name}`);

                                        // Check if this annotation is already in the list
                                        const existingAnnotations = annotationManager.getAnnotationsList();
                                        const alreadyExists = existingAnnotations.some((a: any) => a === linkedAnnotation);

                                        if (!alreadyExists) {
                                            console.log(`🖊️ [SIGNATURE] Adding linked annotation to annotation manager...`);
                                            annotationManager.addAnnotation(linkedAnnotation, { imported: true, isUndoRedo: false });
                                            annotationManager.drawAnnotationsFromList([linkedAnnotation]);
                                            linkedAnnotationsAdded++;
                                        } else {
                                            console.log(`🖊️ [SIGNATURE] Linked annotation already in list`);
                                        }
                                    }

                                    // Method 1: Try refreshAppearance if available (regenerates appearance stream)
                                    if (typeof (annot as any).refreshAppearance === 'function') {
                                        await (annot as any).refreshAppearance();
                                        console.log(`🖊️ [SIGNATURE] Refreshed appearance for: ${(annot as any).fieldName || 'unknown'}`);
                                    }

                                    // Method 2: Force update the annotation to regenerate appearance
                                    annotationManager.updateAnnotation(annot);

                                    // Method 3: If the signature has been signed, ensure appearance is generated
                                    const field = (annot as any).getField?.();
                                    if (field) {
                                        const signatureValue = field.getValue?.();
                                        if (signatureValue) {
                                            console.log(`🖊️ [SIGNATURE] Field ${field.name} has value, updating widget...`);
                                            // Force widget to regenerate its appearance
                                            if (typeof (annot as any).setAppearance === 'function') {
                                                // Get current appearance and re-set it to force regeneration
                                                const currentAppearance = (annot as any).getAppearance?.('Normal');
                                                if (currentAppearance) {
                                                    (annot as any).setAppearance('Normal', currentAppearance);
                                                }
                                            }
                                        }
                                    }

                                    signatureWidgetsUpdated++;
                                } catch (sigError) {
                                    console.warn(`⚠️ [SIGNATURE] Failed to refresh signature widget:`, sigError);
                                }
                            }
                        }

                        console.log(`✅ [PRE-EXPORT COMMIT] Refreshed ${signatureWidgetsUpdated} signature widget appearances`);
                        console.log(`✅ [PRE-EXPORT COMMIT] Added ${linkedAnnotationsAdded} linked signature annotations`);

                        // Log updated annotation count
                        const updatedCount = annotationManager.getAnnotationsList().length;
                        console.log(`📊 [PRE-EXPORT COMMIT] Updated annotation count: ${updatedCount}`);
                    } catch (e) {
                        console.error('❌ [PRE-EXPORT COMMIT] Step 4b failed:', e);
                    }

                    // Step 5: Refresh document viewer to reflect all changes
                    console.log('📌 [PRE-EXPORT COMMIT] Step 5: Refreshing document viewer...');
                    try {
                        if (documentViewer.refreshAll && typeof documentViewer.refreshAll === 'function') {
                            documentViewer.refreshAll();
                            console.log('✅ [PRE-EXPORT COMMIT] Document viewer refreshed with refreshAll()');
                        } else if (documentViewer.updateView && typeof documentViewer.updateView === 'function') {
                            documentViewer.updateView();
                            console.log('✅ [PRE-EXPORT COMMIT] Document viewer refreshed with updateView()');
                        } else {
                            console.log('⚠️ [PRE-EXPORT COMMIT] No refresh method available, relying on redraw in Step 6');
                        }
                    } catch (e) {
                        console.error('❌ [PRE-EXPORT COMMIT] Step 5 failed:', e);
                    }

                    // Step 6: Force redraw to commit annotations
                    console.log('📌 [PRE-EXPORT COMMIT] Step 6: Redrawing annotations...');
                    try {
                        annotationManager.drawAnnotationsFromList(annotationManager.getAnnotationsList());
                        console.log('✅ [PRE-EXPORT COMMIT] Annotations redrawn');
                    } catch (e) {
                        console.error('❌ [PRE-EXPORT COMMIT] Step 6 failed:', e);
                    }

                    // Step 7: Wait for PDFTron to process all changes
                    console.log('📌 [PRE-EXPORT COMMIT] Step 7: Waiting for PDFTron processing...');
                    try {
                        await new Promise(resolve => setTimeout(resolve, 300));
                        console.log('✅ [PRE-EXPORT COMMIT] Processing wait completed');
                    } catch (e) {
                        console.error('❌ [PRE-EXPORT COMMIT] Step 7 failed:', e);
                    }

                    // Step 8: Trigger any pending updates
                    console.log('📌 [PRE-EXPORT COMMIT] Step 8: Triggering pending updates...');
                    try {
                        annotationManager.trigger('annotationChanged', [[], 'render', {}]);
                        console.log('✅ [PRE-EXPORT COMMIT] Pending updates triggered');
                    } catch (e) {
                        console.error('❌ [PRE-EXPORT COMMIT] Step 8 failed:', e);
                    }

                    console.log('═══════════════════════════════════════════════════════════════════');
                    console.log('✅ [PRE-EXPORT COMMIT] All changes committed successfully!');
                    console.log('═══════════════════════════════════════════════════════════════════');

                    // Step 9: CRITICAL - Restore captured signature annotations
                    // WebViewer 11's appearance mode deletes FreeHand annotations after applying
                    // We restore them from our capture store before export
                    console.log('📌 [PRE-EXPORT COMMIT] Step 9: Restoring captured signature annotations...');
                    try {
                        const capturedCount = capturedSignatureAnnotationsRef.current.size;
                        console.log(`🖊️ [RESTORE] Found ${capturedCount} captured signature annotations`);

                        if (capturedCount > 0) {
                            let restoredCount = 0;
                            const currentAnnotations = annotationManager.getAnnotationsList();

                            capturedSignatureAnnotationsRef.current.forEach((capturedData, annotId) => {
                                const annotation = capturedData.annotation;

                                // Check if this annotation is already in the document
                                const alreadyExists = currentAnnotations.some((a: any) =>
                                    a === annotation || a.Id === annotId
                                );

                                // ✅ FIX: Verify the annotation is still valid and not a ghost
                                let isValid = true;
                                if (annotation.PageNumber === 0 || annotation.PageNumber > doc.getPageCount()) {
                                    isValid = false;
                                    console.warn(`⚠️ [RESTORE] Skipping invalid/ghost annotation (Page=${annotation.PageNumber})`);
                                }

                                if (!alreadyExists && annotation && isValid) {
                                    console.log(`🖊️ [RESTORE] Restoring: ${capturedData.type} (ID: ${annotId})`);

                                    // Re-add the annotation to the document
                                    annotationManager.addAnnotation(annotation, { imported: true, isUndoRedo: false });
                                    restoredCount++;
                                } else if (alreadyExists) {
                                    console.log(`🖊️ [RESTORE] Already exists: ${capturedData.type} (ID: ${annotId})`);
                                }
                            });

                            if (restoredCount > 0) {
                                // Redraw restored annotations
                                annotationManager.drawAnnotationsFromList(
                                    Array.from(capturedSignatureAnnotationsRef.current.values())
                                        .map(d => d.annotation)
                                        .filter(Boolean)
                                );
                                console.log(`✅ [RESTORE] Restored ${restoredCount} signature annotations`);
                            }

                            // Log updated annotation count
                            const updatedCount = annotationManager.getAnnotationsList().length;
                            console.log(`📊 [RESTORE] Updated annotation count after restore: ${updatedCount}`);
                        }
                    } catch (e) {
                        console.error('❌ [PRE-EXPORT COMMIT] Step 9 failed:', e);
                    }

                    // ✅ SANITATION STEP: Filter out invalid/ghost annotations before export
                    console.log('🧹 [EXPORT] Sanitizing annotations...');
                    try {
                        const allAnnots = annotationManager.getAnnotationsList();
                        const ghostAnnots = allAnnots.filter((a: any) => {
                            // Skip sanitization for form field widgets - they should always be preserved
                            const isWidget = a instanceof Core.Annotations.WidgetAnnotation ||
                                a.elementName === 'widget' ||
                                a.Subject === 'Widget';
                            if (isWidget) {
                                return false; // Never treat widgets as ghost annotations
                            }

                            // Detect ghost annotations:
                            // 1. Missing or invalid PageNumber (0 or > total pages)
                            // 2. Missing Rect or invalid coordinates (if we want to be strict)
                            const pageCount = doc.getPageCount();
                            const isInvalidPage = !a.PageNumber || a.PageNumber < 1 || a.PageNumber > pageCount;

                            // Check for detached annotations (no valid rect)
                            // const hasNoRect = !a.X && !a.Y && !a.Width && !a.Height; // This might be too strict for some types

                            return isInvalidPage;
                        });

                        if (ghostAnnots.length > 0) {
                            console.warn(`⚠️ [EXPORT] Found ${ghostAnnots.length} ghost/invalid annotations. Removing...`);
                            annotationManager.deleteAnnotations(ghostAnnots, { force: true, isUndoRedo: false });
                            console.log('✅ [EXPORT] Removed ghost annotations');
                        }
                    } catch (e) {
                        console.warn('⚠️ [EXPORT] Sanitation warning:', e);
                    }

                    // Export XFDF with all annotations
                    console.log('📤 [EXPORT] Starting XFDF export...');
                    console.log(`📤 [EXPORT] Current annotation count: ${annotationManager.getAnnotationsList().length}`);

                    // ✅ CRITICAL: Log signature annotations specifically before export
                    const allAnnotationsForExport = annotationManager.getAnnotationsList();
                    const signatureAnnotations = allAnnotationsForExport.filter((annot: any) =>
                        annot instanceof Core.Annotations.SignatureWidgetAnnotation ||
                        annot instanceof Core.Annotations.FreeHandAnnotation ||
                        (annot instanceof Core.Annotations.StampAnnotation &&
                            (annot as any).Subject?.includes('Signature'))
                    );
                    console.log(`🖊️ [EXPORT] Signature-related annotations found: ${signatureAnnotations.length}`);
                    signatureAnnotations.forEach((annot: any, idx: number) => {
                        const hasAppearance = !!(annot as any).getAppearance?.('Normal');
                        console.log(`🖊️ [SIGNATURE #${idx + 1}] Type: ${annot.constructor.name}, ` +
                            `FieldName: ${(annot as any).fieldName || 'N/A'}, ` +
                            `HasAppearance: ${hasAppearance}, ` +
                            `Subject: ${(annot as any).Subject || 'N/A'}`);
                    });

                    // ✅ SAFE EXPORT: Try normal export with fallbacks
                    let xfdfString = '';
                    try {
                        // PRIMARY ATTEMPT: With inline appearances (best visual fidelity)
                        xfdfString = await annotationManager.exportAnnotations({
                            widgets: true,
                            fields: true,
                            links: true,
                            generateInlineAppearances: true
                        });
                        console.log(`✅ [EXPORT] Primary export successful: ${xfdfString.length} chars`);
                    } catch (primaryExportError: any) {
                        console.error('❌ [EXPORT] Primary export (inline apps) failed:', primaryExportError);

                        // FALLBACK ATTEMPT: Without inline appearances
                        // Use this if "Can not find any annotation" error occurs in PDFWorker during appearance generation
                        console.log('⚠️ [EXPORT] Attempting fallback export (no inline appearances)...');
                        try {
                            xfdfString = await annotationManager.exportAnnotations({
                                widgets: true,
                                fields: true,
                                links: true,
                                generateInlineAppearances: false // Disable appearance generation to bypass worker errors
                            });
                            console.log(`✅ [EXPORT] Fallback export successful: ${xfdfString.length} chars`);
                        } catch (fallbackError) {
                            console.error('❌ [EXPORT] Fallback export also failed:', fallbackError);
                            // Ensure we return null if absolutely everything fails
                            return null;
                        }
                    }

                    // ✅ Check if XFDF contains appearance data for signatures
                    const hasAppearanceData = xfdfString.includes('appearance=') || xfdfString.includes('<appearance');
                    const hasStampAnnot = xfdfString.includes('stamp') || xfdfString.includes('Stamp');
                    const hasFreeHand = xfdfString.includes('ink') || xfdfString.includes('Ink');
                    const hasFieldValue = xfdfString.includes('<field') && xfdfString.includes('value=');
                    console.log(`📤 [EXPORT] XFDF Analysis: hasAppearance=${hasAppearanceData}, hasStamp=${hasStampAnnot}, hasFreeHand=${hasFreeHand}, hasFieldValue=${hasFieldValue}`);

                    // ✅ DEBUG: Log all field values before export
                    console.log('📝 [EXPORT] Field values before getFileData:');
                    const allFieldsForExport = fieldManager.getFields() || [];
                    const fieldsArrayForExport = Array.isArray(allFieldsForExport) ? allFieldsForExport : Array.from(allFieldsForExport);
                    fieldsArrayForExport.forEach((field: any) => {
                        const value = field.getValue ? field.getValue() : (field.value || 'N/A');
                        const type = field.type || field.getFieldType?.() || 'unknown';
                        console.log(`  📋 ${field.name} (${type}): "${value}"`);
                    });

                    // ✅ DEBUG: Log flatten option
                    const flattenOption = options?.flatten ?? false;
                    console.log(`📤 [EXPORT] Calling getFileData with flatten=${flattenOption}`);

                    // Get file data
                    const data = await doc.getFileData({
                        xfdfString,
                        flatten: flattenOption
                    });

                    const arr = new Uint8Array(data);
                    const blob = new Blob([arr], { type: 'application/pdf' });

                    console.log(`✅ PDF exported: ${blob.size} bytes (flatten=${flattenOption})`);

                    return { blob, xfdfString };
                } catch (error) {
                    console.error('❌ Error during export:', error);
                    return null;
                }
            },

            exportFormFields: async () => {
                console.log('🔍 [EXPORT] exportFormFields called');
                console.log('🔍 [EXPORT] fieldMetadataStoreRef.current size:', fieldMetadataStoreRef.current.size);

                try {
                    // ══════════════════════════════════════════════════════════════════
                    // ✅ RECONCILIATION PASS: Ensure all fields from FieldManager are captured
                    // This catches fields that may have been missed by annotationChanged events
                    // ══════════════════════════════════════════════════════════════════
                    if (viewerInstance.current) {
                        const { Core } = viewerInstance.current;
                        const annotationManager = Core.annotationManager;
                        const fieldManager = annotationManager.getFieldManager();

                        const allFields = fieldManager.getFields() || [];
                        const fieldsArray = Array.isArray(allFields) ? allFields : Array.from(allFields);

                        console.log(`📊 [EXPORT] Reconciling ${fieldsArray.length} fields from FieldManager`);

                        fieldsArray.forEach((field: any) => {
                            const fieldName = field.name;
                            if (!fieldName) return;

                            const currentValue = field.getValue ? field.getValue() : field.value || '';
                            const widgets = field.widgets || [];
                            const widget = widgets[0];

                            if (!fieldMetadataStoreRef.current.has(fieldName)) {
                                // Field exists in FieldManager but not in our store - add it
                                const metadata = {
                                    name: fieldName,
                                    type: field.type || 'text',
                                    value: currentValue,
                                    flags: {
                                        ReadOnly: field.flags?.ReadOnly || false,
                                        Required: field.flags?.Required || false,
                                        Multiline: field.flags?.Multiline || false,
                                    },
                                    widget: widget ? {
                                        pageNumber: widget.PageNumber,
                                        rect: widget.getRect ? {
                                            x1: widget.getRect().x1,
                                            y1: widget.getRect().y1,
                                            x2: widget.getRect().x2,
                                            y2: widget.getRect().y2,
                                        } : null,
                                    } : null,
                                    reconciled: true,
                                    created: new Date().toISOString(),
                                };

                                fieldMetadataStoreRef.current.set(fieldName, metadata);
                                console.log(`📝 [RECONCILE] Added missing field: ${fieldName}, type: ${metadata.type}`);
                            } else {
                                // Field exists - update value from FieldManager (source of truth)
                                const existing = fieldMetadataStoreRef.current.get(fieldName);
                                fieldMetadataStoreRef.current.set(fieldName, {
                                    ...existing,
                                    value: currentValue,
                                    lastUpdated: new Date().toISOString(),
                                });
                            }
                        });

                        console.log(`✅ [RECONCILE] After reconciliation: ${fieldMetadataStoreRef.current.size} fields in store`);
                    }

                    // Now return from fieldMetadataStoreRef
                    if (fieldMetadataStoreRef.current.size > 0) {
                        console.log(`📤 [EXPORT] Using field metadata store (${fieldMetadataStoreRef.current.size} fields)`);
                        const fields = Array.from(fieldMetadataStoreRef.current.values()).map((metadata: any) => ({
                            name: metadata.name,
                            type: metadata.type,
                            value: metadata.value,
                            readOnly: metadata.flags?.ReadOnly || false,
                            required: metadata.flags?.Required || false,
                            widget: metadata.widget,
                        }));
                        console.log(`✅ [EXPORT] Returning ${fields.length} fields from metadata store`);
                        return fields;
                    }

                    // Fallback: No fields found
                    console.warn('⚠️ [EXPORT] No fields found in metadata store or FieldManager');
                    return [];
                } catch (error) {
                    console.error('❌ [EXPORT] Error exporting form fields:', error);
                    return [];
                }
            },

            clearSignatureStore: () => {
                console.log('🧹 [PDFViewer] Clearing signature store');
            },

            save: async () => {
                if (!viewerInstance.current) return null;

                try {
                    const exportResult = await ((ref as any).current || ref)?.exportAnnotations?.();

                    if (!exportResult) return null;

                    const { blob, xfdfString } = exportResult;

                    // Convert blob to base64
                    const reader = new FileReader();
                    return new Promise((resolve) => {
                        reader.onloadend = () => {
                            const base64data = reader.result as string;
                            resolve({ fileData: base64data, xfdfData: xfdfString });
                        };
                        reader.readAsDataURL(blob);
                    });
                } catch (error) {
                    console.error('Error during save:', error);
                    return null;
                }
            },

            dispose: () => {
                if (viewerInstance.current) {
                    try {
                        viewerInstance.current.UI.dispose();
                    } catch (e) {
                        console.error('Error disposing viewer:', e);
                    }
                    viewerInstance.current = null;
                }
            },

            setToolbarGroup: (group: string) => {
                if (viewerInstance.current && viewerInstance.current.UI) {
                    try {
                        const { UI } = viewerInstance.current;
                        UI.setToolbarGroup(group);
                        console.log(`✅ Toolbar group set to: ${group}`);

                        // Force UI refresh to ensure visual update
                        setTimeout(() => {
                            try {
                                UI.setToolbarGroup(group);
                            } catch (e) {
                                // Silent retry
                            }
                        }, 100);
                    } catch (e) {
                        console.error(`❌ Failed to set toolbar group to ${group}:`, e);
                    }
                }
            },

            setToolMode: (mode: string) => {
                if (viewerInstance.current && viewerInstance.current.UI) {
                    try {
                        const { UI, Core } = viewerInstance.current;

                        // Set via UI
                        UI.setToolMode(mode);

                        // Also set via documentViewer for immediate effect
                        if (Core && Core.documentViewer) {
                            const toolModeMap = UI.ToolMode || Core.Tools;
                            if (toolModeMap && toolModeMap[mode]) {
                                Core.documentViewer.setToolMode(toolModeMap[mode]);
                            }
                        }

                        console.log(`✅ Tool mode set to: ${mode}`);
                    } catch (e) {
                        console.error(`❌ Failed to set tool mode to ${mode}:`, e);
                    }
                }
            },
        }));

        // Initialize viewer once (on mount)
        useEffect(() => {
            if (!viewerDiv.current || viewerInstance.current) return;

            const initWebViewer = async () => {
                try {
                    setLoading(true);
                    setError('');

                    const WebViewerModule = await import('@pdftron/webviewer');
                    const WebViewer = WebViewerModule.default;
                    console.log('✅ WebViewer module loaded');

                    // ══════════════════════════════════════════════════════════════════
                    // AUTO-SAVE: Debounced save function (defined inside useEffect)
                    // ══════════════════════════════════════════════════════════════════
                    const triggerAutoSave = async () => {
                        if (!viewerInstance.current || !onSave || effectiveReadOnly) {
                            return;
                        }

                        if (!hasUnsavedChanges.current) {
                            console.log('💾 [AUTO-SAVE] No unsaved changes, skipping save');
                            return;
                        }

                        try {
                            console.log('💾 [AUTO-SAVE] Starting auto-save...');
                            hasUnsavedChanges.current = false;

                            // Use the same export logic as manual save
                            const exportResult = await ((ref as any).current || ref)?.exportAnnotations?.();

                            if (!exportResult) {
                                console.error('💾 [AUTO-SAVE] Export failed - received null');
                                hasUnsavedChanges.current = true; // Mark as unsaved again
                                return;
                            }

                            const { blob, xfdfString } = exportResult;

                            // Convert blob to base64
                            const reader = new FileReader();
                            reader.onloadend = () => {
                                const base64data = reader.result as string;
                                console.log(`💾 [AUTO-SAVE] Calling onSave callback (PDF: ${blob.size} bytes, XFDF: ${xfdfString.length} chars)`);
                                onSave(base64data, xfdfString);
                                console.log('✅ [AUTO-SAVE] Auto-save completed successfully');
                            };
                            reader.readAsDataURL(blob);

                        } catch (error) {
                            console.error('❌ [AUTO-SAVE] Error during auto-save:', error);
                            hasUnsavedChanges.current = true; // Mark as unsaved again
                        }
                    };

                    // Debounced auto-save (waits 2 seconds after last change)
                    const scheduleAutoSave = () => {
                        if (effectiveReadOnly) return;

                        hasUnsavedChanges.current = true;

                        // Clear existing timeout
                        if (autoSaveTimeoutRef.current) {
                            clearTimeout(autoSaveTimeoutRef.current);
                        }

                        console.log('⏱️ [AUTO-SAVE] Change detected, scheduling auto-save in 2 seconds...');

                        // Schedule new auto-save
                        autoSaveTimeoutRef.current = setTimeout(() => {
                            triggerAutoSave();
                        }, 2000); // 2 second debounce
                    };

                    const instance = await WebViewer(
                        {
                            path: '/webviewer',
                            licenseKey: process.env.NEXT_PUBLIC_PDFTRON_LICENSE_KEY,
                            fullAPI: true,
                        },
                        viewerDiv.current as HTMLDivElement
                    );

                    console.log('✅ WebViewer instance created');
                    viewerInstance.current = instance;

                    // Store editableFieldMode on instance for access in event handlers
                    (instance as any).editableFieldMode = editableFieldMode;

                    const { UI, Core } = instance;

                    // Enable features for annotations
                    try {
                        UI.enableFeatures([UI.Feature.Annotations]);
                        console.log('✅ Annotations feature enabled');

                        // ✅ Set default tool mode to Pan (View mode) instead of Insert
                        UI.setToolMode('Pan');
                        console.log('✅ Default tool mode set to Pan (View)');
                    } catch (e) {
                        console.error('Failed to enable features:', e);
                    }

                    // ✅ CRITICAL FIX: Configure signature capture mode
                    // WebViewer 11 defaults to "appearance" mode which doesn't persist
                    // We need to use ANNOTATION mode AND capture the signature annotation
                    try {
                        const signatureTool = Core.documentViewer.getTool('AnnotationCreateSignature') as any;

                        // Set signing mode to ANNOTATION for persistence
                        if (signatureTool && signatureTool.setSigningMode) {
                            const SigningModes = (Core.Tools as any).SignatureCreateTool?.SigningModes;
                            if (SigningModes?.ANNOTATION) {
                                signatureTool.setSigningMode(SigningModes.ANNOTATION);
                                console.log('✅ Signature signing mode set to ANNOTATION');
                            } else {
                                console.warn('⚠️ SigningModes.ANNOTATION not available');
                            }
                        }

                        // Listen for when signature is created/selected by user
                        if (signatureTool) {
                            signatureTool.addEventListener('signatureCreated', (signatureAnnotation: any) => {
                                console.log('🖊️ [SIGNATURE CREATED] New signature created');
                                console.log('🖊️ [SIGNATURE CREATED] Type:', signatureAnnotation?.constructor?.name);
                                console.log('🖊️ [SIGNATURE CREATED] Subject:', signatureAnnotation?.Subject);
                            });

                            signatureTool.addEventListener('signatureSaved', (signatureWidgets: any) => {
                                console.log('🖊️ [SIGNATURE SAVED] Signature saved to widgets');
                                console.log('🖊️ [SIGNATURE SAVED] Widgets count:', signatureWidgets?.length);

                                // Get all annotations after signature is saved to see what was added
                                setTimeout(() => {
                                    const allAnnots = Core.annotationManager.getAnnotationsList();
                                    const stampAnnots = allAnnots.filter((a: any) =>
                                        a instanceof Core.Annotations.StampAnnotation ||
                                        a.Subject === 'Signature'
                                    );
                                    console.log('🖊️ [SIGNATURE SAVED] Total annotations:', allAnnots.length);
                                    console.log('🖊️ [SIGNATURE SAVED] Stamp/Signature annotations:', stampAnnots.length);
                                    stampAnnots.forEach((a: any, i: number) => {
                                        console.log(`🖊️ [STAMP #${i + 1}] Type: ${a.constructor.name}, Subject: ${a.Subject}`);
                                    });
                                }, 100);
                            });

                            // Listen for location selected (when user clicks to place signature)
                            signatureTool.addEventListener('locationSelected', (widget: any, location: any) => {
                                console.log('🖊️ [LOCATION SELECTED] Widget:', widget?.fieldName);
                                console.log('🖊️ [LOCATION SELECTED] Location:', location);
                            });
                        }
                    } catch (e) {
                        console.warn('⚠️ Could not configure signature mode:', e);
                    }

                    // Listen for ANY annotation changes to find and CAPTURE signature annotations
                    // ✅ CRITICAL FIX: WebViewer 11 deletes FreeHand signatures after applying
                    // We capture them here and restore before export
                    try {
                        Core.annotationManager.addEventListener('annotationChanged', (annotations: any, action: string, info: any) => {
                            annotations.forEach((annot: any) => {
                                // Check for signature-type annotations (FreeHand or Stamp with Signature subject)
                                const isSignatureAnnot =
                                    annot instanceof Core.Annotations.FreeHandAnnotation ||
                                    (annot instanceof Core.Annotations.StampAnnotation &&
                                        (annot as any).Subject?.includes('Signature'));

                                if (isSignatureAnnot) {
                                    const annotId = annot.Id || annot.getCustomData?.('id') || `sig_${Date.now()}`;

                                    if (action === 'add') {
                                        console.log('🖊️ [SIGNATURE CAPTURE] Capturing signature annotation!');
                                        console.log('🖊️ [SIGNATURE CAPTURE] Type:', annot.constructor?.name);
                                        console.log('🖊️ [SIGNATURE CAPTURE] Subject:', annot.Subject);
                                        console.log('🖊️ [SIGNATURE CAPTURE] ID:', annotId);

                                        // Store the annotation for later restoration
                                        capturedSignatureAnnotationsRef.current.set(annotId, {
                                            annotation: annot,
                                            capturedAt: Date.now(),
                                            type: annot.constructor?.name,
                                            subject: annot.Subject
                                        });
                                        console.log('🖊️ [SIGNATURE CAPTURE] Total captured:', capturedSignatureAnnotationsRef.current.size);
                                    }

                                    if (action === 'delete') {
                                        console.log('🖊️ [SIGNATURE DELETED] Signature annotation deleted by WebViewer!');
                                        console.log('🖊️ [SIGNATURE DELETED] ID:', annotId);
                                        console.log('🖊️ [SIGNATURE DELETED] Still in capture store:', capturedSignatureAnnotationsRef.current.has(annotId));
                                        // Keep it in our store - don't remove! We need it for export
                                    }
                                }

                                // Original stamp logging
                                if (annot instanceof Core.Annotations.StampAnnotation && action === 'add') {
                                    console.log('🖊️ [STAMP ADDED] StampAnnotation added!');
                                    console.log('🖊️ [STAMP ADDED] Subject:', annot.Subject);
                                    console.log('🖊️ [STAMP ADDED] ImageData:', !!(annot as any).ImageData);
                                }

                                // Original freehand logging
                                if (annot instanceof Core.Annotations.FreeHandAnnotation && action === 'add') {
                                    console.log('🖊️ [FREEHAND ADDED] FreeHandAnnotation added!');
                                    console.log('🖊️ [FREEHAND ADDED] Subject:', annot.Subject);
                                }
                            });
                        });
                    } catch (e) {
                        console.warn('⚠️ Could not add annotation listener:', e);
                    }

                    // Set up document loaded event listener
                    const handleDocumentLoaded = async () => {
                        console.log('📄 Document loaded event fired');

                        // Clear timeout since document loaded successfully
                        if (loadTimeoutRef.current) {
                            clearTimeout(loadTimeoutRef.current);
                            loadTimeoutRef.current = null;
                        }

                        try {
                            // ✅ CRITICAL FIX: Check if PDF already has embedded annotations
                            // When PDF is saved with getFileData({ xfdfString }), annotations are embedded
                            // Re-importing XFDF causes "Unknown appearance: _DEFAULT" errors because
                            // XFDF has appearance references that don't match embedded appearances
                            const existingAnnotations = Core.annotationManager.getAnnotationsList();
                            const hasExistingAnnotations = existingAnnotations.length > 0;

                            console.log(`📄 [DOCUMENT] PDF loaded with ${existingAnnotations.length} existing annotations`);

                            if (initialXfdf) {
                                if (hasExistingAnnotations) {
                                    // PDF already has annotations - skip XFDF import to preserve appearances
                                    console.log('⚠️ [IMPORT] PDF has existing annotations - SKIPPING XFDF import to preserve appearances');
                                    console.log(`✅ [IMPORT] Using ${existingAnnotations.length} embedded annotations from PDF`);

                                    // Log annotation types for debugging
                                    const annotTypes = existingAnnotations.map((a: any) => a.constructor.name);
                                    const typeCount: Record<string, number> = {};
                                    annotTypes.forEach((t: string) => { typeCount[t] = (typeCount[t] || 0) + 1; });
                                    console.log('📊 [IMPORT] Existing annotation types:', typeCount);
                                } else {
                                    // No existing annotations - import XFDF (template case)
                                    console.log('📥 [IMPORT] No existing annotations - importing XFDF...');
                                    console.log(`📥 [IMPORT] XFDF length: ${initialXfdf.length} chars`);
                                    console.log(`📥 [IMPORT] XFDF preview: ${initialXfdf.substring(0, 500)}...`);

                                    await Core.annotationManager.importAnnotations(initialXfdf);

                                    const importedCount = Core.annotationManager.getAnnotationsList().length;
                                    console.log(`✅ [IMPORT] XFDF imported successfully - ${importedCount} annotations loaded`);
                                }
                            }

                            // ══════════════════════════════════════════════════════════════════
                            // FIELD EDITABILITY: Apply field-level read-only logic
                            // ══════════════════════════════════════════════════════════════════
                            const editableFieldMode = (instance as any).editableFieldMode;
                            if (editableFieldMode === 'empty-only' && !effectiveReadOnly) {
                                console.log('🔒 [FIELD EDITABILITY] Setting filled fields to read-only (empty-only mode)');

                                const fieldManager = Core.annotationManager.getFieldManager();
                                const fields = fieldManager.getFields() || [];
                                const fieldsArray = Array.isArray(fields) ? fields : Array.from(fields);

                                let filledFieldsCount = 0;
                                let emptyFieldsCount = 0;

                                fieldsArray.forEach((field: any) => {
                                    const fieldValue = field.getValue ? field.getValue() : field.value;
                                    const hasValue = fieldValue && fieldValue.toString().trim() !== '';

                                    if (hasValue) {
                                        // Field has a value - make it read-only
                                        field.flags.ReadOnly = true;
                                        filledFieldsCount++;
                                    } else {
                                        // Field is empty - make it editable
                                        field.flags.ReadOnly = false;
                                        emptyFieldsCount++;
                                    }
                                });

                                console.log(`✅ [FIELD EDITABILITY] Set ${filledFieldsCount} filled fields to read-only, ${emptyFieldsCount} empty fields editable`);
                            } else if (editableFieldMode === 'none' || effectiveReadOnly) {
                                console.log('🔒 [FIELD EDITABILITY] Setting all fields to read-only (none mode or global read-only)');
                            } else {
                                console.log('✏️ [FIELD EDITABILITY] All fields editable (all mode)');
                            }

                            if (effectiveReadOnly) {
                                console.log('🔒 Setting read-only mode');
                                const annotations = Core.annotationManager.getAnnotationsList();
                                annotations.forEach((annot: any) => {
                                    annot.ReadOnly = true;
                                });

                                instance.UI.disableElements([
                                    'toolbarGroup-Shapes',
                                    'toolbarGroup-Edit',
                                    'toolbarGroup-Insert',
                                    'toolbarGroup-Forms',
                                    'contextMenuPopup',
                                    'notesPanel',
                                ]);
                            } else {
                                // ══════════════════════════════════════════════════════════════════
                                // AUTO-SAVE: Set up change listeners (only if not read-only)
                                // ══════════════════════════════════════════════════════════════════
                                console.log('👂 [AUTO-SAVE] Setting up change listeners...');

                                // Listen for annotation changes (drawings, comments, form field widgets, etc.)
                                Core.annotationManager.addEventListener('annotationChanged', (annotations: any, action: string) => {
                                    // Ignore 'render' actions (these are just visual updates)
                                    if (action === 'render') return;

                                    // Check if any of the annotations are form field widgets
                                    const hasFormFieldWidgets = annotations.some((annot: any) => {
                                        const isWidget = annot instanceof Core.Annotations.WidgetAnnotation ||
                                            annot.elementName === 'widget' ||
                                            annot.Subject === 'Widget';
                                        if (isWidget) {
                                            console.log(`📝 [AUTO-SAVE] Form field widget detected: ${annot.fieldName || 'unnamed'}, type: ${annot.constructor.name}`);
                                        }
                                        return isWidget;
                                    });

                                    if (hasFormFieldWidgets) {
                                        console.log(`🔔 [AUTO-SAVE] Form field annotation changed (action: ${action}, widgets: ${annotations.length})`);
                                        // Notify parent that document has been modified
                                        if (onDocumentModified) {
                                            onDocumentModified();
                                        }
                                    } else {
                                        console.log(`🔔 [AUTO-SAVE] Annotation changed (action: ${action}, count: ${annotations.length})`);
                                    }
                                    scheduleAutoSave();
                                });

                                // Listen for field value changes
                                // This fires when the VALUE of an existing field changes, not when field is created
                                Core.annotationManager.addEventListener('fieldChanged', (field: any, value: any) => {
                                    console.log(`🔔 [FIELD CHANGED] Field VALUE changed: ${field?.name || 'unknown'} = ${value}`);

                                    // ✅ CRITICAL FIX: Capture the text field value immediately
                                    // field.getValue() may return empty at export time if blur hasn't been processed
                                    if (field?.name && value !== undefined && value !== null) {
                                        const stringValue = String(value);
                                        capturedFieldValuesRef.current.set(field.name, stringValue);
                                        console.log(`📝 [VALUE CAPTURE] Captured field value: ${field.name} = "${stringValue}" (total: ${capturedFieldValuesRef.current.size})`);
                                    }

                                    // ✅ NEW: Update field metadata when value changes
                                    if (field?.name) {
                                        if (fieldMetadataStoreRef.current.has(field.name)) {
                                            // Update existing field's value
                                            const existing = fieldMetadataStoreRef.current.get(field.name);
                                            fieldMetadataStoreRef.current.set(field.name, {
                                                ...existing,
                                                value: value,
                                                lastModified: new Date().toISOString(),
                                            });
                                            console.log(`📝 [FIELD METADATA] Updated field value: ${field.name} = ${value}, total: ${fieldMetadataStoreRef.current.size}`);
                                        } else {
                                            // Field doesn't exist in store yet - capture it now
                                            const widgets = field.widgets || [];
                                            const widget = widgets[0];
                                            const metadata = {
                                                name: field.name,
                                                type: field.type || 'text',
                                                value: value,
                                                flags: {
                                                    ReadOnly: field.flags?.ReadOnly || false,
                                                    Required: field.flags?.Required || false,
                                                    Multiline: field.flags?.Multiline || false,
                                                },
                                                widget: widget ? {
                                                    pageNumber: widget.PageNumber,
                                                    rect: widget.getRect ? {
                                                        x1: widget.getRect().x1,
                                                        y1: widget.getRect().y1,
                                                        x2: widget.getRect().x2,
                                                        y2: widget.getRect().y2,
                                                    } : null,
                                                } : null,
                                                created: new Date().toISOString(),
                                            };
                                            fieldMetadataStoreRef.current.set(field.name, metadata);
                                            console.log(`📝 [FIELD METADATA] Captured new field from fieldChanged: ${field.name}, total: ${fieldMetadataStoreRef.current.size}`);
                                        }
                                    }

                                    scheduleAutoSave();
                                });

                                // ✅ CRITICAL FIX: Track form fields directly as widgets are created
                                // Instead of relying on XFDF export, we'll use the component-level fieldMetadataStoreRef
                                // Clear any previous data on initialization
                                fieldMetadataStoreRef.current.clear();

                                // Capture field metadata when widget is added/modified, remove when deleted
                                Core.annotationManager.addEventListener('annotationChanged', (annotations: any, action: string) => {
                                    // ✅ FIX: Handle delete action to remove fields from metadata store
                                    if (action === 'delete') {
                                        annotations.forEach((annot: any) => {
                                            const isWidget = annot instanceof Core.Annotations.WidgetAnnotation;
                                            if (!isWidget) return;

                                            try {
                                                const fieldName = (annot as any).fieldName || annot.getField?.()?.name;
                                                if (fieldName && fieldMetadataStoreRef.current.has(fieldName)) {
                                                    fieldMetadataStoreRef.current.delete(fieldName);
                                                    console.log(`🗑️ [FIELD METADATA] Deleted field: ${fieldName}, remaining fields: ${fieldMetadataStoreRef.current.size}`);
                                                }

                                                // Also remove from captured field values
                                                if (fieldName && capturedFieldValuesRef.current.has(fieldName)) {
                                                    capturedFieldValuesRef.current.delete(fieldName);
                                                    console.log(`🗑️ [VALUE CAPTURE] Removed captured value for: ${fieldName}`);
                                                }
                                            } catch (e) {
                                                console.error('❌ [FIELD METADATA] Error deleting field:', e);
                                            }
                                        });
                                        return;
                                    }

                                    if (action !== 'add' && action !== 'modify') return;

                                    annotations.forEach((annot: any) => {
                                        // Check if this is a form field widget
                                        const isWidget = annot instanceof Core.Annotations.WidgetAnnotation;
                                        if (!isWidget) return;

                                        try {
                                            const fieldName = (annot as any).fieldName || annot.getField?.()?.name || `Field_${Date.now()}`;
                                            const field = annot.getField?.();

                                            // Store comprehensive field metadata
                                            const metadata = {
                                                name: fieldName,
                                                type: (annot as any).getFormFieldPlaceholderType?.() || (field as any)?.type || 'text',
                                                value: (field as any)?.getValue?.() || '',
                                                flags: {
                                                    ReadOnly: (field as any)?.flags?.ReadOnly || false,
                                                    Required: (field as any)?.flags?.Required || false,
                                                    Multiline: (field as any)?.flags?.Multiline || false,
                                                },
                                                widget: {
                                                    pageNumber: (annot as any).PageNumber,
                                                    rect: annot.getRect ? {
                                                        x1: annot.getRect().x1,
                                                        y1: annot.getRect().y1,
                                                        x2: annot.getRect().x2,
                                                        y2: annot.getRect().y2,
                                                    } : null,
                                                },
                                                created: new Date().toISOString(),
                                            };

                                            fieldMetadataStoreRef.current.set(fieldName, metadata);
                                            console.log(`📝 [FIELD METADATA] Captured field: ${fieldName}, type: ${metadata.type}, total fields: ${fieldMetadataStoreRef.current.size}`);
                                        } catch (e) {
                                            console.error('❌ [FIELD METADATA] Error capturing field:', e);
                                        }
                                    });
                                });

                                // ✅ CRITICAL: Track signature annotations (stamps, freehand drawings)
                                // When user signs a signature field, PDFTron creates a separate annotation
                                // This needs to be captured separately from the widget
                                Core.annotationManager.addEventListener('annotationChanged', (annotations: any, action: string) => {
                                    // ✅ FIX: Handle delete action to remove user-deleted signatures from capture store
                                    if (action === 'delete') {
                                        annotations.forEach((annot: any) => {
                                            const isSignatureAnnot =
                                                annot instanceof Core.Annotations.FreeHandAnnotation ||
                                                annot instanceof Core.Annotations.StampAnnotation ||
                                                (annot.Subject && annot.Subject.includes('Signature'));

                                            if (isSignatureAnnot) {
                                                const annotId = annot.Id || annot.getCustomData?.('id');
                                                console.log(`🗑️ [SIGNATURE ANNOT] User deleted signature: Type=${annot.constructor.name}, ID=${annotId}`);

                                                // Remove from capture store - user explicitly deleted this
                                                if (annotId && capturedSignatureAnnotationsRef.current.has(annotId)) {
                                                    capturedSignatureAnnotationsRef.current.delete(annotId);
                                                    console.log(`🗑️ [SIGNATURE ANNOT] Removed from capture store, remaining: ${capturedSignatureAnnotationsRef.current.size}`);
                                                }

                                                // Trigger auto-save to persist the deletion
                                                scheduleAutoSave();
                                            }
                                        });
                                        return;
                                    }

                                    if (action !== 'add' && action !== 'modify') return;

                                    annotations.forEach((annot: any) => {
                                        // Check if this is a signature-related annotation (not widget)
                                        const isSignatureAnnot =
                                            annot instanceof Core.Annotations.FreeHandAnnotation ||
                                            annot instanceof Core.Annotations.StampAnnotation ||
                                            (annot.Subject && annot.Subject.includes('Signature'));

                                        if (isSignatureAnnot) {
                                            console.log(`🖊️ [SIGNATURE ANNOT] Detected: Type=${annot.constructor.name}, ` +
                                                `Subject=${annot.Subject || 'N/A'}, ` +
                                                `Action=${action}`);

                                            // Try to link to a signature field if nearby
                                            const allWidgets = Core.annotationManager.getAnnotationsList().filter(
                                                (a: any) => a instanceof Core.Annotations.SignatureWidgetAnnotation
                                            );

                                            console.log(`🖊️ [SIGNATURE ANNOT] Found ${allWidgets.length} signature widgets to check`);

                                            // Trigger auto-save to capture this annotation
                                            scheduleAutoSave();
                                        }
                                    });
                                });

                                // ✅ NEW: Listen for signature signed event
                                // This fires when a signature is placed in a signature field
                                try {
                                    Core.annotationManager.addEventListener('annotationSelected', (annotations: any) => {
                                        if (!annotations || annotations.length === 0) return;

                                        annotations.forEach((annot: any) => {
                                            if (annot instanceof Core.Annotations.SignatureWidgetAnnotation) {
                                                const field = (annot as any).getField?.();
                                                const hasValue = field?.getValue?.();
                                                console.log(`🖊️ [SIGNATURE SELECTED] Widget: ${(annot as any).fieldName || 'unknown'}, ` +
                                                    `HasValue: ${!!hasValue}`);
                                            }
                                        });
                                    });
                                } catch (e) {
                                    console.warn('⚠️ Could not add signature selected listener:', e);
                                }

                                console.log('✅ [AUTO-SAVE] Change listeners registered');
                            }

                            // ✅ Set tool mode to Pan (View) and switch to View tab after document loads
                            // This ensures View mode is the default for all contexts (contract, draft, etc.)
                            // UI.setToolMode('Pan'); // REMOVED as per user request (will set after save)

                            // Switch to View toolbar group (tab) so the View ribbon is shown
                            if (UI.setToolbarGroup && typeof UI.setToolbarGroup === 'function') {
                                // ✅ Use initialToolbarGroup if provided, else default to View
                                const targetGroup = initialToolbarGroup || 'toolbarGroup-View';
                                UI.setToolbarGroup(targetGroup);
                                console.log(`✅ Toolbar group set to ${targetGroup}`);
                            }

                            // ✅ Initialize annotation navigation if enabled
                            console.log('🔍 [NAV] Check:', {
                                showAnnotationNavigation,
                                effectiveReadOnly,
                                shouldInit: showAnnotationNavigation && !effectiveReadOnly
                            });

                            if (showAnnotationNavigation && !effectiveReadOnly) {
                                console.log('🔍 [NAV] Initializing annotation navigation...');
                                const formAnnotations = getFormFieldAnnotations(Core);
                                console.log('🔍 [NAV] Form annotations:', formAnnotations);
                                setAnnotations(formAnnotations);
                                setCurrentAnnotationIndex(0);

                                if (formAnnotations.length > 0) {
                                    setShowNavButton(true);
                                    console.log(`🔍 [NAV] Found ${formAnnotations.length} annotations for navigation`);
                                } else {
                                    console.log('🔍 [NAV] No annotations found');
                                }
                            }

                            console.log('✅ Setting loading to false');
                            setLoading(false);
                            if (onDocumentLoaded) {
                                console.log('📞 Calling onDocumentLoaded callback');
                                onDocumentLoaded();
                            }
                        } catch (err) {
                            console.error('❌ Error in documentLoaded handler:', err);
                            setLoading(false);
                            setError('Failed to load document');
                            if (onError) onError('Failed to load document');
                        }
                    };

                    Core.documentViewer.addEventListener('documentLoaded', handleDocumentLoaded);

                    // Handle document load errors
                    Core.documentViewer.addEventListener('loaderror', (err: any) => {
                        console.error('❌ Document load error event fired:', err);

                        // Clear timeout
                        if (loadTimeoutRef.current) {
                            clearTimeout(loadTimeoutRef.current);
                            loadTimeoutRef.current = null;
                        }

                        setLoading(false);
                        setError('Failed to load PDF document');
                        if (onError) onError('Failed to load PDF document');
                    });

                    console.log('✅ WebViewer initialization complete, event listeners attached');

                    // Load initial document if provided
                    // Event listeners are now fully set up before loading starts
                    if (documentUrl) {
                        console.log('📥 Loading initial document:', documentUrl);

                        // // Set up timeout (15 seconds) to prevent infinite loading
                        // loadTimeoutRef.current = setTimeout(() => {
                        //     console.error('⏱️ Document load timeout after 15 seconds');
                        //     setLoading(false);
                        //     setError('Document load timeout - please try again');
                        //     if (onError) onError('Document load timeout');
                        // }, 15000);

                        UI.loadDocument(documentUrl);
                        initialLoadDone.current = true;
                    } else {
                        setLoading(false);
                    }
                } catch (err) {
                    console.error('❌ Error initializing WebViewer:', err);
                    setLoading(false);
                    setError('Failed to initialize PDF viewer');
                    if (onError) onError('Failed to initialize PDF viewer');
                }
            };

            initWebViewer();

            return () => {
                // Clear any pending timeout
                if (loadTimeoutRef.current) {
                    clearTimeout(loadTimeoutRef.current);
                    loadTimeoutRef.current = null;
                }

                // Clear auto-save timeout
                if (autoSaveTimeoutRef.current) {
                    clearTimeout(autoSaveTimeoutRef.current);
                    autoSaveTimeoutRef.current = null;
                }

                if (viewerInstance.current) {
                    try {
                        viewerInstance.current.UI.dispose();
                    } catch (e) {
                        console.error('Error disposing viewer:', e);
                    }
                    viewerInstance.current = null;
                }
            };
        }, []);

        // Load document when documentUrl changes (skip initial load - handled by first useEffect)
        useEffect(() => {
            // Skip if this is the initial load (handled by first useEffect)
            if (!initialLoadDone.current) {
                return;
            }

            if (documentUrl && viewerInstance.current) {
                const loadDocument = async () => {
                    try {
                        // Clear any existing timeout
                        if (loadTimeoutRef.current) {
                            clearTimeout(loadTimeoutRef.current);
                            loadTimeoutRef.current = null;
                        }

                        setLoading(true);
                        console.log('📥 Reloading document (URL changed):', documentUrl);

                        // Set up timeout (15 seconds) to prevent infinite loading
                        // loadTimeoutRef.current = setTimeout(() => {
                        //     console.error('⏱️ Document load timeout after 15 seconds');
                        //     setLoading(false);
                        //     setError('Document load timeout - please try again');
                        //     if (onError) onError('Document load timeout');
                        // }, 15000);

                        const { UI } = viewerInstance.current;
                        UI.loadDocument(documentUrl);
                    } catch (err) {
                        console.error('❌ Error loading document:', err);

                        // Clear timeout on error
                        if (loadTimeoutRef.current) {
                            clearTimeout(loadTimeoutRef.current);
                            loadTimeoutRef.current = null;
                        }

                        setLoading(false);
                        setError('Failed to load document');
                        if (onError) onError('Failed to load document');
                    }
                };
                loadDocument();
            }
        }, [documentUrl]);

        // Handle readonly mode changes
        useEffect(() => {
            if (!viewerInstance.current || effectiveReadOnly === undefined) return;

            try {
                const { annotationManager } = viewerInstance.current.Core;
                const annotations = annotationManager.getAnnotationsList();

                if (effectiveReadOnly) {
                    annotations.forEach((annot: any) => {
                        annot.ReadOnly = true;
                    });
                    viewerInstance.current.UI.disableElements([
                        'toolbarGroup-Shapes',
                        'toolbarGroup-Edit',
                        'toolbarGroup-Insert',
                        'toolbarGroup-Forms',
                        'contextMenuPopup',
                        'notesPanel',
                    ]);
                } else {
                    annotations.forEach((annot: any) => {
                        annot.ReadOnly = false;
                    });
                    viewerInstance.current.UI.enableElements([
                        'toolbarGroup-Shapes',
                        'toolbarGroup-Edit',
                        'toolbarGroup-Insert',
                        'toolbarGroup-Forms',
                        'contextMenuPopup',
                        'notesPanel',
                    ]);
                }
            } catch (err) {
                console.error('Error setting readonly mode:', err);
            }
        }, [effectiveReadOnly]);

        if (error) {
            return (
                <Box
                    sx={{
                        width: '100%',
                        height: '100%',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        color: 'error.main',
                    }}
                >
                    {error}
                </Box>
            );
        }

        return (
            <Box sx={{ position: 'relative', width: '100%', height: '100%' }}>
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
                            bgcolor: 'background.paper',
                            zIndex: 1,
                        }}
                    >
                        <CircularProgress />
                    </Box>
                )}
                <Box
                    ref={viewerDiv}
                    sx={{
                        width: '100%',
                        height: '100%',
                        minHeight: 600,
                    }}
                />

                {/* ✅ Floating Annotation Navigation Button */}
                {showNavButton && showAnnotationNavigation && annotations.length > 0 && (
                    <Tooltip
                        title={
                            currentAnnotationIndex === annotations.length - 1
                                ? 'Next (Move to top)'
                                : `Next (${currentAnnotationIndex + 2}/${annotations.length})`
                        }
                        placement="right"
                    >
                        <Fab
                            color="primary"
                            size="medium"
                            onClick={async () => {
                                if (!viewerInstance.current) return;

                                const { Core } = viewerInstance.current;
                                const { documentViewer, annotationManager } = Core;
                                const formAnnotations = getFormFieldAnnotations(Core);

                                if (formAnnotations.length === 0) return;

                                const nextIndex = (currentAnnotationIndex + 1) % formAnnotations.length;
                                const nextAnnotation = formAnnotations[nextIndex];

                                console.log(`🔍 [NAV] Jumping to annotation ${nextIndex + 1}/${formAnnotations.length}`);
                                console.log(`🔍 [NAV] Target page: ${nextAnnotation.PageNumber}`);

                                try {
                                    // ✅ SMOOTH SCROLL IMPLEMENTATION
                                    const currentPage = documentViewer.getCurrentPage();
                                    console.log(`🔍 [NAV] Current page: ${currentPage}, Target page: ${nextAnnotation.PageNumber}`);

                                    // Get scroll container and enable smooth scrolling
                                    const scrollContainer = documentViewer.getScrollViewElement();
                                    if (scrollContainer) {
                                        scrollContainer.style.scrollBehavior = 'smooth';
                                        console.log('🔍 [NAV] Enabled smooth scrolling');
                                    }

                                    // Deselect current annotations
                                    annotationManager.deselectAllAnnotations();

                                    // Navigate to the page first if different
                                    if (currentPage !== nextAnnotation.PageNumber) {
                                        console.log(`🔍 [NAV] Changing page from ${currentPage} to ${nextAnnotation.PageNumber}`);
                                        documentViewer.setCurrentPage(nextAnnotation.PageNumber);
                                        // Wait for page to render
                                        await new Promise(resolve => setTimeout(resolve, 250));
                                    }

                                    // Select and jump to annotation
                                    annotationManager.selectAnnotation(nextAnnotation);

                                    // Wait a bit for selection to render
                                    await new Promise(resolve => setTimeout(resolve, 50));

                                    // Use jumpToAnnotation which will scroll to the annotation
                                    annotationManager.jumpToAnnotation(nextAnnotation);
                                    console.log('🔍 [NAV] Scrolled to annotation');

                                    // Reset scroll behavior after animation
                                    setTimeout(() => {
                                        if (scrollContainer) {
                                            scrollContainer.style.scrollBehavior = 'auto';
                                        }
                                    }, 600);

                                } catch (error) {
                                    console.error('🔍 [NAV] Error during navigation:', error);
                                    // Fallback to simple jumpToAnnotation
                                    try {
                                        annotationManager.selectAnnotation(nextAnnotation);
                                        annotationManager.jumpToAnnotation(nextAnnotation);
                                    } catch (e) {
                                        console.error('🔍 [NAV] Fallback also failed:', e);
                                    }
                                }

                                setCurrentAnnotationIndex(nextIndex);

                                if (nextIndex === 0) {
                                    console.log('🔄 [NAV] Reached last annotation, moved back to top');
                                }
                            }}
                            sx={{
                                position: 'absolute',
                                left: 16,
                                top: '50%',
                                transform: 'translateY(-50%)',
                                zIndex: 1000,
                                boxShadow: 3,
                            }}
                        >
                            <NavigateNextIcon />
                        </Fab>
                    </Tooltip>
                )}
            </Box>
        );
    }
);

PDFViewerContainer.displayName = 'PDFViewerContainer';

export default PDFViewerContainer;
