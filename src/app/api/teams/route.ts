import { NextResponse } from 'next/server';
import clientPromise from '@/lib/db';

// GET /api/teams?createdBy=email
export async function GET(request: Request) {
    try {
        const { searchParams } = new URL(request.url);
        const createdBy = searchParams.get('createdBy');

        if (!createdBy) {
            return NextResponse.json({ error: 'createdBy is required' }, { status: 400 });
        }

        const client = await clientPromise;
        const db = client.db();

        const teams = await db.collection('teams')
            .find({ createdBy })
            .sort({ createdAt: -1 })
            .toArray();

        const mapped = teams.map(t => ({
            ...t,
            _id: t._id.toString(),
        }));

        return NextResponse.json(mapped);
    } catch (e) {
        console.error('Failed to fetch teams:', e);
        return NextResponse.json({ error: 'Failed to fetch teams' }, { status: 500 });
    }
}

// POST /api/teams
export async function POST(request: Request) {
    try {
        const { name, createdBy } = await request.json();

        // Validation
        const trimmedName = (name || '').trim();
        if (!trimmedName) {
            return NextResponse.json({ error: 'Team name is required' }, { status: 400 });
        }
        if (trimmedName.length > 50) {
            return NextResponse.json({ error: 'Team name must be 50 characters or less' }, { status: 400 });
        }
        if (!createdBy) {
            return NextResponse.json({ error: 'createdBy is required' }, { status: 400 });
        }

        const client = await clientPromise;
        const db = client.db();

        // Unique name check (case-sensitive, per user)
        const existing = await db.collection('teams').findOne({
            createdBy,
            name: trimmedName,
        });
        if (existing) {
            return NextResponse.json({ error: 'A team with this name already exists' }, { status: 400 });
        }

        const now = new Date().toISOString();
        const result = await db.collection('teams').insertOne({
            name: trimmedName,
            createdBy,
            createdAt: now,
            updatedAt: now,
        });

        const team = {
            _id: result.insertedId.toString(),
            name: trimmedName,
            createdBy,
            createdAt: now,
            updatedAt: now,
        };

        return NextResponse.json({ success: true, id: result.insertedId.toString(), team });
    } catch (e) {
        console.error('Failed to create team:', e);
        return NextResponse.json({ error: 'Failed to create team' }, { status: 500 });
    }
}
