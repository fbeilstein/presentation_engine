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
SlideAddons.registerInlinePlugin('3dmol', (args, config) => {
    const parseDim = (val) => (!val || val === true) ? '' : (!isNaN(val) ? val + '%' : val);

    let style = 'position: relative; overflow: hidden; display: block;';

    if (config.kv.left || config.kv.top || config.kv.absolute || config.kv.pos) {
        style += ' position: absolute;';
        if (config.kv.left && config.kv.left !== true) style += ` left: ${parseDim(config.kv.left)};`;
        if (config.kv.top && config.kv.top !== true) style += ` top: ${parseDim(config.kv.top)};`;
        if (config.kv.width && config.kv.width !== true) style += ` width: ${parseDim(config.kv.width)};`;
        if (config.kv.height && config.kv.height !== true) style += ` height: ${parseDim(config.kv.height)};`;
    } else {
        // Fill the grid/matrix cell completely by default
        style += ` width: ${parseDim(config.kv.width) || '100%'};`;
        style += ` height: ${parseDim(config.kv.height) || '100%'};`;
        
        // Optional aspect ratio override only if explicitly requested
        if (config.kv.aspect) {
            style += ` aspect-ratio: ${config.kv.aspect};`;
        }
    }

    if (config.css) style += ` ${config.css}`;

    const containerId = 'mol3d_' + Math.random().toString(36).substring(2, 9);
    const cleanSrc = args.trim();
    const fileName = cleanSrc.split('/').pop(); 
    const isPdbId = /^[a-zA-Z0-9]{4}$/i.test(fileName) && !fileName.includes('.');
    
    const defaultPocketColor = config.kv.pocketColor || 'lightblue';
    const defaultPocketOpacity = parseFloat(config.kv.pocketOpacity) || 0.7;
    const pockets = config.kv.pocket ? String(config.kv.pocket).split(';').map(pSpec => {
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
        type: config.kv.type || (isPdbId ? 'pdb' : fileName.split('.').pop().toLowerCase()),
        bg: config.kv.bg || 'white',
        style: config.kv.style || (fileName.endsWith('.xyz') ? 'stick' : 'cartoon'),
        color: config.kv.color || (config.kv.style === 'cartoon' ? 'lightgray' : 'element'),
        highlight: config.kv.highlight ? String(config.kv.highlight).split(',').map(s => s.trim()) : null,
        hlStyle: config.kv.hlStyle || 'stick',
        hlColor: config.kv.hlColor || 'element',
        label: config.kv.label === true || config.kv.label === 'true' || config.kv.label === 'res',
        zoomTo: config.kv.zoomTo || (config.kv.highlight ? 'highlight' : 'all'),
        pockets: pockets,
        animate: config.kv.animate || false,
        interval: parseInt(config.kv.interval, 10) || 100,
        cube: config.kv.cube || null,
        isoval: parseFloat(config.kv.isoval) || 0.02,
        posColor: config.kv.posColor || 'blue',
        negColor: config.kv.negColor || 'red',
        opacity: parseFloat(config.kv.opacity) || 0.65,
        spin: config.kv.spin === true || config.kv.spin === 'true'
    };
    
    const classAttr = config.classes.length > 0 ? ` class="${config.classes.join(' ')}"` : '';

    return `<div id="${containerId}"${classAttr} style="${style.trim()}"></div><script>window.__init3Dmol('${containerId}', ${JSON.stringify(configObj).replace(/'/g, "\\'")});</script>`;
});
