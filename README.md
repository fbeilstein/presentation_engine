# Presentation Engine & Editor

A universal, markdown-based lecture presentation engine with an interactive simulation sandbox and a powerful built-in WYSIWYG CodeMirror Editor.

## Features
- **Slide Engine**: Convert markdown files into full-screen, navigable lecture slides.
- **Visual Editor**: Run the built-in web editor for live preview, multi-file editing, and drag-and-drop slide management.
- **LaTeX Math**: MathJax-powered inline and block math rendering.
- **Interactive Demos**: Embed simulations directly in lectures via iframe overlays.
- **Simulation Sandbox**: Canvas-based space-time diagram with state machines, message passing, and real-time code editing.
- **Themes**: Day/night mode with full CSS variable support.
- **Modular Lectures**: `!include()` syntax for composing lectures from smaller files.

---

## 1. Usage as a Git Submodule

The recommended way to use this engine is to include it as a git submodule inside your own course repository.

```bash
# Add to your course repository
git submodule add git@github.com:fbeilstein/presentation_engine.git engine

# If you are cloning a course repo that already uses the engine:
git clone --recurse-submodules <course-repo-url>
```

### Typical Course Repository Structure
```
your-course/
├── engine/              ← this submodule
├── lectures/            ← your markdown lecture files
│   └── 01_intro.md
├── slides.html          ← a thin HTML shell to load the engine
└── README.md
```

---

## 2. Starting a Slide Deck (Two Approaches)

There are two different workflows you can use to structure your lectures.

### Approach A: Embedded Markdown (Self-Contained HTML)
You can create a specific HTML file for a lecture (e.g., `01_quantum_mechanics.html`) and write your markdown directly inside it.

```html
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <title>Quantum Mechanics</title>
</head>
<body>
    <!-- 1. Load the presentation engine -->
    <script type="module" src="engine/js/slides.js"></script>

    <!-- 2. Write your markdown inside this block -->
    <script type="text/markdown" id="markdown-source">
# Quantum Mechanics

Welcome to the course!

---

# Slide 2

This is the next slide.
    </script>
</body>
</html>
```
*Note: The engine automatically injects all necessary boilerplate (MathJax, UI controls, presentation containers) at runtime.*

### Approach B: Pure Markdown Files (Dynamic Wrapper)
If you prefer to write your lectures in pure `.md` files, you can create a single, generic `slides.html` wrapper at the root of your course repository:

```html
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <title>Course Slides</title>
</head>
<body>
    <!-- 1. Load the presentation engine -->
    <script type="module" src="engine/js/slides.js"></script>
    
    <!-- Do not include a markdown-source script block here -->
</body>
</html>
```

With this approach, you write your slides in separate markdown files (e.g., `lectures/01_intro.md`), and you dynamically load them via the URL parameter:
`http://localhost:8000/slides.html?file=lectures/01_intro.md`

---

## 3. Viewing Slides & Running the Editor Locally

### Option A: View Slides (Read-Only)
To quickly view your slides locally in your browser, you can run a standard Python HTTP server from the root of your course repository:
```bash
python -m http.server 8000
# Open your browser to: http://localhost:8000/slides.html?context=lectures/01_intro.md
```

### Option B: Run the Editor (Authoring Mode)
The engine comes with a powerful dual-pane Editor (CodeMirror + Live Preview) that supports multi-file editing and drag-and-drop. To run the editor backend:
```bash
# Ensure you have FastAPI and Uvicorn installed
pip install fastapi uvicorn

# Run the editor server from the root of your course repository
python -m uvicorn engine.editor.server.server:app --port 8080 --host 0.0.0.0
# Open your browser to: http://localhost:8080/
```

---

## 4. Making Links for GitHub Pages

If you host your course repository on GitHub Pages, the presentation engine works entirely client-side. You can link directly to specific lectures by passing the markdown file via the `?file=` URL parameter (or if your HTML file already hardcodes the include, just link to the HTML file).

**Example URL structure:**
`https://<your-username>.github.io/<your-repo>/slides.html?file=lectures/01_intro.md`

*(Note: If you create specific HTML wrappers like `01_linear_algebra.html` for different modules, simply link directly to them: `https://<your-username>.github.io/<your-repo>/01_linear_algebra.html`)*

---

## 5. Authoring Guides

For complete instructions on Markdown syntax, using plugins (like YouTube, Titlepages, Matrices), and building interactive simulations, please refer to the guides:

- [How to Write Slides (Syntax & Addons)](guides/how_to_write_slides.md)
- [How to Write Demos & Sandboxes](guides/how_to_write_demos.md)
- [How to Create Static Timelines](guides/how_to_write_timelines.md)
