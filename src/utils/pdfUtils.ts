/**
 * PDF Utility Functions
 * Helper functions for handling PDF binary data safely
 */

/**
 * Convert Blob to Base64 string
 * Uses FileReader API which properly handles binary data
 */
export async function blobToBase64(blob: Blob): Promise<string> {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onloadend = () => {
            if (reader.error) {
                reject(reader.error);
                return;
            }
            const dataUrl = reader.result as string;
            // Remove the "data:application/pdf;base64," prefix
            const base64 = dataUrl.split(',')[1];
            resolve(base64);
        };
        reader.onerror = () => reject(new Error('Failed to read blob'));
        reader.readAsDataURL(blob);
    });
}

/**
 * Verify that a base64 string is a valid PDF
 */
export function verifyPdfBase64(base64: string): boolean {
    if (!base64) return false;
    try {
        // Decode first 20 chars to get header
        const headerBytes = Uint8Array.from(
            atob(base64.substring(0, 20)),
            c => c.charCodeAt(0)
        );
        const header = String.fromCharCode(...headerBytes.slice(0, 5));
        return header.startsWith('%PDF-');
    } catch {
        return false;
    }
}

/**
 * Convert base64 to Blob
 */
export function base64ToBlob(base64: string, type = 'application/pdf'): Blob {
    const binaryString = atob(base64);
    const bytes = new Uint8Array(binaryString.length);
    for (let i = 0; i < binaryString.length; i++) {
        bytes[i] = binaryString.charCodeAt(i);
    }
    return new Blob([bytes], { type });
}
