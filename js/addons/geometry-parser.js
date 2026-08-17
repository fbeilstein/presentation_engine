import { SlideAddons } from '../slides-addons.js?v=2';

function parseDim(val) {
    if (val === undefined || val === null) return '';
    const str = String(val).trim();
    if (!isNaN(str) && str !== '') return str + '%';
    return str;
}

function parsePoint(str) {
    if (!str) return [null, null];
    const parts = str.trim().split(/\s+/);
    return parts.map(parseDim);
}

function getBaseSvg(config) {
    let style = "position: absolute; top: 0; left: 0; width: 100%; height: 100%; pointer-events: none; overflow: visible; z-index: 10;";
    if (config.css) {
        style += ` ${config.css}`;
    }
    const classAttr = config.classes.length > 0 ? ` class="geometry-overlay ${config.classes.join(' ')}"` : ` class="geometry-overlay"`;
    return `<svg${classAttr} style="${style}">`;
}

// ARROW
SlideAddons.registerInlinePlugin('arrow', (args, config) => {
    const parts = args.split('->');
    if (parts.length !== 2) return '';
    const [x1, y1] = parsePoint(parts[0]);
    const [x2, y2] = parsePoint(parts[1]);

    const stroke = config.kv.color || config.kv.stroke || "red";
    const width = config.kv.width || "2px";
    
    let pathStyle = `stroke: ${stroke}; stroke-width: ${width}; fill: none;`;
    if (config.kv.dashed) {
        pathStyle += ' stroke-dasharray: 5,5;';
    }

    const markerId = 'arrowhead_' + Math.random().toString(36).substring(2, 9);
    
    return `${getBaseSvg(config)}
        <defs>
            <marker id="${markerId}" markerWidth="10" markerHeight="7" refX="9" refY="3.5" orient="auto">
                <polygon points="0 0, 10 3.5, 0 7" fill="${stroke}" />
            </marker>
        </defs>
        <line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" style="${pathStyle}" marker-end="url(#${markerId})" />
    </svg>`;
});

// LINE
SlideAddons.registerInlinePlugin('line', (args, config) => {
    const parts = args.split('->');
    if (parts.length !== 2) return '';
    const [x1, y1] = parsePoint(parts[0]);
    const [x2, y2] = parsePoint(parts[1]);

    const stroke = config.kv.color || config.kv.stroke || "red";
    const width = config.kv.width || "2px";
    
    let pathStyle = `stroke: ${stroke}; stroke-width: ${width}; fill: none;`;
    if (config.kv.dashed) {
        pathStyle += ' stroke-dasharray: 5,5;';
    }

    return `${getBaseSvg(config)}
        <line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" style="${pathStyle}" />
    </svg>`;
});

// RECT
SlideAddons.registerInlinePlugin('rect', (args, config) => {
    const [x, y, w, h] = parsePoint(args);
    if (!x || !y || !w || !h) return '';

    const stroke = config.kv.color || config.kv.stroke || "none";
    const width = config.kv.width || "2px";
    const fill = config.kv.fill || "transparent";
    const rx = config.kv.radius || "0";
    
    let pathStyle = `stroke: ${stroke}; stroke-width: ${width}; fill: ${fill};`;
    if (config.kv.dashed) {
        pathStyle += ' stroke-dasharray: 5,5;';
    }

    return `${getBaseSvg(config)}
        <rect x="${x}" y="${y}" width="${w}" height="${h}" rx="${rx}" ry="${rx}" style="${pathStyle}" />
    </svg>`;
});

// CIRCLE
SlideAddons.registerInlinePlugin('circle', (args, config) => {
    const [cx, cy, r] = parsePoint(args);
    if (!cx || !cy || !r) return '';

    const stroke = config.kv.color || config.kv.stroke || "none";
    const width = config.kv.width || "2px";
    const fill = config.kv.fill || "transparent";
    
    let pathStyle = `stroke: ${stroke}; stroke-width: ${width}; fill: ${fill};`;
    if (config.kv.dashed) {
        pathStyle += ' stroke-dasharray: 5,5;';
    }

    return `${getBaseSvg(config)}
        <circle cx="${cx}" cy="${cy}" r="${r}" style="${pathStyle}" />
    </svg>`;
});

// TEXT
SlideAddons.registerInlinePlugin('text', (args, config) => {
    const parts = args.trim().split(/\s+/);
    if (parts.length < 3) return '';
    const x = parseDim(parts[0]);
    const y = parseDim(parts[1]);
    let text = parts.slice(2).join(' ').trim();
    
    // Strip wrapping quotes if present
    if ((text.startsWith('"') && text.endsWith('"')) || (text.startsWith("'") && text.endsWith("'"))) {
        text = text.substring(1, text.length - 1);
    }

    let style = `position: absolute; left: ${x}; top: ${y}; pointer-events: none;`;
    
    // Support common kv attributes
    if (config.kv.color) style += ` color: ${config.kv.color};`;
    if (config.kv.size) style += ` font-size: ${config.kv.size};`;
    if (config.kv.align) style += ` text-align: ${config.kv.align};`;
    
    if (config.css) {
        style += ` ${config.css}`;
    }

    const classAttr = config.classes.length > 0 ? ` class="geometry-text-overlay ${config.classes.join(' ')}"` : ` class="geometry-text-overlay"`;

    return `<div${classAttr} style="${style}">${text}</div>`;
});
