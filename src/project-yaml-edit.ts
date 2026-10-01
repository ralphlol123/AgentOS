/** Format-preserving edits to `.agentos/project.yaml`.
 *
 * Six commands used to parse the file, change the object and re-dump the WHOLE document, so a
 * hand-formatted file lost its comments, flow style and layout - even from a `doctor --fix` with
 * nothing to change. `patchProjectYaml` applies the same object mutation but touches only the text
 * that has to change:
 *
 *  - mutation changed nothing  -> the input string is returned unchanged;
 *  - otherwise                 -> minimal text splices at the YAML node ranges (append a sequence
 *                                 item, replace a scalar in place, add or remove a key);
 *  - anything it cannot do, or cannot PROVE it did correctly -> the old whole-file dump.
 *
 * The proof is the contract: the spliced text is re-parsed and must equal the mutated object, so the
 * data is always exactly what the old dump produced. Only the formatting differs, and only for the better.
 */
import { isDeepStrictEqual } from 'node:util';
import { isAlias, isMap, isScalar, isSeq, parse as parseYaml, parseDocument, stringify, visit } from 'yaml';

/** The canonical whole-file dump (also the fallback). */
export function dumpYaml(data: unknown): string {
  return stringify(data, { indent: 2, lineWidth: 0 }).replace(/\n*$/, '\n');
}

class Unsupported extends Error {}
const unsupported = (why: string): never => { throw new Unsupported(why); };

interface Edit { start: number; end: number; text: string }
interface Ctx { text: string; nl: string }

const jsonClone = (value: unknown) => JSON.parse(JSON.stringify(value ?? null));
const isPlainObject = (value: unknown): value is Record<string, any> => Boolean(value) && typeof value === 'object' && !Array.isArray(value);
const isPrimitive = (value: unknown) => value === null || ['string', 'number', 'boolean'].includes(typeof value);

function lenientObject(text: string): Record<string, any> {
  try {
    const parsed = parseYaml(String(text || ''));
    return isPlainObject(parsed) ? parsed : {};
  } catch {
    return {};
  }
}

export function patchProjectYaml(text: string, mutate: (data: any) => void): string {
  const patched = tryPatch(String(text ?? ''), mutate);
  if (patched !== null) return patched;
  const data = lenientObject(text);
  mutate(data);
  return dumpYaml(data);
}

function tryPatch(text: string, mutate: (data: any) => void): string | null {
  try {
    if (!text.trim()) return null;
    const doc = parseDocument(text);
    if (doc.errors.length || !isMap(doc.contents)) return null;
    let alias = false;
    visit(doc, { Alias() { alias = true; return visit.BREAK; } });
    if (alias) return null;

    const before = doc.toJS();
    const data = structuredClone(before);
    mutate(data);
    const wanted = jsonClone(data);
    if (isDeepStrictEqual(jsonClone(before), wanted)) return text;

    const crlf = /\r\n/.test(text);
    if (crlf && /(^|[^\r])\n/.test(text)) return null; // mixed line endings: do not guess
    const ctx: Ctx = { text, nl: crlf ? '\r\n' : '\n' };
    const edits: Edit[] = [];
    planMap(ctx, doc.contents as any, before, data, edits);
    const out = applyEdits(text, edits);

    const check = parseDocument(out);
    if (check.errors.length) return null;
    return isDeepStrictEqual(jsonClone(check.toJS()), wanted) ? out : null;
  } catch {
    return null; // Unsupported, or anything unexpected: the caller falls back to the whole-file dump
  }
}

function applyEdits(text: string, edits: Edit[]): string {
  const ordered = [...edits].sort((a, b) => b.start - a.start || b.end - a.end);
  for (let i = 0; i < ordered.length; i++) {
    if (ordered[i].end < ordered[i].start) unsupported('negative edit');
    if (i > 0 && ordered[i].end > ordered[i - 1].start) unsupported('overlapping edits');
    if (i > 0 && ordered[i].start === ordered[i - 1].start) unsupported('ambiguous insertion order');
  }
  let out = text;
  for (const edit of ordered) out = out.slice(0, edit.start) + edit.text + out.slice(edit.end);
  return out;
}

// --- text helpers ---------------------------------------------------------------------------------

const lineStart = (ctx: Ctx, pos: number) => ctx.text.lastIndexOf('\n', pos - 1) + 1;
const lineEnd = (ctx: Ctx, pos: number) => { const i = ctx.text.indexOf('\n', pos); return i < 0 ? ctx.text.length : i + 1; };
/** Only whitespace or a comment may follow `pos` on its line, so a whole-line edit loses nothing else. */
function assertLineTailFree(ctx: Ctx, pos: number) {
  if (!/^[ \t]*(#[^\r\n]*)?\r?\n?$/.test(ctx.text.slice(pos, lineEnd(ctx, pos)))) unsupported('content shares the last line');
}
function assertOwnLine(ctx: Ctx, pos: number): number {
  const ls = lineStart(ctx, pos);
  const lead = ctx.text.slice(ls, pos);
  if (lead.trim() !== '' || /\t/.test(lead)) unsupported('node does not start its line');
  return lead.length;
}
function contentEnd(node: any): number {
  if (!node) return unsupported('missing node');
  if (isAlias(node)) return unsupported('alias');
  if (isScalar(node)) return node.range![1];
  if ((isMap(node) || isSeq(node)) && (node as any).flow) return node.range![1];
  if (isMap(node)) { const last = node.items[node.items.length - 1]; return contentEnd(last.value ?? last.key); }
  if (isSeq(node)) return contentEnd(node.items[node.items.length - 1]);
  return unsupported('unknown node');
}
function withIndent(ctx: Ctx, indent: number, block: string): string {
  const pad = ' '.repeat(indent);
  return block.replace(/\n$/, '').split('\n').map((line) => (line ? pad + line : line)).join(ctx.nl) + ctx.nl;
}
function scalarText(value: unknown): string {
  const out = stringify(value, { lineWidth: 0 }).replace(/\n$/, '');
  if (out.includes('\n')) unsupported('multi-line scalar');
  return out;
}
function flowText(value: unknown): string {
  const out = stringify(value, { lineWidth: 0, collectionStyle: 'flow' }).replace(/\n$/, '');
  if (out.includes('\n')) unsupported('multi-line flow value');
  return out;
}
/** Insert `block` after the line holding `pos`; at EOF without a trailing newline, start a new line first. */
function insertAfterLine(ctx: Ctx, pos: number, block: string): Edit {
  assertLineTailFree(ctx, pos);
  const at = lineEnd(ctx, pos);
  const needsBreak = at === ctx.text.length && !ctx.text.endsWith('\n');
  return { start: at, end: at, text: (needsBreak ? ctx.nl : '') + block };
}

// --- planning -------------------------------------------------------------------------------------

function planMap(ctx: Ctx, node: any, oldValue: any, newValue: any, edits: Edit[]) {
  const pairs = new Map<string, any>();
  for (const pair of node.items) {
    if (!isScalar(pair.key)) unsupported('non-scalar key');
    pairs.set(String(pair.key.value), pair);
  }
  if (pairs.size !== node.items.length) unsupported('duplicate keys');

  const removed = Object.keys(oldValue).filter((key) => newValue[key] === undefined);
  const added = Object.keys(newValue).filter((key) => newValue[key] !== undefined && !(key in oldValue));
  const kept = Object.keys(oldValue).filter((key) => newValue[key] !== undefined);

  for (const key of removed) removePair(ctx, node, pairs.get(key), edits);
  for (const key of kept) planValue(ctx, node, pairs.get(key), oldValue[key], newValue[key], edits);
  if (added.length) addPairs(ctx, node, added, newValue, edits);
}

function removePair(ctx: Ctx, parent: any, pair: any, edits: Edit[]) {
  if (parent.flow) unsupported('remove from flow mapping');
  const start = pair.key.range[0];
  assertOwnLine(ctx, start);
  const end = contentEnd(pair.value ?? pair.key);
  assertLineTailFree(ctx, end);
  edits.push({ start: lineStart(ctx, start), end: lineEnd(ctx, end), text: '' });
}

function addPairs(ctx: Ctx, node: any, keys: string[], newValue: any, edits: Edit[]) {
  if (!node.items.length) unsupported('empty mapping');
  if (node.flow) {
    const inner = keys.map((key) => {
      const out = stringify({ [key]: newValue[key] }, { lineWidth: 0, collectionStyle: 'flow' }).trim();
      if (!out.startsWith('{ ') || !out.endsWith(' }') || out.includes('\n')) unsupported('flow insert');
      return out.slice(2, -2);
    });
    const at = contentEnd(node.items[node.items.length - 1].value ?? node.items[node.items.length - 1].key);
    edits.push({ start: at, end: at, text: `, ${inner.join(', ')}` });
    return;
  }
  const indent = assertOwnLine(ctx, node.items[0].key.range[0]);
  const block = keys.map((key) => stringify({ [key]: newValue[key] }, { indent: 2, lineWidth: 0 })).join('');
  const last = node.items[node.items.length - 1];
  edits.push(insertAfterLine(ctx, contentEnd(last.value ?? last.key), withIndent(ctx, indent, block)));
}

function planValue(ctx: Ctx, parent: any, pair: any, oldValue: any, newValue: any, edits: Edit[]) {
  if (isDeepStrictEqual(jsonClone(oldValue), jsonClone(newValue))) return;
  const valueNode = pair.value;
  if (valueNode && isMap(valueNode) && isPlainObject(oldValue) && isPlainObject(newValue)) return planMap(ctx, valueNode, oldValue, newValue, edits);
  if (valueNode && isSeq(valueNode) && Array.isArray(oldValue) && Array.isArray(newValue)) return planSeq(ctx, valueNode, oldValue, newValue, edits);
  if (valueNode && isScalar(valueNode) && isPrimitive(newValue) && isPrimitive(oldValue)) return replaceScalar(valueNode, newValue, edits);
  replacePairValue(ctx, parent, pair, newValue, edits);
}

function replaceScalar(node: any, value: unknown, edits: Edit[]) {
  if (node.type === 'BLOCK_LITERAL' || node.type === 'BLOCK_FOLDED') unsupported('block scalar');
  const [start, end] = node.range;
  edits.push({ start, end, text: (start === end ? ' ' : '') + scalarText(value) });
}

function replacePairValue(ctx: Ctx, parent: any, pair: any, value: unknown, edits: Edit[]) {
  if (!pair.value) unsupported('pair without a value');
  if (parent.flow) {
    edits.push({ start: pair.value.range[0], end: contentEnd(pair.value), text: flowText(value) });
    return;
  }
  // Rewrite the whole entry; a trailing comment on the old value is the only thing this can drop.
  const keyStart = pair.key.range[0];
  const indent = assertOwnLine(ctx, keyStart);
  const end = contentEnd(pair.value);
  assertLineTailFree(ctx, end);
  edits.push({ start: lineStart(ctx, keyStart), end: lineEnd(ctx, end), text: withIndent(ctx, indent, stringify({ [pair.key.value]: value }, { indent: 2, lineWidth: 0 })) });
}

function dashColumn(ctx: Ctx, item: any): number {
  if (!item) return unsupported('empty sequence item');
  const p = item.range[0];
  const m = /^([ \t]*)-[ \t]+$/.exec(ctx.text.slice(lineStart(ctx, p), p));
  if (!m || /\t/.test(m[1])) unsupported('unusual sequence item');
  return m![1].length;
}

function planSeq(ctx: Ctx, node: any, oldValue: any[], newValue: any[], edits: Edit[]) {
  const sameLeading = newValue.length > oldValue.length && oldValue.every((item, i) => isDeepStrictEqual(jsonClone(item), jsonClone(newValue[i])));
  const extra = newValue.slice(oldValue.length);

  if (node.flow) {
    if (!node.items.every((item: any) => isScalar(item))) unsupported('nested flow sequence');
    if (sameLeading && extra.every(isPrimitive)) {
      if (!oldValue.length) { const at = node.range[0] + 1; edits.push({ start: at, end: at, text: extra.map(scalarText).join(', ') }); return; }
      const at = contentEnd(node.items[node.items.length - 1]);
      edits.push({ start: at, end: at, text: `, ${extra.map(scalarText).join(', ')}` });
      return;
    }
    if (newValue.length === oldValue.length && newValue.every(isPrimitive) && oldValue.every(isPrimitive)) {
      newValue.forEach((item, i) => { if (!Object.is(item, oldValue[i])) replaceScalar(node.items[i], item, edits); });
      return;
    }
    edits.push({ start: node.range[0], end: node.range[1], text: flowText(newValue) });
    return;
  }

  if (!node.items.length) unsupported('empty block sequence');
  if (sameLeading) {
    const col = dashColumn(ctx, node.items[node.items.length - 1]);
    const block = stringify(extra, { indent: 2, lineWidth: 0 });
    edits.push(insertAfterLine(ctx, contentEnd(node.items[node.items.length - 1]), withIndent(ctx, col, block)));
    return;
  }
  if (newValue.length === oldValue.length) {
    newValue.forEach((item, i) => {
      if (isDeepStrictEqual(jsonClone(item), jsonClone(oldValue[i]))) return;
      const itemNode = node.items[i];
      if (itemNode && isMap(itemNode) && isPlainObject(item) && isPlainObject(oldValue[i])) planMap(ctx, itemNode, oldValue[i], item, edits);
      else if (itemNode && isScalar(itemNode) && isPrimitive(item) && isPrimitive(oldValue[i])) replaceScalar(itemNode, item, edits);
      else unsupported('sequence item changed shape');
    });
    return;
  }
  if (!newValue.length) unsupported('sequence emptied');
  // Reorder, removal or mixed change: rewrite the items, keeping the key line and everything around it.
  const first = node.items[0];
  const col = dashColumn(ctx, first);
  const end = contentEnd(node.items[node.items.length - 1]);
  assertLineTailFree(ctx, end);
  edits.push({ start: lineStart(ctx, first.range[0]), end: lineEnd(ctx, end), text: withIndent(ctx, col, stringify(newValue, { indent: 2, lineWidth: 0 })) });
}

