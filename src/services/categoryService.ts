import { httpClient } from '@/lib/httpClient';
import { Category, CreateCategoryData } from '@/types/template';

class CategoryService {

    /**
     * Fetch all categories from the backend.
     * Returns an empty array on failure — callers always get a safe value.
     */
    async getAllCategories(): Promise<Category[]> {
        console.log('[CategoryService] getAllCategories → GET /categories');

        const response = await httpClient.get<Category[]>('/categories');

        if (response.ok && Array.isArray(response.data)) {
            console.log(`[CategoryService] getAllCategories ✓ received ${response.data.length} categories`);
            return response.data;
        }

        console.error('[CategoryService] getAllCategories ✗', response.status, response.message);
        return [];
    }

    /**
     * Create a new category on the backend.
     * Backend enforces uniqueness (case-insensitive) and returns HTTP 401 for duplicates.
     */
    async createCategory(
        data: CreateCategoryData,
        userEmail: string,
    ): Promise<{ success: boolean; message: string; category?: Category }> {
        const name = data.name?.trim();

        if (!name) {
            console.warn('[CategoryService] createCategory called with empty name');
            return { success: false, message: 'Category name is required' };
        }

        console.log(`[CategoryService] createCategory → POST /categories  name="${name}"  by=${userEmail}`);

        const response = await httpClient.post<Category>('/categories', { name });

        if (response.ok && response.data) {
            console.log('[CategoryService] createCategory ✓', response.data);
            return { success: true, message: 'Category created successfully', category: response.data };
        }

        // Backend returns 401 for duplicate category names (API quirk documented in spec §5.2)
        if (response.status === 401) {
            console.warn(`[CategoryService] createCategory ✗ duplicate name "${name}"`);
            return { success: false, message: 'Category already exists' };
        }

        console.error('[CategoryService] createCategory ✗', response.status, response.message);
        return { success: false, message: response.message || 'Failed to create category' };
    }

    /**
     * Delete a category by ID.
     */
    async deleteCategory(id: string): Promise<{ success: boolean; message: string }> {
        console.log(`[CategoryService] deleteCategory → DELETE /categories/${id}`);

        const response = await httpClient.delete(`/categories/${id}`);

        if (response.ok) {
            console.log(`[CategoryService] deleteCategory ✓ id=${id}`);
            return { success: true, message: 'Category deleted successfully' };
        }

        // Backend returns 401 when ID does not exist (API quirk documented in spec §5.3)
        if (response.status === 401) {
            console.warn(`[CategoryService] deleteCategory ✗ not found id=${id}`);
            return { success: false, message: 'Category not found' };
        }

        console.error('[CategoryService] deleteCategory ✗', response.status, response.message);
        return { success: false, message: response.message || 'Failed to delete category' };
    }

    /**
     * Find a category by ID within a pre-fetched list.
     * Does not make a network call — pass the list you already have.
     */
    getCategoryById(id: string, categories: Category[]): Category | undefined {
        return categories.find(c => c.id === id);
    }

    /**
     * Find a category by name (case-insensitive) within a pre-fetched list.
     */
    getCategoryByName(name: string, categories: Category[]): Category | undefined {
        return categories.find(c => c.name.toLowerCase() === name.toLowerCase());
    }
}

export const categoryService = new CategoryService();
