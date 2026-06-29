# Presentation Engine

A universal, markdown-based lecture presentation engine with interactive simulation sandbox.

## Features

- **Slide Engine**: Convert markdown files into full-screen, navigable lecture slides
- **LaTeX Math**: MathJax-powered inline and block math rendering
- **Interactive Demos**: Embed simulations directly in lectures via iframe overlays
- **Simulation Sandbox**: Canvas-based space-time diagram with state machines, message passing, and real-time code editing
- **Addons**: Extensible plugin system for custom markdown blocks:
  - `static-timeline`: Declarative space-time diagrams in JSON
  - `static-diagram`: SVG node-link diagrams in JSON
  - `matrix`: CSS grid layouts via `:::matrix` syntax
  - `youtube` / `gdrive`: Inline media embeds
  - `image`: Enhanced image positioning and sizing
- **Themes**: Day/night mode with full CSS variable support
- **Modular Lectures**: `!include()` syntax for composing lectures from smaller files

## Usage as Git Submodule

```bash
# Add to your course repository
git submodule add https://github.com/fbeilstein/presentation_engine.git engine

# Clone a course repo with the engine
git clone --recurse-submodules <course-repo-url>
```

### Course Repository Structure

```
your-course/
├── engine/              ← this submodule
├── slides.html          ← thin HTML shell (see template below)
├── lectures/
│   └── *.md
├── demos/
│   └── */
└── README.md
```

### `slides.html` Template

Your course root needs a `slides.html` that loads the engine:

```html
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Lecture Slides</title>
    <link rel="stylesheet" href="engine/css/slides.css">
    <script src="https://cdn.jsdelivr.net/npm/marked/marked.min.js"></script>
    <script>
        window.MathJax = {
            tex: {
                inlineMath: [['$', '$'], ['\\(', '\\)']],
                displayMath: [['$$', '$$'], ['\\[', '\\]']],
                processEscapes: true
            },
            svg: { fontCache: 'global' }
        };
    </script>
    <script id="MathJax-script" async src="https://cdn.jsdelivr.net/npm/mathjax@3/es5/tex-mml-chtml.js"></script>
</head>
<body>
    <button id="theme-toggle" onclick="toggleTheme()" title="Toggle Day/Night Theme">🌙</button>
    <div id="presentation-container"></div>
    <div id="controls">
        <button id="prev-btn" onclick="prevSlide()">&#10094; Prev</button>
        <span id="slide-counter">1 / 1</span>
        <button id="next-btn" onclick="nextSlide()">Next &#10095;</button>
    </div>
    <div id="demo-overlay" class="hidden">
        <div id="demo-header">
            <span id="demo-title">Interactive Demo</span>
            <button id="close-demo-btn" onclick="hideDemo()">&#10006; Return to Slides</button>
        </div>
        <iframe id="demo-iframe" src=""></iframe>
    </div>
    <script type="module" src="engine/js/slides.js"></script>
</body>
</html>
```

### Local Development

```bash
cd your-course/
python -m http.server 8000
# Open http://localhost:8000/slides.html?file=lectures/your_lecture.md
```

## Guides

- [How to Write Slides](guides/how_to_write_slides.md)
- [How to Write Demos](guides/how_to_write_demos.md)
- [How to Create Static Timelines](guides/how_to_write_timelines.md)

## Architecture

```
js/
├── slides.js           # Core slide engine (markdown → presentation)
├── slides-addons.js    # Addon registry (plugin system)
├── addons/             # Built-in addon plugins
└── sandbox/            # Interactive simulation engine
    ├── index.html      # Sandbox entry point
    ├── main.js         # Bootstrap & config loader
    ├── engine.js       # Tick loop, message routing
    ├── timeline.js     # Canvas space-time diagram renderer
    ├── server-runtime.js   # Node.js sandbox (new Function)
    ├── automat-source.js   # State/Machine OOP framework
    ├── interactions.js     # Mouse/keyboard handlers
    ├── state-inspector.js  # State card panel
    ├── code-editor.js      # Inline code editor
    ├── config-editor.js    # Config JSON editor
    ├── render-editor.js    # Custom render code editor
    └── prng.js             # Seeded PRNG
```
