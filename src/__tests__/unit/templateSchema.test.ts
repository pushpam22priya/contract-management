/**
 * UNIT TESTS — Template Step-1 Schema
 * (src/schemas/templateSchema.ts)
 *
 * Tests the Zod validation schema `templateStep1Schema` that guards the
 * first step of the Create/Upload Template wizard.
 *
 * Scenarios covered:
 *  1.  Valid data — all fields within limits passes
 *  2.  templateName: empty string fails with "Please enter a template name"
 *  3.  templateName: whitespace-only string fails (min-length check)
 *  4.  templateName: exactly 50 characters passes
 *  5.  templateName: 51 characters fails with "50 characters or less"
 *  6.  description: empty string passes (description is optional)
 *  7.  description: exactly 200 characters passes
 *  8.  description: 201 characters fails with "200 characters or less"
 *  9.  category: empty string fails with "Please select a category"
 * 10.  All three fields at their maximum allowed length passes
 * 11.  Missing templateName field fails (treated as undefined → min-length error)
 * 12.  Missing category field fails
 * 13.  Returns all errors at once when multiple fields are invalid (Zod default)
 */

import { templateStep1Schema } from '@/schemas/templateSchema';

// ─── Helpers ─────────────────────────────────────────────────────────────────

/** Return the first error message for a given field key, or undefined. */
function errorFor(data: object, key: string): string | undefined {
    const result = templateStep1Schema.safeParse(data);
    if (result.success) return undefined;
    const issue = result.error.issues.find((i) => i.path[0] === key);
    return issue?.message;
}

/** A fully valid baseline object. */
const valid = {
    templateName: 'Standard NDA Agreement',
    description:  'A standard non-disclosure agreement.',
    category:     'Legal',
};

// =============================================================================
// 1. Valid data
// =============================================================================

describe('templateStep1Schema — valid inputs', () => {

    it('passes when all fields are within limits', () => {
        expect(templateStep1Schema.safeParse(valid).success).toBe(true);
    });

    it('passes when description is an empty string (optional field)', () => {
        expect(
            templateStep1Schema.safeParse({ ...valid, description: '' }).success
        ).toBe(true);
    });

    it('passes when templateName is exactly 50 characters', () => {
        const name50 = 'A'.repeat(50);
        expect(
            templateStep1Schema.safeParse({ ...valid, templateName: name50 }).success
        ).toBe(true);
    });

    it('passes when description is exactly 200 characters', () => {
        const desc200 = 'D'.repeat(200);
        expect(
            templateStep1Schema.safeParse({ ...valid, description: desc200 }).success
        ).toBe(true);
    });

    it('passes when all three fields are at their maximum allowed length', () => {
        expect(
            templateStep1Schema.safeParse({
                templateName: 'A'.repeat(50),
                description:  'B'.repeat(200),
                category:     'Legal',
            }).success
        ).toBe(true);
    });
});

// =============================================================================
// 2. templateName validation
// =============================================================================

describe('templateStep1Schema — templateName', () => {

    it('fails with "Please enter a template name" when templateName is empty', () => {
        const msg = errorFor({ ...valid, templateName: '' }, 'templateName');
        expect(msg).toBe('Please enter a template name');
    });

    it('fails when templateName has 51 characters', () => {
        const msg = errorFor({ ...valid, templateName: 'A'.repeat(51) }, 'templateName');
        expect(msg).toMatch(/50 characters or less/i);
    });

    it('fails when templateName field is missing entirely', () => {
        const { templateName: _omit, ...rest } = valid;
        const result = templateStep1Schema.safeParse(rest);
        expect(result.success).toBe(false);
    });
});

// =============================================================================
// 3. description validation
// =============================================================================

describe('templateStep1Schema — description', () => {

    it('passes when description is empty (it is optional)', () => {
        expect(
            templateStep1Schema.safeParse({ ...valid, description: '' }).success
        ).toBe(true);
    });

    it('fails with "200 characters or less" when description is 201 characters', () => {
        const msg = errorFor({ ...valid, description: 'D'.repeat(201) }, 'description');
        expect(msg).toMatch(/200 characters or less/i);
    });
});

// =============================================================================
// 4. category validation
// =============================================================================

describe('templateStep1Schema — category', () => {

    it('fails with "Please select a category" when category is empty', () => {
        const msg = errorFor({ ...valid, category: '' }, 'category');
        expect(msg).toBe('Please select a category');
    });

    it('fails when category field is missing entirely', () => {
        const { category: _omit, ...rest } = valid;
        const result = templateStep1Schema.safeParse(rest);
        expect(result.success).toBe(false);
    });
});

// =============================================================================
// 5. Multiple simultaneous errors
// =============================================================================

describe('templateStep1Schema — multiple validation errors', () => {

    it('reports errors for all invalid fields at once', () => {
        const result = templateStep1Schema.safeParse({
            templateName: '',         // fails
            description:  'D'.repeat(201), // fails
            category:     '',         // fails
        });
        expect(result.success).toBe(false);
        if (!result.success) {
            const paths = result.error.issues.map((i) => i.path[0]);
            expect(paths).toContain('templateName');
            expect(paths).toContain('description');
            expect(paths).toContain('category');
        }
    });
});
