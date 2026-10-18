import { MongoClient } from "mongodb";

const DB_NAME = "agent-inv";
const COLLECTION = "investigations";

let clientPromise = null;

// Default matches the mongo service in compose.yml. Override with MONGODB_URI (e.g. Atlas) if you want.
export function mongoUri() {
  return process.env.MONGODB_URI || "mongodb://mongo:27017";
}

function getClient() {
  if (!clientPromise) {
    const client = new MongoClient(mongoUri(), { serverSelectionTimeoutMS: 3000 });
    clientPromise = client.connect().catch((err) => {
      clientPromise = null; // allow retry on the next call
      throw err;
    });
  }
  return clientPromise;
}

async function col() {
  const client = await getClient();
  const c = client.db(DB_NAME).collection(COLLECTION);
  await c.createIndex({ createdAt: -1 });
  return c;
}

// Never throws: the caller gets { ok:false, error } and the UI shows it.
export async function saveInvestigation(doc) {
  try {
    const result = await (await col()).insertOne(doc);
    return { ok: true, id: String(result.insertedId) };
  } catch (error) {
    console.error("❌ Failed to save investigation:", error.message);
    return { ok: false, error: error.message };
  }
}

export async function listInvestigations(limit = 20) {
  const items = await (await col())
    .find({}, { projection: { toolResults: 0, reportEn: 0 } })
    .sort({ createdAt: -1 })
    .limit(limit)
    .toArray();
  return items.map((d) => ({ ...d, _id: String(d._id) }));
}

export async function pingDb() {
  const started = Date.now();
  try {
    const client = await getClient();
    await client.db(DB_NAME).command({ ping: 1 });
    return { ok: true, ms: Date.now() - started };
  } catch (error) {
    return { ok: false, error: error.message };
  }
}
