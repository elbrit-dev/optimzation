// scripts/import-storage-to-firestore.mjs
//
// Standalone one-shot importer — NOT wired into the Next.js app.
// Reads the JSON files from Firebase Storage (folder "Test") and writes each
// one as a document into the Firestore "test" collection.
//
// It only uses the Firebase Web SDK config from .env for the connection.
//
// Usage (from the project root):
//   node scripts/import-storage-to-firestore.mjs            # do the import
//   node scripts/import-storage-to-firestore.mjs --dry-run  # list only, no writes
//
// If your Storage / Firestore security rules require sign-in, set FB_EMAIL and
// FB_PASSWORD in .env and uncomment the sign-in block in main().

import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { config as loadEnv } from "dotenv";

import { initializeApp } from "firebase/app";
import { initializeFirestore, doc, setDoc, serverTimestamp } from "firebase/firestore";
import { getStorage, ref, listAll, getDownloadURL, getMetadata } from "firebase/storage";
// import { getAuth, signInWithEmailAndPassword } from "firebase/auth"; // see main()

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------
const __dirname = dirname(fileURLToPath(import.meta.url));
loadEnv({ path: resolve(__dirname, "..", ".env") });

const STORAGE_FOLDER    = "Test";                        // folder inside the bucket
const TARGET_COLLECTION = "test";                        // Firestore collection to fill
const FIRESTORE_DATABASE = "elbrit";                     // named DB (NOT "(default)") — matches the app
const STORAGE_BUCKET    = "elbrit-sso.firebasestorage.app"; // where the files actually live
const DRY_RUN           = process.argv.includes("--dry-run");

// Web SDK config, pulled straight from .env. Bucket is overridden because the
// .env value (…appspot.com) is stale and points at a different bucket.
const firebaseConfig = {
  apiKey:            process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain:        process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId:         process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket:     STORAGE_BUCKET,
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId:             process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
};

const app = initializeApp(firebaseConfig);
// Long polling avoids the gRPC "client is offline" errors this project hits in
// constrained networks (same reason lib/firebase.js uses it).
const db = initializeFirestore(app, { experimentalForceLongPolling: true }, FIRESTORE_DATABASE);
const storage = getStorage(app, `gs://${STORAGE_BUCKET}`);

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

// Turn a storage file name into a safe Firestore document id.
function docIdFromName(name) {
  return name.replace(/\.[^.]+$/, "").replace(/[\/.]/g, "_");
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------
async function main() {
  // If your rules require auth, set FB_EMAIL / FB_PASSWORD in .env and uncomment:
  // await signInWithEmailAndPassword(getAuth(app), process.env.FB_EMAIL, process.env.FB_PASSWORD);

  console.log(`Project : ${firebaseConfig.projectId}`);
  console.log(`Database: ${FIRESTORE_DATABASE}`);
  console.log(`Bucket  : gs://${STORAGE_BUCKET}/${STORAGE_FOLDER}`);
  console.log(`Mode    : ${DRY_RUN ? "DRY RUN (no writes)" : "IMPORT"}\n`);

  const { items } = await listAll(ref(storage, STORAGE_FOLDER));
  console.log(`Found ${items.length} file(s).\n`);

  let imported = 0, skipped = 0, failed = 0;

  for (const item of items) {
    const name = item.name;

    if (!name.toLowerCase().endsWith(".json")) {
      console.log(`- skip (not json): ${name}`);
      skipped++;
      continue;
    }

    try {
      // Download via the tokenized URL + fetch — the most reliable path in Node.
      const url = await getDownloadURL(item);
      const meta = await getMetadata(item).catch(() => null);
      const text = await (await fetch(url)).text();

      let parsed;
      try {
        parsed = JSON.parse(text);
      } catch (e) {
        console.log(`- skip (invalid json): ${name} — ${e.message}`);
        skipped++;
        continue;
      }

      // Firestore fields can't be a top-level array, so wrap arrays under "data".
      const payload = Array.isArray(parsed) ? { data: parsed } : parsed;
      const id = docIdFromName(name);
      const base = {
        _source: `${STORAGE_FOLDER}/${name}`,
        _sizeBytes: meta?.size ?? text.length,
        _importedAt: serverTimestamp(),
      };

      if (DRY_RUN) {
        console.log(`- would write ${TARGET_COLLECTION}/${id}  (${text.length} bytes)`);
        imported++;
        continue;
      }

      try {
        await setDoc(doc(db, TARGET_COLLECTION, id), { ...payload, ...base });
      } catch (writeErr) {
        // Fallback: Firestore rejects nested arrays (array-of-array). Store the
        // raw JSON string so the import still succeeds and nothing is lost.
        console.log(`  (nested/invalid data for ${name}, storing raw string — ${writeErr.message})`);
        await setDoc(doc(db, TARGET_COLLECTION, id), { _raw: text, ...base });
      }
      console.log(`- wrote ${TARGET_COLLECTION}/${id}`);
      imported++;
    } catch (err) {
      console.error(`- FAILED ${name}: ${err.message}`);
      failed++;
    }
  }

  console.log(`\nDone.${DRY_RUN ? " (dry run)" : ""}  imported=${imported}  skipped=${skipped}  failed=${failed}`);
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error("\nImport failed:", err);
    process.exit(1);
  });
