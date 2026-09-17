/** Pure planner for `agentos compact --rewrite`.
 *
 * Compaction must not treat "archived" as "safe to forget". This module
 * classifies live state into three decisions — `live`, `preserved`, `archived`
 * — using source text only: it never summarizes prose, never invents missing
 * fields, and blocks the rewrite whenever it cannot establish which objective
 * is current. Callers archive the originals byte-for-byte before replacing
 * anything on disk.
 */
import { hasUnclosedFence, markdownHeadings } from './markdown.js';
import { matchSectionTitle, resolveObjective } from './context-sections.js';

export type SectionDecision = 'live' | 'preserved' | 'archived';
export type SourceFile = 'handoff' | 'tasks';

export interface SectionPlan {
  file: SourceFile;
  heading: string;
  line: number;
  role: string;
  decision: SectionDecision;
  reason: string;
}

export interface ObjectiveCandidate {
  id: string;
  heading: string;
  line: number;
  text: string;
}

export interface CompactRewriteInput {
  handoff: string;
  tasks: string;
  objectiveId?: string;
  archiveRelPath?: string;
}

export interface CompactRewritePlan {
  ok: boolean;
  blockedReasons: string[];
  objectiveCandidates: ObjectiveCandidate[];
  selectedObjectiveId?: string;
  handoff: string;
  tasks: string;
  classification: { handoff: SectionPlan[]; tasks: SectionPlan[] };
  /** Constraint lines carried forward verbatim from archived history sections. */
  carriedForward: string[];
  /** Canonical sections with no source material, as `<canonical> (<file>.md)`; omitted from the output. */
  missing: string[];
  archiveRelPath: string;
  sizes: {
    handoffBefore: number; handoffAfter: number;
    tasksBefore: number; tasksAfter: number;
    before: number; after: number; delta: number;
  };
}

interface RoleDef {
  role: string;
  canonical: string;
  aliases: string[];
}

/** Canonical handoff roles, in the order the rewrite emits them. */
const HANDOFF_SECTION_ROLES: RoleDef[] = [
  { role: 'current-objective', canonical: 'Current objective', aliases: ['Current objective'] },
  { role: 'scope', canonical: 'Scope', aliases: ['Scope'] },
  { role: 'current-state', canonical: 'Current state', aliases: ['Current state', 'Current status'] },
  { role: 'next-exact-action', canonical: 'Next exact action', aliases: ['Next exact action', 'Next action', 'Next step'] },
  {
    role: 'protected',
    canonical: 'Protected paths and constraints',
    aliases: ['Protected paths and constraints', 'Protected paths', 'Protected files / do not touch', 'Protected files', 'Protected branches', 'Do not touch', 'Constraints'],
  },
  {
    role: 'blockers',
    canonical: 'Blockers and warnings',
    aliases: ['Blockers and warnings', 'Known failures', 'Known warnings / failures', 'Known warnings', 'Warnings', 'Blocked'],
  },
  { role: 'decisions', canonical: 'Open decisions', aliases: ['Open decisions', 'Decisions'] },
  { role: 'preserved', canonical: 'Preserved context', aliases: ['Preserved context'] },
  { role: 'history', canonical: 'History', aliases: ['History'] },
];

const TASKS_SECTION_ROLES: RoleDef[] = [
  { role: 'now', canonical: 'Now', aliases: ['Now'] },
  { role: 'next', canonical: 'Next', aliases: ['Next'] },
  { role: 'later', canonical: 'Later', aliases: ['Later'] },
  { role: 'blocked', canonical: 'Blocked', aliases: ['Blocked'] },
  { role: 'preserved', canonical: 'Preserved context', aliases: ['Preserved context'] },
  { role: 'history', canonical: 'History', aliases: ['History'] },
];

const HISTORY_WORDS = /^(previous|prior|superseded|past|old|historic|archived|earlier)$/i;
const HISTORY_HEADINGS = /^(history|done|completed|completed work|archived work|archive|run log|run logs)$/i;
const HISTORY_NOUNS = /^(objective|objectives|state|status|scope|work|notes|note|run|runs|sprint|session|iteration|step|log|logs|context|tasks|next exact action|next action)$/i;

/**
 * Standing constraints are not history, even when they were written inside a
 * historical section. Lines matching this heuristic are carried forward
 * verbatim when their section is archived; the rest of the section is archived.
 * This is a conservative safety net, not a semantic classifier.
 */
const CONSTRAINT_LINE = /\b(?:do not|don't|never|must not|must never|requires? (?:explicit )?approval|without (?:explicit )?approval|only with approval|await(?:s|ing)? (?:approval|explicit approval)|before (?:touching|merging|deploying|committing|pushing|releasing)|protected(?: path| file| files| branch| repo)?|do not touch|no secrets|no migrations)\b/i;
/** A line that opens with the directive, rather than prose that merely mentions one. */
const DIRECTIVE_START = /^(?:[-*+]|\d+\.)?\s*(?:\*{1,3}|_{1,3})?(?:do not|don't|never|must not|must never|always|only|requires?|before|await|keep|protected|no)\b/i;
/**
 * A subject followed by an obligation near the start of the line — `Migrations must
 * not be edited in place`, `Approval from the owner is required before merging`, and
 * longer subjects like `The production database in staging must never be synced from
 * dumps` — is an instruction even though it does not open on the directive. The modal
 * has to sit with its subject rather than anywhere in the line (that is the
 * keyword-anywhere rule this heuristic exists to avoid), which is why the window is
 * bounded rather than absent. A line admitted this way gets the prose length limit,
 * not the directive one: an obligation phrased mid-sentence is not a licence for a
 * paragraph.
 */
const SUBJECT_MODAL = /^\S+(?:\s+\S+){0,6}\s+(?:must(?:\s+(?:not|never|be|only))?|do not|don't|is required|are required|requires?|without approval|only with approval)\b/i;
/** Prose that happens to contain a keyword is not a standing constraint. */
const PROSE_LINE_LIMIT = 200;
/** A directive that opens the line may be longer, but not unbounded. */
const DIRECTIVE_LINE_LIMIT = 600;

const CARRIED_HEADING = 'Constraints carried forward from archived history';
const HISTORY_NOTE = 'Archived material is preserved verbatim, with byte hashes, under `.agentos/runs/` archives.';

/** A line that reads as an instruction: it opens on the directive or ends a sentence. */
const SENTENCE_END = /[.!?]$/;
/**
 * A trailing function word (or an unclosed parenthesis) means the line is a
 * wrapped fragment, not an instruction — `… and the note said the` is prose.
 * Deliberately excludes words that can legitimately end an instruction
 * (`only`, `also`, `just`, …): those dropped real constraints such as
 * `Never run migrations on production, staging only` and bought nothing on real
 * data, where this conjunct is otherwise what catches a truncated line.
 */
const DANGLING_TAIL = /(?:\b(?:a|an|the|and|or|but|nor|yet|so|that|which|who|whom|whose|this|these|those|it|its|they|them|their|he|she|his|her|we|our|you|your|to|of|in|on|at|by|for|with|from|into|onto|over|under|about|as|than|then|when|where|while|since|because|if|unless|until|after|before|during|between|through|against|via|is|are|was|were|be|been|being|has|have|had|do|does|did|can|could|may|might|must|shall|should|will|would|not|no|never)\b|\([^)]*)$/i;

/**
 * A standing constraint is a short directive, not narrative that happens to
 * contain a keyword: an archived history paragraph mentioning "never" is history.
 * Bullets are stripped so carried lines carry plain text and re-filter cleanly.
 *
 * The shape matters as much as the keyword. Reclaiming a history block hands this
 * rule every soft-wrapped line of it, and a fragment that merely *contains* a
 * keyword — or begins with `never` because the previous line ended mid-sentence —
 * re-injects prose into live context. So an instruction must open with an
 * uppercase character (not a code span, which means it is a continuation), must
 * either open on the directive itself or end a sentence, and must not trail off
 * on a function word.
 */
function isCarriedConstraint(line: string): boolean {
  const trimmed = line.trim();
  if (!trimmed || !CONSTRAINT_LINE.test(trimmed)) return false;
  const body = trimmed.replace(/^(?:[-*+]|\d+\.)\s+/, '').trim();
  if (!body) return false;
  const plain = body.replace(/^[*_\s]+/, '').replace(/[*_\s]+$/, '');
  if (!/^[A-Z]/.test(plain)) return false;
  const directive = DIRECTIVE_START.test(trimmed);
  if (!directive && !SUBJECT_MODAL.test(plain) && !SENTENCE_END.test(plain)) return false;
  if (DANGLING_TAIL.test(plain)) return false;
  return directive
    ? body.length <= DIRECTIVE_LINE_LIMIT
    : body.length <= PROSE_LINE_LIMIT;
}

/**
 * An opener that continues the preceding sentence rather than starting a new
 * one. History in a real workspace is soft-wrapped, so lines routinely begin on
 * a connective or a demonstrative that only resolves against the line above
 * (`and then …`, `which means …`, `This is why …`): prose however rule-like its
 * text reads.
 */
const LEAD_CONTINUATION = /^(?:and|or|but|nor|so|yet|then|also|plus|because|since|which|who|whom|whose|that|this|these|those|it|its|they|them|their|there|such|where|when|whenever|while|whereas|though|although|however|therefore|thus|meanwhile|otherwise|instead|moreover|furthermore|additionally|still|e\.g\.|i\.e\.)\b/i;

/** Strip a bullet marker and wrapping emphasis, leaving the statement text. */
function statementText(line: string): string {
  return line
    .trim()
    .replace(/^(?:[-*+]|\d+\.)\s+/, '')
    .trim()
    .replace(/^[*_\s]+/, '')
    .replace(/[*_\s]+$/, '');
}

/**
 * Does the statement open a new statement instead of continuing the previous
 * line? An obligation may open lowercase (`never push to main`), on a code span
 * (`` `migration.sql` must never be edited after being applied ``), or on an
 * ordinary uppercase subject — but it never opens on a continuation connective.
 */
function opensStatement(line: string, statement: string): boolean {
  if (!statement || LEAD_CONTINUATION.test(statement)) return false;
  return DIRECTIVE_START.test(line.trim()) || /^[A-Z]/.test(statement) || statement.startsWith('`');
}

/**
 * Modal or requirement phrasing that makes a statement an obligation rather than
 * narration that happens to mention a word. Every alternative carries the complement
 * that constrains its subject or excludes the shape that reports one, so a deontic
 * instruction matches and a description of one does not:
 *
 *  - `must not`, `must never`, `must only` are deontic without a complement, EXCEPT as
 *    an epistemic perfect: `must not have been warm`, `must never have been active on
 *    that path`, `must only have been lifted` report how a state came about. The
 *    reported past is the commonest shape history takes, so the perfect is excluded by
 *    lookahead. A bare prohibition (`must not be relied on`) still matches: it is
 *    deontic where it is written as an instruction, and where it is reported speech
 *    this tier carries the sentence forward verbatim rather than guessing it away
 *    (docs/compaction.md states that as a measured limit, it is not claimed here);
 *  - `must be` needs a participial predicate — the complement that commits the subject
 *    to an action (`must be approved`, `must be kept`, `must be removed`) and not a
 *    stative adjective that describes it (`must be stale`, `must be silent`);
 *  - `require(s)`/`required` need a constraint complement: a permission or review noun
 *    (`requires approval`, `required before merging`). `requires two passes` reports a
 *    count, and `was required for the staging deploy` a past event;
 *  - `without approval`/`only with approval` are negated permissions already.
 *
 * A prohibition that OPENS the statement is recognized by DIRECTIVE_START together with
 * CONSTRAINT_LINE, so `do not`/`don't` are deliberately not alternatives here: mid-sentence
 * they are narration (`I don't recall which branch carried that change`), and a short
 * subject-modal line is still taken verbatim by the confident rule above.
 */
const IRREGULAR_PARTICIPLES = 'forbidden|hidden|known|shown|seen|chosen|written|given|taken|driven|frozen|broken|stolen|sworn|drawn|grown|blown|thrown|worn|torn|kept|held|left|set|made|done|run|put|read|found|sent|built|spent|brought|told|said|met|won|lost|cut|shut|paid|sold';
/** A requirement noun that constrains: permission, review, or a gate that stands for one. */
const CONSTRAINT_COMPLEMENT = '(?:(?:explicit|written|formal|prior|manual|a|an|the|another|independent) )*(?:approval|permission|authorisation|authorization|sign-?off|consent|review)';
/**
 * `before merging`, `before deploying` — a gate phrased as a clause rather than a noun.
 * The gerund is anchored to the action verbs the confident rule's CONSTRAINT_LINE
 * already trusts: an unanchored `before [a-z]+ing` matches any participle at all, so
 * `The pipeline requires a restart before running the new migration, which the team
 * discovered last month.` — a mechanical report of what a pipeline does — was read as
 * an obligation and held its whole block live (measured at -0.07% reduction over 150
 * blocks). A gate outside this list is archived, and named as a limit in
 * docs/compaction.md.
 */
const BEFORE_GERUND = 'before\\s+(?:touching|merging|deploying|committing|pushing|releasing)\\b';
/** A past participle, including the suppletive `been`/`had` the perfect uses. */
const PERFECT_PARTICIPLE = `(?:been|had|got|gotten|[a-z]+ed\\b|(?:${IRREGULAR_PARTICIPLES})\\b)`;
/** `must not have been warm` — an epistemic perfect, not a prohibition. */
const EPISTEMIC_PERFECT = `(?!\\s+have\\s+${PERFECT_PARTICIPLE})`;
const MODAL_PHRASE = new RegExp(
  [
    `\\bmust\\s+(?:not|never|only)\\b${EPISTEMIC_PERFECT}`,
    `\\bmust\\s+be\\s+(?:[a-z]+ed\\b|(?:${IRREGULAR_PARTICIPLES})\\b)`,
    `\\brequires?\\s+(?:for\\s+)?${CONSTRAINT_COMPLEMENT}\\b`,
    `\\brequires?\\b[^.;!?]{0,60}?\\b${BEFORE_GERUND}`,
    `\\brequired\\s+(?:for\\s+)?${CONSTRAINT_COMPLEMENT}\\b`,
    `\\brequired\\s+${BEFORE_GERUND}`,
    '\\b(?:without|only with)\\s+(?:explicit\\s+)?approval\\b',
  ].join('|'),
  'i',
);
/** A trailing colon, semicolon or comma announces more text, so the statement is not complete. */
const CONTINUATION_TAIL = /[:,;]$/;

/** One soft-wrapped statement: a sentence accumulated across consecutive wrapped lines. */
interface Statement {
  lines: string[];
  text: string;
}

function makeStatement(lines: string[]): Statement {
  return { lines, text: lines.join(' ').replace(/\s+/g, ' ').trim() };
}

/** The next line that holds content, skipping blank lines and fenced regions. */
function nextContentLine(lines: string[], outside: boolean[], from: number): number | undefined {
  for (let index = from; index < lines.length; index++) if (outside[index] && lines[index].trim()) return index;
  return undefined;
}

/** One statement a block holds, with the layout evidence that decides whether it can be lifted. */
interface BlockStatement {
  statement: Statement;
  /** The sentence only reached its end by crossing a blank line into the next paragraph. */
  joined: boolean;
  /** The sentence is unfinished and the next paragraph carries it on in a shape that is not joined. */
  continues: boolean;
}

/**
 * The statements a block holds, in order, each with the layout evidence that decides
 * whether it can be lifted out of the block on its own.
 *
 * A line that ends a sentence closes the statement; a line that does not is a wrap and is
 * joined with the next one. The joined text is what the shape is judged on, because the
 * unit that matters is the sentence a reader would see, not the width the file happened to
 * be wrapped at.
 *
 * A blank line is a layout artifact too, so a sentence the layout split across one is
 * assembled across it (`… must not be modified without` / blank / `approval`): judging the
 * text above the break alone lifts half a statement into live context and archives the half
 * that completes it. A statement that reaches its end that way is recorded as `joined`, and
 * an assembled sentence that is still unfinished is not liftable.
 *
 * Some following lines cannot be pasted onto the sentence above, and they are not silently
 * treated as a finish either: an item whose own text carries the sentence on
 * (`- approval from the release manager` after `… must not be removed`) cannot be joined
 * without writing a sentence nobody wrote, so the statement is recorded as `continues` and
 * the block keeps it. Both flags are evidence for the caller; only a sentence that is
 * finished, and needed no join, is liftable.
 */
function blockStatements(lines: string[], outside: boolean[]): BlockStatement[] {
  const statements: BlockStatement[] = [];
  let buffer: string[] = [];
  let joined = false;
  let continues = false;
  let blank = false;
  const openText = () => makeStatement(buffer).text;
  const close = () => {
    if (!buffer.length) return;
    statements.push({ statement: makeStatement(buffer), joined, continues });
    buffer = [];
    joined = false;
    continues = false;
    blank = false;
  };
  const append = (line: string) => {
    buffer.push(line);
    blank = false;
    if (SENTENCE_END.test(openText())) close();
  };
  for (let index = 0; index < lines.length; index++) {
    // A fence ends the sentence it interrupts: fenced text is content, never a wrap.
    if (!outside[index]) { close(); continue; }
    const line = lines[index].trim();
    if (!line) { if (buffer.length) blank = true; continue; }
    if (buffer.length && !SENTENCE_END.test(openText())) {
      const carriedOn = continuesPreviousSentence(line);
      // Structure is never wrapped onto the next paragraph, however it opens: a heading
      // above a lowercase line is a heading with a body, not half a sentence.
      if (STRUCTURAL_OPENING.test(buffer[0])) { close(); append(line); continue; }
      if (carriedOn && ITEM_OPENING.test(line)) {
        // An item that carries the sentence on is not joined: pasting the item's own text
        // onto the sentence above produces a sentence nobody wrote. The statement is
        // unfinished, so the block keeps it rather than lifting a fragment.
        continues = true;
        close();
        append(line);
        continue;
      }
      if (carriedOn) { joined = joined || blank; append(line); continue; }
      // Two items are two statements: markdown will not read them as one sentence, so
      // neither does this. A heading, quote or fence opens its own block, and everything
      // else that opens a statement of its own splits too, while a code-span or
      // parenthesised wrap is appended to the sentence above.
      if (STRUCTURAL_OPENING.test(line) || (ITEM_OPENING.test(line) && ITEM_OPENING.test(buffer[0])) || startsNewStatement(line)) {
        close();
        append(line);
        continue;
      }
      append(line);
      continue;
    }
    append(line);
  }
  close();
  return statements;
}

/**
 * Does this line open a statement of its own rather than continue the sentence above — a
 * directive, or an ordinary uppercase subject? A backtick-led line is a wrap (a sentence
 * that names the code it is about does not begin with its subject), and a continuation
 * connective never opens one.
 */
function startsNewStatement(line: string): boolean {
  const statement = statementText(line);
  if (!statement || LEAD_CONTINUATION.test(statement)) return false;
  return DIRECTIVE_START.test(line) || /^[A-Z]/.test(statement);
}

/**
 * Is this statement shaped like an obligation, ignoring length? The shape has to be an
 * obligation shape, because a keyword is not evidence — an earlier keyword-anywhere rule
 * re-injected roughly 21KB of narrative into live context:
 *  - opens a statement: it never continues the line above on a connective;
 *  - obligation content: it opens on a directive, or states a modal/requirement phrase
 *    (`must not`, `requires approval`, `without approval`, …). The modal is allowed to
 *    sit after a long subject — `Accounts, locations and trips in the production
 *    database must not …` is exactly the obligation the confident rule cannot take,
 *    because its subject-to-modal window is bounded at six words;
 *  - complete: it does not trail off on a function word or an unclosed parenthesis, and
 *    a statement without terminal punctuation does not end on a colon, semicolon or
 *    comma.
 *
 * DANGLING_TAIL is applied to the JOINED statement, never to each line: every line of a
 * soft-wrapped obligation but the last ends mid-clause, so a per-line check would drop
 * `… must not be modified without / approval` and split the block around it.
 */
function readsAsObligationShape(statement: Statement): boolean {
  const { lines, text } = statement;
  const first = lines[0];
  if (!opensStatement(first, statementText(first))) return false;
  if (!(DIRECTIVE_START.test(first) && CONSTRAINT_LINE.test(text)) && !MODAL_PHRASE.test(text)) return false;
  if (DANGLING_TAIL.test(text)) return false;
  if (!SENTENCE_END.test(text) && CONTINUATION_TAIL.test(text)) return false;
  return true;
}

/**
 * Statements that carry an obligation but that `isCarriedConstraint` cannot extract
 * confidently: a lowercase directive, a code-span subject, a subject longer than the
 * modal window, wrapping emphasis, a sentence the layout split across a blank line, or no
 * terminal punctuation. They are `uncertain obligations`: possible standing instructions
 * whose removal from live context this planner must not guess at.
 *
 * The unit of evidence is the STATEMENT — a sentence, assembled across the soft-wrapped
 * lines that carry it, and across a blank line when the sentence continues there — and not
 * the blank-line-bounded run. A run is a layout artifact: soft-wrapped history puts
 * several sentences in one run, and the same prose re-flowed with blank lines between its
 * sentences puts each one in a run of its own. Judging the run therefore made the verdict
 * depend on where the blank lines fell, and inspected only its opening and its tail. A
 * complete obligation in the middle of a paragraph was archived with the prose around it,
 * while prose re-flowed with blank lines between its sentences was retained whole. The
 * shape is applied to every statement a block contains.
 *
 * Bounded: longer than the prose limit is a paragraph, not an instruction. A statement
 * that only became that long by crossing a blank line is handled by the caller instead,
 * which keeps its block rather than losing the fragment the confident rule refused. A
 * statement the confident rule already extracts verbatim is the caller's business too:
 * carrying it here as well would duplicate a live line rather than save one.
 */
function isUncertainObligation(statement: Statement): boolean {
  const { text } = statement;
  if (!text || text.length > PROSE_LINE_LIMIT) return false;
  return readsAsObligationShape(statement);
}

/** One possible obligation a block holds, and whether it can be lifted out of it. */
interface UncertainCandidate {
  /** Statement text, bullet markers and wrapping emphasis stripped. */
  text: string;
  /** The statement stands alone: it can be carried forward on its own. */
  liftable: boolean;
}

/** A markdown item, heading, quote or fence — something that opens rather than continues. */
const ITEM_OPENING = /^(?:[-*+]|\d+\.)\s|^#{1,6}\s|^>|^`{3,}|^~{3,}|^\|/;

/**
 * A heading, quote, fence or table row is structure, not prose: prose wraps under it, it
 * does not wrap onto the next paragraph. `### Notes` above a lowercase line is a heading
 * with a body, never a sentence whose second half follows the blank line.
 */
const STRUCTURAL_OPENING = /^#{1,6}\s|^>|^`{3,}|^~{3,}|^\|/;

/**
 * Does the line that follows a blank line continue the sentence before it, or open
 * something new? A statement without terminal punctuation cannot be lifted when the
 * next paragraph carries it on: the sentence was split by the layout, not finished, and
 * lifting the part above the break would put a fragment into live context.
 *
 * A markdown item counts only when its own text carries the sentence on (`- approval
 * from the release manager` after `… must not be modified without`); an item or heading
 * with an ordinary opening word opens something new, exactly as one without a marker
 * does. A heading, quote, fence or table row therefore never continues a sentence.
 */
function continuesPreviousSentence(line: string): boolean {
  const trimmed = line.trim();
  if (!trimmed) return false;
  const body = ITEM_OPENING.test(trimmed) ? statementText(trimmed) : trimmed;
  if (!body) return false;
  return /^[a-z]/.test(body) || /^[,;:)\]]/.test(body);
}

/** The sentence this line ends is carried on by the next paragraph across a blank line. */
function continuesAfterBlankLine(lines: string[], outside: boolean[], index: number): boolean {
  const next = nextContentLine(lines, outside, index + 1);
  return next !== undefined && continuesPreviousSentence(lines[next]);
}

/**
 * Every possible obligation a block holds, each marked liftable or not.
 *
 * A candidate is liftable when it reads as a complete unit on its own: it ends a
 * sentence, or it is unterminated but nothing follows it that continues it. The
 * fallback — keeping the whole block live — is reserved for the shapes that cannot be
 * lifted: a statement the layout split across a blank line whose halves do not rejoin into
 * a finished sentence (`… must not be modified without` / blank / `approval` is assembled,
 * but the assembled sentence is still unterminated), a tail an item carries on without
 * being joined, and a joined sentence too long to read as an instruction. A candidate the
 * confident rule already extracts verbatim is not repeated here: the same line would
 * otherwise be carried twice.
 */
function uncertainCandidates(body: string): UncertainCandidate[] {
  const lines = body.split(/\r?\n/);
  const outside = unfencedLines(lines);
  const found: UncertainCandidate[] = [];
  for (const { statement, joined, continues } of blockStatements(lines, outside)) {
    const text = statement.lines.map(statementText).join(' ').replace(/\s+/g, ' ').trim();
    if (!text) continue;
    if (statement.text.length > PROSE_LINE_LIMIT) {
      // Too long to read as an instruction — unless it only became that long by crossing a
      // blank line. The fragment above the break was refused by the confident rule, so the
      // block keeps the statement rather than losing it.
      if (joined && readsAsObligationShape(statement)) found.push({ text, liftable: false });
      continue;
    }
    if (!isUncertainObligation(statement)) continue;
    // Already extracted verbatim by the confident rule: carrying it here as well would
    // duplicate a live line instead of saving one.
    if (!joined && !continues && statement.lines.length === 1 && isCarriedConstraint(statement.lines[0])) continue;
    found.push({ text, liftable: SENTENCE_END.test(statement.text) || (!joined && !continues) });
  }
  return found;
}

/**
 * The obligation candidates a block holds, split by whether they can be lifted out of
 * it. The callers act on the split: liftable candidates are carried forward verbatim
 * into live constraints context and the block archives byte-exact; one unsafe candidate
 * means the block itself stays live and nothing is extracted from it, because a
 * statement that cannot be lifted on its own would lose its other half if it were.
 */
function uncertainVerdict(body: string): { carry: string[]; unsafe: string[] } {
  const candidates = uncertainCandidates(body);
  const pick = (liftable: boolean) => [...new Set(
    candidates.filter((candidate) => candidate.liftable === liftable).map((candidate) => candidate.text),
  )];
  return { carry: pick(true), unsafe: pick(false) };
}

/** The classification reason for a block kept live because a candidate cannot be lifted. */
function uncertainReason(scope: string, obligations: string[]): string {
  const named = obligations.slice(0, 2).map((line) => `"${line}"`).join(', ');
  const rest = obligations.length > 2 ? ` (+${obligations.length - 2} more)` : '';
  return `${scope}: uncertain obligation cannot be extracted safely, so the whole block is preserved live (${named}${rest})`;
}

/**
 * `1 uncertain obligation(s) carried forward verbatim`. Deliberately the same shape as
 * the confident rule's clause: the statement itself is live as a bullet, so naming it
 * again in the audit entry would only add bytes to live context.
 */
function uncertainCarryClause(carried: string[]): string {
  return `${carried.length} uncertain obligation(s) carried forward verbatim`;
}

interface SourceSection {
  heading: string;
  line: number;
  start: number;
  raw: string;
  body: string;
  /** Offset of `body[0]` in the source file, so nested headings can report real line numbers. */
  bodyStart: number;
  role?: string;
  suffix: string;
  history: boolean;
}

interface Outcome { decision: SectionDecision; reason: string }

function lineNumberAt(text: string, offset: number): number {
  let line = 1;
  for (let i = 0; i < offset && i < text.length; i++) if (text[i] === '\n') line++;
  return line;
}

function splitDocument(text: string): { preamble: string; nl: string; sections: SourceSection[]; text: string } {
  const nl = text.includes('\r\n') ? '\r\n' : '\n';
  const headings = markdownHeadings(text).filter((heading) => heading.level === 2);
  const preamble = headings.length ? text.slice(0, headings[0].start) : text;
  const sections: SourceSection[] = headings.map((heading, index) => {
    const end = headings[index + 1]?.start ?? text.length;
    const rawBody = text.slice(heading.end, end);
    const trimmed = rawBody.trim();
    return {
      heading: heading.title,
      line: lineNumberAt(text, heading.start),
      start: heading.start,
      raw: text.slice(heading.start, end).trimEnd(),
      body: trimmed,
      bodyStart: heading.end + (rawBody.length - rawBody.replace(/^\s+/, '').length),
      suffix: '',
      history: false,
    };
  });
  return { preamble, nl, sections, text };
}

function roleFor(title: string, roles: RoleDef[]): { role: string; suffix: string } | null {
  for (const def of roles) {
    for (const alias of def.aliases) {
      const matched = matchSectionTitle(title, alias);
      if (matched) return { role: def.role, suffix: matched.suffix };
    }
  }
  return null;
}

/**
 * `Previous objective (superseded) — 2026-09-13: …` is the same section as
 * `Previous objective`. Parenthetical qualifiers are stripped *before* the
 * date/qualifier cut: cutting first leaves the remainder as
 * `objective (2026-09-11`, which fails the noun list and quietly keeps a
 * superseded block live forever (the shape the real workspace contains most).
 */
function historyRemainder(rest: string): string {
  return rest.trim()
    .replace(/\s*\([^)]*\)/g, ' ')
    .replace(/[—–:.,].*$/, '')
    .trim();
}

function isHistoryHeading(title: string): boolean {
  const plain = title.trim().replace(/\s+/g, ' ');
  if (HISTORY_HEADINGS.test(plain)) return true;
  const [first, ...rest] = plain.split(' ');
  if (!HISTORY_WORDS.test(first ?? '')) return false;
  const remainder = historyRemainder(rest.join(' '));
  if (!remainder) return false;
  return HISTORY_NOUNS.test(remainder);
}

function classify(sections: SourceSection[], roles: RoleDef[]): void {
  for (const section of sections) {
    const matched = roleFor(section.heading, roles);
    if (matched) {
      section.role = matched.role;
      section.suffix = matched.suffix;
    }
    // Live containers (`## Preserved context`, `## History`) are part of the
    // canonical shape, so their headings are never read as history sections.
    const container = section.role === 'preserved' || section.role === 'history';
    section.history = !container && isHistoryHeading(section.heading);
  }
}

function hasUnresolvedWork(text: string): boolean {
  return /^\s*(?:[-*+]|\d+\.)\s+\[ \]/m.test(text);
}

/**
 * Constraint-looking lines outside fenced code blocks, in source order.
 *
 * A line the shape rule accepts is still refused when a following blank line continues its
 * sentence. `The staging guard must not be removed` matches as a subject-modal line inside
 * the six-word window, but when the next paragraph opens lowercase (`and the note was left
 * in place for the next window.`) the line is the first half of a longer sentence: carrying
 * it as a constraint puts a fragment into live context and archives the half that completes
 * it. The line falls through to the statement-shaped tier below, which lifts the complete
 * sentence, or keeps the block when even that cannot be done safely.
 */
function constraintLines(body: string): string[] {
  const source = body.split(/\r?\n/);
  const outside = unfencedLines(source);
  const lines: string[] = [];
  for (let index = 0; index < source.length; index++) {
    if (!outside[index]) continue;
    const line = source[index];
    if (!isCarriedConstraint(line)) continue;
    if (!SENTENCE_END.test(statementText(line)) && continuesAfterBlankLine(source, outside, index)) continue;
    lines.push(line.trim().replace(/^(?:[-*+]|\d+\.)\s+/, '').trim());
  }
  return lines;
}

/**
 * The constraints block is machine-generated by this command, so it is safe to
 * re-evaluate: lines that no longer qualify as standing constraints are dropped
 * from live context (their originals remain in the archive). Hand-written
 * content in the same container is never filtered.
 *
 * Re-evaluation never erases an uncertain obligation. A generated line is judged as
 * the single statement it is, so a line the confident rule cannot take, that still
 * reads as a possible obligation, survives on its own evidence — the other bullets
 * around it are not a reason to keep or drop it.
 */
function refilterCarriedBlock(body: string, nl: string): string {
  const lines = body.split(/\r?\n/);
  const outside = unfencedLines(lines);
  const out: string[] = [];
  for (let index = 0; index < lines.length; index++) {
    // Fenced text is content, never structure: a sample quoting the generated
    // heading is not that block, and nothing inside a fence is ever rewritten.
    if (!outside[index] || lines[index].trim() !== `### ${CARRIED_HEADING}`) { out.push(lines[index]); continue; }
    const kept: string[] = [];
    let cursor = index + 1;
    while (cursor < lines.length && !lines[cursor].trim()) cursor++;
    const runStart = cursor;
    while (cursor < lines.length && outside[cursor] && /^\s*[-*+]\s+/.test(lines[cursor])) cursor++;
    const run = lines.slice(runStart, cursor);
    for (const line of run) {
      // Normalize any stacked markers (`- - text`) left by an earlier generation.
      const statement = line.trim().replace(/^(?:[-*+]\s+)+/, '').trim();
      if (statement && (isCarriedConstraint(`- ${statement}`) || isUncertainObligation(makeStatement([statement])))) {
        kept.push(`- ${statement}`);
      }
    }
    index = cursor - 1;
    if (kept.length) out.push(`### ${CARRIED_HEADING}`, '', ...kept);
  }
  return out.join(nl).trim();
}

/**
 * Which lines sit outside fenced code blocks. Fenced text is content, never
 * structure: a code sample that happens to quote a generated heading must not
 * be mistaken for that heading.
 */
function unfencedLines(lines: string[]): boolean[] {
  const outside: boolean[] = [];
  let fence: { char: string; length: number } | undefined;
  for (const raw of lines) {
    const marker = raw.match(/^ {0,3}(`{3,}|~{3,})(.*)$/);
    if (fence) {
      if (marker && marker[1][0] === fence.char && marker[1].length >= fence.length && !marker[2].trim()) fence = undefined;
      outside.push(false);
      continue;
    }
    if (marker) {
      fence = { char: marker[1][0], length: marker[1].length };
      outside.push(false);
      continue;
    }
    outside.push(true);
  }
  return outside;
}

/**
 * Add newly carried constraint lines to the container's generated constraints
 * block instead of emitting a duplicate one. Hand-written bullets are only read
 * for de-duplication; they are never rewritten, and fenced samples are ignored.
 */
function mergeCarriedBlock(body: string, lines: string[], nl: string): string {
  if (!lines.length) return body;
  const parts = body.split(/\r?\n/);
  const outside = unfencedLines(parts);
  const present = new Set(
    parts
      .filter((line, index) => outside[index] && /^\s*[-*+]\s+/.test(line))
      .map((line) => line.trim().replace(/^(?:[-*+]\s+)+/, '').trim()),
  );
  const additions = lines.filter((line) => !present.has(line)).map((line) => `- ${line}`);
  if (!additions.length) return body;

  const at = parts.findIndex((line, index) => outside[index] && line.trim() === `### ${CARRIED_HEADING}`);
  if (at < 0) {
    const block = [`### ${CARRIED_HEADING}`, '', ...additions].join(nl);
    return body ? `${body}${nl}${nl}${block}` : block;
  }
  // Extend the block already in place: skip its blank line, then its bullet run.
  let cursor = at + 1;
  while (cursor < parts.length && !parts[cursor].trim()) cursor++;
  const first = cursor;
  while (cursor < parts.length && outside[cursor] && /^\s*[-*+]\s+/.test(parts[cursor])) cursor++;
  const head = parts.slice(0, cursor);
  if (first === cursor && first === at + 1) head.push('');
  return [...head, ...additions, ...parts.slice(cursor)].join(nl);
}

/**
 * Keep a demoted section's heading tree nested beneath it. Re-emitting a level-2
 * section as level 3 without shifting its descendants flattens an original level-3
 * child into the parent's sibling, so the next pass can archive the parent out from
 * under the evidence that preserved it. Fenced samples are content and stay exact.
 * An original level-6 heading becomes seven hashes intentionally: Markdown treats it
 * as plain preserved text rather than as a heading that could escape its owner.
 */
function demoteDescendantHeadings(body: string, nl: string): string {
  const lines = body.split(/\r?\n/);
  const outside = unfencedLines(lines);
  return lines.map((line, index) => outside[index]
    ? line.replace(/^( {0,3}#{3,6})(?=[ \t]|$)/, '$1#')
    : line).join(nl);
}

/**
 * Re-classify the body of a `## Preserved context` container.
 *
 * Section scanning splits level-2 headings only, and the container is a live
 * container, so history an earlier build demoted to `###` could never be
 * classified again: it stayed live forever. Archivable blocks are removed here
 * (after their constraint lines are carried forward) and reported like any
 * other history entry, so the original bytes remain in the run archive.
 * Content that is not explicit history — or that still holds an unchecked task
 * block at any depth — is kept, with block separators normalized to a single
 * blank line, and a container with nothing to archive is returned unchanged. A
 * repeat run therefore rewrites nothing once no further block becomes archivable;
 * a hand-edited container whose shallowest nested block is not itself archivable
 * (a deeper block above a later sibling, or a generated constraints block that
 * re-filtering removes) can expose one on a later pass, or never, and every
 * removal is still planned and reported.
 */
function archiveNestedHistory(
  section: SourceSection,
  file: SourceFile,
  document: { nl: string; text: string },
  roles: RoleDef[],
): { body: string; plans: SectionPlan[]; carried: string[] } {
  const body = section.body;
  const headings = markdownHeadings(body).filter((heading) => heading.level > 2);
  if (!headings.length) return { body, plans: [], carried: [] };

  // Deeper headings stay attached to the shallowest heading that owns them, so a
  // `- [ ]` under an intervening `####` blocks archival of its parent heading
  // instead of being split off and orphaned from it.
  const level = Math.min(...headings.map((heading) => heading.level));
  const siblings = headings.filter((heading) => heading.level === level);
  const blocks = siblings.map((heading, index) => {
    const end = siblings[index + 1]?.start ?? body.length;
    const blockBody = body.slice(heading.end, end).trim();
    // A block is judged on its own body plus every following sibling until the next
    // history-shaped one. Older planner output flattened descendants when it demoted a
    // level-2 section to `###`, so the obligation — or unchecked task — that kept the
    // section live can already sit in a following non-history sibling. New output keeps
    // descendant headings nested via demoteDescendantHeadings, but widening remains the
    // compatibility path for containers written by those older builds. Reading only the
    // block's own span archived the parent on the second pass while its evidence stayed
    // live in the sibling: a preserved decision that flips is not a fixed point.
    // History-shaped siblings are excluded, because they are judged on their own
    // evidence: including them would let one block's obligation retain every earlier
    // sibling in the container.
    let evidenceEnd = end;
    for (let next = index + 1; next < siblings.length && !isHistoryHeading(siblings[next].title); next++) {
      evidenceEnd = siblings[next + 1]?.start ?? body.length;
    }
    const evidence = body.slice(heading.end, evidenceEnd).trim();
    return {
      title: heading.title,
      line: lineNumberAt(document.text, section.bodyStart + heading.start),
      raw: body.slice(heading.start, end).trimEnd(),
      body: blockBody,
      // The decision is taken on the wider evidence span, but only the block's OWN body is
      // lifted out of it: a candidate that sits in a following non-history sibling is still
      // live with that sibling, and carrying it as well would duplicate a live line.
      own: uncertainVerdict(blockBody),
      uncertain: uncertainVerdict(evidence),
      unchecked: hasUnresolvedWork(evidence),
    };
  });
  // History is archivable only when nothing inside it still needs a decision: an
  // unchecked task block, or a possible obligation that cannot be lifted out of the
  // block as a self-contained statement. Preservation wins over reduction.
  const archivable = blocks.filter((block) => {
    const nestedRole = roleFor(block.title, roles)?.role;
    // Live containers stay whole, exactly as level-2 classification treats them.
    if (nestedRole === 'preserved' || nestedRole === 'history') return false;
    return isHistoryHeading(block.title) && !block.unchecked && !block.uncertain.unsafe.length;
  });
  const kept = blocks.filter((block) => {
    const nestedRole = roleFor(block.title, roles)?.role;
    // Live containers are re-emitted whole and are not history to report.
    if (nestedRole === 'preserved' || nestedRole === 'history') return false;
    return isHistoryHeading(block.title) && !archivable.includes(block);
  });

  const plans: SectionPlan[] = [];
  const carried: string[] = [];
  for (const block of archivable) {
    const lines = constraintLines(block.body);
    const lifted = [...lines, ...block.own.carry];
    for (const line of lifted) if (!carried.includes(line)) carried.push(line);
    const events = [
      lines.length ? `${lines.length} constraint line(s) carried forward verbatim` : '',
      block.own.carry.length ? uncertainCarryClause(block.own.carry) : '',
    ].filter(Boolean);
    plans.push({
      file,
      heading: block.title,
      line: block.line,
      role: 'history',
      decision: 'archived',
      reason: `history nested under a preserved container with no unresolved task blocks${events.length ? `; ${events.join('; ')}` : ''}`,
    });
  }
  // Kept blocks are reported too, so a nested block is always kept, reported or
  // archived — never silently unaccounted for.
  for (const block of kept) {
    plans.push({
      file,
      heading: block.title,
      line: block.line,
      role: 'history',
      decision: 'preserved',
      reason: block.uncertain.unsafe.length
        ? uncertainReason('nested history kept live', block.uncertain.unsafe)
        : 'nested history kept live: contains unresolved task blocks',
    });
  }
  if (!archivable.length) return { body, plans, carried: [] };

  const removed = new Set(archivable);
  // Bound the lead-in at the first SIBLING, not the first heading of any level: a
  // deeper heading before it owns no sibling span, and bounding at it would drop
  // that span from live context without reporting it.
  const segments = [body.slice(0, siblings[0].start).trim()];
  for (const block of blocks) if (!removed.has(block)) segments.push(block.raw);

  return { body: segments.filter(Boolean).join(`${document.nl}${document.nl}`).trim(), plans, carried };
}

function renderEntries(entries: { heading: string; body: string }[], nl: string): string {
  return entries.map((entry) => `## ${entry.heading}${nl}${nl}${entry.body}`.trimEnd()).join(`${nl}${nl}`);
}

/**
 * Plan a structural rewrite of `.agentos/handoff.md` and `.agentos/tasks.md`.
 * Pure: performs no I/O, and returns empty proposals when the rewrite is blocked.
 */
export function planCompactRewrite(input: CompactRewriteInput): CompactRewritePlan {
  const handoffText = input.handoff ?? '';
  const tasksText = input.tasks ?? '';
  const archiveRelPath = input.archiveRelPath ?? '';
  const blocked: string[] = [];

  if (hasUnclosedFence(handoffText)) blocked.push('.agentos/handoff.md has an unclosed Markdown fence; --rewrite cannot classify sections reliably. Repair the fence first.');
  if (hasUnclosedFence(tasksText)) blocked.push('.agentos/tasks.md has an unclosed Markdown fence; --rewrite cannot classify sections reliably. Repair the fence first.');
  if (!handoffText.trim()) blocked.push('.agentos/handoff.md is empty; there is no live context to rewrite.');
  if (!tasksText.trim()) blocked.push('.agentos/tasks.md is empty; there is no live task state to rewrite.');

  const documents = { handoff: splitDocument(handoffText), tasks: splitDocument(tasksText) };
  classify(documents.handoff.sections, HANDOFF_SECTION_ROLES);
  classify(documents.tasks.sections, TASKS_SECTION_ROLES);

  const objectiveResolution = resolveObjective(handoffText, input.objectiveId);
  const candidates: ObjectiveCandidate[] = objectiveResolution.candidates.map(({ id, heading, line, text }) => ({ id, heading, line, text }));
  let selected = objectiveResolution.selected
    ? documents.handoff.sections.find((section) => section.start === objectiveResolution.selected?.section.start)
    : undefined;
  if (objectiveResolution.kind !== 'resolved') blocked.push(objectiveResolution.diagnostic ?? 'The current objective could not be resolved.');

  const sizes = (handoffAfter: number, tasksAfter: number) => ({
    handoffBefore: handoffText.length, handoffAfter,
    tasksBefore: tasksText.length, tasksAfter,
    before: handoffText.length + tasksText.length, after: handoffAfter + tasksAfter,
    delta: handoffAfter + tasksAfter - (handoffText.length + tasksText.length),
  });

  if (blocked.length) {
    return {
      ok: false,
      blockedReasons: blocked,
      objectiveCandidates: candidates,
      handoff: '',
      tasks: '',
      classification: { handoff: [], tasks: [] },
      carriedForward: [],
      missing: [],
      archiveRelPath,
      sizes: sizes(0, 0),
    };
  }

  const selectedId = objectiveResolution.selected!.id;
  const outcomes = new Map<SourceSection, Outcome>();
  const carriedByFile: Record<SourceFile, string[]> = { handoff: [], tasks: [] };
  const classification: { handoff: SectionPlan[]; tasks: SectionPlan[] } = { handoff: [], tasks: [] };
  const missing: string[] = [];

  // Planned once per preserved container: the classification reason must say what
  // actually happened to it, and the render pass reuses the same plan.
  const nestedPlans = new Map<SourceSection, ReturnType<typeof archiveNestedHistory>>();
  for (const [file, roles] of [['handoff', HANDOFF_SECTION_ROLES], ['tasks', TASKS_SECTION_ROLES]] as const) {
    for (const section of documents[file].sections) {
      if (section.role !== 'preserved') continue;
      nestedPlans.set(section, archiveNestedHistory(section, file, documents[file], roles));
    }
  }

  for (const file of ['handoff', 'tasks'] as const) {
    for (const section of documents[file].sections) {
      let outcome: Outcome;
      // Candidate obligations the confident rule cannot extract. Their fate is decided
      // with the block: carried out of it verbatim when each one stands alone, or kept
      // with it when one of them cannot be lifted.
      let uncertainCarry: string[] = [];
      if (section.role === 'current-objective' && !section.history) {
        const { carry, unsafe } = uncertainVerdict(section.body);
        if (section === selected) outcome = { decision: 'live', reason: 'selected current objective' };
        else if (hasUnresolvedWork(section.raw)) outcome = { decision: 'preserved', reason: 'superseded objective kept live: contains unresolved task blocks' };
        else if (unsafe.length) outcome = { decision: 'preserved', reason: uncertainReason('superseded objective kept live', unsafe) };
        else {
          uncertainCarry = carry;
          outcome = { decision: 'archived', reason: 'superseded objective; explicit selection resolved which objective is live' };
        }
      } else if (section.role === 'preserved') {
        // Never claim more fidelity than this run can prove: the container's body is
        // re-read (and its generated constraints block may be re-filtered), whether or
        // not anything nested turned out archivable.
        const nested = nestedPlans.get(section);
        const archivedNested = nested?.plans.filter((plan) => plan.decision === 'archived').length ?? 0;
        const keptNested = nested?.plans.filter((plan) => plan.decision === 'preserved').length ?? 0;
        const events: string[] = [];
        if (archivedNested) events.push('nested history archived');
        if (keptNested) events.push(`nested history preserved live (${keptNested})`);
        outcome = {
          decision: 'preserved',
          reason: `live preserved-context container re-read; ${events.length ? events.join('; ') : 'nothing nested was archivable'}`,
        };
      } else if (section.role === 'history') {
        outcome = { decision: 'preserved', reason: 'live history container re-emitted with new archive entries' };
      } else if (section.history) {
        const { carry, unsafe } = uncertainVerdict(section.body);
        if (hasUnresolvedWork(section.raw)) outcome = { decision: 'preserved', reason: 'history section kept live: contains unresolved task blocks' };
        else if (unsafe.length) outcome = { decision: 'preserved', reason: uncertainReason('history section kept live', unsafe) };
        else {
          uncertainCarry = carry;
          outcome = { decision: 'archived', reason: 'explicit history section with no unresolved task blocks' };
        }
      } else if (section.role) {
        outcome = { decision: 'live', reason: 'canonical live section' };
      } else {
        outcome = { decision: 'preserved', reason: 'unclassified section preserved verbatim' };
      }
      if (outcome.decision === 'archived') {
        const lines = constraintLines(section.body);
        for (const line of [...lines, ...uncertainCarry]) if (!carriedByFile[file].includes(line)) carriedByFile[file].push(line);
        const events = [
          lines.length ? `${lines.length} constraint line(s) carried forward verbatim` : '',
          uncertainCarry.length ? uncertainCarryClause(uncertainCarry) : '',
        ].filter(Boolean);
        if (events.length) outcome = { ...outcome, reason: `${outcome.reason}; ${events.join('; ')}` };
      }
      outcomes.set(section, outcome);
      classification[file].push({ file, heading: section.heading, line: section.line, role: section.role ?? (section.history ? 'history' : 'unknown'), ...outcome });
    }
  }

  const rendered: Record<SourceFile, string> = { handoff: '', tasks: '' };
  for (const [file, roles] of [['handoff', HANDOFF_SECTION_ROLES], ['tasks', TASKS_SECTION_ROLES]] as const) {
    const document = documents[file];
    const entries: { heading: string; body: string }[] = [];
    const renderedSections = new Set<SourceSection>();

    for (const def of roles) {
      if (def.role === 'preserved' || def.role === 'history') continue;
      const sections = document.sections.filter((section) => section.role === def.role && !section.history);
      const live = sections.filter((section) => outcomes.get(section)?.decision === 'live');
      if (!live.length) {
        missing.push(`${def.canonical} (${file}.md)`);
        continue;
      }
      for (const section of live) renderedSections.add(section);
      const heading = live[0].heading;
      // The selected objective keeps its original heading (including any suffix),
      // so only its body is re-emitted: the suffix is never duplicated into prose.
      const body = live.map((section) => section.body).filter(Boolean).join(`${document.nl}${document.nl}`);
      entries.push({ heading, body });
    }

    const preservedBlocks: string[] = [];
    let containerIndex = -1;
    for (const section of document.sections) {
      if (outcomes.get(section)?.decision !== 'preserved') continue;
      if (renderedSections.has(section)) continue;
      if (section.role === 'history') continue;
      if (section.role !== 'preserved') {
        preservedBlocks.push(`### ${section.heading}${document.nl}${document.nl}${demoteDescendantHeadings(section.body, document.nl)}`);
        continue;
      }
      // The `## Preserved context` container is re-emitted with its own body, minus
      // any nested history that becomes archivable once the container is re-read.
      const nested = nestedPlans.get(section) ?? { body: section.body, plans: [], carried: [] };
      for (const plan of nested.plans) classification[file].push(plan);
      for (const line of nested.carried) if (!carriedByFile[file].includes(line)) carriedByFile[file].push(line);
      containerIndex = preservedBlocks.push(refilterCarriedBlock(nested.body, document.nl)) - 1;
    }
    if (carriedByFile[file].length) {
      if (containerIndex >= 0) {
        preservedBlocks[containerIndex] = mergeCarriedBlock(preservedBlocks[containerIndex], carriedByFile[file], document.nl);
      } else {
        preservedBlocks.push(`### ${CARRIED_HEADING}${document.nl}${document.nl}${carriedByFile[file].map((line) => `- ${line}`).join(document.nl)}`);
      }
    }
    const preservedBody = preservedBlocks.filter(Boolean).join(`${document.nl}${document.nl}`);
    if (preservedBody) entries.push({ heading: 'Preserved context', body: preservedBody });

    const archived = classification[file].filter((plan) => plan.decision === 'archived');
    const existingHistory = document.sections
      .filter((section) => section.role === 'history' && !section.history)
      .map((section) => section.body)
      .filter(Boolean)
      .join(document.nl);
    const keptHistoryLines = existingHistory.split(/\r?\n/).map((line) => line.trim()).filter((line) => line && line !== HISTORY_NOTE);
    const freshEntries = archived
      .map((plan) => `- Archived \`${plan.heading}\` (line ${plan.line}): ${plan.reason}.`)
      .filter((entry) => !keptHistoryLines.includes(entry));
    if (keptHistoryLines.length || freshEntries.length) {
      entries.push({ heading: 'History', body: [...keptHistoryLines, ...freshEntries, HISTORY_NOTE].join(document.nl) });
    }

    const body = renderEntries(entries, document.nl);
    const preamble = document.preamble.trim() ? document.preamble.trimEnd() : `# ${file === 'handoff' ? 'Handoff' : 'Tasks'}`;
    rendered[file] = `${preamble}${document.nl}${body ? `${document.nl}${body}` : ''}${document.nl}`;
  }

  return {
    ok: true,
    blockedReasons: [],
    objectiveCandidates: candidates,
    selectedObjectiveId: selectedId,
    handoff: rendered.handoff,
    tasks: rendered.tasks,
    classification,
    carriedForward: [...new Set([...carriedByFile.handoff, ...carriedByFile.tasks])],
    missing,
    archiveRelPath,
    sizes: sizes(rendered.handoff.length, rendered.tasks.length),
  };
}
