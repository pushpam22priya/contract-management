
import { NextResponse } from 'next/server';
import { connectToDatabase } from '@/lib/db';

export async function GET(
    request: Request,
    { params }: { params: Promise<{ token: string }> }
) {
    try {
        const { token } = await params;
        const { db } = await connectToDatabase();

        const requestData = await db.collection('signature_requests').findOne({ token });

        if (!requestData) {
            return NextResponse.json({ success: false, error: 'Request not found' }, { status: 404 });
        }

        // Return request data including status, but NOT binary
        // Binary is fetched via /file sub-route
        return NextResponse.json({
            success: true,
            data: {
                ...requestData,
                id: requestData._id.toString(),
                _id: undefined
            }
        });

    } catch (error: any) {
        return NextResponse.json({ success: false, error: error.message }, { status: 500 });
    }
}
