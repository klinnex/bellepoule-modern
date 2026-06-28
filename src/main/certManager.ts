/**
 * BellePoule Modern - TLS Certificate Manager
 * Generates and persists a self-signed certificate for the HTTPS remote score server.
 * Licensed under GPL-3.0
 */

import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';
import selfsigned from 'selfsigned';

export interface CertBundle {
  cert: string;
  key: string;
  /** SHA-256 fingerprint in XX:XX:... format */
  fingerprint: string;
}

function computeFingerprint(certPem: string): string {
  const der = crypto
    .createHash('sha256')
    .update(
      Buffer.from(
        certPem
          .replace(/-----BEGIN CERTIFICATE-----|-----END CERTIFICATE-----|\n|\r/g, ''),
        'base64'
      )
    )
    .digest('hex')
    .toUpperCase();
  return der.match(/.{2}/g)!.join(':');
}

export async function ensureCert(userDataPath: string): Promise<CertBundle> {
  const certsDir = path.join(userDataPath, 'certs');
  const certPath = path.join(certsDir, 'server.pem');
  const keyPath = path.join(certsDir, 'server.key');

  if (fs.existsSync(certPath) && fs.existsSync(keyPath)) {
    const cert = fs.readFileSync(certPath, 'utf-8');
    const key = fs.readFileSync(keyPath, 'utf-8');
    return { cert, key, fingerprint: computeFingerprint(cert) };
  }

  fs.mkdirSync(certsDir, { recursive: true });

  const attrs = [{ name: 'commonName', value: 'BellePoule-LAN' }];
  const generated = selfsigned.generate(attrs, {
    days: 3650,
    keySize: 2048,
    algorithm: 'sha256',
    extensions: [
      { name: 'subjectAltName', altNames: [{ type: 7, ip: '0.0.0.0' }] },
    ],
  });

  fs.writeFileSync(certPath, generated.cert, { mode: 0o600 });
  fs.writeFileSync(keyPath, generated.private, { mode: 0o600 });

  return {
    cert: generated.cert,
    key: generated.private,
    fingerprint: computeFingerprint(generated.cert),
  };
}
