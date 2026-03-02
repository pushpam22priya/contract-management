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
                { projection: { pdf: 1, signedPdfBase64: 1, title: 1, _id: 1 } }
            );
        } catch (e) {
            return new NextResponse('Invalid contract ID', { status: 400 });
        }

        if (!contract) {
            return new NextResponse('Document not found', { status: 404 });
        }

        // Determine PDF data (binary preferred, fallback to base64)
        let pdfData = null;
        if (contract.pdf) {
            pdfData = contract.pdf.buffer || contract.pdf;
        } else if (contract.signedPdfBase64) {
            try {
                const buffer = Buffer.from(contract.signedPdfBase64, 'base64');
                pdfData = buffer;
                console.log(`🔄 [DownloadAPI] Fallback: Serving from signedPdfBase64 (${buffer.length} bytes)`);
            } catch (e) {
                console.warn('⚠️ [DownloadAPI] Failed to decode signedPdfBase64 fallback:', e);
            }
        }

        if (!pdfData) {
            return new NextResponse('No PDF data found for this document', { status: 404 });
        }
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
