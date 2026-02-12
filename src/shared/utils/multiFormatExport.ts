/**
 * BellePoule Modern - Multi-Format Export Utilities
 * Licensed under GPL-3.0
 */

import { Competition, Fencer, Pool, PoolRanking } from '../types';

/**
 * Export results as HTML web page
 */
export function exportResultsHTML(
  competition: Competition,
  poolRanking: PoolRanking[],
  finalResults: any[]
): string {
  const html = `<!DOCTYPE html>
<html lang="fr">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${competition.title} - Résultats</title>
  <style>
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      max-width: 1200px;
      margin: 0 auto;
      padding: 2rem;
      background: #f5f5f5;
    }
    .header {
      background: linear-gradient(135deg, #3B82F6 0%, #2563EB 100%);
      color: white;
      padding: 2rem;
      border-radius: 12px;
      margin-bottom: 2rem;
      box-shadow: 0 4px 6px rgba(0,0,0,0.1);
    }
    .header h1 {
      margin: 0 0 0.5rem 0;
      font-size: 2rem;
    }
    .header .meta {
      opacity: 0.9;
      font-size: 0.9rem;
    }
    .section {
      background: white;
      border-radius: 12px;
      padding: 1.5rem;
      margin-bottom: 1.5rem;
      box-shadow: 0 2px 4px rgba(0,0,0,0.1);
    }
    .section h2 {
      margin-top: 0;
      color: #1F2937;
      border-bottom: 2px solid #E5E7EB;
      padding-bottom: 0.5rem;
    }
    table {
      width: 100%;
      border-collapse: collapse;
      margin-top: 1rem;
    }
    th, td {
      text-align: left;
      padding: 0.75rem;
      border-bottom: 1px solid #E5E7EB;
    }
    th {
      background: #F9FAFB;
      font-weight: 600;
      color: #4B5563;
    }
    tr:hover {
      background: #F9FAFB;
    }
    .rank-1 { background: #FEF3C7 !important; }
    .rank-2 { background: #F3F4F6 !important; }
    .rank-3 { background: #FDE68A !important; }
    .footer {
      text-align: center;
      color: #6B7280;
      margin-top: 2rem;
      font-size: 0.875rem;
    }
    @media print {
      body { background: white; }
      .section { box-shadow: none; border: 1px solid #E5E7EB; }
    }
  </style>
</head>
<body>
  <div class="header">
    <h1>🏆 ${competition.title}</h1>
    <div class="meta">
      📅 ${new Date(competition.date).toLocaleDateString('fr-FR')} | 
      📍 ${competition.location || 'Lieu non défini'} |
      ⚔️ ${competition.weapon}
    </div>
  </div>

  <div class="section">
    <h2>🥇 Classement Final</h2>
    <table>
      <thead>
        <tr>
          <th>Rang</th>
          <th>Nom</th>
          <th>Club</th>
          <th>Nationalité</th>
        </tr>
      </thead>
      <tbody>
        ${finalResults.map((result, index) => `
          <tr class="rank-${result.rank}">
            <td>${result.rank}</td>
            <td><strong>${result.fencer.lastName} ${result.fencer.firstName}</strong></td>
            <td>${result.fencer.club || '-'}</td>
            <td>${result.fencer.nationality || '-'}</td>
          </tr>
        `).join('')}
      </tbody>
    </table>
  </div>

  <div class="section">
    <h2>📊 Classement des Poules</h2>
    <table>
      <thead>
        <tr>
          <th>Rang</th>
          <th>Nom</th>
          <th>Club</th>
          <th>V</th>
          <th>D</th>
          <th>TD</th>
          <th>TR</th>
          <th>Indice</th>
        </tr>
      </thead>
      <tbody>
        ${poolRanking.map((r, i) => `
          <tr>
            <td>${i + 1}</td>
            <td><strong>${r.fencer.lastName} ${r.fencer.firstName}</strong></td>
            <td>${r.fencer.club || '-'}</td>
            <td>${r.victories || 0}</td>
            <td>${r.defeats || 0}</td>
            <td>${r.touchesScored || 0}</td>
            <td>${r.touchesReceived || 0}</td>
            <td>${r.index || 0}</td>
          </tr>
        `).join('')}
      </tbody>
    </table>
  </div>

  <div class="footer">
    <p>Généré par BellePoule Modern le ${new Date().toLocaleString('fr-FR')}</p>
  </div>
</body>
</html>`;

  return html;
}

/**
 * Export ranking as Excel-compatible CSV with formulas
 */
export function exportRankingCSV(
  poolRanking: PoolRanking[],
  includeFormulas: boolean = false
): string {
  const headers = ['Rang', 'Nom', 'Prénom', 'Club', 'Nationalité', 'V', 'D', 'TD', 'TR', 'Indice'];
  
  let csv = headers.join(';') + '\n';
  
  poolRanking.forEach((ranking, index) => {
    const stats = { victories: ranking.victories || 0, defeats: ranking.defeats || 0, touchesScored: ranking.touchesScored || 0, touchesReceived: ranking.touchesReceived || 0, index: ranking.index || 0 };
    const row = [
      index + 1,
      `"${ranking.fencer.lastName}"`,
      `"${ranking.fencer.firstName}"`,
      `"${ranking.fencer.club || ''}"`,
      `"${ranking.fencer.nationality || ''}"`,
      stats.victories,
      stats.defeats,
      stats.touchesScored,
      stats.touchesReceived,
      includeFormulas ? `=H${index + 2}-I${index + 2}` : stats.index,
    ];
    csv += row.join(';') + '\n';
  });
  
  return csv;
}

/**
 * Export results as XML FFE format
 */
export function exportResultsXMLFFE(
  competition: Competition,
  poolRanking: PoolRanking[],
  finalResults: any[]
): string {
  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<Competition>
  <Informations>
    <Nom>${escapeXml(competition.title)}</Nom>
    <Date>${competition.date}</Date>
    <Lieu>${escapeXml(competition.location || '')}</Lieu>
    <Arme>${competition.weapon}</Arme>
    <Genre>${competition.gender}</Genre>
    <Categorie>${competition.category}</Categorie>
  </Informations>
  <Participants Nombre="${poolRanking.length}">
    ${poolRanking.map((r, i) => `
    <Tireur Rang="${i + 1}">
      <Nom>${escapeXml(r.fencer.lastName)}</Nom>
      <Prenom>${escapeXml(r.fencer.firstName)}</Prenom>
      <Club>${escapeXml(r.fencer.club || '')}</Club>
      <Licence>${r.fencer.license || ''}</Licence>
      <Nation>${r.fencer.nationality || ''}</Nation>
    </Tireur>`).join('')}
  </Participants>
  <Classement>
    ${finalResults.map(r => `
    <Classe Rang="${r.rank}">
      <Nom>${escapeXml(r.fencer.lastName)}</Nom>
      <Prenom>${escapeXml(r.fencer.firstName)}</Prenom>
    </Classe>`).join('')}
  </Classement>
</Competition>`;

  return xml;
}

/**
 * Export detailed statistics as CSV
 */
export function exportDetailedStatsCSV(
  competition: Competition,
  pools: Pool[],
  poolRanking: PoolRanking[]
): string {
  const headers = [
    'Rang', 'Nom', 'Prénom', 'Club', 
    'V', 'D', 'TD', 'TR', 'Indice',
    'VMoy', 'DMoy', 'TDMoy', 'TRMoy'
  ];
  
  let csv = `Compétition: ${competition.title}\n`;
  csv += `Date: ${new Date(competition.date).toLocaleDateString('fr-FR')}\n\n`;
  csv += headers.join(';') + '\n';
  
  poolRanking.forEach((ranking, index) => {
    const totalMatches = ranking.victories + ranking.defeats;

    const row = [
      index + 1,
      `"${ranking.fencer.lastName}"`,
      `"${ranking.fencer.firstName}"`,
      `"${ranking.fencer.club || ''}"`,
      ranking.victories,
      ranking.defeats,
      ranking.touchesScored,
      ranking.touchesReceived,
      ranking.index,
      totalMatches > 0 ? (ranking.victories / totalMatches * 100).toFixed(1) : 0,
      totalMatches > 0 ? (ranking.defeats / totalMatches * 100).toFixed(1) : 0,
      totalMatches > 0 ? (ranking.touchesScored / totalMatches).toFixed(1) : 0,
      totalMatches > 0 ? (ranking.touchesReceived / totalMatches).toFixed(1) : 0,
    ];
    csv += row.join(';') + '\n';
  });
  
  return csv;
}

/**
 * Escape XML special characters
 */
function escapeXml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}