/**
 * BellePoule Modern - Archives .bpm chiffrées par mot de passe (RGPD, #1882)
 * Format : en-tête `BPMENC1\n`, longueur (uint32 BE) + en-tête JSON (kdf, sel, iv),
 * puis base SQLite chiffrée AES-256-GCM (étiquette de 16 octets en fin de fichier).
 * Clé dérivée du mot de passe par scrypt (N = 2^15, r = 8, p = 1).
 * Licensed under GPL-3.0
 */
import { createCipheriv, createDecipheriv, randomBytes, scrypt as scryptCb } from 'crypto';
import * as fs from 'fs';

const MAGIC = Buffer.from('BPMENC1\n', 'ascii');
const TAG_LEN = 16;
const KEY_LEN = 32;
const SCRYPT = { N: 1 << 15, r: 8, p: 1, maxmem: 64 * 1024 * 1024 };
/** Mot de passe minimal : 8 caractères */
export const MIN_BPM_PASSWORD = 8;

interface Header {
  kdf: 'scrypt';
  N: number;
  r: number;
  p: number;
  salt: string;
  iv: string;
}

function deriveKey(password: string, salt: Buffer, h: Pick<Header, 'N' | 'r' | 'p'>) {
  return new Promise<Buffer>((resolve, reject) =>
    scryptCb(
      password.normalize('NFC'),
      salt,
      KEY_LEN,
      { N: h.N, r: h.r, p: h.p, maxmem: SCRYPT.maxmem },
      (err, key) => (err ? reject(err) : resolve(key))
    )
  );
}

export function isEncryptedBpmBuffer(buf: Buffer): boolean {
  return buf.length >= MAGIC.length && buf.subarray(0, MAGIC.length).equals(MAGIC);
}

/** Lit les premiers octets : archive chiffrée ? */
export async function isEncryptedBpm(filepath: string): Promise<boolean> {
  const fh = await fs.promises.open(filepath, 'r');
  try {
    const buf = Buffer.alloc(MAGIC.length);
    const { bytesRead } = await fh.read(buf, 0, MAGIC.length, 0);
    return bytesRead === MAGIC.length && buf.equals(MAGIC);
  } finally {
    await fh.close();
  }
}

export async function encryptBpmBuffer(plain: Buffer, password: string): Promise<Buffer> {
  if (typeof password !== 'string' || password.length < MIN_BPM_PASSWORD) {
    throw new Error('password_too_short');
  }
  const salt = randomBytes(16);
  const iv = randomBytes(12);
  const key = await deriveKey(password, salt, SCRYPT);
  const header: Header = {
    kdf: 'scrypt',
    N: SCRYPT.N,
    r: SCRYPT.r,
    p: SCRYPT.p,
    salt: salt.toString('base64'),
    iv: iv.toString('base64'),
  };
  const headerBuf = Buffer.from(JSON.stringify(header), 'utf8');
  const len = Buffer.alloc(4);
  len.writeUInt32BE(headerBuf.length, 0);
  const cipher = createCipheriv('aes-256-gcm', key, iv);
  // En-tête authentifié : toute altération (kdf, sel) fait échouer le déchiffrement
  cipher.setAAD(Buffer.concat([MAGIC, len, headerBuf]));
  const body = Buffer.concat([cipher.update(plain), cipher.final()]);
  return Buffer.concat([MAGIC, len, headerBuf, body, cipher.getAuthTag()]);
}

/** Déchiffre ; lève `wrong_password` si le mot de passe est faux ou le fichier altéré */
export async function decryptBpmBuffer(data: Buffer, password: string): Promise<Buffer> {
  if (!isEncryptedBpmBuffer(data)) throw new Error('not_encrypted');
  const len = data.readUInt32BE(MAGIC.length);
  const start = MAGIC.length + 4;
  if (len > 4096 || start + len + TAG_LEN > data.length) throw new Error('corrupted');
  let header: Header;
  try {
    header = JSON.parse(data.subarray(start, start + len).toString('utf8'));
  } catch {
    throw new Error('corrupted');
  }
  if (
    header?.kdf !== 'scrypt' ||
    ![header.N, header.r, header.p].every(n => Number.isInteger(n) && n > 0) ||
    header.N > 1 << 20 ||
    header.r > 32 ||
    header.p > 16
  ) {
    throw new Error('corrupted');
  }
  const key = await deriveKey(password, Buffer.from(header.salt, 'base64'), header);
  const decipher = createDecipheriv('aes-256-gcm', key, Buffer.from(header.iv, 'base64'));
  decipher.setAAD(data.subarray(0, start + len));
  decipher.setAuthTag(data.subarray(data.length - TAG_LEN));
  try {
    return Buffer.concat([
      decipher.update(data.subarray(start + len, data.length - TAG_LEN)),
      decipher.final(),
    ]);
  } catch {
    throw new Error('wrong_password');
  }
}

/** Chiffre le fichier en place (écriture temporaire + renommage) */
export async function encryptBpmFile(filepath: string, password: string): Promise<void> {
  const plain = await fs.promises.readFile(filepath);
  const enc = await encryptBpmBuffer(plain, password);
  const tmp = `${filepath}.enc-tmp`;
  await fs.promises.writeFile(tmp, enc);
  await fs.promises.rename(tmp, filepath);
}

/**
 * Chiffre `src` (fichier SQLite en clair, sous userData) vers `dest` : le chemin choisi
 * par l'utilisateur ne reçoit jamais de copie en clair (dossier synchronisé, plantage, #1882).
 */
export async function encryptBpmFileTo(src: string, dest: string, password: string): Promise<void> {
  const enc = await encryptBpmBuffer(await fs.promises.readFile(src), password);
  const tmp = `${dest}.enc-tmp`;
  await fs.promises.writeFile(tmp, enc);
  await fs.promises.rename(tmp, dest);
}

/** Déchiffre `src` vers `dest` (fichier SQLite) */
export async function decryptBpmFile(src: string, dest: string, password: string): Promise<void> {
  const plain = await decryptBpmBuffer(await fs.promises.readFile(src), password);
  await fs.promises.writeFile(dest, plain);
}
