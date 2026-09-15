import { DocumentModel } from './document-model.js';
import { setRegionMap } from './region-map.js';
import { syncAnnotation } from './sync-filter.js';
import { Transaction } from '@codemirror/state';

let currentModel = null;
let saveTimeout = null;
let lastKnownJournalPatch = null;

// Lightweight file-based journal
function createJournalPatch(fileCache) {
    return { type: "fileCache", cache: fileCache };
}

export async function initDocument(path, cmView) {
    currentModel = new DocumentModel();
    currentModel.onModelUpdated = () => {
        const { flatText, map } = currentModel.buildFlatText();
        if (cmView.state.doc.toString() !== flatText) {
            cmView.dispatch({
                changes: { from: 0, to: cmView.state.doc.length, insert: flatText },
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
    };
    await currentModel.loadRoot(path);
    
    // Check for journal recovery
    try {
        const res = await fetch('/api/journal');
        if (res.ok) {
            const data = await res.json();
            if (data.journal && data.journal.length > 0) {
                const lastPatch = data.journal[data.journal.length - 1];
                if (lastPatch.type === "fileCache" && lastPatch.cache && (path in lastPatch.cache)) {
                    console.log("Recovering from journal...");
                    currentModel.fileCache = lastPatch.cache;
                    if (currentModel.onModelUpdated) currentModel.onModelUpdated();
                } else {
                    console.log("Journal belongs to a different file, ignoring.");
                }
            }
        }
    } catch (e) {
        console.error("Failed to load journal", e);
    }
    
    return currentModel;
}

export function handleEditorChange(cmView) {
    if (!currentModel) return;
    
    // 1. Debounce and coalesce changes for journal
    clearTimeout(saveTimeout);
    saveTimeout = setTimeout(async () => {
        const currentText = cmView.state.doc.toString();
        
        // 3. Save to journal
        const patch = createJournalPatch(currentModel.fileCache);
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
