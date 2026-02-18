/**
 * API Route: POST /api/sign-requests
 *
 * Creates a new signature request for external signing.
 * Supports multi-party signature flow with party assignment.
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
            contractTitle,
            signerEmail,
            signerName,           // ✅ NEW: Signer's name
            createdBy,
            createdByName,
            createdAt,
            expiresAt,
            templateId,
            formFields,
            hasFormFields,
            xfdfData,
            fieldValues,          // ✅ FIX: Extract fieldValues for text field restoration
            // ═══════════════════════════════════════════════════════════════════════════
            // MULTI-PARTY FIELDS
            // ═══════════════════════════════════════════════════════════════════════════
            assignedParty,        // ✅ NEW: Party ID this signer is assigned to
            assignedPartyLabel,   // ✅ NEW: Party label for display
            contractVersion,      // ✅ NEW: Version for optimistic locking
        } = body;

        console.log(`📋 [SignRequest POST] Creating signature request...`);
        console.log(`   Contract: ${contractId}`);
        console.log(`   Signer: ${signerEmail}`);
        console.log(`   Assigned Party: ${assignedParty || 'none'} (${assignedPartyLabel || 'N/A'})`);

        const { db } = await connectToDatabase();

        // Validate contract exists
        const contract = await db.collection('contracts').findOne({ _id: new ObjectId(contractId) });
        if (!contract) {
            console.log(`❌ [SignRequest POST] Contract not found: ${contractId}`);
            return NextResponse.json({ success: false, error: 'Contract not found' }, { status: 404 });
        }

        // Build the new request object
        const newRequest: Record<string, any> = {
            token,
            contractId,
            contractTitle,
            signerEmail,
            signerName: signerName || '',
            createdBy,
            createdByName,
            createdAt,
            expiresAt,
            templateId,
            status: 'pending',
            formFields,
            hasFormFields,
            xfdfData,
            fieldValues,
            // Track events
            events: [{ type: 'created', at: new Date().toISOString() }]
        };

        // Add multi-party fields if provided
        if (assignedParty) {
            newRequest.assignedParty = assignedParty;
            newRequest.assignedPartyLabel = assignedPartyLabel || assignedParty;
            console.log(`🏷️ [SignRequest POST] Multi-party mode: ${assignedParty}`);
        }

        if (contractVersion !== undefined) {
            newRequest.contractVersion = contractVersion;
        }

        const result = await db.collection('signature_requests').insertOne(newRequest);

        console.log(`✅ [SignRequest POST] Created signature request: ${result.insertedId}`);

        return NextResponse.json({
            success: true,
            id: result.insertedId.toString(),
            token // Confirm token
        });

    } catch (error: any) {
        console.error('❌ [SignRequest POST] Failed to create signature request:', error);
        return NextResponse.json({ success: false, error: error.message }, { status: 500 });
    }
}
