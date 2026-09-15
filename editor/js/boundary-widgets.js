import { Decoration, WidgetType, EditorView } from '@codemirror/view';
import { StateField } from '@codemirror/state';
import { regionMapField } from './region-map.js';

class IncludeEndWidget extends WidgetType {
    constructor(file) {
        super();
        this.file = file;
    }
    
    toDOM() {
        const div = document.createElement('div');
        div.className = 'include-end-boundary';
        div.setAttribute('contenteditable', 'false');
        
        div.style.display = "flex";
        div.style.alignItems = "center";
        div.style.justifyContent = "center";
        div.style.margin = "8px 0";
        div.style.color = "#999";
        div.style.fontSize = "0.85em";
        div.style.userSelect = "none";
        
        const lineBefore = document.createElement('div');
        lineBefore.style.flex = "1";
        lineBefore.style.height = "1px";
        lineBefore.style.backgroundColor = "#e0e0e0";
        lineBefore.style.marginRight = "10px";
        
        const lineAfter = document.createElement('div');
        lineAfter.style.flex = "1";
        lineAfter.style.height = "1px";
        lineAfter.style.backgroundColor = "#e0e0e0";
        lineAfter.style.marginLeft = "10px";
        
        const label = document.createElement('span');
        label.className = 'include-end-label';
        label.textContent = `end of ${this.file.split('/').pop()}`;
        
        div.appendChild(lineBefore);
        div.appendChild(label);
        div.appendChild(lineAfter);
        return div;
    }
    
    eq(other) { return this.file === other.file; }
    ignoreEvent() { return true; }
}

function buildDecorations(state) {
    const regionMap = state.field(regionMapField, false);
    const widgets = [];
    if (regionMap && regionMap.regions) {
        for (const region of regionMap.regions) {
            if (region.type === 'expanded-include') {
                widgets.push(Decoration.widget({
                    widget: new IncludeEndWidget(region.file),
                    side: 1
                }).range(region.to));
            }
        }
    }
    
    return Decoration.set(widgets);
}

export const endBoundaryDecorations = StateField.define({
    create(state) {
        return buildDecorations(state);
    },
    update(value, tr) {
        if (tr.docChanged || tr.state.field(regionMapField, false) !== tr.startState.field(regionMapField, false)) {
            return buildDecorations(tr.state);
        }
        return value;
    },
    provide: f => EditorView.decorations.from(f)
});
