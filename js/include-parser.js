export function extractTitle(markdown) {
    const lines = markdown.split('\n');
    for (const line of lines) {
        if (line.trim().startsWith('#')) {
            return line.replace(/^#+\s*/, '').trim();
        }
    }
    return null;
}

export function splitIntoSlides(text) {
    const rawSlides = text.split(/^---$/gm);
    return rawSlides.map((content, index) => ({
        index,
        content: content,
        from: 0, 
        to: 0 
    }));
}

function resolveIncludePath(basePath, relativePath) {
    basePath = basePath.replace(/\\/g, '/');
    relativePath = relativePath.replace(/\\/g, '/');
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

export async function resolveIncludes(rootFile, readFile, options = {}) {
    const sourceMap = [];
    let fullText = "";
    
    const fetchedCache = {};
    
    async function fetchRecursive(path) {
        if (fetchedCache[path] !== undefined) return fetchedCache[path];
        try {
            const content = await readFile(path);
            fetchedCache[path] = content.replace(/\r/g, '');
        } catch (e) {
            console.error("Failed to read", path, e);
            fetchedCache[path] = "";
        }
        return fetchedCache[path];
    }
    
    await fetchRecursive(rootFile);
    let rootContent = fetchedCache[rootFile];
    
    let preamble = "";
    let postamble = "";
    let markdownContent = rootContent;
    
    if (rootFile.endsWith('.html') && !options.isRawMarkdown) {
        const match = rootContent.match(/([\s\S]*?<script type="text\/markdown"[^>]*>)([\s\S]*?)(<\/script>[\s\S]*)/);
        if (match) {
            preamble = match[1];
            markdownContent = match[2];
            postamble = match[3];
        } else {
            markdownContent = "";
            preamble = rootContent;
        }
    }
    
    if (preamble) fullText += preamble;
    
    async function appendTree(path, content, includeStack) {
        if (options.injectSourceMarkers && typeof window !== 'undefined' && window.isEditorPreview) {
            let localIndex = 0;
            const stackStr = includeStack.join('|');
            content = `\n<!-- SOURCE: ${stackStr}:${localIndex++} -->\n` + content.replace(/^---$/gm, () => `\n---\n<!-- SOURCE: ${stackStr}:${localIndex++} -->\n`);
        }
        
        const lines = content.split('\n');
        for (let i = 0; i < lines.length; i++) {
            const line = lines[i];
            const match = line.match(/^\s*!include\((.+)\)\s*$/);
            
            if (match) {
                if (options.treatIncludeAsBreak) {
                    fullText += "\n---\n";
                }
                const childPath = resolveIncludePath(path, match[1]);
                const childContent = await fetchRecursive(childPath);
                await appendTree(childPath, childContent, [...includeStack, childPath]);
                if (options.treatIncludeAsBreak) {
                    fullText += "\n---\n";
                }
            } else {
                fullText += line;
                if (i < lines.length - 1) fullText += '\n';
            }
        }
    }
    
    await appendTree(rootFile, markdownContent, [rootFile]);
    
    if (postamble) fullText += postamble;
    
    return {
        text: fullText,
        sourceMap: [], 
        slides: splitIntoSlides(fullText)
    };
}
