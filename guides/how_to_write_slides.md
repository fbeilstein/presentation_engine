# Markdown Slides: Author Guide

This guide explains how to create interactive, high-fidelity lecture slides using the built-in presentation engine and live editor.

---

## 1. File Structure & Separation

Slides are written in standard Markdown files. The key engine feature is the **slide separator**:

```markdown
# Slide 1 Title
Slide content here.

---

# Slide 2 Title
More content here.
```

The `---` (three dashes on their own line with blank lines above and below) splits the file into individual full-screen slides.

---

## 2. Using the Live Editor

If you are using the built-in Uvicorn backend (`python -m uvicorn engine.editor.server.server:app`), you have access to a powerful WYSIWYG CodeMirror Editor.

- **Drag-and-Drop Reordering**: Open the left sidebar Outline. You can click and drag any slide to rearrange your presentation. The editor will automatically cut and paste the underlying markdown—even moving slides between different `!include` files!
- **Smart Pasting (Images)**: Copy an image to your clipboard and paste it directly into the editor text. A modal will pop up asking where to save the file (defaulting to the local `assets/` folder), and the editor will automatically insert the `![alt](url)` markdown.
- **Smart Pasting (YouTube)**: Paste a standard YouTube link directly into the editor, and it will automatically extract the video ID and generate a `![youtube](id)` block.
- **Click-to-Focus**: Clicking on an image or element in the live preview window will instantly scroll the CodeMirror editor and place your cursor exactly on the markdown code that generated it.

---

## 3. Modular Lectures (`!include`)

You can keep your files organized by including other markdown files:

`!include(chapters/01_introduction.md)`

The engine resolves these recursively, allowing you to stitch together a complete 3-hour lecture from smaller topical files. The Live Editor is fully aware of includes and will display the entire lecture as one continuous "wall of text", using colored left-hand stripes to indicate file boundaries.

---

## 4. Formatting & Math

The engine uses `marked.js` and supports:
- **Standard Markdown**: Lists, tables, bold, italics, and code blocks.
- **LaTeX Math**: Powered by MathJax.
    - Inline: `$ \Phi = 1 - P $`
    - Block: `$$ \text{score} = \frac{\sum x_i}{n} $$`

---

## 5. Advanced Layouts (HTML/CSS)

Because the parser allows raw HTML, you can use **Flexbox** or **Grid** for side-by-side layouts (e.g., text next to an image):

```html
<div style="display: flex; gap: 20px; align-items: center;">
    <div style="flex: 1;">
        <h3>Key Concept</h3>
        <ul>
            <li>Point A</li>
            <li>Point B</li>
        </ul>
    </div>
    <div style="flex: 1;">
        <img src="path/to/image.png" style="width: 100%;">
    </div>
</div>
```

---

## 6. Interactive Demos & Sandboxes

To embed a "Launch Demo" button that opens a simulation overlay:

```html
<button class="demo-btn" onclick="showDemo('demos/my-demo/demo.json')">
    Launch Interactive Demo 🚀
</button>
```

- If you pass a `.json` path, it opens the **Sandbox Engine**.
- If you pass a `.html` path, it loads that file directly into the overlay.

---

## 7. Engine Addons (Plugins)

The presentation engine uses a consistent overarching syntax to embed complex interactive components: 
*   **Inline Plugins:** `![plugin_name](required_arguments){optional_config}`
*   **Block Plugins:** `:::plugin_name {optional_config} \n ... \n :::`

### The Unified Configuration Block `{}`
Thanks to the new Unified Engine Architecture, **EVERY SINGLE ADDON** parses the `{}` block in the exact same way. You can safely mix and match CSS classes, Key-Value properties, boolean flags, and Pure CSS in any `{}` block, anywhere in the engine.

**Example of mixing everything:**
`{ .my-class width=50% absolute center border: 1px solid red; opacity: 0.5; }`

### 1. Media Addons
**Syntax:** `![plugin_name](url){config}`
*   **Images:** `![alt text](path/to/img.png){width=50% center}`
*   **YouTube:** `![youtube](url_or_id){width=800 height=450 aspect="16/9" start=1m30s end=100 mute autoplay nocontrols}`. Supports full URLs with `?t=` timestamps.
*   **Google Drive:** `![gdrive](url){left=10% top=20%}`
*   **3D Molecules:** `![3dmol](url_or_pdb_id){type=pdb style=cartoon color=element spin}`

### 2. Titlepages
The `:::titlepage` addon creates a beautiful, grid-based first slide. It supports multiline text across several named positional slots: `[[top]]`, `[[title]]`, `[[subcaption]]`, `[[left]]`, and `[[right]]`.

```markdown
:::titlepage { background="var(--bg-color)" }
[[top]]
Course Name - Fall 2026

[[title]]
Chapter 1: 
Chemical Equilibrium & pH

[[subcaption]]
Instructor: Dr. Smith
:::
```

### 3. Container Addons (Matrices & Diagrams)
**Syntax:** `:::plugin_name {config} ... :::`
*   **Matrix Wrapper:** `:::matrix {cols="1fr 2fr" gap="20px"}`
*   **Matrix Cell:** `[[row, col]]{.highlight padding: 10px;}`
*   **Numpy Array:** `:::nparray { .custom-table } \n [1, 2, [3, 4]] \n :::`
*   **Static Timeline:** `:::static-timeline { width=100% center } \n { "ticks": 100, ... } \n :::`
*   **Static Diagram:** `:::static-diagram { background="white" } \n { "nodes": [...], "links": [...] } \n :::`

### 4. Geometry Addon (Overlays)
You can draw absolute-positioned SVG overlays anywhere on the slide. Coordinates can be raw percentages (`10` = `10%`) or explicit pixels (`10px`).
*   **Arrow:** `![arrow](10 20 -> 50 80){color=blue}`
*   **Line:** `![line](x1 y1 -> x2 y2){color=green width=2px}`
*   **Rectangle:** `![rect](10 10 50 50){fill=transparent color=green}`
*   **Circle:** `![circle](cx cy r){fill=red color=black}`
*   **Text:** `![text](10% 63.5% $$\mathrm{S} \longrightarrow \mathrm{P}$$){color: blue}`

---

## 8. Custom Styling & Themes

The presentation engine supports a **Day/Night (Theme)** switch. You can create styles that respond to this switch by using the `body.light-theme` parent selector.

### Automatic Theme Switching

Drop a `<style>` block into any slide to define theme-aware components:

```html
<style>
  /* Base (Dark) Style */
  .my-div-cool-style { 
      background: #333; 
      border: 2px solid green;
  }

  /* Light Theme Override */
  body.light-theme .my-div-cool-style { 
      background: #fff; 
      border-color: blue;
  }
</style>
```

### Using System Design Tokens

For perfect consistency, use the built-in CSS variables instead of hardcoded colors:
- `--bg-color`: Main page background.
- `--text-color`: Primary text color.
- `--slide-bg`: The background of the slide card.
- `--accent-color`: The primary brand color (usually green).

```html
<div style="background: var(--secondary-bg); color: var(--text-color); border: 1px solid var(--accent-color);">
   I automatically adapt to any theme!
</div>
```
