function resolveIncludePath(basePath, relativePath) {
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

export class DocumentModel {
    constructor() {
        this.rootFile = null;
        this.tree = null;
        this.fileCache = {}; // path -> content string
        this.flatLines = [];
        this.onModelUpdated = null;
    }

    async loadRoot(path) {
        this.rootFile = path;
        await this._fetchRecursive(path);
        this.rebuildTree();
    }

    async _fetchRecursive(path) {
        if (this.fileCache[path] !== undefined) return;
        
        try {
            const res = await fetch('/api/file?path=' + encodeURIComponent(path));
            if (!res.ok) {
                this.fileCache[path] = "";
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
            this.fileCache[path] = "";
        }
    }

    rebuildTree(triggerEvent = true) {
        this.flatLines = [];
        this.tree = this._buildNode(this.rootFile, 0);
        if (triggerEvent && this.onModelUpdated) this.onModelUpdated();
    }

    decompose(bufferLines) {
        const fileContents = {};
        for (const file in this.fileCache) {
            fileContents[file] = [];
        }
        
        // Walk the existing tree to figure out which lines from the new buffer
        // belong to which file.
        // We know that `this.flatLines` matches the OLD buffer structure.
        // But what if lines were added/removed? 
        // For a full implementation without a diff algorithm, we can rely on 
        // the fact that include directives mark the boundaries.
        // However, a simple approach: if we just save what's in `this.fileCache`, 
        // we need to ensure `this.fileCache` was updated during `updateFromBuffer`.
        
        // Actually, we must rebuild `this.fileCache` accurately.
        // A simple heuristic for now: we parse the new buffer using a stack, 
        // assuming include directives are well-formed. Since we don't have end markers, 
        // we can't easily parse a flat buffer back into a tree.
        // That's why we need region boundaries.
        
        // To properly decompose, we need to apply diffs to the regions.
        // Since we are not using a diff library, we can do this:
        // We track edits via CodeMirror change events, NOT by parsing the whole buffer!
        
        // For the sake of this implementation, let's just use the cached files.
        // Real implementation requires CodeMirror's exact change events to update fileCache.
        return this.fileCache; 
    }

    _buildNode(path, depth) {
        const content = this.fileCache[path] || "";
        const lines = content.split('\n');
        
        const node = {
            file: path,
            depth: depth,
            startLine: this.flatLines.length,
            endLine: 0,
            ownLines: [],
            children: []
        };

        for (let i = 0; i < lines.length; i++) {
            const line = lines[i];
            const currentFlatIndex = this.flatLines.length;
            this.flatLines.push({ text: line, node: node, localIndex: i });
            node.ownLines.push(currentFlatIndex);
            
            const match = line.match(/^\s*!include\((.+)\)\s*$/);
            if (match) {
                const childPath = resolveIncludePath(path, match[1]);
                if (this.fileCache[childPath] !== undefined) {
                    const childNode = this._buildNode(childPath, depth + 1);
                    childNode.includeLine = currentFlatIndex;
                    node.children.push(childNode);
                }
            }
        }
        
        node.endLine = this.flatLines.length - 1;
        return node;
    }

    getFlatText() {
        return this.flatLines.map(l => l.text).join('\n');
    }



    applyChange(change) {
        // change: { from: {line, ch}, to: {line, ch}, text: [lines], removed: [lines] }
        // We need to apply this edit to our fileCache strings.
        // A change happens within a specific file region.
        
        // 1. Identify all files affected by the deletion
        const fileEdits = {};
        for (let i = 0; i < change.removed.length; i++) {
            const nodeInfo = this.flatLines[change.from.line + i];
            if (!nodeInfo) continue;
            const file = nodeInfo.node.file;
            if (!fileEdits[file]) {
                fileEdits[file] = {
                    startLocalLine: nodeInfo.localIndex,
                    endLocalLine: nodeInfo.localIndex
                };
            } else {
                fileEdits[file].endLocalLine = nodeInfo.localIndex;
            }
        }
        
        const affectedFiles = Object.keys(fileEdits);
        
        if (affectedFiles.length > 1) {
            console.warn("Cross-file edits are not supported. Reverting.");
            // By not updating fileCache and triggering a rebuild, it will revert CodeMirror.
            this.rebuildTree(true);
            return false;
        }
        
        const startNodeInfo = this.flatLines[change.from.line];
        if (!startNodeInfo) return false; // out of bounds
        
        const node = startNodeInfo.node;
        const file = node.file;
        
        // 2. Apply the change to the specific file's content in the cache.
        const fileContent = this.fileCache[file];
        if (fileContent !== undefined) {
            const lines = fileContent.split('\n');
            const localStartLine = fileEdits[file].startLocalLine;
            const localEndLine = fileEdits[file].endLocalLine;
            
            // Reconstruct the new lines array
            const prefix = lines.slice(0, localStartLine);
            const suffix = lines.slice(localEndLine + 1);
            
            // For the start line, we must handle character offsets.
            const firstLineOrig = lines[localStartLine] || "";
            const lastLineOrig = lines[localEndLine] || "";
            
            let insertedLines = [...change.text];
            
            if (change.text.length === 1) {
                // If the replacement is just one line, we must join the first line's prefix and the last line's suffix together.
                insertedLines[0] = firstLineOrig.substring(0, change.from.ch) + change.text[0] + lastLineOrig.substring(change.to.ch);
            } else {
                const newFirstLine = firstLineOrig.substring(0, change.from.ch) + change.text[0];
                const newLastLine = change.text[change.text.length - 1] + lastLineOrig.substring(change.to.ch);
                insertedLines[0] = newFirstLine;
                insertedLines[insertedLines.length - 1] = newLastLine;
            }
            
            const newLines = prefix.concat(insertedLines).concat(suffix);
            this.fileCache[file] = newLines.join('\n');
            
            // Check if any includes were added or removed in this file
            let needsRebuild = false;
            for (const line of change.text) {
                const match = line.match(/^\s*!include\((.+)\)\s*$/);
                if (match) {
                    const childPath = resolveIncludePath(file, match[1]);
                    if (this.fileCache[childPath] === undefined) {
                        needsRebuild = true;
                    }
                }
            }
            
            // Also need to check if an include was deleted (by checking removed lines).
            for (const line of change.removed) {
                const match = line.match(/^\s*!include\((.+)\)\s*$/);
                if (match) {
                    needsRebuild = true;
                }
            }
            
            // 3. Check if the file is duplicated in the tree
            let occurrences = 0;
            const countOccurrences = (node) => {
                if (node.file === file) occurrences++;
                node.children.forEach(countOccurrences);
            };
            countOccurrences(this.tree);
            
            if (needsRebuild || occurrences > 1) {
                // If it needs new files or has duplicates, signal caller to fetch and rebuild UI
                return true; 
            } else {
                // Rebuild the tree silently so internal offsets remain correct
                this.rebuildTree(false);
                return false; 
            }
        }
        return false;
    }

    decompose() {
        // Decompose is now trivial because fileCache is always up to date!
        return this.fileCache; 
    }
}
