/**
 * API Route: GET /api/sign-requests/[token]
 *
 * Fetches signing request data from the contract document.
 * Also supports backward compatibility with old signature_requests collection.
 * Used by the public signing page to load contract details.
 *
 * Multi-party support: Returns assignedParty info so the signing page
 * can restrict editing to only the assigned party's fields.
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
                parties: contract.parties,  // ✅ Include parties for external signer validation
                // Multi-party fields (may not exist for legacy contracts)
                version: contract.version,
            };

            return NextResponse.json({
                success: true,
                data: responseData
            });
        }

        // MULTI-PARTY FLOW: Check signature_requests collection
        console.log(`🔍 [SignRequest GET] Checking signature_requests collection...`);

        const signatureRequest = await db.collection('signature_requests').findOne({ token });

        if (!signatureRequest) {
            console.log(`❌ [SignRequest GET] No request found with token: ${token}`);
            return NextResponse.json({ success: false, error: 'Request not found' }, { status: 404 });
        }

        console.log(`✅ [SignRequest GET] Found signature request for contract: ${signatureRequest.contractId}`);
        if (signatureRequest.assignedParty) {
            console.log(`🏷️ [SignRequest GET] Assigned party: ${signatureRequest.assignedParty} (${signatureRequest.assignedPartyLabel})`);
        }

        // Fetch the contract for additional data (always get latest version)
        let linkedContract = null;
        try {
            linkedContract = await db.collection('contracts').findOne(
                { _id: new ObjectId(signatureRequest.contractId) },
                { projection: { pdf: 0 } }
            );
        } catch (e) {
            console.warn(`⚠️ [SignRequest GET] Could not fetch contract for request`);
        }

        // Refresh contractVersion to the current contract version.
        // This prevents false 409 VERSION_MISMATCH errors caused by any contract
        // update (another signer, contractor edit, etc.) that happened after this
        // signing request was created. The file endpoint always serves the latest
        // PDF, so the signer is already working with the current version.
        const freshContractVersion = linkedContract?.version ?? signatureRequest.contractVersion;
        if (
            linkedContract &&
            linkedContract.version !== undefined &&
            linkedContract.version !== signatureRequest.contractVersion
        ) {
            try {
                await db.collection('signature_requests').updateOne(
                    { token },
                    { $set: { contractVersion: linkedContract.version } }
                );
                console.log(`🔄 [SignRequest GET] Refreshed contractVersion: ${signatureRequest.contractVersion} → ${linkedContract.version}`);
            } catch (versionSyncErr) {
                console.warn('⚠️ [SignRequest GET] Could not refresh contractVersion:', versionSyncErr);
            }
        }

        // Return data in expected format (combining request with contract data)
        const responseData: Record<string, any> = {
            ...signatureRequest,
            id: signatureRequest._id.toString(),
            _id: undefined,
            // Override with contract data if available (always use latest from contract)
            ...(linkedContract && {
                contractTitle: linkedContract.title || signatureRequest.contractTitle,
                contractDescription: linkedContract.description || signatureRequest.contractDescription,
                formFields: linkedContract.formFields || signatureRequest.formFields,
                fieldValues: linkedContract.fieldValues || signatureRequest.fieldValues,
                xfdfData: linkedContract.xfdfData || signatureRequest.xfdfData,
                hasFormFields: linkedContract.hasFormFields ?? signatureRequest.hasFormFields,
                parties: linkedContract.parties,
                // Multi-party fields
                version: linkedContract.version,
                signatureFlowStatus: linkedContract.signatureFlowStatus,
                externalSigners: linkedContract.externalSigners,
                partyCompletions: linkedContract.partyCompletions,
            }),
            // Always include party assignment from the request itself
            assignedParty: signatureRequest.assignedParty,
            assignedPartyLabel: signatureRequest.assignedPartyLabel,
            contractVersion: freshContractVersion,
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
