import { editorView, currentFilePath, loadFileFromServer } from './editor.js';
import { promptNewFile } from './file-prompt.js';

let globalSlideMapping = [];
let selectedSlides = new Set();
let lastSelectedIndex = -1;

const colors = [
    '#2ecc71', '#3498db', '#9b59b6', '#f1c40f', '#e67e22', '#e74c3c', '#1abc9c', '#34495e'
];
const fileColors = {};

function getFileColor(file) {
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

export function renderGlobalOutline(slides) {
    globalSlideMapping = slides;
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
                groupEl.style.marginLeft = '12px';
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
            el.addEventListener('drop', (e) => handleDrop(e, index));
            
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
    
    if (currentFilePath !== slide.file && slide.file !== 'unknown') {
        await loadFileFromServer(slide.file);
    }
    
    const content = editorView.getValue();
    const chunks = content.split(/^---$/gm);
    
    let line = 0;
    for (let i = 0; i < slide.localIndex && i < chunks.length; i++) {
        line += chunks[i].split('\n').length;
    }
    
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

async function fetchFileContent(path) {
    const res = await fetch('/api/file?path=' + encodeURIComponent(path));
    if (res.ok) {
        const data = await res.json();
        return data.content;
    }
    throw new Error('Failed to fetch ' + path);
}

async function saveFileContent(path, content) {
    const res = await fetch('/api/file', {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({path, content})
    });
    if (!res.ok) throw new Error('Failed to save ' + path);
}

async function removeEmptyFile(file) {
    if (confirm(`Remove empty file include for ${file}?`)) {
        // Find where this file is included by searching current file or main?
        // Let's assume it's in the current file.
        let content = editorView.getValue();
        const regex = new RegExp(`^\\s*!include\\(${file}\\)\\s*$`, 'gm');
        if (regex.test(content)) {
            content = content.replace(regex, '');
            editorView.setValue(content);
        } else {
            alert("Could not find the include directive in the current file. Please remove it manually.");
        }
    }
}

async function addSlideBelow(globalIndex) {
    const slide = globalSlideMapping[globalIndex];
    if (!slide || slide.file === 'unknown') return;
    
    let content;
    let isCurrentFile = (slide.file === currentFilePath);
    
    if (isCurrentFile) {
        content = editorView.getValue();
    } else {
        content = await fetchFileContent(slide.file);
    }
    
    const chunks = content.split(/^---$/gm);
    // Insert new slide after slide.localIndex
    chunks.splice(slide.localIndex + 1, 0, '\n\nNew Slide\n\n');
    const newContent = chunks.join('---');
    
    if (isCurrentFile) {
        editorView.setValue(newContent);
    } else {
        await saveFileContent(slide.file, newContent);
        // Force refresh
        if (currentFilePath) await saveFileContent(currentFilePath, editorView.getValue()); 
    }
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
        
        let content = (file === currentFilePath) ? editorView.getValue() : await fetchFileContent(file);
        const chunks = content.split(/^---$/gm);
        
        for (let i of localIndexes) {
            chunks.splice(i, 1);
        }
        
        const newContent = chunks.join('---');
        if (file === currentFilePath) {
            editorView.setValue(newContent);
        } else {
            await saveFileContent(file, newContent);
        }
    }
    
    selectedSlides.clear();
    // Trigger save to update preview
    if (currentFilePath) {
        // Trigger editor 'change' to auto-save and reload
        editorView.setValue(editorView.getValue());
    }
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
    
    const content = editorView.getValue();
    const chunks = content.split(/^---$/gm);
    
    const extractedChunks = chunks.splice(firstSlide.localIndex, sortedIdx.length, `\n\n!include(${newFilename})\n\n`);
    const extractedMarkdown = extractedChunks.join('---');
    
    // Save new file
    const fullNewPath = basePath ? `${basePath}/${newFilename}` : newFilename;
    await saveFileContent(fullNewPath, extractedMarkdown);
    
    // Update current file
    editorView.setValue(chunks.join('---'));
    selectedSlides.clear();
}

async function createEmptyFileInclude() {
    const basePath = currentFilePath ? currentFilePath.substring(0, currentFilePath.lastIndexOf('/')) : '';
    const newFilename = await promptNewFile("Enter new filename", "section.md", basePath);
    if (!newFilename) return;
    
    // Insert !include at cursor
    const includeStr = `\n---\n!include(${newFilename})\n---\n`;
    const doc = editorView.getDoc();
    const cursor = doc.getCursor();
    doc.replaceRange(includeStr, cursor);
    
    // Create empty file
    const fullNewPath = basePath ? `${basePath}/${newFilename}` : newFilename;
    await saveFileContent(fullNewPath, "");
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
    
    document.querySelectorAll('.outline-item').forEach(el => el.classList.remove('drag-over'));
    
    const target = e.target.closest('.outline-item');
    if (target) {
        target.classList.add('drag-over');
    }
}

function handleDragLeave(e) {
    const target = e.target.closest('.outline-item');
    if (target) {
        target.classList.remove('drag-over');
    }
}

async function handleDrop(e, targetGlobalIndex) {
    e.preventDefault();
    document.querySelectorAll('.outline-item').forEach(el => el.classList.remove('drag-over'));
    
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
        
        let content = (file === currentFilePath) ? editorView.getValue() : await fetchFileContent(file);
        const chunks = content.split(/^---$/gm);
        
        for (let i of localIndexes) {
            // Keep in correct ascending order for insertion
            extractedTextBlocks.unshift(chunks.splice(i, 1)[0]);
        }
        
        const newContent = chunks.join('---');
        if (file === currentFilePath) {
            editorView.setValue(newContent);
        } else {
            await saveFileContent(file, newContent);
        }
    }
    
    // Refresh target slide mapping in case we modified it
    const targetSlide = globalSlideMapping[targetGlobalIndex];
    let targetFile = targetSlide.file;
    let insertLocalIndex = targetSlide.localIndex;
    
    // Adjust target index if we deleted slides BEFORE it in the SAME file
    if (toDelete[targetFile]) {
        let deletedBeforeTarget = toDelete[targetFile].filter(idx => idx < targetSlide.localIndex).length;
        insertLocalIndex -= deletedBeforeTarget;
    }
    
    // Insert into target
    let targetContent = (targetFile === currentFilePath) ? editorView.getValue() : await fetchFileContent(targetFile);
    const targetChunks = targetContent.split(/^---$/gm);
    
    targetChunks.splice(insertLocalIndex, 0, ...extractedTextBlocks);
    
    const finalContent = targetChunks.join('---');
    if (targetFile === currentFilePath) {
        editorView.setValue(finalContent);
        await saveFileContent(currentFilePath, finalContent);
    } else {
        await saveFileContent(targetFile, finalContent);
        if (currentFilePath && currentFilePath !== targetFile) {
            editorView.setValue(editorView.getValue()); // trigger UI update
            await saveFileContent(currentFilePath, editorView.getValue());
        }
    }
    
    selectedSlides.clear();
    
    // Force preview reload to rebuild slide mapping and update outline
    const iframe = document.getElementById('preview-iframe');
    if (iframe) iframe.contentWindow.location.reload();
}
