import { NextResponse } from 'next/server';
import clientPromise from '@/lib/db';
import { ObjectId } from 'mongodb';

export async function GET() {
    try {
        const client = await clientPromise;
        const db = client.db();

        // Exclude large binary fields from the list
        const templates = await db.collection('templates')
            .find({})
            .project({ pdf: 0, docx: 0, fileData: 0, docxBase64: 0 })
            .sort({ createdAt: -1 })
            .toArray();

        const mappedTemplates = templates.map(t => ({
            ...t,
            id: t._id.toString(),
            // Construct fetching URL for the binary
            fileUrl: `/api/file/${t._id.toString()}?type=template`,
            // Clean up internal fields
            _id: undefined
        }));

        return NextResponse.json(mappedTemplates);
    } catch (e) {
        console.error('Failed to fetch templates:', e);
        return NextResponse.json({ error: 'Failed to fetch templates' }, { status: 500 });
    }
}

export async function POST(request: Request) {
    try {
        const client = await clientPromise;
        const db = client.db();
        const data = await request.json();

        // Validate required fields
        if (!data.name || !data.category) {
            return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
        }

        const newTemplate = {
            ...data,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
            timesUsed: 0,
            // Initialize empty buffers - will be populated by the binary upload step
            // We use standard 'pdf' field for storage as per requirements
            pdf: null,
            docx: null,
            hasFormFields: data.hasFormFields || false,
        };

        const result = await db.collection('templates').insertOne(newTemplate);

        return NextResponse.json({
            success: true,
            id: result.insertedId.toString(),
            message: 'Template metadata created. Please upload binary.'
        });

    } catch (e) {
        console.error('Failed to create template:', e);
        return NextResponse.json({ error: 'Failed to create template' }, { status: 500 });
    }
}
