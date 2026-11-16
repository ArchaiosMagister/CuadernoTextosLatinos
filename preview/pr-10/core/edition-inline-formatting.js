export function splitInlineItalics(input) {
    const output = [];
    const pattern = /\*([^*\n]+)\*/gu;
    let pos = 0, match;
    while ((match = pattern.exec(input)) !== null) {
        if (match.index > pos)
            output.push({ text: input.slice(pos, match.index), italic: false });
        output.push({ text: match[1], italic: true });
        pos = match.index + match[0].length;
    }
    if (pos < input.length)
        output.push({ text: input.slice(pos), italic: false });
    return output;
}
