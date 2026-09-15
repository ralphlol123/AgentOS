/** Source-preserving Markdown helpers. Only real headings outside fences are interpreted. */
export function literalMarkdown(content, language = 'markdown') {
    let longest = 2;
    for (const match of content.matchAll(/`+/g))
        longest = Math.max(longest, match[0].length);
    const fence = '`'.repeat(longest + 1);
    return `${fence}${language}\n${content}\n${fence}`;
}
export function markdownHeadings(text) {
    const headings = [];
    let fence;
    let offset = 0;
    for (const raw of text.match(/[^\n]*\n|[^\n]+$/g) || []) {
        const line = raw.replace(/\r?\n$/, '');
        const marker = line.match(/^ {0,3}(`{3,}|~{3,})(.*)$/);
        if (fence) {
            if (marker && marker[1][0] === fence.char && marker[1].length >= fence.length && !marker[2].trim())
                fence = undefined;
        }
        else if (marker)
            fence = { char: marker[1][0], length: marker[1].length };
        else {
            const heading = line.match(/^ {0,3}(#{1,6})[ \t]+(.+?)(?:[ \t]+#+)?[ \t]*$/);
            if (heading)
                headings.push({ level: heading[1].length, title: heading[2], start: offset, end: offset + raw.length });
        }
        offset += raw.length;
    }
    return headings;
}
/** True when a fence opener is never closed; such sources cannot be split reliably. */
export function hasUnclosedFence(text) {
    let fence;
    for (const raw of text.match(/[^\n]*\n|[^\n]+$/g) || []) {
        const line = raw.replace(/\r?\n$/, '');
        const marker = line.match(/^ {0,3}(`{3,}|~{3,})(.*)$/);
        if (fence) {
            if (marker && marker[1][0] === fence.char && marker[1].length >= fence.length && !marker[2].trim())
                fence = undefined;
        }
        else if (marker)
            fence = { char: marker[1][0], length: marker[1].length };
    }
    return Boolean(fence);
}
export function markdownSection(text, title) {
    const headings = markdownHeadings(text);
    const index = headings.findIndex(h => h.level === 2 && h.title === title);
    if (index < 0)
        return undefined;
    const current = headings[index];
    const next = headings.slice(index + 1).find(h => h.level <= current.level);
    return text.slice(current.end, next?.start ?? text.length).trim();
}
export function appendContextRecord(original, title, body) {
    const nl = original.includes('\r\n') ? '\r\n' : '\n';
    return `${original}${nl}${nl}## ${title}${nl}${nl}${body.replace(/\r?\n/g, nl)}${nl}`;
}
//# sourceMappingURL=markdown.js.map