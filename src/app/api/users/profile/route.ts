import { NextResponse } from 'next/server';
import clientPromise from '@/lib/db';

/**
 * GET /api/users/profile?email=...
 * Returns the profile fields (name, department, organization) for a user
 */
export async function GET(request: Request) {
    try {
        const { searchParams } = new URL(request.url);
        const email = searchParams.get('email');

        if (!email) {
            return NextResponse.json({ error: 'email is required' }, { status: 400 });
        }

        const client = await clientPromise;
        const db = client.db();

        const user = await db.collection('users').findOne(
            { email: { $regex: new RegExp(`^${email.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i') } },
            { projection: { name: 1, department: 1, organization: 1, email: 1, _id: 0 } }
        );

        if (!user) {
            return NextResponse.json({ email, name: '', department: '', organization: '' });
        }

        return NextResponse.json({
            email: user.email,
            name: user.name || '',
            department: user.department || '',
            organization: user.organization || '',
        });
    } catch (e) {
        console.error('Failed to fetch user profile:', e);
        return NextResponse.json({ error: 'Failed to fetch profile' }, { status: 500 });
    }
}

/**
 * PATCH /api/users/profile
 * Updates profile fields (name, department, organization) for a user
 */
export async function PATCH(request: Request) {
    try {
        const { email, name, department, organization } = await request.json();

        if (!email) {
            return NextResponse.json(
                { success: false, message: 'email is required' },
                { status: 400 }
            );
        }

        const client = await clientPromise;
        const db = client.db();

        const result = await db.collection('users').updateOne(
            { email: { $regex: new RegExp(`^${email.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i') } },
            {
                $set: {
                    name: name?.trim() || '',
                    department: department?.trim() || '',
                    organization: organization?.trim() || '',
                    profileUpdatedAt: new Date().toISOString(),
                },
            }
        );

        if (result.matchedCount === 0) {
            return NextResponse.json(
                { success: false, message: 'User not found' },
                { status: 404 }
            );
        }

        return NextResponse.json({
            success: true,
            message: 'Profile updated successfully',
            profile: {
                name: name?.trim() || '',
                department: department?.trim() || '',
                organization: organization?.trim() || '',
            },
        });
    } catch (e) {
        console.error('Failed to update user profile:', e);
        return NextResponse.json(
            { success: false, message: 'Failed to update profile' },
            { status: 500 }
        );
    }
}
