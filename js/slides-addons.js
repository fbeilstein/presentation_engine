export const SlideAddons = {
    registry: {},
    preProcessors: [],

    /**
     * Registers a new markdown code block renderer.
     * @param {string} language - The markdown language identifier (e.g., 'static-timeline').
     * @param {function} renderFn - The function to call, receives the matching DOM node.
     */
    register(language, renderFn) {
        this.registry[language] = renderFn;
    },

    /**
     * Registers a markdown pre-processor (string-to-string transformation).
     * @param {function} fn - Function that takes markdown string and returns modified string.
     */
    registerPreProcessor(fn) {
        this.preProcessors.push(fn);
    },

    inlinePlugins: {},
    blockPlugins: {},

    parseConfigBlock(configStr) {
        if (!configStr) return { classes: [], kv: {}, css: '' };
        let str = configStr.trim();

        const classMatches = str.match(/\.[\w-]+/g) || [];
        const classes = classMatches.map(c => c.substring(1));
        str = str.replace(/\.[\w-]+/g, '');

        const kv = {};
        str = str.replace(/([a-zA-Z0-9_-]+)=(?:"([^"]+)"|([^\s}]+))/g, (match, key, qVal, uVal) => {
            kv[key] = qVal !== undefined ? qVal : uVal;
            return '';
        });

        const knownFlags = ['center', 'right', 'left', 'top', 'bottom', 'absolute', 'pos', 'debug'];
        knownFlags.forEach(flag => {
            const regex = new RegExp(`(^|\\s)${flag}(?=\\s|$)`, 'g');
            str = str.replace(regex, (match, space) => {
                kv[flag] = true;
                return space;
            });
        });

        const css = str.trim();
        return { classes, kv, css };
    },

    registerInlinePlugin(name, handler) {
        this.inlinePlugins[name] = handler;
    },

    registerBlockPlugin(name, handler) {
        this.blockPlugins[name] = handler;
    },

    _processBlocks(markdown) {
        const lines = markdown.split('\n');
        const outputLines = [];
        let i = 0;

        while (i < lines.length) {
            const line = lines[i];
            const match = line.match(/^:::([a-zA-Z0-9_-]+)(?:\s*\{([^}]*)\})?\s*$/);

            if (match && this.blockPlugins[match[1]]) {
                const pluginName = match[1];
                const configStr = match[2];
                let nestDepth = 1;
                const bodyLines = [];
                i++;

                while (i < lines.length && nestDepth > 0) {
                    const currentLine = lines[i];
                    if (currentLine.match(/^:::[a-zA-Z]+/)) {
                        nestDepth++;
                    } else if (currentLine.match(/^:::\s*$/)) {
                        nestDepth--;
                    }
                    
                    if (nestDepth > 0) {
                        bodyLines.push(currentLine);
                    }
                    i++;
                }
                
                const body = bodyLines.join('\n');
                const parsedConfig = this.parseConfigBlock(configStr);
                const result = this.blockPlugins[pluginName](parsedConfig, body);
                outputLines.push(result);
            } else {
                outputLines.push(line);
                i++;
            }
        }
        return outputLines.join('\n');
    },

    _processInlines(markdown) {
        // Match ![name or alt text](args){config}
        const inlineRegex = /!\[([^\]]*)\]\(([^)]*)\)(?:\s*\{([^}]*)\})?/g;
        return markdown.replace(inlineRegex, (match, altText, args, configStr) => {
            const parsedConfig = this.parseConfigBlock(configStr);
            if (this.inlinePlugins[altText]) {
                return this.inlinePlugins[altText](args, parsedConfig, altText);
            } else if (this.inlinePlugins['image']) {
                return this.inlinePlugins['image'](args, parsedConfig, altText);
            }
            return match;
        });
    },

    /**
     * Applies all registered pre-processors to the markdown content.
     * @param {string} markdown - The raw markdown content.
     * @returns {string} - The processed markdown.
     */
    preProcess(markdown) {
        let md = markdown;
        
        // Backwards compatibility for legacy code block addons
        md = md.replace(/^```(static-diagram|static-timeline)(?:\{([^}]*)\})?\s*\n([\s\S]*?)\n```/gm, 
            (match, plugin, config, body) => `:::${plugin}${config ? ` {${config}}` : ''}\n${body}\n:::`
        );

        md = this._processBlocks(md);
        md = this._processInlines(md);
        this.preProcessors.forEach(fn => {
            md = fn(md);
        });
        return md;
    },

    /**
     * Scans the document for all registered addon code blocks and renders them.
     */
    renderAll() {
        for (const [language, renderFn] of Object.entries(this.registry)) {
            const blocks = document.querySelectorAll(`code.language-${language}`);
            blocks.forEach(block => renderFn(block));
        }
    }
};
