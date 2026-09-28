import { editorView } from '../editor.js';

export function initReactTool() {
    const toolbar = document.querySelector('.toolbar-actions');
    if (!toolbar) return;
    
    const btn = document.createElement('button');
    btn.textContent = '▧ Draw React';
    btn.title = 'Draw a clickable reactive area over the preview';
    
    let isActive = false;
    
    btn.addEventListener('click', () => {
        isActive = !isActive;
        btn.style.backgroundColor = isActive ? 'var(--accent-color)' : '';
        
        const iframe = document.getElementById('preview-iframe');
        iframe.contentWindow.postMessage({
            type: 'toggle_tool',
            tool: 'react',
            active: isActive
        }, '*');
    });
    
    toolbar.appendChild(btn);
    
    // Listen for tool completion from iframe
    window.addEventListener('message', (e) => {
        if (e.data.type === 'tool_complete' && e.data.tool === 'react') {
            isActive = false;
            btn.style.backgroundColor = '';
            
            const { x1, y1, x2, y2 } = e.data.coords;
            const x = Math.min(x1, x2);
            const y = Math.min(y1, y2);
            const w = Math.abs(x2 - x1);
            const h = Math.abs(y2 - y1);
            
            const snippet = `\n:::react{${x.toFixed(1)} ${y.toFixed(1)} ${w.toFixed(1)} ${h.toFixed(1)} debug}\nel.onclick = () => window.openMoleculePopup({"Molecule": "path.bundle"});\n:::\n`;
            
            const selection = editorView.state.selection.main;
            editorView.dispatch({
                changes: { from: selection.from, to: selection.to, insert: snippet },
                selection: { anchor: selection.from + snippet.length }
            });
            editorView.focus();
        }
    });
}
