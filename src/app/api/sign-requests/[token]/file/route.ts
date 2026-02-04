
import { NextResponse } from 'next/server';
import { connectToDatabase } from '@/lib/db';
import { ObjectId } from 'mongodb';

export async function GET(
    request: Request,
    { params }: { params: Promise<{ token: string }> }
) {
    try {
        const { token } = await params;
        const { db } = await connectToDatabase();

        // 1. Verify Token
        const signRequest = await db.collection('signature_requests').findOne({ token });
        if (!signRequest) {
            return new NextResponse('Invalid token', { status: 403 });
        }

        // 2. Fetch Contract Binary
        const contract = await db.collection('contracts').findOne(
            { _id: new ObjectId(signRequest.contractId) },
            { projection: { pdf: 1 } }
        );

        if (!contract || !contract.pdf) {
            return new NextResponse('Contract binary not found', { status: 404 });
        }

        // @ts-ignore
        const buffer = contract.pdf.buffer || contract.pdf;

        // 3. Stream Binary
        return new NextResponse(buffer, {
            headers: {
                'Content-Type': 'application/pdf',
                'Content-Disposition': 'inline',
                'Content-Length': buffer.length.toString(),
                'Cache-Control': 'no-store, no-cache'
            }
        });

    } catch (error: any) {
        console.error('File fetch error:', error);
        return new NextResponse('Internal Server Error', { status: 500 });
    }
}
