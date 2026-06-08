import { NextRequest, NextResponse } from 'next/server';
import { connectToDatabase } from '@/lib/db';
import { ObjectId } from 'mongodb';

export async function POST(
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const { id } = await params;

        // Rule 1: Validate ObjectId
        if (!id || !ObjectId.isValid(id)) {
            return NextResponse.json({ error: 'Invalid contract ID' }, { status: 400 });
        }

        // Rule 2: Parse and validate body
        let body: { terminatedBy?: string } = {};
        try {
            body = await request.json();
        } catch {
            return NextResponse.json({ error: 'Invalid request body' }, { status: 400 });
        }

        const { terminatedBy } = body;
        if (!terminatedBy || typeof terminatedBy !== 'string' || !terminatedBy.trim()) {
            return NextResponse.json({ error: 'terminatedBy is required' }, { status: 400 });
        }

        const { db } = await connectToDatabase();

        // Rule 3: Contract must exist
        const contract = await db.collection('contracts').findOne({ _id: new ObjectId(id) });
        if (!contract) {
            return NextResponse.json({ error: 'Contract not found' }, { status: 404 });
        }

        // Rule 4: Idempotent — already terminated
        if (contract.status === 'TERMINATED') {
            return NextResponse.json({ success: true, alreadyTerminated: true }, { status: 200 });
        }

        // Rule 5: Only expired contracts can be terminated
        if (contract.status !== 'expired') {
            return NextResponse.json(
                { error: `Cannot terminate a contract with status "${contract.status}". Only expired contracts can be terminated.` },
                { status: 400 }
            );
        }

        // Rule 6: No active renewal in progress
        if (contract.renewalStatus === 'in_progress') {
            return NextResponse.json(
                { error: 'Cannot terminate a contract that has an active renewal in progress. Cancel or complete the renewal first.' },
                { status: 409 }
            );
        }

        // All checks passed — perform the termination.
        // Also clear any renewal tracking fields so stale "Renewal in Progress"
        // state cannot bleed through after termination.
        const now = new Date().toISOString();
        await db.collection('contracts').updateOne(
            { _id: new ObjectId(id) },
            {
                $set: {
                    status: 'terminated',
                    terminatedAt: now,
                    terminatedBy: terminatedBy.trim(),
                    updatedAt: now,
                },
                $unset: {
                    renewalStatus: '',
                    renewedContractId: '',
                },
            }
        );

        return NextResponse.json({ success: true }, { status: 201 });
    } catch (error: any) {
        console.error('[terminate] Unexpected error:', error);
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }
}
