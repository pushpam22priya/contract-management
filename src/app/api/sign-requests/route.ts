/**
 * API Route: POST /api/sign-requests
 *
 * Creates a signing request by updating the contract document directly.
 * No longer uses a separate signature_requests collection.
 */

import { NextResponse } from 'next/server';
import { connectToDatabase } from '@/lib/db';
import { ObjectId } from 'mongodb';

export async function POST(request: Request) {
    try {
        const body = await request.json();
        const {
            token,
            contractId,
            signerEmail,
            createdByName,
            createdAt,
            expiresAt,
        } = body;

        console.log(`📋 [SignRequest POST] Creating signing request for contract: ${contractId}`);
        console.log(`   Token: ${token}`);
        console.log(`   Signer: ${signerEmail}`);

        const { db } = await connectToDatabase();

        // Validate contract exists
        let objectId: ObjectId;
        try {
            objectId = new ObjectId(contractId);
        } catch (e) {
            console.error(`❌ [SignRequest POST] Invalid contractId: ${contractId}`);
            return NextResponse.json({ success: false, error: 'Invalid contract ID' }, { status: 400 });
        }

        const contract = await db.collection('contracts').findOne({ _id: objectId });
        if (!contract) {
            console.error(`❌ [SignRequest POST] Contract not found: ${contractId}`);
            return NextResponse.json({ success: false, error: 'Contract not found' }, { status: 404 });
        }

        console.log(`✅ [SignRequest POST] Found contract: ${contract.title}`);

        // Create signing request object (embedded in contract)
        const signingRequest = {
            token,
            signerEmail,
            senderName: createdByName,
            status: 'pending',
            createdAt,
            expiresAt,
            events: [{ type: 'created', at: new Date().toISOString() }]
        };

        // Update contract with signing request data
        const updateResult = await db.collection('contracts').updateOne(
            { _id: objectId },
            {
                $set: {
                    externalSigningToken: token,
                    signingRequest,
                    // Also update signer info
                    signer: {
                        email: signerEmail,
                        status: 'pending'
                    }
                }
            }
        );

        console.log(`✅ [SignRequest POST] Update result: matched=${updateResult.matchedCount}, modified=${updateResult.modifiedCount}`);

        if (updateResult.matchedCount === 0) {
            console.error(`❌ [SignRequest POST] No document matched for update`);
            return NextResponse.json({ success: false, error: 'Failed to update contract' }, { status: 500 });
        }

        console.log(`✅ [SignRequest POST] Created signing request for contract ${contractId} with token ${token}`);

        return NextResponse.json({
            success: true,
            id: contractId,
            token
        });

    } catch (error: any) {
        console.error('❌ [SignRequest POST] Error:', error);
        return NextResponse.json({ success: false, error: error.message }, { status: 500 });
    }
}
