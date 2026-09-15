import { StateField } from '@codemirror/state';
import { regionMapField } from './region-map.js';

function extractTitle(text) {
    const lines = text.split('\n');
    for (const line of lines) {
        if (line.trim().startsWith('#')) {
            return line.replace(/^#+\s*/, '').trim();
        }
    }
    return null;
}

export function buildOutline(state) {
    const regionMap = state.field(regionMapField, false);
    if (!regionMap || !regionMap.regions) return [];
    
    const doc = state.doc.toString();
    const slides = [];
    let globalIndex = 0;
    const localIndexCounters = {};
    
    function getRegionForOffset(offset) {
        let best = regionMap.regions[regionMap.regions.length - 1];
        for (const r of regionMap.regions) {
            if (offset >= r.from && offset < r.to) {
                if (r.type === 'include-directive') {
                    // The slide content actually starts in the included file.
                    // Advance offset to the start of the next region (the child file).
                    offset = r.to;
                    continue;
                }
                return r;
            }
        }
        return best;
    }
    
    const lines = doc.split('\n');
    let currentSlideFrom = 0;
    let currentOffset = 0;
    
    for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        if (line.trim() === '---') {
            if (currentOffset >= currentSlideFrom) {
                const text = doc.substring(currentSlideFrom, currentOffset);
                const nonWsIndex = text.search(/\S/);
                const targetOffset = nonWsIndex >= 0 ? currentSlideFrom + nonWsIndex : currentSlideFrom;
                const r = getRegionForOffset(targetOffset) || { file: 'unknown', fileStack: ['unknown'] };
                
                if (localIndexCounters[r.file] === undefined) localIndexCounters[r.file] = 0;
                
                slides.push({
                    globalIndex: globalIndex++,
                    from: currentSlideFrom,
                    to: currentOffset,
                    file: r.file,
                    fileStack: r.fileStack || [r.file],
                    localIndex: localIndexCounters[r.file]++,
                    title: extractTitle(text) || `Slide ${globalIndex}`
                });
            }
            currentSlideFrom = currentOffset + line.length + 1; // skip --- and newline
        }
        currentOffset += line.length + (i < lines.length - 1 ? 1 : 0);
    }
    
    if (currentOffset >= currentSlideFrom) {
        const text = doc.substring(currentSlideFrom, currentOffset);
        const nonWsIndex = text.search(/\S/);
        const targetOffset = nonWsIndex >= 0 ? currentSlideFrom + nonWsIndex : currentSlideFrom;
        const r = getRegionForOffset(targetOffset) || { file: 'unknown', fileStack: ['unknown'] };
        
        if (localIndexCounters[r.file] === undefined) localIndexCounters[r.file] = 0;
        
        slides.push({
            globalIndex: globalIndex++,
            from: currentSlideFrom,
            to: currentOffset,
            file: r.file,
            fileStack: r.fileStack || [r.file],
            localIndex: localIndexCounters[r.file]++,
            title: extractTitle(text) || `Slide ${globalIndex}`
        });
    }
    
    // Do NOT filter out any slides, because bridge.js does not filter them out when splitting by ---
    // If there is an empty slide, it will exist in both outline and bridge.js
    return slides;
}

export const outlineField = StateField.define({
    create(state) { return buildOutline(state); },
    update(outline, tr) {
        if (!tr.docChanged) return outline;
        return buildOutline(tr.state);
    }
});
