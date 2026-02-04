
import { NextResponse } from 'next/server';
import { connectToDatabase } from '@/lib/db';
import { ObjectId } from 'mongodb';

export async function GET(
    request: Request,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const { id } = await params;
        const { db } = await connectToDatabase();

        const template = await db.collection('templates').findOne({
            _id: new ObjectId(id)
        });

        if (!template) {
            return NextResponse.json(
                { success: false, message: 'Template not found' },
                { status: 404 }
            );
        }

        // Map _id to id
        const result = {
            ...template,
            id: template._id.toString(),
            _id: undefined
        };

        return NextResponse.json(result);
    } catch (error) {
        console.error('Failed to get template:', error);
        return NextResponse.json(
            { success: false, message: 'Failed to get template' },
            { status: 500 }
        );
    }
}

export async function PUT(
    request: Request,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const { id } = await params;
        const body = await request.json();
        const { db } = await connectToDatabase();

        // Update fields (excluding immutable ones like _id, createdAt)
        // Ensure we don't accidentally wipe out binary fields if they aren't in body
        // But usually body contains specific fields to update.
        // We handle binary via /api/file, so this is just metadata.

        const updateData: any = {
            ...body,
            // Prevent overwriting these if passed
            _id: undefined,
            id: undefined,
        };

        // Clean undefined
        Object.keys(updateData).forEach(key => updateData[key] === undefined && delete updateData[key]);

        const result = await db.collection('templates').updateOne(
            { _id: new ObjectId(id) },
            { $set: updateData }
        );

        if (result.matchedCount === 0) {
            return NextResponse.json(
                { success: false, message: 'Template not found' },
                { status: 404 }
            );
        }

        return NextResponse.json({ success: true, message: 'Template updated' });
    } catch (error) {
        console.error('Failed to update template:', error);
        return NextResponse.json(
            { success: false, message: 'Failed to update template' },
            { status: 500 }
        );
    }
}

export async function DELETE(
    request: Request,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const { id } = await params;
        const { db } = await connectToDatabase();

        const result = await db.collection('templates').deleteOne({
            _id: new ObjectId(id)
        });

        if (result.deletedCount === 0) {
            return NextResponse.json(
                { success: false, message: 'Template not found' },
                { status: 404 }
            );
        }

        return NextResponse.json({ success: true, message: 'Template deleted' });
    } catch (error) {
        console.error('Failed to delete template:', error);
        return NextResponse.json(
            { success: false, message: 'Failed to delete template' },
            { status: 500 }
        );
    }
}
