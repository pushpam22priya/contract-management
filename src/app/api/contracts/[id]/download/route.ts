/**
 * API Route: GET /api/contracts/[id]/download
 *
 * Downloads the finalized contract PDF as an attachment.
 * No authentication required — used by external signers via email links.
 */

import { NextResponse } from 'next/server';
import { connectToDatabase } from '@/lib/db';
import { ObjectId } from 'mongodb';

export async function GET(
    _request: Request,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const { id } = await params;
        const { db } = await connectToDatabase();

        let contract;
        try {
            contract = await db.collection('contracts').findOne(
                { _id: new ObjectId(id) },
                { projection: { pdf: 1, title: 1, _id: 1 } }
            );
        } catch (e) {
            return new NextResponse('Invalid contract ID', { status: 400 });
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

        const fileName = `${contract.title || 'contract'}.pdf`;

        return new NextResponse(uint8, {
            headers: {
                'Content-Type': 'application/pdf',
                'Content-Disposition': `attachment; filename="${fileName}"`,
                'Content-Length': uint8.length.toString(),
                'Cache-Control': 'no-store, no-cache',
            }
        });

    } catch (error: any) {
        console.error('Contract download error:', error);
        return new NextResponse('Internal Server Error', { status: 500 });
    }
}
