/** Lossless portable seed input. Runtime stores still use ordinary JSON. */
import {readFile,realpath} from 'node:fs/promises';
import {dirname,join,resolve,sep} from 'node:path';
import {gunzipSync} from 'node:zlib';
import {createHash} from 'node:crypto';
export async function readDemoSeedBytes(file) {
  const bytes=await readFile(file);
  const input=JSON.parse(bytes);
  if(input.format!=='compass-seed-gzip-v1') return bytes;
  if(!/^[A-Za-z0-9_-]+(?:\.[A-Za-z0-9_-]+)*\.json\.gz$/.test(input.file) || !Number.isInteger(input.bytes) || input.bytes<=0 || input.bytes>128_000_000 || !/^[a-f0-9]{64}$/.test(input.sha256)) throw new Error('Invalid compressed seed manifest');
  const root=await realpath(dirname(resolve(file))), target=await realpath(join(root,input.file));
  if(!target.startsWith(`${root}${sep}`))throw new Error('Seed payload must remain inside its seed directory');
  const decoded=gunzipSync(await readFile(target),{maxOutputLength:input.bytes});
  if(decoded.length!==input.bytes || createHash('sha256').update(decoded).digest('hex')!==input.sha256)throw new Error('Compressed seed checksum mismatch');
  return decoded;
}
export async function readDemoSeedState(file){return JSON.parse(await readDemoSeedBytes(file));}
