'use client';

import { useRef, useEffect, useState, forwardRef, useImperativeHandle } from 'react';
import { Box, CircularProgress, Alert } from '@mui/material';
import { FormFieldDefinition } from '@/types/template';
import { detectFieldType, getFieldName, isWidgetAnnotation, extractWidgetFlags } from '@/utils/pdfFieldHelpers';

interface PDFViewerContainerProps {
    documentUrl?: string;
    xfdfString?: string;
    readOnly?: boolean;
    commentsOnly?: boolean; // NEW: Read + Comments access only (for reviewers/approvers)
    clientSigningMode?: boolean; // NEW: Client can only fill empty, non-readOnly fields
    templateFormFields?: any[]; // NEW: Template's form field definitions (for readOnly flags)
    toolbarMode?: 'annotate' | 'forms'; // 'annotate' for contracts, 'forms' for template builder
    formFields?: any[]; // Form field definitions to display as overlays
    onDocumentLoaded?: () => void;
    onError?: (error: string) => void;
    onFieldChange?: (fieldName: string, value: any) => void;  // Phase 2: Field value change callback
}

export interface PDFViewerHandle {
    exportAnnotations: (fieldValues?: Record<string, string>) => Promise<string>;
    exportFormFields: () => Promise<any[]>; // Returns FormFieldDefinition[]
    dispose: () => void;
}

const PDFViewerContainer = forwardRef<PDFViewerHandle, PDFViewerContainerProps>(
    ({ documentUrl, xfdfString, readOnly = false, commentsOnly = false, clientSigningMode = false, templateFormFields, toolbarMode = 'annotate', formFields, onDocumentLoaded, onError, onFieldChange }, ref) => {


        const viewerDiv = useRef<HTMLDivElement>(null);
        const viewerInstance = useRef<any>(null);
        const [loading, setLoading] = useState(true);
        const [error, setError] = useState<string>('');

        // Track form fields created via Forms toolbar in real-time
        // PDFTron doesn't commit them to managers until editing is complete
        // Phase 3: Improved type safety
        const createdFormFieldsRef = useRef<FormFieldDefinition[]>([]);

        // CRITICAL: Store signature data persistently to survive re-renders
        // This ensures signatures can be restored before export even if annotations are lost
        const persistentSignaturesRef = useRef<Array<{
            id: string;
            pageNumber: number;
            paths: any[];
            rect: { x1: number; y1: number; x2: number; y2: number };
            strokeColor: { R: number; G: number; B: number };
            strokeThickness: number;
            imageData?: string | null; // For text/image-based signatures
        }>>([]);

        // Log when form fields are received for display
        if (formFields && formFields.length > 0) {
            console.log('📋 PDFViewerContainer: Received formFields for display:', formFields.length);
            console.log('  - Fields:', formFields);
        }

        useImperativeHandle(ref, () => ({
            /**
             * Export annotations as XFDF string
             * CRITICAL FIX: Explicitly set field values before export (per Apryse docs)
             * @param fieldValues - Optional object with field values to set before export
             */
            exportAnnotations: async (fieldValues?: Record<string, string>) => {
                if (!viewerInstance.current) {
                    console.error('❌ Cannot export: Viewer instance not initialized');
                    return null;
                }

                try {
                    const { Core } = viewerInstance.current;
                    const annotationManager = Core.annotationManager;
                    const fieldManager = annotationManager.getFieldManager();

                    console.log('📤 Starting XFDF export...');
                    console.log('📝 Field values received:', fieldValues);

                    // CRITICAL FIX per Apryse docs:
                    // "It is better to get the field and set its value as a field can have 
                    // one or more widget annotations. Setting the field's value will set 
                    // the value on all its widget annotations."

                    if (fieldValues && Object.keys(fieldValues).length > 0) {
                        console.log('🔄 Setting field values explicitly before export...');

                        // Set each field value using fieldManager.getField().setValue()
                        // This is the CORRECT way per Apryse documentation
                        for (const fieldName in fieldValues) {
                            const value = fieldValues[fieldName];
                            try {
                                const field = fieldManager.getField(fieldName);
                                if (field) {
                                    // Skip signature fields - they're set via annotations, not values
                                    // Signature fields have type 'Sig'
                                    if (field.type === 'Sig') {
                                        console.log(`  ⏭️ Skipping signature field: ${fieldName} (handled via annotations)`);
                                        continue;
                                    }

                                    console.log(`  ✓ Setting ${fieldName} = "${value}"`);
                                    field.setValue(value);
                                } else {
                                    console.warn(`  ⚠️ Field not found: ${fieldName}`);
                                }
                            } catch (err) {
                                console.error(`  ❌ Error setting ${fieldName}:`, err);
                            }
                        }

                        // Wait for values to be committed
                        await new Promise(resolve => setTimeout(resolve, 300));
                        console.log('✅ Field values set successfully');
                    } else {
                        console.log('⚠️ No field values provided, check if fields were filled');
                    }

                    // Get all annotations including widgets
                    const annotations = annotationManager.getAnnotationsList();
                    console.log('📊 Total annotations in document:', annotations.length);

                    // CRITICAL: Force all field values to be committed
                    // Explanation: When user fills fields, changes are pending until committed
                    // We need to ensure all field values are saved before export
                    console.log('🔄 Committing field values...');

                    // Method 1: Deselect all to commit pending edits  
                    // DISABLED: Not needed when we explicitly set values
                    // annotationManager.deselectAllAnnotations();

                    // Method 2: Update field manager to commit changes
                    // DISABLED: This was overwriting the values we just set above!
                    /*
                    try {
                        const fields = fieldManager.getFields();
                        Object.keys(fields).forEach(fieldName => {
                            const field = fields[fieldName];
                            const currentValue = field.getValue();
                            // Force re-set to ensure value is committed
                            if (currentValue !== null && currentValue !== undefined) {
                                field.setValue(currentValue);
                            }
                        });
                    } catch (e) {
                        console.warn('Could not force field value commit:', e);
                    }
                    */

                    // Method 3: Wait for PDFTron to fully commit all changes
                    await new Promise(resolve => setTimeout(resolve, 500));

                    // Get and log all form field values
                    const fields = fieldManager.getFields();
                    const formFieldsWithValues = [];

                    for (const fieldName in fields) {
                        const field = fields[fieldName];
                        const value = field.getValue();
                        formFieldsWithValues.push({
                            name: fieldName,
                            value: value || ''
                        });
                    }

                    console.log('📝 Form field values before export:', formFieldsWithValues);
                    console.log('📊 Total filled form fields:', formFieldsWithValues.filter(f => f.value).length);

                    // Export XFDF with WIDGETS option to include form field values
                    // Explanation: By default, exportAnnotations might not include widget values
                    // Export XFDF with field values included
                    console.log('📦 Exporting XFDF...');

                    // CRITICAL: Re-add signatures from persistentSignaturesRef if they're missing
                    // This ensures signatures survive component re-renders and internal PDFTron deletions
                    if (persistentSignaturesRef.current.length > 0) {
                        console.log('🔄 Checking for missing signatures from persistentSignaturesRef...');
                        console.log(`   📊 Stored signatures: ${persistentSignaturesRef.current.length}`);

                        const currentAnnots = annotationManager.getAnnotationsList();
                        const existingSignatureIds = new Set(
                            currentAnnots
                                .filter((a: any) => a.Subject === 'Signature' || a.getCustomData?.('persistentSignature'))
                                .map((a: any) => a.Id)
                        );

                        for (const sigData of persistentSignaturesRef.current) {
                            if (!existingSignatureIds.has(sigData.id)) {
                                const hasPaths = sigData.paths && sigData.paths.length > 0;
                                const hasImageData = sigData.imageData && typeof sigData.imageData === 'string';

                                console.log(`   🔄 Signature ${sigData.id.substring(0, 8)} missing, re-adding...`);
                                console.log(`      hasPaths: ${hasPaths}, hasImageData: ${hasImageData}`);

                                // Skip if no data to restore
                                if (!hasPaths && !hasImageData) {
                                    console.log(`   ⚠️ Skipping - no paths or image data`);
                                    continue;
                                }

                                try {
                                    const { Annotations, Math: PDFMath } = Core;
                                    let restoredAnnot: any;

                                    if (hasPaths) {
                                        // FreeHand signature with paths
                                        restoredAnnot = new Annotations.FreeHandAnnotation();
                                        restoredAnnot.StrokeColor = new Annotations.Color(
                                            sigData.strokeColor.R,
                                            sigData.strokeColor.G,
                                            sigData.strokeColor.B
                                        );
                                        restoredAnnot.StrokeThickness = sigData.strokeThickness;

                                        // Re-create paths with Point objects
                                        const reconstructedPaths = sigData.paths.map((path: any[]) =>
                                            path.map((pt: any) => new PDFMath.Point(pt.x, pt.y))
                                        );

                                        if (typeof restoredAnnot.setPaths === 'function') {
                                            restoredAnnot.setPaths(reconstructedPaths);
                                        } else if (typeof restoredAnnot.setPath === 'function') {
                                            reconstructedPaths.forEach((path: any, idx: number) => {
                                                restoredAnnot.setPath(path, idx);
                                            });
                                        }
                                        console.log(`   📍 Re-adding as FreeHandAnnotation with ${reconstructedPaths.length} paths`);
                                    } else if (hasImageData) {
                                        // Typed/image signature - use StampAnnotation
                                        restoredAnnot = new Annotations.StampAnnotation();
                                        restoredAnnot.ImageData = sigData.imageData;

                                        if (typeof restoredAnnot.setImageData === 'function') {
                                            restoredAnnot.setImageData(sigData.imageData);
                                        }
                                        console.log(`   📍 Re-adding as StampAnnotation with image data`);
                                    }

                                    // Common properties
                                    restoredAnnot.PageNumber = sigData.pageNumber;
                                    restoredAnnot.Subject = 'Signature';
                                    restoredAnnot.Author = 'User';

                                    // Set position
                                    restoredAnnot.X = sigData.rect.x1;
                                    restoredAnnot.Y = sigData.rect.y1;
                                    restoredAnnot.Width = sigData.rect.x2 - sigData.rect.x1;
                                    restoredAnnot.Height = sigData.rect.y2 - sigData.rect.y1;

                                    // Mark as exportable
                                    restoredAnnot.setCustomData('persistentSignature', 'true');
                                    restoredAnnot.Listable = true;
                                    restoredAnnot.NoExport = false;

                                    // Add to document
                                    annotationManager.addAnnotation(restoredAnnot);
                                    annotationManager.redrawAnnotation(restoredAnnot);

                                    console.log(`   ✅ Signature re-added for export: ${restoredAnnot.Id?.substring(0, 8)}`);
                                } catch (err) {
                                    console.error(`   ❌ Failed to re-add signature:`, err);
                                }
                            } else {
                                console.log(`   ✓ Signature ${sigData.id.substring(0, 8)} already exists`);
                            }
                        }
                    }

                    // DEBUG: Check what annotations exist before export
                    const allAnnotations = annotationManager.getAnnotationsList();
                    console.log('📊 Total annotations before export:', allAnnotations.length);
                    allAnnotations.forEach((annot: any) => {
                        const type = annot.constructor.name;
                        const subject = annot.Subject || 'no subject';
                        const id = annot.Id?.substring(0, 8);
                        console.log(`  - ${type}: "${subject}" (ID: ${id}...)`);

                        // Check for signature widgets - these hold the typed signature appearance
                        if (type === 'SignatureWidgetAnnotation' || type === 'WidgetAnnotation') {
                            const fieldName = annot.getFieldName?.() || annot.getField?.()?.name || 'unknown';
                            console.log(`    🖊️ Widget field: ${fieldName}`);

                            // Check if widget has an appearance (this is where typed signatures are stored)
                            const hasAppearance = annot.getCustomAppearances?.() || annot.getAppearances?.();
                            console.log(`    📸 Has appearances: ${!!hasAppearance}`);

                            // Check if the field is signed
                            const field = annot.getField?.();
                            if (field) {
                                const isSigned = field.getValue?.() || field.isSignedDigitally?.();
                                console.log(`    ✏️ Field value/signed: ${!!isSigned}`);
                            }
                        }

                        // Check for FreeHand paths
                        if (type === 'FreeHandAnnotation' || subject === 'Signature') {
                            const paths = annot.getPaths?.() || [];
                            console.log(`    📍 FreeHand paths: ${paths.length}`);
                            if (paths.length > 0) {
                                console.log(`    📍 First path points: ${paths[0]?.length || 0}`);
                            }
                            console.log(`    📍 Position: (${annot.X?.toFixed(0)}, ${annot.Y?.toFixed(0)})`);
                            console.log(`    📍 Size: ${annot.Width?.toFixed(0)} x ${annot.Height?.toFixed(0)}`);
                        }
                    });

                    const xfdfString = await annotationManager.exportAnnotations({
                        annots: true,    // Include signature drawings (FreeHandAnnotation, InkAnnotation, etc.)
                        widgets: true,
                        fields: true,
                        links: false
                    });

                    console.log('✅ XFDF exported');
                    console.log('📋 XFDF length:', xfdfString.length);

                    // DEBUG: Check if signature annotations are in XFDF
                    const hasAnnots = xfdfString.includes('<annots>');
                    // Use [\s\S] instead of /s flag for ES2017 compatibility
                    const annotsSection = xfdfString.match(/<annots>([\s\S]*?)<\/annots>/);
                    const annotsContent = annotsSection ? annotsSection[1] : '';

                    console.log('� XFDF Annots section:', hasAnnots ? 'EXISTS' : 'MISSING');
                    if (annotsContent.trim()) {
                        console.log('✅ Annots has content:', annotsContent.substring(0, 200));
                    } else {
                        console.log('❌ Annots section is EMPTY!');
                    }

                    // Check for specific annotation types
                    const hasFreehand = xfdfString.includes('<freehand') || xfdfString.includes('FreeHand');
                    const hasInk = xfdfString.includes('<ink');
                    console.log('Signature annotations:', { hasFreehand, hasInk });
                    console.log('📋 XFDF preview:', xfdfString.substring(0, 500));

                    // Verify field values are in XFDF
                    const hasFieldValues = xfdfString.includes('<fields>') && xfdfString.includes('<value>');
                    if (hasFieldValues) {
                        console.log('✅ XFDF contains field values!');
                    } else {
                        console.warn('⚠️ XFDF might not contain field values - checking...');

                        // Extract values from XFDF to verify
                        const valueMatches = xfdfString.match(/<value>([^<]*)<\/value>/g);
                        const hasNonEmptyValues = valueMatches && valueMatches.some((m: string) =>
                            m !== '<value></value>' && m !== '<value />'
                        );
                        if (hasNonEmptyValues) {
                            console.log('✅ Found field values in XFDF:', valueMatches);
                        } else {
                            console.error('❌ No field values found in XFDF!');
                            console.log('Full XFDF for debugging:', xfdfString);
                        }
                    }

                    return xfdfString;
                } catch (error) {
                    console.error('❌ Error exporting annotations:', error);
                    return null;
                }
            },

            /**
             * Export form fields as FormFieldDefinition array
             */
            exportFormFields: async () => {
                if (!viewerInstance.current) {
                    console.error('Cannot export: Viewer instance not initialized');
                    return [];
                }

                try {
                    const { Core } = viewerInstance.current;
                    const annotationManager = Core.annotationManager;

                    console.log('Extracting form fields...');

                    // CRITICAL: Force PDFTron to finalize any pending annotations
                    // Deselect all annotations to ensure they're committed
                    console.log('🔄 Forcing annotation commit...');
                    annotationManager.deselectAllAnnotations();

                    // Trigger history update to commit changes
                    try {
                        const annotationHistory = annotationManager.getAnnotationHistoryManager();
                        if (annotationHistory) {
                            annotationHistory.update();
                        }
                    } catch (e) {
                        console.warn('Could not update annotation history:', e);
                    }

                    // Wait for PDFTron to commit pending changes
                    console.log('⏳ Waiting for PDFTron to commit pending changes...');
                    await new Promise(resolve => setTimeout(resolve, 800));

                    // Get all annotations
                    const annotations = annotationManager.getAnnotationsList();
                    console.log('  - Total annotations:', annotations.length);

                    // Debug: Log ALL annotation details
                    if (annotations.length > 0) {
                        console.log('  - Annotation details:', annotations.map((a: any) => ({
                            id: a.Id,
                            type: a.constructor.name,
                            subject: a.Subject,
                            isWidget: a instanceof Core.Annotations.WidgetAnnotation,
                            hasField: !!a.getField,
                            hasWidgets: !!a.widgets,
                            fieldName: a.fieldName || a.getField?.()?.name
                        })));
                    }

                    // Also check FieldManager
                    const fieldManager = annotationManager.getFieldManager();
                    const allFieldsObj = fieldManager.getFields();
                    const fieldNames = Object.keys(allFieldsObj);
                    console.log(`  - Fields in FieldManager: ${fieldNames.length}`, fieldNames);

                    // CRITICAL: Use tracked fields from real-time event listener
                    // Fields created via Forms toolbar are tracked as they're created
                    console.log(`\n🎯 Checking tracked fields from toolbar: ${createdFormFieldsRef.current.length}`);

                    if (createdFormFieldsRef.current.length > 0) {
                        console.log('✅ Using fields tracked from toolbar events!');
                        console.log('  - Tracked fields:', createdFormFieldsRef.current.map((f: any) => f.name));
                        return createdFormFieldsRef.current;
                    }

                    const formFields: any[] = [];

                    // METHOD 1: Try getting fields from AnnotationManager (existing widgets)
                    const widgetAnnotations = annotations.filter((annot: any) => {
                        // Method 1: instanceof check
                        if (annot instanceof Core.Annotations.WidgetAnnotation) return true;

                        // Method 2: Check constructor name
                        const className = annot.constructor.name;
                        if (className.includes('Widget') ||
                            className.includes('FormField') ||
                            className === 'TextWidgetAnnotation' ||
                            className === 'SignatureWidgetAnnotation' ||
                            className === 'CheckButtonWidgetAnnotation') {
                            return true;
                        }

                        // Method 3: Check if it has getField method
                        if (typeof annot.getField === 'function') return true;

                        // Method 4: Check Subject property
                        if (annot.Subject === 'Widget' || annot.Subject === 'FormField') return true;

                        return false;
                    });

                    console.log('  - Widget annotations (form fields):', widgetAnnotations.length);

                    // METHOD 2: If no widgets found via annotations, try FieldManager directly
                    // This is needed because forms created via Forms toolbar may not show in annotation list
                    if (widgetAnnotations.length === 0) {
                        console.log('⚠️ No widgets in annotation list, trying FieldManager...');

                        const fieldManager = annotationManager.getFieldManager();
                        const allFields = fieldManager.getFields();

                        console.log(`  - Fields in FieldManager: ${Object.keys(allFields).length}`);

                        // Extract form fields from FieldManager
                        for (const fieldName in allFields) {
                            const field = allFields[fieldName];
                            const widgets = field.widgets;

                            if (!widgets || widgets.length === 0) {
                                console.warn(`  ⚠️ Field "${fieldName}" has no widgets, skipping`);
                                continue;
                            }

                            // Get first widget (fields usually have one widget)
                            const widget = widgets[0];

                            try {
                                const rect = widget.getRect();
                                const pageNumber = widget.getPageNumber();

                                // Determine field type
                                let fieldType = 'text';
                                const fieldTypeProp = field.type || '';

                                if (fieldTypeProp === 'Sig') {
                                    fieldType = 'signature';
                                } else if (fieldTypeProp === 'Btn') {
                                    fieldType = 'checkbox';
                                } else if (fieldTypeProp === 'Tx') {
                                    fieldType = 'text';
                                }

                                // Extract flags
                                const fieldFlags = field.flags;
                                const isRequired = fieldFlags?.get?.('Required') || false;
                                const isReadOnly = fieldFlags?.get?.('ReadOnly') || false;
                                const isMultiline = fieldFlags?.get?.('Multiline') || false;
                                const doNotScroll = fieldFlags?.get?.('DoNotScroll') || false;
                                const doNotSpellCheck = fieldFlags?.get?.('DoNotSpellCheck') || false;

                                const formField: any = {
                                    name: fieldName,
                                    type: fieldType,
                                    x: rect.x1,
                                    y: rect.y1,
                                    width: rect.x2 - rect.x1,
                                    height: rect.y2 - rect.y1,
                                    pageNumber: pageNumber,

                                    // Widget flags
                                    required: isRequired,
                                    readOnly: isReadOnly,
                                    multiline: isMultiline,
                                    doNotScroll: doNotScroll,
                                    doNotSpellCheck: doNotSpellCheck,

                                    placeholder: '',
                                    label: fieldName.replace(/_/g, ' ').replace(/\b\w/g, (l: string) => l.toUpperCase()),
                                };

                                formFields.push(formField);
                                console.log(`  ✓ Extracted from FieldManager: ${fieldName} (${fieldType}) [required: ${isRequired}, readOnly: ${isReadOnly}]`);
                            } catch (err) {
                                console.warn(`Failed to extract field "${fieldName}":`, err);
                            }
                        }
                    }

                    for (const widget of widgetAnnotations) {
                        try {
                            const fieldName = widget.fieldName || widget.getField?.()?.name || `field_${Date.now()}`;
                            const rect = widget.getRect();
                            const pageNumber = widget.getPageNumber();

                            // Determine field type
                            let fieldType = 'text';
                            const widgetType = widget.getFormFieldPlaceHolderType?.() || '';
                            const widgetClassName = widget.constructor.name;
                            const field = widget.getField?.();
                            const fieldTypeProp = field?.type || '';

                            console.log(`    - Widget: ${fieldName}, Class: ${widgetClassName}, PlaceholderType: ${widgetType}, FieldType: ${fieldTypeProp}`);

                            // Check for signature field (multiple checks for reliability)
                            if (
                                widgetClassName.includes('Signature') ||
                                widgetType.includes('Signature') ||
                                fieldTypeProp === 'Sig' ||
                                widget.fieldFlags?.SignatureField ||
                                fieldName.toLowerCase().includes('signature')
                            ) {
                                fieldType = 'signature';
                            } else if (widgetType.includes('CheckBox') || widgetClassName.includes('CheckBox') || widget.fieldFlags?.CheckBox) {
                                fieldType = 'checkbox';
                            } else if (widgetType.includes('RadioButton') || widgetClassName.includes('Radio')) {
                                fieldType = 'radio';
                            } else if (widgetType.includes('ListBox') || widgetType.includes('ComboBox')) {
                                fieldType = 'dropdown';
                            } else if (fieldName.toLowerCase().includes('date')) {
                                fieldType = 'date';
                            }

                            // Extract widget flags from the field
                            const fieldFlags = field?.flags;
                            const isRequired = fieldFlags?.get?.('Required') || false;
                            const isReadOnly = fieldFlags?.get?.('ReadOnly') || false;
                            const isMultiline = fieldFlags?.get?.('Multiline') || false;
                            const doNotScroll = fieldFlags?.get?.('DoNotScroll') || false;
                            const doNotSpellCheck = fieldFlags?.get?.('DoNotSpellCheck') || false;

                            const formField: any = {
                                name: fieldName,
                                type: fieldType,
                                x: rect.x1,
                                y: rect.y1,
                                width: rect.x2 - rect.x1,
                                height: rect.y2 - rect.y1,
                                pageNumber: pageNumber,

                                // Widget flags
                                required: isRequired,
                                readOnly: isReadOnly,
                                multiline: isMultiline,
                                doNotScroll: doNotScroll,
                                doNotSpellCheck: doNotSpellCheck,

                                placeholder: '',
                                label: fieldName.replace(/_/g, ' ').replace(/\b\w/g, (l: string) => l.toUpperCase()),
                            };

                            formFields.push(formField);
                            console.log(`  ✓ Extracted: ${fieldName} (${fieldType}) [required: ${isRequired}, readOnly: ${isReadOnly}]`);
                        } catch (err) {
                            console.warn('Failed to extract field:', err);
                        }
                    }

                    console.log('Form fields extracted:', formFields.length);
                    return formFields;

                } catch (error) {
                    console.error('Error extracting form fields:', error);
                    return [];
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
                            // Ensure PDFTron's internal modals appear above the parent dialog
                            css: '/webviewer-custom.css',
                        },
                        viewerDiv.current
                    );

                    viewerInstance.current = instance;
                    const { UI, Core } = instance;

                    // Configure for our use case
                    UI.setTheme(UI.Theme.LIGHT);

                    if (readOnly && !commentsOnly) {
                        // Full read-only mode for viewing filled contracts - no annotations at all
                        UI.disableFeatures([
                            UI.Feature.Annotations,
                            UI.Feature.FilePicker,
                            UI.Feature.Print,
                            UI.Feature.Download,
                        ]);
                        console.log('🔒 Full read-only mode enabled');
                    } else if (commentsOnly) {
                        // Comments-only mode: READ + COMMENTS access for reviewers/approvers
                        // They can read the document and add comments, but cannot edit form fields
                        console.log('📝 Comments-only mode for reviewer/approver');

                        // Disable file operations
                        UI.disableFeatures([
                            UI.Feature.FilePicker,
                            UI.Feature.Print,
                            UI.Feature.Download,
                        ]);

                        // Enable only comment/notes features
                        UI.enableFeatures([
                            UI.Feature.NotesPanel,
                            UI.Feature.TextSelection,
                        ]);

                        // Set to View toolbar (minimal tools)
                        UI.setToolbarGroup('toolbarGroup-View');

                        // Disable all editing toolbar groups
                        UI.disableElements([
                            'toolbarGroup-Annotate',
                            'toolbarGroup-Forms',
                            'toolbarGroup-Edit',
                            'toolbarGroup-Insert',
                            'toolbarGroup-FillAndSign',
                            'toolbarGroup-Shapes',
                            // Also disable specific tools that could modify content
                            'signatureToolGroupButton',
                            'rubberStampToolGroupButton',
                            'highlightToolGroupButton',
                            'freeHandToolGroupButton',
                            'freeHandHighlightToolGroupButton',
                            'underlineToolGroupButton',
                            'strikeoutToolGroupButton',
                            'squigglyToolGroupButton',
                            'freeTextToolGroupButton',
                            'calloutToolGroupButton',
                            'rectangleToolGroupButton',
                            'ellipseToolGroupButton',
                            'lineToolGroupButton',
                            'arrowToolGroupButton',
                            'polylineToolGroupButton',
                            'polygonToolGroupButton',
                            'cloudToolGroupButton',
                            'linkButton',
                            'fileAttachmentToolGroupButton',
                            'stampToolGroupButton',
                            'eraserToolButton',
                            'cropToolGroupButton',
                        ]);

                        // Enable sticky note/comment tools
                        UI.enableElements([
                            'noteToolGroupButton',
                            'stickyToolGroupButton',
                            'notesPanel',
                            'notesPanelButton',
                            'toggleNotesButton',
                        ]);

                        console.log('✅ Comments-only mode enabled - reviewers can add comments');
                    } else {

                        // Editing mode - set toolbar based on mode
                        if (toolbarMode === 'forms') {
                            // Forms mode - show form building tools for template creation
                            UI.setToolbarGroup('toolbarGroup-Forms');
                            console.log('📝 Forms toolbar enabled for template building');
                        } else {
                            // Contract editing mode - show Annotate toolbar
                            // This includes: signature, freetext, highlight, shapes, stamps, etc.
                            // Form filling still works via formFields prop
                            UI.setToolbarGroup('toolbarGroup-Annotate');
                            console.log('📝 Annotate toolbar enabled with form support');
                        }

                        // Enable all necessary features for editing
                        UI.enableFeatures([
                            UI.Feature.Annotations,
                            UI.Feature.TextSelection,
                            UI.Feature.NotesPanel,
                        ]);

                        console.log('✅ Annotation features enabled');

                        // CRITICAL: Listen for form field creation events
                        // Forms toolbar creates fields that aren't immediately in managers
                        Core.annotationManager.addEventListener('annotationChanged', (annotations: any, action: string, info: any) => {
                            if (action === 'add') {
                                annotations.forEach((annot: any) => {
                                    // Check if it's a widget/form field annotation
                                    const isWidget = annot instanceof Core.Annotations.WidgetAnnotation ||
                                        annot.constructor.name.includes('Widget') ||
                                        typeof annot.getField === 'function';

                                    if (isWidget) {
                                        try {
                                            const field = annot.getField?.();

                                            // Phase 3 Task 3.2: Proper field name validation
                                            const fieldName = getFieldName(annot, field);
                                            if (!fieldName) {
                                                console.warn('⚠️ Form field has no valid name, skipping');
                                                return;
                                            }

                                            // Check if already tracked
                                            // 1. Try by Annotation ID (most reliable)
                                            const existingById = createdFormFieldsRef.current.find((f: any) => f.annotationId === annot.Id);
                                            // 2. Fallback to name (for legacy/other cases)
                                            const existingByName = createdFormFieldsRef.current.find((f: any) => f.name === fieldName);

                                            if (!existingById && !existingByName) {
                                                console.log('✅ Form field created via toolbar:', fieldName, annot.constructor.name);

                                                // Extract and store immediately
                                                const rect = annot.getRect();
                                                const pageNumber = annot.getPageNumber();

                                                // Phase 3 Task 3.3: Use helper utility for type detection
                                                const fieldType = detectFieldType(annot, field);

                                                const fieldData: FormFieldDefinition = {
                                                    name: fieldName,
                                                    annotationId: annot.Id, // Store ID for tracking
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
                                                console.log(`📦 Stored field: ${fieldName} (ID: ${annot.Id}), Total: ${createdFormFieldsRef.current.length}`);
                                            }
                                        } catch (err) {
                                            console.warn('Failed to extract newly created field:', err);
                                        }
                                    }
                                });
                            } else if (action === 'modify') {
                                // Handle field modifications (e.g., checking Required checkbox, moving, resizing)
                                annotations.forEach((annot: any) => {
                                    if (!isWidgetAnnotation(annot, Core)) return;

                                    try {
                                        const field = annot.getField?.();
                                        const fieldName = getFieldName(annot, field);

                                        if (!fieldName) return;

                                        // Find and update existing field
                                        // CRITICAL: Look up by Annotation ID first to handle Renaming
                                        let existingIndex = createdFormFieldsRef.current.findIndex((f) => f.annotationId === annot.Id);

                                        // Fallback: Look up by name if ID lookup fails
                                        if (existingIndex === -1) {
                                            existingIndex = createdFormFieldsRef.current.findIndex((f) => f.name === fieldName);
                                        }

                                        if (existingIndex > -1) {
                                            // Extract updated flags
                                            const flags = extractWidgetFlags(field);

                                            // Extract updated coordinates
                                            const rect = annot.getRect();
                                            const pageNumber = annot.getPageNumber();

                                            const oldName = createdFormFieldsRef.current[existingIndex].name;
                                            const nameChanged = oldName !== fieldName;

                                            // Update the stored field data
                                            createdFormFieldsRef.current[existingIndex] = {
                                                ...createdFormFieldsRef.current[existingIndex],
                                                // Update name (in case it was renamed)
                                                name: fieldName,
                                                // Ensure ID is set
                                                annotationId: annot.Id,
                                                // Update flags
                                                required: flags.required,
                                                readOnly: flags.readOnly,
                                                multiline: flags.multiline,
                                                doNotScroll: flags.doNotScroll,
                                                doNotSpellCheck: flags.doNotSpellCheck,
                                                // Update coordinates
                                                x: rect.x1,
                                                y: rect.y1,
                                                width: rect.x2 - rect.x1,
                                                height: rect.y2 - rect.y1,
                                                pageNumber: pageNumber,
                                            };

                                            console.log(`🔄 Updated field: ${fieldName} ${nameChanged ? `(was ${oldName})` : ''} [required: ${flags.required}, pos: ${rect.x1.toFixed(0)},${rect.y1.toFixed(0)}]`);
                                        }
                                    } catch (err) {
                                        console.warn('Failed to update modified field:', err);
                                    }
                                });
                            } else if (action === 'delete') {
                                // Remove from tracked fields
                                annotations.forEach((annot: any) => {
                                    // Try find by ID first
                                    let index = createdFormFieldsRef.current.findIndex((f: any) => f.annotationId === annot.Id);

                                    // Fallback to name if not found by ID (and if it's a widget)
                                    if (index === -1 && isWidgetAnnotation(annot, Core)) {
                                        const field = annot.getField?.();
                                        const fieldName = getFieldName(annot, field);
                                        if (fieldName) {
                                            index = createdFormFieldsRef.current.findIndex((f: any) => f.name === fieldName);
                                        }
                                    }

                                    if (index > -1) {
                                        console.log('🗑️ Field deleted:', createdFormFieldsRef.current[index].name);
                                        createdFormFieldsRef.current.splice(index, 1);
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

                        // Annotation manager is already in writable mode from enableFeatures
                        console.log('✅ Document ready for annotations');

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

                        // ========================================
                        // FULL READ-ONLY MODE: Lock ALL form fields
                        // ========================================
                        // For reviewers/approvers - strict view-only access
                        // They should not be able to type in ANY form field
                        if (readOnly && !clientSigningMode) {
                            console.log('🔒 Full read-only mode - locking ALL form fields...');

                            try {
                                const fieldManager = Core.annotationManager.getFieldManager();
                                const allFields = fieldManager.getFields();

                                let lockedCount = 0;

                                for (const fieldName in allFields) {
                                    const field = allFields[fieldName];

                                    // Lock the field by setting ReadOnly flag
                                    if (field.flags?.set) {
                                        field.flags.set('ReadOnly', true);
                                    }

                                    // Also update widget annotations for this field
                                    const widgets = field.widgets || [];
                                    widgets.forEach((widget: any) => {
                                        if (widget.setReadOnly) widget.setReadOnly(true);
                                        // Disable any interaction
                                        widget.NoInteraction = true;
                                    });

                                    lockedCount++;
                                }

                                console.log(`✅ Full read-only mode: ${lockedCount} form fields locked`);

                                // Redraw to reflect readOnly state visually
                                Core.annotationManager.drawAnnotationsFromList(
                                    Core.annotationManager.getAnnotationsList()
                                );

                            } catch (err) {
                                console.error('❌ Error locking form fields in read-only mode:', err);
                            }
                        }

                        // ========================================
                        // CLIENT SIGNING MODE: Lock filled and readOnly fields
                        // ========================================
                        // Clients can only edit:
                        // 1. Fields that are empty (not already filled)
                        // 2. Fields that are NOT marked as readOnly in the template
                        if (clientSigningMode) {
                            console.log('🔐 Client signing mode enabled - locking filled and readOnly fields...');

                            try {
                                const fieldManager = Core.annotationManager.getFieldManager();
                                const allFields = fieldManager.getFields();

                                // Build set of readOnly field names from template
                                const readOnlyFieldNames = new Set(
                                    (templateFormFields || [])
                                        .filter((f: any) => f.readOnly)
                                        .map((f: any) => f.name)
                                );

                                console.log('📋 Template readOnly fields:', Array.from(readOnlyFieldNames));

                                let lockedCount = 0;
                                let editableCount = 0;

                                for (const fieldName in allFields) {
                                    const field = allFields[fieldName];

                                    // Get field value (works for text, checkboxes, etc.)
                                    let value: string = '';
                                    try {
                                        const rawValue = field.getValue?.();
                                        if (rawValue !== null && rawValue !== undefined) {
                                            if (typeof rawValue === 'object') {
                                                value = JSON.stringify(rawValue);
                                            } else {
                                                value = String(rawValue);
                                            }
                                        }
                                    } catch (e) {
                                        // Some fields may not have getValue
                                    }

                                    // Check if field should be locked
                                    const hasValue = value && value.toString().trim() !== '';
                                    const isTemplateReadOnly = readOnlyFieldNames.has(fieldName);

                                    // Skip signature fields - they should remain editable for signing
                                    const isSignatureField = fieldName.toLowerCase().includes('signature') ||
                                        field.type === 'Sig';

                                    if (isSignatureField && !hasValue) {
                                        // Don't lock empty signature fields - client needs to sign!
                                        editableCount++;
                                        console.log(`✏️ Signature field editable: ${fieldName}`);
                                        continue;
                                    }

                                    if (hasValue || isTemplateReadOnly) {
                                        // Lock the field by setting ReadOnly flag
                                        if (field.flags?.set) {
                                            field.flags.set('ReadOnly', true);
                                        }

                                        // Also update widget annotations for this field
                                        const widgets = field.widgets || [];
                                        widgets.forEach((widget: any) => {
                                            if (widget.setReadOnly) widget.setReadOnly(true);
                                            // Disable any interaction - prevent clicking and typing
                                            widget.NoInteraction = true;
                                            widget.Locked = true;
                                        });

                                        lockedCount++;
                                        console.log(`🔒 Locked: ${fieldName} (hasValue: ${hasValue}, templateReadOnly: ${isTemplateReadOnly})`);
                                    } else {
                                        editableCount++;
                                        console.log(`✏️ Editable: ${fieldName}`);
                                    }

                                }

                                console.log(`✅ Client signing mode: ${lockedCount} fields locked, ${editableCount} fields editable`);

                                // Redraw to reflect readOnly state visually
                                Core.annotationManager.drawAnnotationsFromList(
                                    Core.annotationManager.getAnnotationsList()
                                );

                            } catch (err) {
                                console.error('❌ Error in client signing mode field locking:', err);
                            }
                        }


                        // ========================================
                        // CRITICAL: Signature Clone-and-Restore System
                        // ========================================
                        // PDFTron's signature modal creates a temp annotation, saves to library, then DELETES it.
                        // We MUST clone the signature immediately and restore it when PDFTron deletes the original.
                        // This runs for ALL cases (create and view).
                        const pendingSignatureClones = new Map<string, any>();

                        Core.annotationManager.addEventListener('annotationChanged',
                            (annotations: any[], action: string, info: any) => {
                                // Skip imported annotations (those loaded from XFDF)
                                if (info.imported) return;

                                annotations.forEach((annot: any) => {
                                    const type = annot.constructor.name;
                                    const content = annot.getContents?.() || annot.Subject || 'no content';
                                    const annotId = annot.Id;

                                    console.log(`🔔 Annotation ${action}: ${type} "${content}" (ID: ${annotId?.substring(0, 8)}...)`);

                                    // Check if this is a signature annotation
                                    // PDFTron may use minified class names, so check Subject as well
                                    const isSignature =
                                        annot.Subject === 'Signature' ||
                                        type === 'FreeHandAnnotation' ||
                                        type.toLowerCase().includes('freehand') ||
                                        type === 'InkAnnotation' ||
                                        annot.getCustomData?.('trn-signature-annotation') === 'true';

                                    if (action === 'add') {
                                        console.log(`   ✓ Added at page ${annot.PageNumber}`);

                                        // Configure for persistence
                                        annot.ReadOnly = false;
                                        annot.Locked = false;
                                        annot.NoDelete = false;
                                        console.log(`   ✓ Configured for persistence`);

                                        // If this is a signature, clone it immediately
                                        if (isSignature) {
                                            console.log(`   🖊️ SIGNATURE DETECTED - Cloning for preservation...`);

                                            try {
                                                // Get signature paths/data before PDFTron might delete it
                                                const paths = annot.getPaths?.() || [];
                                                const pageNumber = annot.PageNumber;
                                                const rect = annot.getRect?.() || { x1: annot.X, y1: annot.Y, x2: annot.X + annot.Width, y2: annot.Y + annot.Height };
                                                const strokeColor = annot.StrokeColor;
                                                const strokeThickness = annot.StrokeThickness || 2;

                                                if (paths.length > 0) {
                                                    // Store clone data for freehand signatures
                                                    pendingSignatureClones.set(annotId, {
                                                        paths: paths.map((path: any) => path.map ? path.map((point: any) => ({ x: point.x, y: point.y })) : []),
                                                        pageNumber,
                                                        rect: { x1: rect.x1, y1: rect.y1, x2: rect.x2, y2: rect.y2 },
                                                        strokeColor: strokeColor ? { R: strokeColor.R, G: strokeColor.G, B: strokeColor.B } : { R: 0, G: 0, B: 0 },
                                                        strokeThickness,
                                                        originalId: annotId,
                                                        type: type,
                                                    });

                                                    console.log(`   ✅ FreeHand signature cloned: ${paths.length} paths, page ${pageNumber}`);
                                                    console.log(`   📦 Stored for restoration if PDFTron deletes it`);
                                                } else {
                                                    // Typed/image signatures - PDFTron DELETES these before XFDF export can capture them!
                                                    // We MUST capture the image data NOW before PDFTron deletes the annotation
                                                    console.log(`   📸 Typed/image signature detected - capturing image data...`);

                                                    // Try to get the image data synchronously first from various sources
                                                    let imageDataUrl: string | null = null;

                                                    // Method 1: Try getImageData (may be async or sync depending on version)
                                                    const getImageDataResult = annot.getImageData?.();
                                                    if (getImageDataResult) {
                                                        if (typeof getImageDataResult === 'string') {
                                                            imageDataUrl = getImageDataResult;
                                                            console.log(`   ✅ Got image data (sync): ${imageDataUrl.substring(0, 50)}...`);
                                                        } else if (getImageDataResult instanceof Promise) {
                                                            // It's a promise - we need to capture it now but can't wait
                                                            // Store placeholder and update async
                                                            pendingSignatureClones.set(annotId, {
                                                                paths: [],
                                                                pageNumber,
                                                                rect: { x1: rect.x1, y1: rect.y1, x2: rect.x2, y2: rect.y2 },
                                                                strokeColor: { R: 0, G: 0, B: 0 },
                                                                strokeThickness,
                                                                originalId: annotId,
                                                                type: 'TypedSignature',
                                                                imageDataPending: true
                                                            });

                                                            // Capture async but don't await - update the clone when ready
                                                            getImageDataResult.then((data: string) => {
                                                                const existing = pendingSignatureClones.get(annotId);
                                                                if (existing) {
                                                                    existing.imageData = data;
                                                                    existing.imageDataPending = false;
                                                                    console.log(`   ✅ Async image data captured: ${data?.substring(0, 50)}...`);
                                                                }
                                                            }).catch((err: Error) => {
                                                                console.error(`   ❌ Failed to get async image data:`, err);
                                                            });

                                                            console.log(`   ⏳ Image data pending (async)...`);
                                                        }
                                                    }

                                                    // Method 2: If no async capture, try to render the annotation to canvas
                                                    if (!pendingSignatureClones.has(annotId)) {
                                                        // Store with what we have - the annotation drawing info
                                                        pendingSignatureClones.set(annotId, {
                                                            paths: [],
                                                            pageNumber,
                                                            rect: { x1: rect.x1, y1: rect.y1, x2: rect.x2, y2: rect.y2 },
                                                            strokeColor: { R: 0, G: 0, B: 0 },
                                                            strokeThickness,
                                                            originalId: annotId,
                                                            type: 'TypedSignature',
                                                            imageData: imageDataUrl || undefined
                                                        });

                                                        if (imageDataUrl) {
                                                            console.log(`   ✅ Typed signature cloned with image data`);
                                                        } else {
                                                            console.log(`   ⚠️ Typed signature cloned but no image data captured`);
                                                        }
                                                    }
                                                }

                                            } catch (err) {
                                                console.error(`   ❌ Failed to clone signature:`, err);
                                            }
                                        }
                                    }

                                    if (action === 'delete') {
                                        console.warn(`   ❌ DELETED - Type: ${type}, Content: "${content}"`);

                                        // Check if we have a clone to restore
                                        if (isSignature) {
                                            const clonedData = pendingSignatureClones.get(annotId);

                                            if (clonedData) {
                                                const hasPaths = clonedData.paths && clonedData.paths.length > 0;
                                                const hasImageData = clonedData.imageData && typeof clonedData.imageData === 'string';

                                                console.log(`   🔄 Restoring signature from clone...`);
                                                console.log(`   📊 Clone data: ${clonedData.paths?.length || 0} paths, hasImageData: ${hasImageData}`);

                                                try {
                                                    const { Annotations } = Core;
                                                    let restoredAnnot: any;

                                                    if (hasPaths) {
                                                        // FreeHand signature with paths - use FreeHandAnnotation
                                                        restoredAnnot = new Annotations.FreeHandAnnotation();
                                                        restoredAnnot.StrokeColor = new Annotations.Color(
                                                            clonedData.strokeColor.R,
                                                            clonedData.strokeColor.G,
                                                            clonedData.strokeColor.B
                                                        );
                                                        restoredAnnot.StrokeThickness = clonedData.strokeThickness;

                                                        // Set the paths using PDFTron's FreeHand API
                                                        const freeHandAnnot = restoredAnnot as any;
                                                        const allPaths = clonedData.paths.map((pathPoints: any[]) =>
                                                            pathPoints.map((pt: any) => new Core.Math.Point(pt.x, pt.y))
                                                        );

                                                        if (typeof freeHandAnnot.setPaths === 'function') {
                                                            freeHandAnnot.setPaths(allPaths);
                                                        } else if (typeof freeHandAnnot.setPath === 'function') {
                                                            freeHandAnnot.setPath(allPaths[0]);
                                                            for (let i = 1; i < allPaths.length; i++) {
                                                                if (typeof freeHandAnnot.addPathToEnd === 'function') {
                                                                    freeHandAnnot.addPathToEnd(allPaths[i]);
                                                                }
                                                            }
                                                        }
                                                        console.log(`   📍 Restored as FreeHandAnnotation with ${allPaths.length} paths`);
                                                    } else if (hasImageData) {
                                                        // Typed/image signature - use StampAnnotation with image
                                                        restoredAnnot = new Annotations.StampAnnotation();
                                                        restoredAnnot.ImageData = clonedData.imageData;

                                                        // Set the image using setImageData if available
                                                        if (typeof restoredAnnot.setImageData === 'function') {
                                                            restoredAnnot.setImageData(clonedData.imageData);
                                                        }
                                                        console.log(`   📍 Restored as StampAnnotation with image data`);
                                                    } else {
                                                        // No paths and no image data - can't restore
                                                        console.warn(`   ⚠️ Cannot restore signature: no paths or image data`);
                                                        pendingSignatureClones.delete(annotId);
                                                        return;
                                                    }

                                                    // Common properties for both types
                                                    restoredAnnot.PageNumber = clonedData.pageNumber;
                                                    restoredAnnot.Subject = 'Signature';
                                                    restoredAnnot.Author = Core.annotationManager.getCurrentUser();

                                                    // Set the rectangle
                                                    restoredAnnot.X = clonedData.rect.x1;
                                                    restoredAnnot.Y = clonedData.rect.y1;
                                                    restoredAnnot.Width = clonedData.rect.x2 - clonedData.rect.x1;
                                                    restoredAnnot.Height = clonedData.rect.y2 - clonedData.rect.y1;

                                                    // Mark as persistent and EXPORTABLE
                                                    restoredAnnot.setCustomData('persistentSignature', 'true');
                                                    restoredAnnot.setCustomData('restoredFrom', clonedData.originalId);

                                                    // CRITICAL: Ensure the annotation is exportable
                                                    restoredAnnot.Listable = true;
                                                    restoredAnnot.NoExport = false;
                                                    restoredAnnot.Hidden = false;
                                                    restoredAnnot.Invisible = false;

                                                    // Add to document
                                                    Core.annotationManager.addAnnotation(restoredAnnot);
                                                    Core.annotationManager.redrawAnnotation(restoredAnnot);

                                                    console.log(`   ✅ Signature RESTORED with new ID: ${restoredAnnot.Id}`);
                                                    console.log(`   📍 Position: (${clonedData.rect.x1.toFixed(0)}, ${clonedData.rect.y1.toFixed(0)})`);

                                                    // CRITICAL: Save to persistentSignaturesRef for export recovery
                                                    persistentSignaturesRef.current.push({
                                                        id: restoredAnnot.Id,
                                                        pageNumber: clonedData.pageNumber,
                                                        paths: clonedData.paths || [],
                                                        rect: clonedData.rect,
                                                        strokeColor: clonedData.strokeColor,
                                                        strokeThickness: clonedData.strokeThickness,
                                                        imageData: clonedData.imageData
                                                    });
                                                    console.log(`   💾 Saved to persistentSignaturesRef (total: ${persistentSignaturesRef.current.length})`);

                                                } catch (err) {
                                                    console.error(`   ❌ Failed to restore signature:`, err);
                                                }

                                                // Clean up
                                                pendingSignatureClones.delete(annotId);
                                            } else {
                                                // No clone found
                                                console.log(`   ℹ️ No clone found for this signature`);
                                            }
                                        }
                                    }
                                });
                            }
                        );
                        console.log('✅ Signature clone-and-restore system enabled');


                        // Create form fields from metadata (if formFields provided)
                        if (formFields && formFields.length > 0 && !xfdfString) {
                            console.log('📋 Creating form fields from metadata:', formFields.length);

                            const { Annotations } = Core;
                            const annotationManager = Core.annotationManager;
                            const fieldManager = annotationManager.getFieldManager();

                            const errors: Array<{ name: string; error: any }> = [];
                            let successCount = 0;

                            for (const fieldDef of formFields) {
                                try {
                                    console.log(`  ✏️ Creating field: ${fieldDef.name} (${fieldDef.type})`);

                                    // Create WidgetFlags based on field definition
                                    const { WidgetFlags } = Annotations;
                                    const flags = new WidgetFlags();

                                    // Set common flags
                                    if (fieldDef.required) {
                                        flags.set(WidgetFlags.REQUIRED, true);
                                        console.log(`    ✓ Set REQUIRED flag`);
                                    }
                                    if (fieldDef.readOnly) {
                                        flags.set(WidgetFlags.READ_ONLY, true);
                                        console.log(`    ✓ Set READ_ONLY flag`);
                                    }

                                    // Set text-specific flags
                                    if (fieldDef.type === 'text') {
                                        if (fieldDef.multiline) {
                                            flags.set(WidgetFlags.MULTILINE, true);
                                            console.log(`    ✓ Set MULTILINE flag`);
                                        }
                                        if (fieldDef.doNotScroll) {
                                            flags.set(WidgetFlags.DO_NOT_SCROLL, true);
                                        }
                                        if (fieldDef.doNotSpellCheck) {
                                            flags.set(WidgetFlags.DO_NOT_SPELL_CHECK, true);
                                        }
                                    }

                                    // Create form field based on type
                                    let field;

                                    if (fieldDef.type === 'text') {
                                        field = new Annotations.Forms.Field(fieldDef.name, {
                                            type: 'Tx',
                                            value: fieldDef.defaultValue || '',  // ← Phase 2: Default value
                                            flags
                                        });
                                        if (fieldDef.defaultValue) {
                                            console.log(`    ✓ Set default value: "${fieldDef.defaultValue}"`);
                                        }
                                    } else if (fieldDef.type === 'signature') {
                                        field = new Annotations.Forms.Field(fieldDef.name, {
                                            type: 'Sig',
                                            value: '',
                                            flags
                                        });
                                    } else if (fieldDef.type === 'checkbox') {
                                        field = new Annotations.Forms.Field(fieldDef.name, {
                                            type: 'Btn',
                                            value: fieldDef.defaultValue === 'true' ? 'Yes' : 'Off',  // ← Phase 2: Default checked state
                                            flags
                                        });
                                    } else {
                                        // Default to text field
                                        field = new Annotations.Forms.Field(fieldDef.name, {
                                            type: 'Tx',
                                            value: fieldDef.defaultValue || '',  // ← Phase 2: Default value
                                            flags
                                        });
                                    }

                                    // Create widget annotation at the specified position
                                    let widget: any;

                                    if (fieldDef.type === 'signature') {
                                        // Phase 2: Add signature placeholder appearance if provided
                                        if (fieldDef.appearance) {
                                            widget = new Annotations.SignatureWidgetAnnotation(field, {
                                                appearance: fieldDef.appearance
                                            });
                                            console.log(`    🖊️ Creating SignatureWidgetAnnotation with placeholder`);
                                        } else {
                                            widget = new Annotations.SignatureWidgetAnnotation(field);
                                            console.log(`    🖊️ Creating SignatureWidgetAnnotation`);
                                        }


                                        // Debug: Log when signature widget is clicked
                                        // PDFTron's native flow handles signature modal and persistence
                                        widget.addEventListener('mousedown', () => {
                                            console.log(`📝 [Signature Debug] Widget clicked: ${fieldDef.name}`);
                                            console.log(`   - Native signature modal will handle this`);
                                        });
                                    } else if (fieldDef.type === 'checkbox') {

                                        widget = new Annotations.CheckButtonWidgetAnnotation(field);
                                        console.log(`    ☑️ Creating CheckButtonWidgetAnnotation`);
                                    } else {
                                        widget = new Annotations.TextWidgetAnnotation(field);
                                        console.log(`    📝 Creating TextWidgetAnnotation`);

                                        // Phase 2: Set placeholder text if provided
                                        if (fieldDef.placeholder) {
                                            widget.setCustomData('placeholder', fieldDef.placeholder);
                                            console.log(`    ✓ Set placeholder: "${fieldDef.placeholder}"`);
                                        }
                                    }

                                    // Set position and size from stored coordinates
                                    widget.PageNumber = fieldDef.pageNumber;
                                    widget.X = fieldDef.x;
                                    widget.Y = fieldDef.y;
                                    widget.Width = fieldDef.width;
                                    widget.Height = fieldDef.height;

                                    // Style the widget with blue border like Apryse demo
                                    (widget as any).StrokeColor = new Annotations.Color(0, 118, 220);
                                    (widget as any).StrokeThickness = 2;

                                    // CRITICAL: Add to BOTH managers (Field + Widget pattern)
                                    // 1. Add field to FieldManager
                                    fieldManager.addField(field);

                                    // 2. Add widget to AnnotationManager
                                    annotationManager.addAnnotation(widget);

                                    // 3. Draw to make visible
                                    annotationManager.drawAnnotationsFromList([widget]);

                                    console.log(`    ✅ Created: ${fieldDef.name} (${fieldDef.type})`);
                                    successCount++;

                                } catch (err) {
                                    console.error(`❌ Failed to create field "${fieldDef.name}":`, err);
                                    errors.push({ name: fieldDef.name, error: err });
                                    // Continue with next field
                                }
                            }

                            // Summary logging
                            console.log(`\n📊 Field Creation Summary:`);
                            console.log(`  ✅ Successfully created: ${successCount}/${formFields.length}`);
                            if (errors.length > 0) {
                                console.warn(`  ❌ Failed to create: ${errors.length} fields`);
                                console.warn(`  Failed fields:`, errors.map(e => e.name));
                            } else {
                                console.log(`  🎉 All form fields created successfully!`);
                            }

                            // Phase 2 Task 2.3: Listen for field value changes
                            // CRITICAL FIX: Use annotationManager.addEventListener per Apryse docs
                            if (onFieldChange) {
                                // Listen for text field changes
                                Core.annotationManager.addEventListener('fieldChanged', (field: any, value: any) => {
                                    console.log('📝 Field changed event fired:', field.name, '→', value);
                                    onFieldChange(field.name, value);
                                });
                                console.log('📡 Field change listener enabled on annotationManager');

                                // Listen for signature and annotation changes
                                // Signatures are added as annotations, not field value changes
                                Core.annotationManager.addEventListener('annotationChanged', (annotations: any[], action: string) => {
                                    if (action === 'add' || action === 'modify') {
                                        annotations.forEach((annot: any) => {
                                            // Check if this is a signature widget
                                            if (annot.Subject === 'Signature' || annot.constructor.name === 'SignatureWidgetAnnotation') {
                                                const field = annot.getField?.();
                                                if (field) {
                                                    console.log('✍️ Signature added to field:', field.name);
                                                    // Mark signature field as filled with a placeholder value
                                                    // The actual signature annotation data is in XFDF
                                                    onFieldChange(field.name, 'SIGNED');
                                                }
                                            }
                                        });
                                    }
                                });
                                console.log('📡 Annotation change listener enabled for signatures');
                            }
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
