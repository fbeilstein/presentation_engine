import { SlideAddons } from '../slides-addons.js?v=2';

function parseDim(val) {
    if (!val || val === true) return '';
    return !isNaN(val) ? val + '%' : val;
}

SlideAddons.registerInlinePlugin('image', (args, config, altText) => {
    let style = '';
    if (config.kv.left || config.kv.top || config.kv.absolute || config.kv.pos) {
        style += 'position: absolute; ';
        if (config.kv.left && config.kv.left !== true) style += `left: ${parseDim(config.kv.left)}; `;
        if (config.kv.top && config.kv.top !== true) style += `top: ${parseDim(config.kv.top)}; `;
        if (config.kv.width && config.kv.width !== true) style += `width: ${parseDim(config.kv.width)}; `;
        if (config.kv.height && config.kv.height !== true) style += `height: ${parseDim(config.kv.height)}; `;
    } else {
        if (config.kv.width && config.kv.width !== true) style += `width: ${parseDim(config.kv.width)}; `;
        if (config.kv.height && config.kv.height !== true) style += `height: ${parseDim(config.kv.height)}; `;

        if (config.kv.center) {
            style += 'display: block; margin-left: auto; margin-right: auto; ';
        } else if (config.kv.right) {
            style += 'display: block; margin-left: auto; margin-right: 0; ';
        }
    }

    if (config.kv.aspect) style += `aspect-ratio: ${config.kv.aspect}; `;
    style += 'object-fit: contain; ';

    if (config.css) style += config.css;

    const classAttr = config.classes.length > 0 ? ` class="${config.classes.join(' ')}"` : '';

    return `<img src="${args}" alt="${altText}"${classAttr} style="${style.trim()}">`;
});
