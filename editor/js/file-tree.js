import { loadFile } from './editor.js';

export const availableHtmlContexts = [];

export async function initFileTree() {
    const container = document.getElementById('file-tree');
    try {
        const res = await fetch('/api/fs');
        const data = await res.json();
        
        availableHtmlContexts.length = 0;
        function extractHtmlContexts(nodes) {
            nodes.forEach(node => {
                if (node.is_dir && node.children) {
                    extractHtmlContexts(node.children);
                } else if (node.name.endsWith('.html') && !node.path.includes('engine/')) {
                    availableHtmlContexts.push(node.path);
                }
            });
        }
        extractHtmlContexts(data.tree);
        
        container.innerHTML = '';
        renderTree(data.tree, container);
    } catch (e) {
        container.innerHTML = `<div style="color:red; padding:10px;">Failed to load workspace tree.</div>`;
    }
}

function renderTree(nodes, container) {
    nodes.forEach(node => {
        const el = document.createElement('div');
        el.className = `tree-item ${node.is_dir ? 'is-dir' : 'is-file'}`;
        
        if (node.is_dir) {
            // Use spans to easily change the icon
            el.innerHTML = `<span class="toggle-icon">▶</span> 📁 ${node.name}`;
        } else if (node.name.endsWith('.html') && !node.path.includes('engine/')) {
            el.textContent = '🖥️ ' + node.name;
        } else {
            el.textContent = '📄 ' + node.name;
        }
        
        if (!node.is_dir && node.name.endsWith('.md')) {
            el.addEventListener('click', async () => {
                const res = await fetch(`/api/file?path=${encodeURIComponent(node.path)}`);
                const data = await res.json();
                loadFile(node.path, data.content);
            });
        } else if (!node.is_dir && node.name.endsWith('.html') && !node.path.includes('engine/')) {
            el.addEventListener('click', async () => {
                const res = await fetch(`/api/file?path=${encodeURIComponent(node.path)}`);
                const data = await res.json();
                import('./editor.js').then(m => m.loadFileFromServer(node.path));
            });
        }
        
        container.appendChild(el);
        
        if (node.children) {
            const childrenContainer = document.createElement('div');
            childrenContainer.className = 'tree-children';
            childrenContainer.style.display = 'none'; // Collapsed by default
            renderTree(node.children, childrenContainer);
            container.appendChild(childrenContainer);
            
            // Toggle logic
            el.addEventListener('click', () => {
                const icon = el.querySelector('.toggle-icon');
                if (childrenContainer.style.display === 'none') {
                    childrenContainer.style.display = 'block';
                    if (icon) icon.textContent = '▼';
                } else {
                    childrenContainer.style.display = 'none';
                    if (icon) icon.textContent = '▶';
                }
            });
        }
        
        el.addEventListener('contextmenu', (e) => showTreeContextMenu(e, node));
    });
}

function showTreeContextMenu(e, node) {
    e.preventDefault();
    
    // Remove existing
    const existing = document.querySelector('.tree-context-menu');
    if (existing) existing.remove();
    
    const menu = document.createElement('div');
    menu.className = 'context-menu tree-context-menu';
    menu.style.left = `${e.clientX}px`;
    menu.style.top = `${e.clientY}px`;
    
    if (node.is_dir) {
        const createItem = document.createElement('div');
        createItem.className = 'context-menu-item';
        createItem.textContent = 'Create New File...';
        createItem.onclick = async () => {
            menu.remove();
            const { promptNewFile } = await import('./file-prompt.js');
            let newFilename = await promptNewFile("Enter new filename", "new_file.md", node.path);
            if (!newFilename) return;
            
            if (!newFilename.includes('.')) newFilename += '.md';
            
            const fullPath = `${node.path}/${newFilename}`;
            
            try {
                await fetch(`/api/file`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ path: fullPath, content: '' })
                });
                // Refresh tree
                initFileTree();
            } catch (err) {
                alert("Failed to create file: " + err.message);
            }
        };
        menu.appendChild(createItem);
    }
    
    const deleteItem = document.createElement('div');
    deleteItem.className = 'context-menu-item';
    deleteItem.textContent = 'Delete';
    deleteItem.style.color = '#e74c3c';
    deleteItem.onclick = async () => {
        menu.remove();
        if (confirm(`Are you sure you want to delete ${node.name}?`)) {
            try {
                await fetch(`/api/file?path=${encodeURIComponent(node.path)}`, {
                    method: 'DELETE'
                });
                initFileTree();
            } catch (err) {
                alert("Failed to delete: " + err.message);
            }
        }
    };
    menu.appendChild(deleteItem);
    
    document.body.appendChild(menu);
    
    const closeMenu = (evt) => {
        if (!menu.contains(evt.target)) {
            menu.remove();
            document.removeEventListener('mousedown', closeMenu);
        }
    };
    document.addEventListener('mousedown', closeMenu);
}
