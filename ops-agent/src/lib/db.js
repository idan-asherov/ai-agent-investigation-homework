import { MongoClient } from "mongodb";

let client = null;
let clientPromise = null;

function getClientPromise() {
  const uri = process.env.MONGODB_URI;
  if (!uri) {
    console.warn("⚠️ MONGODB_URI is not set. Database persistence skipped.");
    return null;
  }

  if (!clientPromise) {
    client = new MongoClient(uri, { serverSelectionTimeoutMS: 3000 });
    clientPromise = client.connect();
  }
  return clientPromise;
}

export async function saveInvestigation(investigation) {
  try {
    const promise = getClientPromise();
    if (!promise) return;

    const connectedClient = await promise;
    const db = connectedClient.db("agent-inv");
    const collection = db.collection("investigations");

    const result = await collection.insertOne(investigation);
    console.log("✅ Investigation saved to MongoDB:", result.insertedId);
  } catch (error) {
    console.error("❌ Failed to save investigation:", error.message);
  }
}
