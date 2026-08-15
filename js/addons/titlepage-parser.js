import { SlideAddons } from '../slides-addons.js?v=2';

// Dynamically inject the CSS for the titlepage addon
const ENGINE_JS_DIR = new URL('.', import.meta.url);
const CSS_URL = new URL('../../css/addons/titlepage.css?v=1', ENGINE_JS_DIR).href;
if (!document.querySelector(`link[href="${CSS_URL}"]`)) {
    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = CSS_URL;
    document.head.appendChild(link);
}

/**
 * Parses parameters like { color="red" background="url(...)" }
 */
function parseOptions(attrStr) {
    const options = {};
    const regex = /([a-zA-Z0-9_-]+)="([^"]*)"/g;
    let match;
    while ((match = regex.exec(attrStr)) !== null) {
        options[match[1]] = match[2];
    }
    return options;
}

SlideAddons.registerPreProcessor((markdown) => {
    // Match :::titlepage { options } ... :::
    const titlepageRegex = /^:::titlepage\s*(?:\{(.*?)\})?\s*\n([\s\S]*?)\n:::/gm;
    
    return markdown.replace(titlepageRegex, (match, attrStr, body) => {
        const options = parseOptions(attrStr || "");
        
        let styleStr = "";
        for (const [key, value] of Object.entries(options)) {
            // Support passing arbitrary CSS properties directly (e.g. background="blue" color="white")
            styleStr += `${key}: ${value}; `;
        }
        
        // Parse named slots like [[top]], [[title]], etc.
        const slots = {};
        const slotRegex = /^\[\[([a-z]+)\]\]\s*\n([\s\S]*?)(?=\n\[\[|$)/gm;
        let slotMatch;
        while ((slotMatch = slotRegex.exec(body)) !== null) {
            slots[slotMatch[1]] = slotMatch[2].trim();
        }
        
        // Generate the responsive background HTML template.
        // We inject empty lines (\n\n) around the content so that marked.js 
        // processes markdown (like bolding, lists, math) inside the HTML divs.
        return `<div class="titlepage-bg" style="${styleStr}">
<div class="tp-top">

${slots['top'] || ''}

</div>
<div class="tp-center-group">
<div class="tp-title">

${slots['title'] || ''}

</div>
<div class="tp-subcaption">

${slots['subcaption'] || ''}

</div>
</div>
<div class="tp-middle">
<div class="tp-left">

${slots['left'] || ''}

</div>
<div class="tp-right">

${slots['right'] || ''}

</div>
</div>
<div class="tp-bottom">

${slots['bottom'] || ''}

</div>
</div>`;
    });
});
