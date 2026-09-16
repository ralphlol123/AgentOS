export interface UnifiedDiffFile {
  path: string;
  before: string;
  after: string;
}

interface DiffLine {
  text: string;
  ending: '' | '\n' | '\r' | '\r\n';
}

interface DiffOperation {
  kind: 'equal' | 'delete' | 'insert';
  line: DiffLine;
  oldIndex: number;
  newIndex: number;
}

const NO_DIFFERENCES = 'No differences: proposed live files are unchanged.';

function linesOf(text: string): DiffLine[] {
  const lines: DiffLine[] = [];
  const endings = /\r\n|\n|\r/g;
  let start = 0;
  for (let match = endings.exec(text); match; match = endings.exec(text)) {
    lines.push({ text: text.slice(start, match.index), ending: match[0] as DiffLine['ending'] });
    start = match.index + match[0].length;
  }
  if (start < text.length) lines.push({ text: text.slice(start), ending: '' });
  return lines;
}

function equalLine(left: DiffLine, right: DiffLine): boolean {
  return left.text === right.text && left.ending === right.ending;
}

function sameContent(left: DiffLine, right: DiffLine): boolean {
  return left.text === right.text;
}

function withPositions(operations: Array<{ kind: DiffOperation['kind']; line: DiffLine }>): DiffOperation[] {
  let oldPosition = 0;
  let newPosition = 0;
  return operations.map(({ kind, line }) => {
    const operation = { kind, line, oldIndex: oldPosition, newIndex: newPosition };
    if (kind !== 'insert') oldPosition++;
    if (kind !== 'delete') newPosition++;
    return operation;
  });
}

function mapValue(map: Map<number, number>, key: number): number {
  return map.get(key) ?? Number.NEGATIVE_INFINITY;
}

const MAX_MYERS_TRACE_CELLS = 16_384;

function replacementOperations(before: DiffLine[], after: DiffLine[]): DiffOperation[] {
  return withPositions([
    ...before.map((line) => ({ kind: 'delete' as const, line })),
    ...after.map((line) => ({ kind: 'insert' as const, line })),
  ]);
}

function alignedMiddleOperations(before: DiffLine[], after: DiffLine[]): DiffOperation[] {
  if (before.length === 0) return withPositions(after.map((line) => ({ kind: 'insert' as const, line })));
  if (after.length === 0) return withPositions(before.map((line) => ({ kind: 'delete' as const, line })));
  const afterContent = new Set(after.map((line) => line.text));
  if (!before.some((line) => afterContent.has(line.text))) return replacementOperations(before, after);

  const trace: Map<number, number>[] = [];
  const furthest = new Map<number, number>([[1, 0]]);
  const maximum = before.length + after.length;
  let traceCells = 0;

  for (let distance = 0; distance <= maximum; distance++) {
    if (traceCells + furthest.size > MAX_MYERS_TRACE_CELLS) return replacementOperations(before, after);
    traceCells += furthest.size;
    trace.push(new Map(furthest));
    for (let diagonal = -distance; diagonal <= distance; diagonal += 2) {
      let oldIndex: number;
      if (diagonal === -distance
        || (diagonal !== distance && mapValue(furthest, diagonal - 1) < mapValue(furthest, diagonal + 1))) {
        oldIndex = mapValue(furthest, diagonal + 1);
      } else {
        oldIndex = mapValue(furthest, diagonal - 1) + 1;
      }
      let newIndex = oldIndex - diagonal;
      while (oldIndex < before.length && newIndex < after.length
        && sameContent(before[oldIndex], after[newIndex])) {
        oldIndex++;
        newIndex++;
      }
      furthest.set(diagonal, oldIndex);
      if (oldIndex >= before.length && newIndex >= after.length) {
        const reversed: Array<{ kind: DiffOperation['kind']; line: DiffLine }> = [];
        let oldCursor = before.length;
        let newCursor = after.length;

        for (let backDistance = distance; backDistance >= 0; backDistance--) {
          const previous = trace[backDistance];
          const currentDiagonal = oldCursor - newCursor;
          const previousDiagonal = currentDiagonal === -backDistance
            || (currentDiagonal !== backDistance
              && mapValue(previous, currentDiagonal - 1) < mapValue(previous, currentDiagonal + 1))
            ? currentDiagonal + 1
            : currentDiagonal - 1;
          const previousOld = previous.get(previousDiagonal) ?? 0;
          const previousNew = previousOld - previousDiagonal;

          while (oldCursor > previousOld && newCursor > previousNew) {
            const oldLine = before[oldCursor - 1];
            const newLine = after[newCursor - 1];
            if (equalLine(oldLine, newLine)) {
              reversed.push({ kind: 'equal', line: oldLine });
            } else {
              reversed.push({ kind: 'insert', line: newLine });
              reversed.push({ kind: 'delete', line: oldLine });
            }
            oldCursor--;
            newCursor--;
          }
          if (backDistance === 0) break;
          if (oldCursor === previousOld) {
            reversed.push({ kind: 'insert', line: after[newCursor - 1] });
            newCursor--;
          } else {
            reversed.push({ kind: 'delete', line: before[oldCursor - 1] });
            oldCursor--;
          }
        }

        return withPositions(reversed.reverse());
      }
    }
  }
  return [];
}

function alignedOperations(before: DiffLine[], after: DiffLine[]): DiffOperation[] {
  let prefixLength = 0;
  while (prefixLength < before.length && prefixLength < after.length
    && equalLine(before[prefixLength], after[prefixLength])) {
    prefixLength++;
  }

  let suffixLength = 0;
  while (suffixLength < before.length - prefixLength && suffixLength < after.length - prefixLength
    && equalLine(before[before.length - suffixLength - 1], after[after.length - suffixLength - 1])) {
    suffixLength++;
  }

  const beforeMiddleEnd = before.length - suffixLength;
  const afterMiddleEnd = after.length - suffixLength;
  const middle = alignedMiddleOperations(
    before.slice(prefixLength, beforeMiddleEnd),
    after.slice(prefixLength, afterMiddleEnd),
  );
  return withPositions([
    ...before.slice(0, prefixLength).map((line) => ({ kind: 'equal' as const, line })),
    ...middle.map(({ kind, line }) => ({ kind, line })),
    ...before.slice(beforeMiddleEnd).map((line) => ({ kind: 'equal' as const, line })),
  ]);
}

function hunkRegions(operations: DiffOperation[], context: number): Array<{ start: number; end: number }> {
  const regions: Array<{ start: number; end: number }> = [];
  for (let index = 0; index < operations.length; index++) {
    if (operations[index].kind === 'equal') continue;
    const candidate = {
      start: Math.max(0, index - context),
      end: Math.min(operations.length, index + context + 1),
    };
    const previous = regions.at(-1);
    if (previous && candidate.start <= previous.end) previous.end = Math.max(previous.end, candidate.end);
    else regions.push(candidate);
  }
  return regions;
}

function range(start: number, count: number): string {
  return count === 1 ? String(start) : `${start},${count}`;
}

function pushDiffLine(rendered: string[], prefix: ' ' | '-' | '+', line: DiffLine): void {
  rendered.push(`${prefix}${line.text}${line.ending.includes('\r') ? '\r' : ''}`);
  if (line.ending === '') rendered.push('\\ No newline at end of file');
}

/** Render a deterministic, in-process unified diff with three lines of context. */
export function renderUnifiedDiff(files: UnifiedDiffFile[], context = 3): string {
  const rendered: string[] = [];
  for (const file of files) {
    if (file.before === file.after) continue;
    const operations = alignedOperations(linesOf(file.before), linesOf(file.after));
    const regions = hunkRegions(operations, context);
    if (regions.length === 0) continue;

    rendered.push(`--- a/${file.path}`, `+++ b/${file.path}`);
    for (const region of regions) {
      const hunk = operations.slice(region.start, region.end);
      const oldCount = hunk.filter((operation) => operation.kind !== 'insert').length;
      const newCount = hunk.filter((operation) => operation.kind !== 'delete').length;
      const oldIndex = operations[region.start]?.oldIndex ?? 0;
      const newIndex = operations[region.start]?.newIndex ?? 0;
      const oldStart = oldCount === 0 ? oldIndex : oldIndex + 1;
      const newStart = newCount === 0 ? newIndex : newIndex + 1;
      rendered.push(`@@ -${range(oldStart, oldCount)} +${range(newStart, newCount)} @@`);
      for (const operation of hunk) {
        const prefix = operation.kind === 'equal' ? ' ' : operation.kind === 'delete' ? '-' : '+';
        pushDiffLine(rendered, prefix, operation.line);
      }
    }
  }
  return rendered.length === 0 ? NO_DIFFERENCES : `${rendered.join('\n')}\n`;
}
