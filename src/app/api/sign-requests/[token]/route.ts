/**
 * API Route: GET /api/sign-requests/[token]
 *
 * Fetches signing request data from the contract document.
 * Also supports backward compatibility with old signature_requests collection.
 * Used by the public signing page to load contract details.
 */

import { NextResponse } from 'next/server';
import { connectToDatabase } from '@/lib/db';
import { ObjectId } from 'mongodb';

export async function GET(
    _request: Request,
    { params }: { params: Promise<{ token: string }> }
) {
    try {
        const { token } = await params;
        console.log(`📋 [SignRequest GET] Looking up token: ${token}`);

        const { db } = await connectToDatabase();

        // First, try to find contract by signing token (new approach)
        let contract = await db.collection('contracts').findOne(
            { externalSigningToken: token },
            {
                projection: {
                    pdf: 0  // Exclude binary PDF from this response
                }
            }
        );

        // If contract has embedded signingRequest, use it
        if (contract && contract.signingRequest) {
            console.log(`✅ [SignRequest GET] Found contract with embedded signingRequest: ${contract._id}`);

            const responseData = {
                // From signingRequest
                token: contract.signingRequest.token,
                status: contract.signingRequest.status,
                signerEmail: contract.signingRequest.signerEmail,
                signerName: contract.signingRequest.signerName,
                createdBy: contract.createdBy,
                createdByName: contract.signingRequest.senderName,
                createdAt: contract.signingRequest.createdAt,
                expiresAt: contract.signingRequest.expiresAt,
                signedAt: contract.signingRequest.signedAt,
                events: contract.signingRequest.events,

                // From contract
                contractId: contract._id.toString(),
                contractTitle: contract.title,
                contractDescription: contract.description,
                templateId: contract.templateId,
                hasFormFields: contract.hasFormFields,
                formFields: contract.formFields,
                fieldValues: contract.fieldValues,
                xfdfData: contract.xfdfData,
            };

            return NextResponse.json({
                success: true,
                data: responseData
            });
        }

        // BACKWARD COMPATIBILITY: Check old signature_requests collection
        console.log(`⚠️ [SignRequest GET] Contract not found with embedded signingRequest, checking legacy collection...`);

        const legacyRequest = await db.collection('signature_requests').findOne({ token });

        if (!legacyRequest) {
            console.log(`❌ [SignRequest GET] No request found with token: ${token}`);
            return NextResponse.json({ success: false, error: 'Request not found' }, { status: 404 });
        }

        console.log(`✅ [SignRequest GET] Found legacy signature request for contract: ${legacyRequest.contractId}`);

        // Fetch the contract for additional data
        let legacyContract = null;
        try {
            legacyContract = await db.collection('contracts').findOne(
                { _id: new ObjectId(legacyRequest.contractId) },
                { projection: { pdf: 0 } }
            );
        } catch (e) {
            console.warn(`⚠️ [SignRequest GET] Could not fetch contract for legacy request`);
        }

        // Return data in expected format (combining legacy request with contract data)
        const responseData = {
            ...legacyRequest,
            id: legacyRequest._id.toString(),
            _id: undefined,
            // Override with contract data if available
            ...(legacyContract && {
                contractTitle: legacyContract.title || legacyRequest.contractTitle,
                contractDescription: legacyContract.description || legacyRequest.contractDescription,
                formFields: legacyContract.formFields || legacyRequest.formFields,
                fieldValues: legacyContract.fieldValues || legacyRequest.fieldValues,
                xfdfData: legacyContract.xfdfData || legacyRequest.xfdfData,
                hasFormFields: legacyContract.hasFormFields ?? legacyRequest.hasFormFields,
            })
        };

        return NextResponse.json({
            success: true,
            data: responseData
        });

    } catch (error: any) {
        console.error('❌ [SignRequest GET] Error:', error);
        return NextResponse.json({ success: false, error: error.message }, { status: 500 });
    }
}
