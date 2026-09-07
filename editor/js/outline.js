import { editorView, currentFilePath, loadFileFromServer } from './editor.js';

let globalSlideMapping = [];

export function initOutline() {
    // Outline is now driven by presentation_loaded events from bridge.js
}

export function renderGlobalOutline(slides) {
    globalSlideMapping = slides;
    const container = document.getElementById('slide-outline');
    container.innerHTML = '';
    
    slides.forEach((slide, index) => {
        const el = document.createElement('div');
        el.className = 'outline-item';
        el.textContent = `${index + 1}. ${slide.title}`;
        el.title = slide.title;
        
        el.addEventListener('click', async () => {
            document.querySelectorAll('.outline-item').forEach(i => i.classList.remove('active'));
            el.classList.add('active');
            
            if (currentFilePath !== slide.file && slide.file !== 'unknown') {
                await loadFileFromServer(slide.file);
            }
            
            // Jump cursor to localIndex
            const content = editorView.getValue();
            const chunks = content.split(/^---$/gm);
            
            let line = 0;
            for (let i = 0; i < slide.localIndex && i < chunks.length; i++) {
                line += chunks[i].split('\n').length;
            }
            
            editorView.setCursor({line: line, ch: 0});
            editorView.focus();
            
            const t = editorView.charCoords({line: line, ch: 0}, "local").top; 
            editorView.scrollTo(null, t);
        });
        
        container.appendChild(el);
    });
}
