export function computeChanges(oldText, newText) {
    let start = 0;
    while (start < oldText.length && start < newText.length && oldText[start] === newText[start]) start++;
    
    let oldEnd = oldText.length - 1;
    let newEnd = newText.length - 1;
    while (oldEnd >= start && newEnd >= start && oldText[oldEnd] === newText[newEnd]) {
        oldEnd--;
        newEnd--;
    }
    
    if (oldEnd < start && newEnd < start) return [];
    
    let oldEndTrim = oldEnd;
    while (oldEndTrim >= start && /\s/.test(oldText[oldEndTrim])) oldEndTrim--;
    let newEndTrim = newEnd;
    while (newEndTrim >= start && /\s/.test(newText[newEndTrim])) newEndTrim--;
    
    let commonSuffixLen = 0;
    while (oldEndTrim - commonSuffixLen >= start && 
           newEndTrim - commonSuffixLen >= start && 
           oldText[oldEndTrim - commonSuffixLen] === newText[newEndTrim - commonSuffixLen]) {
        commonSuffixLen++;
    }
    
    if (commonSuffixLen > 0) { 
        let changes = [];
        let oldMidEnd = oldEndTrim - commonSuffixLen;
        let newMidEnd = newEndTrim - commonSuffixLen;
        
        if (start <= oldMidEnd + 1 || start <= newMidEnd + 1) {
            changes.push({
                from: start,
                to: oldMidEnd + 1,
                insert: newText.substring(start, newMidEnd + 1)
            });
        }
        
        let oldTrailing = oldText.substring(oldEndTrim + 1, oldEnd + 1);
        let newTrailing = newText.substring(newEndTrim + 1, newEnd + 1);
        if (oldTrailing !== newTrailing) {
            changes.push({
                from: oldEndTrim + 1,
                to: oldEnd + 1,
                insert: newTrailing
            });
        }
        return changes;
    }
    
    return [{from: start, to: oldEnd + 1, insert: newText.substring(start, newEnd + 1)}];
}
