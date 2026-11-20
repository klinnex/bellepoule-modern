/**
 * BellePoule Modern - Référence des outils MCP générée depuis leurs schémas (#1880)
 * Section de docs/MCP.md entre les marqueurs ci-dessous ; le reste du fichier est rédigé
 * à la main. Vérifiée par mcpDoc.test.ts (CI), régénérée par `npm run docs:mcp`.
 * Licensed under GPL-3.0
 */
import { READ_TOOLS, WRITE_TOOLS } from './mcpServer';

export const DOC_BEGIN = '<!-- outils-mcp:début (généré par npm run docs:mcp, ne pas éditer) -->';
export const DOC_END = '<!-- outils-mcp:fin -->';

interface PropSchema {
  type?: string | string[];
  description?: string;
  enum?: readonly unknown[];
  items?: PropSchema;
  /** Union (schémas générés depuis le contrat d'API, #1981) */
  anyOf?: PropSchema[];
}

interface DocTool {
  name: string;
  title: string;
  description: string;
  inputSchema: { properties: Record<string, unknown>; required?: string[] };
  annotations: { readOnlyHint?: boolean; destructiveHint?: boolean; idempotentHint?: boolean };
}

const cell = (s: string): string =>
  s.replace(/\\/g, '\\\\').replace(/\|/g, '\\|').replace(/\n/g, ' ');

function typeLabel(p: PropSchema): string {
  if (p.enum) return p.enum.map(v => `\`${String(v)}\``).join(', ');
  if (p.type === 'array') return `${p.items ? typeLabel(p.items) : 'valeur'}[]`;
  if (Array.isArray(p.type)) return p.type.join(' / ');
  if (p.anyOf) return p.anyOf.map(typeLabel).join(' / ');
  return p.type ?? 'valeur';
}

function nature(t: DocTool): string {
  if (t.annotations.readOnlyHint) return 'lecture';
  return t.annotations.destructiveHint ? '⚠️ écriture, destructif' : 'écriture';
}

function renderTool(t: DocTool): string {
  const lines = [
    `### \`${t.name}\` — ${t.title}`,
    '',
    `*${nature(t)}${t.annotations.idempotentHint ? ', idempotent' : ''}.* ${t.description}`,
    '',
  ];
  const props = Object.entries(t.inputSchema.properties) as Array<[string, PropSchema]>;
  if (props.length === 0) return [...lines, 'Aucun argument.', ''].join('\n');
  const required = new Set(t.inputSchema.required ?? []);
  lines.push('| Argument | Type | Requis | Description |', '|---|---|---|---|');
  for (const [name, p] of props) {
    lines.push(
      `| \`${name}\` | ${cell(typeLabel(p))} | ${required.has(name) ? 'oui' : ''} | ${cell(p.description ?? '')} |`
    );
  }
  return [...lines, ''].join('\n');
}

/** Section générée (marqueurs compris) */
export function renderToolReference(): string {
  const read = READ_TOOLS as unknown as DocTool[];
  const write = WRITE_TOOLS as unknown as DocTool[];
  return [
    DOC_BEGIN,
    '',
    `## Référence des outils (${read.length + write.length})`,
    '',
    'Générée depuis les schémas des outils (`src/main/mcp/*Tools.ts`).',
    '',
    `### En lecture (${read.length})`,
    '',
    ...read.map(renderTool),
    `### En écriture, sur autorisation (${write.length})`,
    '',
    ...write.map(renderTool),
    DOC_END,
  ].join('\n');
}

/** Document complet : section générée remplacée, ou ajoutée en fin de fichier */
export function withToolReference(doc: string): string {
  const generated = renderToolReference();
  const begin = doc.indexOf(DOC_BEGIN);
  const end = doc.indexOf(DOC_END);
  if (begin >= 0 && end > begin) {
    return doc.slice(0, begin) + generated + doc.slice(end + DOC_END.length);
  }
  return `${doc.trimEnd()}\n\n${generated}\n`;
}
