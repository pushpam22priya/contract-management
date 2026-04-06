/**
 * POST /api/contracts/[id]/mark-renewal
 *
 * Marks an original contract as having an active renewal in progress.
 * Called only after the user actually saves the renewal draft for the first time.
 *
 * Body:
 *   renewalId    string  — _id of the renewal contract
 *   startDate    string  — ISO date — start date of the renewal (for tooltip)
 */

import { NextResponse } from 'next/server';
import clientPromise from '@/lib/db';
import { ObjectId } from 'mongodb';

export async function POST(
    request: Request,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const { id } = await params;

        if (!id || !ObjectId.isValid(id)) {
            return NextResponse.json({ error: 'Invalid contract ID' }, { status: 400 });
        }

        const body = await request.json();
        const { renewalId, startDate } = body;

        if (!renewalId || !ObjectId.isValid(renewalId)) {
            return NextResponse.json({ error: 'renewalId is required' }, { status: 400 });
        }

        const client = await clientPromise;
        const db = client.db();

        await db.collection('contracts').updateOne(
            { _id: new ObjectId(id) },
            {
                $set: {
                    renewalStatus: 'in_progress',
                    renewedContractId: renewalId,
                    renewalStartDate: startDate || null,
                    updatedAt: new Date().toISOString(),
                },
            }
        );

        return NextResponse.json({ success: true });
    } catch (e) {
        console.error('Failed to mark renewal:', e);
        return NextResponse.json({ error: 'Failed to mark renewal' }, { status: 500 });
    }
}
