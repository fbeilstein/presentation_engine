import { SlideAddons } from './slides-addons.js?v=2';
import './addons/numpy-parser.js?v=2';
import './addons/matrix-parser.js?v=3';
import './addons/youtube-parser.js?v=2';
import './addons/3dmol-parser.js?v=9';
import './addons/image-parser.js?v=2';
import './addons/static-timeline.js?v=2';
import './addons/static-diagram.js?v=2';
import './addons/titlepage-parser.js?v=1';

// --- Global API for HTML onclick handlers ---
window.toggleTheme = toggleTheme;
window.nextSlide = nextSlide;
window.prevSlide = prevSlide;
window.showDemo = showDemo;
window.hideDemo = hideDemo;
window.toggleExpand = toggleExpand;

// --- Auto-detect engine paths via import.meta.url ---
// This makes the engine mount-path-agnostic: works at engine/, lib/engine/, or repo root.
const ENGINE_JS_DIR = new URL('.', import.meta.url);
const SANDBOX_URL = new URL('sandbox/index.html', ENGINE_JS_DIR).href;
const SANDBOX_DIR = new URL('sandbox/', ENGINE_JS_DIR);
const PAGE_DIR = new URL('.', window.location.href);

/**
 * Compute relative path prefix from one directory URL to another.
 * E.g., from engine/js/sandbox/ to the page root → '../../../'
 */
function _relativePrefix(fromDir, toDir) {
    const from = fromDir.pathname.split('/').filter(Boolean);
    const to = toDir.pathname.split('/').filter(Boolean);
    let common = 0;
    while (common < from.length && common < to.length && from[common] === to[common]) common++;
    const ups = from.length - common;
    const downs = to.slice(common);
    return '../'.repeat(ups) + (downs.length ? downs.join('/') + '/' : '');
}

const DEMO_PREFIX = _relativePrefix(SANDBOX_DIR, PAGE_DIR);

// Core Slide Engine State
let currentSlideIndex = 0;
let slides = [];

// Configuration
const SLIDE_SEPARATOR = '\n---\n';

// Deprecated: Marked options now initialized in loadDependencies() after the library is fetched.

/**
 * Inject Engine Boilerplate & Dependencies
 */
function injectEngineBoilerplate() {
    // 1. Inject CSS
    const ENGINE_CSS_URL = new URL('../css/slides.css?v=6', ENGINE_JS_DIR).href;
    if (!document.querySelector(`link[href="${ENGINE_CSS_URL}"]`)) {
        const link = document.createElement('link');
        link.rel = 'stylesheet';
        link.href = ENGINE_CSS_URL;
        document.head.appendChild(link);
    }

    const hljsTheme = document.createElement('link');
    hljsTheme.id = 'highlight-theme';
    hljsTheme.rel = 'stylesheet';
    hljsTheme.href = document.body.classList.contains('light-theme') ? 
        'https://cdnjs.cloudflare.com/ajax/libs/highlight.js/11.9.0/styles/atom-one-light.min.css' :
        'https://cdnjs.cloudflare.com/ajax/libs/highlight.js/11.9.0/styles/atom-one-dark.min.css';
    document.head.appendChild(hljsTheme);

    // 2. Inject DOM Elements if missing
    if (!document.getElementById('presentation-container')) {
        document.body.innerHTML += `
            <button id="theme-toggle" onclick="toggleTheme()" title="Toggle Day/Night Theme">🌙</button>
            <button id="expand-toggle" onclick="toggleExpand()" title="Expand Slide" style="position: fixed; top: 20px; right: 74px; width: 44px; height: 44px; background-color: var(--control-bg); color: var(--text-color); border: 1px solid var(--table-border); border-radius: 50%; cursor: pointer; display: flex; align-items: center; justify-content: center; font-size: 1.4rem; z-index: 900; box-shadow: 0 4px 12px rgba(0, 0, 0, 0.2); transition: all 0.3s;">⛶</button>
            <div id="presentation-container"></div>
            <div id="controls">
                <button id="prev-btn" onclick="prevSlide()">&#10094; Prev</button>
                <span id="slide-counter">1 / 1</span>
                <button id="next-btn" onclick="nextSlide()">Next &#10095;</button>
            </div>
            <div id="demo-overlay" class="hidden">
                <div id="demo-header">
                    <span id="demo-title">Interactive Demo</span>
                    <button id="close-demo-btn" onclick="hideDemo()">&#10006; Return to Slides</button>
                </div>
                <iframe id="demo-iframe" src=""></iframe>
            </div>
        `;
    }
}

async function loadDependencies() {
    const loadScript = (src) => new Promise((resolve, reject) => {
        if (document.querySelector(`script[src="${src}"]`)) return resolve();
        const script = document.createElement('script');
        script.src = src;
        script.onload = resolve;
        script.onerror = reject;
        document.head.appendChild(script);
    });

    await Promise.all([
        loadScript("https://cdn.jsdelivr.net/npm/marked/marked.min.js"),
        loadScript("https://cdnjs.cloudflare.com/ajax/libs/highlight.js/11.9.0/highlight.min.js").then(() => 
            loadScript("https://cdnjs.cloudflare.com/ajax/libs/highlight.js/11.9.0/languages/python.min.js")
        )
    ]);

    if (!window.MathJax) {
        window.MathJax = {
            tex: { inlineMath: [['$', '$'], ['\\(', '\\)']], displayMath: [['$$', '$$'], ['\\[', '\\]']], processEscapes: true },
            svg: { fontCache: 'global' },
            startup: { typeset: false } // We will trigger it manually
        };
        await loadScript("https://cdn.jsdelivr.net/npm/mathjax@3/es5/tex-mml-chtml.js");
    }

    marked.setOptions({
        gfm: true, breaks: false, pedantic: false, sanitize: false, smartLists: true, smartypants: true
    });
}

/**
 * Initialization on DOM Load
 */
document.addEventListener('DOMContentLoaded', async () => {
    try {
        injectEngineBoilerplate();
        await loadDependencies();

        let rawMarkdown = '';
        let basePath = window.location.pathname.substring(0, window.location.pathname.lastIndexOf('/'));
        
        const template = document.getElementById('markdown-source');
        const urlParams = new URLSearchParams(window.location.search);
        const fileUrl = urlParams.get('file');

        if (template) {
            // Source embedded directly in HTML <template> or <script>
            rawMarkdown = template.tagName.toLowerCase() === 'script' ? template.textContent : template.innerHTML.replace(/&gt;/g, ">").replace(/&lt;/g, "<").replace(/&amp;/g, "&");
            
            // Auto-dedent to fix IDE auto-formatting adding tabs/spaces
            const lines = rawMarkdown.split('\n');
            let minIndent = Infinity;
            for (const line of lines) {
                if (line.trim().length > 0) {
                    const indent = line.match(/^\s*/)[0].length;
                    if (indent < minIndent) minIndent = indent;
                }
            }
            if (minIndent > 0 && minIndent !== Infinity) {
                rawMarkdown = lines.map(line => line.length >= minIndent ? line.substring(minIndent) : line).join('\n');
            }
        } else if (fileUrl) {
            // Source fetched from URL
            const lastSlash = fileUrl.lastIndexOf('/');
            basePath = lastSlash !== -1 ? fileUrl.substring(0, lastSlash) : '';
            const fileName = lastSlash !== -1 ? fileUrl.substring(lastSlash + 1) : fileUrl;
            
            const response = await fetch(fileUrl, { cache: 'no-cache' });
            if (!response.ok) throw new Error(`HTTP ${response.status} loading ${fileUrl}`);
            rawMarkdown = await response.text();
        } else {
            throw new Error("No markdown source found. Ensure `<template id='markdown-source'>` exists or provide `?file=` URL parameter.");
        }

        // Recursively resolve any !include() statements inside the Markdown
        const finalMarkdown = await resolveIncludesInString(basePath, rawMarkdown);

        parseAndInjectSlides(finalMarkdown);

        if (window.MathJax && typeof MathJax.typesetPromise === 'function') {
            MathJax.typesetPromise().catch(err => console.error("MathJax error:", err));
        }

        setupKeyboardNav();

    } catch (e) {
        const container = document.getElementById('presentation-container');
        if (container) {
            container.innerHTML = `
                <div class="slide active">
                    <h1 style="color: #e53935;">Failed to load lecture</h1>
                    <pre>${e.message}</pre>
                </div>
            `;
        } else {
            console.error("Critical Engine Failure:", e);
        }
    }
});

/**
 * Recursively parses markdown string for !include(filename.md) and fetches them.
 */
async function resolveIncludesInString(basePath, markdownStr, visited = new Set()) {
    const lines = markdownStr.split('\n');
    const resolvedLines = [];

    for (const line of lines) {
        const includeMatch = line.match(/^\s*!include\((.+)\)\s*$/);
        if (includeMatch) {
            const includeFile = includeMatch[1].trim();
            const fullUrl = basePath ? `${basePath}/${includeFile}` : includeFile;
            
            if (visited.has(fullUrl)) {
                resolvedLines.push(`\n> **Error**: Circular inclusion detected for \`${fullUrl}\`\n`);
                continue;
            }
            visited.add(fullUrl);

            try {
                const response = await fetch(fullUrl, { cache: 'no-cache' });
                if (!response.ok) throw new Error(`HTTP ${response.status}`);
                const content = await response.text();
                
                const newBasePath = fullUrl.substring(0, fullUrl.lastIndexOf('/'));
                const includedContent = await resolveIncludesInString(newBasePath, content, visited);
                resolvedLines.push(includedContent);
            } catch (e) {
                resolvedLines.push(`\n> **Error** including \`${fullUrl}\`: ${e.message}\n`);
            }
        } else {
            resolvedLines.push(line);
        }
    }
    return resolvedLines.join('\n');
}

/**
 * Splits raw markdown into individual slides and renders them to HTML via Marked.js
 */
function parseAndInjectSlides(markdownContent) {
    const rawSlides = markdownContent.split(SLIDE_SEPARATOR);
    const container = document.getElementById('presentation-container');
    container.innerHTML = ''; // Clear exactly

    rawSlides.forEach((rawMd, index) => {
        const slideDiv = document.createElement('div');
        slideDiv.className = 'slide';
        if (index === 0) slideDiv.classList.add('active'); // First slide visible

        // Convert Markdown (including custom wrappers and flexboxes) to browser HTML
        rawMd = SlideAddons.preProcess(rawMd);
        const parsedHtml = marked.parse(rawMd);
        slideDiv.innerHTML = `<div style="position: relative; width: 100%; height: 100%; display: flow-root;">${parsedHtml}</div>`;
        container.appendChild(slideDiv);

        // Browsers block <script> tags injected via innerHTML from executing automatically.
        // To allow the user to embed custom JS in their slides, we must manually clone and replace them.
        const scripts = slideDiv.querySelectorAll('script');
        scripts.forEach(oldScript => {
            const newScript = document.createElement('script');
            // Copy attributes (src, type, etc)
            Array.from(oldScript.attributes).forEach(attr => {
                newScript.setAttribute(attr.name, attr.value);
            });
            // Copy inline code
            newScript.appendChild(document.createTextNode(oldScript.innerHTML));
            oldScript.parentNode.replaceChild(newScript, oldScript);
        });
    });

    slides = document.querySelectorAll('.slide');
    updateCounter();
    updateSlideScale();

    SlideAddons.renderAll();

    // Trigger Highlight.js on all newly created code blocks
    if (window.hljs) {
        document.querySelectorAll('pre code').forEach((block) => {
            hljs.highlightElement(block);
        });
    }
}

/**
 * Navigation Logic
 */
function showSlide(index) {
    if (index < 0 || index >= slides.length) return;

    // Hide current
    slides[currentSlideIndex].classList.remove('active');

    // Show new
    currentSlideIndex = index;
    slides[currentSlideIndex].classList.add('active');

    updateCounter();
}

function nextSlide() {
    showSlide(currentSlideIndex + 1);
}

function prevSlide() {
    showSlide(currentSlideIndex - 1);
}

function updateCounter() {
    const counter = document.getElementById('slide-counter');
    if (counter && slides.length > 0) {
        counter.textContent = `${currentSlideIndex + 1} / ${slides.length}`;
    }
}

/**
 * Global Keyboard Listeners for Presentation Flow
 */
function setupKeyboardNav() {
    document.addEventListener('keydown', (e) => {
        // Prevent slides from switching if the user is typing inside an inline input field (like the Merkle demo)
        const tag = e.target.tagName.toLowerCase();
        if (tag === 'input' || tag === 'textarea') return;

        // Don't trigger if they are somehow typing in an input inside a demo (though iframe should catch it)
        if (document.getElementById('demo-overlay').classList.contains('hidden') === false) {
            // Only allow escape key to exit demo
            if (e.key === 'Escape') hideDemo();
            return;
        }

        switch (e.key) {
            case 'ArrowRight':
            case 'Spacebar':
            case ' ':
            case 'Enter':
                e.preventDefault();
                window.nextSlide();
                break;
            case 'ArrowLeft':
            case 'Backspace':
                e.preventDefault();
                window.prevSlide();
                break;
        }
    });
}

/**
 * Demo Overlay Logic
 * Allows a markdown slide to contain: <button class="demo-btn" onclick="showDemo('failure-phi')">Open Demo</button>
 */
function showDemo(demoName) {
    const overlay = document.getElementById('demo-overlay');
    const iframe = document.getElementById('demo-iframe');
    const title = document.getElementById('demo-title');

    // If demoName is an HTML file, load it directly (relative to the page).
    // Otherwise (if it's a JSON path or short name), route it through the sandbox engine.
    if (demoName.endsWith('.json')) {
        iframe.src = `${SANDBOX_URL}?code=${DEMO_PREFIX}${demoName}`;
    } else {
        iframe.src = demoName;
    }

    title.textContent = `Interactive Demo: ${demoName.split('/').pop()}`;

    overlay.classList.remove('hidden');
};

function hideDemo() {
    const overlay = document.getElementById('demo-overlay');
    const iframe = document.getElementById('demo-iframe');

    // Wipe the SRC so the simulation physically stops computing in the background
    iframe.src = '';
    overlay.classList.add('hidden');
};

/**
 * Theme Management
 */
function toggleTheme() {
    const isLight = document.body.classList.toggle('light-theme');
    const theme = isLight ? 'light' : 'dark';
    localStorage.setItem('theme', theme);

    // Update button icon
    const btn = document.getElementById('theme-toggle');
    if (btn) btn.textContent = isLight ? '☀️' : '🌙';

    // Update Highlight.js theme
    const hljsTheme = document.getElementById('highlight-theme');
    if (hljsTheme) {
        hljsTheme.href = isLight ?
            'https://cdnjs.cloudflare.com/ajax/libs/highlight.js/11.9.0/styles/atom-one-light.min.css' :
            'https://cdnjs.cloudflare.com/ajax/libs/highlight.js/11.9.0/styles/atom-one-dark.min.css';
    }

    // Broadcast to static timelines on the same page
    window.dispatchEvent(new CustomEvent('theme-change', { detail: { theme } }));

    // Broadcast to ALL iframes on the current page (including inline ones)
    document.querySelectorAll('iframe').forEach(iframe => {
        if (iframe.contentWindow) {
            iframe.contentWindow.postMessage({ type: 'theme-change', theme }, '*');
        }
    });
};

// Initial theme load (Run immediately)
(function initTheme() {
    const savedTheme = localStorage.getItem('theme') || 'dark';
    const isLight = savedTheme === 'light';

    if (isLight) {
        document.body.classList.add('light-theme');
    } else {
        document.body.classList.remove('light-theme');
    }

    // We must wait for DOM to be ready to find the button and stylesheet
    document.addEventListener('DOMContentLoaded', () => {
        const btn = document.getElementById('theme-toggle');
        if (btn) btn.textContent = isLight ? '☀️' : '🌙';

        const hljsTheme = document.getElementById('highlight-theme');
        if (hljsTheme) {
            hljsTheme.href = isLight ?
                'https://cdnjs.cloudflare.com/ajax/libs/highlight.js/11.9.0/styles/atom-one-light.min.css' :
                'https://cdnjs.cloudflare.com/ajax/libs/highlight.js/11.9.0/styles/atom-one-dark.min.css';
        }
    });
})();

// Re-broadcast theme when ANY iframe loads (handles inline iframes too)
window.addEventListener('load', function (e) {
    if (e.target.tagName && e.target.tagName.toLowerCase() === 'iframe') {
        const isLight = document.body.classList.contains('light-theme');
        e.target.contentWindow.postMessage({ type: 'theme-change', theme: isLight ? 'light' : 'dark' }, '*');
    }
}, true); // Use capture phase to catch iframe loads

// Also listen for a specific request for theme (handshake)
window.addEventListener('message', (event) => {
    if (event.data && event.data.type === 'get-theme') {
        const isLight = document.body.classList.contains('light-theme');
        event.source.postMessage({ type: 'theme-change', theme: isLight ? 'light' : 'dark' }, '*');
    }
});

/**
 * Expand/Fullscreen slide toggle
 */
function toggleExpand() {
    slides.forEach(slide => slide.classList.toggle('expanded'));
    updateSlideScale();
}

/**
 * Responsive Scaling (Fixed Layout Resolution)
 */
function updateSlideScale() {
    if (!slides || !slides.length) return;
    const isExpanded = slides[0].classList.contains('expanded');
    
    // Fixed base resolution
    const baseWidth = 1600;
    const baseHeight = 900;
    
    // Normal mode fits within 90% width / 85% height
    // Expanded mode fills 100% of the window
    const targetWidth = isExpanded ? window.innerWidth : window.innerWidth * 0.9;
    const targetHeight = isExpanded ? window.innerHeight : window.innerHeight * 0.85;
    
    const scale = Math.min(targetWidth / baseWidth, targetHeight / baseHeight);
    document.documentElement.style.setProperty('--slide-scale', scale);
}
window.addEventListener('resize', updateSlideScale);
