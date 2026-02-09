import { NextResponse } from 'next/server';
import clientPromise from '@/lib/db';
 
const ADMIN_EMAIL = 'admin@demo.com';
 
/**
* GET /api/users - Get all registered users (without passwords)
*/
export async function GET() {
    try {
        const client = await clientPromise;
        const db = client.db();
 
        const users = await db.collection('users')
            .find({})
            .project({ password: 0 })
            .sort({ createdAt: -1 })
            .toArray();
 
        const mappedUsers = users.map(u => ({
            ...u,
            id: u._id.toString(),
            _id: undefined,
        }));
 
        return NextResponse.json(mappedUsers);
    } catch (e) {
        console.error('Failed to fetch users:', e);
        return NextResponse.json({ error: 'Failed to fetch users' }, { status: 500 });
    }
}
 
/**
* POST /api/users - Login or Register
* If user exists, validate password. If not, create new user.
*/
export async function POST(request: Request) {
    try {
        const client = await clientPromise;
        const db = client.db();
        const { email, password, action } = await request.json();
 
        if (!email || !password) {
            return NextResponse.json(
                { success: false, message: 'Email and password are required' },
                { status: 400 }
            );
        }
 
        // Email validation
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!emailRegex.test(email)) {
            return NextResponse.json(
                { success: false, message: 'Please enter a valid email address' },
                { status: 400 }
            );
        }
 
        // Password validation (minimum 4 characters for demo purposes)
        if (password.length < 4) {
            return NextResponse.json(
                { success: false, message: 'Password must be at least 4 characters long' },
                { status: 400 }
            );
        }
 
        const usersCollection = db.collection('users');
 
        // Check if user already exists (case-insensitive)
        const existingUser = await usersCollection.findOne({
            email: { $regex: new RegExp(`^${email.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i') }
        });
 
        if (existingUser) {
            // Login: validate password
            if (existingUser.password !== password) {
                return NextResponse.json(
                    { success: false, message: 'Incorrect password. Please try again.' },
                    { status: 401 }
                );
            }
 
            // Update last login
            await usersCollection.updateOne(
                { _id: existingUser._id },
                { $set: { lastLogin: new Date().toISOString() } }
            );
 
            const isAdmin = email.toLowerCase() === ADMIN_EMAIL.toLowerCase();
 
            return NextResponse.json({
                success: true,
                message: 'Welcome back! Login successful.',
                user: {
                    id: existingUser._id.toString(),
                    email: existingUser.email,
                    lastLogin: new Date().toISOString(),
                    isAdmin,
                },
            });
        } else {
            // Register: create new user
            const newUser = {
                email,
                password,
                createdAt: new Date().toISOString(),
                lastLogin: new Date().toISOString(),
            };
 
            const result = await usersCollection.insertOne(newUser);
            const isAdmin = email.toLowerCase() === ADMIN_EMAIL.toLowerCase();
 
            return NextResponse.json({
                success: true,
                message: 'Account created successfully! Welcome aboard.',
                user: {
                    id: result.insertedId.toString(),
                    email,
                    lastLogin: newUser.lastLogin,
                    isAdmin,
                },
            });
        }
    } catch (e) {
        console.error('Failed to process user request:', e);
        return NextResponse.json(
            { success: false, message: 'An unexpected error occurred' },
            { status: 500 }
        );
    }
}