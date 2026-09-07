import { availableHtmlContexts } from './file-tree.js';

import { renderGlobalOutline } from './outline.js';

export let editorView = null;
export let currentFilePath = null;
let saveTimeout = null;


export async function loadFileFromServer(path) {
    try {
        const res = await fetch('/api/file?path=' + encodeURIComponent(path));
        const data = await res.json();
        loadFile(path, data.content);
        
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
                select.innerHTML = '';
                const opt = document.createElement('option');
                opt.value = path;
                opt.textContent = path;
                select.appendChild(opt);
            }
            select.value = path;
        }
    } catch (e) {
        console.error("Failed to load file from server:", e);
    }
}

export function initEditor() {
    const parent = document.getElementById('editor-container');
    const textarea = document.getElementById('markdown-editor');
    
    // CodeMirror 6 basic setup from CDN exports 'CM' global if we included the bundled version,
    // but the CDN link we used was just the scripts. 
    // Wait, let's use the CM5 CDN for simplicity, as it's easier to drop in via script tags without a bundler.
    // I need to adjust index.html to use CM5 if I didn't already. (I used 6.65.7 which might be CM5 versioning actually, wait CM5 latest is 5.65.x. Yes, 5.65.17 is the latest 5.x. Let me check the index.html). 
    // Assuming CM5 for now based on the `CodeMirror` global.
    
    editorView = CodeMirror.fromTextArea(textarea, {
        mode: "markdown",
        lineNumbers: true,
        lineWrapping: true,
        theme: "default", // we will override colors in CSS
        extraKeys: {
            "Ctrl-S": function(cm) { saveCurrentFile(); },
            "Cmd-S": function(cm) { saveCurrentFile(); }
        }
    });
    window.editorView = editorView;
    
    editorView.on('change', () => {
        // Debounce preview update and auto-save
        clearTimeout(saveTimeout);
        saveTimeout = setTimeout(async () => {
            await saveCurrentFile(true);
            updatePreview();
        }, 500);
        
        // Update outline synchronously
        window.dispatchEvent(new CustomEvent('editor-content-changed', {
            detail: { content: editorView.getValue() }
        }));
    });
    
    editorView.on('cursorActivity', () => {
        syncPreviewToCursor();
    });

    // btn-save was removed in favor of autosave
    
    // Intercept Paste for Image Upload
    editorView.on("paste", (cm, e) => {
        const items = (e.clipboardData || e.originalEvent.clipboardData).items;
        for (let item of items) {
            if (item.type.indexOf("image") === 0) {
                e.preventDefault();
                const blob = item.getAsFile();
                showPasteModal(blob);
                break;
            }
        }
    });
}

export function loadFile(path, content) {
    currentFilePath = path;
    lastKnownSlideCount = (content.replace(/\r/g, '').match(/^---$/gm) || []).length;
    editorView.setValue(content);
    
    // Auto-load corresponding HTML preview
    if (path.endsWith('.html')) {
        const iframe = document.getElementById('preview-iframe');
        iframe.src = 'preview.html?context=/' + path;
    }
}

let lastKnownSlideCount = -1;

function getMarkdownContentInfo(content, cursorObj) {
    let text = content;
    let textBeforeCursor = cursorObj ? editorView.getRange({line: 0, ch: 0}, cursorObj) : "";
    
    if (currentFilePath && currentFilePath.endsWith('.html')) {
        // Extract only the content inside <script type="text/markdown">
        const match = content.match(/<script type="text\/markdown"[^>]*>([\s\S]*?)<\/script>/);
        if (match) {
            text = match[1];
        }
        if (cursorObj) {
            const startMatch = textBeforeCursor.match(/<script type="text\/markdown"[^>]*>([\s\S]*)$/);
            if (startMatch) {
                textBeforeCursor = startMatch[1];
            } else {
                textBeforeCursor = ""; // Cursor is outside or before the script block
            }
        }
    }
    
    let normalizedText = text.replace(/\r/g, '');
    let normalizedTextBefore = textBeforeCursor.replace(/\r/g, '');
    
    return {
        totalSlides: (normalizedText.match(/^---$/gm) || []).length,
        localIndex: (normalizedTextBefore.match(/^---$/gm) || []).length,
        allSlides: normalizedText.split(/^---$/gm)
    };
}

async function updatePreview() {
    const content = editorView.getValue();
    const iframe = document.getElementById('preview-iframe');
    const cursor = editorView.getCursor();
    
    const info = getMarkdownContentInfo(content, cursor);
    
    console.log("updatePreview: lastKnownSlideCount =", lastKnownSlideCount, "info.totalSlides =", info.totalSlides);
    // If this is the first time checking, or if the number of slides changed, reload the whole preview
    if (lastKnownSlideCount !== -1 && info.totalSlides !== lastKnownSlideCount) {
        console.log("RELOADING!");
        lastKnownSlideCount = info.totalSlides;
        iframe.contentWindow.location.reload();
        return;
    }
    lastKnownSlideCount = info.totalSlides;
    
    const currentSlideMarkdown = info.allSlides[info.localIndex] || "";
    
    iframe.contentWindow.postMessage({
        type: 'update_slide',
        file: currentFilePath,
        localIndex: info.localIndex,
        markdown: currentSlideMarkdown
    }, '*');
}

function syncPreviewToCursor() {
    if (!currentFilePath) return;
    const content = editorView.getValue();
    const cursor = editorView.getCursor();
    const info = getMarkdownContentInfo(content, cursor);
    
    const iframe = document.getElementById('preview-iframe');
    iframe.contentWindow.postMessage({
        type: 'sync_slide',
        file: currentFilePath,
        localIndex: info.localIndex
    }, '*');
}

// Listen for messages from preview iframe
window.addEventListener('message', (e) => {
    if (e.data.type === 'presentation_loaded') {
        const { files, slides } = e.data;
        
        // Populate Dropdown
        const select = document.getElementById('presentation-file-selector');
        if (files.length > 0) {
            select.innerHTML = '<option value="" disabled>Select a markdown file...</option>';
            files.forEach(f => {
                const opt = document.createElement('option');
                opt.value = f;
                opt.textContent = f; // Use full path for clarity
                select.appendChild(opt);
            });
            if (currentFilePath && files.includes(currentFilePath)) {
                select.value = currentFilePath;
            } else if (!currentFilePath) {
                select.value = files[0];
                loadFileFromServer(files[0]);
            }
            
            select.onchange = (ev) => {
                if (ev.target.value) {
                    loadFileFromServer(ev.target.value);
                }
            };
        }
        
        // Populate global outline
        renderGlobalOutline(slides);
        
        syncPreviewToCursor();
    }
});

async function saveCurrentFile(isAutoSave = false) {
    if (!currentFilePath) return;
    const content = editorView.getValue();
    try {
        const res = await fetch('/api/file', {
            method: 'POST',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({path: currentFilePath, content: content})
        });
        if (res.ok) {
            // Save successful
        }
    } catch (e) {
        if (!isAutoSave) {
            alert("Error saving: " + e.message);
        }
        console.error("Error saving:", e);
    }
}

let pendingPasteBlob = null;
function showPasteModal(blob) {
    pendingPasteBlob = blob;
    const modal = document.getElementById('paste-modal');
    modal.classList.remove('hidden');
    
    // Suggest a path based on current file
    if (currentFilePath) {
        const parts = currentFilePath.split('/');
        parts.pop(); // remove filename
        const defaultPath = parts.join('/') + '/assets/image_' + Date.now() + '.png';
        document.getElementById('paste-filename').value = defaultPath;
    }
}

document.addEventListener('DOMContentLoaded', () => {
    document.getElementById('btn-paste-cancel').addEventListener('click', () => {
        document.getElementById('paste-modal').classList.add('hidden');
        pendingPasteBlob = null;
    });
    
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
                
                // Calculate relative path for markdown
                // Simplest is to assume the markdown path is relative to repo root, and image is too.
                // But we need path relative to the markdown file!
                const fileParts = currentFilePath.split('/');
                fileParts.pop();
                const fileDir = fileParts.join('/') + '/';
                let relPath = path;
                if (path.startsWith(fileDir)) {
                    relPath = path.substring(fileDir.length);
                } else {
                    relPath = '/' + path; // absolute from root as fallback
                }
                
                const snippet = `![Pasted Image](${relPath}){width=80% center}\n`;
                editorView.replaceSelection(snippet);
            }
        } catch(e) {
            alert("Upload failed: " + e.message);
        }
    });
});
