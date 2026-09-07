// Injected into the preview iframe
console.log("[Editor Bridge] Initialized.");

let slideMapping = []; // Array of { globalIndex, file, localIndex, title }

function normalizePath(p) {
    const parts = p.split('/');
    const resolved = [];
    for (const part of parts) {
        if (part === '.' || part === '') continue;
        if (part === '..') {
            if (resolved.length > 0) resolved.pop();
        } else {
            resolved.push(part);
        }
    }
    return resolved.join('/');
}

// Wait for the engine to finish parsing and injecting slides
// Since engine uses DOMContentLoaded and async fetches, we need a MutationObserver or a small timeout
// Actually, engine calls parseAndInjectSlides which sets innerHTML of #presentation-container.
// We can observe the container.

const observer = new MutationObserver((mutations) => {
    const container = document.getElementById('presentation-container');
    if (container && container.children.length > 0) {
        // The engine has rendered slides. Let's build the mapping.
        buildSlideMapping();
        observer.disconnect(); // Only run once on initial load
    }
});

document.addEventListener('DOMContentLoaded', () => {
    observer.observe(document.body, { childList: true, subtree: true });
});

function buildSlideMapping() {
    const slides = document.querySelectorAll('.slide');
    slideMapping = [];
    
    // Track how many slides we've seen for each file
    const fileLocalCounts = {};
    
    // We also need to know the 'main' file context. The engine loads ?file= or <template>.
    // Usually the entry point itself serves as the root if there are no includes, but
    // the source markers will tell us the exact file.

    slides.forEach((slide, globalIndex) => {
        // Look for the source marker comment injected by our modified slides.js
        const html = slide.innerHTML;
        const sourceMatch = html.match(/<!-- SOURCE: ([^\s]+) -->/);
        
        let file = null;
        if (sourceMatch) {
            file = sourceMatch[1];
            // Normalize path
            file = normalizePath(file);
        } else {
            // If there's no SOURCE marker, it's from the main template
            file = new URLSearchParams(window.location.search).get('context');
            if (file) {
                file = normalizePath(file.replace(/^\//, ''));
            } else {
                file = 'unknown';
            }
        }

        if (fileLocalCounts[file] === undefined) {
            fileLocalCounts[file] = 0;
        }
        
        const h1 = slide.querySelector('h1, h2, h3');
        const title = h1 ? h1.textContent.trim() : `Slide ${globalIndex + 1}`;

        slideMapping.push({
            globalIndex: globalIndex,
            file: file,
            localIndex: fileLocalCounts[file],
            title: title
        });

        fileLocalCounts[file]++;
    });
    
    console.log("[Editor Bridge] Slide mapping built:", slideMapping);
    
    // Notify editor
    const uniqueFiles = [...new Set(slideMapping.map(s => s.file))].filter(f => f !== 'unknown');
    window.parent.postMessage({
        type: 'presentation_loaded',
        files: uniqueFiles,
        slides: slideMapping
    }, '*');
}

window.addEventListener('message', (e) => {
    if (e.data.type === 'sync_slide') {
        const { file, localIndex } = e.data;
        const globalIndex = slideMapping.findIndex(s => s.file === file && s.localIndex === localIndex);
        if (globalIndex !== -1 && window.showSlide) {
            window.showSlide(globalIndex);
        }
    } else if (e.data.type === 'update_slide') {
        const { file, localIndex, markdown } = e.data;
        const globalIndex = slideMapping.findIndex(s => s.file === file && s.localIndex === localIndex);
        if (globalIndex !== -1) {
            updateSingleSlide(globalIndex, markdown);
        }
    } else if (e.data.type === 'toggle_tool') {
        toggleTool(e.data.tool, e.data.active);
    }
});

let drawingOverlay = null;
let currentTool = null;
let startCoords = null;

function toggleTool(tool, active) {
    if (!active) {
        if (drawingOverlay) drawingOverlay.remove();
        drawingOverlay = null;
        currentTool = null;
        return;
    }
    
    currentTool = tool;
    drawingOverlay = document.createElement('div');
    drawingOverlay.style.position = 'fixed';
    drawingOverlay.style.top = '0';
    drawingOverlay.style.left = '0';
    drawingOverlay.style.width = '100vw';
    drawingOverlay.style.height = '100vh';
    drawingOverlay.style.zIndex = '9999';
    drawingOverlay.style.cursor = 'crosshair';
    
    // Create an SVG for previewing the line
    drawingOverlay.innerHTML = `<svg style="width:100%; height:100%; pointer-events:none;">
        <line id="preview-line" x1="0" y1="0" x2="0" y2="0" stroke="red" stroke-width="3" stroke-dasharray="5,5" display="none" />
    </svg>`;
    
    document.body.appendChild(drawingOverlay);
    
    drawingOverlay.addEventListener('mousedown', (e) => {
        const rect = drawingOverlay.getBoundingClientRect();
        startCoords = {
            x: (e.clientX / rect.width) * 100,
            y: (e.clientY / rect.height) * 100
        };
        const line = document.getElementById('preview-line');
        line.setAttribute('x1', e.clientX);
        line.setAttribute('y1', e.clientY);
        line.setAttribute('x2', e.clientX);
        line.setAttribute('y2', e.clientY);
        line.style.display = 'block';
    });
    
    drawingOverlay.addEventListener('mousemove', (e) => {
        if (!startCoords) return;
        const line = document.getElementById('preview-line');
        line.setAttribute('x2', e.clientX);
        line.setAttribute('y2', e.clientY);
    });
    
    drawingOverlay.addEventListener('mouseup', (e) => {
        if (!startCoords) return;
        const rect = drawingOverlay.getBoundingClientRect();
        const endCoords = {
            x: (e.clientX / rect.width) * 100,
            y: (e.clientY / rect.height) * 100
        };
        
        window.parent.postMessage({
            type: 'tool_complete',
            tool: currentTool,
            coords: { x1: startCoords.x, y1: startCoords.y, x2: endCoords.x, y2: endCoords.y }
        }, '*');
        
        toggleTool(null, false);
    });
}

function updateSingleSlide(globalIndex, rawMd) {
    const slideDiv = document.querySelectorAll('.slide')[globalIndex];
    if (!slideDiv) return;

    // Process markdown exactly as the engine does
    let md = window.SlideAddons ? window.SlideAddons.preProcess(rawMd) : rawMd;
    const parsedHtml = window.marked.parse(md);
    
    // We keep the wrapper div
    slideDiv.innerHTML = `<div style="position: relative; width: 100%; height: 100%; display: flow-root;">${parsedHtml}</div>`;
    
    // Render addons
    if (window.SlideAddons) {
        window.SlideAddons.renderAll();
    }
    
    // Trigger MathJax typeset for the updated slide only
    if (window.MathJax && typeof MathJax.typesetPromise === 'function') {
        MathJax.typesetPromise([slideDiv]).catch(err => console.error("MathJax error:", err));
    }
    
    // Trigger Highlight.js
    if (window.hljs) {
        slideDiv.querySelectorAll('pre code').forEach((block) => {
            hljs.highlightElement(block);
        });
    }
    
    // Make sure we're showing this slide
    if (window.showSlide) {
        window.showSlide(globalIndex);
    }
}
