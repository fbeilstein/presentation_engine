import { editorView, currentFilePath } from '../editor.js';
import { globalSlideMapping } from '../outline.js';
import { EditorView } from '@codemirror/view';

let pendingFiles = [];

export function initImageTool() {
    // Setup listeners for the modal
    const cancelBtn = document.getElementById('btn-paste-cancel');
    if (cancelBtn) {
        cancelBtn.addEventListener('click', () => {
            document.getElementById('paste-modal').classList.add('hidden');
            pendingFiles = [];
        });
    }
    
    const saveBtn = document.getElementById('btn-paste-save');
    if (saveBtn) {
        // We replace it to avoid duplicate listeners if initialized twice
        const newSaveBtn = saveBtn.cloneNode(true);
        saveBtn.parentNode.replaceChild(newSaveBtn, saveBtn);
        
        newSaveBtn.addEventListener('click', async () => {
            if (!pendingFiles.length) return;
            
            let pathStr = document.getElementById('paste-filename').value;
            const isDir = pathStr.endsWith('/');
            
            const dirToSave = isDir ? pathStr : pathStr.substring(0, pathStr.lastIndexOf('/') + 1);
            localStorage.setItem('lastImageUploadFolder', dirToSave);
            
            let snippets = [];
            
            for (let i = 0; i < pendingFiles.length; i++) {
                const file = pendingFiles[i];
                
                // Determine path for this file
                let filePath = pathStr;
                if (isDir || pendingFiles.length > 1) {
                    // If directory or multiple files, append timestamp/index
                    const dir = isDir ? pathStr : pathStr.substring(0, pathStr.lastIndexOf('/') + 1);
                    filePath = dir + 'image_' + Date.now() + '_' + i + '.' + (file.name.split('.').pop() || 'png');
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
                        const fileParts = currentFilePath.split('/');
                        fileParts.pop();
                        const fileDir = fileParts.join('/') + '/';
                        let relPath = filePath;
                        if (filePath.startsWith(fileDir)) {
                            relPath = filePath.substring(fileDir.length);
                        } else {
                            relPath = '/' + filePath;
                        }
                        
                        snippets.push(`![Pasted Image](${relPath}){width=80% center}\n`);
                    }
                } catch(e) {
                    console.error("Upload failed", e);
                }
            }
            
            if (snippets.length > 0) {
                document.getElementById('paste-modal').classList.add('hidden');
                const snippet = snippets.join('');
                const cursor = editorView.state.selection.main.head;
                editorView.dispatch({
                    changes: { from: cursor, insert: snippet }
                });
            }
            
            pendingFiles = [];
        });
    }
    
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
    modal.classList.remove('hidden');
    
    const title = document.querySelector('#paste-modal h3');
    if (title) {
        title.textContent = pendingFiles.length > 1 ? `Save ${pendingFiles.length} Images` : 'Save Image';
    }
    
    if (currentFilePath) {
        let lastFolder = localStorage.getItem('lastImageUploadFolder');
        if (!lastFolder) {
            const parts = currentFilePath.split('/');
            parts.pop();
            lastFolder = parts.length > 0 ? parts.join('/') + '/assets/' : 'assets/';
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
        document.getElementById('paste-filename').value = defaultPath;
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
