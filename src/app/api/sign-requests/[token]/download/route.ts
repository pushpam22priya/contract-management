/**
* API Route: GET /api/sign-requests/[token]/download
*
* Downloads the signed PDF as an attachment.
* Uses the same token-based lookup as the file route.
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
        const { db } = await connectToDatabase();
 
        // Try new approach: find contract by signing token
        let contract = await db.collection('contracts').findOne(
            { externalSigningToken: token },
            { projection: { pdf: 1, title: 1, _id: 1 } }
        );
 
        // Fallback: check legacy signature_requests collection
        if (!contract || !contract.pdf) {
            const legacyRequest = await db.collection('signature_requests').findOne({ token });
            if (legacyRequest) {
                try {
                    contract = await db.collection('contracts').findOne(
                        { _id: new ObjectId(legacyRequest.contractId) },
                        { projection: { pdf: 1, title: 1, _id: 1 } }
                    );
                } catch (e) { /* invalid ObjectId */ }
            }
        }
 
        if (!contract || !contract.pdf) {
            return new NextResponse('Document not found', { status: 404 });
        }
 
        // Handle MongoDB Binary type
        const pdfData = contract.pdf.buffer || contract.pdf;
        const uint8 = new Uint8Array(
            pdfData.buffer ? pdfData.buffer : pdfData,
            pdfData.byteOffset || 0,
            pdfData.byteLength || pdfData.length
        );
 
        const fileName = `${contract.title || 'signed_contract'}.pdf`;
 
        return new NextResponse(uint8, {
            headers: {
                'Content-Type': 'application/pdf',
                'Content-Disposition': `attachment; filename="${fileName}"`,
                'Content-Length': uint8.length.toString(),
                'Cache-Control': 'no-store, no-cache',
            }
        });
 
    } catch (error: any) {
        console.error('Download error:', error);
        return new NextResponse('Internal Server Error', { status: 500 });
    }
}