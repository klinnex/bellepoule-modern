// @vitest-environment jsdom
import { describe, it, expect } from 'vitest';
import type { ClubSession } from '../../types/club';
import { generateClubPlanHTML } from './clubPlanPdf';

const session = (extra: Partial<ClubSession> = {}): ClubSession => ({
  id: 's1',
  clubId: 'c1',
  date: '2026-11-20',
  label: 'Parades',
  stripCount: 2,
  status: 'planned',
  openedAt: '',
  attendeeIds: [],
  objectives: 'Parade de quarte\nDistance',
  plan: [
    { id: 'a', title: 'Échauffement', minutes: 15, details: 'Course\nÉtirements' },
    { id: 'b', title: 'Assauts <dirigés>', minutes: 30 },
  ],
  memberFeedback: {},
  createdAt: '',
  updatedAt: '',
  ...extra,
});
const parse = (html: string) => new DOMParser().parseFromString(html, 'text/html');
const PNG = 'data:image/png;base64,iVBORw0KGgo=';

describe('plan de cours PDF (#1872)', () => {
  it('en-tête, déroulé chronologique, durée totale, cases à cocher', () => {
    const doc = parse(
      generateClubPlanHTML(session(), { clubName: 'Cercle', logo: PNG, weaponLabel: 'Épée' })
    );
    expect(doc.querySelector('.plan-title')!.textContent).toBe('Parades');
    expect(doc.querySelector('.plan-club')!.textContent).toBe('Cercle');
    expect(doc.querySelector('.plan-logo')!.getAttribute('src')).toBe(PNG);
    expect(doc.querySelector('.plan-meta')!.textContent).toContain('Épée');
    expect(doc.querySelector('.plan-total b')!.textContent).toBe('45 min');
    const rows = doc.querySelectorAll('.plan-table tbody tr');
    expect(rows).toHaveLength(2);
    expect(rows[0].querySelector('.col-time')!.textContent).toBe('0:00 – 0:15');
    expect(rows[1].querySelector('.col-time')!.textContent).toBe('0:15 – 0:45');
    expect(rows[0].querySelectorAll('.ex-details br')).toHaveLength(1);
    expect(doc.querySelectorAll('.box')).toHaveLength(2);
    expect(doc.querySelector('.plan-box p br')).not.toBeNull();
  });

  it('heure de début : horaires réels', () => {
    const doc = parse(generateClubPlanHTML(session(), { clubName: '', startTime: '18:30' }));
    expect(doc.querySelectorAll('.col-time')[1].textContent).toBe('18:45 – 19:15');
  });

  it('textes échappés, logo non data:image refusé, plan vide', () => {
    const doc = parse(
      generateClubPlanHTML(session({ plan: [], label: '<script>x</script>' }), {
        clubName: '<b>C</b>',
        logo: 'javascript:alert(1)',
      })
    );
    expect(doc.querySelector('script')).toBeNull();
    expect(doc.querySelector('.plan-club b')).toBeNull();
    expect(doc.querySelector('.plan-logo')).toBeNull();
    expect(doc.querySelector('.plan-empty')).not.toBeNull();
    expect(doc.querySelector('.plan-title')!.textContent).toBe('<script>x</script>');
  });

  it('sans intitulé : titre « Plan de cours »', () => {
    const doc = parse(generateClubPlanHTML(session({ label: undefined }), { clubName: '' }));
    expect(doc.querySelector('.plan-title')!.textContent).toBe('Plan de cours');
  });
});
