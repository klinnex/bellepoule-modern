import { describe, it, expect } from 'vitest';
import { generateRefereeCommentsHTML } from './refereeCommentsPdf';
import type { Referee, RefereeComment } from '../../types';

const ref = (id: string, lastName: string) =>
  ({ id, lastName, firstName: 'X' }) as unknown as Referee;
const comment = (refereeId: string, text: string): RefereeComment => ({
  id: text,
  competitionId: 'c',
  refereeId,
  author: 'Formateur',
  comment: text,
  matchLabel: 'Piste 1',
  createdAt: '2026-10-06T10:00:00.000Z',
});

describe('generateRefereeCommentsHTML (#989)', () => {
  it('une page par arbitre commenté, textes échappés', () => {
    const html = generateRefereeCommentsHTML(
      [ref('a', 'ALPHA'), ref('b', 'BRAVO'), ref('c', 'CHARLIE')],
      [comment('a', 'Bon placement'), comment('c', '<script>x</script>')],
      'Open'
    );
    expect(html.match(/<section class="page">/g)).toHaveLength(2);
    expect(html).toContain('ALPHA');
    expect(html).not.toContain('BRAVO');
    expect(html).not.toContain('<script>x');
    expect(html).toContain('&lt;script&gt;');
  });

  it('message si aucun commentaire', () => {
    expect(generateRefereeCommentsHTML([ref('a', 'ALPHA')], [])).toContain('Aucun commentaire');
  });
});
