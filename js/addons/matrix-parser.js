import { SlideAddons } from '../slides-addons.js?v=2';

/**
 * Markdown Matrix Parser Plugin
 * Pre-processes custom `:::matrix` syntax into standard HTML CSS grids before marked.js parses.
 */

export function parseMatrices(markdown) {
    const lines = markdown.split('\n');
    const outputLines = [];
    let i = 0;

    while (i < lines.length) {
        const line = lines[i];
        const match = line.match(/^:::matrix\s*\{([^}]*)\}\s*$/);

        if (match) {
            const configStr = match[1];
            let nestDepth = 1;
            const bodyLines = [];
            i++;

            while (i < lines.length && nestDepth > 0) {
                const currentLine = lines[i];
                if (currentLine.match(/^:::[a-zA-Z]+/)) {
                    nestDepth++;
                } else if (currentLine.match(/^:::\s*$/)) {
                    nestDepth--;
                }
                
                if (nestDepth > 0) {
                    bodyLines.push(currentLine);
                }
                i++;
            }
            
            const body = bodyLines.join('\n');

            // Parse config map: cols="1/1" rows="auto" gap="2%" or height=100%
            const isDebug = configStr.includes('debug');
            const config = {};
            const configMatches = configStr.matchAll(/(\w+)=(?:"([^"]+)"|([^\s}]+))/g);
            for (const m of configMatches) {
                config[m[1]] = m[2] !== undefined ? m[2] : m[3];
            }

            const parseGridScale = (val) => {
                if (!val) return '';
                return val.split('/').map(c => {
                    const trimmed = c.trim();
                    if (!isNaN(trimmed) && trimmed !== '') return trimmed + '%';
                    return trimmed;
                }).join(' ');
            };

            const gridCols = parseGridScale(config.cols) || '1fr 1fr';
            const gridRows = parseGridScale(config.rows) || 'auto';
            const gapStyle = config.gap ? `gap: ${config.gap};` : '';

            let containerStyle = `display: grid; grid-template-columns: ${gridCols}; grid-template-rows: ${gridRows}; ${gapStyle}`;
            if (isDebug) {
                containerStyle += ` outline: 2px dashed rgba(255, 0, 0, 0.5);`;
            }

            const parseDim = (val) => {
                if (!val) return '';
                if (!isNaN(val)) return val + '%';
                return val;
            };

            if (config.left || config.top || config.pos || config.absolute) {
                containerStyle += ` position: absolute;`;
                if (config.left) containerStyle += ` left: ${parseDim(config.left)};`;
                if (config.top) containerStyle += ` top: ${parseDim(config.top)};`;
            }

            if (config.width) containerStyle += ` width: ${parseDim(config.width)};`;
            if (config.height) {
                containerStyle += ` height: ${parseDim(config.height)};`;
                if (config.height === '100%') containerStyle += ` flex-grow: 1;`;
            }

            if (config.style) containerStyle += ` ${config.style}`;

            let htmlOut = `<div class="matrix-container" style="${containerStyle}">\n\n`;

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

                const classMatches = attrStr.match(/\.[\w-]+/g) || [];
                const classes = classMatches.map(c => c.substring(1)).join(' ');
                const cssStyle = attrStr.replace(/\.[\w-]+/g, '').trim();

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

                const classAttr = classes ? ` matrix-cell ${classes}` : ` matrix-cell`;
                cellsHtml += `<div class="${classAttr.trim()}" style="${cellStyle}">\n${innerHtml}\n</div>\n\n`;
            }

            if (cellMatches.length === 0) {
                cellsHtml = `<div>\n\n${body}\n\n</div>`;
            }

            htmlOut += cellsHtml + `</div>\n`;
            outputLines.push(htmlOut);
        } else {
            outputLines.push(line);
            i++;
        }
    }

    return outputLines.join('\n');
}

SlideAddons.registerPreProcessor(parseMatrices);
