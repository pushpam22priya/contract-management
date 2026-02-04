import { NextResponse, NextRequest } from 'next/server';
import clientPromise from '@/lib/db';
import { ObjectId } from 'mongodb';
import { Readable } from 'stream';

// Helper to convert Web Stream to Node Buffer
async function streamToBuffer(readableStream: ReadableStream<Uint8Array>): Promise<Buffer> {
    const chunks = [];
    const reader = readableStream.getReader();
    while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        if (value) chunks.push(value);
    }
    return Buffer.concat(chunks);
}

export async function GET(
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const resolvedParams = await params;
        const id = resolvedParams.id;
        const searchParams = request.nextUrl.searchParams;
        const type = searchParams.get('type'); // 'template' or 'contract'

        if (!id || !ObjectId.isValid(id)) {
            return new NextResponse('Invalid ID', { status: 400 });
        }

        const client = await clientPromise;
        const db = client.db();

        let collectionName = 'templates';
        if (type === 'contract') collectionName = 'contracts';

        // Retrieve specifically the binary field
        // We look for 'pdf' field. For DOCX support in templates, we might need logic, but requirements focus on PDF.
        const doc = await db.collection(collectionName).findOne(
            { _id: new ObjectId(id) },
            { projection: { pdf: 1, docx: 1, fileType: 1 } }
        );

        if (!doc) {
            return new NextResponse('File not found', { status: 404 });
        }

        // Determine which buffer to serve
        // If query param specifically asks for 'docx', serve that?
        // Default to PDF.
        const format = searchParams.get('format');
        let buffer: Buffer | null = null;
        let contentType = 'application/pdf';

        if (format === 'docx' && doc.docx) {
            // @ts-ignore: MongoDB Binary -> Buffer compatibility
            buffer = doc.docx.buffer || doc.docx;
            contentType = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
        } else {
            // @ts-ignore
            buffer = doc.pdf ? (doc.pdf.buffer || doc.pdf) : null;
        }

        if (!buffer) {
            return new NextResponse('No binary data found for this document', { status: 404 });
        }

        // Convert to Uint8Array for NextResponse compatibility
        const uint8Array = new Uint8Array(buffer);

        // Return binary stream
        // According to requirements: "Backend must act as a binary passthrough"
        // "Respond with Content-Type: application/pdf, Content-Disposition: inline"

        return new NextResponse(uint8Array, {
            headers: {
                'Content-Type': contentType,
                'Content-Disposition': 'inline',
                'Content-Length': uint8Array.length.toString(),
                'Cache-Control': 'no-store, no-cache, must-revalidate' // Prevent bad caching during edits
            }
        });

    } catch (e) {
        console.error('Download error:', e);
        return new NextResponse('Internal Server Error', { status: 500 });
    }
}

export async function PUT(
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const resolvedParams = await params;
        const id = resolvedParams.id;
        const searchParams = request.nextUrl.searchParams;
        const type = searchParams.get('type') || 'template'; // default to template if not specified? 
        const format = searchParams.get('format'); // 'pdf' or 'docx'

        if (!id || !ObjectId.isValid(id)) {
            return NextResponse.json({ error: 'Invalid ID' }, { status: 400 });
        }

        // STRICT REQUIREMENT: "Disable body parser ... Read request stream into Buffer"
        // In Next.js App Router, we just read the body stream.
        if (!request.body) {
            return NextResponse.json({ error: 'No body provided' }, { status: 400 });
        }

        const buffer = await streamToBuffer(request.body);

        if (buffer.length === 0) {
            return NextResponse.json({ error: 'Empty body' }, { status: 400 });
        }

        const client = await clientPromise;
        const db = client.db();
        const collectionName = type === 'contract' ? 'contracts' : 'templates';

        const updateField = (format === 'docx') ? 'docx' : 'pdf';

        const result = await db.collection(collectionName).updateOne(
            { _id: new ObjectId(id) },
            {
                $set: {
                    [updateField]: buffer,
                    updatedAt: new Date().toISOString()
                }
            }
        );

        if (result.matchedCount === 0) {
            return NextResponse.json({ error: 'Document not found' }, { status: 404 });
        }

        return NextResponse.json({ success: true, size: buffer.length });

    } catch (e) {
        console.error('Upload error:', e);
        return NextResponse.json({ error: 'Upload failed' }, { status: 500 });
    }
}
