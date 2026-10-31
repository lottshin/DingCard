<div align="center">
  <h1><img src="public/favicon.svg" width="40" height="40" alt="DingCard icon" align="absmiddle"> DingCard 叮卡</h1>
  <p><strong>Long reads become card sets on their own; posters are laid out freely.</strong></p>
  <p>An open-source editor for social cards, posters and slide decks that runs in the browser. AI clients use the same document model, checks and export through MCP, and whatever they make opens in the editor for a person to keep working on.</p>
  <p>
    <a href="README.md">中文</a> ·
    <a href="https://dingcard.vercel.app"><strong>Live demo</strong></a> ·
    <a href="https://dingcard.pages.dev">Product page</a> ·
    <a href="docs/mcp.md">MCP docs</a> ·
    <a href="docs/deployment.md">Deployment</a> ·
    <a href="CHANGELOG.md">Changelog</a>
  </p>
  <p>
    <a href="CHANGELOG.md"><img src="https://img.shields.io/github/v/tag/lottshin/DingCard?label=version&amp;color=e2570f" alt="DingCard version"></a>
    <a href="https://github.com/lottshin/DingCard/actions/workflows/ci.yml"><img src="https://github.com/lottshin/DingCard/actions/workflows/ci.yml/badge.svg" alt="GitHub CI"></a>
    <a href="https://www.npmjs.com/package/dingcard-mcp"><img src="https://img.shields.io/npm/v/dingcard-mcp?label=dingcard-mcp&amp;color=cb3837" alt="dingcard-mcp on npm"></a>
    <a href="https://dingcard.vercel.app"><img src="https://img.shields.io/badge/demo-online-2f855a" alt="Live demo"></a>
    <a href="LICENSE"><img src="https://img.shields.io/badge/license-MIT-555555" alt="MIT license"></a>
  </p>
</div>

![The DingCard freeform canvas: a music festival poster with its title selected and the toolbar above it showing font, size, alignment, opacity, position and layer order](docs/assets/freeform-canvas.webp)

<p align="center"><strong>88</strong> templates · <strong>22</strong> MCP tools · <strong>8</strong> preset sizes · <strong>MIT</strong> licensed</p>

The interface comes in Chinese and English (switch at the top right). The documentation linked below is written in Chinese.

## Freeform canvas

**Select anything and edit it where it is.** Text, images, shapes, lines, icons, charts, tables, timelines and QR codes share one canvas; every page of a multi-page design can have its own size.

- **Text**: bold, colour, highlight or underline just the selected words; 16 text styles in one click (neon, outline, 3D, label backgrounds…); import your own fonts (TTF / OTF / WOFF / WOFF2) and the canvas and every export use them.
- **Images**: in crop mode, move the picture inside its frame, drag the eight black handles or resize the frame in proportion; add rounded corners, frames and filters. With the server deployed, the image drawer searches stock photos you may use commercially.
- **Assets**: 97 searchable line icons and 48 hand-drawn lines, stickers and labels; bar, ring, line and radar charts, with data pasted a whole column at a time from a spreadsheet.
- **Styles**: give a whole set a new palette or font pairing in one click; change one colour or font and "Replace all" changes it everywhere in the set.
- **Layers**: rename, reorder, group, hide and lock.
- **Export and share**: PNG, JPG and PDF, for the current page or all of them as a ZIP, one PDF, one long image or a 3×3 Moments grid. With the server deployed, a share link opens the set on a phone (scan the QR code) where each image can be saved with a long press.

## Markdown long reads

**One article, paginated to the card size as you type.** Paste Markdown on the left; the right side lays it out live at RedNote, Weibo or Twitter sizes. `---` forces a page break, and a heading is never left alone at the foot of a page. Pasted pictures can be resized right in the preview.

Nine looks for long reads: Column, Notes, Letter, Midnight, Aurora, Doc, Rice paper, Swiss and Journal. Each has its own running head, folios, heading levels, quotes, lists, to-dos, code and tables, and switching looks never touches the text.

![The DingCard Markdown workbench: the source on the left, the looks panel listing nine looks, and the Midnight look paginated on the right](docs/assets/markdown-looks.webp)

## Templates

**88 templates, all maintained in this repository.**

- **9 Markdown looks** for long reads.
- **8 three-page deck series** on the freeform canvas: Editorial, Checklist, Signal, Night Flight, Brutalist and Blueprint, plus the 16:9 presentation decks Spotlight and Thesis defense. Each has a cover, an inner page and an ending; when MCP builds a whole set, inner pages turn into statement, list, data or closing pages to fit their content.
- **71 single-page templates** in 8 sizes: RedNote 3:4, story 9:16, square 1:1, landscape 16:9, WeChat header 2.35:1, A4 portrait and landscape, and the 3×3 Moments grid. Covers and posters, menus and price lists, certificates, résumés and notices, festivals, seasons, invitations and greeting cards.

The template center searches names, tags, uses and styles, then filters by size, style, colour and favourites; every template is shown at its own ratio, with all its pages and similar templates before you use it. Inside the editor, templates can also be added to the current design one page at a time. Made a good-looking layout? Send it as a pull request following [Contributing templates](docs/templates.md), and everyone gets it once it is merged.

![The DingCard template center: search, categories by use, filters by size, style and colour, each template at its own ratio](docs/assets/template-center.png)

## MCP automation

**AI clients produce finished card sets directly.** The stdio MCP server `dingcard-mcp` is published on npm with 22 tools and listed in the official MCP Registry as `io.github.lottshin/dingcard`. Checking, editing and rendering share their code with the editor; tools pass a `documentId` between them, and images can be local file paths. Add this to your MCP client's configuration:

```json
{
  "mcpServers": {
    "dingcard": { "command": "npx", "args": ["-y", "dingcard-mcp"] }
  }
}
```

It needs Node.js 22 or later and Google Chrome installed on the machine (for checks and renders). Tool descriptions are written in Chinese.

| Tool | What it does |
|---|---|
| `list_templates` | Lists templates with their size, use and style, and how much content each holds |
| `create_document_from_content` | Builds a whole card set from your content, replacing every sample text in the template |
| `check_document` | Checks the pages as they will export: clipped or overlapping text, low contrast, leftover sample text and large empty bands; text that does not fit is shrunk |
| `render_document` | Renders headlessly to a PNG or JPG per page, one PDF, one long image or a 3×3 grid |
| `open_in_editor` | Opens the design in the DingCard editor for a person to finish |

Other tools build a set from an outline, make a single poster, turn HTML into an editable design, add template pages, place decorations, search and import stock photos, create share links, read and save projects on a DingCard server, and render Markdown long reads. The full list, client setup and security boundaries are in the [MCP docs](docs/mcp.md). A `.json` document made by an AI can also be dragged into My projects and opened in the editor.

### Example: Yamatsuki, an indigo-dye poster

<p align="center">
  <img src="docs/assets/yamatsuki-poster.png" width="34%" alt="Yamatsuki indigo-dye poster: a gradient night sky, a moon halo, three layers of ridges and ripples on a lake, made only of shapes and lines">
  <img src="docs/assets/yamatsuki-anatomy.png" width="34%" alt="Anatomy of the poster: the stacked moon halo, the three ridge layers, the ripple control points and the multi-stop gradients">
</p>

Drawn through MCP without a single image: 54 shapes, 46 lines, 5 texts and 9 multi-stop gradients. The moon halo is a stack of blurred concentric ellipses, the ridges are three silhouettes that darken as they come closer, and the ripples on the lake are separate lines (the red dots on the right are their control points). The whole document is [docs/assets/yamatsuki-poster.json](docs/assets/yamatsuki-poster.json); drag it into My projects to take it apart.

## Use and deploy

### Online

Open the [live demo](https://dingcard.vercel.app); no account is needed. Work saves itself in the current browser, so export anything important.

For an address of your own, deploy to Vercel in one click. No environment variables are needed, and work is again kept in each visitor's browser.

<a href="https://vercel.com/new/clone?repository-url=https%3A%2F%2Fgithub.com%2Flottshin%2FDingCard"><img src="https://vercel.com/button" alt="Deploy with Vercel"></a>

### Docker

For real accounts, sync across devices, server-side images and share links, deploy the full app with its Fastify + SQLite backend. Prebuilt images for `linux/amd64` and `linux/arm64` are on GHCR as `ghcr.io/lottshin/dingcard`, and `DINGCARD_VERSION` in `.env.example` pins a published release. On a Linux server with Git, Docker Engine, Docker Compose and OpenSSL:

```bash
git clone https://github.com/lottshin/DingCard.git
cd DingCard

cp .env.example .env
JWT_SECRET="$(openssl rand -hex 32)"
sed -i "s/^JWT_SECRET=.*/JWT_SECRET=${JWT_SECRET}/" .env
unset JWT_SECRET

docker compose pull
docker compose up -d --no-build
curl -f http://127.0.0.1:8080/api/health
```

Once the health check answers `{"ok":true}`, open DingCard at `http://<server>:8080`. Domains, HTTPS, backups, upgrades, stock photos and building from source are covered in the [deployment guide](docs/deployment.md).

### Where your work lives

The demo and local runs use local mode (LocalStore): accounts and work stay in the current browser and go away with its site data. A deployed server is server mode (RemoteStore): accounts and work live on the server and sync across devices. The two are separate; switching modes does not move existing accounts, work or images.

## Local development

You need Git, Node.js 22+ and npm, but no backend:

```bash
git clone https://github.com/lottshin/DingCard.git
cd DingCard
npm ci
npm run dev
```

Test commands, running against a local server and storage details are in the [development guide](docs/development.md).

## Documentation (in Chinese)

- [Product page](https://dingcard.pages.dev)
- [Freeform data model and interactions](docs/freeform-editor.md)
- [Contributing templates](docs/templates.md)
- [MCP automation](docs/mcp.md)
- [Development guide](docs/development.md)
- [Docker deployment and maintenance](docs/deployment.md)
- [Backend design](docs/backend-plan.md)
- [Changelog](CHANGELOG.md)

Built with React, TypeScript and Vite; the backend is Fastify + SQLite. Released under the [MIT](LICENSE) license.
