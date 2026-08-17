# Markdown Slides: Author Guide

This guide explains how to create interactive, high-fidelity lecture slides using the built-in presentation engine.

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

## 2. Formatting & Math

The engine uses `marked.js` and supports:
- **Standard Markdown**: Lists, tables, bold, italics, and code blocks.
- **LaTeX Math**: Powered by MathJax.
    - Inline: `$ \Phi = 1 - P $`
    - Block: `$$ \text{score} = \frac{\sum x_i}{n} $$`

---

## 3. Advanced Layouts (HTML/CSS)

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

## 4. Interactive Demos

To embed a "Launch Demo" button that opens a simulation overlay:

```html
<button class="demo-btn" onclick="showDemo('demos/my-demo/demo.json')">
    Launch Interactive Demo 🚀
</button>
```

- If you pass a `.json` path, it opens the **Sandbox Engine**.
- If you pass a `.html` path, it loads that file directly into the overlay.

---

## 5. Media Embeds

YouTube videos and other external content work perfectly via standard `iframe` embeds. Use a centring container for best results:

```html
<div style="text-align: center; margin-top: 20px;">
    <iframe width="800" height="450" 
            src="https://www.youtube.com/embed/dQw4w9WgXcQ" 
            title="YouTube video player" frameborder="0" 
            allowfullscreen></iframe>
</div>
```

---

## 6. Modular Lectures (`!include`)

You can keep your files organized by including other markdown files:

`!include(chapters/01_introduction.md)`

The engine resolves these recursively, allowing you to stitch together a complete 3-hour lecture from smaller topical files.

---

## 7. Custom Styling & Themes

The presentation engine supports a **Day/Night (Theme)** switch. You can create styles that respond to this switch by using the `body.light-theme` parent selector.

### Automatic Theme Switching

Drop a `<style>` block into any slide to define theme-aware components:

```html
<style>
  /* Base (Dark) Style */
  .my-div-cool-style { 
      background: #333; 
      border: 2px solid green;
      padding: 20px;
  }

  /* Light Theme Override */
  body.light-theme .my-div-cool-style { 
      background: #fff; 
      border-color: blue;
  }
</style>

<div class="my-div-cool-style">
   I will automatically switch colors!
</div>
```

### Using System Design Tokens

For perfect consistency, use the built-in CSS variables instead of hardcoded colors. This ensures your custom HTML matches the rest of the lecture deck perfectly:

- `--bg-color`: Main page background.
- `--text-color`: Primary text color.
- `--slide-bg`: The background of the slide card.
- `--accent-color`: The primary brand color (usually green).
- `--header-color`: Specific color for headings.

```html
<div style="background: var(--secondary-bg); color: var(--text-color); border: 1px solid var(--accent-color);">
   I automatically adapt to any theme!
</div>
```

---

## 8. Engine Addons (Plugins)

The presentation engine uses a consistent overarching syntax to embed complex interactive components: 
*   **Inline Plugins:** `![plugin_name](required_arguments){optional_config}`
*   **Block Plugins:** `:::plugin_name {optional_config} \n ... \n :::`

### The Unified Configuration Block `{}`
Thanks to the new Unified Engine Architecture, **EVERY SINGLE ADDON** parses the `{}` block in the exact same way. You can safely mix and match CSS classes, Key-Value properties, boolean flags, and Pure CSS in any `{}` block, anywhere in the engine.

**Example of mixing everything:**
`{ .my-class width=50% absolute center border: 1px solid red; opacity: 0.5; }`

The engine will cleanly parse:
1.  **Classes:** `.my-class`
2.  **Key-Values:** `width="50%"`
3.  **Flags:** `absolute`, `center` (internally mapped to `absolute=true`, `center=true`)
4.  **Pure CSS:** `border: 1px solid red; opacity: 0.5;`

---

### 1. Media Addons (Images, YouTube, Google Drive, 3DMol)
**Syntax:** `![plugin_name](url){config}`
*   **Images:** `![alt text](path/to/img.png){width=50% center}`
*   **YouTube:** `![youtube](url){width=800 height=450 aspect="16/9"}`
*   **Google Drive:** `![gdrive](url){left=10% top=20%}`
*   **3D Molecules:** `![3dmol](url_or_pdb_id){type=pdb style=cartoon color=element spin}`

### 2. Geometry Addon (Overlays)
You can draw absolute-positioned SVG overlays anywhere on the slide. Coordinates can be raw percentages (`10` = `10%`) or explicit pixels (`10px`).
If you place these tags outside a matrix, coordinates are relative to the slide. If you place them inside a matrix cell, they are relative to the cell!

**Syntax:** `![shape_name](coordinates){styling}`
*   **Arrow:** `![arrow](x1 y1 -> x2 y2){color=red width=3px dashed}`
    *(Example: `![arrow](10 20 -> 50 80){color=blue}`)*
*   **Line:** `![line](x1 y1 -> x2 y2){color=green width=2px}`
*   **Rectangle:** `![rect](x y width height){fill=rgba(0,0,0,0.1) stroke=red radius=5}`
    *(Example: `![rect](10 10 50 50){fill=transparent color=green}`)*
*   **Circle:** `![circle](cx cy r){fill=red color=black}`
*   **Text:** `![text](x y The Text){color=black size=20px}`
    *(Example: `![text](10% 63.5% $$\mathrm{S} \longrightarrow \mathrm{X}^{\ddagger} \longrightarrow \mathrm{P}$$){color: blue}`)*

### 3. Container Addons (Matrices & Diagrams)
**Syntax:** `:::plugin_name {config} ... :::`
*   **Matrix Wrapper:** `:::matrix {cols="1fr 2fr" gap="20px"}`
*   **Matrix Cell:** `[[row, col]]{.highlight padding: 10px;}` (Cells use the same unified `{}` parser!)
*   **Numpy Array:** `:::nparray { .custom-table } \n [1, 2, [3, 4]] \n :::`
*   **Titlepage:** `:::titlepage { background="var(--bg-color)" } \n [[title]] \n My Lecture \n :::`
*   **Static Timeline:** `:::static-timeline { width=100% center } \n { "ticks": 100, ... } \n :::`
*   **Static Diagram:** `:::static-diagram { background="white" } \n { "nodes": [...], "links": [...] } \n :::`

---

## 9. Best Practices

1. **Keep it Concise**: Use bullet points and large fonts. Avoid walls of text.
2. **Visual Invariants**: Use `static-timeline` or `static-diagram` for illustrations that don't need full interactivity (see `how_to_write_timelines.md`).
3. **Themes**: The engine handles Dark/Light modes. Avoid hardcoding white backgrounds on elements unless necessary.
4. **Spacing**: Use `<div style="margin-top: 40px;"></div>` for precise vertical control between elements.
