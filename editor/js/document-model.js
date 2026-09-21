import { buildFlatTextAndRegionMap, resolveIncludePath } from './region-map.js';

export class DocumentModel {
    constructor() {
        this.rootFile = null;
        this.fileCache = {}; // path -> content string
    }

    async loadRoot(path) {
        this.rootFile = path;
        await this._fetchRecursive(path);
    }

    async _fetchRecursive(path) {
        if (this.fileCache[path] !== undefined) return;
        
        try {
            const res = await fetch('/api/file?path=' + encodeURIComponent(path));
            if (!res.ok) {
                this.fileCache[path] = null;
                return;
            }
            const data = await res.json();
            this.fileCache[path] = (data.content || "").replace(/\r/g, '');
            
            const lines = this.fileCache[path].split('\n');
            for (const line of lines) {
                const match = line.match(/^\s*!include\((.+)\)\s*$/);
                if (match) {
                    const childPath = resolveIncludePath(path, match[1]);
                    await this._fetchRecursive(childPath);
                }
            }
        } catch (e) {
            console.error(`Error fetching ${path}`, e);
            this.fileCache[path] = null;
        }
    }
    
    async fetchMissingIncludes() {
        let fetchedAny = false;
        
        const scan = async (path, visited) => {
            if (visited.has(path)) return;
            visited.add(path);
            
            const content = this.fileCache[path];
            if (!content) return;
            
            // Note: If HTML, the include is inside the markdown script block, but we can just regex the whole file
            const lines = content.split('\n');
            for (const line of lines) {
                const match = line.match(/^\s*!include\((.+)\)\s*$/);
                if (match) {
                    const childPath = resolveIncludePath(path, match[1]);
                    if (this.fileCache[childPath] === undefined) {
                        await this._fetchRecursive(childPath);
                        fetchedAny = true;
                    }
                    // Recursively scan the child too
                    await scan(childPath, visited);
                }
            }
        };
        
        await scan(this.rootFile, new Set());
        return fetchedAny;
    }
    
    // Reverse-maps CM6 ChangeSet back into fileCache updates
    applyChangesToCache(regionMap, changes, doc, oldRegionMap = null) {
        // Iterate regions, extract their corresponding text from the new doc, 
        // and rebuild the fileCache for each file.
        // For performance, we could only rebuild files that were modified.
        // But since this is a memory cache, just extracting from the CM6 doc is very fast.
        
        const modifiedFiles = new Set();
        changes.iterChangedRanges((fromA, toA, fromB, toB) => {
            const matches = regionMap.regions.filter(r => r.from <= fromB && r.to >= fromB);
            for (const match of matches) {
                modifiedFiles.add(match.file);
            }
            if (oldRegionMap) {
                const oldMatches = oldRegionMap.regions.filter(r => r.from <= fromA && r.to >= fromA);
                for (const match of oldMatches) {
                    modifiedFiles.add(match.file);
                }
            }
        });
        
        // Reconstruct file cache for modified files
        for (const file of modifiedFiles) {
            const instances = regionMap.fileInstances.get(file);
            if (!instances || instances.length === 0) continue;
            
            // We just need ONE instance to reconstruct the file.
            // But wait, regions might be interleaved (html-preamble, include-directive, etc).
            // Actually, instances[0] might just be ONE region (if the file has no includes).
            // If the file HAS includes, it's split into multiple regions.
            // We need to reassemble all regions belonging to this file, IN ORDER of localOffset.
            
            // Get all regions belonging to the FIRST instance (instanceIndex === 0) of this file.
            // Not all regions have instanceIndex 0 if the file isn't included multiple times? 
            // Wait, yes, instanceIndex 0 is the first occurrence.
            const firstInstanceRegions = instances.filter(r => r.instanceIndex === 0 || r.type === 'html-preamble' || r.type === 'html-postamble');
            
            // Sort them by localOffset
            firstInstanceRegions.sort((a, b) => a.localOffset - b.localOffset);
            
            let reconstructed = "";
            let expectedStart = firstInstanceRegions.length > 0 ? firstInstanceRegions[0].from : 0;
            
            for (const r of firstInstanceRegions) {
                // If there is a gap between expectedStart and r.from, and the previous region collapsed,
                // it means text was orphaned (e.g. via undo). Absorb the gap if we are the parent!
                // Wait, absorbing gaps might inline included files. We only absorb if it's an undo gap.
                reconstructed += doc.sliceString(r.from, r.to);
                
                // Hack for Ctrl-Z on extract: if this region collapsed, and the next region has a gap,
                // and this region was an include-directive, we absorb the gap.
                if (r.type === 'include-directive' && r.from === r.to) {
                    const nextRegion = firstInstanceRegions[firstInstanceRegions.indexOf(r) + 1];
                    if (nextRegion && nextRegion.from > r.to) {
                        reconstructed += doc.sliceString(r.to, nextRegion.from);
                    } else if (!nextRegion) {
                        // Find the next region in the ENTIRE document
                        const globalIndex = regionMap.regions.indexOf(r);
                        let nextGlobal = null;
                        for (let j = globalIndex + 1; j < regionMap.regions.length; j++) {
                            if (regionMap.regions[j].from > r.to) {
                                nextGlobal = regionMap.regions[j];
                                break;
                            }
                        }
                        if (nextGlobal && nextGlobal.from > r.to) {
                            reconstructed += doc.sliceString(r.to, nextGlobal.from);
                        } else if (!nextGlobal && doc.length > r.to) {
                            reconstructed += doc.sliceString(r.to, doc.length);
                        }
                    }
                }
            }
            this.fileCache[file] = reconstructed;
        }
    }

    buildFlatText() {
        return buildFlatTextAndRegionMap(this.fileCache, this.rootFile);
    }
    
    getMergedMarkdown() {
        const resolveContent = (path) => {
            let content = this.fileCache[path] || "";
            if (path.endsWith('.html')) {
                const match = content.match(/<script type="text\/markdown"[^>]*>([\s\S]*?)<\/script>/);
                if (match) content = match[1];
            }
            
            const lines = content.split('\n');
            let merged = "";
            for (let i = 0; i < lines.length; i++) {
                const line = lines[i];
                const match = line.match(/^\s*!include\((.+)\)\s*$/);
                if (match) {
                    const childPath = resolveIncludePath(path, match[1]);
                    merged += resolveContent(childPath) + (i < lines.length - 1 ? '\n' : '');
                } else {
                    merged += line + (i < lines.length - 1 ? '\n' : '');
                }
            }
            return merged;
        };
        
        return resolveContent(this.rootFile);
    }
    
    decompose() {
        return this.fileCache; 
    }
}
