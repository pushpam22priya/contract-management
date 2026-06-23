/**
 * UNIT TESTS — CategoryService
 * (src/services/categoryService.ts)
 *
 * httpClient is mocked at the module boundary so every test is a pure
 * function call with no network I/O.
 *
 * Scenarios covered:
 *
 * getAllCategories()
 *  1.  Returns the category list when response is ok and data is an array
 *  2.  Returns an empty array when response is not ok
 *  3.  Returns an empty array when response.data is not an array (type guard)
 *  4.  Returns an empty array on network failure (status 0)
 *
 * createCategory(data, userEmail)
 *  5.  Returns failure immediately when name is an empty string (no API call)
 *  6.  Returns failure immediately when name is whitespace-only (no API call)
 *  7.  Calls POST /categories with the trimmed name
 *  8.  Returns success response with the created category on 200
 *  9.  Returns "Category already exists" on 401 (backend duplicate quirk)
 * 10.  Returns backend message on other failures
 * 11.  Falls back to "Failed to create category" when response.message is empty
 *
 * deleteCategory(id)
 * 12.  Calls DELETE /categories/{id}
 * 13.  Returns success on 200 / 204
 * 14.  Returns "Category not found" on 401 (backend not-found quirk)
 * 15.  Returns backend message on other failures
 * 16.  Falls back to "Failed to delete category" when response.message is empty
 *
 * getCategoryById(id, categories)
 * 17.  Returns the matching category
 * 18.  Returns undefined when the id is not found
 *
 * getCategoryByName(name, categories)
 * 19.  Returns the matching category (exact case)
 * 20.  Returns the matching category case-insensitively
 * 21.  Returns undefined when the name is not found
 */

// ─── httpClient mock ──────────────────────────────────────────────────────────

const mockGet    = jest.fn();
const mockPost   = jest.fn();
const mockDelete = jest.fn();

jest.mock('@/lib/httpClient', () => ({
    httpClient: {
        get:    (...args: any[]) => mockGet(...args),
        post:   (...args: any[]) => mockPost(...args),
        delete: (...args: any[]) => mockDelete(...args),
    },
}));

import { categoryService } from '@/services/categoryService';
import type { Category } from '@/types/template';

// ─── Fixtures ─────────────────────────────────────────────────────────────────

const CATEGORY_LIST: Category[] = [
    { id: 'cat_1', name: 'Legal',   createdAt: '2026-01-01T00:00:00Z', createdBy: 'admin@example.com' },
    { id: 'cat_2', name: 'Finance', createdAt: '2026-01-02T00:00:00Z', createdBy: 'admin@example.com' },
    { id: 'cat_3', name: 'HR',      createdAt: '2026-01-03T00:00:00Z', createdBy: 'admin@example.com' },
];

const ok   = (data: any, message = 'Success')           => ({ ok: true,  data, status: 200, message });
const fail = (status: number, message = 'Server error') => ({ ok: false, data: null, status, message });

// ─────────────────────────────────────────────────────────────────────────────

beforeEach(() => jest.clearAllMocks());

// =============================================================================
// getAllCategories()
// =============================================================================

describe('categoryService.getAllCategories()', () => {

    it('returns the category list when response is ok and data is an array', async () => {
        mockGet.mockResolvedValueOnce(ok(CATEGORY_LIST));

        const result = await categoryService.getAllCategories();

        expect(result).toEqual(CATEGORY_LIST);
        expect(mockGet).toHaveBeenCalledWith('/categories');
    });

    it('returns an empty array when the response is not ok', async () => {
        mockGet.mockResolvedValueOnce(fail(500, 'Internal server error'));

        const result = await categoryService.getAllCategories();

        expect(result).toEqual([]);
    });

    it('returns an empty array when response.data is not an array', async () => {
        mockGet.mockResolvedValueOnce(ok({ categories: CATEGORY_LIST }));

        const result = await categoryService.getAllCategories();

        expect(result).toEqual([]);
    });

    it('returns an empty array on network failure (status 0)', async () => {
        mockGet.mockResolvedValueOnce(fail(0, 'Network error. Please check your connection.'));

        const result = await categoryService.getAllCategories();

        expect(result).toEqual([]);
    });
});

// =============================================================================
// createCategory()
// =============================================================================

describe('categoryService.createCategory()', () => {

    it('returns failure immediately when name is empty — no API call made', async () => {
        const result = await categoryService.createCategory({ name: '' }, 'user@example.com');

        expect(result).toEqual({ success: false, message: 'Category name is required' });
        expect(mockPost).not.toHaveBeenCalled();
    });

    it('returns failure immediately when name is whitespace-only — no API call made', async () => {
        const result = await categoryService.createCategory({ name: '   ' }, 'user@example.com');

        expect(result).toEqual({ success: false, message: 'Category name is required' });
        expect(mockPost).not.toHaveBeenCalled();
    });

    it('calls POST /categories with the trimmed name', async () => {
        const newCat: Category = { id: 'cat_new', name: 'Operations', createdAt: '2026-06-22T00:00:00Z', createdBy: 'user@example.com' };
        mockPost.mockResolvedValueOnce(ok(newCat));

        await categoryService.createCategory({ name: '  Operations  ' }, 'user@example.com');

        expect(mockPost).toHaveBeenCalledWith('/categories', { name: 'Operations' });
    });

    it('returns success with the created category on a 200 response', async () => {
        const newCat: Category = { id: 'cat_new', name: 'Operations', createdAt: '2026-06-22T00:00:00Z', createdBy: 'user@example.com' };
        mockPost.mockResolvedValueOnce(ok(newCat));

        const result = await categoryService.createCategory({ name: 'Operations' }, 'user@example.com');

        expect(result).toEqual({ success: true, message: 'Category created successfully', category: newCat });
    });

    it('returns "Category already exists" on 401 (backend duplicate-name quirk)', async () => {
        mockPost.mockResolvedValueOnce(fail(401, 'Unauthorized'));

        const result = await categoryService.createCategory({ name: 'Legal' }, 'user@example.com');

        expect(result).toEqual({ success: false, message: 'Category already exists' });
    });

    it('returns the backend message on other error responses', async () => {
        mockPost.mockResolvedValueOnce(fail(500, 'Database unavailable'));

        const result = await categoryService.createCategory({ name: 'Legal' }, 'user@example.com');

        expect(result).toEqual({ success: false, message: 'Database unavailable' });
    });

    it('falls back to "Failed to create category" when response.message is empty', async () => {
        mockPost.mockResolvedValueOnce(fail(500, ''));

        const result = await categoryService.createCategory({ name: 'Legal' }, 'user@example.com');

        expect(result).toEqual({ success: false, message: 'Failed to create category' });
    });
});

// =============================================================================
// deleteCategory()
// =============================================================================

describe('categoryService.deleteCategory()', () => {

    it('calls DELETE /categories/{id} with the correct id', async () => {
        mockDelete.mockResolvedValueOnce(ok(null, 'Deleted'));

        await categoryService.deleteCategory('cat_1');

        expect(mockDelete).toHaveBeenCalledWith('/categories/cat_1');
    });

    it('returns success when the response is ok', async () => {
        mockDelete.mockResolvedValueOnce(ok(null, 'Deleted'));

        const result = await categoryService.deleteCategory('cat_1');

        expect(result).toEqual({ success: true, message: 'Category deleted successfully' });
    });

    it('returns "Category not found" on 401 (backend not-found quirk)', async () => {
        mockDelete.mockResolvedValueOnce(fail(401, 'Unauthorized'));

        const result = await categoryService.deleteCategory('nonexistent');

        expect(result).toEqual({ success: false, message: 'Category not found' });
    });

    it('returns the backend message on other error responses', async () => {
        mockDelete.mockResolvedValueOnce(fail(500, 'Internal server error'));

        const result = await categoryService.deleteCategory('cat_1');

        expect(result).toEqual({ success: false, message: 'Internal server error' });
    });

    it('falls back to "Failed to delete category" when response.message is empty', async () => {
        mockDelete.mockResolvedValueOnce(fail(500, ''));

        const result = await categoryService.deleteCategory('cat_1');

        expect(result).toEqual({ success: false, message: 'Failed to delete category' });
    });
});

// =============================================================================
// getCategoryById()
// =============================================================================

describe('categoryService.getCategoryById()', () => {

    it('returns the matching category when the id exists', () => {
        const result = categoryService.getCategoryById('cat_2', CATEGORY_LIST);

        expect(result).toEqual(CATEGORY_LIST[1]);
    });

    it('returns undefined when the id does not exist in the list', () => {
        const result = categoryService.getCategoryById('cat_999', CATEGORY_LIST);

        expect(result).toBeUndefined();
    });
});

// =============================================================================
// getCategoryByName()
// =============================================================================

describe('categoryService.getCategoryByName()', () => {

    it('returns the matching category for an exact-case name', () => {
        const result = categoryService.getCategoryByName('Legal', CATEGORY_LIST);

        expect(result).toEqual(CATEGORY_LIST[0]);
    });

    it('returns the matching category case-insensitively ("legal" matches "Legal")', () => {
        const result = categoryService.getCategoryByName('legal', CATEGORY_LIST);

        expect(result).toEqual(CATEGORY_LIST[0]);
    });

    it('returns the matching category when the stored name is lowercase', () => {
        const mixedList = [{ id: 'cat_x', name: 'finance', createdAt: '', createdBy: '' }];

        const result = categoryService.getCategoryByName('FINANCE', mixedList);

        expect(result).toEqual(mixedList[0]);
    });

    it('returns undefined when no category matches the name', () => {
        const result = categoryService.getCategoryByName('Procurement', CATEGORY_LIST);

        expect(result).toBeUndefined();
    });
});
