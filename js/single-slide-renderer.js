import { SlideAddons } from './slides-addons.js?v=3';

export function renderSingleSlide(markdownString, options = {}) {
    let md = options.addons ? options.addons.preProcess(markdownString) : markdownString;
    return marked.parse(md);
}

export function updateSlideDOM(slideElement, markdownString, options = {}) {
    const html = renderSingleSlide(markdownString, options);
    slideElement.innerHTML = `<div style="position: relative; width: 100%; height: 100%; display: flow-root;">${html}</div>`;
    
    if (options.addons) {
        options.addons.renderAll();
    } else {
        SlideAddons.renderAll();
    }
    
    // Execute script tags injected via innerHTML
    const scripts = slideElement.querySelectorAll('script');
    scripts.forEach(oldScript => {
        const newScript = document.createElement('script');
        Array.from(oldScript.attributes).forEach(attr => {
            newScript.setAttribute(attr.name, attr.value);
        });
        newScript.appendChild(document.createTextNode(oldScript.innerHTML));
        oldScript.parentNode.replaceChild(newScript, oldScript);
    });
    
    if (window.MathJax) {
        
        window.MathJax.typesetPromise([slideElement]).catch(() => {});
    }
    
    if (window.hljs) {
        slideElement.querySelectorAll('pre code').forEach(b => window.hljs.highlightElement(b));
    }
}
