import { SlideAddons } from '../slides-addons.js?v=2';

SlideAddons.registerBlockPlugin('static-diagram', (config, body) => {
    try {
        const diagramConfig = JSON.parse(body.trim());
        const width = diagramConfig.width || 800;
        const height = diagramConfig.height || 400;

        let svgHtml = `<svg viewBox="0 0 ${width} ${height}" preserveAspectRatio="xMidYMid meet" style="width: 100%; height: auto; background: ${diagramConfig.background || 'transparent'}; font-family: 'Inter', system-ui, sans-serif;">\n`;

        // 1. Define Markers (Arrows)
        svgHtml += `<defs>
            <marker id="arrowhead" markerWidth="10" markerHeight="7" refX="9" refY="3.5" orient="auto">
                <polygon points="0 0, 10 3.5, 0 7" fill="${diagramConfig.linkColor || '#999'}" />
            </marker>
        </defs>\n`;

        // 2. Render Groups (Containers)
        if (diagramConfig.groups) {
            diagramConfig.groups.forEach(g => {
                svgHtml += `<rect x="${g.x}" y="${g.y}" width="${g.width}" height="${g.height}" fill="${g.fill || 'rgba(0,0,0,0.05)'}" stroke="${g.stroke || '#ccc'}" stroke-dasharray="${g.dashed ? '5,5' : 'none'}" rx="10" />\n`;
                if (g.label) {
                    svgHtml += `<text x="${g.x + g.width / 2}" y="${g.y + g.height + 25}" text-anchor="middle" fill="${g.color || '#444'}" font-size="13px" font-weight="bold">${g.label}</text>\n`;
                }
            });
        }

        // 3. Render Links (Edges)
        if (diagramConfig.links) {
            diagramConfig.links.forEach(l => {
                const pathStr = Array.isArray(l.path) 
                    ? `M ${l.path[0].x} ${l.path[0].y} ` + l.path.slice(1).map(p => `L ${p.x} ${p.y}`).join(' ')
                    : `M ${l.from.x} ${l.from.y} L ${l.to.x} ${l.to.y}`;

                let extraAttr = '';
                if (l.dashed) extraAttr += 'stroke-dasharray="5,5" ';
                if (l.arrow) extraAttr += 'marker-end="url(#arrowhead)" ';

                svgHtml += `<path d="${pathStr}" stroke="${diagramConfig.linkColor || '#999'}" stroke-width="2" fill="none" ${extraAttr}/>\n`;

                if (l.label && Array.isArray(l.path) && l.path.length >= 2) {
                    const p1 = l.path[0], p2 = l.path[1];
                    const midX = (p1.x + p2.x) / 2;
                    const midY = (p1.y + p2.y) / 2;
                    svgHtml += `<text x="${midX}" y="${midY - 5}" text-anchor="middle" fill="#666" font-size="12px" background="white">${l.label}</text>\n`;
                }
            });
        }

        // 4. Render Nodes (Entities)
        if (diagramConfig.nodes) {
            diagramConfig.nodes.forEach(n => {
                const w = n.width || 120;
                const h = n.height || 40;
                const fill = n.fill || "#fff";
                const stroke = n.stroke || "#333";
                
                svgHtml += `<g transform="translate(${n.x || 0}, ${n.y || 0})">\n`;
                
                if (n.type === 'cylinder') {
                    const rx = w / 2;
                    const ry = 10;
                    const d = `M 0 ${ry} A ${rx} ${ry} 0 0 1 ${w} ${ry} L ${w} ${h - ry} A ${rx} ${ry} 0 0 1 0 ${h - ry} Z`;
                    svgHtml += `<path d="${d}" fill="${fill}" stroke="${stroke}" stroke-width="2" />\n`;
                    svgHtml += `<ellipse cx="${rx}" cy="${ry}" rx="${rx}" ry="${ry}" fill="${fill}" stroke="${stroke}" stroke-width="2" />\n`;
                } else {
                    const rx = n.type === 'pill' ? h / 2 : 4;
                    svgHtml += `<rect x="0" y="0" width="${w}" height="${h}" rx="${rx}" fill="${fill}" stroke="${stroke}" stroke-width="2" />\n`;
                }

                svgHtml += `<text x="${w/2}" y="${h/2 + 5}" text-anchor="middle" fill="${n.color || '#333'}" font-size="${n.fontSize || '14px'}" font-weight="500">${n.label}</text>\n`;
                svgHtml += `</g>\n`;
            });
        }

        svgHtml += `</svg>`;

        let containerStyle = 'margin-top: 20px;';
        if (config.css) containerStyle += ` ${config.css}`;
        const classAttr = config.classes.length > 0 ? ` static-diagram-wrapper ${config.classes.join(' ')}` : ` static-diagram-wrapper`;

        return `<div class="${classAttr.trim()}" style="${containerStyle.trim()}">${svgHtml}</div>`;
    } catch (err) {
        console.error('Failed to parse static-diagram JSON:', err);
        return `<div style="color: #c62828;">Error rendering diagram.<br>${err.message}</div>`;
    }
});
