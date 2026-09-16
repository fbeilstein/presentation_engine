import { EditorView } from '@codemirror/view';

function extractYoutubeId(url) {
    let match = url.match(/(?:youtube\.com\/(?:[^\/]+\/.+\/|(?:v|e(?:mbed)?)\/|.*[?&]v=)|youtu\.be\/)([^"&?\/\s]{11})/);
    return match ? match[1] : null;
}

export function youtubeToolExtension() {
    return EditorView.domEventHandlers({
        paste: (e, view) => {
            const clipboardData = e.clipboardData || e.originalEvent.clipboardData;
            const text = clipboardData.getData('text/plain');
            
            if (text) {
                const youtubeId = extractYoutubeId(text);
                if (youtubeId) {
                    e.preventDefault();
                    
                    const insertText = `![youtube](${youtubeId}) {width="80%" left="10%"}`;
                    
                    const selection = view.state.selection.main;
                    view.dispatch({
                        changes: {
                            from: selection.from,
                            to: selection.to,
                            insert: insertText
                        },
                        selection: { anchor: selection.from + insertText.length },
                        scrollIntoView: true
                    });
                    return true;
                }
            }
            return false;
        }
    });
}
