import { DocumentModel } from './document-model.js';
import { setRegionMap } from './region-map.js';
import { syncAnnotation } from './sync-filter.js';
import { Transaction } from '@codemirror/state';
import { computeChanges } from './diff-utils.js';

let currentModel = null;
let saveTimeout = null;
let lastKnownJournalPatch = null;

// Lightweight file-based journal
function createJournalPatch(rootFile, fileCache) {
    return { type: "fileCache", rootFile: rootFile, cache: fileCache };
}

export async function initDocument(path, cmView) {
    currentModel = new DocumentModel();
    await currentModel.loadRoot(path);
    
    // Initial load update
    const { flatText, map } = currentModel.buildFlatText();
    if (cmView.state.doc.toString() !== flatText) {
        const diffChanges = computeChanges(cmView.state.doc.toString(), flatText);

        cmView.dispatch({
            changes: diffChanges,
            effects: setRegionMap.of(map),
            annotations: [
                syncAnnotation.of(true),
                Transaction.addToHistory.of(false)
            ]
        });
    } else {
        cmView.dispatch({
            effects: setRegionMap.of(map),
            annotations: syncAnnotation.of(true)
        });
    }
    
    // Check for journal recovery
    try {
        const res = await fetch('/api/journal');
        const data = await res.json();
        if (data.journal && data.journal.length > 0) {
            console.log("Recovering from journal...");
            const lastState = data.journal[data.journal.length - 1];
            if (lastState.type === "fileCache") {
                if (lastState.cache[path] !== undefined) {
                    currentModel.fileCache = lastState.cache;
                    
                    // Trigger view update for journal recovery
                    const { flatText, map } = currentModel.buildFlatText();
                    if (cmView.state.doc.toString() !== flatText) {
                        const diffChanges = computeChanges(cmView.state.doc.toString(), flatText);
                        cmView.dispatch({
                            changes: diffChanges,
                            effects: setRegionMap.of(map),
                            annotations: [
                                syncAnnotation.of(true),
                                Transaction.addToHistory.of(false)
                            ]
                        });
                    } else {
                        cmView.dispatch({
                            effects: setRegionMap.of(map),
                            annotations: syncAnnotation.of(true)
                        });
                    }
                } else {
                    console.log("Journal belongs to a different root file. Clearing journal.");
                    fetch('/api/clear-journal', { method: 'POST' });
                }
            }
        }
    } catch (e) {
        console.error("Journal recovery failed", e);
    }
    
    return currentModel;
}

export function handleEditorChange(cmView) {
    if (!currentModel) return;
    
    // 1. Debounce and coalesce changes for journal
    clearTimeout(saveTimeout);
    saveTimeout = setTimeout(async () => {
        // --- NEW LOGIC: Fetch missing includes dynamically ---
        let fetched = await currentModel.fetchMissingIncludes();
        if (fetched) {
            const { flatText, map } = currentModel.buildFlatText();
            if (cmView.state.doc.toString() !== flatText) {
                const diffChanges = computeChanges(cmView.state.doc.toString(), flatText);
                cmView.dispatch({
                    changes: diffChanges,
                    effects: setRegionMap.of(map),
                    annotations: [
                        syncAnnotation.of(true),
                        Transaction.addToHistory.of(false)
                    ]
                });
            } else {
                cmView.dispatch({
                    effects: setRegionMap.of(map),
                    annotations: syncAnnotation.of(true)
                });
            }
        }
        // ---------------------------------------------------
        
        const currentText = cmView.state.doc.toString();
        
        // 3. Save to journal
        const patch = createJournalPatch(currentModel.rootFile, currentModel.fileCache);
        try {
            await fetch('/api/journal', {
                method: 'POST',
                headers: {'Content-Type': 'application/json'},
                body: JSON.stringify({ journal: [patch] })
            });
        } catch (e) {
            console.error("Journal save failed", e);
        }
        
        // 4. Fire preview update event
        window.dispatchEvent(new CustomEvent('editor-content-changed', {
            detail: { content: currentText }
        }));
    }, 500);
}

export async function saveDocumentToDisk(cmView) {
    if (!currentModel) return;
    const decomposed = currentModel.decompose();
    
    for (const [file, content] of Object.entries(decomposed)) {
        if (!content && content !== "") continue;
        try {
            const res = await fetch('/api/file', {
                method: 'POST',
                headers: {'Content-Type': 'application/json'},
                body: JSON.stringify({path: file, content: content})
            });
            if (!res.ok) throw new Error("Server returned " + res.status);
        } catch (e) {
            alert(`Error saving ${file}: ` + e.message);
        }
    }
    
    // Clear journal after successful save
    try {
        await fetch('/api/journal', {
            method: 'POST',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({ journal: [] })
        });
    } catch (e) {}
}
