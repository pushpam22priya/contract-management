/**
 * PDF Form Field Helper Utilities
 * Centralized logic for field type detection and mapping
 */

import { FormFieldDefinition } from '@/types/template';

/**
 * Detect field type from PDFTron widget annotation and field object
 */
export function detectFieldType(
    widget: any,
    field?: any
): 'text' | 'signature' | 'checkbox' | 'radio' | 'dropdown' | 'date' {
    // Check field.type property (PDFTron standard)
    if (field?.type) {
        switch (field.type) {
            case 'Sig':
                return 'signature';
            case 'Btn':
                return 'checkbox';  // Could be radio too, but default to checkbox
            case 'Tx':
                return 'text';
            case 'Ch':
                return 'dropdown';
        }
    }

    // Check widget constructor name
    const widgetClassName = widget?.constructor?.name || '';

    if (widgetClassName.includes('Signature')) {
        return 'signature';
    }
    if (widgetClassName.includes('CheckButton')) {
        return 'checkbox';
    }
    if (widgetClassName.includes('RadioButton')) {
        return 'radio';
    }
    if (widgetClassName.includes('Choice') || widgetClassName.includes('ListBox')) {
        return 'dropdown';
    }

    // Check field name for hints
    const fieldName = (field?.name || widget?.fieldName || '').toLowerCase();
    if (fieldName.includes('signature') || fieldName.includes('sign')) {
        return 'signature';
    }
    if (fieldName.includes('date')) {
        return 'date';
    }
    if (fieldName.includes('check')) {
        return 'checkbox';
    }

    // Default to text field
    return 'text';
}

/**
 * Validate field name is valid and not empty
 */
export function validateFieldName(name?: string): boolean {
    if (!name || typeof name !== 'string') {
        return false;
    }

    const trimmed = name.trim();
    if (trimmed.length === 0) {
        return false;
    }

    // Reject auto-generated random names
    if (trimmed.startsWith('field_') && /^\d+$/.test(trimmed.substring(6))) {
        return false;
    }

    return true;
}

/**
 * Get field name from widget/field, returns null if invalid
 */
export function getFieldName(widget: any, field?: any): string | null {
    const name = field?.name || widget?.fieldName;

    if (validateFieldName(name)) {
        return name;
    }

    return null;
}

/**
 * Map PDFTron field type string to application field type
 */
export function mapPdfFieldType(pdfType: string): 'text' | 'signature' | 'checkbox' | 'radio' | 'dropdown' | 'date' {
    switch (pdfType) {
        case 'Sig':
            return 'signature';
        case 'Btn':
            return 'checkbox';
        case 'Tx':
            return 'text';
        case 'Ch':
            return 'dropdown';
        default:
            return 'text';
    }
}

/**
 * Check if annotation is a widget/form field
 */
export function isWidgetAnnotation(annot: any, Core: any): boolean {
    if (!annot || !Core) {
        return false;
    }

    // Method 1: instanceof check
    if (annot instanceof Core.Annotations.WidgetAnnotation) {
        return true;
    }

    // Method 2: Check constructor name
    const className = annot.constructor?.name || '';
    if (className.includes('Widget') ||
        className.includes('FormField') ||
        className === 'TextWidgetAnnotation' ||
        className === 'SignatureWidgetAnnotation' ||
        className === 'CheckButtonWidgetAnnotation') {
        return true;
    }

    // Method 3: Check if it has getField method
    if (typeof annot.getField === 'function') {
        return true;
    }

    // Method 4: Check Subject property
    if (annot.Subject === 'Widget' || annot.Subject === 'FormField') {
        return true;
    }

    return false;
}

/**
 * Extract widget flags from field into our FormFieldDefinition format
 */
export function extractWidgetFlags(field: any): {
    required: boolean;
    readOnly: boolean;
    multiline: boolean;
    doNotScroll: boolean;
    doNotSpellCheck: boolean;
} {
    const fieldFlags = field?.flags;

    // Helper to read flag with multiple fallback methods
    const getFlag = (flagName: string): boolean => {
        if (!fieldFlags) return false;

        // Method 1: Try get() method
        if (typeof fieldFlags.get === 'function') {
            // Try exact case
            const value = fieldFlags.get(flagName);
            if (value !== undefined && value !== null) return Boolean(value);

            // Try all caps (e.g., REQUIRED)
            const upperValue = fieldFlags.get(flagName.toUpperCase());
            if (upperValue !== undefined && upperValue !== null) return Boolean(upperValue);

            // Try lowercase (e.g., required)
            const lowerValue = fieldFlags.get(flagName.toLowerCase());
            if (lowerValue !== undefined && lowerValue !== null) return Boolean(lowerValue);
        }

        // Method 2: Try direct property access
        if (fieldFlags[flagName] !== undefined) return Boolean(fieldFlags[flagName]);
        if (fieldFlags[flagName.toUpperCase()] !== undefined) return Boolean(fieldFlags[flagName.toUpperCase()]);
        if (fieldFlags[flagName.toLowerCase()] !== undefined) return Boolean(fieldFlags[flagName.toLowerCase()]);

        return false;
    };

    return {
        required: getFlag('Required'),
        readOnly: getFlag('ReadOnly'),
        multiline: getFlag('Multiline'),
        doNotScroll: getFlag('DoNotScroll'),
        doNotSpellCheck: getFlag('DoNotSpellCheck'),
    };
}
