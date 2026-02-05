/**
 * API Route: GET /api/sign-requests/[token]/file
 *
 * Fetches the PDF binary for signing.
 * Also supports backward compatibility with old signature_requests collection.
 * Used by the public signing page to load the document.
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
        console.log(`📋 [SignRequest FILE] Fetching PDF for token: ${token}`);

        const { db } = await connectToDatabase();

        // First, try to find contract by signing token (new approach)
        let contract = await db.collection('contracts').findOne(
            { externalSigningToken: token },
            { projection: { pdf: 1, signingRequest: 1, _id: 1 } }
        );

        console.log(`   Contract found by token: ${!!contract}, has pdf: ${!!(contract?.pdf)}`);

        if (contract && contract.pdf) {
            console.log(`✅ [SignRequest FILE] Found contract with new approach: ${contract._id}`);
            try {
                // @ts-ignore - MongoDB returns Buffer with .buffer property
                const buffer = contract.pdf.buffer || contract.pdf;
                console.log(`   Buffer size: ${buffer.length}`);

                return new NextResponse(buffer, {
                    headers: {
                        'Content-Type': 'application/pdf',
                        'Content-Disposition': 'inline',
                        'Content-Length': buffer.length.toString(),
                        'Cache-Control': 'no-store, no-cache'
                    }
                });
            } catch (bufferErr: any) {
                console.error(`❌ [SignRequest FILE] Error processing buffer:`, bufferErr);
                return new NextResponse(`Buffer error: ${bufferErr.message}`, { status: 500 });
            }
        }

        // BACKWARD COMPATIBILITY: Check old signature_requests collection
        console.log(`⚠️ [SignRequest FILE] Contract not found with token or no PDF, checking legacy...`);

        const legacyRequest = await db.collection('signature_requests').findOne({ token });

        if (!legacyRequest) {
            console.log(`❌ [SignRequest FILE] No legacy request found with token: ${token}`);
            return new NextResponse('Invalid token', { status: 403 });
        }

        console.log(`   Legacy request found, contractId: ${legacyRequest.contractId}`);

        // Validate contractId
        let contractObjectId: ObjectId;
        try {
            contractObjectId = new ObjectId(legacyRequest.contractId);
        } catch (e) {
            console.error(`❌ [SignRequest FILE] Invalid contractId: ${legacyRequest.contractId}`);
            return new NextResponse('Invalid contract ID', { status: 400 });
        }

        // Get contract from legacy request
        const legacyContract = await db.collection('contracts').findOne(
            { _id: contractObjectId },
            { projection: { pdf: 1, _id: 1 } }
        );

        console.log(`   Legacy contract found: ${!!legacyContract}, has pdf: ${!!(legacyContract?.pdf)}`);

        if (!legacyContract) {
            console.log(`❌ [SignRequest FILE] Contract not found for legacy request`);
            return new NextResponse('Contract not found', { status: 404 });
        }

        if (!legacyContract.pdf) {
            console.log(`❌ [SignRequest FILE] Contract has no PDF binary`);
            return new NextResponse('Contract binary not found', { status: 404 });
        }

        console.log(`✅ [SignRequest FILE] Found contract via legacy request: ${legacyContract._id}`);

        try {
            // @ts-ignore - MongoDB returns Buffer with .buffer property
            const buffer = legacyContract.pdf.buffer || legacyContract.pdf;
            console.log(`   Buffer size: ${buffer.length}`);

            return new NextResponse(buffer, {
                headers: {
                    'Content-Type': 'application/pdf',
                    'Content-Disposition': 'inline',
                    'Content-Length': buffer.length.toString(),
                    'Cache-Control': 'no-store, no-cache'
                }
            });
        } catch (bufferErr: any) {
            console.error(`❌ [SignRequest FILE] Error processing legacy buffer:`, bufferErr);
            return new NextResponse(`Buffer error: ${bufferErr.message}`, { status: 500 });
        }

    } catch (error: any) {
        console.error('❌ [SignRequest FILE] Error:', error);
        return new NextResponse(`Internal Server Error: ${error.message}`, { status: 500 });
    }
}
