'use client';

import { useRef, useEffect, useState, forwardRef, useImperativeHandle } from 'react';
import { Box, CircularProgress } from '@mui/material';

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
    onSignatureApplied?: (data: { emptySignatureFieldCount: number }) => void; // ✅ Callback when a signature is applied to a field

    // Multi-party field assignment props
    parties?: PartyConfiguration[];           // Available parties for field assignment
    editableParties?: string[];               // Which parties' fields are editable (empty = all editable)
    currentFillingParty?: string;             // Which party the current user is filling for
    enablePartyAssignment?: boolean;          // Enable party assignment mode (for template creation)
    onPartyAssigned?: (fieldName: string, partyId: string, partyLabel: string) => void; // Callback when field is assigned to party
    onFieldsWithPartyExported?: (fields: FormFieldDefinitionWithParty[]) => void; // Callback with fields including party data
}

// Import types for multi-party support
import { PartyConfiguration } from '@/types/template';

// Extended FormFieldDefinition with party assignment
export interface FormFieldDefinitionWithParty {
    name: string;
    type: string;
    x: number;
    y: number;
    width: number;
    height: number;
    pageNumber: number;
    required: boolean;
    readOnly?: boolean;
    assignedParty?: string;
    partyLabel?: string;
    annotationId?: string;
}

export interface PDFViewerHandle {
    exportAnnotations: (fieldValues?: Record<string, string>, options?: { flatten?: boolean; skipToolbarSwitch?: boolean }) => Promise<{ blob: Blob; xfdfString: string } | null>;
    exportFormFields: () => Promise<any[]>;
    exportFormFieldsWithParty: () => Promise<FormFieldDefinitionWithParty[]>;
    clearSignatureStore: () => void;
    dispose: () => void;
    save: () => Promise<{ fileData: string; xfdfData: string } | null>;
    setToolbarGroup: (group: string) => void;
    setToolMode: (mode: string) => void;
    switchToViewMode: () => Promise<boolean>;
    applySignatureToAllEmptyFields: () => Promise<number>;
    // Multi-party field assignment methods
    assignFieldToParty: (fieldName: string, partyId: string, partyLabel: string, partyColor: string) => boolean;
    getFieldPartyAssignment: (fieldName: string) => { partyId: string; partyLabel: string } | null;
    getAllFieldPartyAssignments: () => Record<string, { partyId: string; partyLabel: string }>;
    highlightPartyFields: (partyId: string | null) => void;
}

const PDFViewerContainer = forwardRef<PDFViewerHandle, PDFViewerContainerProps>(
    ({ documentUrl, initialXfdf, readOnly, isReadOnly, onSave, onDocumentLoaded, onDocumentModified, onError, editableFieldMode = 'all', initialToolbarGroup, showAnnotationNavigation = false, onSignatureApplied, parties, editableParties, currentFillingParty, enablePartyAssignment, onPartyAssigned, onFieldsWithPartyExported, onFieldChange, formFields }, ref) => {
        const viewerDiv = useRef<HTMLDivElement>(null);
        const viewerInstance = useRef<any>(null);
        const [loading, setLoading] = useState(true);
        const [error, setError] = useState<string>('');
        const loadTimeoutRef = useRef<NodeJS.Timeout | null>(null);
        const initialLoadDone = useRef(false);
        // Guard against React 18 StrictMode double-mount creating two WebViewer instances
        const isInitializingRef = useRef(false);
        const autoSaveTimeoutRef = useRef<NodeJS.Timeout | null>(null);
        const hasUnsavedChanges = useRef(false);

        // ✅ Annotation Navigation State
        const [annotations, setAnnotations] = useState<any[]>([]);
        const [currentAnnotationIndex, setCurrentAnnotationIndex] = useState(0);
        const [showNavButton, setShowNavButton] = useState(false);
        const [navStarted, setNavStarted] = useState(false);
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

        // ✅ Refs for "Sign All" feature
        const onSignatureAppliedRef = useRef<((data: { emptySignatureFieldCount: number }) => void) | undefined>(undefined);
        const isApplyingSignAllRef = useRef(false);

        // ✅ Multi-party field assignment storage
        // Maps fieldName -> { partyId, partyLabel, partyColor }
        const fieldPartyAssignmentsRef = useRef<Map<string, { partyId: string; partyLabel: string; partyColor: string }>>(new Map());

        // ✅ Track signature annotation ID -> field name mapping for deletion tracking
        // When a signature is added, we store annotationId -> fieldName
        // When deleted, we look up which field to clear
        const signatureAnnotationToFieldRef = useRef<Map<string, string>>(new Map());

        const effectiveReadOnly = isReadOnly ?? readOnly;

        // Keep onSignatureApplied ref updated for use in event handlers
        onSignatureAppliedRef.current = onSignatureApplied;

        // ✅ Helper: Switch toolbar group using the correct API for the UI version
        // WebViewer 11+ uses Modular UI by default, where setToolbarGroup is a Legacy API
        // that silently no-ops. The correct Modular UI API is setActiveRibbonItem.
        const safeSetToolbarGroup = (UI: any, group: string) => {
            try {
                // Modular UI (WebViewer 11+) — this is the correct API
                if (typeof UI.setActiveRibbonItem === 'function') {
                    UI.setActiveRibbonItem(group);
                    console.log(`✅ [TOOLBAR] setActiveRibbonItem('${group}') called (Modular UI)`);
                    return;
                }
            } catch (e) {
                console.warn(`⚠️ [TOOLBAR] setActiveRibbonItem failed for '${group}':`, e);
            }

            try {
                // Legacy UI fallback
                if (typeof UI.setToolbarGroup === 'function') {
                    UI.setToolbarGroup(group);
                    console.log(`✅ [TOOLBAR] setToolbarGroup('${group}') called (Legacy UI fallback)`);
                }
            } catch (e) {
                console.warn(`⚠️ [TOOLBAR] setToolbarGroup also failed for '${group}':`, e);
            }
        };

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

        // ✅ Helper: check if a signature widget is truly empty (no overlapping signature annotation)
        const isSignatureWidgetEmpty = (widget: any, allAnnotations: any[], Core: any): boolean => {
            // Check 1: Has linked annotation
            if ((widget as any).annot) return false;

            // Check 2: Field has non-empty value
            const field = widget.getField?.();
            const value = field?.getValue?.();
            if (value && value.toString().trim() !== '') return false;

            // Check 3: Has an overlapping signature annotation on the same page
            const widgetRect = widget.getRect();
            const widgetPage = widget.PageNumber;
            const tolerance = 5;

            const hasOverlappingSignature = allAnnotations.some((annot: any) => {
                if (annot === widget) return false;
                const isSignatureAnnot =
                    annot instanceof Core.Annotations.FreeHandAnnotation ||
                    (annot instanceof Core.Annotations.StampAnnotation &&
                        (annot as any).Subject?.includes('Signature'));
                if (!isSignatureAnnot || annot.PageNumber !== widgetPage) return false;

                const sigRect = annot.getRect();
                return !(sigRect.x2 < widgetRect.x1 - tolerance ||
                    sigRect.x1 > widgetRect.x2 + tolerance ||
                    sigRect.y2 < widgetRect.y1 - tolerance ||
                    sigRect.y1 > widgetRect.y2 + tolerance);
            });
            if (hasOverlappingSignature) return false;

            return true;
        };

        // ✅ Helper function to count empty signature widget fields
        const getEmptySignatureWidgetCount = (): number => {
            if (!viewerInstance.current) return 0;
            const { Core } = viewerInstance.current;
            const annotationManager = Core.annotationManager;
            const allAnnotations = annotationManager.getAnnotationsList();
            return allAnnotations.filter((annot: any) => {
                if (!(annot instanceof Core.Annotations.SignatureWidgetAnnotation)) return false;
                return isSignatureWidgetEmpty(annot, allAnnotations, Core);
            }).length;
        };

        useImperativeHandle(ref, () => ({
            exportAnnotations: async (fieldValues?: Record<string, string>, options?: { flatten?: boolean; skipToolbarSwitch?: boolean }) => {
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

                    // Step 2: Deselect all active annotations to finalize any in-progress edits
                    console.log('📌 [PRE-EXPORT COMMIT] Step 2: Deselecting all annotations...');
                    try {
                        annotationManager.deselectAllAnnotations();
                        // ✅ Only switch toolbar if caller hasn't already done so
                        if (!options?.skipToolbarSwitch) {
                            safeSetToolbarGroup(viewerInstance.current.UI, 'toolbarGroup-View');
                            viewerInstance.current.UI.setToolMode('Pan');
                            console.log('✅ [PRE-EXPORT COMMIT] Toolbar switched to View/Pan');
                        } else {
                            console.log('✅ [PRE-EXPORT COMMIT] Skipping toolbar switch (already done by caller)');
                        }
                        console.log('✅ [PRE-EXPORT COMMIT] All annotations deselected');
                    } catch (e) {
                        console.error('❌ [PRE-EXPORT COMMIT] Step 2 failed:', e);
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
                        } else if (documentViewer.updateView && typeof documentViewer.x === 'function') {
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
                        await new Promise(resolve => setTimeout(resolve, 2000));
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

                        // ✅ Build a Set of current field names from FieldManager (source of truth)
                        const currentFieldNames = new Set<string>();

                        fieldsArray.forEach((field: any) => {
                            const fieldName = field.name;
                            if (!fieldName) return;

                            currentFieldNames.add(fieldName);

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

                        // ✅ CLEANUP: Remove fields from store that no longer exist in PDF
                        // This ensures deleted fields don't persist in exports
                        const fieldsToRemove: string[] = [];
                        fieldMetadataStoreRef.current.forEach((_, fieldName) => {
                            if (!currentFieldNames.has(fieldName)) {
                                fieldsToRemove.push(fieldName);
                            }
                        });
                        fieldsToRemove.forEach(fieldName => {
                            fieldMetadataStoreRef.current.delete(fieldName);
                            // Also clean up party assignments for deleted fields
                            fieldPartyAssignmentsRef.current.delete(fieldName);
                            console.log(`🗑️ [RECONCILE] Removed deleted field: ${fieldName}`);
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
                    console.log(`🔧 [TOOLBAR] Setting toolbar group to: ${group}`);
                    safeSetToolbarGroup(viewerInstance.current.UI, group);
                }
            },

            setToolMode: (mode: string) => {
                if (viewerInstance.current && viewerInstance.current.UI) {
                    try {
                        const { UI, Core } = viewerInstance.current;

                        // ✅ CRITICAL FIX: Set tool mode via multiple methods to ensure it takes effect

                        // Method 1: Set via UI.setToolMode (affects UI state)
                        UI.setToolMode(mode);
                        console.log(`✅ Tool mode set via UI: ${mode}`);

                        // Method 2: Set via documentViewer.setToolMode (affects core state)
                        if (Core && Core.documentViewer) {
                            const toolModeMap = UI.ToolMode || Core.Tools;
                            if (toolModeMap && toolModeMap[mode]) {
                                Core.documentViewer.setToolMode(toolModeMap[mode]);
                                console.log(`✅ Tool mode set via Core: ${mode}`);
                            } else {
                                // Fallback: Try to construct the tool directly
                                const tool = Core.documentViewer.getTool(mode);
                                if (tool) {
                                    Core.documentViewer.setToolMode(tool);
                                    console.log(`✅ Tool mode set via getTool: ${mode}`);
                                }
                            }
                        }

                        // Method 3: Force UI to update active tool indicator
                        try {
                            if (UI.updateElement) {
                                UI.updateElement('toolsHeader');
                                console.log('✅ Forced tool button UI refresh');
                            }
                        } catch (refreshError) {
                            console.warn('⚠️ UI refresh not available:', refreshError);
                        }

                        console.log(`✅ Tool mode fully set to: ${mode}`);
                    } catch (e) {
                        console.error(`❌ Failed to set tool mode to ${mode}:`, e);
                    }
                }
            },

            // ✅ Reliable async switch to View mode with forced state reset
            switchToViewMode: async (): Promise<boolean> => {
                if (!viewerInstance.current || !viewerInstance.current.UI) {
                    console.error('❌ [switchToViewMode] Viewer not initialized');
                    return false;
                }

                // ✅ CRITICAL: Re-read from viewerInstance.current on EVERY call
                // to avoid any stale closure issues
                const instance = viewerInstance.current;
                const { UI, Core } = instance;
                const targetGroup = 'toolbarGroup-View';

                try {
                    console.log('═══════════════════════════════════════════════════════════');
                    console.log('🔄 [switchToViewMode] Starting forced View mode switch...');
                    console.log('═══════════════════════════════════════════════════════════');

                    // Step 1: Close any open overlays/popups that could block the switch
                    try {
                        UI.closeElements(['menuOverlay', 'contextMenuPopup', 'toolsOverlay', 'toolStylePopup']);
                        console.log('✅ [switchToViewMode] Closed overlays/popups');
                    } catch (e) {
                        console.warn('⚠️ [switchToViewMode] Could not close overlays:', e);
                    }

                    // Step 2: Deselect all annotations to finalize in-progress edits
                    try {
                        Core.annotationManager.deselectAllAnnotations();
                        console.log('✅ [switchToViewMode] All annotations deselected');
                    } catch (e) {
                        console.warn('⚠️ [switchToViewMode] Could not deselect annotations:', e);
                    }

                    // Step 3: Set Pan tool via BOTH Core and UI to break out of form creation mode
                    try {
                        // Core path (most reliable — directly changes internal state)
                        const panTool = Core.documentViewer.getTool('Pan');
                        if (panTool) {
                            Core.documentViewer.setToolMode(panTool);
                            console.log('✅ [switchToViewMode] Pan tool set via Core.documentViewer');
                        }
                        // UI path (updates the toolbar UI indicator)
                        UI.setToolMode('Pan');
                        console.log('✅ [switchToViewMode] Pan tool set via UI.setToolMode');
                    } catch (e) {
                        console.warn('⚠️ [switchToViewMode] Could not set Pan tool:', e);
                    }

                    // Step 4: CRITICAL — Force a toolbar state change by switching to an
                    // INTERMEDIATE toolbar group first. This prevents WebViewer from
                    // no-op'ing when it thinks the toolbar is already in 'toolbarGroup-View'
                    // (which happens on subsequent calls after the first successful switch).
                    try {
                        safeSetToolbarGroup(UI, 'toolbarGroup-Annotate');
                        console.log('✅ [switchToViewMode] Switched to intermediate toolbar (Annotate)');
                    } catch (e) {
                        console.warn('⚠️ [switchToViewMode] Intermediate switch failed:', e);
                    }
                    await new Promise(resolve => setTimeout(resolve, 100));

                    // Step 5: Now switch to the target View toolbar group
                    safeSetToolbarGroup(UI, targetGroup);
                    console.log('✅ [switchToViewMode] setToolbarGroup called (1st → View)');

                    await new Promise(resolve => setTimeout(resolve, 150));

                    // Step 6: Re-set Pan tool after toolbar switch (toolbar switch can reset tool mode)
                    try {
                        const panTool = Core.documentViewer.getTool('Pan');
                        if (panTool) {
                            Core.documentViewer.setToolMode(panTool);
                        }
                        UI.setToolMode('Pan');
                        console.log('✅ [switchToViewMode] Pan tool re-confirmed after toolbar switch');
                    } catch (e) {
                        console.warn('⚠️ [switchToViewMode] Could not re-confirm Pan tool:', e);
                    }

                    // Step 7: Second toolbar group call after tool mode is firmly set
                    await new Promise(resolve => setTimeout(resolve, 100));
                    safeSetToolbarGroup(UI, targetGroup);
                    console.log('✅ [switchToViewMode] setToolbarGroup called (2nd → View)');

                    // Step 8: Verify using available APIs
                    const canVerifyToolbar = typeof UI.getCurrentToolbarGroup === 'function';
                    if (canVerifyToolbar) {
                        await new Promise(resolve => setTimeout(resolve, 100));
                        const currentGroup = UI.getCurrentToolbarGroup();
                        console.log(`🔍 [switchToViewMode] Toolbar verification: ${currentGroup}`);
                        if (currentGroup && currentGroup !== targetGroup) {
                            // Force one more attempt
                            safeSetToolbarGroup(UI, targetGroup);
                            await new Promise(resolve => setTimeout(resolve, 200));
                            console.log('🔄 [switchToViewMode] Forced retry after verification mismatch');
                        }
                    } else {
                        console.log('ℹ️ [switchToViewMode] getCurrentToolbarGroup not available — relying on forced switch');
                    }

                    // Step 9: Verify Pan tool is active
                    try {
                        const currentTool = Core.documentViewer.getToolMode();
                        const toolName = currentTool?.name || currentTool?.constructor?.name || 'unknown';
                        console.log(`🔍 [switchToViewMode] Current tool mode: ${toolName}`);
                    } catch (e) {
                        console.warn('⚠️ [switchToViewMode] Could not verify tool mode:', e);
                    }

                    // Step 10: Final settle delay for iframe UI to fully render
                    await new Promise(resolve => setTimeout(resolve, 300));

                    console.log('✅ [switchToViewMode] View mode switch completed (forced)');
                    return true;
                } catch (error) {
                    console.error('❌ [switchToViewMode] Unexpected error:', error);
                    return false;
                }
            },

            // ✅ Apply the most recent signature to all empty signature fields
            applySignatureToAllEmptyFields: async () => {
                if (!viewerInstance.current) return 0;

                const { Core } = viewerInstance.current;
                const annotationManager = Core.annotationManager;

                isApplyingSignAllRef.current = true;

                try {
                    // 1. Find all SignatureWidgetAnnotations
                    const allAnnotations = annotationManager.getAnnotationsList();
                    const signatureWidgets = allAnnotations.filter((annot: any) =>
                        annot instanceof Core.Annotations.SignatureWidgetAnnotation
                    );

                    // 2. Identify truly empty widgets (using overlap detection)
                    const emptyWidgets = signatureWidgets.filter((widget: any) =>
                        isSignatureWidgetEmpty(widget, allAnnotations, Core)
                    );

                    if (emptyWidgets.length === 0) {
                        console.log('🖊️ [SIGN ALL] No empty signature widgets found');
                        return 0;
                    }

                    // 3. Get the most recently captured signature annotation as source
                    const capturedSigs = Array.from(capturedSignatureAnnotationsRef.current.values())
                        .sort((a: any, b: any) => b.capturedAt - a.capturedAt);

                    if (capturedSigs.length === 0) {
                        console.warn('🖊️ [SIGN ALL] No captured signature annotations found');
                        return 0;
                    }

                    const sourceAnnotation = capturedSigs[0].annotation;
                    console.log(`🖊️ [SIGN ALL] Source: ${sourceAnnotation.constructor?.name}, Subject: ${sourceAnnotation.Subject}`);

                    // 4. Extract signature image data from source annotation
                    let signatureImageData: string | null = null;

                    // Method A: StampAnnotation - get image data directly
                    if (sourceAnnotation.getImageData) {
                        try {
                            signatureImageData = sourceAnnotation.getImageData();
                            console.log('🖊️ [SIGN ALL] Got image data via getImageData()');
                        } catch (e) {
                            console.warn('🖊️ [SIGN ALL] getImageData() failed:', e);
                        }
                    }

                    if (!signatureImageData && sourceAnnotation.ImageData) {
                        signatureImageData = sourceAnnotation.ImageData;
                        console.log('🖊️ [SIGN ALL] Got image data via ImageData property');
                    }

                    // Method B: FreeHandAnnotation - render paths to canvas
                    if (!signatureImageData && sourceAnnotation.getPaths) {
                        try {
                            const paths = sourceAnnotation.getPaths();
                            if (paths && paths.length > 0) {
                                const canvas = document.createElement('canvas');
                                const sw = sourceAnnotation.Width || 200;
                                const sh = sourceAnnotation.Height || 80;
                                const scale = 2; // Higher res for quality
                                canvas.width = Math.ceil(sw * scale);
                                canvas.height = Math.ceil(sh * scale);
                                const ctx = canvas.getContext('2d');
                                if (ctx) {
                                    ctx.scale(scale, scale);
                                    ctx.strokeStyle = sourceAnnotation.StrokeColor?.toHexString?.() || '#000000';
                                    ctx.lineWidth = sourceAnnotation.StrokeThickness || 2;
                                    ctx.lineCap = 'round';
                                    ctx.lineJoin = 'round';

                                    for (const path of paths) {
                                        if (!path || path.length < 2) continue;
                                        ctx.beginPath();
                                        const startX = (path[0].x ?? path[0].X ?? 0) - sourceAnnotation.X;
                                        const startY = (path[0].y ?? path[0].Y ?? 0) - sourceAnnotation.Y;
                                        ctx.moveTo(startX, startY);
                                        for (let i = 1; i < path.length; i++) {
                                            const px = (path[i].x ?? path[i].X ?? 0) - sourceAnnotation.X;
                                            const py = (path[i].y ?? path[i].Y ?? 0) - sourceAnnotation.Y;
                                            ctx.lineTo(px, py);
                                        }
                                        ctx.stroke();
                                    }

                                    signatureImageData = canvas.toDataURL('image/png');
                                    console.log('🖊️ [SIGN ALL] Rendered FreeHand to canvas image');
                                }
                            }
                        } catch (e) {
                            console.warn('🖊️ [SIGN ALL] FreeHand canvas rendering failed:', e);
                        }
                    }

                    if (!signatureImageData) {
                        console.error('🖊️ [SIGN ALL] Could not extract signature image from source annotation');
                        return 0;
                    }

                    // 5. Apply signature to each empty widget
                    let signedCount = 0;

                    console.log(`🖊️ [SIGN ALL] Source signature dimensions: ${sourceAnnotation.Width} x ${sourceAnnotation.Height}`);

                    for (const widget of emptyWidgets) {
                        try {
                            const pageNumber = widget.PageNumber;

                            // ✅ Create a StampAnnotation with the signature image
                            const stamp = new Core.Annotations.StampAnnotation();
                            stamp.PageNumber = pageNumber;
                            stamp.X = widget.X;
                            stamp.Y = widget.Y;
                            stamp.Width = widget.Width;
                            stamp.Height = widget.Height;
                            stamp.Subject = 'Signature';
                            stamp.Author = annotationManager.getCurrentUser();

                            // Set image data (async for proper loading)
                            if (typeof stamp.setImageData === 'function') {
                                await stamp.setImageData(signatureImageData);
                            } else {
                                (stamp as any).ImageData = signatureImageData;
                            }

                            // ✅ Use official Apryse API: widget.sign(stamp)
                            // This properly:
                            // 1. Removes the "Sign Here" placeholder element
                            // 2. Links the stamp annotation to the widget
                            // 3. Creates the signature appearance
                            // 4. Handles rendering automatically
                            if (typeof widget.sign === 'function') {
                                widget.sign(stamp);
                                console.log(`🖊️ [SIGN ALL] Used widget.sign() for: ${(widget as any).fieldName || 'unknown'}`);
                            } else {
                                // Fallback for older WebViewer versions
                                console.warn('🖊️ [SIGN ALL] widget.sign() not available, using fallback');
                                annotationManager.addAnnotation(stamp, { imported: false });
                                (widget as any).annot = stamp;
                                annotationManager.drawAnnotationsFromList([stamp]);
                            }

                            // Set field value to mark as signed (but keep editable so user can clear/remove)
                            const field = widget.getField?.();
                            if (field?.setValue) {
                                const fieldName = field.name || 'signed';
                                field.setValue(fieldName);
                                if (field.commit) {
                                    try { field.commit(fieldName, widget); } catch (e) { /* ok */ }
                                }
                                // ✅ Do NOT set ReadOnly — allows user to clear/remove signatures

                                // Capture value for export
                                capturedFieldValuesRef.current.set(field.name, fieldName);

                                // Notify parent of signature field change (for party validation tracking)
                                if (onFieldChange) {
                                    onFieldChange(field.name, 'signed');
                                }
                            }

                            // Store in capture ref for export
                            const stampId = stamp.Id || `signall_${Date.now()}_${signedCount}`;
                            capturedSignatureAnnotationsRef.current.set(stampId, {
                                annotation: stamp,
                                capturedAt: Date.now(),
                                type: 'StampAnnotation',
                                subject: 'Signature'
                            });

                            signedCount++;
                        } catch (e) {
                            console.error('🖊️ [SIGN ALL] Error applying to widget:', e);
                        }
                    }

                    console.log(`🖊️ [SIGN ALL] Applied signature to ${signedCount}/${emptyWidgets.length} empty fields`);
                    return signedCount;
                } finally {
                    // Reset flag after events settle
                    setTimeout(() => { isApplyingSignAllRef.current = false; }, 500);
                }
            },

            // ═══════════════════════════════════════════════════════════════════
            // MULTI-PARTY FIELD ASSIGNMENT METHODS
            // ═══════════════════════════════════════════════════════════════════

            /**
             * Assign a field to a specific party
             * Stores the assignment in both:
             * 1. Our local ref (fieldPartyAssignmentsRef)
             * 2. The annotation's custom data (via setCustomData)
             */
            assignFieldToParty: (fieldName: string, partyId: string, partyLabel: string, partyColor: string): boolean => {
                console.log(`🏷️ [PARTY ASSIGN] Assigning field "${fieldName}" to party "${partyId}" (${partyLabel})`);

                if (!viewerInstance.current) {
                    console.error('🏷️ [PARTY ASSIGN] Viewer not initialized');
                    return false;
                }

                try {
                    const { Core } = viewerInstance.current;
                    const annotationManager = Core.annotationManager;

                    // Find the widget annotation for this field
                    const allAnnotations = annotationManager.getAnnotationsList();
                    const widgetAnnotation = allAnnotations.find((annot: any) => {
                        if (!(annot instanceof Core.Annotations.WidgetAnnotation)) return false;
                        const field = annot.getField?.();
                        return field?.name === fieldName || (annot as any).fieldName === fieldName;
                    });

                    if (!widgetAnnotation) {
                        console.warn(`🏷️ [PARTY ASSIGN] Widget annotation not found for field: ${fieldName}`);
                        // Still store in our ref even if widget not found (for template creation)
                        fieldPartyAssignmentsRef.current.set(fieldName, { partyId, partyLabel, partyColor });
                        return true;
                    }

                    // Store in annotation's custom data (persists in XFDF)
                    widgetAnnotation.setCustomData('assignedParty', partyId);
                    widgetAnnotation.setCustomData('partyLabel', partyLabel);
                    widgetAnnotation.setCustomData('partyColor', partyColor);

                    // Store in our local ref
                    fieldPartyAssignmentsRef.current.set(fieldName, { partyId, partyLabel, partyColor });

                    // Update field metadata store
                    if (fieldMetadataStoreRef.current.has(fieldName)) {
                        const existing = fieldMetadataStoreRef.current.get(fieldName);
                        fieldMetadataStoreRef.current.set(fieldName, {
                            ...existing,
                            assignedParty: partyId,
                            partyLabel: partyLabel,
                        });
                    }

                    // Visual indicator: update border color
                    try {
                        // Parse hex color to RGB
                        const hexToRgb = (hex: string): [number, number, number] => {
                            const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
                            return result ? [
                                parseInt(result[1], 16),
                                parseInt(result[2], 16),
                                parseInt(result[3], 16)
                            ] : [0, 0, 0];
                        };

                        const [r, g, b] = hexToRgb(partyColor);
                        widgetAnnotation.StrokeColor = new Core.Annotations.Color(r, g, b, 1);
                        widgetAnnotation.StrokeThickness = 2;
                        annotationManager.redrawAnnotation(widgetAnnotation);
                        console.log(`🏷️ [PARTY ASSIGN] Updated visual indicator for "${fieldName}" with color ${partyColor}`);
                    } catch (colorError) {
                        console.warn(`🏷️ [PARTY ASSIGN] Could not update visual indicator:`, colorError);
                    }

                    // Trigger callback
                    if (onPartyAssigned) {
                        onPartyAssigned(fieldName, partyId, partyLabel);
                    }

                    console.log(`✅ [PARTY ASSIGN] Successfully assigned "${fieldName}" to "${partyLabel}" (${partyId})`);
                    return true;
                } catch (error) {
                    console.error(`❌ [PARTY ASSIGN] Error assigning field:`, error);
                    return false;
                }
            },

            /**
             * Get the party assignment for a specific field
             */
            getFieldPartyAssignment: (fieldName: string): { partyId: string; partyLabel: string } | null => {
                console.log(`🔍 [PARTY ASSIGN] Getting assignment for field "${fieldName}"`);

                // First check our local ref
                const localAssignment = fieldPartyAssignmentsRef.current.get(fieldName);
                if (localAssignment) {
                    return { partyId: localAssignment.partyId, partyLabel: localAssignment.partyLabel };
                }

                // Then check the annotation's custom data
                if (!viewerInstance.current) return null;

                try {
                    const { Core } = viewerInstance.current;
                    const annotationManager = Core.annotationManager;
                    const allAnnotations = annotationManager.getAnnotationsList();

                    const widgetAnnotation = allAnnotations.find((annot: any) => {
                        if (!(annot instanceof Core.Annotations.WidgetAnnotation)) return false;
                        const field = annot.getField?.();
                        return field?.name === fieldName || (annot as any).fieldName === fieldName;
                    });

                    if (widgetAnnotation) {
                        const partyId = widgetAnnotation.getCustomData('assignedParty');
                        const partyLabel = widgetAnnotation.getCustomData('partyLabel');
                        if (partyId) {
                            return { partyId, partyLabel: partyLabel || partyId };
                        }
                    }
                } catch (error) {
                    console.warn(`🔍 [PARTY ASSIGN] Error getting assignment:`, error);
                }

                return null;
            },

            /**
             * Get all party assignments for all fields
             */
            getAllFieldPartyAssignments: (): Record<string, { partyId: string; partyLabel: string }> => {
                console.log(`🔍 [PARTY ASSIGN] Getting all field party assignments`);
                const assignments: Record<string, { partyId: string; partyLabel: string }> = {};

                // Start with local ref
                fieldPartyAssignmentsRef.current.forEach((value, key) => {
                    assignments[key] = { partyId: value.partyId, partyLabel: value.partyLabel };
                });

                // Then check annotations for any we might have missed
                if (viewerInstance.current) {
                    try {
                        const { Core } = viewerInstance.current;
                        const annotationManager = Core.annotationManager;
                        const allAnnotations = annotationManager.getAnnotationsList();

                        allAnnotations.forEach((annot: any) => {
                            if (!(annot instanceof Core.Annotations.WidgetAnnotation)) return;

                            const field = annot.getField?.();
                            const fieldName = field?.name || (annot as any).fieldName;
                            if (!fieldName) return;

                            const partyId = annot.getCustomData('assignedParty');
                            const partyLabel = annot.getCustomData('partyLabel');

                            if (partyId && !assignments[fieldName]) {
                                assignments[fieldName] = { partyId, partyLabel: partyLabel || partyId };
                            }
                        });
                    } catch (error) {
                        console.warn(`🔍 [PARTY ASSIGN] Error scanning annotations:`, error);
                    }
                }

                console.log(`🔍 [PARTY ASSIGN] Found ${Object.keys(assignments).length} assignments:`, assignments);
                return assignments;
            },

            /**
             * Highlight all fields belonging to a specific party
             * Pass null to clear highlighting
             */
            highlightPartyFields: (partyId: string | null): void => {
                console.log(`🔦 [PARTY HIGHLIGHT] Highlighting fields for party: ${partyId || 'NONE (clearing)'}`);

                if (!viewerInstance.current) return;

                try {
                    const { Core } = viewerInstance.current;
                    const annotationManager = Core.annotationManager;
                    const allAnnotations = annotationManager.getAnnotationsList();

                    allAnnotations.forEach((annot: any) => {
                        if (!(annot instanceof Core.Annotations.WidgetAnnotation)) return;

                        const field = annot.getField?.();
                        const fieldName = field?.name || (annot as any).fieldName;
                        const assignedParty = annot.getCustomData('assignedParty') ||
                            fieldPartyAssignmentsRef.current.get(fieldName)?.partyId;

                        if (partyId === null) {
                            // Clear highlighting - restore original appearance
                            annot.Opacity = 1;
                            annot.StrokeThickness = 1;
                        } else if (assignedParty === partyId) {
                            // Highlight this field
                            annot.Opacity = 1;
                            annot.StrokeThickness = 3;
                        } else {
                            // Dim other fields
                            annot.Opacity = 0.4;
                            annot.StrokeThickness = 1;
                        }

                        annotationManager.redrawAnnotation(annot);
                    });

                    console.log(`✅ [PARTY HIGHLIGHT] Highlighting updated`);
                } catch (error) {
                    console.error(`❌ [PARTY HIGHLIGHT] Error:`, error);
                }
            },

            /**
             * Export form fields with party assignment data
             */
            exportFormFieldsWithParty: async (): Promise<FormFieldDefinitionWithParty[]> => {
                console.log(`📤 [EXPORT] exportFormFieldsWithParty called`);

                const fields: FormFieldDefinitionWithParty[] = [];

                if (!viewerInstance.current) {
                    console.warn(`📤 [EXPORT] Viewer not initialized`);
                    return fields;
                }

                try {
                    const { Core } = viewerInstance.current;
                    const annotationManager = Core.annotationManager;
                    const allAnnotations = annotationManager.getAnnotationsList();

                    allAnnotations.forEach((annot: any) => {
                        if (!(annot instanceof Core.Annotations.WidgetAnnotation)) return;

                        const field = annot.getField?.();
                        const fieldName = field?.name || (annot as any).fieldName;
                        if (!fieldName) return;

                        // Get party assignment from annotation or local ref
                        const assignedParty = annot.getCustomData('assignedParty') ||
                            fieldPartyAssignmentsRef.current.get(fieldName)?.partyId ||
                            'unassigned';
                        const partyLabel = annot.getCustomData('partyLabel') ||
                            fieldPartyAssignmentsRef.current.get(fieldName)?.partyLabel ||
                            '';

                        // Determine field type
                        let fieldType = 'text';
                        if (annot instanceof Core.Annotations.SignatureWidgetAnnotation) {
                            fieldType = 'signature';
                        } else if (annot instanceof Core.Annotations.CheckButtonWidgetAnnotation) {
                            fieldType = 'checkbox';
                        } else if (annot instanceof Core.Annotations.RadioButtonWidgetAnnotation) {
                            fieldType = 'radio';
                        } else if (annot instanceof Core.Annotations.ChoiceWidgetAnnotation) {
                            fieldType = 'dropdown';
                        } else if (annot instanceof Core.Annotations.DatePickerWidgetAnnotation) {
                            fieldType = 'date';
                        }

                        const rect = annot.getRect?.() || { x1: 0, y1: 0, x2: 100, y2: 30 };

                        fields.push({
                            name: fieldName,
                            type: fieldType,
                            x: rect.x1,
                            y: rect.y1,
                            width: rect.x2 - rect.x1,
                            height: rect.y2 - rect.y1,
                            pageNumber: annot.PageNumber || 1,
                            required: field?.flags?.Required || false,
                            readOnly: field?.flags?.ReadOnly || false,
                            assignedParty,
                            partyLabel,
                            annotationId: annot.Id,
                        });
                    });

                    console.log(`✅ [EXPORT] Exported ${fields.length} fields with party data`);

                    // Trigger callback if provided
                    if (onFieldsWithPartyExported) {
                        onFieldsWithPartyExported(fields);
                    }

                    return fields;
                } catch (error) {
                    console.error(`❌ [EXPORT] Error exporting fields with party:`, error);
                    return [];
                }
            },
        }));

        // Initialize viewer once (on mount)
        useEffect(() => {
            if (!viewerDiv.current || viewerInstance.current) return;

            // ✅ CRITICAL: Prevent React 18 StrictMode from creating two WebViewer instances.
            // StrictMode does: mount → dispose (cleanup) → remount.
            // Without this guard, the cleanup nulls viewerInstance.current, causing
            // the remount to pass the guard above and create a SECOND instance.
            // Both iframes end up in the same container — user interacts with one,
            // but viewerInstance.current points to the other.
            if (isInitializingRef.current) {
                console.warn('⚠️ [INIT] Skipping duplicate WebViewer init (StrictMode detected)');
                return;
            }
            isInitializingRef.current = true;

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

                    // ✅ Clear any existing iframes in the container (safety net for StrictMode)
                    if (viewerDiv.current) {
                        while (viewerDiv.current.firstChild) {
                            viewerDiv.current.removeChild(viewerDiv.current.firstChild);
                        }
                    }

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

                        // ✅ Always show "Sign here" placeholder on signature fields
                        if (signatureTool && signatureTool.setCustomCreateSignHereElementHandler) {
                            signatureTool.setCustomCreateSignHereElementHandler((_widget: any) => {
                                const signHereElement = document.createElement('div');
                                signHereElement.style.backgroundColor = '#E8F5E9';
                                signHereElement.style.border = '2px dashed #4CAF50';
                                signHereElement.style.display = 'flex';
                                signHereElement.style.alignItems = 'center';
                                signHereElement.style.justifyContent = 'center';
                                signHereElement.style.color = '#1B5E20';
                                signHereElement.style.fontWeight = 'bold';
                                signHereElement.style.fontSize = '14px';
                                signHereElement.style.cursor = 'pointer';
                                signHereElement.style.height = '100%';
                                signHereElement.style.width = '100%';
                                signHereElement.textContent = 'Sign here';
                                return signHereElement;
                            });
                            console.log('✅ Custom sign here element handler configured (always visible)');
                        }

                        // Listen for when signature is created/selected by user
                        if (signatureTool) {
                            signatureTool.addEventListener('signatureSaved', (signatureWidgets: any) => {
                                // Get all annotations after signature is saved
                                setTimeout(() => {
                                    const allAnnots = Core.annotationManager.getAnnotationsList();

                                    // ✅ FIX: Capture ALL signature-related annotations (drawn, typed, image)
                                    // Typed signatures create StampAnnotations that may NOT have Subject='Signature'
                                    const sigAnnots = allAnnots.filter((a: any) =>
                                        a instanceof Core.Annotations.FreeHandAnnotation ||
                                        a instanceof Core.Annotations.StampAnnotation
                                    );

                                    // ✅ Capture the most recent signature for Sign All reuse
                                    if (sigAnnots.length > 0) {
                                        // Sort by most recently added (last in list is newest)
                                        const newestSig = sigAnnots[sigAnnots.length - 1];
                                        const annotId = newestSig.Id || `sig_saved_${Date.now()}`;
                                        capturedSignatureAnnotationsRef.current.set(annotId, {
                                            annotation: newestSig,
                                            capturedAt: Date.now(),
                                            type: newestSig.constructor?.name,
                                            subject: newestSig.Subject
                                        });
                                        console.log(`🖊️ [MANUAL SIGN] Captured signature: ${newestSig.constructor?.name}, Subject: ${newestSig.Subject}, Id: ${annotId}`);
                                    }

                                    console.log(`🖊️ [MANUAL SIGN] Signature saved, widgets: ${Array.isArray(signatureWidgets) ? signatureWidgets.length : 1}`);

                                    // Notify parent of signature field change (for party validation tracking)
                                    if (onFieldChange) {
                                        const widgets = Array.isArray(signatureWidgets) ? signatureWidgets : [signatureWidgets];
                                        widgets.forEach((widget: any) => {
                                            const fieldName = widget?.fieldName || widget?.getField?.()?.name;
                                            if (fieldName) {
                                                capturedFieldValuesRef.current.set(fieldName, 'signed');
                                                onFieldChange(fieldName, 'signed');
                                                console.log(`📝 [SIGNATURE TRACK] Notified parent: ${fieldName} = signed`);
                                            }
                                        });
                                    }

                                    // ✅ Check for "Sign All" opportunity after signature is fully applied
                                    if (!isApplyingSignAllRef.current && onSignatureAppliedRef.current) {
                                        setTimeout(() => {
                                            const emptyCount = getEmptySignatureWidgetCount();
                                            console.log(`🖊️ [SIGN ALL] Empty signature fields remaining: ${emptyCount}`);
                                            if (emptyCount > 0 && onSignatureAppliedRef.current) {
                                                onSignatureAppliedRef.current({ emptySignatureFieldCount: emptyCount });
                                            }
                                        }, 300);
                                    }
                                }, 100);
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
                                // ✅ FIX: Check for ALL signature-type annotations (FreeHand or ANY Stamp)
                                // Typed signatures create StampAnnotations without Subject='Signature'
                                const isSignatureAnnot =
                                    annot instanceof Core.Annotations.FreeHandAnnotation ||
                                    annot instanceof Core.Annotations.StampAnnotation;

                                if (isSignatureAnnot) {
                                    const annotId = annot.Id || annot.getCustomData?.('id') || `sig_${Date.now()}`;

                                    if (action === 'add') {

                                        // Store the annotation for later restoration
                                        capturedSignatureAnnotationsRef.current.set(annotId, {
                                            annotation: annot,
                                            capturedAt: Date.now(),
                                            type: annot.constructor?.name,
                                            subject: annot.Subject
                                        });

                                        // Find which SignatureWidgetAnnotation this signature was applied to
                                        // by matching page number and spatial overlap
                                        if (onFieldChange) {
                                            try {
                                                const sigPage = annot.PageNumber;
                                                const sigRect = annot.getRect?.();
                                                if (sigRect && sigPage) {
                                                    const allAnnots = Core.annotationManager.getAnnotationsList();
                                                    const sigWidgets = allAnnots.filter((a: any) =>
                                                        a instanceof Core.Annotations.SignatureWidgetAnnotation &&
                                                        a.PageNumber === sigPage
                                                    );

                                                    for (const widget of sigWidgets) {
                                                        const wRect = (widget as any).getRect?.();
                                                        if (!wRect) continue;

                                                        // Check if the signature overlaps the widget
                                                        const overlaps =
                                                            sigRect.x1 < wRect.x2 && sigRect.x2 > wRect.x1 &&
                                                            sigRect.y1 < wRect.y2 && sigRect.y2 > wRect.y1;

                                                        if (overlaps) {
                                                            const field = (widget as any).getField?.();
                                                            const fieldName = field?.name || (widget as any).fieldName;
                                                            if (fieldName && capturedFieldValuesRef.current.get(fieldName) !== 'signed') {
                                                                capturedFieldValuesRef.current.set(fieldName, 'signed');
                                                                // ✅ Store mapping: annotation ID → field name (for delete tracking)
                                                                const annotId = annot.Id || (annot as any).getId?.();
                                                                if (annotId) {
                                                                    signatureAnnotationToFieldRef.current.set(annotId, fieldName);
                                                                    console.log(`📝 [SIGNATURE TRACK] Mapped annotation ${annotId} → ${fieldName}`);
                                                                }
                                                                onFieldChange(fieldName, 'signed');
                                                                console.log(`📝 [SIGNATURE TRACK] Signature added on widget: ${fieldName} = signed`);
                                                            }
                                                            break;
                                                        }
                                                    }
                                                }
                                            } catch (e) {
                                                console.warn('⚠️ [SIGNATURE TRACK] Error matching signature to widget:', e);
                                            }
                                        }
                                    } else if (action === 'delete') {
                                        // ✅ FIX: When a signature is deleted, restore the widget visibility
                                        console.log(`🗑️ [SIGNATURE DELETE] Signature deleted, restoring widget`);

                                        // ✅ FIXED: Use annotation ID → field name mapping to find which field to clear
                                        const deletedAnnotId = annot.Id || (annot as any).getId?.();
                                        const mappedFieldName = deletedAnnotId ? signatureAnnotationToFieldRef.current.get(deletedAnnotId) : null;

                                        if (mappedFieldName) {
                                            console.log(`📝 [SIGNATURE DELETE] Found mapped field: ${mappedFieldName} for annotation ${deletedAnnotId}`);

                                            // Clear from captured values
                                            capturedFieldValuesRef.current.delete(mappedFieldName);
                                            signatureAnnotationToFieldRef.current.delete(deletedAnnotId);

                                            // Notify parent that signature was removed (for party validation tracking)
                                            if (onFieldChange) {
                                                onFieldChange(mappedFieldName, '');
                                                console.log(`📝 [SIGNATURE TRACK] Notified parent: ${mappedFieldName} = cleared`);
                                            }

                                            // Find and restore the widget
                                            const allAnnotations = Core.annotationManager.getAnnotationsList();
                                            const signatureWidgets = allAnnotations.filter((a: any) =>
                                                a instanceof Core.Annotations.SignatureWidgetAnnotation
                                            );

                                            signatureWidgets.forEach((widget: any) => {
                                                const field = widget.getField?.();
                                                const widgetFieldName = widget.fieldName || field?.name;
                                                if (widgetFieldName === mappedFieldName) {
                                                    try {
                                                        // Clear field value
                                                        if (field) {
                                                            field.setValue('');
                                                            field.flags.ReadOnly = false;
                                                            if (field.commit) {
                                                                try { field.commit('', widget); } catch (e) { /* ok */ }
                                                            }
                                                        }
                                                        Core.annotationManager.updateAnnotation(widget);
                                                        console.log(`✅ [SIGNATURE DELETE] Cleared widget: ${widgetFieldName}`);
                                                    } catch (e) {
                                                        console.warn('⚠️ [SIGNATURE DELETE] Could not clear widget:', e);
                                                    }
                                                }
                                            });
                                        } else {
                                            console.log(`⚠️ [SIGNATURE DELETE] No mapping found for annotation ${deletedAnnotId}`);
                                        }

                                        // Remove from captured signatures
                                        capturedSignatureAnnotationsRef.current.delete(annotId);
                                    }


                                }

                                // ✅ NEW: Handle signature widget changes to update "Sign here" placeholder
                                if (annot instanceof Core.Annotations.SignatureWidgetAnnotation && (action === 'modify' || action === 'add')) {
                                    // Refresh the "Sign here" element for this widget
                                    setTimeout(() => {
                                        const signatureTool = Core.documentViewer.getTool('AnnotationCreateSignature') as any;
                                        if (signatureTool && signatureTool.setCustomCreateSignHereElementHandler) {
                                            // Trigger a refresh by calling the custom handler
                                            try {
                                                const element = (annot as any).element || (annot as any).elementRef?.current;
                                                if (element) {
                                                    // Force re-render of the widget element
                                                    Core.annotationManager.trigger('annotationChanged', [[annot], 'render', {}]);
                                                    console.log(`🔄 [WIDGET REFRESH] Refreshed sign here element for: ${(annot as any).fieldName}`);
                                                }
                                            } catch (e) {
                                                console.warn('⚠️ [WIDGET REFRESH] Could not refresh element:', e);
                                            }
                                        }
                                    }, 100);
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
                            // MULTI-PARTY FIELD EDITABILITY
                            // If editableParties is provided, only those parties' fields are editable
                            // ══════════════════════════════════════════════════════════════════
                            if (editableParties && editableParties.length > 0 && !effectiveReadOnly) {
                                console.log(`🏷️ [MULTI-PARTY] Configuring editability for parties: ${editableParties.join(', ')}`);

                                const annotationManager = Core.annotationManager;
                                const allAnnotations = annotationManager.getAnnotationsList();
                                const fieldManager = annotationManager.getFieldManager();

                                let editableCount = 0;
                                let readOnlyCount = 0;

                                allAnnotations.forEach((annot: any) => {
                                    if (!(annot instanceof Core.Annotations.WidgetAnnotation)) return;

                                    const field = annot.getField?.();
                                    const fieldName = field?.name || (annot as any).fieldName;
                                    if (!fieldName) return;

                                    // Get party assignment from annotation custom data
                                    const assignedParty = annot.getCustomData('assignedParty') || 'unassigned';
                                    const isEditableParty = editableParties.includes(assignedParty);

                                    // Also check if field already has a value (filled fields stay read-only)
                                    const fieldValue = field?.getValue?.() || '';
                                    const hasValue = fieldValue && fieldValue.toString().trim() !== '';

                                    if (isEditableParty && !hasValue) {
                                        // This party's field is editable
                                        if (field?.flags) {
                                            (field.flags as any).ReadOnly = false;
                                        }
                                        (annot as any).Opacity = 1;

                                        // Visual indicator: highlight editable fields
                                        const partyColor = annot.getCustomData('partyColor');
                                        if (partyColor) {
                                            try {
                                                const hexToRgb = (hex: string): [number, number, number] => {
                                                    const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
                                                    return result ? [
                                                        parseInt(result[1], 16),
                                                        parseInt(result[2], 16),
                                                        parseInt(result[3], 16)
                                                    ] : [0, 0, 0];
                                                };
                                                const [r, g, b] = hexToRgb(partyColor);
                                                (annot as any).StrokeColor = new Core.Annotations.Color(r, g, b, 1);
                                                (annot as any).StrokeThickness = 3;
                                            } catch (e) {
                                                // Ignore color errors
                                            }
                                        }
                                        editableCount++;
                                        console.log(`🏷️ [MULTI-PARTY] Field "${fieldName}" (${assignedParty}): EDITABLE`);
                                    } else {
                                        // Not this party's field or already filled - make read-only
                                        if (field?.flags) {
                                            (field.flags as any).ReadOnly = true;
                                        }
                                        (annot as any).Opacity = 0.6;
                                        readOnlyCount++;
                                        console.log(`🏷️ [MULTI-PARTY] Field "${fieldName}" (${assignedParty}): READ-ONLY`);
                                    }

                                    // Store party assignment in local ref
                                    const partyLabel = annot.getCustomData('partyLabel') || '';
                                    const partyColor = annot.getCustomData('partyColor') || '';
                                    if (assignedParty !== 'unassigned') {
                                        fieldPartyAssignmentsRef.current.set(fieldName, {
                                            partyId: assignedParty,
                                            partyLabel,
                                            partyColor
                                        });
                                    }
                                });

                                console.log(`✅ [MULTI-PARTY] Configured ${editableCount} editable, ${readOnlyCount} read-only fields`);

                                // Redraw all annotations to reflect visual changes
                                annotationManager.drawAnnotationsFromList(allAnnotations);
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
                                    // scheduleAutoSave();
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

                                        // Notify parent component of field value change (for party validation tracking)
                                        if (onFieldChange) {
                                            onFieldChange(field.name, value);
                                        }
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

                                    // scheduleAutoSave();
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

                                                // Also remove party assignment for deleted field
                                                if (fieldName && fieldPartyAssignmentsRef.current.has(fieldName)) {
                                                    fieldPartyAssignmentsRef.current.delete(fieldName);
                                                    console.log(`🗑️ [PARTY ASSIGN] Removed party assignment for: ${fieldName}`);
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
                                                // scheduleAutoSave();
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
                                            // scheduleAutoSave();
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

                            // Switch to View toolbar group (tab) so the View ribbon is shown
                            // ✅ Use initialToolbarGroup if provided, else default to View
                            const targetGroup = initialToolbarGroup || 'toolbarGroup-View';
                            safeSetToolbarGroup(UI, targetGroup);
                            console.log(`✅ Toolbar group set to ${targetGroup}`);

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

                            // ✅ Restore party assignments from formFields prop
                            // Only restore for fields that actually exist in the current PDF
                            if (formFields && formFields.length > 0) {
                                console.log(`🏷️ [PARTY] Restoring party assignments from ${formFields.length} form fields`);

                                // Build a Set of current field names from PDF
                                const currentPdfFieldNames = new Set<string>();
                                const fieldManager = Core.annotationManager.getFieldManager();
                                const allFields = fieldManager.getFields() || [];
                                const fieldsArray = Array.isArray(allFields) ? allFields : Array.from(allFields);
                                fieldsArray.forEach((f: any) => {
                                    if (f.name) currentPdfFieldNames.add(f.name);
                                });
                                console.log(`🏷️ [PARTY] Current PDF has ${currentPdfFieldNames.size} fields`);

                                let restoredCount = 0;
                                let skippedCount = 0;
                                formFields.forEach((field: any) => {
                                    if (field.assignedParty && field.assignedParty !== 'unassigned') {
                                        // Only restore if field exists in PDF
                                        if (currentPdfFieldNames.has(field.name)) {
                                            fieldPartyAssignmentsRef.current.set(field.name, {
                                                partyId: field.assignedParty,
                                                partyLabel: field.partyLabel || '',
                                                partyColor: field.partyColor || ''
                                            });
                                            restoredCount++;
                                            console.log(`🏷️ [PARTY] Restored: ${field.name} → ${field.assignedParty}`);
                                        } else {
                                            skippedCount++;
                                            console.log(`🏷️ [PARTY] Skipped (field not in PDF): ${field.name}`);
                                        }
                                    }
                                });
                                console.log(`🏷️ [PARTY] Restored ${restoredCount} party assignments, skipped ${skippedCount} (fields not in PDF)`);
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

                // ✅ In StrictMode, do NOT dispose/null the instance — it will be
                // reused on remount. Only dispose if the component is truly unmounting.
                // We can tell by checking isInitializingRef: if it's true, this is a
                // StrictMode cleanup (component will remount immediately after).
                // The real unmount will happen when the parent removes this component.
                if (viewerInstance.current) {
                    // Don't dispose — let the instance persist for the remount.
                    // The container div cleanup at the start of init handles stale iframes.
                    console.log('🔄 [CLEANUP] Keeping WebViewer instance alive (StrictMode-safe)');
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

                {/* ✅ Floating Arrow-Shaped Navigation Button */}
                {showNavButton && showAnnotationNavigation && annotations.length > 0 && (
                    <Box
                        sx={{
                            position: 'absolute',
                            left: 0,
                            top: '50%',
                            transform: 'translateY(-50%)',
                            zIndex: 1000,
                            display: 'flex',
                            alignItems: 'center',
                        }}
                    >
                        {/* Arrow-shaped button */}
                        <Box
                            onClick={async () => {
                                if (!viewerInstance.current) return;

                                const { Core } = viewerInstance.current;
                                const { documentViewer, annotationManager } = Core;
                                const formAnnotations = getFormFieldAnnotations(Core);

                                if (formAnnotations.length === 0) return;

                                // If not started yet, go to first annotation
                                if (!navStarted) {
                                    setNavStarted(true);
                                    const firstAnnotation = formAnnotations[0];
                                    console.log(`🔍 [NAV] Starting navigation - jumping to first annotation`);

                                    try {
                                        const scrollContainer = documentViewer.getScrollViewElement();
                                        if (scrollContainer) scrollContainer.style.scrollBehavior = 'smooth';
                                        annotationManager.deselectAllAnnotations();

                                        const currentPage = documentViewer.getCurrentPage();
                                        if (currentPage !== firstAnnotation.PageNumber) {
                                            documentViewer.setCurrentPage(firstAnnotation.PageNumber);
                                            await new Promise(resolve => setTimeout(resolve, 250));
                                        }

                                        annotationManager.selectAnnotation(firstAnnotation);
                                        await new Promise(resolve => setTimeout(resolve, 50));
                                        annotationManager.jumpToAnnotation(firstAnnotation);

                                        setTimeout(() => {
                                            if (scrollContainer) scrollContainer.style.scrollBehavior = 'auto';
                                        }, 600);
                                    } catch (error) {
                                        console.error('🔍 [NAV] Error during start navigation:', error);
                                        try {
                                            annotationManager.selectAnnotation(firstAnnotation);
                                            annotationManager.jumpToAnnotation(firstAnnotation);
                                        } catch (e) { console.error('🔍 [NAV] Fallback failed:', e); }
                                    }

                                    setCurrentAnnotationIndex(0);
                                    return;
                                }

                                // If at the last annotation, scroll to top and reset
                                if (currentAnnotationIndex === formAnnotations.length - 1) {
                                    console.log('🔄 [NAV] Move to top - resetting navigation');
                                    try {
                                        annotationManager.deselectAllAnnotations();
                                        const scrollContainer = documentViewer.getScrollViewElement();
                                        if (scrollContainer) {
                                            scrollContainer.style.scrollBehavior = 'smooth';
                                            scrollContainer.scrollTop = 0;
                                            setTimeout(() => {
                                                scrollContainer.style.scrollBehavior = 'auto';
                                            }, 600);
                                        }
                                        documentViewer.setCurrentPage(1);
                                    } catch (error) {
                                        console.error('🔍 [NAV] Error scrolling to top:', error);
                                    }
                                    setCurrentAnnotationIndex(0);
                                    setNavStarted(false);
                                    return;
                                }

                                // Navigate to next annotation
                                const nextIndex = currentAnnotationIndex + 1;
                                const nextAnnotation = formAnnotations[nextIndex];

                                console.log(`🔍 [NAV] Jumping to annotation ${nextIndex + 1}/${formAnnotations.length}`);

                                try {
                                    const currentPage = documentViewer.getCurrentPage();
                                    const scrollContainer = documentViewer.getScrollViewElement();
                                    if (scrollContainer) scrollContainer.style.scrollBehavior = 'smooth';

                                    annotationManager.deselectAllAnnotations();

                                    if (currentPage !== nextAnnotation.PageNumber) {
                                        documentViewer.setCurrentPage(nextAnnotation.PageNumber);
                                        await new Promise(resolve => setTimeout(resolve, 250));
                                    }

                                    annotationManager.selectAnnotation(nextAnnotation);
                                    await new Promise(resolve => setTimeout(resolve, 50));
                                    annotationManager.jumpToAnnotation(nextAnnotation);

                                    setTimeout(() => {
                                        if (scrollContainer) scrollContainer.style.scrollBehavior = 'auto';
                                    }, 600);
                                } catch (error) {
                                    console.error('🔍 [NAV] Error during navigation:', error);
                                    try {
                                        annotationManager.selectAnnotation(nextAnnotation);
                                        annotationManager.jumpToAnnotation(nextAnnotation);
                                    } catch (e) { console.error('🔍 [NAV] Fallback failed:', e); }
                                }

                                setCurrentAnnotationIndex(nextIndex);
                            }}
                            sx={{
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                backgroundColor: '#0F4C47',
                                color: '#fff',
                                fontWeight: 700,
                                fontSize: '13px',
                                letterSpacing: '0.5px',
                                padding: '10px 28px 10px 16px',
                                cursor: 'pointer',
                                clipPath: 'polygon(0% 0%, calc(100% - 18px) 0%, 100% 50%, calc(100% - 18px) 100%, 0% 100%)',
                                userSelect: 'none',
                                transition: 'background-color 0.2s ease, transform 0.15s ease',
                                whiteSpace: 'nowrap',
                                boxShadow: '2px 2px 8px rgba(0,0,0,0.3)',
                                '&:hover': {
                                    backgroundColor: '#0F4C47',
                                    transform: 'scale(1.03)',
                                },
                                '&:active': {
                                    backgroundColor: '#0F4C47',
                                    transform: 'scale(0.98)',
                                },
                            }}
                        >
                            {!navStarted
                                ? 'CLICK TO START'
                                : currentAnnotationIndex === annotations.length - 1
                                    ? 'MOVE TO TOP'
                                    : 'NEXT'
                            }
                        </Box>

                        {/* Dotted line extending from arrow */}
                        <Box
                            sx={{
                                width: '60px',
                                borderTop: '2px dotted #0F4C47',
                                marginLeft: '-2px',
                            }}
                        />
                    </Box>
                )}
            </Box>
        );
    }
);

PDFViewerContainer.displayName = 'PDFViewerContainer';

export default PDFViewerContainer;
