import { describe, it, expect } from 'vitest';
import {
  expandPageRanges,
  findAdvisedScale,
  isPoolSheetHtml,
  parseScale,
  sheetCount,
  withAdvisedStyle,
} from './printSettings';

describe('impression : plages, échelle, mise à l’échelle conseillée (#1826)', () => {
  it('expandPageRanges', () => {
    expect(expandPageRanges('', 5)).toEqual([]);
    expect(expandPageRanges('2-3, 1, 3', 5)).toEqual([1, 2, 3]);
    expect(expandPageRanges('4-9', 5)).toEqual([4, 5]);
    expect(expandPageRanges('x', 5)).toEqual([]);
  });

  it('parseScale', () => {
    expect(parseScale('')).toBeUndefined();
    expect(parseScale('abc')).toBeUndefined();
    expect(parseScale('85')).toBe(85);
    expect(parseScale('5')).toBe(10);
    expect(parseScale('500')).toBe(200);
  });

  it('feuilles de poule et style conseillé', () => {
    const html =
      '<html><head></head><body><div class="match-grid"></div><div class="pools-export-break"></div></body></html>';
    expect(isPoolSheetHtml(html)).toBe(true);
    expect(isPoolSheetHtml('<p></p>')).toBe(false);
    expect(sheetCount(html)).toBe(2);
    expect(withAdvisedStyle(html).indexOf('data-print-advised')).toBeLessThan(
      withAdvisedStyle(html).indexOf('</head>')
    );
  });

  it('findAdvisedScale : plus grande échelle qui tient', async () => {
    // pages = 1 jusqu'à 70 %, 2 au-delà
    const count = async (s: number) => (s <= 70 ? 1 : 2);
    expect(await findAdvisedScale(count, 1)).toBe(70);
    expect(await findAdvisedScale(async () => 1, 1)).toBe(100);
    expect(await findAdvisedScale(async () => 9, 1)).toBe(30);
  });
});
