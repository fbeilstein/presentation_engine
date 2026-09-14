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
    
    for (let i = 0; i < regionMap.regions.length; i++) {
        const r = regionMap.regions[i];
        
        if (r.type === 'html-preamble' || r.type === 'html-postamble') continue;
        
        if (r.type === 'include-directive') {
            continue;
        }
        
        if (r.type === 'markdown-content' || r.type === 'expanded-include') {
            if (localIndexCounters[r.file] === undefined) {
                localIndexCounters[r.file] = 0;
            }
            
            const regionText = doc.substring(r.from, r.to);
            const lines = regionText.split('\n');
            let currentSlideFrom = r.from;
            let currentOffset = r.from;
            
            for (let j = 0; j < lines.length; j++) {
                const line = lines[j];
                const isBreak = line.trim() === '---';
                
                if (isBreak) {
                    // Close current slide
                    if (currentOffset > currentSlideFrom) {
                        slides.push({
                            globalIndex: globalIndex++,
                            from: currentSlideFrom,
                            to: currentOffset,
                            file: r.file,
                            fileStack: r.fileStack || [r.file],
                            localIndex: localIndexCounters[r.file],
                            title: extractTitle(doc.substring(currentSlideFrom, currentOffset)) || `Slide ${globalIndex}`,
                            isImplicitBreak: false
                        });
                    }
                    localIndexCounters[r.file]++;
                    currentSlideFrom = currentOffset + line.length + 1; // +1 for newline
                }
                
                currentOffset += line.length + (j < lines.length - 1 ? 1 : 0);
            }
            
            // Push remaining content as a slide
            if (currentOffset > currentSlideFrom) {
                slides.push({
                    globalIndex: globalIndex++,
                    from: currentSlideFrom,
                    to: currentOffset,
                    file: r.file,
                    fileStack: r.fileStack || [r.file],
                    localIndex: localIndexCounters[r.file],
                    title: extractTitle(doc.substring(currentSlideFrom, currentOffset)) || `Slide ${globalIndex}`,
                    isImplicitBreak: true
                });
            }
        }
    }
    
    // Deduplication of empty slides
    // The policy says: "When two !include directives are back-to-back, the adjacent breaks collapse into a single slide break — no empty slide is created between them"
    // Wait, with the logic above, if we have:
    // !include(a.md)
    // !include(b.md)
    // There are NO characters between them (just the directives which we skipped).
    // The previous region ends right where the next region starts. 
    // `currentOffset > currentSlideFrom` prevents pushing empty slides.
    // If a slide is just whitespace or empty, should we remove it?
    // Let's filter out completely empty slides or whitespace-only slides that don't have explicit --- boundaries.
    // Actually, `currentOffset > currentSlideFrom` ensures it has text, but it could be just whitespace.
    // The outline expects a dense array. 
    
    return slides.filter(s => {
        const text = doc.substring(s.from, s.to).trim();
        return text.length > 0 || !s.isImplicitBreak; 
        // Keep explicit empty slides (between ---), but remove implicit empty slides.
    });
}

export const outlineField = StateField.define({
    create(state) { return buildOutline(state); },
    update(outline, tr) {
        if (!tr.docChanged) return outline;
        return buildOutline(tr.state);
    }
});
