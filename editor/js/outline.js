import { editorView, currentFilePath, loadFileFromServer, currentDocumentModel } from './editor.js';
import { handleEditorChange } from './document-differ.js';
import { promptNewFile } from './file-prompt.js';

export let globalSlideMapping = [];
let selectedSlides = new Set();
let lastSelectedIndex = -1;

const colors = [
    '#2ecc71', '#3498db', '#9b59b6', '#f1c40f', '#e67e22', '#e74c3c', '#1abc9c', '#34495e'
];
const fileColors = {};

export function getFileColor(file) {
    if (!fileColors[file]) {
        fileColors[file] = colors[Object.keys(fileColors).length % colors.length];
    }
    return fileColors[file];
}

export function initOutline() {
    document.addEventListener('click', (e) => {
        if (!e.target.closest('#slide-outline') && !e.target.closest('.context-menu')) {
            clearSelection();
        }
        hideContextMenu();
    });
}

function clearSelection() {
    selectedSlides.clear();
    lastSelectedIndex = -1;
    updateSelectionVisuals();
}

function updateSelectionVisuals() {
    document.querySelectorAll('.outline-item').forEach(el => {
        const idx = parseInt(el.dataset.globalIndex, 10);
        if (selectedSlides.has(idx)) el.classList.add('selected');
        else el.classList.remove('selected');
    });
}

function normalizePath(p) {
    if (!p) return p;
    if (p.startsWith('/')) p = p.substring(1);
    const parts = p.split('/');
    const res = [];
    for (const part of parts) {
        if (part === '.') continue;
        if (part === '..') {
            if (res.length > 0) res.pop();
        } else {
            res.push(part);
        }
    }
    return res.join('/');
}

export function renderGlobalOutline(slides) {
    globalSlideMapping = slides.map(slide => {
        slide.file = normalizePath(slide.file);
        if (slide.fileStack) {
            slide.fileStack = slide.fileStack.map(normalizePath);
        }
        return slide;
    });
    const container = document.getElementById('slide-outline');
    container.innerHTML = '';
    
    // Pre-calculate which files have non-empty slides
    const fileHasNonEmpty = new Set();
    slides.forEach(slide => {
        if (!slide.isEmpty) {
            const stack = slide.fileStack || [slide.file];
            stack.forEach(f => fileHasNonEmpty.add(f));
        }
    });
    
    let currentStack = []; // array of { file, domElement }
    
    slides.forEach((slide, index) => {
        const stack = slide.fileStack || [slide.file];
        
        // Find where the new stack diverges from currentStack
        let divergeIndex = 0;
        while (divergeIndex < currentStack.length && 
               divergeIndex < stack.length && 
               currentStack[divergeIndex].file === stack[divergeIndex]) {
            divergeIndex++;
        }
        
        // Pop the diverging parts
        while (currentStack.length > divergeIndex) {
            currentStack.pop();
        }
        
        // Push the new parts
        for (let i = divergeIndex; i < stack.length; i++) {
            const file = stack[i];
            const color = getFileColor(file);
            
            const groupEl = document.createElement('div');
            groupEl.className = 'outline-file-group';
            groupEl.style.borderLeftColor = color;
            // Indent child groups
            if (i > 0) {
                groupEl.style.marginLeft = '4px';
            }
            
            const badge = document.createElement('div');
            badge.className = 'outline-file-badge';
            badge.style.backgroundColor = color;
            
            let basename = file;
            if (file.includes('/')) basename = file.split('/').pop();
            badge.textContent = basename;
            
            if (!fileHasNonEmpty.has(file)) {
                badge.classList.add('empty-file');
                badge.title = 'Empty File (Click to remove)';
                badge.onclick = () => removeEmptyFile(file);
            }
            
            groupEl.appendChild(badge);
            groupEl.addEventListener('dragover', (e) => {
                e.preventDefault();
                e.stopPropagation();
                groupEl.classList.add('drag-over');
            });
            groupEl.addEventListener('dragleave', (e) => {
                groupEl.classList.remove('drag-over');
            });
            groupEl.addEventListener('drop', (e) => {
                e.preventDefault();
                e.stopPropagation();
                groupEl.classList.remove('drag-over');
                handleDrop(e, -1, file);
            });
            
            // Append to parent
            const parentEl = currentStack.length > 0 ? currentStack[currentStack.length - 1].domElement : container;
            parentEl.appendChild(groupEl);
            
            currentStack.push({ file, domElement: groupEl });
        }
        
        // Now append the slide item to the deepest group
        if (!slide.isEmpty) {
            const groupEl = currentStack[currentStack.length - 1].domElement;
            const el = document.createElement('div');
            el.className = 'outline-item';
            el.dataset.globalIndex = index;
            el.textContent = `${index + 1}. ${slide.title}`;
            el.title = slide.title;
            el.draggable = true;
            
            el.addEventListener('click', (e) => handleItemClick(e, index));
            el.addEventListener('contextmenu', (e) => handleContextMenu(e, index));
            
            // Drag and Drop
            el.addEventListener('dragstart', (e) => handleDragStart(e, index));
            el.addEventListener('dragover', (e) => handleDragOver(e));
            el.addEventListener('dragleave', (e) => handleDragLeave(e));
            el.addEventListener('drop', (e) => {
                e.stopPropagation();
                handleDrop(e, index);
            });
            
            if (selectedSlides.has(index)) {
                el.classList.add('selected');
            }
            
            groupEl.appendChild(el);
        }
    });
}

function handleItemClick(e, index) {
    if (e.ctrlKey || e.metaKey) {
        if (selectedSlides.has(index)) selectedSlides.delete(index);
        else selectedSlides.add(index);
        lastSelectedIndex = index;
    } else if (e.shiftKey && lastSelectedIndex !== -1) {
        const start = Math.min(lastSelectedIndex, index);
        const end = Math.max(lastSelectedIndex, index);
        selectedSlides.clear();
        for (let i = start; i <= end; i++) selectedSlides.add(i);
    } else {
        selectedSlides.clear();
        selectedSlides.add(index);
        lastSelectedIndex = index;
        jumpToSlide(index);
    }
    updateSelectionVisuals();
}

async function jumpToSlide(globalIndex) {
    const slide = globalSlideMapping[globalIndex];
    if (!slide) return;
    
    const content = editorView.getValue();
    const chunks = content.split(/^---$/gm);
    
    if (globalIndex >= chunks.length) {
        globalIndex = chunks.length - 1;
    }
    
    const prefix = chunks.slice(0, globalIndex).join("---") + (globalIndex > 0 ? "---" : "");
    const newlines = prefix.split('\n').length - 1;
    const line = newlines + (globalIndex > 0 ? 1 : 0);
    
    editorView.setCursor({line: line, ch: 0});
    editorView.focus();
    
    const t = editorView.charCoords({line: line, ch: 0}, "local").top; 
    editorView.scrollTo(null, t - 40);
}

// --- Context Menu ---
let currentMenu = null;

function hideContextMenu() {
    if (currentMenu) {
        currentMenu.remove();
        currentMenu = null;
    }
}

function handleContextMenu(e, index) {
    e.preventDefault();
    hideContextMenu();
    
    if (!selectedSlides.has(index)) {
        selectedSlides.clear();
        selectedSlides.add(index);
        lastSelectedIndex = index;
        updateSelectionVisuals();
    }
    
    const menu = document.createElement('div');
    menu.className = 'context-menu';
    menu.style.left = `${e.clientX}px`;
    menu.style.top = `${e.clientY}px`;
    
    const addEmpty = document.createElement('div');
    addEmpty.className = 'context-menu-item';
    addEmpty.textContent = 'Create Empty File (include)';
    addEmpty.onclick = () => { hideContextMenu(); createEmptyFileInclude(); };
    menu.appendChild(addEmpty);

    const extract = document.createElement('div');
    extract.className = 'context-menu-item';
    extract.textContent = 'Extract to New File...';
    extract.onclick = () => { hideContextMenu(); extractToNewFile(); };
    menu.appendChild(extract);
    
    const div1 = document.createElement('div');
    div1.className = 'context-menu-divider';
    menu.appendChild(div1);
    
    const addSlide = document.createElement('div');
    addSlide.className = 'context-menu-item';
    addSlide.textContent = 'Add Slide Below';
    addSlide.onclick = () => { hideContextMenu(); addSlideBelow(index); };
    menu.appendChild(addSlide);
    
    const del = document.createElement('div');
    del.className = 'context-menu-item';
    del.textContent = `Delete Slide${selectedSlides.size > 1 ? 's' : ''}`;
    del.onclick = () => { hideContextMenu(); deleteSelectedSlides(); };
    menu.appendChild(del);
    
    document.body.appendChild(menu);
    currentMenu = menu;
}

// --- Operations API ---

function updateFileInModel(file, newContent) {
    if (currentDocumentModel && currentDocumentModel.fileCache[file] !== undefined) {
        currentDocumentModel.fileCache[file] = newContent;
        currentDocumentModel.rebuildTree();
        
        if (currentFilePath === file) {
            currentDocumentModel.ignoreNextChange = true;
            editorView.setValue(newContent);
        }
        
        handleEditorChange(editorView);
    }
}

async function removeEmptyFile(file) {
    if (confirm(`Remove empty file include for ${file}?`)) {
        // Find where this file is included by searching current file or main?
        // Let's assume it's in the current file.
        let content = currentDocumentModel.fileCache[currentFilePath];
        const regex = new RegExp(`^\\s*!include\\(${file}\\)\\s*$`, 'gm');
        if (regex.test(content)) {
            content = content.replace(regex, '');
            updateFileInModel(currentFilePath, content);
        } else {
            alert("Could not find the include directive in the current file. Please remove it manually.");
        }
    }
}

async function addSlideBelow(globalIndex) {
    const slide = globalSlideMapping[globalIndex];
    if (!slide || slide.file === 'unknown') return;
    
    let content = currentDocumentModel.fileCache[slide.file];
    
    const chunks = content.split(/^---$/gm);
    // Insert new slide after slide.localIndex
    chunks.splice(slide.localIndex + 1, 0, '\n\nNew Slide\n\n');
    const newContent = chunks.join('---');
    
    updateFileInModel(slide.file, newContent);
}

async function deleteSelectedSlides() {
    if (!confirm(`Delete ${selectedSlides.size} slide(s)?`)) return;
    
    // Group selected slides by file
    const toDelete = {};
    for (let idx of selectedSlides) {
        const slide = globalSlideMapping[idx];
        if (slide && slide.file !== 'unknown') {
            if (!toDelete[slide.file]) toDelete[slide.file] = [];
            toDelete[slide.file].push(slide.localIndex);
        }
    }
    
    for (const [file, localIndexes] of Object.entries(toDelete)) {
        localIndexes.sort((a,b) => b - a); // Sort descending to splice safely
        
        let content = currentDocumentModel.fileCache[file];
        const chunks = content.split(/^---$/gm);
        
        for (let i of localIndexes) {
            chunks.splice(i, 1);
        }
        
        const newContent = chunks.join('---');
        updateFileInModel(file, newContent);
    }
    
    selectedSlides.clear();
}

async function extractToNewFile() {
    if (selectedSlides.size === 0) return;
    
    // Ensure all selected slides are contiguous and from the CURRENT file
    const sortedIdx = Array.from(selectedSlides).sort((a,b) => a-b);
    const firstIdx = sortedIdx[0];
    const firstSlide = globalSlideMapping[firstIdx];
    
    if (firstSlide.file !== currentFilePath) {
        alert("You can only extract slides from the currently open file.");
        return;
    }
    
    // Check contiguous
    for (let i = 0; i < sortedIdx.length; i++) {
        const slide = globalSlideMapping[sortedIdx[i]];
        if (slide.file !== currentFilePath || slide.localIndex !== firstSlide.localIndex + i) {
            alert("Please select a continuous block of slides from the current file.");
            return;
        }
    }
    
    const basePath = currentFilePath.substring(0, currentFilePath.lastIndexOf('/'));
    const newFilename = await promptNewFile("Enter new filename", "section.md", basePath);
    if (!newFilename) return;
    
    const content = currentDocumentModel.fileCache[currentFilePath];
    const chunks = content.split(/^---$/gm);
    
    const extractedChunks = chunks.splice(firstSlide.localIndex, sortedIdx.length, `\n\n!include(${newFilename})\n\n`);
    const extractedMarkdown = extractedChunks.join('---');
    
    // Save new file
    const fullNewPath = basePath ? `${basePath}/${newFilename}` : newFilename;
    currentDocumentModel.fileCache[fullNewPath] = extractedMarkdown;
    
    // Update current file
    updateFileInModel(currentFilePath, chunks.join('---'));
    selectedSlides.clear();
}

async function createEmptyFileInclude() {
    const basePath = currentFilePath ? currentFilePath.substring(0, currentFilePath.lastIndexOf('/')) : '';
    const newFilename = await promptNewFile("Enter new filename", "section.md", basePath);
    if (!newFilename) return;
    
    // Create empty file in cache BEFORE modifying document so it doesn't trigger a fetch
    const fullNewPath = basePath ? `${basePath}/${newFilename}` : newFilename;
    currentDocumentModel.fileCache[fullNewPath] = "";

    // Insert !include at cursor
    const includeStr = `\n---\n!include(${newFilename})\n---\n`;
    const doc = editorView.getDoc();
    const cursor = doc.getCursor();
    doc.replaceRange(includeStr, cursor);
}

// --- Drag & Drop ---
let dragStartIndex = -1;

function handleDragStart(e, index) {
    if (!selectedSlides.has(index)) {
        selectedSlides.clear();
        selectedSlides.add(index);
        lastSelectedIndex = index;
        updateSelectionVisuals();
    }
    dragStartIndex = index;
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', 'slide-drag');
}

function handleDragOver(e) {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    
    document.querySelectorAll('.outline-item').forEach(el => {
        el.classList.remove('drag-over-top');
        el.classList.remove('drag-over-bottom');
    });
    
    const target = e.target.closest('.outline-item');
    if (target) {
        const rect = target.getBoundingClientRect();
        const mid = rect.top + rect.height / 2;
        if (e.clientY < mid) {
            target.classList.add('drag-over-top');
        } else {
            target.classList.add('drag-over-bottom');
        }
    }
}

function handleDragLeave(e) {
    const target = e.target.closest('.outline-item');
    if (target) {
        target.classList.remove('drag-over-top');
        target.classList.remove('drag-over-bottom');
    }
}

function extractMarkdown(content, filename) {
    const isHtml = filename && filename.toLowerCase().endsWith('.html');
    if (!isHtml) {
        return { before: "", md: content, after: "" };
    }
    const match = content.match(/([\s\S]*?<script type="text\/markdown"[^>]*>)([\s\S]*?)(<\/script>[\s\S]*)/i);
    if (match) {
        return { before: match[1], md: match[2], after: match[3] };
    }
    return { before: "", md: content, after: "" };
}

async function handleDrop(e, targetGlobalIndex, fallbackTargetFile = null) {
    e.preventDefault();
    
    let insertAfter = false;
    const target = e.target.closest('.outline-item');
    if (target) {
        const rect = target.getBoundingClientRect();
        const mid = rect.top + rect.height / 2;
        if (e.clientY >= mid) {
            insertAfter = true;
        }
    }
    
    document.querySelectorAll('.outline-item, .outline-file-group').forEach(el => {
        el.classList.remove('drag-over-top');
        el.classList.remove('drag-over-bottom');
        el.classList.remove('drag-over');
    });
    
    if (selectedSlides.has(targetGlobalIndex)) return; // Dropped on itself
    
    const sortedIdx = Array.from(selectedSlides).sort((a,b) => a-b);
    
    // Collect contents of selected slides
    const extractedTextBlocks = [];
    
    // Remove from source files
    const toDelete = {};
    for (let idx of sortedIdx) {
        const slide = globalSlideMapping[idx];
        if (!toDelete[slide.file]) toDelete[slide.file] = [];
        toDelete[slide.file].push(slide.localIndex);
    }
    
    for (const [file, localIndexes] of Object.entries(toDelete)) {
        localIndexes.sort((a,b) => b - a); // descending
        
        let content = currentDocumentModel.fileCache[file];
        content = content.replace(/\r/g, '');
        
        const { before, md, after } = extractMarkdown(content, file);
        
        const chunks = md.split(/^---$/gm).map(c => {
            return c.replace(/^\n+/, '').replace(/\n+$/, '');
        });
        
        for (let i of localIndexes) {
            // Keep in correct ascending order for insertion
            extractedTextBlocks.unshift(chunks.splice(i, 1)[0]);
        }
        
        const newMd = chunks.join('\n\n---\n\n');
        // Ensure there are newlines separating the markdown from the HTML tags if they exist
        const prefix = before ? before + '\n' : '';
        const suffix = after ? '\n' + after : '';
        const newContent = prefix + newMd + suffix;
        updateFileInModel(file, newContent);
    }
    
    let targetFile;
    let insertLocalIndex;
    
    if (targetGlobalIndex >= 0) {
        const targetSlide = globalSlideMapping[targetGlobalIndex];
        targetFile = targetSlide.file;
        insertLocalIndex = targetSlide.localIndex;
        
        // Adjust target index if we deleted slides BEFORE it in the SAME file
        if (toDelete[targetFile]) {
            let deletedBeforeTarget = toDelete[targetFile].filter(idx => idx < targetSlide.localIndex).length;
            insertLocalIndex -= deletedBeforeTarget;
        }
        
        if (insertAfter) {
            insertLocalIndex++;
        }
    } else if (fallbackTargetFile) {
        // Dropped on a file group, append to the very end
        targetFile = fallbackTargetFile;
        let content = currentDocumentModel.fileCache[targetFile] || "";
        content = content.replace(/\r/g, '');
        const { md } = extractMarkdown(content, targetFile);
        insertLocalIndex = md.split(/^---$/gm).length; // Append at the end
    } else {
        return;
    }
    
    if (!currentDocumentModel.fileCache[targetFile]) {
        console.error("Target file not in cache:", targetFile);
        return;
    }
    
    // Insert into target
    let targetContent = currentDocumentModel.fileCache[targetFile];
    targetContent = targetContent.replace(/\r/g, '');
    
    const { before: targetBefore, md: targetMd, after: targetAfter } = extractMarkdown(targetContent, targetFile);
    
    const targetChunks = targetMd.split(/^---$/gm).map(c => {
        return c.replace(/^\n+/, '').replace(/\n+$/, '');
    });
    
    targetChunks.splice(insertLocalIndex, 0, ...extractedTextBlocks);
    
    const finalMd = targetChunks.join('\n\n---\n\n');
    const targetPrefix = targetBefore ? targetBefore + '\n' : '';
    const targetSuffix = targetAfter ? '\n' + targetAfter : '';
    const finalContent = targetPrefix + finalMd + targetSuffix;
    
    updateFileInModel(targetFile, finalContent);
    
    selectedSlides.clear();
    
    // Force preview reload to rebuild slide mapping and update outline
    // Wait for the debounced journal save to complete (500ms delay in document-differ.js)
    const iframe = document.getElementById('preview-iframe');
    if (iframe) {
        const reloadOnSave = () => {
            iframe.contentWindow.location.reload();
            window.removeEventListener('editor-content-changed', reloadOnSave);
        };
        window.addEventListener('editor-content-changed', reloadOnSave);
    }
}
