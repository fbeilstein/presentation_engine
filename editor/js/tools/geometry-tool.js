import { editorView } from '../editor.js';

export function initGeometryTool() {
    const toolbar = document.querySelector('.toolbar-actions');
    const btn = document.createElement('button');
    btn.textContent = '↗ Draw Arrow';
    btn.title = 'Draw an arrow over the preview';
    
    let isActive = false;
    
    btn.addEventListener('click', () => {
        isActive = !isActive;
        btn.style.backgroundColor = isActive ? 'var(--accent-color)' : '';
        
        const iframe = document.getElementById('preview-iframe');
        iframe.contentWindow.postMessage({
            type: 'toggle_tool',
            tool: 'arrow',
            active: isActive
        }, '*');
    });
    
    toolbar.appendChild(btn);
    
    // Listen for tool completion from iframe
    window.addEventListener('message', (e) => {
        if (e.data.type === 'tool_complete' && e.data.tool === 'arrow') {
            isActive = false;
            btn.style.backgroundColor = '';
            
            const { x1, y1, x2, y2 } = e.data.coords;
            const snippet = `![arrow](${x1.toFixed(1)}% ${y1.toFixed(1)}% -> ${x2.toFixed(1)}% ${y2.toFixed(1)}%){color=red width=3px}\n`;
            
            // Insert at cursor
            editorView.replaceSelection(snippet);
        }
    });
}
