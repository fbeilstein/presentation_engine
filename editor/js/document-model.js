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
    
    // Reverse-maps CM6 ChangeSet back into fileCache updates
    applyChangesToCache(regionMap, changes, doc) {
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
            for (const r of firstInstanceRegions) {
                reconstructed += doc.sliceString(r.from, r.to);
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
