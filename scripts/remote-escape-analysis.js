/**
 * Analyse des pages distantes (src/remote) : interpolations `${…}` non échappées dans les
 * gabarits HTML (#1147). Un gabarit est « HTML » s'il contient une balise (`<x`) ; chaque
 * interpolation doit alors être échappée (escHtml / esc / escapeHtml), traduite (tk / T),
 * numérique, ou être une valeur manifestement sûre (littéral, condition entre littéraux,
 * HTML déjà construit nommé *Html).
 */
const ts = require('typescript');

/** Fonctions dont le retour est sûr dans du HTML */
const SAFE_CALLS = new Set([
  'escHtml',
  'esc',
  'escapeHtml',
  'escAttr',
  'tk',
  'T',
  'Number',
  'parseInt',
  'parseFloat',
  'encodeURIComponent',
  'fmt',
  'formatTime',
  'pad',
]);
const SAFE_METHODS = new Set(['toFixed', 'toString', 'padStart', 'toLocaleString']);
/** Identifiants désignant du HTML déjà construit (audités à leur création) ou des nombres */
const SAFE_NAME_RE =
  /(Html|HTML|Markup|Class|Cls|Idx|Index|Count|Pct|Percent|Width|Height|Size)$|^safe[A-Z]|^(i|j|k|n|idx|index|rank|pos|num|total|pct|cls|css|style)$/;

function isLiteralish(node) {
  return (
    ts.isStringLiteral(node) ||
    ts.isNoSubstitutionTemplateLiteral(node) ||
    ts.isNumericLiteral(node) ||
    node.kind === ts.SyntaxKind.TrueKeyword ||
    node.kind === ts.SyntaxKind.FalseKeyword ||
    node.kind === ts.SyntaxKind.NullKeyword
  );
}

function calleeName(node) {
  const e = node.expression;
  if (ts.isIdentifier(e)) return { name: e.text, method: false };
  if (ts.isPropertyAccessExpression(e)) {
    const base = e.expression;
    if (ts.isIdentifier(base) && base.text === 'window')
      return { name: e.name.text, method: false };
    if (ts.isIdentifier(base) && base.text === 'Math') return { name: 'Math', method: false };
    return { name: e.name.text, method: true };
  }
  return { name: '', method: false };
}

function isSafe(node) {
  if (isLiteralish(node)) return true;
  if (ts.isParenthesizedExpression(node)) return isSafe(node.expression);
  if (ts.isPrefixUnaryExpression(node)) return true; // -x, !x, +x
  if (ts.isConditionalExpression(node)) return isSafe(node.whenTrue) && isSafe(node.whenFalse);
  if (ts.isBinaryExpression(node)) {
    const op = node.operatorToken.kind;
    if (
      op === ts.SyntaxKind.MinusToken ||
      op === ts.SyntaxKind.AsteriskToken ||
      op === ts.SyntaxKind.SlashToken ||
      op === ts.SyntaxKind.PercentToken ||
      op === ts.SyntaxKind.EqualsEqualsEqualsToken ||
      op === ts.SyntaxKind.ExclamationEqualsEqualsToken ||
      op === ts.SyntaxKind.LessThanToken ||
      op === ts.SyntaxKind.GreaterThanToken
    )
      return true;
    if (
      op === ts.SyntaxKind.PlusToken ||
      op === ts.SyntaxKind.BarBarToken ||
      op === ts.SyntaxKind.QuestionQuestionToken ||
      op === ts.SyntaxKind.AmpersandAmpersandToken
    )
      return isSafe(node.left) && isSafe(node.right);
    return false;
  }
  if (ts.isCallExpression(node)) {
    const { name, method } = calleeName(node);
    // arr.map(x => `…`).join('') : les gabarits internes sont analysés à part
    if (method && name === 'join') {
      const recv = node.expression.expression;
      if (ts.isCallExpression(recv) && calleeName(recv).name === 'map') return true;
    }
    if (method) return SAFE_METHODS.has(name) && isSafe(node.expression.expression);
    return SAFE_CALLS.has(name) || name === 'Math';
  }
  if (ts.isTemplateExpression(node)) return node.templateSpans.every(s => isSafe(s.expression));
  if (ts.isIdentifier(node)) return SAFE_NAME_RE.test(node.text);
  if (ts.isPropertyAccessExpression(node)) {
    return (
      SAFE_NAME_RE.test(node.name.text) &&
      (ts.isIdentifier(node.expression) || ts.isThis(node.expression))
    );
  }
  if (ts.isElementAccessExpression(node)) return false;
  return false;
}

function templateIsHtml(node) {
  const parts = [node.head.text, ...node.templateSpans.map(s => s.literal.text)];
  return parts.some(
    p =>
      /<[a-zA-Z/!]/.test(p) ||
      /\s(?:class|style|id|title|href|src|value|data-[\w-]+|on\w+)=["']?$/.test(p)
  );
}

const HTML_MARK_RE = /^\s*\/\*\s*html\s*\*\//;

/** Opérandes d'une concaténation `a + b + c` (aplatie) */
function concatOperands(node) {
  if (ts.isBinaryExpression(node) && node.operatorToken.kind === ts.SyntaxKind.PlusToken) {
    return [...concatOperands(node.left), ...concatOperands(node.right)];
  }
  if (ts.isParenthesizedExpression(node)) return [node];
  return [node];
}

/** `x.innerHTML = a + b` / `x.innerHTML += a + b` / `x.outerHTML = …` */
function isHtmlSinkTarget(node) {
  return (
    ts.isPropertyAccessExpression(node) &&
    (node.name.text === 'innerHTML' || node.name.text === 'outerHTML')
  );
}

/** Extrait les blocs <script> inline d'une page HTML (avec leur décalage de ligne) */
function inlineScripts(html) {
  const out = [];
  const re = /<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/gi;
  let m;
  while ((m = re.exec(html))) {
    const start = m.index + m[0].indexOf('>') + 1;
    out.push({ code: m[1], line: html.slice(0, start).split('\n').length - 1, offset: start });
  }
  return out;
}

/** Renvoie [{ line, expr }] des interpolations non échappées dans des gabarits HTML */
function analyzeRemoteSource(fileName, text) {
  const isHtml = /\.html$/.test(fileName);
  const chunks = isHtml ? inlineScripts(text) : [{ code: text, line: 0, offset: 0 }];
  const hits = [];
  for (const { code, line, offset } of chunks) {
    const sf = ts.createSourceFile(fileName, code, ts.ScriptTarget.Latest, true, ts.ScriptKind.JS);
    const visit = node => {
      // Concaténation de chaînes assignée à innerHTML : chaque opérande doit être sûr
      if (
        ts.isBinaryExpression(node) &&
        (node.operatorToken.kind === ts.SyntaxKind.EqualsToken ||
          node.operatorToken.kind === ts.SyntaxKind.PlusEqualsToken) &&
        isHtmlSinkTarget(node.left) &&
        ts.isBinaryExpression(node.right) &&
        node.right.operatorToken.kind === ts.SyntaxKind.PlusToken
      ) {
        for (const operand of concatOperands(node.right)) {
          if (HTML_MARK_RE.test(operand.getFullText(sf))) continue;
          if (ts.isTemplateExpression(operand)) continue; // analysé séparément
          if (!isSafe(operand)) {
            hits.push({
              line: line + sf.getLineAndCharacterOfPosition(operand.getStart(sf)).line + 1,
              expr: operand.getText(sf).replace(/\s+/g, ' ').slice(0, 120),
              start: offset + operand.getStart(sf),
              end: offset + operand.getEnd(),
            });
          }
        }
      }
      if (ts.isTemplateExpression(node) && templateIsHtml(node)) {
        for (const span of node.templateSpans) {
          // `${/* html */ fragment}` : fragment HTML construit localement et audité
          if (HTML_MARK_RE.test(span.expression.getFullText(sf))) continue;
          if (!isSafe(span.expression)) {
            hits.push({
              line: line + sf.getLineAndCharacterOfPosition(span.expression.getStart(sf)).line + 1,
              expr: span.expression.getText(sf).replace(/\s+/g, ' ').slice(0, 120),
              start: offset + span.expression.getStart(sf),
              end: offset + span.expression.getEnd(),
            });
          }
        }
      }
      ts.forEachChild(node, visit);
    };
    visit(sf);
  }
  return hits;
}

module.exports = { analyzeRemoteSource };
