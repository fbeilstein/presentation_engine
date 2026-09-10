import { availableHtmlContexts } from './file-tree.js';

import { renderGlobalOutline, getFileColor, globalSlideMapping } from './outline.js';

import { initDocument, handleEditorChange, saveDocumentToDisk } from './document-differ.js';

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
                select.innerHTML = '';
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
            if (iframe) iframe.src = 'preview.html?context=/' + path;
        }
        
        // Wrap model update to re-render stripes
        const originalUpdate = currentDocumentModel.onModelUpdated;
        currentDocumentModel.onModelUpdated = () => {
            if (originalUpdate) originalUpdate();
            renderStripes();
        };
        renderStripes(); // Initial render
        
    } catch (e) {
        console.error("Failed to load file from server:", e);
    }
}

function renderStripes() {
    if (!editorView) return;
    editorView.clearGutter("include-stripes");
    if (!currentDocumentModel || !currentDocumentModel.tree) return;
    
    const lineDepths = {};
    
    const gatherDepths = (node) => {
        for (let i = node.startLine; i <= node.endLine; i++) {
            if (!lineDepths[i]) lineDepths[i] = [];
            lineDepths[i].push({ depth: node.depth, file: node.file });
        }
        node.children.forEach(gatherDepths);
    };
    gatherDepths(currentDocumentModel.tree);
    
    for (const [lineStr, depths] of Object.entries(lineDepths)) {
        const line = parseInt(lineStr);
        const marker = document.createElement("div");
        marker.style.height = "100%";
        marker.style.minHeight = "18px";
        marker.style.display = "flex";
        marker.style.paddingLeft = "2px";
        depths.sort((a,b) => a.depth - b.depth);
        depths.forEach(info => {
            const stripe = document.createElement("div");
            stripe.style.width = "4px";
            stripe.style.height = "100%";
            stripe.style.backgroundColor = getFileColor(info.file);
            stripe.style.marginLeft = "2px";
            marker.appendChild(stripe);
        });
        editorView.setGutterMarker(line, "include-stripes", marker);
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
        gutters: ["CodeMirror-linenumbers", "CodeMirror-foldgutter", "include-stripes"],
        foldGutter: true,
        foldOptions: {
            rangeFinder: function(cm, start) {
                if (!currentDocumentModel || !currentDocumentModel.tree) return;
                let foundNode = null;
                const findNode = (node) => {
                    if (node.includeLine === start.line) {
                        foundNode = node;
                        return;
                    }
                    node.children.forEach(findNode);
                };
                findNode(currentDocumentModel.tree);
                if (foundNode && foundNode.startLine < foundNode.endLine) {
                    return {
                        from: CodeMirror.Pos(start.line, cm.getLine(start.line).length),
                        to: CodeMirror.Pos(foundNode.endLine, cm.getLine(foundNode.endLine).length)
                    };
                }
            }
        },
        extraKeys: {
            "Ctrl-S": function(cm) { saveDocumentToDisk(cm); },
            "Cmd-S": function(cm) { saveDocumentToDisk(cm); }
        }
    });
    window.editorView = editorView;
    
    // Listen for fine-grained changes
    editorView.on('changes', (cm, changes) => {
        if (!currentDocumentModel) return;
        if (currentDocumentModel.ignoreNextChange) {
            currentDocumentModel.ignoreNextChange = false;
            return;
        }
        
        // Pass the changes to document model
        let needsRebuild = false;
        for (const change of changes) {
            if (currentDocumentModel.applyChange(change)) {
                needsRebuild = true;
            }
        }
        
        if (needsRebuild) {
            // Need to fetch missing files or re-render flat text because a duplicate include was edited
            const oldCursor = cm.getCursor();
            // Actually, we must be careful not to break CM state during a change event.
            // We should do it asynchronously.
            setTimeout(async () => {
                await currentDocumentModel.loadRoot(currentFilePath); // refetch if needed
                const text = currentDocumentModel.getFlatText();
                if (cm.getValue() !== text) {
                    currentDocumentModel.ignoreNextChange = true;
                    cm.setValue(text);
                    cm.setCursor(oldCursor);
                }
            }, 0);
        }
        
        handleEditorChange(cm);
        syncPreviewToCursor();
    });
    
    editorView.on('cursorActivity', () => {
        syncPreviewToCursor();
    });
    
    // Add fold/unfold commands
    editorView.setOption("extraKeys", {
        ...editorView.getOption("extraKeys"),
        "Ctrl-Q": function(cm){ cm.foldCode(cm.getCursor()); }
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
    if (currentDocumentModel) currentDocumentModel.ignoreNextChange = true;
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
    
    // If this is the first time checking, or if the number of slides changed, reload the whole preview
    // Actually, we can't just reload anymore because we don't autosave to disk!
    // If the slide count changed, we must send the entire presentation markdown to the iframe.
    // For now, let's just trigger a full update if slide count changes.
    if (lastKnownSlideCount !== -1 && info.totalSlides !== lastKnownSlideCount) {
        lastKnownSlideCount = info.totalSlides;
        iframe.contentWindow.postMessage({
            type: 'update_all',
            markdown: content
        }, '*');
        return;
    }
    lastKnownSlideCount = info.totalSlides;
    
    const currentSlideMarkdown = info.allSlides[info.localIndex] || "";
    
    let targetGlobalIndex = info.localIndex;
    if (globalSlideMapping && globalSlideMapping.length > 0 && currentFilePath) {
        const slide = globalSlideMapping.find(s => s.file === currentFilePath && s.localIndex === info.localIndex);
        if (slide) {
            targetGlobalIndex = slide.globalIndex;
        }
    }
    
    iframe.contentWindow.postMessage({
        type: 'update_slide',
        globalIndex: targetGlobalIndex,
        markdown: currentSlideMarkdown
    }, '*');
}

function syncPreviewToCursor() {
    const content = editorView.getValue();
    const cursor = editorView.getCursor();
    const info = getMarkdownContentInfo(content, cursor);
    
    const iframe = document.getElementById('preview-iframe');
    if (!iframe) return;
    
    let targetGlobalIndex = info.localIndex; // Fallback to merged index
    
    if (globalSlideMapping && globalSlideMapping.length > 0 && currentDocumentModel && currentDocumentModel.flatLines) {
        const flatLine = currentDocumentModel.flatLines[cursor.line];
        if (flatLine && flatLine.node) {
            const actualFile = flatLine.node.file;
            const unmergedText = currentDocumentModel.fileCache[actualFile];
            if (unmergedText) {
                const textBeforeCursorInFile = unmergedText.split('\n').slice(0, flatLine.localIndex).join('\n');
                const unmergedSlideIndex = (textBeforeCursorInFile.match(/^---$/gm) || []).length;
                
                const slide = globalSlideMapping.find(s => s.file === actualFile && s.localIndex === unmergedSlideIndex);
                if (slide) {
                    targetGlobalIndex = slide.globalIndex;
                }
            }
        }
    }
    
    iframe.contentWindow.postMessage({
        type: 'sync_slide',
        globalIndex: targetGlobalIndex
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
            } else {
                let targetFile = files.find(f => f.endsWith('main.md'));
                if (!targetFile) {
                    targetFile = files.find(f => f.endsWith('.html'));
                }
                if (!targetFile) {
                    targetFile = files[0];
                }
                select.value = targetFile;
                loadFileFromServer(targetFile);
            }
            
            select.onchange = (ev) => {
                if (ev.target.value) {
                    jumpToFileInclude(ev.target.value);
                }
            };
        }
        
        // Populate global outline
        renderGlobalOutline(slides);
        
        syncPreviewToCursor();
    }
});

// Autosave logic has been removed. 
// Saving to disk is only triggered by Ctrl+S via `saveDocumentToDisk`.

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

export function jumpToFileInclude(targetPath) {
    if (!currentDocumentModel || !currentDocumentModel.tree) return;
    
    if (currentDocumentModel.tree.file === targetPath) {
        editorView.setCursor({line: 0, ch: 0});
        editorView.focus();
        editorView.scrollTo(null, 0);
        return;
    }
    
    let foundLine = -1;
    const findNode = (node) => {
        if (node.file === targetPath) {
            foundLine = node.includeLine;
            return true;
        }
        for (const child of node.children) {
            if (findNode(child)) return true;
        }
        return false;
    };
    
    findNode(currentDocumentModel.tree);
    
    if (foundLine !== -1) {
        editorView.setCursor({line: foundLine, ch: 0});
        editorView.focus();
        const t = editorView.charCoords({line: foundLine, ch: 0}, "local").top; 
        editorView.scrollTo(null, Math.max(0, t - 40));
    }
}
