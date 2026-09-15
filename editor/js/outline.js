import { ViewPlugin } from '@codemirror/view';
import { Transaction, ChangeSet } from '@codemirror/state';
import { editorView, currentFilePath, currentDocumentModel } from './editor.js';
import { promptNewFile } from './file-prompt.js';
import { outlineField } from './outline-ast.js';
import { syncAnnotation } from './sync-filter.js';
import { expandRegionAnnotation, regionMapField, setRegionMap } from './region-map.js';
import { initFileTree } from './file-tree.js';

export let globalSlideMapping = []; // keep for compatibility if needed, but we should use outlineField
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

export const outlineRendererPlugin = ViewPlugin.fromClass(class {
    constructor(view) {
        this.render(view);
    }
    update(update) {
        if (update.docChanged || update.state.field(outlineField, false) !== update.startState.field(outlineField, false)) {
            this.render(update.view);
        }
    }
    render(view) {
        const slides = view.state.field(outlineField, false);
        if (!slides) return;
        globalSlideMapping = slides;
        renderGlobalOutlineDOM(slides);
    }
});

export function renderGlobalOutlineDOM(slides) {
    const container = document.getElementById('slide-outline');
    if (!container) return;
    
    container.innerHTML = '';
    
    let currentStack = []; 
    
    slides.forEach((slide, index) => {
        const stack = slide.fileStack || [slide.file];
        
        let divergeIndex = 0;
        while (divergeIndex < currentStack.length && 
               divergeIndex < stack.length && 
               currentStack[divergeIndex].file === stack[divergeIndex]) {
            divergeIndex++;
        }
        
        while (currentStack.length > divergeIndex) {
            currentStack.pop();
        }
        
        for (let i = divergeIndex; i < stack.length; i++) {
            const file = stack[i];
            const color = getFileColor(file);
            
            const groupEl = document.createElement('div');
            groupEl.className = 'outline-file-group';
            groupEl.style.borderLeftColor = color;
            if (i > 0) {
                groupEl.style.marginLeft = '4px';
            }
            
            const badge = document.createElement('div');
            badge.className = 'outline-file-badge';
            badge.style.backgroundColor = color;
            
            let basename = file;
            if (file.includes('/')) basename = file.split('/').pop();
            badge.textContent = basename;
            
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
            
            const parentEl = currentStack.length > 0 ? currentStack[currentStack.length - 1].domElement : container;
            parentEl.appendChild(groupEl);
            
            currentStack.push({ file, domElement: groupEl });
        }
        
        const groupEl = currentStack[currentStack.length - 1].domElement;
        const el = document.createElement('div');
        el.className = 'outline-item';
        el.dataset.globalIndex = index;
        el.textContent = `${index + 1}. ${slide.title}`;
        el.title = slide.title;
        el.draggable = true;
        
        el.addEventListener('click', (e) => handleItemClick(e, index));
        el.addEventListener('contextmenu', (e) => handleContextMenu(e, index));
        
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
    const outline = editorView.state.field(outlineField);
    const slide = outline[globalIndex];
    if (!slide) return;
    
    editorView.dispatch({
        selection: { anchor: slide.from },
        scrollIntoView: true
    });
}

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

async function addSlideBelow(globalIndex) {
    const outline = editorView.state.field(outlineField);
    const slide = outline[globalIndex];
    if (!slide) return;
    
    editorView.dispatch({
        changes: { from: slide.to, insert: '\n---\n\nNew Slide\n\n' }
    });
}

async function deleteSelectedSlides() {
    if (!confirm(`Delete ${selectedSlides.size} slide(s)?`)) return;
    
    const outline = editorView.state.field(outlineField);
    const changes = [];
    
    for (let idx of selectedSlides) {
        const slide = outline[idx];
        if (slide) {
            changes.push({ from: slide.from, to: slide.to }); // Delete slide content
            // Also try to delete trailing or leading separator if possible, but simplest is just content
            // Actually, if we delete from: slide.from to: slide.to, the --- might be left behind.
            // Let's delete up to the next slide.
            const nextSlide = outline[idx + 1];
            if (nextSlide && nextSlide.file === slide.file) {
                changes.push({ from: slide.to, to: nextSlide.from });
            }
        }
    }
    
    editorView.dispatch({ changes });
    selectedSlides.clear();
}

import { computeChanges } from './diff-utils.js';

async function extractToNewFile() {
    if (selectedSlides.size === 0) return;
    
    const outline = editorView.state.field(outlineField);
    const sortedIdx = Array.from(selectedSlides).sort((a,b) => a-b);
    const firstIdx = sortedIdx[0];
    const firstSlide = outline[firstIdx];
    
    let basePath = firstSlide.file ? firstSlide.file.substring(0, firstSlide.file.lastIndexOf('/')) : '';
    const { promptNewFile } = await import('./file-prompt.js');
    const newFilename = await promptNewFile("Enter new filename", "section.md", basePath);
    if (!newFilename) return;
    
    const { resolveIncludePath } = await import('./region-map.js');
    const fullNewPath = resolveIncludePath(`${basePath}/dummy.md`, newFilename);
    
    const extractedText = sortedIdx.map(idx => {
        return editorView.state.doc.sliceString(outline[idx].from, outline[idx].to);
    }).join('\n---\n');
    
    try {
        await fetch(`/api/file`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ path: fullNewPath, content: extractedText })
        });
        initFileTree();
    } catch (err) {
        alert("Failed to save new file: " + err.message);
        return;
    }
    
    currentDocumentModel.fileCache[fullNewPath] = extractedText;
    
    const includeDirective = `\n!include(${newFilename})\n`;
    
    const cutChanges = [];
    for (let i = 0; i < sortedIdx.length; i++) {
        const slide = outline[sortedIdx[i]];
        let delFrom = slide.from;
        let delTo = slide.to;
        
        if (i !== 0) {
            // Try to consume the preceding ---\n
            if (delFrom >= 4 && editorView.state.doc.sliceString(delFrom - 4, delFrom) === '---\n') {
                delFrom -= 4;
            } else if (delFrom >= 5 && editorView.state.doc.sliceString(delFrom - 5, delFrom) === '\n---\n') {
                delFrom -= 5;
            }
        }
        cutChanges.push({ from: delFrom, to: delTo, insert: "" });
    }
    
    // STEP 1 (The Cut): Dispatch a transaction that deletes the slides, creating the "empty frame"
    editorView.dispatch({
        changes: cutChanges,
        userEvent: "extract.cut",
        annotations: Transaction.addToHistory.of(true)
    });
    
    // Now we manually update the file cache of the parent file to include the directive
    // We do this by applying the include directive directly into the parent's fileCache
    // wait, actually we can just rely on the structural detector to do it?
    // No, we must insert the include directive into the cache.
    // Let's just insert the include directive and the content into the editor as STEP 2.
    // The include directive will be mapped to the parent file by `applyChangesToCache`.
    // Wait, the user said AT ONCE add include and content.
    // But they don't want the include directive visible. They want it expanded.
    
    // We run the structural detector manually to build the new flat text and region map
    // First, we forcefully inject the include directive into the parent fileCache at the correct location.
    // Actually, it's safer to just dispatch the include directive text into the editor, 
    // let `applyChangesToCache` put it in the parent file, and THEN immediately run the structural detector.
    
    // Step 2a: Insert the raw include directive so it gets saved to the parent file cache
    editorView.dispatch({
        changes: { from: cutChanges[0].from, insert: includeDirective },
        userEvent: "extract.paste.include"
        // No addToHistory here, we want it grouped with the next one or invisible
    });
    
    // Step 2b: Force structural detector to run synchronously to build the final expanded state
    const { flatText, map: newMap } = currentDocumentModel.buildFlatText();
    
    const oldText = editorView.state.doc.toString();
    if (oldText !== flatText) {
        const diffChanges = computeChanges(oldText, flatText);

        editorView.dispatch({
            changes: diffChanges,
            effects: setRegionMap.of(newMap),
            userEvent: "extract.paste",
            annotations: [
                syncAnnotation.of(true), // Skip applyChangesToCache for this structural expansion
                Transaction.addToHistory.of(true) // RECORD THIS IN HISTORY
            ]
        });
    } else {
        editorView.dispatch({
            effects: setRegionMap.of(newMap),
            userEvent: "extract.paste",
            annotations: [
                syncAnnotation.of(true), // Skip applyChangesToCache for this structural expansion
                Transaction.addToHistory.of(true) // RECORD THIS IN HISTORY
            ]
        });
    }
    
    selectedSlides.clear();
}

async function createEmptyFileInclude() {
    const basePath = currentFilePath ? currentFilePath.substring(0, currentFilePath.lastIndexOf('/')) : '';
    const newFilename = await promptNewFile("Enter new filename", "section.md", basePath);
    if (!newFilename) return;
    
    const fullNewPath = basePath ? `${basePath}/${newFilename}` : newFilename;
    currentDocumentModel.fileCache[fullNewPath] = "";

    const includeStr = `\n!include(${newFilename})\n`;
    const cursor = editorView.state.selection.main.head;
    editorView.dispatch({
        changes: { from: cursor, insert: includeStr }
    });
}

function handleDragStart(e, index) {
    if (!selectedSlides.has(index)) {
        selectedSlides.clear();
        selectedSlides.add(index);
        lastSelectedIndex = index;
        updateSelectionVisuals();
    }
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
    
    if (selectedSlides.has(targetGlobalIndex)) return; 
    
    const outline = editorView.state.field(outlineField);
    const sortedIdx = Array.from(selectedSlides).sort((a,b) => a-b);
    
    // We will extract text, and dispatch a single CM6 transaction to move it.
    // Sync filter will handle propagating this to other instances if needed!
    const sourceTexts = sortedIdx.map(idx => {
        const slide = outline[idx];
        return editorView.state.doc.sliceString(slide.from, slide.to);
    });
    
    const deletions = sortedIdx.map(idx => {
        const slide = outline[idx];
        let delFrom = slide.from;
        let delTo = slide.to;
        
        if (!slide.isImplicitBreak) {
            const textAfter = editorView.state.doc.sliceString(slide.to, Math.min(slide.to + 10, editorView.state.doc.length));
            const match = textAfter.match(/^\r?\n\s*---\s*\r?\n/);
            if (match) delTo += match[0].length;
            else {
                const match2 = textAfter.match(/^\s*---\s*\r?\n/);
                if (match2) delTo += match2[0].length;
            }
        } else {
            const textBefore = editorView.state.doc.sliceString(Math.max(0, slide.from - 10), slide.from);
            const match = textBefore.match(/\r?\n\s*---\s*\r?\n$/);
            if (match) delFrom -= match[0].length;
            else {
                const match2 = textBefore.match(/\r?\n\s*---\s*$/);
                if (match2) delFrom -= match2[0].length;
            }
        }
        
        return { from: delFrom, to: delTo };
    });
    
    // Sort and merge deletions to avoid overlapping ranges
    deletions.sort((a, b) => a.from - b.from);
    const mergedDeletions = [];
    for (const d of deletions) {
        if (mergedDeletions.length === 0) {
            mergedDeletions.push(d);
        } else {
            const last = mergedDeletions[mergedDeletions.length - 1];
            if (d.from <= last.to) {
                last.to = Math.max(last.to, d.to);
            } else {
                mergedDeletions.push(d);
            }
        }
    }
    
    let targetPos = 0;
    let targetSlide = null;
    if (targetGlobalIndex !== -1) {
        targetSlide = outline[targetGlobalIndex];
        if (targetSlide) {
            targetPos = insertAfter ? targetSlide.to : targetSlide.from;
        }
    } else {
        const map = editorView.state.field(regionMapField, false);
        const region = map && map.regions ? map.regions.find(r => r.file === fallbackTargetFile && r.type === 'expanded-include') : null;
        if (region) {
            targetPos = region.to;
        } else {
            targetPos = editorView.state.doc.length;
        }
    }
    
    let combinedInsertText = "";
    if (insertAfter) {
        combinedInsertText = "\n---\n" + sourceTexts.join("\n---\n");
    } else {
        combinedInsertText = sourceTexts.join("\n---\n") + "\n---\n";
    }
    
    editorView.dispatch({
        changes: [
            ...mergedDeletions.map(d => ({ from: d.from, to: d.to, insert: "" })),
            { from: targetPos, insert: combinedInsertText }
        ],
        annotations: [
            syncAnnotation.of(true),
            expandRegionAnnotation.of(targetSlide ? targetSlide.file : fallbackTargetFile)
        ]
    });
    
    selectedSlides.clear();
    lastSelectedIndex = -1;
}
