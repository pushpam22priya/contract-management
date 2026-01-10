import Docxtemplater from 'docxtemplater';
import PizZip from 'pizzip';

/**
 * Fill DOCX template with field values
 * @param docxBase64 - Base64 encoded DOCX template
 * @param fieldValues - Object with placeholder values (e.g., { company_name: "Acme Corp" })
 * @returns Blob of filled DOCX file
 */
export async function fillDocxTemplate(
    docxBase64: string,
    fieldValues: Record<string, string>
): Promise<Blob> {
    try {
        // Convert base64 to binary
        const binaryString = atob(docxBase64);
        const bytes = new Uint8Array(binaryString.length);
        for (let i = 0; i < binaryString.length; i++) {
            bytes[i] = binaryString.charCodeAt(i);
        }

        // Load the DOCX template
        const zip = new PizZip(bytes);
        const doc = new Docxtemplater(zip, {
            paragraphLoop: true,
            linebreaks: true,
            delimiters: {
                start: '<',  // Use < instead of {
                end: '>'     // Use > instead of }
            }
        });

        console.log('📋 Template loaded, rendering with field values...');

        // Fill the template with values
        doc.render(fieldValues);

        console.log('✅ Template rendered successfully');

        // Generate the filled DOCX
        const output = doc.getZip().generate({
            type: 'blob',
            mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        });

        console.log('📦 DOCX blob generated, size:', output.size);


        return output;
    } catch (error) {
        console.error('❌ Error filling DOCX template:', error);
        if (error instanceof Error) {
            console.error('Error message:', error.message);
            console.error('Error stack:', error.stack);
        }
        throw new Error('Failed to fill template: ' + (error as Error).message);
    }
}