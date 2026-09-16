# Math Python Editor & Engine Architecture

This document provides a highly detailed, file-by-file breakdown of the entire architecture, encompassing both the backend server, the frontend editor, and the presentation engine.

## Core Architectural Concepts

1. **The Multi-File "Wall of Text" Engine**: The editor aims to present a fragmented project (a root `.html` file that `!include`s many `.md` files) as a single, continuous flat text document in CodeMirror.
2. **The Journal/Memory Cache**: To prevent constant slow disk writes and provide real-time iframe previews, the editor keeps all changes in an in-memory `fileCache`. A debounced journal patch is sent to a backend server which intercepts `fetch` requests from the iframe preview and serves the live memory cache instead of the disk file.
3. **The Iframe Bridge**: The editor itself does not parse markdown into slides. It loads `preview.html` into an iframe, which loads `slides.js` (the engine). The engine emits HTML comments tracking which file and line each slide came from. A `bridge.js` script inside the iframe parses these comments and sends a structural map back to the editor, allowing the editor to render the slide outline and map CodeMirror lines to slides.

---

## 1. Engine Backend (Server)
**Directory: `engine/editor/server/`**

### `server.py`
The FastAPI backend server running on port 8000 via Uvicorn.
- **File System API**: Provides `GET /api/fs` to list the workspace files, and `POST /api/file` to save files to disk.
- **Journal Middleware (`JournalMiddleware`)**: The most critical component. It intercepts all `GET` requests (e.g., when the preview iframe fetches `01_chemical_equilibrium.md`). It reads `.journal.json` to see if there is a live unsaved edit for that file in the frontend's cache. If so, it serves the unsaved text. If not, it serves the file from disk.
- **Journal API**: `POST /api/journal` writes the live frontend `fileCache` patches to `.journal.json`. It now tracks `rootFile` so the frontend can automatically reload the last opened presentation when the browser refreshes.
- **Upload API**: `POST /api/upload` handles direct file uploads (e.g., for pasting images directly into the editor UI), saving them to the workspace and generating correct relative markdown links.

---

## 2. Editor Frontend (CodeMirror & UI)
**Directory: `engine/editor/`**

### `index.html`
The main entry point for the editor UI. It defines the layout structure: the left sidebar (file tree and slide outline), the middle pane (CodeMirror text editor), and the right pane (the live preview iframe).

### `preview.html`
The HTML file loaded into the right-hand iframe.
- It acts as a shell that dynamically fetches the selected root `.html` lecture via a `?context=` URL parameter.
- It injects `bridge.js` into the fetched HTML and sets the base `<base href="..."/>` so relative assets (images, css) load correctly inside the iframe.

### `engine/editor/js/app.js`
The main bootstrapping script for the editor UI. 
- Handles the initialization of all major modules (`editor`, `file-tree`, `outline`, `tool-manager`).
- Implements the drag-and-resize logic for the UI panes (the draggable splitters between the sidebar, editor, and preview).

### `engine/editor/js/editor.js`
The core controller tying CodeMirror to the background logic.
- Initializes the CodeMirror instance (`initEditor`) with syntax highlighting, custom gutters, and code folding.
- **`changes` event listener**: Fires when the user types or structural edits happen. It passes every edit to `document-model.js` via `applyChange()`, asks `document-model.js` to rebuild the file mapping tree, and then triggers `updatePreview()` to send the live text to the iframe.
- **`cursorActivity` listener**: Triggers `syncPreviewToCursor()`, which sends a message to the iframe to flip to the slide the cursor is currently on.

### `engine/editor/js/document-model.js`
The brain of the multi-file architecture.
- **`fileCache`**: A dictionary storing the raw string content of every loaded file.
- **`loadRoot(path)`**: Recursively fetches a root `.html` file and all `!include()` markdown files, populating `fileCache`.
- **`rebuildTree()`**: Unrolls the includes into a single massive string (`flatLines`), keeping a strict index mapping of which CodeMirror line corresponds to which physical file and local line number.
- **`applyChange(change)`**: Receives CodeMirror text edits. It looks up the CodeMirror line number in `flatLines`, identifies the exact target file and local line, and surgically modifies `fileCache` to reflect the edit. (Note: It strictly requires edits to be confined to a single file boundary).

### `engine/editor/js/document-differ.js`
Handles synchronization between the live memory model and the backend.
- **`onModelUpdated()`**: A callback triggered by `rebuildTree`. If the generated flat text differs from CodeMirror, it updates CodeMirror (e.g., loading a document for the first time, or restoring state from the journal).
- **`handleEditorChange()`**: Debounces CodeMirror keystrokes and fires a `POST /api/journal` request to back up the `fileCache` to the backend.

### `engine/editor/js/outline.js`
Manages the left-hand Slide Outline panel and the Drag-and-Drop architecture.
- Listens for `presentation_loaded` messages from the iframe (which contain the slide structure).
- Renders the UI list of files and slides.
- **`handleDrop()`**: Executes slide rearrangement. To preserve `Ctrl+Z` history, it strictly uses sequential CodeMirror `doc.replaceRange()` calls to "cut" the source slide and "paste" it at the destination. It meticulously calculates line numbers and avoids CodeMirror `operation()` batching so that `applyChange` can process the cross-file structural edit safely.
- **`extractToNewFile()`**: Logic allowing a user to highlight slides and extract them into a brand new `!include()` file.

### `engine/editor/js/file-tree.js`
Fetches the workspace file list from the backend and renders the top-left File Explorer UI. Allows users to click an `.html` file to load it into the editor.

### `engine/editor/js/file-prompt.js`
A simple UI modal library used to prompt the user for input (e.g., asking for a filename when creating a new file or extracting slides).

### `engine/editor/js/tools/`
Contains extensions and helper modules that hook into CodeMirror.
- **`image-tool.js`**: Intercepts clipboard `paste` and `drop` events. If the payload is an image, it triggers a UI modal to automatically upload the file via `/api/upload` and instantly injects the markdown `![image](url)` syntax into the editor.
- **`youtube-tool.js`**: Intercepts `paste` events to check for YouTube URLs. Automatically reformats them into the `![youtube](id)` engine syntax.
- **`geometry-tool.js` & `tool-manager.js`**: (WIP) Systems designed to overlay visual tools on the editor/preview, such as visually drawing boxes to generate math geometry markup.

### `engine/editor/preview-inject/bridge.js`
A critical telemetry script injected directly inside the `preview.html` iframe.
- It waits for the presentation engine (`slides.js`) to finish rendering.
- It scans the generated DOM for `<!-- SOURCE: file.md:line -->` comments.
- It builds `slideMapping` (mapping global visual slide indexes back to their source files) and posts it to the parent window so `outline.js` can draw the sidebar.
- Listens for `update_slide` from the editor and hot-reloads specific slides instantly without a full page refresh.

---

## 3. Presentation Engine (Frontend Render)
**Directory: `engine/` & `engine/js/`**
This is the runtime engine that actually displays the slides when a student views them (or when the editor previews them).

### `engine/js/slides.js`
The heavy lifter of the presentation runtime (a custom wrapper around Reveal.js/Marked.js).
- **Include Resolver**: Scans the root HTML document for `!include(path)` directives. It recursively fetches these files and concatenates them.
- **Source Tracking**: As it fetches files, it injects `<!-- SOURCE: filepath|localIndex -->` comments before every `---` slide delimiter. This is the exact data `bridge.js` relies on.
- **Markdown Parsing**: It splits the unified text by `---` into individual slides, runs them through the `marked` library to convert Markdown to HTML, and injects them into the DOM as `<section class="slide">` elements.
- **MathJax & Highlight.js**: It triggers MathJax to render LaTeX equations and Highlight.js to syntax highlight code blocks.

### `engine/js/slides-addons.js`
A plugin manager for the slide engine. It registers and executes custom parsers (like 3D molecules, numpy visualizers, etc.) across the rendered slides.

### `engine/js/addons/*.js`
Individual custom syntax parsers that run after the markdown is converted to HTML.
- **`3dmol-parser.js`**: Parses chemical definitions and renders interactive 3D WebGL molecules.
- **`geometry-parser.js`**: Parses SVG/geometry directives into visual math shapes.
- **`numpy-parser.js` & `matrix-parser.js`**: Renders beautifully formatted MathJax matrices from python/numpy array syntax.
- **`titlepage-parser.js`**: Specific layout rules for rendering a beautiful first-slide title page.
- **`youtube-parser.js`**: Converts youtube links into embedded video iframes.
- **`static-diagram.js` & `static-timeline.js`**: Render specific visual components like flowcharts or timeline blocks.

### `engine/css/`
The CSS stylesheets governing the visual presentation of the slides.
- **`style.css` / `slides.css`**: Core typography, layout, animations, and Reveal.js overrides.
- **`addons/titlepage.css`**: Specific styling for the titlepage addon.

---

## 4. Sandbox Runtime (Interactive Python Engine)
**Directory: `engine/js/sandbox/`**
Contains the logic for interactive, executable code blocks within the slides.

- **`engine.js` & `server-runtime.js`**: Connects code blocks to a python execution backend (usually Pyodide or a remote python server), handling execution state and standard output.
- **`code-editor.js`**: Wraps slide code blocks in a minimal CodeMirror instance allowing students to edit and run code directly in the presentation.
- **`interactions.js`**: Handles user click events and interactions with the sandbox components.
- **`state-inspector.js`**: A debugger UI component showing variables/state of the running python environment.
- **`timeline.js` & `automat-source.js`**: Animation and synchronization logic for interactive widgets stepping through states.

---

## Summary
The system is an incredibly complex dance between the **Editor** (which flattens files into CodeMirror), the **Engine** (which parses them into slides and tracks their origins), the **Bridge** (which connects the Engine's rendered DOM back to the Editor's UI), and the **Journal Server** (which ensures the Engine fetches live memory states instead of stale disk files). 

Modifying any of the core parsing logic (`editor.js`, `document-model.js`, `outline.js`, or `slides.js`) requires extreme care to ensure the `flatLines` index tracking and the `fileCache` journal remain perfectly synchronized.
