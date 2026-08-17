import { SlideAddons } from '../slides-addons.js?v=2';

SlideAddons.registerBlockPlugin('matrix', (config, body) => {
    const isDebug = config.kv.debug;

    const parseGridScale = (val) => {
        if (!val) return '';
        return val.split('/').map(c => {
            const trimmed = c.trim();
            if (!isNaN(trimmed) && trimmed !== '') return trimmed + '%';
            return trimmed;
        }).join(' ');
    };

    const gridCols = parseGridScale(config.kv.cols) || '1fr 1fr';
    const gridRows = parseGridScale(config.kv.rows) || 'auto';
    const gapStyle = config.kv.gap ? `gap: ${config.kv.gap};` : '';

    let containerStyle = `display: grid; grid-template-columns: ${gridCols}; grid-template-rows: ${gridRows}; ${gapStyle}`;
    if (isDebug) {
        containerStyle += ` outline: 2px dashed rgba(255, 0, 0, 0.5);`;
    }

    const parseDim = (val) => {
        if (!val) return '';
        if (!isNaN(val)) return val + '%';
        return val;
    };

    if (config.kv.left || config.kv.top || config.kv.pos || config.kv.absolute) {
        containerStyle += ` position: absolute;`;
        if (config.kv.left) containerStyle += ` left: ${parseDim(config.kv.left)};`;
        if (config.kv.top) containerStyle += ` top: ${parseDim(config.kv.top)};`;
    }

    if (config.kv.width) containerStyle += ` width: ${parseDim(config.kv.width)};`;
    if (config.kv.height) {
        containerStyle += ` height: ${parseDim(config.kv.height)};`;
        if (config.kv.height === '100%') containerStyle += ` flex-grow: 1;`;
    }

    if (config.css) containerStyle += ` ${config.css}`;

    const classAttr = config.classes.length > 0 ? ` matrix-container ${config.classes.join(' ')}` : ` matrix-container`;
    let htmlOut = `<div class="${classAttr.trim()}" style="${containerStyle}">\n\n`;

    const cellRegex = /^\[\[\s*([^,\]]+)(?:,\s*([^\]]+))?\s*\]\][ \t]*(?:\{([^}]+)\})?[ \t]*\r?\n?([\s\S]*?)(?=(?:^\[\[)|(?![\s\S]))/gm;

    const parseIndices = (idxStr) => {
        if (!idxStr) return '';
        const parts = idxStr.split(':');
        const start = parseInt(parts[0].trim()) + 1;
        if (parts.length > 1) {
            const end = parseInt(parts[1].trim()) + 1;
            return `${start} / ${end}`;
        }
        return `${start}`;
    };

    let cellsHtml = "";
    const cellMatches = Array.from(body.matchAll(cellRegex));
    for (const cellMatch of cellMatches) {
        const rowStr = parseIndices(cellMatch[1]);
        const colStr = parseIndices(cellMatch[2]);
        const attrStr = cellMatch[3] || "";
        const content = cellMatch[4].trim();

        const cellConfig = SlideAddons.parseConfigBlock(attrStr);
        const cssStyle = cellConfig.css;
        const classes = cellConfig.classes.join(' ');

        // Safely split the cell content by double-newlines, ignoring newlines inside blocks
        const cellLines = content.split('\n');
        const blocks = [];
        let currentBlock = [];
        let inCodeBlock = false;
        let inMathBlock = false;
        let containerDepth = 0;

        for (let j = 0; j < cellLines.length; j++) {
            const l = cellLines[j];
            const trimmed = l.trim();

            if (trimmed.startsWith('```')) inCodeBlock = !inCodeBlock;
            if (trimmed.startsWith('$$')) inMathBlock = !inMathBlock;
            if (trimmed.match(/^:::[a-zA-Z]+/)) containerDepth++;
            else if (trimmed === ':::') containerDepth = Math.max(0, containerDepth - 1);

            const isProtected = inCodeBlock || inMathBlock || containerDepth > 0;

            if (!isProtected && trimmed === '') {
                if (currentBlock.length > 0) {
                    blocks.push(currentBlock.join('\n'));
                    currentBlock = [];
                }
            } else {
                currentBlock.push(l);
            }
        }
        if (currentBlock.length > 0) {
            blocks.push(currentBlock.join('\n'));
        }
        let innerHtml = '';

        for (const block of blocks) {
            const isPureImageBlock = /^\s*(?:!\[[^\]]*\]\([^)]+\)(?:\s*\{[^}]+\})?|<img[^>]+>)\s*$/.test(block);

            if (isPureImageBlock) {
                innerHtml += `<div class="cell-media">\n\n${block}\n\n</div>\n`;
            } else {
                innerHtml += `<div class="cell-text">\n\n${block}\n\n</div>\n`;
            }
        }

        let cellStyle = `grid-row: ${rowStr};`;
        if (colStr) cellStyle += ` grid-column: ${colStr};`;
        if (cssStyle) cellStyle += ` ${cssStyle}`;
        if (isDebug) cellStyle += ` outline: 1px dashed rgba(0, 255, 0, 0.8); background: rgba(0, 255, 0, 0.05);`;

        const cellClassAttr = classes ? ` matrix-cell ${classes}` : ` matrix-cell`;
        cellsHtml += `<div class="${cellClassAttr.trim()}" style="${cellStyle}">\n${innerHtml}\n</div>\n\n`;
    }

    if (cellMatches.length === 0) {
        cellsHtml = `<div>\n\n${body}\n\n</div>`;
    }

    htmlOut += cellsHtml + `</div>\n`;
    return htmlOut;
});
