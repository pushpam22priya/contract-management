import { NextResponse } from 'next/server';
import clientPromise from '@/lib/db';

// GET /api/folders?createdBy=email
export async function GET(request: Request) {
    try {
        const { searchParams } = new URL(request.url);
        const createdBy = searchParams.get('createdBy');

        if (!createdBy) {
            return NextResponse.json({ error: 'createdBy is required' }, { status: 400 });
        }

        const client = await clientPromise;
        const db = client.db();

        const folders = await db.collection('folders')
            .find({ createdBy })
            .sort({ createdAt: -1 })
            .toArray();

        const mapped = folders.map(f => ({
            ...f,
            _id: f._id.toString(),
        }));

        return NextResponse.json(mapped);
    } catch (e) {
        console.error('Failed to fetch folders:', e);
        return NextResponse.json({ error: 'Failed to fetch folders' }, { status: 500 });
    }
}

// POST /api/folders
export async function POST(request: Request) {
    try {
        const { name, createdBy } = await request.json();

        const trimmedName = (name || '').trim();
        if (!trimmedName) {
            return NextResponse.json({ error: 'Folder name is required' }, { status: 400 });
        }
        if (trimmedName.length > 50) {
            return NextResponse.json({ error: 'Folder name must be 50 characters or less' }, { status: 400 });
        }
        if (!createdBy) {
            return NextResponse.json({ error: 'createdBy is required' }, { status: 400 });
        }

        const client = await clientPromise;
        const db = client.db();

        // Unique name check (case-sensitive, per user)
        const existing = await db.collection('folders').findOne({
            createdBy,
            name: trimmedName,
        });
        if (existing) {
            return NextResponse.json({ error: 'A folder with this name already exists' }, { status: 400 });
        }

        const now = new Date().toISOString();
        const result = await db.collection('folders').insertOne({
            name: trimmedName,
            createdBy,
            createdAt: now,
            updatedAt: now,
        });

        const folder = {
            _id: result.insertedId.toString(),
            name: trimmedName,
            createdBy,
            createdAt: now,
            updatedAt: now,
        };

        return NextResponse.json({ success: true, id: result.insertedId.toString(), folder });
    } catch (e) {
        console.error('Failed to create folder:', e);
        return NextResponse.json({ error: 'Failed to create folder' }, { status: 500 });
    }
}
