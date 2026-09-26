// RxnBundleLoader - Handles downloading and parsing of .rxnbundle.zip files

let jsZipPromise = null;

function loadJSZip() {
    if (window.JSZip) return Promise.resolve(window.JSZip);
    if (jsZipPromise) return jsZipPromise;

    jsZipPromise = new Promise((resolve, reject) => {
        const s = document.createElement('script');
        s.src = 'https://cdnjs.cloudflare.com/ajax/libs/jszip/3.10.1/jszip.min.js';
        s.onload = () => resolve(window.JSZip);
        s.onerror = reject;
        document.head.appendChild(s);
    });
    return jsZipPromise;
}

export class RxnBundleLoader {
    constructor(url) {
        this.url = url;
        this.zip = null;
        this.manifest = null;
    }

    async load() {
        await loadJSZip();
        const response = await fetch(this.url);
        if (!response.ok) throw new Error(`Failed to fetch bundle: ${this.url}`);
        const arrayBuffer = await response.arrayBuffer();
        
        const JSZip = window.JSZip;
        this.zip = await JSZip.loadAsync(arrayBuffer);
        
        // Load manifest
        const manifestText = await this.getFileText('manifest.json');
        if (!manifestText) throw new Error("Invalid bundle: missing manifest.json");
        this.manifest = JSON.parse(manifestText);
        
        return this.manifest;
    }

    async getFileText(path) {
        const file = this.zip.file(path);
        if (!file) return null;
        return await file.async("string");
    }

    hasFile(path) {
        if (!this.zip) return false;
        return !!this.zip.file(path);
    }

    async getFileJSON(path) {
        const text = await this.getFileText(path);
        if (!text) return null;
        return JSON.parse(text);
    }
}
