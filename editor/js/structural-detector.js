import { EditorView } from '@codemirror/view';
import { Transaction } from '@codemirror/state';
import { regionMapField, setRegionMap } from './region-map.js';
import { currentDocumentModel, currentFilePath } from './editor.js';
import { syncAnnotation } from './sync-filter.js';
import { computeChanges } from './diff-utils.js';

function findAllIncludes(doc) {
    const includes = [];
    const text = doc.toString();
    const lines = text.split('\n');
    for (const line of lines) {
        const match = line.match(/^\s*!include\((.+)\)\s*$/);
        if (match) {
            includes.push(line);
        }
    }
    return includes;
}

function arraysEqual(a, b) {
    if (a.length !== b.length) return false;
    for (let i = 0; i < a.length; i++) {
        if (a[i] !== b[i]) return false;
    }
    return true;
}

export const structuralDetector = EditorView.updateListener.of((update) => {
    if (!update.docChanged) return;
    if (!currentDocumentModel) return;
    
    const regionMap = update.state.field(regionMapField);
    
    // Scan the document for all current !include(...) lines
    const currentIncludes = findAllIncludes(update.state.doc);
    
    // Compare against the includes recorded in the current region map
    // We use startState because if the edit changed an include, it's not yet reflected in the regionMap
    // wait, regionMap is remapped (offsets changed) but the count/content of include regions remains the same until rebuild
    const previousIncludes = regionMap.regions
        .filter(r => r.type === 'include-directive')
        .map(r => update.state.doc.sliceString(r.from, r.to).trim());
        
    // wait, if we mapped pos, we should just use the new doc to see what the include directive text is NOW
    
    // Check if the actual count or content changed
    // Wait, `findAllIncludes` is a regex scan.
    // If the arrays are different, it means a structural change occurred.
    const changed = !arraysEqual(currentIncludes.map(s=>s.trim()), previousIncludes);
    
    if (changed) {
        scheduleStructuralRebuild(update.view);
    }
});

let rebuildTimer = null;
function scheduleStructuralRebuild(view) {
    if (rebuildTimer) clearTimeout(rebuildTimer);
    rebuildTimer = setTimeout(async () => {
        if (!currentDocumentModel) return;
        console.log("Structural change detected, rebuilding AST...");
        
        // 1. Ensure fileCache is perfectly up to date based on the current regions
        const map = view.state.field(regionMapField);
        currentDocumentModel.applyChangesToCache(map, { iterChangedRanges: () => {} }, view.state.doc); 
        // Wait, applyChangesToCache requires `changes`?
        // Actually, since `applyChangesToCache` runs on EVERY update synchronously in editor.js:
        // `currentDocumentModel.applyChangesToCache(map, update.changes, update.state.doc);`
        // The fileCache is already up to date with the user's typing!
        // We just need to trigger a re-fetch of the tree to load new files.
        
        await currentDocumentModel.loadRoot(currentFilePath);
        
        const { flatText, map: newMap } = currentDocumentModel.buildFlatText();
        
        // Check if flatText changed (e.g. new file content pulled in)
        const oldText = view.state.doc.toString();
        if (oldText !== flatText) {
            const diffChanges = computeChanges(oldText, flatText);
            console.log("oldText length:", oldText.length, "flatText length:", flatText.length);
            console.log("computeChanges produced:", JSON.stringify(diffChanges));
            
            view.dispatch({
                changes: diffChanges,
                effects: setRegionMap.of(newMap),
                annotations: [
                    syncAnnotation.of(true),
                    // Use addToHistory(false) so the structural expansion doesn't pollute the user's undo stack
                    Transaction.addToHistory.of(false)
                ]
            });
        } else {
            view.dispatch({
                effects: setRegionMap.of(newMap),
                annotations: syncAnnotation.of(true)
            });
        }
        
    }, 500); // Debounce
}
