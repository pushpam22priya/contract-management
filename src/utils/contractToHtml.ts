/**
 * Convert contract text content to formatted HTML
 */
export function contractToHtml(content: string, title: string): string {
    // Escape HTML characters
    const escapeHtml = (text: string) => {
        return text
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#039;');
    };

    // Convert line breaks to paragraphs
    const paragraphs = content
        .split('\n\n')
        .map(para => para.trim())
        .filter(para => para.length > 0)
        .map(para => `<p>${escapeHtml(para).replace(/\n/g, '<br>')}</p>`)
        .join('\n');

    return `
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>${escapeHtml(title)}</title>
    <style>
        body {
            font-family: 'Times New Roman', Times, serif;
            line-height: 1.6;
            max-width: 800px;
            margin: 40px auto;
            padding: 20px;
            color: #333;
            background: white;
        }
        h1 {
            text-align: center;
            font-size: 24px;
            margin-bottom: 30px;
            text-transform: uppercase;
            border-bottom: 2px solid #333;
            padding-bottom: 10px;
        }
        p {
            margin: 15px 0;
            text-align: justify;
        }
        .signature {
            margin-top: 50px;
            border-top: 1px solid #333;
            padding-top: 20px;
        }
    </style>
</head>
<body>
    <h1>${escapeHtml(title)}</h1>
    ${paragraphs}
</body>
</html>
    `.trim();
}