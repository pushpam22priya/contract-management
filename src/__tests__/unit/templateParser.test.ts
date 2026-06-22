/**
 * UNIT TESTS — Template Parser Utilities
 * (src/utils/templateParser.ts)
 *
 * All functions are pure — no mocks required.
 *
 * Scenarios covered:
 *
 * extractTemplateFields()
 *  1.  Returns an empty array for empty content
 *  2.  Returns an empty array when content has no placeholders
 *  3.  Extracts a single placeholder
 *  4.  Extracts multiple unique placeholders
 *  5.  Deduplicates repeated placeholders (same field used twice)
 *  6.  Ignores tags that start with a digit (invalid field names)
 *  7.  Detects type=date when field name contains "date"
 *  8.  Detects type=email when field name contains "email"
 *  9.  Detects type=number when field name contains "amount"
 * 10.  Detects type=number when field name contains "salary"
 * 11.  Detects type=number when field name contains "value"
 * 12.  Defaults to type=text for unrecognized field names
 * 13.  Converts snake_case to Title Case label
 * 14.  Generates correct placeholder for date fields
 * 15.  Generates correct placeholder for email fields
 * 16.  Generates correct placeholder for name fields
 * 17.  Generates correct placeholder for address fields
 * 18.  Generates a generic "Enter …" placeholder for unknown fields
 * 19.  All extracted fields have required=true
 *
 * populateTemplate()
 * 20.  Returns the original content unchanged when fieldValues is empty
 * 21.  Replaces a single placeholder with its value
 * 22.  Replaces multiple distinct placeholders
 * 23.  Replaces all occurrences of the same placeholder
 * 24.  Leaves un-supplied placeholders unchanged (keeps the <tag>)
 * 25.  Handles empty-string values — replaces the tag with the original tag text
 * 26.  Returns empty string for empty content
 */

import {
    extractTemplateFields,
    populateTemplate,
} from '@/utils/templateParser';

// =============================================================================
// extractTemplateFields()
// =============================================================================

describe('extractTemplateFields()', () => {

    // ── 1. Empty content ────────────────────────────────────────────────────

    it('returns an empty array for an empty string', () => {
        expect(extractTemplateFields('')).toEqual([]);
    });

    // ── 2. No placeholders ──────────────────────────────────────────────────

    it('returns an empty array when the content has no <placeholder> tags', () => {
        expect(extractTemplateFields('This is plain text with no fields.')).toEqual([]);
    });

    // ── 3. Single placeholder ───────────────────────────────────────────────

    it('extracts a single placeholder field', () => {
        const fields = extractTemplateFields('Client: <client_name>');
        expect(fields).toHaveLength(1);
        expect(fields[0].name).toBe('client_name');
    });

    // ── 4. Multiple distinct placeholders ──────────────────────────────────

    it('extracts all unique placeholders from content', () => {
        const content = 'Name: <first_name> <last_name>. Date: <start_date>.';
        const fields = extractTemplateFields(content);
        const names = fields.map((f) => f.name);
        expect(names).toContain('first_name');
        expect(names).toContain('last_name');
        expect(names).toContain('start_date');
        expect(fields).toHaveLength(3);
    });

    // ── 5. Deduplication ───────────────────────────────────────────────────

    it('returns each field only once even if the placeholder appears multiple times', () => {
        const content = '<client_name> agrees. The agreement is between <client_name> and the vendor.';
        const fields = extractTemplateFields(content);
        const clientNameFields = fields.filter((f) => f.name === 'client_name');
        expect(clientNameFields).toHaveLength(1);
    });

    // ── 6. Invalid tag (starts with digit) ─────────────────────────────────

    it('ignores placeholder-like tags that start with a digit', () => {
        // The regex requires [a-zA-Z_] as the first character
        const fields = extractTemplateFields('<1field> is not valid');
        expect(fields).toHaveLength(0);
    });

    // ── 7–12. Type detection ────────────────────────────────────────────────

    it('detects type=date for field names containing "date"', () => {
        const [field] = extractTemplateFields('<start_date>');
        expect(field.type).toBe('date');
    });

    it('detects type=email for field names containing "email"', () => {
        const [field] = extractTemplateFields('<signer_email>');
        expect(field.type).toBe('email');
    });

    it('detects type=number for field names containing "amount"', () => {
        const [field] = extractTemplateFields('<contract_amount>');
        expect(field.type).toBe('number');
    });

    it('detects type=number for field names containing "salary"', () => {
        const [field] = extractTemplateFields('<base_salary>');
        expect(field.type).toBe('number');
    });

    it('detects type=number for field names containing "value"', () => {
        const [field] = extractTemplateFields('<total_value>');
        expect(field.type).toBe('number');
    });

    it('defaults to type=text for unrecognized field names', () => {
        const [field] = extractTemplateFields('<client_reference>');
        expect(field.type).toBe('text');
    });

    // ── 13. Label formatting ────────────────────────────────────────────────

    it('converts a snake_case field name to a Title Case label', () => {
        const [field] = extractTemplateFields('<company_registration_number>');
        expect(field.label).toBe('Company Registration Number');
    });

    it('produces a single-word label for a single-word field name', () => {
        const [field] = extractTemplateFields('<city>');
        expect(field.label).toBe('City');
    });

    // ── 14–18. Placeholder text ─────────────────────────────────────────────

    it('generates "Select date" placeholder for date fields', () => {
        const [field] = extractTemplateFields('<end_date>');
        expect(field.placeholder).toBe('Select date');
    });

    it('generates "e.g., user@example.com" placeholder for email fields', () => {
        const [field] = extractTemplateFields('<client_email>');
        expect(field.placeholder).toBe('e.g., user@example.com');
    });

    it('generates "Enter {label}" placeholder for name fields', () => {
        const [field] = extractTemplateFields('<buyer_name>');
        expect(field.placeholder).toMatch(/^enter/i);
    });

    it('generates "Enter full address" placeholder for address fields', () => {
        const [field] = extractTemplateFields('<office_address>');
        expect(field.placeholder).toBe('Enter full address');
    });

    it('generates a generic "Enter {label}" placeholder for unrecognized fields', () => {
        const [field] = extractTemplateFields('<project_code>');
        expect(field.placeholder).toMatch(/^Enter project code$/i);
    });

    // ── 19. required flag ───────────────────────────────────────────────────

    it('marks every extracted field as required=true', () => {
        const fields = extractTemplateFields('<field_a> and <field_b> and <field_c>');
        expect(fields.every((f) => f.required === true)).toBe(true);
    });
});

// =============================================================================
// populateTemplate()
// =============================================================================

describe('populateTemplate()', () => {

    // ── 20. Empty fieldValues ───────────────────────────────────────────────

    it('returns the content unchanged when fieldValues is an empty object', () => {
        const content = 'Hello <first_name>, your date is <start_date>.';
        expect(populateTemplate(content, {})).toBe(content);
    });

    // ── 21. Single replacement ──────────────────────────────────────────────

    it('replaces a single placeholder with its value', () => {
        const result = populateTemplate('Client: <client_name>', { client_name: 'Acme Corp' });
        expect(result).toBe('Client: Acme Corp');
    });

    // ── 22. Multiple distinct replacements ─────────────────────────────────

    it('replaces multiple distinct placeholders', () => {
        const result = populateTemplate(
            '<first_name> <last_name> signed on <sign_date>',
            { first_name: 'Jane', last_name: 'Doe', sign_date: '2026-01-15' }
        );
        expect(result).toBe('Jane Doe signed on 2026-01-15');
    });

    // ── 23. All occurrences replaced ────────────────────────────────────────

    it('replaces every occurrence of a repeated placeholder', () => {
        const result = populateTemplate(
            '<company> agrees that <company> will deliver.',
            { company: 'BuildCo' }
        );
        expect(result).toBe('BuildCo agrees that BuildCo will deliver.');
    });

    // ── 24. Un-supplied placeholders kept ──────────────────────────────────

    it('leaves placeholders unchanged when no matching value is supplied', () => {
        const result = populateTemplate(
            'Hello <first_name>, your email is <email>.',
            { first_name: 'Alice' }
        );
        // <email> has no value — it should remain as-is
        expect(result).toBe('Hello Alice, your email is <email>.');
    });

    // ── 25. Empty-string value ──────────────────────────────────────────────

    it('replaces the placeholder with the original tag text when the value is an empty string', () => {
        // The implementation does: `value || `<${fieldName}>`  — empty string → keeps tag
        const result = populateTemplate('<client_name>', { client_name: '' });
        // Empty string is falsy → falls back to original tag
        expect(result).toBe('<client_name>');
    });

    // ── 26. Empty content ───────────────────────────────────────────────────

    it('returns an empty string unchanged', () => {
        expect(populateTemplate('', { field: 'value' })).toBe('');
    });
});
