export async function promptNewFile(title, defaultName, basePath = '') {
    return new Promise((resolve) => {
        const overlay = document.createElement('div');
        overlay.style.position = 'fixed';
        overlay.style.top = '0';
        overlay.style.left = '0';
        overlay.style.width = '100vw';
        overlay.style.height = '100vh';
        overlay.style.backgroundColor = 'rgba(0, 0, 0, 0.5)';
        overlay.style.zIndex = '100000';
        overlay.style.display = 'flex';
        overlay.style.alignItems = 'center';
        overlay.style.justifyContent = 'center';
        
        const dialog = document.createElement('div');
        dialog.style.backgroundColor = 'var(--bg-color, #fff)';
        dialog.style.padding = '20px';
        dialog.style.borderRadius = '8px';
        dialog.style.boxShadow = '0 4px 12px rgba(0,0,0,0.5)';
        dialog.style.minWidth = '300px';
        dialog.style.display = 'flex';
        dialog.style.flexDirection = 'column';
        dialog.style.gap = '10px';
        
        const titleEl = document.createElement('h3');
        titleEl.textContent = title;
        titleEl.style.margin = '0';
        titleEl.style.color = 'var(--text-color, #333)';
        
        const input = document.createElement('input');
        input.type = 'text';
        input.value = defaultName || '';
        input.style.padding = '8px';
        input.style.border = '1px solid var(--border-color, #ccc)';
        input.style.borderRadius = '4px';
        input.style.backgroundColor = 'var(--bg-color, #fff)';
        input.style.color = 'var(--text-color, #333)';
        input.style.outline = 'none';
        
        const errorEl = document.createElement('div');
        errorEl.style.color = '#e74c3c';
        errorEl.style.fontSize = '12px';
        errorEl.style.minHeight = '14px';
        
        const buttonRow = document.createElement('div');
        buttonRow.style.display = 'flex';
        buttonRow.style.justifyContent = 'flex-end';
        buttonRow.style.gap = '10px';
        
        const cancelBtn = document.createElement('button');
        cancelBtn.textContent = 'Cancel';
        cancelBtn.style.padding = '6px 12px';
        cancelBtn.style.cursor = 'pointer';
        
        const okBtn = document.createElement('button');
        okBtn.textContent = 'OK';
        okBtn.style.padding = '6px 12px';
        okBtn.style.cursor = 'pointer';
        okBtn.style.backgroundColor = 'var(--accent-color, #3498db)';
        okBtn.style.color = '#fff';
        okBtn.style.border = 'none';
        okBtn.style.borderRadius = '4px';
        
        buttonRow.appendChild(cancelBtn);
        buttonRow.appendChild(okBtn);
        
        dialog.appendChild(titleEl);
        dialog.appendChild(input);
        dialog.appendChild(errorEl);
        dialog.appendChild(buttonRow);
        overlay.appendChild(dialog);
        document.body.appendChild(overlay);
        
        input.focus();
        if (input.value) {
            input.select();
        }
        
        const cleanup = () => {
            document.body.removeChild(overlay);
        };
        
        cancelBtn.onclick = () => {
            cleanup();
            resolve(null);
        };
        
        const submit = async () => {
            const val = input.value.trim();
            if (!val) {
                errorEl.textContent = 'Filename cannot be empty.';
                return;
            }
            
            // Check if file exists
            try {
                let checkPath = val;
                if (!checkPath.startsWith('/') && basePath) {
                    checkPath = `${basePath}/${val}`;
                }
                
                const res = await fetch('/api/exists?path=' + encodeURIComponent(checkPath));
                if (res.ok) {
                    const data = await res.json();
                    if (data.exists) {
                        errorEl.textContent = 'Warning: File already exists and will be overwritten.';
                        // Change ok button text to confirm
                        if (okBtn.textContent !== 'Overwrite') {
                            okBtn.textContent = 'Overwrite';
                            okBtn.style.backgroundColor = '#e74c3c';
                            return;
                        }
                    }
                }
            } catch (e) {
                // Ignore fetch errors
            }
            
            cleanup();
            resolve(val);
        };
        
        okBtn.onclick = submit;
        input.onkeydown = (e) => {
            if (e.key === 'Enter') submit();
            if (e.key === 'Escape') {
                cleanup();
                resolve(null);
            }
            // Reset warning if typing
            errorEl.textContent = '';
            if (okBtn.textContent === 'Overwrite') {
                okBtn.textContent = 'OK';
                okBtn.style.backgroundColor = 'var(--accent-color, #3498db)';
            }
        };
    });
}
