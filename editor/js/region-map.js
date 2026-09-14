import { StateEffect, StateField, Annotation } from "@codemirror/state";

export const setRegionMap = StateEffect.define();

export const expandRegionAnnotation = Annotation.define();

export function emptyRegionMap() {
    return {
        regions: [],
        fileInstances: new Map(),
        fileContents: new Map(),
        includeTree: null,
        markdownRange: null,
        rootFile: null
    };
}

export const regionMapField = StateField.define({
    create() {
        return emptyRegionMap();
    },
    update(map, tr) {
        for (let e of tr.effects) {
            if (e.is(setRegionMap)) return e.value;
        }
        if (!tr.docChanged) return map;
        return remapRegions(map, tr);
    }
});

export function remapRegions(map, tr) {
    const expandFile = tr.annotation(expandRegionAnnotation);
    const newRegions = map.regions.map(r => {
        let fromAssoc = 1;
        let toAssoc = -1;
        let expandFrom = false;
        let expandTo = false;
        
        if (expandFile) {
            if (r.file === expandFile) {
                fromAssoc = -1;
                toAssoc = 1;
                expandFrom = true;
                expandTo = true;
            } else {
                fromAssoc = 1;
                toAssoc = -1;
                expandFrom = false;
                expandTo = false;
            }
        } else {
            if (r.type === 'markdown-content') {
                fromAssoc = -1;
                toAssoc = 1;
                expandFrom = true;
                expandTo = true;
            }
        }
        
        let newFrom = tr.changes.mapPos(r.from, fromAssoc);
        let newTo = tr.changes.mapPos(r.to, toAssoc);
        
        // Manual override for when an insertion coincides exactly with a deletion at the boundary
        // mapPos doesn't expand because it maps to the start of the deletion.
        tr.changes.iterChanges((fromA, toA, fromB, toB) => {
            if (expandFrom && r.from === toA) {
                newFrom = Math.min(newFrom, fromB);
            }
            if (expandTo && r.to === fromA) {
                newTo = Math.max(newTo, toB);
            }
        });
        
        return {
            ...r,
            from: newFrom,
            to: newTo
        };
    });
    
    const newFileInstances = new Map();
    for (const [file, instances] of map.fileInstances.entries()) {
        const mappedInstances = [];
        for (const inst of instances) {
            const index = map.regions.indexOf(inst);
            if (index !== -1) {
                mappedInstances.push(newRegions[index]);
            }
        }
        newFileInstances.set(file, mappedInstances);
    }
    
    return {
        ...map,
        regions: newRegions,
        fileInstances: newFileInstances
    };
}

export function resolveIncludePath(basePath, relativePath) {
    if (relativePath.startsWith('/')) return relativePath.substring(1);
    const baseParts = basePath.split('/');
    baseParts.pop();
    const relParts = relativePath.split('/');
    for (const part of relParts) {
        if (part === '.') continue;
        if (part === '..') {
            if (baseParts.length > 0) baseParts.pop();
        } else {
            baseParts.push(part);
        }
    }
    return baseParts.join('/');
}

// Builds both the flat text and the region map in a single pass
export function buildFlatTextAndRegionMap(fileCache, rootFile) {
    let currentOffset = 0;
    let flatText = "";
    const map = emptyRegionMap();
    map.rootFile = rootFile;
    
    let rootContent = fileCache[rootFile] || "";
    let markdownContent = rootContent;
    let preamble = "";
    let postamble = "";
    let isHtml = rootFile.endsWith('.html');
    
    if (isHtml) {
        const match = rootContent.match(/([\s\S]*?<script type="text\/markdown"[^>]*>)([\s\S]*?)(<\/script>[\s\S]*)/);
        if (match) {
            preamble = match[1];
            markdownContent = match[2];
            postamble = match[3];
            
            flatText += preamble;
            map.regions.push({
                from: 0,
                to: preamble.length,
                file: rootFile,
                type: 'html-preamble',
                depth: 0,
                localOffset: -1
            });
            currentOffset += preamble.length;
            map.markdownRange = { from: currentOffset, to: currentOffset + markdownContent.length };
        } else {
            isHtml = false;
            map.markdownRange = { from: 0, to: rootContent.length };
        }
    } else {
        map.markdownRange = { from: 0, to: rootContent.length };
    }
    
    const instanceCounters = new Map();
    
    function appendTree(path, content, depth, parentStack = []) {
        map.fileContents.set(path, content);
        const node = { file: path, children: [] };
        
        const currentStack = [...parentStack, path];
        
        let cCount = instanceCounters.get(path) || 0;
        const instanceIndex = cCount;
        instanceCounters.set(path, cCount + 1);
        
        const lines = content.split('\n');
        
        let currentRegionStart = currentOffset;
        let currentLocalOffset = 0;
        let currentRegionLocalStart = 0;
        
        for (let i = 0; i < lines.length; i++) {
            const line = lines[i];
            const match = line.match(/^\s*!include\((.+)\)\s*$/);
            
            if (match) {
                // First close the markdown-content region if there is one before this line
                    map.regions.push({
                        from: currentRegionStart,
                        to: currentOffset,
                        file: path,
                        fileStack: currentStack,
                        type: depth === 0 ? 'markdown-content' : 'expanded-include',
                        depth: depth,
                        instanceIndex: instanceIndex,
                        localOffset: currentRegionLocalStart
                    });
                
                const lineText = line + (i < lines.length - 1 ? '\n' : '');
                flatText += lineText;
                
                map.regions.push({
                    from: currentOffset,
                    to: currentOffset + lineText.length,
                    file: path,
                    fileStack: currentStack,
                    type: 'include-directive',
                    depth: depth,
                    instanceIndex: instanceIndex,
                    localOffset: currentLocalOffset
                });
                
                currentOffset += lineText.length;
                currentLocalOffset += lineText.length;
                currentRegionStart = currentOffset; // Next markdown region starts here
                currentRegionLocalStart = currentLocalOffset;
                
                const childPath = resolveIncludePath(path, match[1]);
                const childContent = fileCache[childPath];
                if (childContent !== undefined) {
                    const childNode = appendTree(childPath, childContent, depth + 1, currentStack);
                    node.children.push(childNode);
                    
                    if (flatText.length > 0 && !flatText.endsWith('\n')) {
                        flatText += '\n';
                        currentOffset += 1;
                        currentLocalOffset += 1;
                    }
                    
                    currentRegionStart = currentOffset; // Any content after the include starts here
                    currentRegionLocalStart = currentLocalOffset;
                }
            } else {
                const lineText = line + (i < lines.length - 1 ? '\n' : '');
                flatText += lineText;
                currentOffset += lineText.length;
                currentLocalOffset += lineText.length;
            }
        }
        
        // Close the last markdown region
            map.regions.push({
                from: currentRegionStart,
                to: currentOffset,
                file: path,
                fileStack: currentStack,
                type: depth === 0 ? 'markdown-content' : 'expanded-include',
                depth: depth,
                instanceIndex: instanceIndex,
                localOffset: currentRegionLocalStart
            });
        
        return node;
    }
    
    map.includeTree = appendTree(rootFile, markdownContent, 0);
    
    if (isHtml) {
        flatText += postamble;
        map.markdownRange.to = currentOffset;
        map.regions.push({
            from: currentOffset,
            to: currentOffset + postamble.length,
            file: rootFile,
            type: 'html-postamble',
            depth: 0,
            localOffset: Infinity
        });
        currentOffset += postamble.length;
    }
    
    for (const r of map.regions) {
        if (!map.fileInstances.has(r.file)) {
            map.fileInstances.set(r.file, []);
        }
        map.fileInstances.get(r.file).push(r);
    }
    
    return { flatText, map };
}
