import { editorView, currentFilePath } from '../editor.js';
import { globalSlideMapping } from '../outline.js';
import { EditorView } from '@codemirror/view';

let pendingFiles = [];
let isInitialized = false;
let isSaving = false;

function closeModal() {
    const modal = document.getElementById('paste-modal');
    if (modal) {
        modal.classList.add('hidden');
    }
    pendingFiles = [];
    if (editorView) {
        editorView.focus();
    }
}

async function handleSave() {
    if (isSaving) return;
    if (!pendingFiles.length) return;
    
    const filenameInput = document.getElementById('paste-filename');
    if (!filenameInput) return;
    
    let pathStr = filenameInput.value.trim();
    if (!pathStr) return;
    
    const isDir = pathStr.endsWith('/');
    const dirToSave = isDir ? pathStr : pathStr.substring(0, pathStr.lastIndexOf('/') + 1);
    if (dirToSave) {
        localStorage.setItem('lastImageUploadFolder', dirToSave);
    }
    
    const saveBtn = document.getElementById('btn-paste-save');
    const originalBtnText = saveBtn ? saveBtn.textContent : '';
    if (saveBtn) {
        saveBtn.textContent = 'Saving...';
        saveBtn.disabled = true;
    }
    isSaving = true;
    
    let snippets = [];
    
    try {
        for (let i = 0; i < pendingFiles.length; i++) {
            const file = pendingFiles[i];
            
            // Determine path for this file
            let filePath = pathStr;
            if (isDir || pendingFiles.length > 1) {
                // If directory or multiple files, append timestamp/index
                const dir = isDir ? pathStr : pathStr.substring(0, pathStr.lastIndexOf('/') + 1);
                filePath = dir + 'image_' + Date.now() + '_' + i + '.' + (file.name.split('.').pop() || 'png');
            } else if (!isDir && pendingFiles.length === 1) {
                // If user didn't provide extension, append original or png
                const fileExt = (file.name && file.name.includes('.')) ? file.name.split('.').pop() : 'png';
                const lastSlash = filePath.lastIndexOf('/');
                const lastDot = filePath.lastIndexOf('.');
                if (lastDot === -1 || lastDot < lastSlash) {
                    filePath += '.' + fileExt;
                }
            }
            
            const formData = new FormData();
            formData.append('path', filePath);
            formData.append('file', file);
            
            try {
                const res = await fetch('/api/upload', {
                    method: 'POST',
                    body: formData
                });
                if (res.ok) {
                    // Compute relative path
                    let relPath = filePath;
                    if (currentFilePath && currentFilePath.includes('/')) {
                        const fileParts = currentFilePath.split('/');
                        fileParts.pop();
                        const fileDir = fileParts.join('/') + '/';
                        if (filePath.startsWith(fileDir)) {
                            relPath = filePath.substring(fileDir.length);
                        } else {
                            relPath = '/' + filePath.replace(/^\/+/, '');
                        }
                    } else {
                        relPath = filePath.startsWith('/') ? filePath : '/' + filePath;
                    }
                    
                    snippets.push(`![Pasted Image](${relPath}){width=80% center}\n`);
                } else {
                    const err = await res.json().catch(() => ({}));
                    alert("Upload failed: " + (err.detail || res.statusText));
                }
            } catch(e) {
                console.error("Upload failed", e);
                alert("Upload failed: " + e.message);
            }
        }
        
        if (snippets.length > 0) {
            closeModal();
            const snippet = snippets.join('');
            if (editorView) {
                const cursor = editorView.state.selection.main.head;
                editorView.dispatch({
                    changes: { from: cursor, insert: snippet }
                });
                editorView.focus();
            }
        }
    } finally {
        isSaving = false;
        if (saveBtn) {
            saveBtn.textContent = originalBtnText || 'Save & Insert';
            saveBtn.disabled = false;
        }
    }
}

export function initImageTool() {
    if (isInitialized) return;
    isInitialized = true;

    // Setup listeners for the modal
    const cancelBtn = document.getElementById('btn-paste-cancel');
    if (cancelBtn) {
        cancelBtn.addEventListener('click', closeModal);
    }
    
    const saveBtn = document.getElementById('btn-paste-save');
    if (saveBtn) {
        saveBtn.addEventListener('click', handleSave);
    }

    const filenameInput = document.getElementById('paste-filename');
    if (filenameInput) {
        filenameInput.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                e.preventDefault();
                handleSave();
            } else if (e.key === 'Escape') {
                e.preventDefault();
                closeModal();
            }
        });
    }

    const modal = document.getElementById('paste-modal');
    if (modal) {
        modal.addEventListener('click', (e) => {
            if (e.target === modal) {
                closeModal();
            }
        });
    }

    window.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') {
            const modalEl = document.getElementById('paste-modal');
            if (modalEl && !modalEl.classList.contains('hidden')) {
                e.preventDefault();
                closeModal();
            }
        }
    });
    
    // Listen for messages from preview iframe
    window.addEventListener('message', async (e) => {
        if (e.data.type === 'open_external_image') {
            // Need to convert relative path in preview to workspace absolute
            let relPath = e.data.path;
            
            // The preview usually serves files from the workspace root or relative.
            // If the src starts with http://, it's a full URL. We need to strip the origin.
            try {
                const url = new URL(relPath, window.location.origin);
                if (url.origin === window.location.origin) {
                    relPath = url.pathname.substring(1); // remove leading slash
                }
            } catch (err) {}
            
            try {
                const res = await fetch('/api/open-external', {
                    method: 'POST',
                    headers: {'Content-Type': 'application/json'},
                    body: JSON.stringify({ path: relPath })
                });
                if (!res.ok) {
                    const err = await res.json();
                    alert("Failed to open image: " + err.detail);
                }
            } catch(err) {
                alert("Error calling open-external API: " + err.message);
            }
        } else if (e.data.type === 'focus_image') {
            const { src, index } = e.data;
            if (globalSlideMapping && globalSlideMapping[index]) {
                const slide = globalSlideMapping[index];
                const text = editorView.state.doc.sliceString(slide.from, slide.to);
                
                // Get filename from src for naive search
                let searchTarget = src;
                try {
                    const url = new URL(src, window.location.origin);
                    searchTarget = url.pathname.split('/').pop();
                } catch(e) {}
                
                // Search for the filename within the slide text
                const srcIdx = text.indexOf(searchTarget);
                if (srcIdx !== -1) {
                    // Find the start of the ![] syntax before this
                    const beforeSrc = text.substring(0, srcIdx);
                    const bangIdx = beforeSrc.lastIndexOf('![');
                    let targetPos = slide.from + srcIdx;
                    if (bangIdx !== -1) {
                        targetPos = slide.from + bangIdx;
                    }
                    
                    editorView.dispatch({
                        selection: { anchor: targetPos },
                        scrollIntoView: true
                    });
                } else {
                    // Just focus the slide
                    editorView.dispatch({
                        selection: { anchor: slide.from },
                        scrollIntoView: true
                    });
                }
            }
        }
    });
}

function showImageModal(files) {
    if (!files || files.length === 0) return;
    pendingFiles = Array.from(files);
    
    const modal = document.getElementById('paste-modal');
    if (!modal) return;
    modal.classList.remove('hidden');
    
    const title = document.querySelector('#paste-modal h3');
    if (title) {
        title.textContent = pendingFiles.length > 1 ? `Save ${pendingFiles.length} Images` : 'Save Image';
    }
    
    let lastFolder = localStorage.getItem('lastImageUploadFolder');
    if (!lastFolder) {
        if (currentFilePath) {
            const parts = currentFilePath.split('/');
            parts.pop();
            lastFolder = parts.length > 0 ? parts.join('/') + '/assets/' : 'assets/';
        } else {
            lastFolder = 'assets/';
        }
    }
    if (!lastFolder.endsWith('/')) {
        lastFolder += '/';
    }
    
    let defaultPath;
    if (pendingFiles.length > 1) {
        defaultPath = lastFolder;
    } else {
        // retain extension if available
        let ext = 'png';
        if (files.length === 1 && files[0].name) {
            const fExt = files[0].name.split('.').pop();
            if (fExt) ext = fExt;
        }
        defaultPath = lastFolder + 'image_' + Date.now() + '.' + ext;
    }

    const input = document.getElementById('paste-filename');
    if (input) {
        input.value = defaultPath;
        setTimeout(() => {
            input.focus();
            const lastSlash = defaultPath.lastIndexOf('/');
            const lastDot = defaultPath.lastIndexOf('.');
            if (lastSlash !== -1 && lastDot > lastSlash) {
                input.setSelectionRange(lastSlash + 1, lastDot);
            } else {
                input.select();
            }
        }, 20);
    }
}

export function imageToolExtension() {
    return EditorView.domEventHandlers({
        paste: (e, view) => {
            const items = (e.clipboardData || e.originalEvent.clipboardData).items;
            const files = [];
            for (let item of items) {
                if (item.type.indexOf("image") === 0) {
                    files.push(item.getAsFile());
                }
            }
            if (files.length > 0) {
                e.preventDefault();
                showImageModal(files);
                return true;
            }
            return false;
        },
        drop: (e, view) => {
            if (e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files.length > 0) {
                const files = [];
                for (let i = 0; i < e.dataTransfer.files.length; i++) {
                    const f = e.dataTransfer.files[i];
                    if (f.type.indexOf("image") === 0) {
                        files.push(f);
                    }
                }
                
                if (files.length > 0) {
                    e.preventDefault();
                    
                    // Put cursor where they dropped
                    const pos = view.posAtCoords({x: e.clientX, y: e.clientY});
                    if (pos !== null) {
                        view.dispatch({ selection: {anchor: pos} });
                    }
                    
                    showImageModal(files);
                    return true;
                }
            }
            return false;
        }
    });
}
