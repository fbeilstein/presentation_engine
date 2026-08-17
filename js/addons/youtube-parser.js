import { SlideAddons } from '../slides-addons.js?v=2';

function parseDim(val) {
    if (!val || val === true) return '';
    return !isNaN(val) ? val + '%' : val;
}

SlideAddons.registerInlinePlugin('youtube', (args, config) => {
    let style = 'border: none; aspect-ratio: 16 / 9;';

    if (config.kv.left || config.kv.top || config.kv.absolute || config.kv.pos) {
        style += ' position: absolute;';
        if (config.kv.left) style += ` left: ${parseDim(config.kv.left)};`;
        if (config.kv.top) style += ` top: ${parseDim(config.kv.top)};`;
        if (config.kv.width) style += ` width: ${parseDim(config.kv.width)};`;
        if (config.kv.height) style += ` height: ${parseDim(config.kv.height)};`;
    } else {
        style += ` width: ${parseDim(config.kv.width) || '100%'};`;
        if (config.kv.height) style += ` height: ${parseDim(config.kv.height)};`;
    }

    if (config.kv.aspect) style += ` aspect-ratio: ${config.kv.aspect};`;
    
    // Inject the pure CSS leftover from `{}` block parsing
    if (config.css) style += ` ${config.css}`;

    const url = args.includes('youtube.com') ? args : `https://www.youtube.com/embed/${args}`;

    const classAttr = config.classes.length > 0 ? ` class="${config.classes.join(' ')}"` : '';

    return `<iframe${classAttr} style="${style.trim()}" src="${url}" title="YouTube video player" allowfullscreen></iframe>`;
});

SlideAddons.registerInlinePlugin('gdrive', (args, config) => {
    let style = 'border: none;';
    if (!config.kv.height) style += ' aspect-ratio: 16 / 9;';

    if (config.kv.left || config.kv.top || config.kv.absolute || config.kv.pos) {
        style += ' position: absolute;';
        if (config.kv.left && config.kv.left !== true) style += ` left: ${parseDim(config.kv.left)};`;
        if (config.kv.top && config.kv.top !== true) style += ` top: ${parseDim(config.kv.top)};`;
        if (config.kv.width && config.kv.width !== true) style += ` width: ${parseDim(config.kv.width)};`;
        if (config.kv.height && config.kv.height !== true) style += ` height: ${parseDim(config.kv.height)};`;
    } else {
        style += ` width: ${parseDim(config.kv.width) || '100%'};`;
        if (config.kv.height && config.kv.height !== true) style += ` height: ${parseDim(config.kv.height)};`;
    }

    if (config.kv.aspect) style += ` aspect-ratio: ${config.kv.aspect};`;

    if (config.css) style += ` ${config.css}`;

    const idMatch = args.match(/\/d\/([a-zA-Z0-9_-]+)/);
    const fileId = idMatch ? idMatch[1] : args;
    const url = `https://drive.google.com/file/d/${fileId}/preview`;

    const classAttr = config.classes.length > 0 ? ` class="${config.classes.join(' ')}"` : '';

    return `<iframe${classAttr} style="${style.trim()}" src="${url}" allow="autoplay" allowfullscreen></iframe>`;
});