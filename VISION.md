# GLITCH — App Vision

## One-liner

A grid-based glitch art creation tool where Swiss typographic structure meets digital destruction.

---

## The Problem

There is no art creation tool built around glitch aesthetics. Artists who want to make glitch-driven work currently cobble together workflows across Photoshop, Audacity (for databending), custom scripts, and web toys. None of these are designed for composition — they process a single image. And none of them embrace the creative tension between structure and chaos that defines the best glitch art.

## The Vision

GLITCH is a canvas-based composition tool for artists and designers. You start with a typographic grid — the kind Muller-Brockmann and Armin Hofmann wrote about — and fill it with images, text, colors, shapes, and generative patterns. Then you destroy it, selectively and deliberately, with a deep library of glitch effects.

The grid provides structure. The effects provide chaos. The artist curates the tension between them.

### What makes this different from Canva

Canva is a template tool for non-designers. GLITCH is a creation tool for artists. The differences:

- **Grids, not templates.** You don't pick a finished layout and swap content. You choose a compositional structure and build within (and beyond) it.
- **Destruction as a first-class creative act.** Effects aren't filters you apply at the end. They're part of the composition from the start — per-frame and global.
- **Embraced chaos.** The tool actively generates surprises. You lock what you love and re-roll what you don't. The tool is a collaborator, not just an instrument.

### What makes this different from glitch tools

Existing glitch tools (ImageGlitcher, Glitchet, etc.) are single-image processors. GLITCH is different:

- **Multi-element composition.** Multiple images, text, shapes, and generative content on one canvas.
- **Grid-based layout.** Compositional quality by default.
- **Per-frame effect chains.** One frame can have heavy pixel sorting while the adjacent frame is clean typography.
- **AI image generation.** Create content from text prompts without leaving the app.

---

## Core Concepts

### 1. The Grid

Every composition starts with a grid. The grid selection is the first creative decision.

- Inspired by Swiss/International Typographic Style (Muller-Brockmann, Hofmann, Ruder)
- Includes classic layouts: single cell, 2x2, 3x3, golden ratio, asymmetric editorial, modular grids
- **The grid is a snap/alignment guide, not a data structure.** Grid lines are visible on the canvas. Elements snap to them by default, but the user can place elements anywhere.

### 2. Frames

The primary object on the canvas is a **frame** — a bounding box that contains content, like a Figma frame.

- The user draws a rectangle on the canvas to create a frame
- Frames snap to grid lines by default, or can be placed freely
- Frames can overlap, stack, and be reordered in a layer hierarchy
- Each frame holds one content type and has its own independent effect chain

**Content types:**

| Content Type | Description |
|---|---|
| **Imported image** | Upload from device (drag-drop, file picker, clipboard paste) |
| **AI-generated image** | Text prompt via Nano Banana Pro, with iterative refinement |
| **Solid color** | Flat color fill |
| **Text** | Typography with font, size, weight, alignment controls |
| **Generative pattern** | Noise fields, geometric patterns, gradients |
| **Vector shape** | Circle, square, triangle, rectangle — basic SVG primitives |

A frame is: `{ x, y, width, height, content, effectChain, locked, layerOrder }`

### 3. Effect System

Effects are applied at two levels:

- **Per-frame**: Each frame has its own independent effect chain. A photo can be pixel-sorted while an adjacent text frame stays clean.
- **Global**: Post-processing effects applied over the entire composed canvas. Scanlines, CRT simulation, noise overlays that unify the composition.

The existing 20+ effect library carries forward: channel shift, pixel sort, databend, CRT simulation, posterize, scanlines, wave distortion, dither, datamosh, JPEG artifacts, etc.

### 4. Lock and Re-roll

The core creative loop:

1. **Build** — choose a grid, draw frames, fill with content, apply effects
2. **Mutate** — the tool generates variations of unlocked elements
3. **Curate** — lock what you love, re-roll what you don't
4. **Refine** — deep parameter control to push the piece exactly where you want it

Mutations are AI-powered and coherent — they understand the aesthetic direction and vary within it, rather than producing random noise.

### 5. AI Integration

AI plays two essential roles, both as background utilities (not front-and-center):

- **Interpreter**: Natural language to effect chains and parameters. "Make it look like a corrupted VHS tape" translates into specific effects and values. Already built as PromptBar.
- **Mutator**: Powers the lock-and-reroll workflow. Generates coherent variations that respect the current aesthetic direction.

AI-generated images via Nano Banana Pro are a content source within frames. The user can iteratively refine the prompt ("make the mountain more dramatic") while effects remain applied — the glitched result updates as the source image changes.

---

## Interaction Model

### Hybrid Manipulation
- **Direct manipulation** for layout and composition: drag elements, resize cells, reposition content
- **Parameter controls** for effects and aesthetics: sliders, knobs, dropdowns for effect chains

### Embraced Chaos
The tool is a collaborator, not just an instrument. Some effects are intentionally unpredictable. The artist's job is to find the interesting accidents and amplify them.

### Deliberate Crafting
This is a tool for making finished pieces in 10-30 minute sessions. Deep parameter control, fine-tuning, precise composition. Quality over speed. Not a "one-click filter" app.

---

## Target User

Artists and designers making finished pieces:
- Album covers and music artwork
- Posters and prints
- Digital art and social media visuals
- Editorial and zine design

People who care about composition, who have opinions about grids, and who see destruction as a creative act.

---

## Output

Digital-first:
- Preset sizes for social media (Instagram square, story, Twitter header, etc.)
- Custom dimensions
- PNG / JPG / WebP export
- Web-ready resolution

---

## What Exists Today

The current codebase is a working single-image effect processor:
- Vite + React + TypeScript + Tailwind
- WebGL2 renderer with ping-pong framebuffers
- 20+ GPU and CPU effects with a unified registry
- Mixed GPU/CPU pipeline with proper segment chaining
- Zustand store with undo/redo
- Preset system (built-in + user presets)
- Prompt bar for AI interpretation
- Effect browser, chain, and parameter controls

This is the foundation. The architecture needs to evolve from "single image pipeline" to "multi-element canvas with per-element pipelines and a global post-process pass."
