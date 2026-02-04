import { MongoClient } from 'mongodb';

if (!process.env.MONGODB_URI) {
    throw new Error('Invalid/Missing environment variable: "MONGODB_URI"');
}

const uri = process.env.MONGODB_URI;
const options = {};

let client;
let clientPromise: Promise<MongoClient>;

if (process.env.NODE_ENV === 'development') {
    // In development mode, use a global variable so that the value
    // is preserved across module reloads caused by HMR (Hot Module Replacement).
    let globalWithMongo = global as typeof globalThis & {
        _mongoClientPromise?: Promise<MongoClient>;
    };

    client = new MongoClient(uri, options);
    clientPromise = client.connect()
        .then(c => {
            console.log("✅ [MongoDB] Connected successfully");
            return c;
        })
        .catch(err => {
            console.error("❌ [MongoDB] Connection failed:", err);
            throw err;
        });
} else {
    // In production mode, it's best to not use a global variable.
    client = new MongoClient(uri, options);
    clientPromise = client.connect()
        .then(c => {
            console.log("✅ [MongoDB] Connected successfully");
            return c;
        })
        .catch(err => {
            console.error("❌ [MongoDB] Connection failed:", err);
            throw err;
        });
}

// Export a module-scoped MongoClient promise. By doing this in a
// separate module, the client can be shared across functions.
export default clientPromise;

export async function connectToDatabase() {
    const client = await clientPromise;
    const db = client.db(); // Uses default DB from URI
    return { db, client };
}
