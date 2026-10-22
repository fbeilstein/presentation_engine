import { SlideAddons } from '../slides-addons.js?v=4';

/**
 * Transforms typography dashes in text content:
 *  - "---" → "—" (em-dash / long dash, U+2014)
 *  - "--"  → "–" (en-dash / smaller dash, U+2013)
 *
 * Safe-guards:
 *  - Slide breaks / thematic breaks (`---` alone on a line) are strictly PRESERVED.
 *  - Markdown table delimiter rows (`| --- | --- |`, `|:---|---:|`) are strictly PRESERVED.
 *  - HTML comments (`<!-- ... -->`) are preserved to prevent corrupting comments/markers.
 *  - Fenced code blocks (```...```) and inline code (`...`) are preserved.
 *  - `<script>` and `<style>` blocks are preserved.
 *  - HTML tags and attributes (especially CSS custom properties like `var(--text-color)`) are preserved.
 *  - MathJax blocks (`$$...$$` and `$...$`) are preserved.
 *  - Markdown link URLs (`[label](url)`) are preserved.
 *  - Attribute blocks (`{...}`) containing `--` are preserved.
 *  - ASCII arrows (`-->`, `<--`, `<-->`) are preserved.
 */
export function formatTypography(md) {
    if (!md || typeof md !== 'string') return md;

    const placeholders = [];
    const pushPlaceholder = (match) => {
        const id = `\x00TYPO_${placeholders.length}\x00`;
        placeholders.push(match);
        return id;
    };

    // 1. Protect slide separators / thematic breaks (lines containing only 3 or more dashes)
    let text = md.replace(/^[ \t]*-{3,}[ \t]*$/gm, pushPlaceholder);

    // 2. Protect Markdown table delimiter rows (e.g. "| --- | --- |", "|:---|:---:|", "---|---")
    text = text.replace(/^[ \t]*\|?(?:[ \t]*:?-+:?[ \t]*\|)+[ \t]*(?::?-+:?)?[ \t]*$/gm, pushPlaceholder);

    // 3. Protect HTML comments
    text = text.replace(/<!--[\s\S]*?-->/g, pushPlaceholder);

    // 4. Protect script and style tags
    text = text.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, pushPlaceholder);
    text = text.replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, pushPlaceholder);

    // 5. Protect fenced code blocks (``` or ~~~)
    text = text.replace(/(```[\s\S]*?```|~~~[\s\S]*?~~~)/g, pushPlaceholder);

    // 6. Protect inline code (`...`)
    text = text.replace(/(`+[^`\n]+?`+)/g, pushPlaceholder);

    // 7. Protect MathJax formulas ($$...$$ and $...$)
    text = text.replace(/(\$\$[\s\S]*?\$\$)/g, pushPlaceholder);
    text = text.replace(/(\$[^\$\n]+?\$)/g, pushPlaceholder);

    // 8. Protect markdown link destinations: [text](url)
    text = text.replace(/(\[[^\]]*\]\()([^)]+)(\))/g, (m, p1, p2, p3) => {
        return p1 + pushPlaceholder(p2) + p3;
    });

    // 9. Protect HTML tags & attributes (prevents replacing CSS vars like var(--bg-color))
    text = text.replace(/<[^>]+>/g, pushPlaceholder);

    // 10. Protect directive/image attribute blocks (e.g. {style="--color: red"} or {.custom--class})
    text = text.replace(/\{[^{}\n]*--[^{}\n]*\}/g, pushPlaceholder);

    // 11. Protect ASCII arrows (e.g. -->, <--, <-->)
    text = text.replace(/(<--+>|<--+|--+>)/g, pushPlaceholder);

    // Typography conversion: long dash first, then short dash
    text = text.replace(/---/g, '—');
    text = text.replace(/--/g, '–');

    // Restore protected placeholders in reverse order.
    // Use replacer function `() => val` so '$' characters in MathJax or regex are never swallowed.
    for (let i = placeholders.length - 1; i >= 0; i--) {
        text = text.replace(`\x00TYPO_${i}\x00`, () => placeholders[i]);
    }

    return text;
}

SlideAddons.registerPreProcessor(formatTypography);
