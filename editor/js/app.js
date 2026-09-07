import { initEditor } from './editor.js';
import { initFileTree } from './file-tree.js';
import { initOutline } from './outline.js';
import { initTools } from './tools/tool-manager.js';

document.addEventListener('DOMContentLoaded', () => {
    // 1. Resizer Logic
    const dragMe = document.getElementById('dragMe');
    const leftPane = document.querySelector('.editor-pane');
    
    let isDragging = false;
    
    dragMe.addEventListener('mousedown', (e) => {
        isDragging = true;
        document.body.style.cursor = 'col-resize';
        const iframe = document.getElementById('preview-iframe');
        if (iframe) iframe.style.pointerEvents = 'none';
    });
    
    document.addEventListener('mousemove', (e) => {
        if (!isDragging) return;
        const container = document.querySelector('.split-pane');
        const containerRect = container.getBoundingClientRect();
        
        let newWidth = e.clientX - containerRect.left;
        if (newWidth < 200) newWidth = 200;
        if (newWidth > containerRect.width - 200) newWidth = containerRect.width - 200;
        
        leftPane.style.flex = 'none';
        leftPane.style.width = `${newWidth}px`;
    });
    
    document.addEventListener('mouseup', () => {
        if (isDragging) {
            isDragging = false;
            document.body.style.cursor = 'default';
            const iframe = document.getElementById('preview-iframe');
            if (iframe) iframe.style.pointerEvents = 'auto';
            
            // Let CodeMirror know its container size changed
            if (window.editorView) {
                window.editorView.refresh();
            }
        }
    });

    // 2. Sidebar Resizer Logic
    const sidebarResizer = document.getElementById('sidebar-resizer');
    const sidebar = document.getElementById('sidebar');
    
    let isDraggingSidebar = false;
    
    sidebarResizer.addEventListener('mousedown', (e) => {
        isDraggingSidebar = true;
        document.body.style.cursor = 'col-resize';
        const iframe = document.getElementById('preview-iframe');
        if (iframe) iframe.style.pointerEvents = 'none';
    });
    
    document.addEventListener('mousemove', (e) => {
        if (!isDraggingSidebar) return;
        let newWidth = e.clientX;
        if (newWidth < 150) newWidth = 150;
        if (newWidth > 600) newWidth = 600;
        
        sidebar.style.flex = 'none';
        sidebar.style.width = `${newWidth}px`;
    });
    
    document.addEventListener('mouseup', () => {
        if (isDraggingSidebar) {
            isDraggingSidebar = false;
            document.body.style.cursor = 'default';
            const iframe = document.getElementById('preview-iframe');
            if (iframe) iframe.style.pointerEvents = 'auto';
            
            if (window.editorView) {
                window.editorView.refresh();
            }
        }
    });

    // 3. Init Modules
    initEditor();
    initFileTree();
    initOutline();
    initTools();
});
