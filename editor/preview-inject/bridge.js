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

window.addEventListener('engine_ready', () => {
    buildSlideMapping();
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
        const html = slide.innerHTML;
        // Find all source markers: <!-- SOURCE: file:localIndex --> or fallback <!-- SOURCE: file -->
        const matches = [...html.matchAll(/<!-- SOURCE: ([^\s:]+)(?::(\d+))? -->/g)];
        
        let file = null;
        let fileStack = [];
        let localIndex = null;
        let allSources = [];

        if (matches.length > 0) {
            // The last marker generally indicates the file that actually provided the content
            const lastMatch = matches[matches.length - 1];
            const stackStr = lastMatch[1];
            fileStack = stackStr.split('|').map(normalizePath);
            file = fileStack[fileStack.length - 1];
            
            if (lastMatch[2] !== undefined) {
                localIndex = parseInt(lastMatch[2], 10);
            }
            
            // Record all sources for sync
            allSources = matches.map(m => {
                const sStr = m[1];
                const fStack = sStr.split('|').map(normalizePath);
                return {
                    file: fStack[fStack.length - 1],
                    fileStack: fStack,
                    localIndex: m[2] !== undefined ? parseInt(m[2], 10) : null
                };
            });
        } else {
            // If there's no SOURCE marker, it's from the main template
            file = new URLSearchParams(window.location.search).get('context');
            if (file) {
                file = normalizePath(file.replace(/^\//, ''));
            } else {
                file = 'unknown';
            }
            fileStack = [file];
        }

        if (fileLocalCounts[file] === undefined) {
            fileLocalCounts[file] = 0;
        }
        
        // If localIndex wasn't provided by the marker, use our own counter
        if (localIndex === null) {
            localIndex = fileLocalCounts[file];
        }

        const h1 = slide.querySelector('h1, h2, h3');
        const title = h1 ? h1.textContent.trim() : `Slide ${globalIndex + 1}`;

        // Check if slide is practically empty (only HTML comments and whitespace)
        const textContent = slide.innerHTML.replace(/<!--[\s\S]*?-->/g, '').trim();
        const isEmpty = textContent === '';

        slideMapping.push({
            globalIndex: globalIndex,
            file: file,
            fileStack: fileStack,
            localIndex: localIndex,
            sources: allSources,
            title: title,
            isEmpty: isEmpty
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
    if (e.data.type === 'editor_slide') {
        const { markdown, activeIndex } = e.data;
        const allSlides = markdown.split(/^---$/gm);
        const totalSlides = allSlides.length;
        const slideMarkdown = allSlides[activeIndex] || '';

        const container = document.getElementById('presentation-container');
        if (!container) return;
        
        let globalStyles = '';
        const styleMatches = [...markdown.matchAll(/<style[^>]*>([\s\S]*?)<\/style>/gi)];
        if (styleMatches.length > 0) {
            globalStyles = styleMatches.map(m => m[0]).join('\n');
        }
        let styleContainer = document.getElementById('editor-injected-styles');
        if (!styleContainer) {
            styleContainer = document.createElement('div');
            styleContainer.id = 'editor-injected-styles';
            document.head.appendChild(styleContainer);
        }
        if (styleContainer.innerHTML !== globalStyles) {
            styleContainer.innerHTML = globalStyles;
        }

        let slideDiv = container.querySelector('.slide');
        // In editor mode, we only want ONE slide div in the container
        if (!slideDiv || container.children.length > 1) {
            container.innerHTML = '';
            slideDiv = document.createElement('div');
            slideDiv.className = 'slide active';
            container.appendChild(slideDiv);
        }
        
        import('../../js/single-slide-renderer.js').then(renderer => {
            renderer.updateSlideDOM(slideDiv, slideMarkdown, { addons: window.SlideAddons });
            if (window.updateSlideScale) window.updateSlideScale();
        }).catch(err => console.error("Failed to load slide renderer", err));
        
        if (window.updateCounter) {
            window.updateCounter(activeIndex, totalSlides);
        }
    } else if (e.data.type === 'sync_slide') {
        const { globalIndex } = e.data;
        if (globalIndex !== undefined && window.showSlide) {
            window.showSlide(globalIndex);
        }
    } else if (e.data.type === 'update_slide') {
        const { globalIndex, markdown } = e.data;
        if (globalIndex !== undefined) {
            console.log('Update slide', globalIndex, markdown.substring(0,20)); updateSingleSlide(globalIndex, markdown);
        }
    } else if (e.data.type === 'update_all') {
        window.location.reload();
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

    import('../../js/single-slide-renderer.js').then(renderer => {
        renderer.updateSlideDOM(slideDiv, rawMd, { addons: window.SlideAddons });
        
        if (window.showSlide) {
            window.showSlide(globalIndex);
        }
        
        if (window.updateSlideScale) {
            window.updateSlideScale();
        }
    }).catch(err => console.error("Failed to load slide renderer", err));
}
