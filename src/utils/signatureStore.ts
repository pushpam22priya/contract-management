/**
 * SignatureStore - Centralized storage for signature and form field data.
 * 
 * This singleton class stores field values in memory to prevent data loss
 * during PDFTron export operations where annotations may be temporarily lost.
 * 
 * Used by: PDFViewerContainer, CreateContractDialog, DocumentViewerDialog, External Signing
 */

export interface StoredFieldData {
    /** The field's current value (string for text, 'Signed' for signatures) */
    value: string;
    /** Base64 encoded signature image data (for signature fields) */
    signatureData?: string;
    /** Signature appearance blob (for signature fields) */
    signatureBlob?: Blob;
    /** XFDF snippet containing this annotation's data */
    annotationXfdf?: string;
    /** Annotation ID from PDFTron (the widget) */
    annotationId?: string;
    /** Stamp/FreeHand annotation ID (the actual signature drawing) */
    stampAnnotationId?: string;
    /** Field type */
    type: 'text' | 'signature' | 'checkbox' | 'other';
    /** Timestamp when this data was stored */
    timestamp: number;
}


class SignatureStore {
    private static instance: SignatureStore;
    private store: Map<string, StoredFieldData>;

    private constructor() {
        this.store = new Map();
    }

    /**
     * Get the singleton instance of SignatureStore
     */
    static getInstance(): SignatureStore {
        if (!SignatureStore.instance) {
            SignatureStore.instance = new SignatureStore();
        }
        return SignatureStore.instance;
    }

    /**
     * Store field data by field name
     */
    set(fieldName: string, data: Omit<StoredFieldData, 'timestamp'>): void {
        const storedData: StoredFieldData = {
            ...data,
            timestamp: Date.now(),
        };
        this.store.set(fieldName, storedData);
        console.log(`🗄️ [SignatureStore] Stored: ${fieldName} (type=${data.type}, value="${data.value?.substring?.(0, 20) || data.value}")`);
    }

    /**
     * Get field data by field name
     */
    get(fieldName: string): StoredFieldData | undefined {
        return this.store.get(fieldName);
    }

    /**
     * Get all stored field data
     */
    getAll(): Map<string, StoredFieldData> {
        return new Map(this.store);
    }

    /**
     * Get all signature-type fields
     */
    getSignatures(): Map<string, StoredFieldData> {
        const signatures = new Map<string, StoredFieldData>();
        for (const [key, value] of this.store.entries()) {
            if (value.type === 'signature') {
                signatures.set(key, value);
            }
        }
        return signatures;
    }

    /**
     * Get all text-type fields
     */
    getTextFields(): Map<string, StoredFieldData> {
        const textFields = new Map<string, StoredFieldData>();
        for (const [key, value] of this.store.entries()) {
            if (value.type === 'text') {
                textFields.set(key, value);
            }
        }
        return textFields;
    }

    /**
     * Check if a field exists in the store
     */
    has(fieldName: string): boolean {
        return this.store.has(fieldName);
    }

    /**
     * Remove a specific field from the store
     */
    remove(fieldName: string): boolean {
        const result = this.store.delete(fieldName);
        if (result) {
            console.log(`🗑️ [SignatureStore] Removed: ${fieldName}`);
        }
        return result;
    }

    /**
     * Clear all stored data
     */
    clear(): void {
        const count = this.store.size;
        this.store.clear();
        console.log(`🧹 [SignatureStore] Cleared ${count} entries`);
    }

    /**
     * Get the number of stored entries
     */
    get size(): number {
        return this.store.size;
    }

    /**
     * Export store contents as a plain object (for debugging/logging)
     */
    toJSON(): Record<string, StoredFieldData> {
        const obj: Record<string, StoredFieldData> = {};
        for (const [key, value] of this.store.entries()) {
            obj[key] = value;
        }
        return obj;
    }
}

// Export singleton instance getter
export const getSignatureStore = (): SignatureStore => SignatureStore.getInstance();

// Export for direct usage
export default SignatureStore;
