import { describe, it, expect } from 'vitest';
import * as crypto from 'crypto';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { buildAltNames, ensureCert } from './certManager';

describe('certManager', () => {
  it('buildAltNames : localhost, loopback et IPv4 externes uniquement', () => {
    const names = buildAltNames({
      lo: [{ family: 'IPv4', address: '127.0.0.1', internal: true } as os.NetworkInterfaceInfo],
      eth0: [
        { family: 'IPv4', address: '192.168.1.20', internal: false } as os.NetworkInterfaceInfo,
        { family: 'IPv6', address: 'fe80::1', internal: false } as os.NetworkInterfaceInfo,
      ],
    });
    expect(names).toEqual([
      { type: 2, value: 'localhost' },
      { type: 7, ip: '127.0.0.1' },
      { type: 7, ip: '192.168.1.20' },
    ]);
  });

  it('ensureCert génère un certificat avec SAN réels, puis le réutilise', async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'bp-cert-'));
    try {
      const first = await ensureCert(dir);
      const x509 = new crypto.X509Certificate(first.cert);
      expect(x509.subjectAltName).toContain('DNS:localhost');
      expect(x509.subjectAltName).toContain('IP Address:127.0.0.1');
      expect(x509.subjectAltName).not.toContain('0.0.0.0');
      expect(first.fingerprint).toBe(x509.fingerprint256);

      const second = await ensureCert(dir);
      expect(second.fingerprint).toBe(first.fingerprint);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  }, 30_000);
});
