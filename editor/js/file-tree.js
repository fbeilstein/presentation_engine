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
            el.addEventListener('click', () => {
                const iframe = document.getElementById('preview-iframe');
                iframe.src = 'preview.html?context=/' + node.path;
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
    });
}
