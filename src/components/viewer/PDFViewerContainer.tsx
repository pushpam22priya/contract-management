'use client';

import { useRef, useEffect, useState, forwardRef, useImperativeHandle, useCallback } from 'react';
import { Box, CircularProgress, Alert, IconButton, Tooltip, Stack } from '@mui/material';
import ArrowForwardIcon from '@mui/icons-material/ArrowForward';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import ReplayIcon from '@mui/icons-material/Replay';
import NavigateNextIcon from '@mui/icons-material/NavigateNext';
import NavigateBeforeIcon from '@mui/icons-material/NavigateBefore';
import { FormFieldDefinition } from '@/types/template';
import { detectFieldType, getFieldName, isWidgetAnnotation, extractWidgetFlags } from '@/utils/pdfFieldHelpers';
import { getSignatureStore } from '@/utils/signatureStore';
// import { getSignatureStore } from '@/utils/signatureStore';

interface PDFViewerContainerProps {
    documentUrl?: string;
    initialXfdf?: string;          // XFDF data to import on load (new)
    readOnly?: boolean;
    isReadOnly?: boolean;          // Alias for readOnly (new)
    commentsOnly?: boolean;
    clientSigningMode?: boolean;
    templateFormFields?: any[];
    toolbarMode?: 'annotate' | 'forms';
    defaultToolbar?: 'view' | 'forms' | 'annotate';  // Explicit default toolbar selection
    formFields?: any[];
    currentUserRole?: 'contractor' | 'client';
    onDocumentLoaded?: () => void;
    onError?: (error: string) => void;
    onFieldChange?: (fieldName: string, value: any) => void;
    onFieldLocked?: (fieldName: string, lockedBy: 'contractor' | 'client') => void;
    onSave?: (fileData: string, xfdfData: string) => void;
    onDocumentModified?: () => void; // New prop to track modifications
    showFieldNavigation?: boolean;
    actionButtons?: React.ReactNode;
    // ✅ NEW: Permission control props for field lifecycle
    canAddFormFields?: boolean;      // Controls whether new form fields can be added (form builder)
    editableFieldMode?: 'all' | 'empty-only' | 'none';  // Controls which field values can be edited
}

export interface PDFViewerHandle {
    // ✅ CRITICAL: Export full PDF AND XFDF for signature persistence
    exportAnnotations: (fieldValues?: Record<string, string>, options?: { flatten?: boolean }) => Promise<{ blob: Blob; xfdfString: string } | null>;
    exportFormFields: () => Promise<any[]>;
    getTrackedFieldValues: () => Map<string, { value: string; signatureData?: string; type: string }>;
    // ✅ NEW: Clear the centralized signature store after successful save
    clearSignatureStore: () => void;
    dispose: () => void;
    save: () => Promise<{ fileData: string; xfdfData: string } | null>;
    scrollToFirstField: () => void;
    scrollToNextField: () => void;
    scrollToPrevField: () => void;
}


function isWidgetAnnot(
    annot: any,
    Core: any
): annot is InstanceType<typeof Core.Annotations.WidgetAnnotation> {
    return annot instanceof Core.Annotations.WidgetAnnotation;
}

// Helper: Robustly get all Field objects from PDFTron v11 FieldManager.
// getFields() is documented to return Array<Field> but in practice the
// return type varies across v11 builds (plain object, Map, iterator, or
// genuine Array). This helper normalises the result.
function getAllFieldsSafe(fieldManager: any): any[] {
    try {
        const result = fieldManager.getFields();
        if (!result) return [];
        if (Array.isArray(result)) return result;
        if (typeof result[Symbol.iterator] === 'function') return Array.from(result);
        if (result instanceof Map) return Array.from(result.values());
        if (typeof result === 'object') return Object.values(result);
    } catch (e) { /* ignore */ }
    return [];
}

// Helper: Extract field metadata directly from WidgetAnnotation instances.
// This is the most reliable method in PDFTron v11 because the annotation
// list always reflects the current state, even when the FieldManager lags
// behind (e.g. during Form Builder editing sessions).
function getFieldsFromAnnotations(Core: any): any[] {
    const annotationManager = Core.annotationManager;
    const allAnnots = annotationManager.getAnnotationsList();
    const fields: any[] = [];
    const seenNames = new Set<string>();

    for (const annot of allAnnots) {
        if (!(annot instanceof Core.Annotations.WidgetAnnotation)) continue;

        const field = typeof annot.getField === 'function' ? annot.getField() : null;
        const name = field?.name
            || (typeof annot.getFieldName === 'function' ? annot.getFieldName() : null)
            || annot.fieldName;
        if (!name || seenNames.has(name)) continue;
        seenNames.add(name);

        // Build a lightweight field-like object the rest of the code can consume
        fields.push({
            name,
            type: field?.type ?? 'unknown',
            getValue: () => (field && typeof field.getValue === 'function' ? field.getValue() : ''),
            widgets: field?.widgets?.length ? field.widgets : [annot],
            _annotation: annot,
        });
    }
    return fields;
}

// Helper: Get sorted fields (for navigation). Uses annotation-based
// extraction with FieldManager fallback.
function getSortedFields(Core: any) {
    const { annotationManager } = Core;
    const fieldManager = annotationManager.getFieldManager();

    let fields = getAllFieldsSafe(fieldManager);
    if (fields.length === 0) {
        fields = getFieldsFromAnnotations(Core);
    }
    if (fields.length === 0) return [];

    return [...fields].sort((a: any, b: any) => {
        const aWidget = a.widgets?.[0] || a._annotation;
        const bWidget = b.widgets?.[0] || b._annotation;
        if (!aWidget || !bWidget) return 0;
        const aPage = aWidget.PageNumber ?? aWidget.getPageNumber?.();
        const bPage = bWidget.PageNumber ?? bWidget.getPageNumber?.();
        if (aPage !== bPage) return aPage - bPage;
        const aY = aWidget.Y ?? aWidget.getRect?.()?.y1 ?? 0;
        const bY = bWidget.Y ?? bWidget.getRect?.()?.y1 ?? 0;
        return aY - bY;
    });
}

// Helper: Focus a specific field, smooth-scroll to it, and activate it for input
function focusField(Core: any, field: any) {
    const { documentViewer, annotationManager } = Core;
    const widget = field.widgets?.[0];
    if (!widget) return;

    // Find the actual annotation for this field
    const annotation = annotationManager.getAnnotationsList().find(
        (annot: any) => annot.getField && annot.getField()?.name === field.name
    );

    if (!annotation) {
        documentViewer.setCurrentPage(widget.PageNumber, true);
        return;
    }

    // 1. Select the annotation visually
    try {
        annotationManager.deselectAllAnnotations();
        annotationManager.selectAnnotation(annotation);
    } catch (err) { }

    // 2. Smooth scroll: use jumpToAnnotation to find target, then animate there
    const scrollElement = documentViewer.getScrollViewElement();
    if (scrollElement) {
        const oldTop = scrollElement.scrollTop;
        const oldLeft = scrollElement.scrollLeft;

        // Jump instantly to calculate the target scroll position
        annotationManager.jumpToAnnotation(annotation);

        const targetTop = scrollElement.scrollTop;
        const targetLeft = scrollElement.scrollLeft;

        // Reset to original position, then animate smoothly
        scrollElement.scrollTop = oldTop;
        scrollElement.scrollLeft = oldLeft;

        scrollElement.scrollTo({
            top: targetTop,
            left: targetLeft,
            behavior: 'smooth'
        });
    } else {
        // Fallback: instant jump
        annotationManager.jumpToAnnotation(annotation);
    }

    // 3. Focus the field for input after scroll settles
    const activateField = () => {
        try {
            const fieldObj = annotation.getField?.();
            if (fieldObj?.type === 'Sig') return;

            annotationManager.drawAnnotationsFromList([annotation]);

            if (typeof widget.focus === 'function') widget.focus();
            if (annotationManager.trigger) annotationManager.trigger('annotationDoubleClicked', annotation);

            const iframeDoc = document.querySelector('iframe')?.contentDocument;
            if (iframeDoc) {
                const activeInput = iframeDoc.querySelector('input:focus, textarea:focus');
                if (activeInput) (activeInput as HTMLElement).focus();
            }
        } catch (err) { }
    };

    setTimeout(activateField, 500);
    setTimeout(activateField, 900);
}

const PDFViewerContainer = forwardRef<PDFViewerHandle, PDFViewerContainerProps>(
    ({ documentUrl, initialXfdf, readOnly = false, isReadOnly, commentsOnly = false, clientSigningMode = false, templateFormFields, toolbarMode = 'annotate', defaultToolbar, formFields, currentUserRole, onDocumentLoaded, onError, onFieldChange, onFieldLocked, onSave, onDocumentModified, showFieldNavigation = false, actionButtons, canAddFormFields = false, editableFieldMode = 'all' }, ref) => {

        // Use isReadOnly if provided, otherwise fall back to readOnly
        const effectiveReadOnly = isReadOnly ?? readOnly;

        const viewerDiv = useRef<HTMLDivElement>(null);
        const viewerInstance = useRef<any>(null);
        const modifiedFields = useRef<Set<string>>(new Set()); // Track modified fields for smart export
        const [loading, setLoading] = useState(true);
        const [error, setError] = useState<string>('');

        const createdFormFieldsRef = useRef<FormFieldDefinition[]>([]);

        // ✅ NEW: Store actual annotation OBJECTS for fallback re-adding
        // PDFTron sometimes loses annotations from getAnnotationsList() during fast saves
        const createdAnnotationsRef = useRef<any[]>([]);

        // ✅ NEW: Track field VALUES in memory (including signature appearances)
        // This ensures values aren't lost during fast saves
        // Key: fieldName, Value: { value: string, signatureData?: string, appearanceBlob?: Blob }
        const trackedFieldValuesRef = useRef<Map<string, {
            value: string;
            signatureData?: string;      // Base64 signature image data
            appearanceBlob?: Blob;       // Signature appearance blob
            annotationId?: string;       // Associated annotation ID
            type: 'text' | 'signature' | 'checkbox' | 'other';
        }>>(new Map());

        // ✅ FIX: Use a ref to avoid stale closure in documentLoaded handler
        const initialXfdfRef = useRef<string | undefined>(initialXfdf);

        // ✅ FIX: Also use a ref for formFields to avoid stale closure
        const formFieldsRef = useRef<any[] | undefined>(formFields);

        // ✅ NEW: Track the last selected field name for robust Next/Prev navigation
        // focus is often lost when clicking external buttons, so we need to remember where we were
        const lastSelectedFieldNameRef = useRef<string | null>(null);

        // ══════════════════════════════════════════════════════════════════
        // SESSION-SCOPED TRACKING: Only recover fields the current user
        // has actually modified in THIS session. Prevents cross-session pollution.
        // ══════════════════════════════════════════════════════════════════
        const sessionModifiedFieldsRef = useRef<Set<string>>(new Set());

        // ✅ NEW: Field navigation state for embedded navigation buttons
        const [navigationStarted, setNavigationStarted] = useState(false);
        const [currentFieldIndex, setCurrentFieldIndex] = useState(-1);
        const [totalFields, setTotalFields] = useState(0);

        // ✅ NEW: Store initial field values on document load for editableFieldMode='empty-only'
        // Fields with values in this map are considered "pre-filled" and cannot be edited in empty-only mode
        const initialFieldValuesRef = useRef<Map<string, string>>(new Map());

        // ✅ NEW: Track which annotations existed on document load
        // These are protected from deletion in clientSigningMode/empty-only mode
        const initialAnnotationIdsRef = useRef<Set<string>>(new Set());


        useImperativeHandle(ref, () => ({
            /**
             * ✅ CRITICAL FIX: Export full PDF with embedded signatures
             */
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

                    // Check if document is ready
                    if (!doc) {
                        console.error('Cannot export: Document not loaded');
                        return null;
                    }

                    // ══════════════════════════════════════════════════════════════════
                    // PRE-EXPORT: Force PDFTron to commit any pending annotations
                    // ══════════════════════════════════════════════════════════════════
                    console.log('[exportAnnotations] Pre-export: Committing pending annotations...');
                    try {
                        // Deselect all to finalize any in-progress edits
                        annotationManager.deselectAllAnnotations();

                        // Switch to Pan tool to finalize form field creation
                        UI.setToolMode('Pan');

                        // Force redraw to commit annotations
                        annotationManager.drawAnnotationsFromList(annotationManager.getAnnotationsList());

                        // Wait a moment for PDFTron to process
                        await new Promise(resolve => setTimeout(resolve, 300));

                        // Trigger any pending updates
                        annotationManager.trigger('annotationChanged', [[], 'render', {}]);
                    } catch (e) {
                        console.warn('[exportAnnotations] Pre-export commit warning:', e);
                    }

                    // Update form fields with latest values if provided
                    if (fieldValues) {
                        Object.entries(fieldValues).forEach(([key, value]) => {
                            const field = fieldManager.getField(key);
                            if (field) {
                                // ✅ FIX: Never set values for signature fields via text/value injection
                                // This destroys the digital signature/appearance
                                if (field.type === 'Sig') return;

                                field.setValue(value);
                                if (field.widgets) {
                                    field.widgets.forEach((w: any) => {
                                        if (w.refreshAppearance) w.refreshAppearance();
                                    });
                                }
                            }
                        });
                    }

                    // Ensure all form fields have at least an empty value for XFDF export
                    let fieldsToCheck = getAllFieldsSafe(fieldManager);
                    if (fieldsToCheck.length === 0) {
                        fieldsToCheck = getFieldsFromAnnotations(Core);
                    }

                    fieldsToCheck.forEach((field: any) => {
                        if (field.type === 'Sig') return;

                        const currentValue = field.getValue();
                        if (currentValue === null || currentValue === undefined || currentValue === '') {
                            field.setValue('');
                            // Refresh appearance to ensure it's visible
                            if (field.widgets) {
                                field.widgets.forEach((w: any) => {
                                    if (w.refreshAppearance) w.refreshAppearance();
                                });
                            }
                        }
                    });



                    // Export XFDF with all annotations (including signature widgets and stamps)
                    // ✅ CRITICAL FIX: Filter out unmodified signature widgets.
                    // If a signature widget exists in the PDF (Contractor sig) and hasn't extended/changed,
                    // re-exporting it in XFDF with an inline appearance causes " annotation" errors
                    // in getFileData because of conflicting/duplicate appearance references.
                    // We only export signatures that appear in 'modifiedFields' (newly signed).
                    let allAnnotations = annotationManager.getAnnotationsList();
                    console.log(`[exportAnnotations] PDFTron annotations: ${allAnnotations.length}`);

                    // ✅ NEW: Log SignatureStore contents for diagnostics
                    const signatureStore = getSignatureStore();
                    if (signatureStore.size > 0) {
                        console.log(`[exportAnnotations] SignatureStore has ${signatureStore.size} stored values:`);
                        const signatures = signatureStore.getSignatures();
                        if (signatures.size > 0) {
                            console.log(`    🖊️ Signatures: ${signatures.size}`);
                            for (const [name, data] of signatures.entries()) {
                                console.log(`      - ${name}: ${data.value ? 'has value' : 'empty'}, hasXfdf=${!!data.annotationXfdf}`);
                            }
                        }
                        const textFields = signatureStore.getTextFields();
                        if (textFields.size > 0) {
                            console.log(`    📝 Text fields: ${textFields.size}`);
                        }
                    }

                    // ══════════════════════════════════════════════════════════════════
                    // FALLBACK RECOVERY: If PDFTron lost signature stamps, re-add them
                    // Uses stored annotation objects from createdAnnotationsRef
                    // ══════════════════════════════════════════════════════════════════
                    const storedSignatures = signatureStore.getSignatures();

                    // ══════════════════════════════════════════════════════════════════
                    // TEXT FIELD RECOVERY: Restore lost text field values
                    // ONLY for fields modified in this session
                    // ══════════════════════════════════════════════════════════════════
                    const storedTextFields = signatureStore.getTextFields();
                    if (storedTextFields.size > 0) {
                        let recoveredTextCount = 0;
                        for (const [fieldName, data] of storedTextFields.entries()) {
                            // ✅ SESSION CHECK: Only recover fields modified in THIS session
                            if (!sessionModifiedFieldsRef.current.has(fieldName)) continue;

                            const field = fieldManager.getField(fieldName);
                            if (field) {
                                const currentValue = field.getValue();
                                // If PDFTron has lost the value (empty) but we have it stored
                                if ((!currentValue || currentValue === '') && data.value) {
                                    try {
                                        console.log(`    Before Recovery: ${fieldName} value="${currentValue}"`);
                                        field.setValue(data.value);
                                        console.log(`    ✅ RECOVERED TEXT: ${fieldName} restored to "${data.value}"`);
                                        recoveredTextCount++;
                                    } catch (e) {
                                        console.warn(`    ❌ Failed to restore text for ${fieldName}:`, e);
                                    }
                                }
                            }
                        }
                        if (recoveredTextCount > 0) {
                            // Allow DOM to update
                            await new Promise(resolve => setTimeout(resolve, 50));
                        }
                    }

                    if (storedSignatures.size > 0) {
                        const currentAnnotIds = new Set(allAnnotations.map((a: any) => a.Id));
                        let recoveredCount = 0;

                        for (const [fieldName, sigData] of storedSignatures.entries()) {
                            // ✅ SCOPED RECOVERY: Only recover fields modified in THIS session
                            // This prevents "ghost" signatures from previous sessions/documents
                            if (!sessionModifiedFieldsRef.current.has(fieldName)) {
                                continue;
                            }

                            const stampMissing = sigData.stampAnnotationId && !currentAnnotIds.has(sigData.stampAnnotationId);


                            if (stampMissing) {
                                console.log(`    🔄 Signature ${fieldName} stamp missing, attempting recovery...`);

                                // Try to find the annotation object in createdAnnotationsRef
                                const storedAnnot = createdAnnotationsRef.current.find(
                                    (a: any) => a.Id === sigData.stampAnnotationId
                                );

                                if (storedAnnot) {
                                    try {
                                        // Re-add the annotation object to PDFTron
                                        annotationManager.addAnnotation(storedAnnot);
                                        annotationManager.redrawAnnotation(storedAnnot);
                                        recoveredCount++;
                                        console.log(`    ✅ Recovered: ${fieldName} (annotation ${sigData.stampAnnotationId})`);
                                    } catch (e) {
                                        console.warn(`    ❌ Failed to recover ${fieldName}:`, e);
                                    }
                                } else {
                                    console.log(`    ⚠️ Cannot recover ${fieldName} - annotation object not found in store`);
                                }
                            }
                        }

                        if (recoveredCount > 0) {
                            // Refresh annotation list after recovery
                            await new Promise(resolve => setTimeout(resolve, 100));
                            allAnnotations = annotationManager.getAnnotationsList();
                            console.log(`    📊 After recovery: ${allAnnotations.length} annotations`);
                        }
                    }



                    // ══════════════════════════════════════════════════════════════════
                    // BUILD A SET OF SIGNATURE WIDGET NAMES THAT HAVE STAMP OVERLAYS
                    // These are signatures that were loaded from XFDF/PDF and should be preserved
                    // ══════════════════════════════════════════════════════════════════
                    const widgetsWithStampOverlay = new Set<string>();
                    const allStamps = allAnnotations.filter((a: any) =>
                        a instanceof Core.Annotations.StampAnnotation ||
                        a instanceof Core.Annotations.FreeHandAnnotation
                    );
                    const allSigWidgets = allAnnotations.filter((a: any) =>
                        a instanceof Core.Annotations.SignatureWidgetAnnotation
                    );

                    for (const widget of allSigWidgets) {
                        const widgetRect = widget.getRect();
                        const widgetPage = widget.getPageNumber();
                        const fieldName = widget.getField?.()?.name || widget.fieldName;

                        // Check if any stamp/freehand overlaps this widget
                        const hasOverlay = allStamps.some((stamp: any) => {
                            if (stamp.getPageNumber() !== widgetPage) return false;
                            const stampRect = stamp.getRect();
                            // Check center point overlap
                            const stampCenterX = (stampRect.x1 + stampRect.x2) / 2;
                            const stampCenterY = (stampRect.y1 + stampRect.y2) / 2;
                            return stampCenterX >= widgetRect.x1 && stampCenterX <= widgetRect.x2 &&
                                stampCenterY >= widgetRect.y1 && stampCenterY <= widgetRect.y2;
                        });

                        if (hasOverlay && fieldName) {
                            widgetsWithStampOverlay.add(fieldName);
                            console.log(`  📌 Widget ${fieldName} has stamp overlay — will preserve`);
                        }
                    }

                    const annotationsForExport = allAnnotations.filter((annot: any) => {
                        // ✅ ALWAYS include stamp and freehand annotations (actual signature drawings)
                        if (annot instanceof Core.Annotations.StampAnnotation ||
                            annot instanceof Core.Annotations.FreeHandAnnotation) {
                            console.log(`  ✓ Including stamp/freehand annotation: ${annot.Id}`);
                            return true;
                        }

                        // For non-widgets (other annotations), always include
                        if (!annot.getField || !annot.getField()) return true;

                        const field = annot.getField();
                        if (field.type === 'Sig') {
                            const fieldName = field.name;

                            // 1. If modified in this session, definitely export
                            if (modifiedFields.current.has(fieldName)) {
                                console.log(`  ✓ Including signature ${fieldName}: modified in session`);
                                return true;
                            }

                            // 2. ✅ FIX: If widget has a stamp overlay (pre-existing signature), INCLUDE it
                            // This preserves signatures loaded from XFDF
                            if (widgetsWithStampOverlay.has(fieldName)) {
                                console.log(`  ✓ Including signature ${fieldName}: has stamp overlay (pre-existing)`);
                                return true;
                            }

                            // 3. If empty placeholder, include it
                            const val = field.getValue();
                            const isSigned = val !== null && val !== undefined && val !== '';
                            if (!isSigned) {
                                console.log(`  ✓ Including signature ${fieldName}: empty placeholder`);
                                return true;
                            }

                            // 4. Skip only if truly baked into PDF (has value but no visible stamp)
                            console.log(`  ⏭ Skipping signature ${fieldName}: appears baked into PDF`);
                            return false;
                        }
                        return true; // Include other fields (Text, etc.)
                    });

                    console.log(`[exportAnnotations] Exporting ${annotationsForExport.length}/${allAnnotations.length} annotations to XFDF`);

                    const xfdfString = await annotationManager.exportAnnotations({
                        annotList: annotationsForExport,
                        widgets: true,
                        fields: true,
                        links: true,
                        generateInlineAppearances: true
                    });

                    // Get PDF data with annotations baked in
                    const shouldFlatten = options?.flatten ?? false;

                    let pdfData: ArrayBuffer;
                    try {
                        pdfData = await doc.getFileData({
                            xfdfString,
                            flatten: shouldFlatten
                        });
                    } catch (getFileError: any) {
                        // Handle /FT attribute error by retrying without flatten
                        if (getFileError?.message?.includes('/FT') || getFileError?.message?.includes('field attribute')) {
                            console.warn('[exportAnnotations] Field type error, retrying without flatten...');
                            try {
                                pdfData = await doc.getFileData({
                                    xfdfString,
                                    flatten: false
                                });
                            } catch (retryError: any) {
                                // Final fallback: export without xfdf
                                console.warn('[exportAnnotations] Still failing, exporting base PDF without annotations...');
                                pdfData = await doc.getFileData({});
                            }
                        } else {
                            throw getFileError;
                        }
                    }

                    // Convert to base64
                    const arr = new Uint8Array(pdfData);
                    const blob = new Blob([arr], { type: 'application/pdf' });

                    const base64 = await new Promise<string>((resolve, reject) => {
                        const reader = new FileReader();
                        reader.onload = () => {
                            const result = reader.result as string;
                            resolve(result);
                        };
                        reader.onerror = reject;
                        reader.readAsDataURL(blob);
                    });

                    if (onSave) onSave(base64, xfdfString);

                    return { blob, xfdfString };

                } catch (error) {
                    console.error('PDF export failed:', error);
                    return null;
                }
            },

            exportFormFields: async () => {
                if (!viewerInstance.current) return [];

                try {
                    const { Core, UI } = viewerInstance.current;
                    const annotationManager = Core.annotationManager;
                    const fieldManager = annotationManager.getFieldManager();

                    // ══════════════════════════════════════════════════════════════════
                    // STEP 0: Start with PROP fields (previously saved from DB)
                    // ══════════════════════════════════════════════════════════════════
                    // These are fields passed via the formFields prop, representing the
                    // authoritative state from the database. We start with these as base
                    // to ensure fields from previous stages (e.g., signed during creation)
                    // are NOT lost when editing drafts.
                    const propFields = formFieldsRef.current ? [...formFieldsRef.current] : [];
                    const propFieldNames = new Set(propFields.map((f: any) => f.name));

                    console.log(`[exportFormFields] Prop fields (from DB): ${propFields.length}`);
                    if (propFields.length > 0) {
                        console.log(`  Prop field names: ${Array.from(propFieldNames).join(', ')}`);
                    }

                    // ══════════════════════════════════════════════════════════════════
                    // STEP 1: Add MEMORY-TRACKED fields (newly created this session)
                    // ══════════════════════════════════════════════════════════════════
                    // These are captured in real-time via annotationChanged listener.
                    // Only fields created when canAddFormFields=true go here.
                    const trackedFields = [...createdFormFieldsRef.current];
                    const trackedFieldNames = new Set(trackedFields.map(f => f.name));

                    console.log(`[exportFormFields] Memory-tracked fields: ${trackedFields.length}`);

                    // ══════════════════════════════════════════════════════════════════
                    // STEP 2: Also query PDFTron for any pre-existing fields
                    // ══════════════════════════════════════════════════════════════════
                    // This catches fields that were loaded from XFDF/existing document
                    // and not created during this session.

                    // Pre-export flush (optional, helps sync state)
                    try {
                        annotationManager.deselectAllAnnotations();

                        const waitForSwitch = () => new Promise<void>((resolve) => {
                            let resolved = false;
                            const timeout = setTimeout(() => {
                                if (!resolved) { resolved = true; resolve(); }
                            }, 500); // Reduced timeout since we have memory-tracked fallback
                            const handler = () => {
                                if (!resolved) {
                                    resolved = true;
                                    clearTimeout(timeout);
                                    Core.documentViewer.removeEventListener('toolModeUpdated', handler);
                                    resolve();
                                }
                            };
                            Core.documentViewer.addEventListener('toolModeUpdated', handler);
                        });

                        const switchPromise = waitForSwitch();
                        UI.setToolMode('Pan');
                        await switchPromise;

                        // Quick annotation manager sync
                        annotationManager.drawAnnotationsFromList(annotationManager.getAnnotationsList());
                        await new Promise(resolve => setTimeout(resolve, 100));
                    } catch (e) {
                        // Non-critical - we have memory-tracked fields as fallback
                    }

                    // Scan PDFTron's annotation list for additional fields
                    const pdfTronFields: any[] = [];
                    const allAnnots = annotationManager.getAnnotationsList();
                    const pdfTronSeenNames = new Set<string>();

                    for (const annot of allAnnots) {
                        if (!(annot instanceof Core.Annotations.WidgetAnnotation)) continue;

                        const field = typeof annot.getField === 'function' ? annot.getField() : null;
                        const name = field?.name
                            || (typeof annot.getFieldName === 'function' ? annot.getFieldName() : null)
                            || annot.fieldName;
                        if (!name || pdfTronSeenNames.has(name)) continue;
                        pdfTronSeenNames.add(name);

                        const rect = annot.getRect();
                        const pageNumber = annot.getPageNumber();

                        // Detect type
                        let type = 'text';
                        const fieldType = field?.type || '';
                        if (fieldType === 'Sig' || annot instanceof Core.Annotations.SignatureWidgetAnnotation) {
                            type = 'signature';
                        } else if (fieldType === 'Btn') {
                            type = 'checkbox';
                        }

                        // Detect value
                        let value = typeof field?.getValue === 'function' ? field.getValue() : '';
                        let signatureData: string | undefined;
                        let stampAnnotationId: string | undefined;

                        if (type === 'signature') {
                            // ✅ FIX: Also check for stamp overlay to detect appearance-based signatures
                            const widgetRect = annot.getRect();
                            const widgetPage = annot.getPageNumber();
                            const stampOverlay = allAnnots.find((stamp: any) => {
                                if (!(stamp instanceof Core.Annotations.StampAnnotation ||
                                    stamp instanceof Core.Annotations.FreeHandAnnotation)) return false;
                                if (stamp.getPageNumber() !== widgetPage) return false;
                                const stampRect = stamp.getRect();
                                const stampCenterX = (stampRect.x1 + stampRect.x2) / 2;
                                const stampCenterY = (stampRect.y1 + stampRect.y2) / 2;
                                return stampCenterX >= widgetRect.x1 && stampCenterX <= widgetRect.x2 &&
                                    stampCenterY >= widgetRect.y1 && stampCenterY <= widgetRect.y2;
                            });

                            // ✅ Extract actual signature data instead of just "Signed"
                            const customSigData = typeof annot.getCustomData === 'function'
                                ? annot.getCustomData('trn-signature-data')
                                : undefined;

                            const hasSignature =
                                stampOverlay ||
                                customSigData ||
                                (typeof annot.getAppearance === 'function' && annot.getAppearance() !== null) ||
                                (typeof annot.isSignedDigitalSignature === 'function' && annot.isSignedDigitalSignature());

                            if (hasSignature) {
                                // Store signature data if available
                                signatureData = customSigData || (stampOverlay?.getCustomData?.('trn-signature-data'));
                                stampAnnotationId = stampOverlay?.Id;
                                // Use actual signature data as value if available, otherwise fallback to 'Signed'
                                value = signatureData || 'Signed';
                            } else {
                                value = '';
                            }
                        }

                        pdfTronFields.push({
                            name,
                            type,
                            x: rect.x1,
                            y: rect.y1,
                            width: rect.x2 - rect.x1,
                            height: rect.y2 - rect.y1,
                            pageNumber,
                            label: name,
                            value,
                            signatureData,
                            stampAnnotationId, // Track for deduplication
                        });
                    }

                    // Also try FieldManager as additional source
                    const allFields = getAllFieldsSafe(fieldManager);
                    for (const field of allFields) {
                        if (pdfTronSeenNames.has(field.name)) continue;

                        const widget = field.widgets?.[0];
                        if (!widget) continue;

                        pdfTronSeenNames.add(field.name);
                        const rect = widget.getRect();
                        const pageNumber = widget.getPageNumber();
                        let type = 'text';
                        if (field.type === 'Sig') type = 'signature';
                        else if (field.type === 'Btn') type = 'checkbox';

                        let value = typeof field.getValue === 'function' ? field.getValue() : '';
                        let signatureData: string | undefined;
                        let stampAnnotationId: string | undefined;

                        if (type === 'signature') {
                            // Check for stamp overlay on this signature widget
                            const widgetRect = widget.getRect();
                            const widgetPage = widget.getPageNumber();
                            const stampOverlay = allAnnots.find((stamp: any) => {
                                if (!(stamp instanceof Core.Annotations.StampAnnotation ||
                                    stamp instanceof Core.Annotations.FreeHandAnnotation)) return false;
                                if (stamp.getPageNumber() !== widgetPage) return false;
                                const stampRect = stamp.getRect();
                                const stampCenterX = (stampRect.x1 + stampRect.x2) / 2;
                                const stampCenterY = (stampRect.y1 + stampRect.y2) / 2;
                                return stampCenterX >= widgetRect.x1 && stampCenterX <= widgetRect.x2 &&
                                    stampCenterY >= widgetRect.y1 && stampCenterY <= widgetRect.y2;
                            });

                            const customSigData = widget.getCustomData?.('trn-signature-data');

                            if (stampOverlay || customSigData || value) {
                                signatureData = customSigData || stampOverlay?.getCustomData?.('trn-signature-data');
                                stampAnnotationId = stampOverlay?.Id;
                                value = signatureData || 'Signed';
                            } else {
                                value = '';
                            }
                        }

                        pdfTronFields.push({
                            name: field.name,
                            type,
                            x: rect.x1,
                            y: rect.y1,
                            width: rect.x2 - rect.x1,
                            height: rect.y2 - rect.y1,
                            pageNumber,
                            label: field.name,
                            value,
                            signatureData,
                            stampAnnotationId,
                        });
                    }

                    console.log(`[exportFormFields] PDFTron fields: ${pdfTronFields.length} (${allAnnots.length} annotations scanned)`);

                    // ══════════════════════════════════════════════════════════════════
                    // STEP 3: MERGE all field sources (deduplicated)
                    // ══════════════════════════════════════════════════════════════════
                    // Priority order (later sources update earlier ones):
                    // 1. propFields (from DB - includes data from previous stages like creation)
                    // 2. trackedFields (newly created this session when canAddFormFields=true)
                    // 3. pdfTronFields (current state from PDFTron annotations)
                    // This ensures fields from ALL stages are preserved.

                    const mergedFields: any[] = [...propFields]; // Start with DB fields
                    const mergedFieldNames = new Set(propFieldNames);

                    // Layer 2: Add tracked fields (new fields created this session)
                    for (const trackedField of trackedFields) {
                        if (!mergedFieldNames.has(trackedField.name)) {
                            mergedFields.push(trackedField);
                            mergedFieldNames.add(trackedField.name);
                        } else {
                            // Update existing field with tracked data (new field may have updated structure)
                            const existingIdx = mergedFields.findIndex(f => f.name === trackedField.name);
                            if (existingIdx > -1) {
                                // Keep the value from the existing field if it has one
                                const existingValue = mergedFields[existingIdx]?.value;
                                mergedFields[existingIdx] = {
                                    ...mergedFields[existingIdx],
                                    ...trackedField,
                                    value: (trackedField as any).value || existingValue, // Keep existing value if tracked is empty
                                };
                            }
                        }
                    }

                    // Layer 3: Update with PDFTron fields (current annotation state)
                    for (const pdfField of pdfTronFields) {
                        if (!mergedFieldNames.has(pdfField.name)) {
                            mergedFields.push(pdfField);
                            mergedFieldNames.add(pdfField.name);
                        } else {
                            // Field exists - update value if PDFTron has one
                            const existingIdx = mergedFields.findIndex(f => f.name === pdfField.name);
                            if (existingIdx > -1) {
                                const existingValue = mergedFields[existingIdx]?.value;
                                const existingIsEmpty = !existingValue || existingValue === '';
                                const pdfHasValue = pdfField.value && pdfField.value !== '';

                                // CRITICAL: Only update value if:
                                // 1. PDFTron has a value AND existing is empty, OR
                                // 2. PDFTron has a value (prefer current state)
                                // But NEVER overwrite a filled value with empty!
                                if (pdfHasValue) {
                                    mergedFields[existingIdx] = {
                                        ...mergedFields[existingIdx],
                                        value: pdfField.value,
                                        signatureData: pdfField.signatureData || mergedFields[existingIdx].signatureData,
                                    };
                                } else if (!existingIsEmpty) {
                                    // PDFTron is empty but existing has value - keep existing
                                    // Just update position/geometry from PDFTron
                                    mergedFields[existingIdx] = {
                                        ...mergedFields[existingIdx],
                                        x: pdfField.x,
                                        y: pdfField.y,
                                        width: pdfField.width,
                                        height: pdfField.height,
                                        pageNumber: pdfField.pageNumber,
                                    };
                                }
                            }
                        }
                    }

                    // ══════════════════════════════════════════════════════════════════
                    // STEP 4: Apply tracked VALUES from memory (ensures filled values aren't lost)
                    // ══════════════════════════════════════════════════════════════════
                    const trackedValues = trackedFieldValuesRef.current;
                    if (trackedValues.size > 0) {
                        console.log(`[exportFormFields] Applying ${trackedValues.size} tracked values`);
                        for (const [fieldName, valueData] of trackedValues.entries()) {
                            const fieldIdx = mergedFields.findIndex(f => f.name === fieldName);
                            if (fieldIdx > -1) {
                                // Update value from tracked memory
                                mergedFields[fieldIdx] = {
                                    ...mergedFields[fieldIdx],
                                    value: valueData.value || mergedFields[fieldIdx].value,
                                    signatureData: valueData.signatureData,
                                    hasTrackedValue: true,
                                };
                                console.log(`  → Applied tracked value for ${fieldName}: "${valueData.value || '(sig)'}"`)
                            }
                        }
                    }

                    // ══════════════════════════════════════════════════════════════════
                    // PURE FALLBACK: Only apply SignatureStore values if PDFTron has no data
                    // This is for fast-save scenarios where PDFTron loses signatures
                    // ══════════════════════════════════════════════════════════════════
                    const signatureStore = getSignatureStore();
                    if (signatureStore.size > 0) {
                        const storedValues = signatureStore.getAll();
                        let appliedCount = 0;

                        for (const [fieldName, storedData] of storedValues.entries()) {
                            const fieldIdx = mergedFields.findIndex(f => f.name === fieldName);
                            if (fieldIdx > -1) {
                                const currentValue = mergedFields[fieldIdx].value;
                                // ONLY apply if PDFTron has no value (empty/null/undefined)
                                const hasNoValue = !currentValue || currentValue === '' || currentValue === 'null' || currentValue === 'undefined';

                                if (hasNoValue && storedData.value) {
                                    mergedFields[fieldIdx] = {
                                        ...mergedFields[fieldIdx],
                                        value: storedData.value,
                                        signatureData: storedData.signatureData,
                                        recoveredFromFallback: true,
                                    };
                                    appliedCount++;
                                    console.log(`  🔄 FALLBACK APPLIED: ${fieldName} recovered from store`);
                                }
                            }
                        }

                        if (appliedCount > 0) {
                            console.log(`[exportFormFields] Recovered ${appliedCount}/${signatureStore.size} fields from fallback store`);
                        }
                    }


                    console.log(`[exportFormFields] FINAL: ${mergedFields.length} fields (${trackedFields.length} tracked + ${pdfTronFields.length} PDFTron, deduplicated)`);

                    // ══════════════════════════════════════════════════════════════════
                    // FINAL DEDUPLICATION: Ensure no duplicate field names exist
                    // Also hide "Sign here" indicators for signed fields
                    // ══════════════════════════════════════════════════════════════════
                    const seenNames = new Set<string>();
                    const deduplicatedFields: any[] = [];

                    for (const field of mergedFields) {
                        if (!field.name || seenNames.has(field.name)) {
                            console.log(`  ⚠️ Duplicate skipped: ${field.name}`);
                            continue;
                        }
                        seenNames.add(field.name);
                        deduplicatedFields.push(field);

                        // Hide "Sign here" indicator for signed signature fields
                        if (field.type === 'signature' && field.value) {
                            try {
                                const annots = annotationManager.getAnnotationsList();
                                const sigWidget = annots.find((a: any) =>
                                    a instanceof Core.Annotations.SignatureWidgetAnnotation &&
                                    (a.fieldName === field.name || a.getField?.()?.name === field.name)
                                );
                                if (sigWidget && typeof (sigWidget as any).setFieldIndicator === 'function') {
                                    (sigWidget as any).setFieldIndicator(false);
                                }
                            } catch (e) {
                                // Non-critical
                            }
                        }
                    }

                    if (deduplicatedFields.length !== mergedFields.length) {
                        console.log(`  🔄 Deduplication: ${mergedFields.length} → ${deduplicatedFields.length} fields`);
                    }

                    // ══════════════════════════════════════════════════════════════════
                    // LAST RESORT: If still no fields, return tracked fields only
                    // ══════════════════════════════════════════════════════════════════
                    if (deduplicatedFields.length === 0 && trackedFields.length > 0) {
                        console.log('[exportFormFields] Returning memory-tracked fields as fallback');
                        return trackedFields;
                    }

                    return deduplicatedFields;
                } catch (e) {
                    console.error('exportFormFields failed:', e);
                    // FALLBACK: Return memory-tracked fields even on error
                    if (createdFormFieldsRef.current.length > 0) {
                        console.log('[exportFormFields] Returning memory-tracked fields after error');
                        return [...createdFormFieldsRef.current];
                    }
                    return [];
                }
            },

            // ✅ NEW: Get all tracked field values (for debugging and fallback)
            getTrackedFieldValues: () => {
                console.log(`[getTrackedFieldValues] Returning ${trackedFieldValuesRef.current.size} tracked values`);
                return new Map(trackedFieldValuesRef.current);
            },

            save: async () => {
                if (!viewerInstance.current) return null;
                // We utilize exportAnnotations which returns { blob, xfdfString }
                // We need to return { fileData: base64, xfdfData: xfdfString }

                try {
                    const exportResult = await ((ref as any).current || ref)?.exportAnnotations?.();
                    if (!exportResult) return null;

                    const { blob, xfdfString } = exportResult;

                    const base64 = await new Promise<string>((resolve, reject) => {
                        const reader = new FileReader();
                        reader.onload = () => resolve(reader.result as string);
                        reader.onerror = reject;
                        reader.readAsDataURL(blob);
                    });

                    return { fileData: base64, xfdfData: xfdfString };
                } catch (e) {
                    console.error('Save alias failed', e);
                    return null;
                }
            },

            scrollToFirstField: () => {
                if (viewerInstance.current) {
                    const sorted = getSortedFields(viewerInstance.current.Core);
                    if (sorted.length > 0) {
                        focusField(viewerInstance.current.Core, sorted[0]);
                        lastSelectedFieldNameRef.current = sorted[0].name;
                    }
                }
            },

            scrollToNextField: () => {
                if (viewerInstance.current) {
                    const { Core } = viewerInstance.current;
                    const sorted = getSortedFields(Core);
                    if (sorted.length === 0) return;

                    let currentIndex = -1;
                    const { annotationManager } = Core;
                    const selected = annotationManager.getSelectedAnnotations();
                    if (selected.length > 0) {
                        const fieldName = selected[0].getField?.()?.name;
                        if (fieldName) currentIndex = sorted.findIndex((f: any) => f.name === fieldName);
                    }

                    if (currentIndex === -1 && lastSelectedFieldNameRef.current) {
                        currentIndex = sorted.findIndex((f: any) => f.name === lastSelectedFieldNameRef.current);
                    }

                    const nextIndex = (currentIndex + 1) % sorted.length;
                    const nextField = sorted[nextIndex];

                    focusField(Core, nextField);
                    lastSelectedFieldNameRef.current = nextField.name;
                }
            },

            scrollToPrevField: () => {
                if (viewerInstance.current) {
                    const { Core } = viewerInstance.current;
                    const sorted = getSortedFields(Core);
                    if (sorted.length === 0) return;

                    let currentIndex = -1;
                    const { annotationManager } = Core;
                    const selected = annotationManager.getSelectedAnnotations();
                    if (selected.length > 0) {
                        const fieldName = selected[0].getField?.()?.name;
                        if (fieldName) currentIndex = sorted.findIndex((f: any) => f.name === fieldName);
                    }

                    if (currentIndex === -1 && lastSelectedFieldNameRef.current) {
                        currentIndex = sorted.findIndex((f: any) => f.name === lastSelectedFieldNameRef.current);
                    }

                    if (currentIndex === -1) {
                        focusField(Core, sorted[0]);
                        lastSelectedFieldNameRef.current = sorted[0].name;
                        return;
                    }

                    const prevIndex = (currentIndex - 1 + sorted.length) % sorted.length;
                    const prevField = sorted[prevIndex];

                    focusField(Core, prevField);
                    lastSelectedFieldNameRef.current = prevField.name;
                }
            },

            // ✅ NEW: Clear the signature store after successful save
            clearSignatureStore: () => {
                const store = getSignatureStore();
                console.log(`🧹 [PDFViewer] Clearing signature store (${store.size} entries)`);
                store.clear();
                // Also clear local tracked values
                trackedFieldValuesRef.current.clear();
                modifiedFields.current.clear();
            },

            dispose: () => {
                if (viewerInstance.current) {
                    try {
                        // Clear signature store on dispose
                        getSignatureStore().clear();
                        viewerInstance.current.UI.dispose();
                    } catch (e) { }
                    viewerInstance.current = null;
                }
            },
        }));





        // ✅ NEW: Navigation button handlers for embedded field navigation
        const handleNavigationClick = useCallback(() => {
            if (!viewerInstance.current) return;

            const { Core } = viewerInstance.current;
            const sorted = getSortedFields(Core);

            if (sorted.length === 0) return;

            setTotalFields(sorted.length);

            if (!navigationStarted) {
                setNavigationStarted(true);
                setCurrentFieldIndex(0);
                focusField(Core, sorted[0]);
                lastSelectedFieldNameRef.current = sorted[0].name;
            } else if (currentFieldIndex >= sorted.length - 1) {
                setCurrentFieldIndex(0);
                focusField(Core, sorted[0]);
                lastSelectedFieldNameRef.current = sorted[0].name;
            } else {
                const nextIndex = currentFieldIndex + 1;
                setCurrentFieldIndex(nextIndex);
                focusField(Core, sorted[nextIndex]);
                lastSelectedFieldNameRef.current = sorted[nextIndex].name;
            }
        }, [navigationStarted, currentFieldIndex]);

        // Get button label based on navigation state
        const getNavigationButtonLabel = useCallback(() => {
            if (!navigationStarted) {
                return 'CLICK TO START';
            } else if (currentFieldIndex >= totalFields - 1) {
                return 'BACK TO START';
            } else {
                return 'NEXT';
            }
        }, [navigationStarted, currentFieldIndex, totalFields]);

        // Check if we're on the last field (for different button style)
        const isOnLastField = navigationStarted && currentFieldIndex >= totalFields - 1;




        // ✅ FIX: Keep ref in sync with prop so documentLoaded handler has current value
        useEffect(() => {
            initialXfdfRef.current = initialXfdf;
        }, [initialXfdf]);

        // ✅ FIX: Also keep formFieldsRef in sync with prop
        useEffect(() => {
            formFieldsRef.current = formFields;
            console.log(`[PDFViewer] formFieldsRef updated: ${formFields?.length || 0} fields`);
        }, [formFields]);

        useEffect(() => {
            const initializeViewer = async () => {
                if (!viewerDiv.current || viewerInstance.current) return;
                try {
                    setLoading(true);
                    setError('');

                    const WebViewerModule = await import('@pdftron/webviewer');
                    const WebViewer = WebViewerModule.default;

                    const instance = await WebViewer(
                        {
                            path: '/webviewer',
                            licenseKey: process.env.NEXT_PUBLIC_PDFTRON_LICENSE_KEY,
                            css: '/webviewer-custom.css',
                            fullAPI: true,  // ✅ Enable Full API for proper form field support
                        },
                        viewerDiv.current
                    );

                    viewerInstance.current = instance;
                    (window as any).__WV_INSTANCE__ = instance;
                    const { UI, Core } = instance;

                    UI.setTheme(UI.Theme.LIGHT);

                    // Enable features for form fields
                    try {
                        UI.enableFeatures([UI.Feature.Annotations]);
                    } catch (e) {
                        console.error('Failed to enable features:', e);
                    }

                    UI.enableElements([
                        'toolbarGroup-Forms',
                        'formFieldEditButton',
                        'formFieldCreateButtons'
                    ]);

                    // Set APPEARANCE signing mode
                    const signatureTool = Core.documentViewer.getTool('AnnotationCreateSignature') as any;
                    if (signatureTool && signatureTool.setSigningMode) {
                        const SigningModes = (Core.Tools as any)?.SignatureCreateTool?.SigningModes;
                        signatureTool.setSigningMode(SigningModes.APPEARANCE);
                    }

                    // Set Toolbar Group
                    if (clientSigningMode) {
                        // ✅ STRICT EDIT MODE: External clients can only FILL existing fields
                        // Switch to View toolbar (Pan/Select) and disable all creation tools
                        UI.setToolbarGroup('toolbarGroup-View');

                        UI.disableElements([
                            'toolbarGroup-Annotate',
                            'toolbarGroup-Forms',
                            'toolbarGroup-Edit',
                            'toolbarGroup-Insert',
                            'toolbarGroup-FillAndSign',
                            'toolbarGroup-Shapes',
                            'signatureToolGroupButton',
                            'rubberStampToolGroupButton',
                            'highlightToolGroupButton',
                            'formFieldCreateButtons'
                        ]);
                    } else if (commentsOnly) {
                        UI.setToolbarGroup('toolbarGroup-View');
                    } else if (toolbarMode === 'forms' && canAddFormFields) {
                        // Use explicit defaultToolbar if provided, otherwise default to Forms
                        const toolbar = defaultToolbar === 'view' ? 'toolbarGroup-View' :
                            defaultToolbar === 'annotate' ? 'toolbarGroup-Annotate' :
                                'toolbarGroup-Forms';
                        UI.setToolbarGroup(toolbar);
                    } else if (toolbarMode === 'forms' && !canAddFormFields) {
                        // ✅ NEW: Forms mode but can't add fields - use Annotate toolbar
                        // User can still fill existing fields but can't create new ones
                        UI.setToolbarGroup('toolbarGroup-Annotate');
                        // Disable form creation tools
                        UI.disableElements([
                            'toolbarGroup-Forms',
                            'formFieldCreateButtons',
                            'textFieldToolGroupButton',
                            'checkboxFieldToolGroupButton',
                            'radioButtonFieldToolGroupButton',
                            'listBoxFieldToolGroupButton',
                            'comboBoxFieldToolGroupButton',
                            'signatureFieldToolGroupButton'
                        ]);
                    } else {
                        UI.setToolbarGroup('toolbarGroup-Annotate');
                    }

                    // ✅ NEW: If canAddFormFields is explicitly false, ensure form creation is disabled
                    // (covers cases where toolbarMode is 'annotate' but we still want to block form creation)
                    if (!canAddFormFields && !clientSigningMode && !commentsOnly) {
                        UI.disableElements([
                            'toolbarGroup-Forms',
                            'formFieldCreateButtons',
                            'textFieldToolGroupButton',
                            'checkboxFieldToolGroupButton',
                            'radioButtonFieldToolGroupButton',
                            'listBoxFieldToolGroupButton',
                            'comboBoxFieldToolGroupButton',
                            'signatureFieldToolGroupButton'
                        ]);
                    }

                    // Handle ReadOnly / CommentsOnly features
                    if (readOnly && !commentsOnly) {
                        UI.disableFeatures([
                            UI.Feature.Annotations,
                            UI.Feature.FilePicker,
                            UI.Feature.Print,
                            UI.Feature.Download,
                        ]);
                    } else if (commentsOnly) {
                        UI.disableFeatures([
                            UI.Feature.FilePicker,
                            UI.Feature.Print,
                            UI.Feature.Download,
                        ]);
                        UI.enableFeatures([
                            UI.Feature.NotesPanel,
                            UI.Feature.TextSelection,
                        ]);
                        UI.disableElements([
                            'toolbarGroup-Annotate', 'toolbarGroup-Forms', 'toolbarGroup-Edit',
                            'toolbarGroup-Insert', 'toolbarGroup-FillAndSign', 'toolbarGroup-Shapes',
                            'signatureToolGroupButton', 'rubberStampToolGroupButton', 'highlightToolGroupButton'
                        ]);
                        if (!clientSigningMode) {
                            UI.setToolbarGroup('toolbarGroup-View');
                        }
                    } else {
                        UI.enableFeatures([
                            UI.Feature.Annotations,
                            UI.Feature.TextSelection,
                            UI.Feature.NotesPanel,
                        ]);
                    }

                    // Listen for annotation selection to track current field
                    Core.annotationManager.addEventListener('annotationSelected', (annotations: any, action: string) => {
                        if (action === 'selected' && annotations.length > 0) {
                            const annot = annotations[0];
                            // Check if it's a widget or has a field
                            const fieldName = annot.getField?.()?.name || annot.getCustomData?.('fieldName');
                            if (fieldName) {
                                lastSelectedFieldNameRef.current = fieldName;
                            }
                        }
                    });

                    // ══════════════════════════════════════════════════════════════════
                    // ✅ NEW: Protect pre-existing annotations from deletion in clientSigningMode
                    // External signers cannot delete signatures/annotations that existed on load
                    // ══════════════════════════════════════════════════════════════════
                    if (clientSigningMode || editableFieldMode === 'empty-only') {
                        Core.annotationManager.addEventListener('annotationChanged', (annotations: any, action: string, info: any) => {
                            if (action === 'delete') {
                                const protectedAnnots = annotations.filter((annot: any) =>
                                    initialAnnotationIdsRef.current.has(annot.Id)
                                );

                                if (protectedAnnots.length > 0) {
                                    console.log(`🚫 [AnnotationProtection] Blocked deletion of ${protectedAnnots.length} protected annotation(s)`);

                                    // Re-add the protected annotations that were deleted
                                    // This effectively "cancels" the deletion
                                    setTimeout(() => {
                                        try {
                                            Core.annotationManager.addAnnotations(protectedAnnots, { autoFocus: false });
                                            Core.annotationManager.drawAnnotationsFromList(protectedAnnots);
                                            console.log('  ✅ Re-added protected annotations');
                                        } catch (e) {
                                            console.warn('  ⚠️ Could not re-add protected annotations:', e);
                                        }
                                    }, 50);
                                }
                            }
                        });
                    }

                    Core.annotationManager.addEventListener('annotationChanged', (annotations: any, action: string) => {
                        if (action === 'add' || action === 'modify' || action === 'delete') {
                            if (onDocumentModified) onDocumentModified();
                        }
                    });

                    // ══════════════════════════════════════════════════════════════════
                    // ADDITIONAL: Listen to FieldManager fieldChange for new field creation
                    // AND VALUE TRACKING (including signatures)
                    // ══════════════════════════════════════════════════════════════════
                    // In some PDFTron versions, form fields created via Form Builder
                    // may be registered here before annotationChanged fires.
                    const fieldManager = Core.annotationManager.getFieldManager();
                    if (fieldManager) {
                        Core.annotationManager.addEventListener('fieldChanged', async (field: any, value: any) => {
                            console.log(`📝 [ValueTracker] fieldChanged: ${field?.name}, value=${value}, type=${field?.type}`);

                            if (!field?.name) return;

                            // ══════════════════════════════════════════════════════════════════
                            // ✅ NEW: editableFieldMode='empty-only' PROTECTION
                            // If mode is 'empty-only' and field was pre-filled, revert the change
                            // ══════════════════════════════════════════════════════════════════
                            if (editableFieldMode === 'empty-only') {
                                const initialValue = initialFieldValuesRef.current.get(field.name);
                                // Check if field was pre-filled (had an initial value)
                                if (initialValue !== undefined && initialValue !== '' && initialValue !== null) {
                                    console.log(`🚫 [FieldProtection] Field ${field.name} is pre-filled (initial="${initialValue}"). Reverting change.`);
                                    // Revert to original value
                                    try {
                                        if (typeof field.setValue === 'function') {
                                            field.setValue(initialValue);
                                            // Refresh widget appearance
                                            const widget = field.widgets?.[0];
                                            if (widget && typeof widget.refreshAppearance === 'function') {
                                                widget.refreshAppearance();
                                                Core.annotationManager.drawAnnotationsFromList([widget]);
                                            }
                                        }
                                    } catch (revertErr) {
                                        console.warn('Failed to revert field value:', revertErr);
                                    }
                                    return; // Don't track this change
                                }
                            }


                            // ══════════════════════════════════════════════════════════════════
                            // TRACK FIELD VALUES in memory
                            // ══════════════════════════════════════════════════════════════════
                            const widget = field.widgets?.[0];
                            let trackedType: 'text' | 'signature' | 'checkbox' | 'other' = 'text';
                            if (field.type === 'Sig') trackedType = 'signature';
                            else if (field.type === 'Btn') trackedType = 'checkbox';

                            const valueEntry: any = {
                                value: value || '',
                                annotationId: widget?.Id,
                                type: trackedType,
                            };

                            // For signatures, try to capture the appearance data
                            if (field.type === 'Sig' && widget) {
                                try {
                                    // Try to get signature data from custom data
                                    const sigData = widget.getCustomData?.('trn-signature-data');
                                    if (sigData) {
                                        valueEntry.signatureData = sigData;
                                        console.log(`    🖊️ Captured signature data for ${field.name}`);
                                    }

                                    // Try to get appearance as blob
                                    if (typeof widget.getAppearance === 'function') {
                                        const appearance = widget.getAppearance();
                                        if (appearance) {
                                            valueEntry.hasAppearance = true;
                                            console.log(`    🖊️ Signature has appearance for ${field.name}`);
                                        }
                                    }
                                } catch (e) {
                                    console.warn('    ⚠️ Failed to capture signature data:', e);
                                }
                            }

                            trackedFieldValuesRef.current.set(field.name, valueEntry);
                            console.log(`    ✅ VALUE TRACKED: ${field.name} = "${value || '(empty)'}", total tracked values: ${trackedFieldValuesRef.current.size}`);

                            // ✅ NEW: Also store in centralized SignatureStore for fallback during export
                            getSignatureStore().set(field.name, {
                                value: value || '',
                                signatureData: valueEntry.signatureData,
                                annotationId: widget?.Id,
                                type: trackedType,
                            });

                            // Also track in modifiedFields for export filtering
                            modifiedFields.current.add(field.name);

                            // ✅ SESSION TRACKING: Mark this field as modified in current session
                            // Needed for scoped recovery of text fields
                            sessionModifiedFieldsRef.current.add(field.name);



                            // If this field structure isn't tracked yet, add it
                            // ONLY add to form field structure tracking if:
                            // 1. Field doesn't already exist in tracking
                            // 2. We're in a mode that allows field creation (template/contract creation)
                            // This prevents pre-existing fields from being incorrectly tracked during draft/signing
                            const existingField = createdFormFieldsRef.current.find(f => f.name === field.name);
                            if (!existingField && field.widgets?.length > 0 && canAddFormFields) {
                                const rect = widget.getRect?.() || { x1: 0, y1: 0, x2: 100, y2: 30 };
                                const pageNumber = widget.getPageNumber?.() || 1;

                                let fieldType: 'text' | 'signature' | 'checkbox' | 'radio' | 'dropdown' | 'date' = 'text';
                                if (field.type === 'Sig') fieldType = 'signature';
                                else if (field.type === 'Btn') fieldType = 'checkbox';

                                const fieldData: FormFieldDefinition = {
                                    name: field.name,
                                    annotationId: widget.Id,
                                    type: fieldType,
                                    x: rect.x1,
                                    y: rect.y1,
                                    width: rect.x2 - rect.x1,
                                    height: rect.y2 - rect.y1,
                                    pageNumber: pageNumber,
                                    required: false,
                                    readOnly: false,
                                    multiline: false,
                                    doNotScroll: false,
                                    doNotSpellCheck: false,
                                    placeholder: '',
                                    label: field.name.replace(/_/g, ' ').replace(/\b\w/g, (l: string) => l.toUpperCase()),
                                };
                                createdFormFieldsRef.current.push(fieldData);
                                console.log(`    ✅ FIELD TRACKED via fieldChanged: ${field.name}, total=${createdFormFieldsRef.current.length}`);
                            }
                        });
                    }

                    // Listen for form field creation/modification
                    Core.annotationManager.addEventListener('annotationChanged', (annotations: any, action: string, info: any) => {
                        if (action === 'add') {
                            console.log(`📝 [FieldTracker] annotationChanged: ADD ${annotations.length} annotations`);

                            annotations.forEach((annot: any) => {
                                // Log all annotations for debugging
                                const annotType = annot.constructor?.name || typeof annot;
                                console.log(`  → Annotation: ${annotType}, Id=${annot.Id}`);

                                // ══════════════════════════════════════════════════════════════════
                                // SIGNATURE DETECTION: Check for signature-related annotations
                                // Signatures in PDFTron are added as stamps/freehand annotations
                                // that overlay signature widgets, identified by custom data
                                // ══════════════════════════════════════════════════════════════════
                                const isStamp = annot instanceof Core.Annotations.StampAnnotation;
                                const isFreeHand = annot instanceof Core.Annotations.FreeHandAnnotation;
                                const hasSignatureData = annot.getCustomData?.('trn-signature-data');
                                const isSignatureRelated = isStamp || isFreeHand || hasSignatureData;

                                if (isSignatureRelated) {
                                    console.log(`  🖊️ Signature-related annotation detected: ${annotType}`);

                                    // Try to find the parent signature widget this annotation belongs to
                                    const pageNumber = annot.getPageNumber();
                                    const annotRect = annot.getRect();

                                    // Search for signature widgets on the same page that contain this annotation
                                    const allAnnots = Core.annotationManager.getAnnotationsList();
                                    let parentWidget: any = null;

                                    for (const otherAnnot of allAnnots) {
                                        if (otherAnnot instanceof Core.Annotations.SignatureWidgetAnnotation) {
                                            const widgetPage = otherAnnot.getPageNumber();
                                            if (widgetPage === pageNumber) {
                                                const widgetRect = otherAnnot.getRect();
                                                // Check if the signature annotation overlaps with the widget
                                                const overlaps = !(annotRect.x2 < widgetRect.x1 ||
                                                    annotRect.x1 > widgetRect.x2 ||
                                                    annotRect.y2 < widgetRect.y1 ||
                                                    annotRect.y1 > widgetRect.y2);
                                                if (overlaps) {
                                                    parentWidget = otherAnnot;
                                                    break;
                                                }
                                            }
                                        }
                                    }

                                    if (parentWidget) {
                                        const field = parentWidget.getField?.();
                                        const fieldName = getFieldName(parentWidget, field) || `SignatureField_${parentWidget.Id}`;

                                        // ══════════════════════════════════════════════════════════════════
                                        // CRITICAL: Hide "Sign here" indicator when signature is applied
                                        // The indicator remains visible even with a stamp on top unless we
                                        // explicitly hide it via setFieldIndicator(false)
                                        // ══════════════════════════════════════════════════════════════════
                                        try {
                                            if (typeof parentWidget.setFieldIndicator === 'function') {
                                                parentWidget.setFieldIndicator(false);
                                                console.log(`    👁️ Hidden "Sign here" indicator for ${fieldName}`);
                                            }
                                        } catch (e) {
                                            console.warn(`    ⚠️ Could not hide indicator for ${fieldName}:`, e);
                                        }

                                        // ══════════════════════════════════════════════════════════════════
                                        // CRITICAL: Capture XFDF of the annotation for recovery
                                        // This is the actual signature appearance that PDFTron may lose
                                        // ══════════════════════════════════════════════════════════════════
                                        const sigData = annot.getCustomData?.('trn-signature-data') || '';

                                        // Store initial data in SignatureStore (XFDF will be added async)
                                        getSignatureStore().set(fieldName, {
                                            value: 'Signed',
                                            signatureData: sigData,
                                            annotationId: parentWidget.Id,
                                            stampAnnotationId: annot.Id,
                                            type: 'signature',
                                        });

                                        // ✅ SESSION TRACKING: Mark this field as modified in current session
                                        sessionModifiedFieldsRef.current.add(fieldName);
                                        console.log(`    📌 SESSION TRACKED: ${fieldName}`);

                                        // Export the annotation's XFDF immediately (while it exists) - async
                                        Core.annotationManager.exportAnnotations({ annotList: [annot] })
                                            .then((xfdf: string) => {
                                                // Update the store with the XFDF
                                                const existing = getSignatureStore().get(fieldName);
                                                if (existing) {
                                                    getSignatureStore().set(fieldName, {
                                                        ...existing,
                                                        annotationXfdf: xfdf,
                                                    });
                                                    console.log(`    📄 Captured XFDF for ${fieldName}: ${xfdf.length} chars`);
                                                }
                                            })
                                            .catch((e: any) => {
                                                console.warn('    ⚠️ Failed to export annotation XFDF:', e);
                                            });

                                        console.log(`    🗄️ SIGNATURE STORED: ${fieldName}, store size: ${getSignatureStore().size}`);
                                    } else {
                                        console.log(`    ⚠️ No parent signature widget found`);

                                    }

                                    // Store the annotation object itself for fallback
                                    createdAnnotationsRef.current.push(annot);
                                    return;
                                }



                                // Check if it's a WidgetAnnotation (form field)
                                const isWidget = annot instanceof Core.Annotations.WidgetAnnotation ||
                                    annot instanceof Core.Annotations.SignatureWidgetAnnotation ||
                                    typeof annot.getField === 'function';

                                if (!isWidget) {
                                    console.log(`    ⏭️ Not a widget annotation, skipping`);
                                    return;
                                }

                                const field = typeof annot.getField === 'function' ? annot.getField() : null;
                                const fieldName = getFieldName(annot, field);

                                console.log(`    🔍 Widget detected: name=${fieldName}, fieldType=${field?.type || 'unknown'}`);

                                if (!fieldName) {
                                    console.log(`    ⚠️ No field name, skipping`);
                                    return;
                                }

                                // Ensure signature fields are interactive (but still track them!)
                                if (field?.type === 'Sig') {
                                    annot.ReadOnly = false;
                                    annot.NoInteraction = false;
                                }

                                try {
                                    const existingById = createdFormFieldsRef.current.find((f: any) => f.annotationId === annot.Id);
                                    const existingByName = createdFormFieldsRef.current.find((f: any) => f.name === fieldName);

                                    // ONLY track new field structures if:
                                    // 1. Field doesn't already exist in tracking
                                    // 2. We're in a mode that allows field creation (template/contract creation)
                                    // This prevents pre-existing fields from being incorrectly tracked during draft/signing
                                    if (!existingById && !existingByName && canAddFormFields) {
                                        const rect = annot.getRect();
                                        const pageNumber = annot.getPageNumber();
                                        const fieldType = detectFieldType(annot, field);

                                        const fieldData: FormFieldDefinition = {
                                            name: fieldName,
                                            annotationId: annot.Id,
                                            type: fieldType,
                                            x: rect.x1,
                                            y: rect.y1,
                                            width: rect.x2 - rect.x1,
                                            height: rect.y2 - rect.y1,
                                            pageNumber: pageNumber,
                                            required: false,
                                            readOnly: false,
                                            multiline: false,
                                            doNotScroll: false,
                                            doNotSpellCheck: false,
                                            placeholder: '',
                                            label: fieldName.replace(/_/g, ' ').replace(/\b\w/g, (l: string) => l.toUpperCase()),
                                        };
                                        createdFormFieldsRef.current.push(fieldData);

                                        // ✅ CRITICAL: Also store the actual annotation object for fallback
                                        createdAnnotationsRef.current.push(annot);

                                        console.log(`    ✅ TRACKED: ${fieldName} (type=${fieldType}), total fields=${createdFormFieldsRef.current.length}, total annots=${createdAnnotationsRef.current.length}`);
                                    } else if (existingById || existingByName) {
                                        console.log(`    ℹ️ Already tracked: ${fieldName}`);
                                    } else {
                                        console.log(`    ℹ️ Skipping field tracking (not in creation mode): ${fieldName}`);
                                    }
                                } catch (err) {
                                    console.warn('    ❌ Failed to track field:', err);
                                }
                            });
                        } else if (action === 'modify') {

                            annotations.forEach((annot: any) => {
                                const field = annot.getField?.();
                                const fieldName = getFieldName(annot, field);

                                // ══════════════════════════════════════════════════════════════════
                                // SIGNATURE VALUE TRACKING: When a signature is applied
                                // ══════════════════════════════════════════════════════════════════
                                if (field?.type === 'Sig' && fieldName) {
                                    try {
                                        // Check if signature was applied (has appearance or signed status)
                                        const hasAppearance = typeof annot.getAppearance === 'function' && annot.getAppearance();
                                        const sigData = annot.getCustomData?.('trn-signature-data');
                                        const isSigned = hasAppearance || sigData || annot.isSignedDigitalSignature?.();

                                        if (isSigned) {
                                            // ══════════════════════════════════════════════════════════════════
                                            // PURE FALLBACK: Silently store signature data for fallback only
                                            // Don't interfere with PDFTron logic - just store in case it's lost
                                            // ══════════════════════════════════════════════════════════════════
                                            getSignatureStore().set(fieldName, {
                                                value: 'Signed',
                                                signatureData: sigData || undefined,
                                                annotationId: annot.Id,
                                                type: 'signature',
                                            });
                                            console.log(`🗄️ [SignatureStore] Stored (fallback): ${fieldName}`);
                                        }
                                    } catch (e) {
                                        console.warn('Failed to store signature:', e);
                                    }
                                    return; // Return early for signatures
                                }


                                if (!isWidgetAnnotation(annot, Core)) return;
                                try {
                                    if (!fieldName) return;

                                    let existingIndex = createdFormFieldsRef.current.findIndex((f) => f.annotationId === annot.Id);
                                    if (existingIndex === -1) existingIndex = createdFormFieldsRef.current.findIndex((f) => f.name === fieldName);

                                    if (existingIndex > -1) {
                                        const flags = extractWidgetFlags(field);
                                        const rect = annot.getRect();
                                        createdFormFieldsRef.current[existingIndex] = {
                                            ...createdFormFieldsRef.current[existingIndex],
                                            name: fieldName,
                                            annotationId: annot.Id,
                                            required: flags.required,
                                            readOnly: flags.readOnly,
                                            x: rect.x1,
                                            y: rect.y1,
                                            width: rect.x2 - rect.x1,
                                            height: rect.y2 - rect.y1,
                                        };
                                    }
                                } catch (e) { }
                            });
                        } else if (action === 'delete') {
                            annotations.forEach((annot: any) => {
                                let index = createdFormFieldsRef.current.findIndex((f: any) => f.annotationId === annot.Id);
                                if (index > -1) {
                                    console.log(`📝 [FieldTracker] REMOVED: ${createdFormFieldsRef.current[index].name}`);
                                    createdFormFieldsRef.current.splice(index, 1);
                                }
                            });
                        }
                    });

                    // Document Loaded
                    Core.documentViewer.addEventListener('documentLoaded', async () => {
                        try {
                            console.log('📄 [PDFViewer] Document loaded event fired');

                            // ══════════════════════════════════════════════════════════════════
                            // CRITICAL: Clear all session state on document load to prevent
                            // old data from previous documents/sessions contaminating this one
                            // ══════════════════════════════════════════════════════════════════
                            const storeSize = getSignatureStore().size;
                            if (storeSize > 0) {
                                console.log(`🧹 [PDFViewer] Clearing stale SignatureStore (${storeSize} entries)`);
                                getSignatureStore().clear();
                            }

                            // Clear session-scoped tracking
                            sessionModifiedFieldsRef.current.clear();
                            createdAnnotationsRef.current = [];
                            console.log('🧹 [PDFViewer] Session tracking cleared');



                            // Import XFDF if provided (restores form fields and annotations)
                            // ✅ FIX: Use ref to get current value (avoids stale closure)
                            const xfdfToImport = initialXfdfRef.current;
                            console.log('📋 [PDFViewer] XFDF check:', {
                                hasXfdf: !!xfdfToImport,
                                length: xfdfToImport?.length || 0
                            });
                            if (xfdfToImport) {
                                console.log('📥 [PDFViewer] Importing XFDF data...');

                                // ✅ CRITICAL FIX: Before importing XFDF, remove existing widget annotations
                                // to avoid duplicates. The PDF may already have annotations baked in via
                                // getFileData({xfdfString}). Re-importing the same XFDF creates duplicates
                                // because PDF internal IDs don't match XFDF annotation IDs.
                                try {
                                    const existingAnnots = Core.annotationManager.getAnnotationsList();
                                    if (existingAnnots.length > 0) {
                                        console.log(`  🧹 Clearing ${existingAnnots.length} existing annotations before XFDF import to avoid duplicates`);
                                        // Delete all existing annotations (they'll be recreated from XFDF)
                                        await Core.annotationManager.deleteAnnotations(existingAnnots, { force: true });
                                        await new Promise(resolve => setTimeout(resolve, 100));
                                    }
                                } catch (clearErr) {
                                    console.warn('  ⚠️ Could not clear existing annotations:', clearErr);
                                }

                                // ══════════════════════════════════════════════════════════════════
                                // SUPPRESS KNOWN PDFTRON ERROR: "No matching annotation in appearance document"
                                // This error is non-critical - signatures still display correctly.
                                // It happens when XFDF has appearance refs that don't match PDF internal state.
                                // ══════════════════════════════════════════════════════════════════
                                const originalConsoleError = console.error;
                                const suppressAppearanceError = (...args: any[]) => {
                                    const msg = args.join(' ');
                                    if (msg.includes('No matching annotation in appearance document') ||
                                        msg.includes('appearanceReference')) {
                                        // Suppress this known non-critical error
                                        console.log('  ℹ️ [Suppressed] PDFTron appearance warning (non-critical)');
                                        return;
                                    }
                                    originalConsoleError.apply(console, args);
                                };
                                console.error = suppressAppearanceError;

                                try {
                                    await Core.annotationManager.importAnnotations(xfdfToImport);
                                    console.log('  ✓ XFDF imported successfully');
                                } finally {
                                    // Restore original console.error after a delay (for async errors)
                                    setTimeout(() => {
                                        console.error = originalConsoleError;
                                    }, 2000);
                                }
                            }


                            // Wait for fields to fully initialize
                            await new Promise(resolve => setTimeout(resolve, 800));

                            // ── Render signature appearances ──────────
                            // CRITICAL: In APPEARANCE signing mode, signature data lives in
                            // the widget's appearance stream (not the field value — getValue()
                            // returns "" even for signed widgets). When XFDF is imported above,
                            // the appearance streams are restored correctly. However, calling
                            // refreshAppearance() on the widget REGENERATES the appearance
                            // from the field value — which is empty — thereby DESTROYING the
                            // imported signature. Only call refreshAppearance() when there is
                            // NO imported XFDF (i.e. fresh document from template).
                            try {
                                const allAnnots = Core.annotationManager.getAnnotationsList();

                                const sigWidgets = allAnnots.filter((a: any) =>
                                    a instanceof Core.Annotations.SignatureWidgetAnnotation
                                );
                                const stampAnnots = allAnnots.filter((a: any) =>
                                    a instanceof Core.Annotations.StampAnnotation
                                );
                                const freeHandAnnots = allAnnots.filter((a: any) =>
                                    a instanceof Core.Annotations.FreeHandAnnotation
                                );

                                console.log(`🔄 [PDFViewer] Found ${sigWidgets.length} signature widgets, ${stampAnnots.length} stamps, ${freeHandAnnots.length} freehand`);

                                // ══════════════════════════════════════════════════════════════════
                                // CRITICAL: Collect signature widgets with overlays for later hiding
                                // The actual hiding happens AFTER drawAnnotationsFromList to prevent
                                // the indicator from being reset by the rendering operation
                                // ══════════════════════════════════════════════════════════════════
                                const allSignatureDrawings = [...stampAnnots, ...freeHandAnnots];
                                const widgetsToHideIndicator: any[] = [];

                                for (const widget of sigWidgets) {
                                    const widgetRect = widget.getRect();
                                    const widgetPage = widget.getPageNumber();

                                    // Check if any stamp/freehand overlaps this widget
                                    const hasOverlay = allSignatureDrawings.some((stamp: any) => {
                                        if (stamp.getPageNumber() !== widgetPage) return false;
                                        const stampRect = stamp.getRect();
                                        // Check overlap - use center overlap for better detection
                                        const stampCenterX = (stampRect.x1 + stampRect.x2) / 2;
                                        const stampCenterY = (stampRect.y1 + stampRect.y2) / 2;
                                        return stampCenterX >= widgetRect.x1 && stampCenterX <= widgetRect.x2 &&
                                            stampCenterY >= widgetRect.y1 && stampCenterY <= widgetRect.y2;
                                    });

                                    if (hasOverlay) {
                                        widgetsToHideIndicator.push(widget);
                                    }
                                }

                                console.log(`  🖊️ Found ${widgetsToHideIndicator.length} signed widgets to hide indicators`);


                                if (xfdfToImport) {
                                    // XFDF was imported — need to refresh form field widget appearances
                                    // (but NOT signature widgets, to preserve signature appearances)
                                    console.log('  ℹ️ XFDF imported — refreshing form field widgets (not signatures)');

                                    // Get all form field widgets (text, checkbox, radio, listbox, combobox)
                                    const formFieldWidgets = allAnnots.filter((a: any) =>
                                        (a instanceof Core.Annotations.TextWidgetAnnotation ||
                                         a instanceof Core.Annotations.CheckButtonWidgetAnnotation ||
                                         a instanceof Core.Annotations.ListWidgetAnnotation ||
                                         a instanceof Core.Annotations.ChoiceWidgetAnnotation) &&
                                        !(a instanceof Core.Annotations.SignatureWidgetAnnotation)
                                    );

                                    if (formFieldWidgets.length > 0) {
                                        console.log(`  📝 Refreshing ${formFieldWidgets.length} form field widget appearances...`);
                                        for (const widget of formFieldWidgets) {
                                            try {
                                                if (typeof (widget as any).refreshAppearance === 'function') {
                                                    await (widget as any).refreshAppearance();
                                                }
                                            } catch (e) {
                                                // Non-critical - widget may still render
                                            }
                                        }
                                    }

                                    Core.annotationManager.drawAnnotationsFromList(allAnnots);

                                } else {
                                    // No XFDF imported (fresh template) — safe to refresh.
                                    // ✅ CRITICAL FIX: Do NOT refresh signatures in clientSigningMode (external signer).
                                    // The loaded PDF already contains valid signatures/widgets. Refreshing them destroys
                                    // appearance-based signatures because the underlying value is empty.
                                    if (!clientSigningMode && sigWidgets.length > 0) {
                                        console.log(`  📝 Refreshing signature widgets (no XFDF, not signing mode)...`);
                                        for (const sig of sigWidgets) {
                                            const fieldName = sig.fieldName || 'unknown';
                                            console.log(`    - Widget: ${fieldName}`);
                                            if (typeof (sig as any).refreshAppearance === 'function') {
                                                await (sig as any).refreshAppearance();
                                            }
                                        }
                                        Core.annotationManager.drawAnnotationsFromList(sigWidgets);
                                    }

                                    if (stampAnnots.length > 0) {
                                        console.log(`  ✍️ Refreshing stamp annotations (no XFDF)...`);
                                        for (const stamp of stampAnnots) {
                                            console.log(`    - Stamp: ${stamp.Id}`);
                                            if (typeof (stamp as any).refreshAppearance === 'function') {
                                                await (stamp as any).refreshAppearance();
                                            }
                                        }
                                        Core.annotationManager.drawAnnotationsFromList(stampAnnots);
                                    }
                                }

                                // ══════════════════════════════════════════════════════════════════
                                // CRITICAL: Hide "Sign here" indicators AFTER all rendering
                                // This must happen after drawAnnotationsFromList to prevent reset
                                // ══════════════════════════════════════════════════════════════════
                                const hideIndicators = () => {
                                    for (const widget of widgetsToHideIndicator) {
                                        try {
                                            const fieldName = widget.fieldName || widget.getField?.()?.name || 'unknown';
                                            if (typeof widget.setFieldIndicator === 'function') {
                                                widget.setFieldIndicator(false);
                                                console.log(`    👁️ Hidden "Sign here" indicator for ${fieldName}`);
                                            }
                                        } catch (e) {
                                            // Non-critical
                                        }
                                    }
                                };

                                // Hide immediately
                                hideIndicators();

                                // Also hide after a delay to catch async rendering
                                setTimeout(hideIndicators, 100);
                                setTimeout(hideIndicators, 500);
                                setTimeout(hideIndicators, 1000);

                            } catch (err) {
                                console.error('Error refreshing signatures:', err);
                            }

                            // ✅ DEBUG: Check what fields exist in the loaded document
                            const fieldManager = Core.annotationManager.getFieldManager();
                            const allFieldsList = getAllFieldsSafe(fieldManager);
                            const fieldNames = allFieldsList.map((f: any) => f.name || 'unnamed');

                            console.log('📋 [PDFViewer] Field Analysis START:');
                            console.log(`  • FieldManager: ${fieldNames.length} fields found`);

                            if (allFieldsList.length > 0) {
                                for (const field of allFieldsList) {
                                    const fieldName = field.name || 'unnamed';
                                    try {
                                        const type = field.type || 'unknown';
                                        const widgetCount = field.widgets?.length || 0;

                                        // Safely call getValue
                                        let value = 'N/A';
                                        try {
                                            value = typeof field.getValue === 'function' ? field.getValue() : 'No getValue()';
                                        } catch (ve: any) {
                                            value = `Error: ${ve.message || ve}`;
                                        }

                                        console.log(`    - [Field] ${fieldName}: type=${type}, widgets=${widgetCount}, value="${value}"`);
                                    } catch (fieldErr) {
                                        console.warn(`    - [Field] ${fieldName}: Critical error during analysis:`, fieldErr);
                                    }
                                }
                            } else {
                                // No fields found in document - this is normal for plain PDFs
                            }

                            const allAnnots = Core.annotationManager.getAnnotationsList();
                            const widgets = allAnnots.filter((a: any) =>
                                a instanceof Core.Annotations.WidgetAnnotation
                            );
                            console.log(`  • Annotations: ${allAnnots.length} total, ${widgets.length} widgets`);

                            // Widgets and fields count logged above
                            console.log('📋 [PDFViewer] Field Analysis END');

                            // ══════════════════════════════════════════════════════════════════
                            // ✅ NEW: Capture initial field values for editableFieldMode='empty-only'
                            // This allows us to detect which fields were pre-filled so we can
                            // protect them from editing in external signer mode
                            // ══════════════════════════════════════════════════════════════════
                            initialFieldValuesRef.current.clear();
                            for (const field of allFieldsList) {
                                if (!field?.name) continue;
                                try {
                                    let value = '';
                                    if (typeof field.getValue === 'function') {
                                        value = field.getValue() || '';
                                    }
                                    // Also check for signature widgets with stamps
                                    if (field.type === 'Sig' && field.widgets?.[0]) {
                                        const widget = field.widgets[0];
                                        const widgetRect = widget.getRect();
                                        const widgetPage = widget.getPageNumber();
                                        // Check if there's a stamp over this signature widget
                                        const hasStamp = allAnnots.some((a: any) => {
                                            if (!(a instanceof Core.Annotations.StampAnnotation || a instanceof Core.Annotations.FreeHandAnnotation)) return false;
                                            if (a.getPageNumber() !== widgetPage) return false;
                                            const aRect = a.getRect();
                                            const centerX = (aRect.x1 + aRect.x2) / 2;
                                            const centerY = (aRect.y1 + aRect.y2) / 2;
                                            return centerX >= widgetRect.x1 && centerX <= widgetRect.x2 &&
                                                centerY >= widgetRect.y1 && centerY <= widgetRect.y2;
                                        });
                                        if (hasStamp) {
                                            value = 'Signed'; // Mark as having a value
                                        }
                                    }
                                    if (value) {
                                        initialFieldValuesRef.current.set(field.name, value);
                                    }
                                } catch (e) {
                                    console.warn(`Failed to capture initial value for ${field.name}:`, e);
                                }
                            }
                            console.log(`🔒 [FieldProtection] Captured ${initialFieldValuesRef.current.size} initial field values for empty-only mode`);

                            // ══════════════════════════════════════════════════════════════════
                            // ✅ NEW: Capture all initial annotation IDs for deletion protection
                            // External signers cannot delete these pre-existing annotations
                            // ══════════════════════════════════════════════════════════════════
                            initialAnnotationIdsRef.current.clear();
                            for (const annot of allAnnots) {
                                if (annot.Id) {
                                    initialAnnotationIdsRef.current.add(annot.Id);
                                }
                            }
                            console.log(`🔒 [AnnotationProtection] Captured ${initialAnnotationIdsRef.current.size} initial annotation IDs`);

                            // ══════════════════════════════════════════════════════════════════
                            // FALLBACK: Recreate form fields from formFields prop if none exist
                            // This ensures fields are visible when reopening templates/contracts
                            // ONLY runs when:
                            // 1. No widgets exist at all (XFDF import may have failed)
                            // 2. We have saved form fields to restore from
                            // 3. NOT in clientSigningMode (external signers should never recreate fields)
                            // ══════════════════════════════════════════════════════════════════
                            const savedFormFields = formFieldsRef.current;
                            console.log(`🔍 [PDFViewer] Fallback check: widgets=${widgets.length}, savedFormFields=${savedFormFields?.length || 0}, clientSigningMode=${clientSigningMode}`);

                            if (widgets.length === 0 && savedFormFields && savedFormFields.length > 0 && !clientSigningMode) {
                                console.log(`🔧 [PDFViewer] No widgets found, recreating ${savedFormFields.length} fields programmatically...`);
                                console.log('🔧 [PDFViewer] First field structure:', JSON.stringify(savedFormFields[0], null, 2));
                                const annotManager = Core.annotationManager;
                                const Annotations = Core.Annotations;
                                let createdCount = 0;

                                for (const fieldDef of savedFormFields) {
                                    try {
                                        const { name, type, x, y, width, height, pageNumber } = fieldDef;
                                        if (!name) {
                                            console.log('    ⏭️ Skipping field with no name');
                                            continue;
                                        }

                                        // Check if field already exists
                                        const existingField = annotManager.getFieldManager().getField(name);
                                        if (existingField && existingField.widgets && existingField.widgets.length > 0) {
                                            console.log(`    ℹ️ Field ${name} already exists, skipping`);
                                            continue;
                                        }

                                        // Map type to PDF field type
                                        let pdfFieldType = 'Tx'; // Default to text
                                        if (type === 'signature') pdfFieldType = 'Sig';
                                        else if (type === 'checkbox') pdfFieldType = 'Btn';

                                        console.log(`    🔨 Creating ${name} (${type} -> ${pdfFieldType})...`);

                                        // Create Field with explicit type
                                        const field = new (Annotations.Forms.Field as any)(name, {
                                            type: pdfFieldType,
                                            value: '',
                                        });

                                        // Create widget annotation based on type
                                        let widget: any;
                                        if (type === 'signature') {
                                            widget = new (Annotations.SignatureWidgetAnnotation as any)(field, {});
                                        } else if (type === 'checkbox') {
                                            widget = new (Annotations.CheckButtonWidgetAnnotation as any)(field, {});
                                        } else {
                                            widget = new (Annotations.TextWidgetAnnotation as any)(field, {});
                                        }

                                        // Set position and page
                                        widget.setRect(new Core.Math.Rect(x, y, x + width, y + height));
                                        widget.PageNumber = pageNumber || 1;

                                        // Ensure signature fields are interactive
                                        if (type === 'signature') {
                                            widget.ReadOnly = false;
                                            widget.NoInteraction = false;
                                        }

                                        // Add to managers
                                        annotManager.getFieldManager().addField(field);
                                        annotManager.addAnnotation(widget);

                                        // ✅ RESTORE VALUES from saved fieldDef
                                        const savedValue = fieldDef.value;
                                        const savedSignatureData = fieldDef.signatureData;

                                        if (type === 'text' && savedValue) {
                                            // Set text field value
                                            try {
                                                if (typeof field.setValue === 'function') {
                                                    field.setValue(savedValue);
                                                    console.log(`    📝 Restored text value for ${name}: "${savedValue}"`);
                                                }
                                            } catch (valueError) {
                                                console.warn(`    ⚠️ Could not restore value for ${name}:`, valueError);
                                            }
                                        } else if (type === 'signature' && savedSignatureData) {
                                            // Restore signature appearance
                                            try {
                                                // Store signature data in custom data for later recovery
                                                if (typeof widget.setCustomData === 'function') {
                                                    widget.setCustomData('trn-signature-data', savedSignatureData);
                                                    console.log(`    ✍️ Stored signature data for ${name}`);
                                                }
                                                // Create appearance from signature data if it's a data URL
                                                if (savedSignatureData.startsWith('data:image')) {
                                                    const img = new Image();
                                                    img.onload = async () => {
                                                        try {
                                                            // Create canvas to generate appearance
                                                            const canvas = document.createElement('canvas');
                                                            canvas.width = width;
                                                            canvas.height = height;
                                                            const ctx = canvas.getContext('2d');
                                                            if (ctx) {
                                                                ctx.drawImage(img, 0, 0, width, height);
                                                                const appearanceDataUrl = canvas.toDataURL('image/png');
                                                                // Set the appearance on the widget
                                                                if (typeof widget.setImageData === 'function') {
                                                                    widget.setImageData(appearanceDataUrl, { keepAspectRatio: true });
                                                                } else if (typeof widget.createSignatureAppearance === 'function') {
                                                                    widget.createSignatureAppearance(canvas);
                                                                }
                                                                annotManager.redrawAnnotation(widget);
                                                                console.log(`    ✅ Signature appearance restored for ${name}`);
                                                            }
                                                        } catch (appearanceError) {
                                                            console.warn(`    ⚠️ Could not create appearance for ${name}:`, appearanceError);
                                                        }
                                                    };
                                                    img.onerror = () => {
                                                        console.warn(`    ⚠️ Could not load signature image for ${name}`);
                                                    };
                                                    img.src = savedSignatureData;
                                                }
                                            } catch (sigError) {
                                                console.warn(`    ⚠️ Could not restore signature for ${name}:`, sigError);
                                            }
                                        }

                                        createdCount++;
                                        console.log(`    ✅ Created: ${name}${savedValue ? ' (with value)' : ''}${savedSignatureData ? ' (with signature)' : ''}`);
                                    } catch (e: any) {
                                        console.error(`    ❌ Failed to create ${fieldDef.name}:`, e?.message || e);
                                    }
                                }

                                // Redraw all annotations
                                if (createdCount > 0) {
                                    annotManager.drawAnnotationsFromList(annotManager.getAnnotationsList());
                                }
                                console.log(`🔧 [PDFViewer] Field recreation complete: ${createdCount} created, now ${annotManager.getAnnotationsList().length} annotations`);

                            } else if (widgets.length === 0) {
                                console.log(`⚠️ [PDFViewer] No widgets and no savedFormFields to recreate from`);
                            }

                            if (readOnly && !clientSigningMode) {
                                try {
                                    const roFieldManager = Core.annotationManager.getFieldManager();
                                    let roFields = getAllFieldsSafe(roFieldManager);
                                    if (roFields.length === 0) {
                                        roFields = getFieldsFromAnnotations(Core);
                                    }
                                    for (const field of roFields) {
                                        // ✅ FIX: Make ALL fields read-only including Sig fields
                                        // When reviewer/approver views the contract, everything should be non-interactive
                                        if (field.flags?.set) field.flags.set('ReadOnly', true);
                                        const widgets = field.widgets || [];
                                        widgets.forEach((widget: any) => {
                                            if (widget.setReadOnly) widget.setReadOnly(true);
                                            widget.NoInteraction = true;
                                            widget.ReadOnly = true;
                                        });
                                    }

                                    // Also disable all annotations (stamps, freetext, etc.)
                                    const allAnnots = Core.annotationManager.getAnnotationsList();
                                    for (const annot of allAnnots) {
                                        (annot as any).ReadOnly = true;
                                        if ((annot as any).NoInteraction !== undefined) (annot as any).NoInteraction = true;
                                    }

                                    Core.annotationManager.drawAnnotationsFromList(Core.annotationManager.getAnnotationsList());
                                } catch (e) { }
                            }

                            if (formFields && formFields.length > 0) {
                                try {
                                    const fieldManager = Core.annotationManager.getFieldManager();
                                    const annotManager = Core.annotationManager;

                                    for (const fieldDef of formFields) {
                                        if (!fieldDef.name || fieldDef.type === 'signature') continue;

                                        if (fieldDef.readOnly) {
                                            const field = fieldManager.getField(fieldDef.name);
                                            if (field?.flags?.set) field.flags.set('ReadOnly', true);
                                            const widgets = field?.widgets || [];
                                            widgets.forEach((w: any) => {
                                                if (w.setReadOnly) w.setReadOnly(true);
                                            });
                                            const annotations = annotManager.getAnnotationsList();
                                            for (const annot of annotations) {
                                                const annotFieldName = (annot as any).getField?.()?.name || (annot as any).fieldName;
                                                if (annotFieldName === fieldDef.name) {
                                                    (annot as any).ReadOnly = true;
                                                    if ((annot as any).setReadOnly) (annot as any).setReadOnly(true);
                                                }
                                            }
                                        }

                                        if (fieldDef.lockedBy) {
                                            const field = fieldManager.getField(fieldDef.name);
                                            const widgets = field?.widgets || [];
                                            widgets.forEach((w: any) => {
                                                const field = w.getField?.();
                                                if (field?.type === 'Sig') return;
                                                w.setCustomData?.('lockedBy', fieldDef.lockedBy);
                                            });
                                        }
                                    }
                                    Core.annotationManager.drawAnnotationsFromList(Core.annotationManager.getAnnotationsList());
                                } catch (e) { }
                            }

                            // Removed hidden anchor annotation logic as per request

                            if (currentUserRole && !readOnly) {
                                try {
                                    const annots = Core.annotationManager.getAnnotationsList();
                                    for (const annot of annots) {

                                        if (!isWidgetAnnot(annot, Core)) continue;

                                        const lockedBy = annot.getCustomData?.('lockedBy');
                                        const field = (annot as any).getField();

                                        if (field?.type === 'Sig') {
                                            (annot as any).ReadOnly = false;
                                            (annot as any).NoInteraction = false;
                                            continue;
                                        }
                                        if (lockedBy && lockedBy !== currentUserRole) {
                                            (annot as any).ReadOnly = true;
                                            (annot as any).NoInteraction = true;
                                        } else if (lockedBy === currentUserRole) {
                                            (annot as any).ReadOnly = false;
                                            (annot as any).NoInteraction = false;
                                        }
                                    }
                                    Core.annotationManager.drawAnnotationsFromList(annots);
                                } catch (e) { }
                            }

                            if (onFieldChange) {
                                Core.annotationManager.addEventListener('fieldChanged', (field: any, value: any) => {
                                    // Removed check to allow tracking signatures
                                    // if (field?.type === 'Sig') return;

                                    if (currentUserRole && field) {
                                        try {
                                            const widgets = field.widgets || [];
                                            const isFilled = value !== null && value !== '';
                                            widgets.forEach((widget: any) => {
                                                const currentLock = (widget as any).getCustomData?.('lockedBy');
                                                if (isFilled && !currentLock) {
                                                    (widget as any).setCustomData?.('lockedBy', currentUserRole);
                                                } else if (!isFilled && currentLock === currentUserRole) {
                                                    (widget as any).deleteCustomData?.('lockedBy');
                                                }
                                            });
                                        } catch (e) { }
                                    }
                                    if (onFieldChange) {
                                        onFieldChange(field.name, value);
                                    }
                                    // Track modification for smart export
                                    if (field?.name) {
                                        modifiedFields.current.add(field.name);
                                    }
                                });
                            }

                            setLoading(false);
                            if (onDocumentLoaded) onDocumentLoaded();

                            if (clientSigningMode) {
                                // ✅ STRICT EDIT MODE: External clients can only FILL existing fields
                                // Switch to View toolbar (Pan/Select) and disable all creation tools
                                UI.setToolbarGroup('toolbarGroup-View');

                                UI.disableElements([
                                    'toolbarGroup-Annotate',
                                    'toolbarGroup-Forms',
                                    'toolbarGroup-Edit',
                                    'toolbarGroup-Insert',
                                    'toolbarGroup-FillAndSign',
                                    'toolbarGroup-Shapes',
                                    'signatureToolGroupButton',
                                    'rubberStampToolGroupButton',
                                    'highlightToolGroupButton',
                                    'formFieldCreateButtons'
                                ]);

                                // ✅ FIX: Don't set AnnotationCreateSignature tool mode immediately.

                                // ✅ FIX: Don't set AnnotationCreateSignature tool mode immediately.
                                // It forces the signature tool to be active, which interferes when
                                // the user clicks on a text field first (preventing text entry).
                                // Let PDFTron handle tool switching naturally when fields are clicked.
                            }

                        } catch (err: any) {
                            console.error('❌ [PDFViewer] CRASH in documentLoaded handler:', err);
                        }
                    });

                    if (documentUrl) {
                        await UI.loadDocument(documentUrl);
                    } else {
                        setLoading(false);
                    }

                } catch (err: any) {
                    console.error('❌ Error initializing PDFTron:', err);
                    setError('Failed to initialize PDF viewer');
                    setLoading(false);
                    if (onError) onError('Failed to initialize PDF viewer');
                }
            };

            initializeViewer();

            return () => {
                if (viewerInstance.current) {
                    try {
                        viewerInstance.current.UI.dispose();
                    } catch (e) { }
                    viewerInstance.current = null;
                }
            };
        }, []);

        useEffect(() => {
            if (documentUrl && viewerInstance.current) {
                const loadDocument = async () => {
                    try {
                        setLoading(true);
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




                {/* ✅ NEW: Floating Field Navigation Button (Odoo Sign style) */}
                {showFieldNavigation && !loading && !effectiveReadOnly && (
                    <Box
                        onClick={handleNavigationClick}
                        sx={{
                            position: 'absolute',
                            left: 0,
                            top: '50%',
                            transform: 'translateY(-50%)',
                            zIndex: 100,
                            cursor: 'pointer',
                            display: 'flex',
                            alignItems: 'center',
                            // Arrow-shaped button pointing right
                            '&:hover': {
                                '& .nav-button': {
                                    transform: 'translateX(4px)',
                                },
                            },
                        }}
                    >
                        <Box
                            className="nav-button"
                            sx={{
                                display: 'flex',
                                alignItems: 'center',
                                gap: 0.5,
                                bgcolor: isOnLastField ? '#6B5B95' : '#4A4458',
                                color: 'white',
                                py: 1.25,
                                pl: 2,
                                pr: 1,
                                fontWeight: 600,
                                fontSize: '0.85rem',
                                letterSpacing: '0.5px',
                                textTransform: 'uppercase',
                                borderTopRightRadius: '24px',
                                borderBottomRightRadius: '24px',
                                boxShadow: '2px 2px 8px rgba(0,0,0,0.3)',
                                transition: 'all 0.2s ease',
                                userSelect: 'none',
                                whiteSpace: 'nowrap',
                            }}
                        >
                            {getNavigationButtonLabel()}
                            {isOnLastField ? (
                                <ReplayIcon sx={{ fontSize: '1.1rem', ml: 0.5 }} />
                            ) : (
                                <ArrowForwardIcon sx={{ fontSize: '1.1rem', ml: 0.5 }} />
                            )}
                        </Box>
                        {/* Arrow pointer */}
                        <Box
                            sx={{
                                width: 0,
                                height: 0,
                                borderTop: '20px solid transparent',
                                borderBottom: '20px solid transparent',
                                borderLeft: isOnLastField ? '12px solid #6B5B95' : '12px solid #4A4458',
                                transition: 'border-color 0.2s ease',
                            }}
                        />
                    </Box>
                )}

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