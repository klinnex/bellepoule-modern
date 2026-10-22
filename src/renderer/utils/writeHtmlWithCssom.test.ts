// @vitest-environment jsdom
import { describe, it, expect } from 'vitest';
import { writeHtmlWithCssom } from './writeHtmlWithCssom';

describe('writeHtmlWithCssom', () => {
  it('écrit le document et réapplique les attributs style par CSSOM', () => {
    const iframe = document.createElement('iframe');
    document.body.appendChild(iframe);
    const doc = iframe.contentDocument!;
    writeHtmlWithCssom(
      doc,
      '<html><head><style>.x{color:red}</style></head><body><p id="p" style="color: green; font-weight: 700">a</p></body></html>'
    );
    const p = doc.getElementById('p')!;
    expect(p.textContent).toBe('a');
    expect(p.style.color).toBe('green');
    expect(p.style.fontWeight).toBe('700');
  });
});
