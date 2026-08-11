import { SlideAddons } from '../slides-addons.js?v=2';

// -----------------------------------------------------------------------------
// 1. Core Loader & Global Initializer
// -----------------------------------------------------------------------------
let scriptPromise = null;
function load3DmolScript() {
    if (window['3Dmol']) return Promise.resolve();
    if (scriptPromise) return scriptPromise;

    scriptPromise = new Promise((resolve, reject) => {
        const existing = document.getElementById('3dmol-script');
        if (existing) {
            existing.addEventListener('load', resolve);
            existing.addEventListener('error', reject);
            return;
        }
        const s = document.createElement('script');
        s.id = '3dmol-script';
        s.src = 'https://3dmol.org/build/3Dmol-min.js';
        s.onload = resolve;
        s.onerror = reject;
        document.head.appendChild(s);
    });
    return scriptPromise;
}

window.__init3Dmol = function(containerId, cfg) {
    const elem = document.getElementById(containerId);
    if (!elem || elem.dataset.initialized) return;

    const observer = new IntersectionObserver(async (entries) => {
        if (!entries[0].isIntersecting) return;
        observer.disconnect();

        if (elem.dataset.initialized) return;
        elem.dataset.initialized = 'true';

        try {
            await load3DmolScript();
            const viewer = window['3Dmol'].createViewer(elem, { backgroundColor: cfg.bg });

            let resizeAnimationFrame;
            new ResizeObserver(() => {
                cancelAnimationFrame(resizeAnimationFrame);
                resizeAnimationFrame = requestAnimationFrame(() => viewer.resize());
            }).observe(elem);

            const fetchUrl = cfg.isPdbId ? `https://files.rcsb.org/download/${cfg.pdbId}.pdb` : cfg.src;
            const res = await fetch(fetchUrl);
            if (!res.ok) throw new Error(`HTTP ${res.status} ${res.statusText}`);
            const data = await res.text();

            if (cfg.type === 'xyz') viewer.addModelsAsFrames(data, 'xyz');
            else viewer.addModel(data, cfg.type);

            const baseStyle = {};
            baseStyle[cfg.style] = cfg.color === 'element' ? {} : { color: cfg.color };
            viewer.setStyle({}, baseStyle);

            if (cfg.highlight) {
                const resiNums = cfg.highlight.map(n => parseInt(n, 10)).filter(n => !isNaN(n));
                const sel = { resi: resiNums };
                const hlStyleObj = {};
                hlStyleObj[cfg.hlStyle] = cfg.hlColor === 'element' ? {} : { color: cfg.hlColor };
                viewer.setStyle(sel, hlStyleObj);
                if (cfg.label) viewer.addResLabels(sel, { font: 'Arial', fontSize: 12, showBackground: true });
                if (cfg.zoomTo === 'highlight') viewer.zoomTo(sel, 500);
            }

            if (cfg.pockets && cfg.pockets.length > 0) {
                cfg.pockets.forEach(p => {
                    if (!p.resi || p.resi.length === 0) return;
                    const pocketSel = { resi: p.resi };
                    viewer.setStyle(pocketSel, { stick: {} });
                    viewer.addSurface(window['3Dmol'].SurfaceType.VDW, {
                        opacity: p.opacity,
                        color: p.color
                    }, pocketSel);
                });
            }

            if (cfg.zoomTo === 'all') viewer.zoomTo();
            if (cfg.spin) viewer.spin(true);
            viewer.render();

            if (cfg.animate) {
                viewer.animate({ loop: cfg.animate === 'backAndForth' ? 'backAndForth' : 'loop', interval: cfg.interval });
            }

            if (cfg.cube) {
                const cubeRes = await fetch(cfg.cube);
                const cubeData = await cubeRes.text();
                const vlist = new window['3Dmol'].VolumeData(cubeData, "cube");
                viewer.addIsosurface(vlist, { isoval: cfg.isoval, color: cfg.posColor, opacity: cfg.opacity });
                viewer.addIsosurface(vlist, { isoval: -cfg.isoval, color: cfg.negColor, opacity: cfg.opacity });
                viewer.render();
            }
        } catch (err) {
            console.error('[3Dmol Error]:', err);
        }
    });

    observer.observe(elem);
};

// -----------------------------------------------------------------------------
// 2. Preprocessor Output
// -----------------------------------------------------------------------------
function create3DmolEmbed(src, configStr) {
    const config = {};
    if (configStr) {
        for (const m of configStr.matchAll(/([a-zA-Z0-9_-]+)(?:=(?:"([^"]+)"|([^\s}]+)))?/g)) {
            config[m[1]] = m[2] !== undefined ? m[2] : (m[3] !== undefined ? m[3] : true);
        }
    }

    const parseDim = (val) => (!val || val === true) ? '' : (!isNaN(val) ? val + '%' : val);

    let style = 'position: relative; overflow: hidden; display: block;';

    if (config.left || config.top || config.absolute || config.pos) {
        style += ' position: absolute;';
        if (config.left && config.left !== true) style += ` left: ${parseDim(config.left)};`;
        if (config.top && config.top !== true) style += ` top: ${parseDim(config.top)};`;
        if (config.width && config.width !== true) style += ` width: ${parseDim(config.width)};`;
        if (config.height && config.height !== true) style += ` height: ${parseDim(config.height)};`;
    } else {
        // Fill the grid/matrix cell completely by default
        style += ` width: ${parseDim(config.width) || '100%'};`;
        style += ` height: ${parseDim(config.height) || '100%'};`;
        
        // Optional aspect ratio override only if explicitly requested
        if (config.aspect) {
            style += ` aspect-ratio: ${config.aspect};`;
        }
    }

    const containerId = 'mol3d_' + Math.random().toString(36).substring(2, 9);
    const cleanSrc = src.trim();
    const fileName = cleanSrc.split('/').pop(); 
    const isPdbId = /^[a-zA-Z0-9]{4}$/i.test(fileName) && !fileName.includes('.');
    
    const defaultPocketColor = config.pocketColor || 'lightblue';
    const defaultPocketOpacity = parseFloat(config.pocketOpacity) || 0.7;
    const pockets = config.pocket ? String(config.pocket).split(';').map(pSpec => {
        const parts = pSpec.split(':').map(s => s.trim());
        const resi = parts[0].split(',').map(n => parseInt(n.trim(), 10)).filter(n => !isNaN(n));
        const color = parts[1] || defaultPocketColor;
        const opacity = parts[2] ? parseFloat(parts[2]) : defaultPocketOpacity;
        return { resi, color, opacity };
    }) : [];


    const configObj = {
        src: cleanSrc,
        isPdbId,
        pdbId: isPdbId ? fileName.toUpperCase() : null,
        type: config.type || (isPdbId ? 'pdb' : fileName.split('.').pop().toLowerCase()),
        bg: config.bg || 'white',
        style: config.style || (fileName.endsWith('.xyz') ? 'stick' : 'cartoon'),
        color: config.color || (config.style === 'cartoon' ? 'lightgray' : 'element'),
        highlight: config.highlight ? String(config.highlight).split(',').map(s => s.trim()) : null,
        hlStyle: config.hlStyle || 'stick',
        hlColor: config.hlColor || 'element',
        label: config.label === true || config.label === 'true' || config.label === 'res',
        zoomTo: config.zoomTo || (config.highlight ? 'highlight' : 'all'),
        pockets: pockets,
        animate: config.animate || false,
        interval: parseInt(config.interval, 10) || 100,
        cube: config.cube || null,
        isoval: parseFloat(config.isoval) || 0.02,
        posColor: config.posColor || 'blue',
        negColor: config.negColor || 'red',
        opacity: parseFloat(config.opacity) || 0.65,
        spin: config.spin === true || config.spin === 'true'
    };

    return `<div id="${containerId}" style="${style}"></div><script>window.__init3Dmol('${containerId}', ${JSON.stringify(configObj)});</script>`;
}

export function parse3Dmol(markdown) {
    const mdRegex = /!\[3dmol\]\(([^)]+)\)(?:\s*\{([^}]*)\})?/gi;
    return markdown.replace(mdRegex, (match, src, configStr) => create3DmolEmbed(src, configStr));
}

SlideAddons.registerPreProcessor(parse3Dmol);
