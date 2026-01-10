export interface TemplateField {
    name: string;           // e.g., "start_date"
    label: string;          // e.g., "Start Date"
    type: 'text' | 'date' | 'number' | 'email';
    placeholder: string;    // e.g., "Enter start date"
    required: boolean;
}

/**
 * Extract all <placeholder> fields from template content
 */
export function extractTemplateFields(content: string): TemplateField[] {
    if (!content) return [];
    
    // Regex to match <field_name>
    const regex = /<([a-zA-Z_][a-zA-Z0-9_]*)>/g;
    const matches = content.matchAll(regex);
    const uniqueFields = new Set<string>();
    
    // Get unique field names
    for (const match of matches) {
        uniqueFields.add(match[1]);
    }
    
    // Convert to TemplateField objects
    return Array.from(uniqueFields).map(fieldName => ({
        name: fieldName,
        label: formatFieldLabel(fieldName),
        type: detectFieldType(fieldName),
        placeholder: getPlaceholder(fieldName),
        required: true,
    }));
}

/**
 * Convert field_name to Field Name
 */
function formatFieldLabel(fieldName: string): string {
    return fieldName
        .split('_')
        .map(word => word.charAt(0).toUpperCase() + word.slice(1))
        .join(' ');
}

/**
 * Detect field type based on field name
 */
function detectFieldType(fieldName: string): 'text' | 'date' | 'number' | 'email' {
    const lowerName = fieldName.toLowerCase();
    
    if (lowerName.includes('date')) return 'date';
    if (lowerName.includes('email')) return 'email';
    if (lowerName.includes('amount') || lowerName.includes('salary') || lowerName.includes('value')) {
        return 'number';
    }
    
    return 'text';
}

/**
 * Generate placeholder text for field
 */
function getPlaceholder(fieldName: string): string {
    const label = formatFieldLabel(fieldName);
    const lowerName = fieldName.toLowerCase();
    
    if (lowerName.includes('date')) return 'Select date';
    if (lowerName.includes('email')) return 'e.g., user@example.com';
    if (lowerName.includes('name')) return `Enter ${label.toLowerCase()}`;
    if (lowerName.includes('address')) return 'Enter full address';
    
    return `Enter ${label.toLowerCase()}`;
}

/**
 * Replace placeholders in template with actual values
 */
export function populateTemplate(
    content: string,
    fieldValues: Record<string, string>
): string {
    let populatedContent = content;
    
    // Replace each <field_name> with its value
    Object.entries(fieldValues).forEach(([fieldName, value]) => {
        const regex = new RegExp(`<${fieldName}>`, 'g');
        populatedContent = populatedContent.replace(regex, value || `<${fieldName}>`);
    });
    
    return populatedContent;
}