import { SlideAddons } from '../slides-addons.js?v=2';

/**
 * NumPy Array Markdown Parser
 * Converts :::nparray \n [1, 2, 3] \n ::: into recursive HTML tables
 * matching the user's `visualize_array` logic from python.
 */

const color_A = [150, 200, 255];
const color_B = [75, 100, 170];

function toHex(c) {
    let hex = Math.round(c).toString(16);
    return hex.length === 1 ? '0' + hex : hex;
}

function getColor(level, maxLevels) {
    if (maxLevels === 0) return `#${toHex(color_A[0])}${toHex(color_A[1])}${toHex(color_A[2])}`;
    
    // Linearly interpolate between A and B
    // In python: mix = A * (level/max_levels) + B * (1 - level/max_levels)
    const ratioA = level / maxLevels;
    const ratioB = 1.0 - ratioA;
    
    const r = color_A[0] * ratioA + color_B[0] * ratioB;
    const g = color_A[1] * ratioA + color_B[1] * ratioB;
    const b = color_A[2] * ratioA + color_B[2] * ratioB;
    
    return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
}

function encloseElement(element, idxUp, idxDown) {
    return `\t<td class="np-td">${element}<span class="np-up">${idxUp}</span><span class="np-down">${idxDown}</span></td>`;
}

function horizontalTbl(array, color) {
    let result = `<table class="np-table" style="background-color: ${color};"><tr>\n`;
    const maxCount = array.length;
    array.forEach((e, idx) => {
        result += encloseElement(e, idx, idx - maxCount) + '\n';
    });
    result += '</tr></table>\n';
    return result;
}

function verticalTbl(array, color) {
    let result = `<table class="np-table" style="background-color: ${color};">\n`;
    const maxCount = array.length;
    array.forEach((e, idx) => {
        result += `<tr>${encloseElement(e, idx, idx - maxCount)}</tr>\n`;
    });
    result += '</table>\n';
    return result;
}

function getDepth(arr) {
    return Array.isArray(arr) ? 1 + Math.max(0, ...arr.map(getDepth)) : 0;
}

function recursiveTbl(array, parity, maxLevels, level = 0) {
    const depth = getDepth(array);
    
    if (depth === 1) {
        return horizontalTbl(array, getColor(0, 0)); // Base color A for 1D arrays
    }
    
    const color = getColor(level, maxLevels);
    
    if (parity) {
        let items = array.map(x => recursiveTbl(x, !parity, maxLevels, level + 1));
        return horizontalTbl(items, color);
    } else {
        let items = array.map(x => recursiveTbl(x, !parity, maxLevels, level + 1));
        return verticalTbl(items, color);
    }
}

export function parseNumpy(markdown) {
    const npRegex = /:::nparray\s*[\r\n]+([\s\S]*?)[\r\n]+:::/g;
    
    return markdown.replace(npRegex, (match, body) => {
        try {
            // Very naive python list to JSON string converter
            // Replaces python booleans, etc if needed, but for now just parse array
            const cleanStr = body.trim().replace(/'/g, '"'); 
            const array = JSON.parse(cleanStr);
            
            const depth = getDepth(array);
            const parity = depth % 2 === 1;
            const maxLevels = depth - 1;
            
            const html = recursiveTbl(array, parity, maxLevels);
            
            return `
<div class="numpy-visualizer">
<style>.numpy-visualizer table.np-table { border-collapse: collapse; margin: 0 auto; border-spacing: 0; } .numpy-visualizer td.np-td { border: 3px solid #666666; min-width: 30px; height: 30px; position: relative; text-align: center; color: #212121; font-size: 20px; font-weight: bolder; padding: 19px; background-clip: padding-box; } .numpy-visualizer .np-up { position: absolute; right: 2px; top: 0px; text-align: right; font-size: 14px; font-family: monospace; font-weight: bolder; color: blue; } .numpy-visualizer .np-down { position: absolute; right: 2px; bottom: 0px; text-align: right; font-size: 14px; font-family: monospace; font-weight: bolder; color: red; }</style>
${html}
</div>
`;
        } catch (e) {
            return `> **Error parsing numpy array:** \`${e.message}\`\n\n\`\`\`json\n${body}\n\`\`\``;
        }
    });
}

SlideAddons.registerPreProcessor(parseNumpy);
