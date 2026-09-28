import { SlideAddons } from '../slides-addons.js?v=4';

SlideAddons.registerBlockPlugin('react', (config, body) => {
    // Parse dimensions: numbers without units default to %
    function parseDim(val) {
        if (val === undefined || val === null || val === '') return '';
        if (!isNaN(val)) return val + '%';
        return val;
    }

    const dims = config.css.split(/\s+/).filter(Boolean);
    const x = parseDim(dims[0]) || '0%';
    const y = parseDim(dims[1]) || '0%';
    const w = parseDim(dims[2]) || '100%';
    const h = parseDim(dims[3]) || '100%';

    const uniqueId = 'react_' + Math.random().toString(36).substring(2, 9);
    const classAttr = config.classes.length > 0 ? ` class="${config.classes.join(' ')}"` : '';
    
    let style = `position: absolute; left: ${x}; top: ${y}; width: ${w}; height: ${h}; cursor: ${config.kv.cursor || 'pointer'}; z-index: ${config.kv['z-index'] || '20'};`;
    if (config.kv.opacity !== undefined) {
        style += ` opacity: ${config.kv.opacity};`;
    }
    
    if (config.kv.debug) {
        style += ` border: 2px dashed red; background-color: rgba(255, 0, 0, 0.2);`;
    }
    
    const hoverColor = config.kv.hover || 'rgba(255, 255, 255, 0.1)';
    const hoverStyle = `<style>#${uniqueId}:hover { background-color: ${hoverColor} !important; }</style>`;

    return `${hoverStyle}
<div id="${uniqueId}"${classAttr} style="${style}"></div>
<script>
// Defer execution slightly to ensure the DOM element has been injected via innerHTML
setTimeout(() => {
    const el = document.getElementById('${uniqueId}');
    if (el) {
        ${body}
    }
}, 10);
</script>`;
});

SlideAddons.registerEditorTool('react', {
    setupShape: () => {
        return `<svg style="width:100%; height:100%; pointer-events:none;">
            <rect id="preview-shape" x="0" y="0" width="0" height="0" fill="rgba(255,0,0,0.2)" stroke="red" stroke-width="2" stroke-dasharray="5,5" display="none" />
        </svg>`;
    },
    onMouseDown: (localX, localY, shape) => {
        shape.setAttribute('x', localX);
        shape.setAttribute('y', localY);
        shape.setAttribute('width', 0);
        shape.setAttribute('height', 0);
        shape.style.display = 'block';
    },
    onMouseMove: (localX, localY, shape, startCoords) => {
        const x = Math.min(localX, startCoords.localX);
        const y = Math.min(localY, startCoords.localY);
        const w = Math.abs(localX - startCoords.localX);
        const h = Math.abs(localY - startCoords.localY);
        shape.setAttribute('x', x);
        shape.setAttribute('y', y);
        shape.setAttribute('width', w);
        shape.setAttribute('height', h);
    }
});
