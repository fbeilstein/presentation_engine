import { SlideAddons } from '../slides-addons.js?v=3';

function parseDim(val) {
    if (!val || val === true) return '';
    return !isNaN(val) ? val + '%' : val;
}

SlideAddons.registerInlinePlugin('youtube', (args, config) => {
    let style = 'border: none; aspect-ratio: 16 / 9;';

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
    
    let isMuted = false;
    let isAutoplay = false;
    let hasControls = true;

    if (config.kv.mute === '1' || config.kv.mute === 'true') isMuted = true;
    if (config.kv.autoplay === '1' || config.kv.autoplay === 'true') isAutoplay = true;

    if (config.css) {
        if (/\bmute\b/i.test(config.css)) {
            isMuted = true;
            config.css = config.css.replace(/\bmute\b/ig, '');
        }
        if (/\bautoplay\b/i.test(config.css)) {
            isAutoplay = true;
            config.css = config.css.replace(/\bautoplay\b/ig, '');
        }
        if (/\bnocontrols\b/i.test(config.css)) {
            hasControls = false;
            config.css = config.css.replace(/\bnocontrols\b/ig, '');
        }
        style += ` ${config.css}`;
    }

    let videoId = args;
    const idMatch = args.match(/(?:youtube\.com\/(?:[^\/]+\/.+\/|(?:v|e(?:mbed)?)\/|.*[?&]v=)|youtu\.be\/)([^"&?\/\s]{11})/i);
    if (idMatch) {
        videoId = idMatch[1];
    }

    let start = config.kv.start;
    if (!start) {
        const tMatch = args.match(/[?&](?:t|start)=([a-zA-Z0-9]+)/);
        if (tMatch) {
            const tStr = tMatch[1];
            if (/^\d+$/.test(tStr)) {
                start = parseInt(tStr, 10);
            } else {
                let sec = 0;
                let m = tStr.match(/(\d+)h/i); if (m) sec += parseInt(m[1], 10) * 3600;
                m = tStr.match(/(\d+)m/i); if (m) sec += parseInt(m[1], 10) * 60;
                m = tStr.match(/(\d+)s/i); if (m) sec += parseInt(m[1], 10);
                if (sec > 0) start = sec;
            }
        }
    }
    
    let end = config.kv.end;

    let params = new URLSearchParams();
    if (start) params.append('start', start);
    if (end) params.append('end', end);
    if (isMuted) params.append('mute', 1);
    if (isAutoplay) params.append('autoplay', 1);
    if (!hasControls) params.append('controls', 0);
    
    const paramStr = params.toString();
    const url = `https://www.youtube.com/embed/${videoId}${paramStr ? '?' + paramStr : ''}`;

    const classAttr = config.classes.length > 0 ? ` class="${config.classes.join(' ')}"` : '';

    return `<iframe${classAttr} style="${style.trim()}" src="${url}" title="YouTube video player" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" allowfullscreen></iframe>`;
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