/** Source-preserving Markdown helpers. Only real headings outside fences are interpreted. */
export function literalMarkdown(content: string, language = 'markdown'): string {
  let longest = 2;
  for (const match of content.matchAll(/`+/g)) longest = Math.max(longest, match[0].length);
  const fence = '`'.repeat(longest + 1);
  return `${fence}${language}\n${content}\n${fence}`;
}
export function markdownHeadings(text: string): Array<{ level: number; title: string; start: number; end: number }> {
  const headings = [];
  let fence: { char: string; length: number } | undefined;
  let offset = 0;
  for (const raw of text.match(/[^\n]*\n|[^\n]+$/g) || []) {
    const line = raw.replace(/\r?\n$/, '');
    const marker = line.match(/^ {0,3}(`{3,}|~{3,})(.*)$/);
    if (fence) {
      if (marker && marker[1][0] === fence.char && marker[1].length >= fence.length && !marker[2].trim()) fence = undefined;
    } else if (marker) fence = { char: marker[1][0], length: marker[1].length };
    else {
      const heading = line.match(/^ {0,3}(#{1,6})[ \t]+(.+?)(?:[ \t]+#+)?[ \t]*$/);
      if (heading) headings.push({ level: heading[1].length, title: heading[2], start: offset, end: offset + raw.length });
    }
    offset += raw.length;
  }
  return headings;
}
export function markdownSection(text: string, title: string): string | undefined {
  const headings = markdownHeadings(text);
  const index = headings.findIndex(h => h.level === 2 && h.title === title);
  if (index < 0) return undefined;
  const current = headings[index];
  const next = headings.slice(index + 1).find(h => h.level <= current.level);
  return text.slice(current.end, next?.start ?? text.length).trim();
}
export function appendContextRecord(original: string, title: string, body: string): string {
  const nl = original.includes('\r\n') ? '\r\n' : '\n';
  return `${original}${nl}${nl}## ${title}${nl}${nl}${body.replace(/\r?\n/g, nl)}${nl}`;
}
