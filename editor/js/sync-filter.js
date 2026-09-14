import { EditorState, Annotation, Transaction } from '@codemirror/state';
import { regionMapField } from './region-map.js';

// Tag applied to sync-generated transactions so the filter ignores them
export const syncAnnotation = Annotation.define();

function findEditedRegion(regionMap, changes) {
    let editedRegion = null;
    let crosses = false;
    
    changes.iterChangedRanges((fromA, toA, fromB, toB) => {
        // Find region that completely contains this change
        const match = regionMap.regions.find(r => r.from <= fromA && r.to >= toA);
        if (match) {
            if (!editedRegion) {
                editedRegion = match;
            } else if (editedRegion !== match) {
                crosses = true; // Edits spanning multiple regions
            }
        } else {
            crosses = true; // Edits outside any region or crossing bounds
        }
    });
    
    if (crosses) return 'crosses';
    return editedRegion;
}

export const syncFilter = EditorState.transactionFilter.of((tr) => {
    // Guard: if this transaction was already produced by the sync filter, pass through
    if (tr.annotation(syncAnnotation)) return tr;
    if (!tr.docChanged) return tr;
    
    const regionMap = tr.startState.field(regionMapField);
    
    // 1. Identify which region the edit touches
    const editedRegion = findEditedRegion(regionMap, tr.changes);
    if (!editedRegion) return tr;
    
    // 2. Check if edit crosses region boundaries -> REJECT
    if (editedRegion === 'crosses') {
        return []; // Cancel the transaction
    }
    
    // 3. Find sibling instances of the same file
    const siblings = regionMap.fileInstances.get(editedRegion.file);
    if (!siblings || siblings.length <= 1) return tr; // No duplicates, pass through
    
    // 4. Compute the NEW content of the edited file after the user's edit
    // Find all regions in this specific instance of the file
    // The siblings map contains ALL regions for this file (across all instances).
    // We only want the siblings that map to the *exact same* region in another instance.
    // We can match them by `localOffset` and `type`.
    
    const matchingSiblings = siblings.filter(s => 
        s.localOffset === editedRegion.localOffset && 
        s.type === editedRegion.type &&
        s !== editedRegion
    );
    
    if (matchingSiblings.length === 0) return tr;
    
    // Compute the NEW content of this specific region
    let newContent = "";
    let cursor = editedRegion.from;
    
    tr.changes.iterChanges((fromA, toA, fromB, toB, inserted) => {
        if (fromA >= editedRegion.to || toA <= editedRegion.from) return; // Outside our region
        
        if (fromA > cursor) {
            newContent += tr.startState.doc.sliceString(cursor, fromA);
        }
        newContent += inserted.toString();
        cursor = toA;
    });
    if (cursor < editedRegion.to) {
        newContent += tr.startState.doc.sliceString(cursor, editedRegion.to);
    }
    
    // 5. Wholesale-replace each sibling region with the new content
    const siblingReplacements = matchingSiblings.map(sibling => ({
        from: sibling.from,
        to: sibling.to,
        insert: newContent
    }));
    
    // 6. Return a single transaction
    return {
        changes: [...tr.changes.toJSON(), ...siblingReplacements],
        annotations: syncAnnotation.of(true),
        userEvent: tr.annotation(Transaction.userEvent)
    };
});
