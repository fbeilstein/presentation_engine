import { RxnBundleLoader } from './rxnbundle-loader.js';

let scriptPromise = null;
function load3DmolScript() {
    if (window['3Dmol']) return Promise.resolve(window['3Dmol']);
    if (scriptPromise) return scriptPromise;
    scriptPromise = new Promise((resolve, reject) => {
        const s = document.createElement('script');
        s.src = 'https://3dmol.org/build/3Dmol-min.js';
        s.onload = () => resolve(window['3Dmol']);
        s.onerror = reject;
        document.head.appendChild(s);
    });
    return scriptPromise;
}

export class MoleculeViewerCore {
    constructor(containerId, bundles, config = {}) {
        this.container = document.getElementById(containerId);
        this.bundles = bundles;
        this.config = config;
        
        this.viewer = null;
        this.currentBundleName = config.initialMolecule || Object.keys(bundles)[0];
        this.loaders = {}; // cache of RxnBundleLoader instances
        
        // State
        this.activeOrbitals = new Set();
        this.orbitalCache = {}; // { file: volumetricData }
        this.currentRenderId = 0;
        
        // Generate internal IDs for DOM elements
        this.uiId = `molview_ui_${Math.random().toString(36).substring(2, 9)}`;
        this.canvasId = `molview_canvas_${Math.random().toString(36).substring(2, 9)}`;
        
        this.init();
    }

    async init() {
        this.renderShell();
        const $3Dmol = await load3DmolScript();
        
        // Wait until canvas is visible to initialize 3Dmol (fails if container is display:none)
        const canvasEl = document.getElementById(this.canvasId);
        
        if (!canvasEl) {
            console.warn("Molecule viewer container removed from DOM before initialization.");
            return;
        }

        if (canvasEl.clientWidth === 0 || canvasEl.clientHeight === 0) {
            await new Promise(resolve => {
                const observer = new ResizeObserver((entries) => {
                    if (entries[0].contentRect.width > 0) {
                        observer.disconnect();
                        resolve();
                    }
                });
                observer.observe(canvasEl);
            });
        }
        
        // Double check canvasEl is still in the DOM after awaiting ResizeObserver
        if (!document.getElementById(this.canvasId)) {
            console.warn("Molecule viewer container removed from DOM while waiting for visibility.");
            return;
        }

        this.viewer = $3Dmol.createViewer(canvasEl, { backgroundColor: 'white', alpha: true });
        
        // Intercept right-click (button 2) to act as Ctrl+Left-click (pan)
        const spoofEvent = (e) => {
            const isRightClick = (e.type.includes('down') || e.type.includes('up')) ? e.button === 2 : (e.buttons & 2);
            if (isRightClick) {
                // Shadow properties on the existing event object
                Object.defineProperty(e, 'button', { value: 0 });
                Object.defineProperty(e, 'buttons', { value: e.type.includes('up') ? 0 : 1 });
                Object.defineProperty(e, 'which', { value: 1 });
                Object.defineProperty(e, 'ctrlKey', { value: true });
            }
        };

        const events = ['mousedown', 'mousemove', 'mouseup', 'pointerdown', 'pointermove', 'pointerup'];
        events.forEach(ev => canvasEl.addEventListener(ev, spoofEvent, true));
        canvasEl.addEventListener('contextmenu', e => e.preventDefault(), true);

        // Set background properly based on current theme variables
        const updateBg = () => {
            const bg = window.getComputedStyle(document.body).getPropertyValue('--slide-bg').trim() || 'white';
            this.viewer.setBackgroundColor(bg);
            this.viewer.render();
        };
        // Wait a frame for CSS variables to be ready
        requestAnimationFrame(updateBg);
        
        let resizeAnimationFrame;
        new ResizeObserver(() => {
            cancelAnimationFrame(resizeAnimationFrame);
            resizeAnimationFrame = requestAnimationFrame(() => this.viewer.resize());
        }).observe(canvasEl);

        // Pre-instantiate loaders
        for (const [name, url] of Object.entries(this.bundles)) {
            this.loaders[name] = new RxnBundleLoader(url);
        }

        // Apply theme listeners
        if (this.config.theme === 'auto' || !this.config.theme) {
            window.addEventListener('theme-change', updateBg);
        }

        await this.loadMolecule(this.currentBundleName);
    }

    renderShell() {
        const isCollapsed = this.config.sidebar === 'collapsed';
        const sidebarDisplay = isCollapsed ? 'none' : 'flex';
        const floatingToggleDisplay = this.config.sidebar === 'hidden' ? 'none' : (isCollapsed ? 'block' : 'none');

        // Build the basic CSS Grid layout
        let html = `
            <div id="${this.uiId}" class="mol-viewer-wrap ${this.config.theme || 'auto'}" style="display:flex; height:100%; width:100%; position:relative; background:var(--slide-bg); border:1px solid var(--border-color); border-radius:8px; overflow:hidden;">
                <!-- Main Canvas Area -->
                <div style="flex:1; display:flex; flex-direction:column; min-width:0; position:relative;">
        `;

        const bundleNames = Object.keys(this.bundles);
        if (bundleNames.length > 1) {
            html += `
                    <!-- Top Molecule Chooser (Custom Dropdown) -->
                    <div style="padding: 8px; background: var(--secondary-bg); border-bottom: 1px solid var(--border-color);">
                        <div id="${this.uiId}_dropdown" style="position: relative; display: inline-block; min-width: 150px; max-width: 100%;">
                            <div class="mol-select-trigger" style="padding: 6px 12px; font-size: 14px; border-radius: 4px; border: 1px solid var(--border-color); background: var(--input-bg); color: var(--text-color); cursor: pointer; display: flex; justify-content: space-between; align-items: center;">
                                <span class="mol-select-value" style="overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">${this.currentBundleName}</span>
                                <span style="margin-left: 10px; font-size: 10px;">▼</span>
                            </div>
                            <div class="mol-select-options" style="display: none; position: absolute; top: calc(100% + 2px); left: 0; min-width: 100%; background: var(--slide-bg); border: 1px solid var(--border-color); border-radius: 4px; max-height: 300px; overflow-y: auto; z-index: 1000; box-shadow: 0 4px 12px rgba(0,0,0,0.15);">
                                ${bundleNames.map(name => `
                                    <div class="mol-select-option" data-name="${name.replace(/"/g, '&quot;')}" style="padding: 8px 12px; cursor: pointer; border-bottom: 1px solid var(--border-color); color: var(--text-color); white-space: nowrap; background: transparent;">
                                        ${name}
                                    </div>
                                `).join('')}
                            </div>
                        </div>
                    </div>
            `;
        }

        html += `
                    <!-- 3D Viewer Canvas -->
                    <div id="${this.canvasId}" style="flex:1; position:relative; width:100%; height:100%;"></div>
                    
                    <!-- Floating Toggle Button -->
                    <div id="${this.uiId}_floating_toggle" style="display: ${floatingToggleDisplay}; position:absolute; top:10px; right:10px; background:var(--secondary-bg); border:1px solid var(--border-color); border-radius:4px; padding:6px 10px; font-size:12px; cursor:pointer; color:var(--text-color); font-weight:bold; z-index:10; box-shadow: 0 2px 4px rgba(0,0,0,0.2);">
                        Orbitals ▼
                    </div>
                </div>
                
                <!-- Sidebar -->
                <div id="${this.uiId}_sidebar" style="width: 250px; background: var(--slide-bg); border-left: 1px solid var(--border-color); display: ${this.config.sidebar === 'hidden' ? 'none' : sidebarDisplay}; flex-direction: column;">
                    <div id="${this.uiId}_sidebar_header" style="padding:10px; background:var(--secondary-bg); border-bottom:1px solid var(--border-color); font-weight:bold; display:flex; justify-content:space-between; align-items:center; cursor:pointer;">
                        Orbitals
                        <span style="color: var(--text-color); margin-left: 10px;">▲</span>
                    </div>
                    <div id="${this.uiId}_toggles" style="flex:1; overflow-y:auto; padding:10px; font-size:13px; display: block;">
                        Loading...
                    </div>
                </div>
            </div>
        `;
        
        this.container.innerHTML = html;

        // Bind events
        if (bundleNames.length > 1) {
            const dropdown = document.getElementById(`${this.uiId}_dropdown`);
            const trigger = dropdown.querySelector('.mol-select-trigger');
            const options = dropdown.querySelector('.mol-select-options');
            const valueSpan = dropdown.querySelector('.mol-select-value');
            
            trigger.addEventListener('click', (e) => {
                e.stopPropagation();
                const isVisible = options.style.display === 'block';
                // Close all other dropdowns in the page
                document.querySelectorAll('.mol-select-options').forEach(el => el.style.display = 'none');
                options.style.display = isVisible ? 'none' : 'block';
            });
            
            // Close dropdown if clicked outside
            document.addEventListener('click', (e) => {
                if (dropdown && !dropdown.contains(e.target) && options) {
                    options.style.display = 'none';
                }
            });
            
            dropdown.querySelectorAll('.mol-select-option').forEach(opt => {
                opt.addEventListener('click', () => {
                    const name = opt.getAttribute('data-name');
                    valueSpan.innerHTML = opt.innerHTML; // Update trigger text using HTML to support MathJax
                    options.style.display = 'none';
                    this.loadMolecule(name);
                });
                
                // Add hover effect
                opt.addEventListener('mouseenter', () => {
                    opt.style.background = 'var(--secondary-bg)';
                });
                opt.addEventListener('mouseleave', () => {
                    opt.style.background = 'transparent';
                });
            });
        }
        
        const floatingToggle = document.getElementById(`${this.uiId}_floating_toggle`);
        const sidebarHeader = document.getElementById(`${this.uiId}_sidebar_header`);
        const sidebar = document.getElementById(`${this.uiId}_sidebar`);

        const toggleSidebar = () => {
            if (sidebar.style.display === 'none') {
                sidebar.style.display = 'flex';
                floatingToggle.style.display = 'none';
            } else {
                sidebar.style.display = 'none';
                floatingToggle.style.display = 'block';
            }
            if (this.viewer) {
                setTimeout(() => this.viewer.resize(), 10);
            }
        };

        if (floatingToggle && sidebarHeader) {
            floatingToggle.addEventListener('click', toggleSidebar);
            sidebarHeader.addEventListener('click', toggleSidebar);
        }
    }

    async loadMolecule(name) {
        this.currentBundleName = name;
        const loader = this.loaders[name];
        
        try {
            document.getElementById(`${this.uiId}_toggles`).innerHTML = '<i>Loading bundle...</i>';
            const manifest = loader.manifest || await loader.load();
            
            // For simplified single-molecule viewer, grab the first molecule
            const molManifest = manifest.molecules[0];
            
            // Reset state
            this.activeOrbitals.clear();
            this.viewer.removeAllModels();
            this.viewer.removeAllShapes();
            this.viewer.removeAllSurfaces();
            
            // Load structure
            let xyzData = molManifest.xyz;
            if (!xyzData && molManifest.xyz_file) {
                xyzData = await loader.getFileText(molManifest.xyz_file);
            }
            
            if (xyzData) {
                this.viewer.addModel(xyzData, 'xyz');
                this.viewer.setStyle({}, {stick:{radius:0.12}, sphere:{scale:0.25}});
                this.viewer.zoomTo();
                this.viewer.render();
            } else {
                console.warn("No XYZ data found for molecule in bundle.");
            }
            
            this.buildOrbitalSidebar(loader, molManifest);
            
        } catch(e) {
            console.error("Error loading molecule", e);
            document.getElementById(`${this.uiId}_toggles`).innerHTML = `<div style="color:red">Failed to load: ${e.message}</div>`;
        }
    }

    buildOrbitalSidebar(loader, molManifest) {
        const togglesContainer = document.getElementById(`${this.uiId}_toggles`);
        togglesContainer.innerHTML = '';
        
        // We use closure caching for orbital changes
        const renderId = ++this.currentRenderId;
        
        // Build groups
        let hasAnyValidOrbitals = false;
        
        for (const group of (molManifest.orbitals || [])) {
            const validItems = group.items.filter(item => {
                const baseFile = item.file;
                const posFile = baseFile.replace('.json', '_pos.json');
                const negFile = baseFile.replace('.json', '_neg.json');
                return loader.hasFile(posFile) || loader.hasFile(negFile);
            });
            
            if (validItems.length === 0) continue;
            hasAnyValidOrbitals = true;

            const grpDiv = document.createElement('div');
            grpDiv.style.marginBottom = '12px';
            
            const title = document.createElement('div');
            title.style.fontWeight = 'bold';
            title.style.marginBottom = '4px';
            title.style.color = 'var(--text-color)';
            title.textContent = group.name;
            grpDiv.appendChild(title);
            
            for (const item of validItems) {
                const label = document.createElement('label');
                label.style.display = 'flex';
                label.style.alignItems = 'center';
                label.style.gap = '6px';
                label.style.cursor = 'pointer';
                label.style.marginBottom = '2px';
                
                const cb = document.createElement('input');
                cb.type = 'checkbox';
                
                cb.onchange = () => {
                    if (cb.checked) this.activeOrbitals.add(item);
                    else this.activeOrbitals.delete(item);
                    this.renderOrbitals(loader, renderId);
                };
                
                const dot = document.createElement('span');
                dot.style.display = 'inline-block';
                dot.style.width = '10px';
                dot.style.height = '10px';
                dot.style.borderRadius = '50%';
                dot.style.background = item.color || '#888';
                
                label.appendChild(cb);
                label.appendChild(dot);
                label.appendChild(document.createTextNode(item.label));
                grpDiv.appendChild(label);
            }
            
            togglesContainer.appendChild(grpDiv);
        }
        
        if (molManifest.esp_surface) {
            hasAnyValidOrbitals = true;
            const grpDiv = document.createElement('div');
            grpDiv.style.marginBottom = '12px';
            
            const title = document.createElement('div');
            title.style.fontWeight = 'bold';
            title.style.marginBottom = '4px';
            title.style.color = 'var(--text-color)';
            title.textContent = 'Electrostatic Potential';
            grpDiv.appendChild(title);
            
            const label = document.createElement('label');
            label.style.display = 'flex';
            label.style.alignItems = 'center';
            label.style.gap = '6px';
            label.style.cursor = 'pointer';
            label.style.marginBottom = '2px';
            
            const cb = document.createElement('input');
            cb.type = 'checkbox';
            
            const item = { type: 'esp', ...molManifest.esp_surface };
            
            cb.onchange = () => {
                if (cb.checked) this.activeOrbitals.add(item);
                else this.activeOrbitals.delete(item);
                this.renderOrbitals(loader, renderId);
            };
            
            const dot = document.createElement('span');
            dot.style.display = 'inline-block';
            dot.style.width = '10px';
            dot.style.height = '10px';
            dot.style.borderRadius = '50%';
            dot.style.background = 'linear-gradient(90deg, #ff3333, #ffffff, #3333ff)';
            
            label.appendChild(cb);
            label.appendChild(dot);
            
            let minStr = item.esp_min;
            let maxStr = item.esp_max;
            if (this.config.espScale) {
                const parts = String(this.config.espScale).split(',');
                if (parts.length === 2) {
                    minStr = parseFloat(parts[0]);
                    maxStr = parseFloat(parts[1]);
                }
            }
            label.appendChild(document.createTextNode(`ESP Surface (${minStr} to ${maxStr} kcal/mol)`));
            
            grpDiv.appendChild(label);
            togglesContainer.appendChild(grpDiv);
        }
        
        if (!hasAnyValidOrbitals) {
            togglesContainer.innerHTML = '<i>No orbital data saved in bundle</i>';
        }
    }

    async renderOrbitals(loader, renderId) {
        // Debounce or race-condition check
        if (renderId !== this.currentRenderId) return;

        // Reset shapes
        this.viewer.removeAllShapes();
        this.viewer.removeAllSurfaces();
        
        const shapesToAdd = [];

        // Helper for colors
        const lighten = (hex) => {
            if (!hex) return '#cccccc';
            const r = parseInt(hex.slice(1,3), 16), g = parseInt(hex.slice(3,5), 16), b = parseInt(hex.slice(5,7), 16);
            return `#${Math.min(255, 255-r+40).toString(16).padStart(2,'0')}${Math.min(255, 255-g+40).toString(16).padStart(2,'0')}${Math.min(255, 255-b+40).toString(16).padStart(2,'0')}`;
        };

        for (const item of this.activeOrbitals) {
            if (item.type === 'esp') {
                const cacheKey = `${this.currentBundleName}::${item.file}`;
                if (!this.orbitalCache[cacheKey]) {
                    const data = await loader.getFileJSON(item.file);
                    if (data) {
                        this.orbitalCache[cacheKey] = data;
                    }
                }
                const mesh = this.orbitalCache[cacheKey];
                if (mesh && mesh.vertices) {
                    let espMin = mesh.esp_min;
                    let espMax = mesh.esp_max;
                    
                    if (this.config.espScale) {
                        const parts = String(this.config.espScale).split(',');
                        if (parts.length === 2) {
                            espMin = parseFloat(parts[0]);
                            espMax = parseFloat(parts[1]);
                        }
                    }
                    
                    const colors = (mesh.esp_values || []).map(v => {
                        let t = 0;
                        if (v < 0 && espMin < 0) {
                            t = -Math.min(1, Math.abs(v / espMin)); // -1 at espMin
                        } else if (v > 0 && espMax > 0) {
                            t = Math.min(1, Math.abs(v / espMax));  // +1 at espMax
                        }
                        
                        let r, g, b;
                        if (t < 0) {
                            r = 1.0; g = 1.0 + t; b = 1.0 + t;
                        } else {
                            r = 1.0 - t; g = 1.0 - t; b = 1.0;
                        }
                        return {r: r, g: g, b: b};
                    });
                    
                    shapesToAdd.push({ 
                        vertexArr: mesh.vertices, 
                        faceArr: mesh.faces, 
                        normalArr: mesh.normals && mesh.normals.length ? mesh.normals : undefined,
                        color: colors.length ? colors : window['3Dmol'].CC.color('#aaaaaa'),
                        opacity: 0.85 
                    });
                }
                continue;
            }

            let baseFile = item.file;
            // E.g. baseFile = molecules/ammonia_sigma_N1_H1_1.json
            let posFile = baseFile.replace('.json', '_pos.json');
            let negFile = baseFile.replace('.json', '_neg.json');
            
            // Try fetching mesh data
            for (const [sfile, color, opacity] of [
                [posFile, item.color, 0.65],
                [negFile, lighten(item.color), 0.35]
            ]) {
                const cacheKey = `${this.currentBundleName}::${sfile}`;
                if (!this.orbitalCache[cacheKey]) {
                    const data = await loader.getFileJSON(sfile);
                    if (data) {
                        this.orbitalCache[cacheKey] = data;
                    }
                }
                
                const mesh = this.orbitalCache[cacheKey];
                if (mesh && mesh.vertices) {
                    shapesToAdd.push({ 
                        vertexArr: mesh.vertices, 
                        faceArr: mesh.faces, 
                        color: window['3Dmol'].CC.color(color), 
                        opacity: opacity 
                    });
                }
            }
        }
        
        if (renderId !== this.currentRenderId) return; // double check after awaits

        for (const shape of shapesToAdd) {
            this.viewer.addCustom(shape);
        }
        this.viewer.render();
    }
}
