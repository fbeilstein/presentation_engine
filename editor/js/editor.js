import { EditorState, StateEffect, Transaction } from '@codemirror/state';
import { EditorView, keymap, lineNumbers, gutter, GutterMarker, drawSelection, highlightActiveLineGutter, highlightActiveLine, crosshairCursor } from '@codemirror/view';
import { markdown } from '@codemirror/lang-markdown';
import { defaultKeymap, history, historyKeymap } from '@codemirror/commands';
import { syntaxHighlighting, defaultHighlightStyle, foldGutter, foldKeymap, foldService } from '@codemirror/language';
import { search, searchKeymap } from '@codemirror/search';
import { oneDark } from '@codemirror/theme-one-dark';

import { availableHtmlContexts } from './file-tree.js';
import { getFileColor, globalSlideMapping } from './outline.js';
import { initDocument, handleEditorChange, saveDocumentToDisk } from './document-differ.js';
import { regionMapField } from './region-map.js';
import { syncFilter } from './sync-filter.js';
import { endBoundaryDecorations } from './boundary-widgets.js';
import { structuralDetector } from './structural-detector.js';
import { outlineField } from './outline-ast.js';
import { outlineRendererPlugin } from './outline.js';

export let editorView = null;
export let currentFilePath = null;
export let currentDocumentModel = null;

export async function loadFileFromServer(path) {
    try {
        currentFilePath = path;
        currentDocumentModel = await initDocument(path, editorView);
        
        // Update file tree selection
        document.querySelectorAll('.tree-item').forEach(i => {
            if (i.dataset.path === path) {
                i.classList.add('selected');
            } else {
                i.classList.remove('selected');
            }
        });
        
        // Update presentation dropdown if present
        const select = document.getElementById('presentation-file-selector');
        if (select) {
            let found = false;
            for (let i = 0; i < select.options.length; i++) {
                if (select.options[i].value === path) {
                    found = true;
                    break;
                }
            }
            if (!found) {
                const opt = document.createElement('option');
                opt.value = path;
                opt.textContent = path;
                select.appendChild(opt);
            }
            select.value = path;
        }
        
        // Auto-load corresponding HTML preview
        if (path.endsWith('.html')) {
            const iframe = document.getElementById('preview-iframe');
            if (iframe) iframe.src = 'preview.html?context=' + path;
        }
        
        // Wrap model update
        const originalUpdate = currentDocumentModel.onModelUpdated;
        currentDocumentModel.onModelUpdated = () => {
            if (originalUpdate) originalUpdate();
        };
        
    } catch (e) {
        console.error("Failed to load file from server:", e);
    }
}

// A simple marker class for CM6 gutter
class StripeMarker extends GutterMarker {
    constructor(colors) {
        super();
        this.colors = colors;
    }
    toDOM() {
        const marker = document.createElement("div");
        marker.style.height = "100%";
        marker.style.minHeight = "18px";
        marker.style.display = "flex";
        marker.style.paddingLeft = "2px";
        
        this.colors.forEach(color => {
            const stripe = document.createElement("div");
            stripe.style.width = "4px";
            stripe.style.height = "100%";
            stripe.style.backgroundColor = color;
            stripe.style.marginLeft = "2px";
            marker.appendChild(stripe);
        });
        return marker;
    }
}

const stripeGutter = gutter({
    class: "include-stripes",
    lineMarker(view, line) {
        const map = view.state.field(regionMapField);
        if (!map || !map.regions.length) return null;
        
        const pos = line.from;
        
        // Find regions covering this line. We use exclusive `r.to > pos` to avoid overlapping boundaries
        let matchingRegions = map.regions.filter(r => r.from <= pos && r.to > pos);
        
        // If it's the very end of the document, the exclusive bound might miss it
        if (matchingRegions.length === 0) {
            const lastMatch = map.regions.find(r => r.to === pos);
            if (lastMatch) matchingRegions = [lastMatch];
        }
        
        if (matchingRegions.length === 0) return null;
        
        // Use the deepest region's fileStack to get all nested file colors
        const files = matchingRegions[0].fileStack || [matchingRegions[0].file];
        const colors = files.map(getFileColor);
        
        return new StripeMarker(colors);
    }
});

const customFoldService = foldService.of((state, lineStart, lineEnd) => {
    const line = state.doc.lineAt(lineStart);
    const text = line.text.trim();
    
    if (text === '---') {
        let endLine = line.number;
        while (endLine < state.doc.lines) {
            endLine++;
            const nextLine = state.doc.line(endLine);
            if (nextLine.text.trim() === '---') {
                return { from: line.to, to: nextLine.from - 1 };
            }
        }
        return { from: line.to, to: state.doc.length };
    }
    
    if (text.startsWith('!include(')) {
        const map = state.field(regionMapField, false);
        if (map) {
            const includeRegion = map.regions.find(r => r.type === 'include-directive' && r.from <= line.from && r.to >= line.from);
            if (includeRegion) {
                const nextRegion = map.regions.find(r => r.from === includeRegion.to);
                if (nextRegion && nextRegion.type === 'expanded-include') {
                    return { from: line.to, to: nextRegion.to };
                }
            }
        }
    }
    return null;
});

let editorExtensions = [];

export function initEditor() {
    const cmEditor = document.getElementById('cm-editor');
    
    editorExtensions = [
        lineNumbers(),
        foldGutter(),
        customFoldService,
        search({ top: true }),
        highlightActiveLineGutter(),
        drawSelection(),
        crosshairCursor(),
        EditorView.lineWrapping,
        highlightActiveLine(),
        oneDark,
        stripeGutter,
        history(),
        markdown(),
        keymap.of([
            ...defaultKeymap, 
            ...historyKeymap,
            ...foldKeymap,
            ...searchKeymap,
            { key: "Mod-s", run: () => { saveDocumentToDisk(editorView); return true; } }
        ]),
        regionMapField,
        syncFilter,
        endBoundaryDecorations,
        structuralDetector,
        outlineField,
        outlineRendererPlugin,
        EditorView.updateListener.of((update) => {
            if (update.docChanged) {
                if (currentDocumentModel) {
                    const map = update.state.field(regionMapField);
                    currentDocumentModel.applyChangesToCache(map, update.changes, update.state.doc);
                }
                handleEditorChange(editorView);
                pushCurrentSlide(false);
            }
            if (update.selectionSet) {
                pushCurrentSlide(true);
            }
        }),
        EditorView.domEventHandlers({
            paste: (e, view) => {
                const items = (e.clipboardData || e.originalEvent.clipboardData).items;
                for (let item of items) {
                    if (item.type.indexOf("image") === 0) {
                        e.preventDefault();
                        const blob = item.getAsFile();
                        showPasteModal(blob);
                        return true;
                    }
                }
                return false;
            }
        })
    ];
    
    const state = EditorState.create({
        doc: "",
        extensions: editorExtensions
    });
    
    editorView = new EditorView({
        state,
        parent: cmEditor
    });
    
    window.editorView = editorView;
}

export function loadFile(path, content) {
    currentFilePath = path;
    lastKnownSlideCount = (content.replace(/\r/g, '').match(/^---$/gm) || []).length;
    
    editorView.setState(EditorState.create({
        doc: content,
        extensions: editorExtensions
    }));
    
    
    if (path.endsWith('.html')) {
        const iframe = document.getElementById('preview-iframe');
        iframe.src = 'preview.html?context=' + path;
    }
}

let previewTimeout = null;

function pushCurrentSlide(immediate = false) {
    if (previewTimeout) {
        clearTimeout(previewTimeout);
        previewTimeout = null;
    }
    
    const doPush = () => {
        if (!currentDocumentModel || !editorView) return;
        const iframe = document.getElementById('preview-iframe');
        if (!iframe) return;
        
        const fullMarkdown = currentDocumentModel.getMergedMarkdown();
        const cursor = editorView.state.selection.main.head;
        const outline = editorView.state.field(outlineField, false);
        
        let activeIndex = 0;
        if (outline && outline.length > 0) {
            const match = outline.find(s => cursor >= s.from && cursor <= s.to);
            if (match) {
                activeIndex = match.globalIndex;
            } else {
                const before = outline.filter(s => s.to < cursor);
                if (before.length > 0) {
                    activeIndex = before[before.length - 1].globalIndex;
                }
            }
        }
        
        iframe.contentWindow.postMessage({
            type: 'editor_slide',
            markdown: fullMarkdown,
            activeIndex: activeIndex
        }, '*');
    };
    
    if (immediate) {
        doPush();
    } else {
        previewTimeout = setTimeout(doPush, 150);
    }
}

window.addEventListener('message', (e) => {
    if (e.data.type === 'presentation_loaded') {
        const { files, slides } = e.data;
        
        const select = document.getElementById('presentation-file-selector');
        if (files.length > 0 && select) {
            select.innerHTML = '<option value="" disabled>Select a markdown file...</option>';
            files.forEach(f => {
                const opt = document.createElement('option');
                opt.value = f;
                opt.textContent = f;
                select.appendChild(opt);
            });
            if (currentFilePath && files.includes(currentFilePath)) {
                select.value = currentFilePath;
            } else {
                let targetFile = files.find(f => f.endsWith('main.md')) || files.find(f => f.endsWith('.html')) || files[0];
                select.value = targetFile;
                loadFileFromServer(targetFile);
            }
            
            select.onchange = (ev) => {
                if (ev.target.value) {
                    jumpToFileInclude(ev.target.value);
                }
            };
        }
        
        
        pushCurrentSlide(true);
    } else if (e.data.type === 'navigate_slide') {
        const { index } = e.data;
        if (globalSlideMapping && globalSlideMapping[index]) {
            const slide = globalSlideMapping[index];
            if (editorView) {
                editorView.dispatch({
                    selection: { anchor: slide.from },
                    scrollIntoView: true
                });
                pushCurrentSlide(true);
            }
        }
    }
});

let pendingPasteBlob = null;
function showPasteModal(blob) {
    pendingPasteBlob = blob;
    const modal = document.getElementById('paste-modal');
    modal.classList.remove('hidden');
    
    if (currentFilePath) {
        const parts = currentFilePath.split('/');
        parts.pop();
        const defaultPath = parts.join('/') + '/assets/image_' + Date.now() + '.png';
        document.getElementById('paste-filename').value = defaultPath;
    }
}

document.addEventListener('DOMContentLoaded', () => {
    document.getElementById('btn-paste-cancel').addEventListener('click', () => {
        document.getElementById('paste-modal').classList.add('hidden');
        pendingPasteBlob = null;
    });
    
    const saveBtn = document.getElementById('save-btn');
    if (saveBtn) {
        saveBtn.addEventListener('click', async () => {
            const originalText = saveBtn.innerHTML;
            saveBtn.innerHTML = "⏳ Saving...";
            await saveDocumentToDisk(editorView);
            saveBtn.innerHTML = "✅ Saved!";
            setTimeout(() => {
                saveBtn.innerHTML = originalText;
            }, 2000);
        });
    }

    const clearJournalBtn = document.getElementById('clear-journal-btn');
    if (clearJournalBtn) {
        clearJournalBtn.addEventListener('click', async () => {
            if (confirm("Are you sure you want to clear the journal cache? Any unsaved changes will be lost and the page will reload.")) {
                try {
                    await fetch('/api/clear-journal', { method: 'POST' });
                    window.location.reload();
                } catch (e) {
                    alert("Failed to clear journal: " + e.message);
                }
            }
        });
    }
    
    document.getElementById('btn-paste-save').addEventListener('click', async () => {
        if (!pendingPasteBlob) return;
        const path = document.getElementById('paste-filename').value;
        const formData = new FormData();
        formData.append('path', path);
        formData.append('file', pendingPasteBlob);
        
        try {
            const res = await fetch('/api/upload', {
                method: 'POST',
                body: formData
            });
            if (res.ok) {
                document.getElementById('paste-modal').classList.add('hidden');
                
                const fileParts = currentFilePath.split('/');
                fileParts.pop();
                const fileDir = fileParts.join('/') + '/';
                let relPath = path;
                if (path.startsWith(fileDir)) {
                    relPath = path.substring(fileDir.length);
                } else {
                    relPath = '/' + path;
                }
                
                const snippet = `![Pasted Image](${relPath}){width=80% center}\n`;
                const cursor = editorView.state.selection.main.head;
                editorView.dispatch({
                    changes: { from: cursor, insert: snippet }
                });
            }
        } catch(e) {
            alert("Upload failed: " + e.message);
        }
    });
});

export function jumpToFileInclude(targetPath) {
    if (!editorView) return;
    const map = editorView.state.field(regionMapField);
    
    const region = map.regions.find(r => r.file === targetPath);
    if (region) {
        editorView.dispatch({
            selection: { anchor: region.from },
            scrollIntoView: true
        });
    }
}
