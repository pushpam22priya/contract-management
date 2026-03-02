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

        // Retrieve specifically the binary fields
        const doc = await db.collection(collectionName).findOne(
            { _id: new ObjectId(id) },
            { projection: { pdf: 1, docx: 1, fileType: 1, signedPdfBase64: 1 } }
        );

        if (!doc) {
            return new NextResponse('File not found', { status: 404 });
        }

        // Determine which buffer to serve
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

            // ✅ FALLBACK: If binary 'pdf' is missing, try 'signedPdfBase64'
            if (!buffer && doc.signedPdfBase64) {
                try {
                    buffer = Buffer.from(doc.signedPdfBase64, 'base64');
                    console.log(`🔄 [FileGET] Fallback: Serving from signedPdfBase64 (${buffer.length} bytes)`);
                } catch (e) {
                    console.warn('⚠️ [FileGET] Failed to decode signedPdfBase64 fallback:', e);
                }
            }
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

        // For PDF uploads, also update signedPdfBase64 to keep fields in sync
        const updateDoc: Record<string, any> = {
            [updateField]: buffer,
            updatedAt: new Date().toISOString()
        };

        if (updateField === 'pdf') {
            updateDoc.signedPdfBase64 = buffer.toString('base64');
            console.log(`🔄 [FilePUT] Synchronized uploaded pdf to signedPdfBase64 (${updateDoc.signedPdfBase64.length} chars)`);

            // ✅ VERSIONING: Increment version for contracts when content changes
            if (type === 'contract') {
                const contract = await db.collection(collectionName).findOne(
                    { _id: new ObjectId(id) },
                    { projection: { version: 1 } }
                );
                const currentVersion = contract?.version || 0;
                updateDoc.version = currentVersion + 1;
            }
        }

        const result = await db.collection(collectionName).updateOne(
            { _id: new ObjectId(id) },
            {
                $set: updateDoc
            }
        );

        if (result.matchedCount === 0) {
            return NextResponse.json({ error: 'Document not found' }, { status: 404 });
        }

        // ✅ SYNC FIX: If version was incremented, propagate to pending signature requests
        if (type === 'contract' && updateDoc.version !== undefined) {
            try {
                const syncResult = await db.collection('signature_requests').updateMany(
                    {
                        contractId: id,
                        status: 'pending'
                    },
                    {
                        $set: { contractVersion: updateDoc.version }
                    }
                );
                if (syncResult.modifiedCount > 0) {
                    console.log(`🔄 [FilePUT] Propagated version ${updateDoc.version} to ${syncResult.modifiedCount} pending requests`);
                }
            } catch (syncError) {
                console.warn('⚠️ [FilePUT] Failed to sync version to signature requests:', syncError);
            }
        }

        return NextResponse.json({ success: true, size: buffer.length });

    } catch (e) {
        console.error('Upload error:', e);
        return NextResponse.json({ error: 'Upload failed' }, { status: 500 });
    }
}
