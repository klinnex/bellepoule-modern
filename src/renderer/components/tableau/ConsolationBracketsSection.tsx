/**
 * BellePoule Modern - ConsolationBracketsSection
 * Affichage des brackets de consolation (mode Jouer toutes les places)
 * Licensed under GPL-3.0
 */

import React from 'react';
import { TableauMatch, ConsolationBracket } from './tableauTypes';
import { BASE_MATCH_HEIGHT } from './tableauCalculations';
import MatchCard from './MatchCard';

interface ConsolationBracketsSectionProps {
  consolationBrackets: ConsolationBracket[];
  arenaCount: number;
  readOnly: boolean;
  onMatchClick: (match: TableauMatch, bracketId: string) => void;
  onArenaClick: (matchId: string, bracketId: string) => void;
  onRefereeClick: (matchId: string) => void;
  onSignaturesClick?: (match: TableauMatch) => void;
}

// ─── Static style constants ───────────────────────────────────────────────────

const CONS_STYLES = {
  consolationSection: { marginTop: '1.5rem' } satisfies React.CSSProperties,
  consolationCard: { background: '#f9fafb', borderRadius: '8px', padding: '1rem', marginBottom: '1rem', border: '1px solid #e5e7eb' } satisfies React.CSSProperties,
  consolationHeader: { display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '0.75rem' } satisfies React.CSSProperties,
  consolationTitle: { margin: 0, fontSize: '1rem', fontWeight: 600, color: '#374151' } satisfies React.CSSProperties,
  consolationDoneBadge: { background: '#d1fae5', color: '#065f46', padding: '0.125rem 0.5rem', borderRadius: '9999px', fontSize: '0.75rem', fontWeight: 500 } satisfies React.CSSProperties,
  consolationWinnerBadge: { background: '#fef3c7', padding: '0.25rem 0.75rem', borderRadius: '8px', fontSize: '0.875rem', fontWeight: 600 } satisfies React.CSSProperties,
  consolationRoundsRow: { display: 'flex', gap: '1rem', overflowX: 'auto' as const } satisfies React.CSSProperties,
  consolationRoundCol: { display: 'flex', flexDirection: 'column' as const, minWidth: '200px' } satisfies React.CSSProperties,
  consolationRoundTitle: { textAlign: 'center' as const, fontWeight: 600, marginBottom: '0.5rem', color: '#374151', fontSize: '0.875rem' } satisfies React.CSSProperties,
  consolationRoundMatches: { display: 'flex', flexDirection: 'column' as const, gap: '0.5rem' } satisfies React.CSSProperties,
} satisfies Record<string, React.CSSProperties>;

const ConsolationBracketsSection: React.FC<ConsolationBracketsSectionProps> = ({
  consolationBrackets,
  arenaCount,
  readOnly,
  onMatchClick,
  onArenaClick,
  onRefereeClick,
  onSignaturesClick,
}) => {
  return (
    <div style={CONS_STYLES.consolationSection}>
      {consolationBrackets
        .sort((a, b) => a.firstPlace - b.firstPlace)
        .map(bracket => {
          const finalM = bracket.matches.find(m => m.round === 2);
          const bracketRounds: number[] = [];
          let r = bracket.size;
          while (r >= 2) { bracketRounds.push(r); r = r / 2; }
          if (bracket.matches.some(m => m.round === 3)) {
            const fi = bracketRounds.indexOf(2);
            if (fi !== -1) bracketRounds.splice(fi, 0, 3);
          }
          return (
            <div key={bracket.id} style={CONS_STYLES.consolationCard}>
              <div style={CONS_STYLES.consolationHeader}>
                <h3 style={CONS_STYLES.consolationTitle}>🥋 {bracket.name}</h3>
                {bracket.isComplete && (
                  <span style={CONS_STYLES.consolationDoneBadge}>Terminé</span>
                )}
                {finalM?.winner && (
                  <span style={CONS_STYLES.consolationWinnerBadge}>
                    🏆 {finalM.winner.lastName} {finalM.winner.firstName}
                  </span>
                )}
              </div>
              <div style={CONS_STYLES.consolationRoundsRow}>
                {bracketRounds.map(round => {
                  const roundMatches = bracket.matches.filter(m => m.round === round).sort((a, b) => a.position - b.position);
                  const roundName = round === 3 ? 'Petite finale' : round === 2 ? 'Finale' : round === 4 ? 'Demi-finales' : round === 8 ? 'Quarts' : `Tableau de ${round}`;
                  return (
                    <div key={round} style={CONS_STYLES.consolationRoundCol}>
                      <div style={CONS_STYLES.consolationRoundTitle}>{roundName}</div>
                      <div style={CONS_STYLES.consolationRoundMatches}>
                        {roundMatches.map(match => (
                          <MatchCard
                            key={match.id}
                            match={match}
                            viewMode="full"
                            baseMatchHeight={BASE_MATCH_HEIGHT}
                            onMatchClick={m => onMatchClick(m, bracket.id)}
                            onArenaClick={arenaCount > 0 && match.winner === null ? () => {
                              onArenaClick(match.id, bracket.id);
                            } : () => {}}
                            onRefereeClick={match.winner === null ? () => { onRefereeClick(match.id); } : undefined}
                            onSignaturesClick={onSignaturesClick}
                            readOnly={readOnly}
                          />
                        ))}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}
    </div>
  );
};

export default ConsolationBracketsSection;
