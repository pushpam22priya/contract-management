import { Document, Paragraph, TextRun, AlignmentType, HeadingLevel } from 'docx';

/**
 * Convert contract text content to DOCX Document
 */
export async function contractToDocx(content: string, title: string): Promise<Blob> {
    // Split content into paragraphs
    const paragraphs = content
        .split('\n')
        .map(line => line.trim())
        .filter(line => line.length > 0);

    // Create document sections
    const docSections = [
        // Title
        new Paragraph({
            text: title.toUpperCase(),
            heading: HeadingLevel.HEADING_1,
            alignment: AlignmentType.CENTER,
            spacing: {
                after: 400,
            },
        }),
        
        // Horizontal line after title
        new Paragraph({
            border: {
                bottom: {
                    color: '000000',
                    space: 1,
                    style: 'single',
                    size: 6,
                },
            },
            spacing: {
                after: 300,
            },
        }),
    ];

    // Add content paragraphs
    paragraphs.forEach(para => {
        // Check if it's a heading (all caps or starts with specific keywords)
        const isHeading = para === para.toUpperCase() && para.length < 100;
        
        if (isHeading) {
            docSections.push(
                new Paragraph({
                    text: para,
                    heading: HeadingLevel.HEADING_2,
                    spacing: {
                        before: 300,
                        after: 200,
                    },
                })
            );
        } else {
            docSections.push(
                new Paragraph({
                    children: [
                        new TextRun({
                            text: para,
                            font: 'Times New Roman',
                            size: 24, // 12pt (1pt = 2 half-points)
                        }),
                    ],
                    spacing: {
                        after: 200,
                        line: 360, // 1.5 line spacing
                    },
                    alignment: AlignmentType.JUSTIFIED,
                })
            );
        }
    });

    // Create document
    const doc = new Document({
        sections: [
            {
                properties: {
                    page: {
                        margin: {
                            top: 1440,    // 1 inch = 1440 twips
                            right: 1440,
                            bottom: 1440,
                            left: 1440,
                        },
                    },
                },
                children: docSections,
            },
        ],
    });

    // Generate blob
    const { Packer } = await import('docx');
    const blob = await Packer.toBlob(doc);
    
    return blob;
}