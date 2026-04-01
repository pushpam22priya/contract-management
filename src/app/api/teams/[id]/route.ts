import { NextResponse } from 'next/server';
import clientPromise from '@/lib/db';
import { ObjectId } from 'mongodb';

// PATCH /api/teams/[id]  — rename
export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
    try {
        const { id } = await params;
        const { name, createdBy } = await request.json();

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

        // Unique name check — exclude the team being renamed (case-sensitive)
        const existing = await db.collection('teams').findOne({
            createdBy,
            _id: { $ne: new ObjectId(id) },
            name: trimmedName,
        });
        if (existing) {
            return NextResponse.json({ error: 'A team with this name already exists' }, { status: 400 });
        }

        await db.collection('teams').updateOne(
            { _id: new ObjectId(id) },
            { $set: { name: trimmedName, updatedAt: new Date().toISOString() } }
        );

        return NextResponse.json({ success: true });
    } catch (e) {
        console.error('Failed to rename team:', e);
        return NextResponse.json({ error: 'Failed to rename team' }, { status: 500 });
    }
}

// DELETE /api/teams/[id]  — only if no contracts belong to it
export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
    try {
        const { id } = await params;

        const client = await clientPromise;
        const db = client.db();

        const contractCount = await db.collection('contracts').countDocuments({ teamId: id });
        if (contractCount > 0) {
            return NextResponse.json(
                { error: `Cannot delete: this team contains ${contractCount} contract(s)` },
                { status: 400 }
            );
        }

        await db.collection('teams').deleteOne({ _id: new ObjectId(id) });

        return NextResponse.json({ success: true });
    } catch (e) {
        console.error('Failed to delete team:', e);
        return NextResponse.json({ error: 'Failed to delete team' }, { status: 500 });
    }
}
