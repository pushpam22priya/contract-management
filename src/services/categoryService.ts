import { Category, CreateCategoryData } from '@/types/template';

const CATEGORIES_STORAGE_KEY = 'cms_categories';

// Default categories
const DEFAULT_CATEGORIES: Category[] = [
    {
        id: 'cat_1',
        name: 'Employment',
        createdAt: new Date('2024-01-01').toISOString(),
        createdBy: 'system',
    },
    {
        id: 'cat_2',
        name: 'Service',
        createdAt: new Date('2024-01-01').toISOString(),
        createdBy: 'system',
    },
    {
        id: 'cat_3',
        name: 'Sales',
        createdAt: new Date('2024-01-01').toISOString(),
        createdBy: 'system',
    },
    {
        id: 'cat_4',
        name: 'Lease',
        createdAt: new Date('2024-01-01').toISOString(),
        createdBy: 'system',
    },
    {
        id: 'cat_5',
        name: 'NDA',
        createdAt: new Date('2024-01-01').toISOString(),
        createdBy: 'system',
    },
];

class CategoryService {
    /**
     * Initialize default categories if not exists
     */
    private initializeCategories(): void {
        if (typeof window === 'undefined') return;

        const existing = localStorage.getItem(CATEGORIES_STORAGE_KEY);
        if (!existing) {
            localStorage.setItem(CATEGORIES_STORAGE_KEY, JSON.stringify(DEFAULT_CATEGORIES));
        }
    }

    /**
     * Get all categories from localStorage
     */
    getAllCategories(): Category[] {
        if (typeof window === 'undefined') return DEFAULT_CATEGORIES;

        this.initializeCategories();
        const categoriesData = localStorage.getItem(CATEGORIES_STORAGE_KEY);
        return categoriesData ? JSON.parse(categoriesData) : DEFAULT_CATEGORIES;
    }

    /**
     * Save all categories to localStorage
     */
    private saveCategories(categories: Category[]): void {
        if (typeof window === 'undefined') return;

        localStorage.setItem(CATEGORIES_STORAGE_KEY, JSON.stringify(categories));
    }

    /**
     * Generate unique category ID
     */
    private generateCategoryId(): string {
        return `cat_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    }

    /**
     * Create new category
     */
    async createCategory(data: CreateCategoryData, userEmail: string): Promise<{ success: boolean; message: string; category?: Category }> {
        // Simulate API delay
        await new Promise(resolve => setTimeout(resolve, 300));

        if (!data.name || data.name.trim().length === 0) {
            return {
                success: false,
                message: 'Category name is required',
            };
        }

        const categories = this.getAllCategories();

        // Check if category already exists
        const existingCategory = categories.find(
            cat => cat.name.toLowerCase() === data.name.trim().toLowerCase()
        );

        if (existingCategory) {
            return {
                success: false,
                message: 'Category already exists',
            };
        }

        const newCategory: Category = {
            id: this.generateCategoryId(),
            name: data.name.trim(),
            createdAt: new Date().toISOString(),
            createdBy: userEmail,
        };

        categories.push(newCategory);
        this.saveCategories(categories);

        return {
            success: true,
            message: 'Category created successfully',
            category: newCategory,
        };
    }

    /**
     * Get category by ID
     */
    getCategoryById(id: string): Category | undefined {
        const categories = this.getAllCategories();
        return categories.find(cat => cat.id === id);
    }

    /**
     * Get category by name
     */
    getCategoryByName(name: string): Category | undefined {
        const categories = this.getAllCategories();
        return categories.find(cat => cat.name.toLowerCase() === name.toLowerCase());
    }

    /**
     * Delete category
     */
    async deleteCategory(id: string): Promise<{ success: boolean; message: string }> {
        // Simulate API delay
        await new Promise(resolve => setTimeout(resolve, 300));

        const categories = this.getAllCategories();
        const categoryIndex = categories.findIndex(cat => cat.id === id);

        if (categoryIndex === -1) {
            return {
                success: false,
                message: 'Category not found',
            };
        }

        // Don't allow deleting default categories
        if (categories[categoryIndex].createdBy === 'system') {
            return {
                success: false,
                message: 'Cannot delete default categories',
            };
        }

        categories.splice(categoryIndex, 1);
        this.saveCategories(categories);

        return {
            success: true,
            message: 'Category deleted successfully',
        };
    }

    /**
     * Clear all categories (for testing)
     */
    clearAllCategories(): void {
        if (typeof window === 'undefined') return;

        localStorage.removeItem(CATEGORIES_STORAGE_KEY);
    }
}

// Export singleton instance
export const categoryService = new CategoryService();
