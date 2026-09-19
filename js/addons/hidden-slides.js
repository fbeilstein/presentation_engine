import { SlideAddons } from '../slides-addons.js?v=3';

let isHiddenBlock = false;
let blockPassword = null;
let listenerRegistered = false;
let keyBuffer = "";

SlideAddons.registerPreProcessor((md) => {
    const startMatch = md.match(/<!--\s*hidden:start\s+(?:password=)?["']?([^"'\s]+)["']?\s*-->/i);
    if (startMatch) {
        isHiddenBlock = true;
        blockPassword = startMatch[1];
        md = md.replace(startMatch[0], '');
    }

    let stopMatch = md.match(/<!--\s*hidden:stop\s*-->/i);
    if (stopMatch) {
        md = md.replace(stopMatch[0], '');
    }

    if (isHiddenBlock || startMatch) {
        const id = "hidden-script-" + Math.floor(Math.random() * 1000000);
        md += `\n<script id="${id}">
            (function() {
                const me = document.getElementById("${id}");
                const slide = me.closest('.slide');
                if (slide) {
                    slide.classList.remove('slide');
                    slide.classList.add('hidden-slide');
                    slide.dataset.password = "${blockPassword}";
                    slide.style.display = 'none';
                    
                    const visibleSlides = document.querySelectorAll('.slide');
                    slide.dataset.triggerIndex = visibleSlides.length > 0 ? visibleSlides.length - 1 : 0;
                }
            })();
        <\/script>`;
    }

    if (stopMatch) {
        isHiddenBlock = false;
        blockPassword = null;
    }
    
    if (!listenerRegistered) {
        listenerRegistered = true;
        document.addEventListener('keydown', (e) => {
            // Ignore if typing in an input
            const tag = e.target.tagName.toLowerCase();
            if (tag === 'input' || tag === 'textarea') return;

            if (e.key.length === 1) {
                keyBuffer += e.key;
                if (keyBuffer.length > 50) keyBuffer = keyBuffer.substring(10);
                
                const hiddenSlides = document.querySelectorAll('.hidden-slide');
                let revealed = false;
                hiddenSlides.forEach(slide => {
                    const triggerIndex = parseInt(slide.dataset.triggerIndex, 10);
                    const password = slide.dataset.password;
                    
                    // Verify if current visible slide is the trigger slide
                    if (window.currentSlideIndex === triggerIndex && keyBuffer.endsWith(password)) {
                        slide.classList.remove('hidden-slide');
                        slide.classList.add('slide');
                        slide.style.display = '';
                        delete slide.dataset.password;
                        delete slide.dataset.triggerIndex;
                        revealed = true;
                    }
                });
                
                if (revealed) {
                    keyBuffer = "";
                    if (typeof window.reloadSlides === 'function') {
                        window.reloadSlides();
                    }
                }
            }
        });
    }

    return md;
});
