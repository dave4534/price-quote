// Persistence. Production: a private Vercel Blob store. Local development: ./.data on disk.
// The whole record set is one JSON document, written with an ETag check so that
// two concurrent writers (e.g. a customer signing while the owner edits) never
// silently overwrite each other.
import {mkdir, readFile, writeFile, unlink} from 'node:fs/promises';
import path from 'node:path';

const useBlob = Boolean(process.env.BLOB_READ_WRITE_TOKEN || process.env.BLOB_STORE_ID);
const dataDir = process.env.DATA_DIR || path.join(process.cwd(), '.data');
const DB_PATH = 'db.json';

const emptyDb = () => ({settings: {}, contacts: [], templates: [], quotes: [], documents: [], cards: []});

if (process.env.VERCEL && !useBlob) console.error('No Blob store is connected; data cannot be persisted.');

async function blobSdk() {
  return import('@vercel/blob');
}

async function readDbWithTag() {
  if (!useBlob) {
    try {
      return {db: {...emptyDb(), ...JSON.parse(await readFile(path.join(dataDir, DB_PATH), 'utf8'))}};
    } catch (error) {
      if (error.code === 'ENOENT') return {db: emptyDb()};
      throw error;
    }
  }
  const {get} = await blobSdk();
  const result = await get(DB_PATH, {access: 'private', useCache: false});
  if (!result) return {db: emptyDb()};
  const text = await new Response(result.stream).text();
  // Compressed reads report a weak ETag (W/"..."); conditional writes only match the strong form.
  return {db: {...emptyDb(), ...JSON.parse(text)}, etag: result.blob.etag.replace(/^W\//, "")};
}

export async function readDb() {
  return (await readDbWithTag()).db;
}

let localQueue = Promise.resolve();

/** Apply `change(db)` and persist. Returns whatever `change` returns. */
export async function mutate(change) {
  if (!useBlob) {
    if (process.env.VERCEL) throw Object.assign(new Error('Storage is not configured'), {status: 503});
    const run = localQueue.then(async () => {
      const {db} = await readDbWithTag();
      const result = await change(db);
      await mkdir(dataDir, {recursive: true});
      await writeFile(path.join(dataDir, DB_PATH), JSON.stringify(db));
      return result;
    });
    localQueue = run.catch(() => {});
    return run;
  }
  const {put, BlobPreconditionFailedError} = await blobSdk();
  for (let attempt = 0; attempt < 10; attempt += 1) {
    const {db, etag} = await readDbWithTag();
    const result = await change(db);
    try {
      await put(DB_PATH, JSON.stringify(db), {
        access: 'private',
        contentType: 'application/json',
        addRandomSuffix: false,
        cacheControlMaxAge: 60,
        ...(etag ? {ifMatch: etag} : {allowOverwrite: false}),
      });
      return result;
    } catch (error) {
      const raced = error instanceof BlobPreconditionFailedError || /already exists|precondition/i.test(error.message);
      if (!raced) throw error;
      console.warn(`Write conflict on attempt ${attempt + 1}`);
      await new Promise((resolve) => setTimeout(resolve, Math.min(2000, 100 * 2 ** attempt) * (0.5 + Math.random())));
    }
  }
  throw Object.assign(new Error('The data changed while saving. Try again.'), {status: 409});
}

export async function putFile(id, buffer, contentType) {
  if (useBlob) {
    const {put} = await blobSdk();
    await put(`files/${id}`, buffer, {access: 'private', contentType, addRandomSuffix: false});
    return;
  }
  await mkdir(path.join(dataDir, 'files'), {recursive: true});
  await writeFile(path.join(dataDir, 'files', id), buffer);
  await writeFile(path.join(dataDir, 'files', `${id}.type`), contentType);
}

export async function getFile(id) {
  if (!id || !/^[\w-]+$/.test(id)) return null;
  if (useBlob) {
    const {get} = await blobSdk();
    const result = await get(`files/${id}`, {access: 'private'});
    if (!result) return null;
    return {buffer: Buffer.from(await new Response(result.stream).arrayBuffer()), contentType: result.blob.contentType};
  }
  try {
    return {
      buffer: await readFile(path.join(dataDir, 'files', id)),
      contentType: await readFile(path.join(dataDir, 'files', `${id}.type`), 'utf8'),
    };
  } catch (error) {
    if (error.code === 'ENOENT') return null;
    throw error;
  }
}

export async function removeFile(id) {
  if (!id || !/^[\w-]+$/.test(id)) return;
  if (useBlob) {
    const {del} = await blobSdk();
    await del(`files/${id}`);
    return;
  }
  await unlink(path.join(dataDir, 'files', id)).catch(() => {});
}
