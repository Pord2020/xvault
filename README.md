<div align="center">
  <img src="public/logo.svg" alt="Siftly" width="80" height="80" />

  <h1>Siftly</h1>

  <p><strong>Self-hosted Twitter/X bookmark manager with AI-powered organization</strong></p>

  <p>
    Import · Analyze · Categorize · Search · Explore
  </p>

  <p>
    <img src="https://img.shields.io/badge/Next.js-15-black?style=flat-square&logo=next.js" alt="Next.js 15" />
    <img src="https://img.shields.io/badge/TypeScript-5-blue?style=flat-square&logo=typescript" alt="TypeScript" />
    <img src="https://img.shields.io/badge/SQLite-local-green?style=flat-square&logo=sqlite" alt="SQLite" />
    <img src="https://img.shields.io/badge/Tailwind-v4-38bdf8?style=flat-square&logo=tailwindcss" alt="Tailwind CSS" />
    <img src="https://img.shields.io/badge/license-MIT-yellow?style=flat-square" alt="MIT License" />
  </p>
</div>

---

## What is Siftly?

Siftly turns your Twitter/X bookmark dump into a **searchable, categorized, visual knowledge base** — all running locally on your machine. No cloud, no subscriptions, no data leaving your device (except AI API calls you control).

It runs a **4-stage AI pipeline** on your bookmarks:

```
📥 Import JSON
    ↓
🔍 Vision Analysis      — reads text, objects, and context from every image/GIF/video thumbnail
    ↓
🏷️  Entity Extraction   — mines hashtags, URLs, mentions from raw tweet data (free, no API calls)
    ↓
🧠 Semantic Tagging     — generates 30–50 searchable tags per bookmark for AI-powered search
    ↓
📂 Categorization       — assigns each bookmark to 1–3 categories with confidence scores
```

After the pipeline runs, you get:
- **AI search** — find bookmarks by meaning, not just keywords ("funny meme about crypto crashing")
- **Interactive mindmap** — explore your entire bookmark graph visually
- **Filtered browsing** — filter by category, media type, date
- **Export tools** — download media, export as CSV/JSON/ZIP

---

## Features

### 📥 Import
- Upload a JSON export from the [twitter-web-exporter](https://github.com/prinsss/twitter-web-exporter) browser extension
- Auto-detects and deduplicates bookmarks on re-import
- Stores full raw tweet JSON for zero-cost entity extraction later

### 🤖 AI Pipeline (4 stages)
| Stage | What it does | Cost |
|-------|-------------|------|
| **Vision** | Analyzes every image, GIF, and video thumbnail using Claude's vision model. Extracts OCR text, objects, scene, mood, meme templates, and 30–40 visual tags | ~$0.001/image |
| **Entities** | Mines hashtags, URLs, @mentions, and known tool names from stored tweet JSON | Free |
| **Semantic Tags** | Generates 30–50 precise search tags per bookmark combining text + image context | ~$0.0005/bookmark |
| **Categorize** | Assigns 1–3 categories per bookmark with confidence scores | ~$0.0001/bookmark |

**Estimated total cost for 1,000 bookmarks with 600 images: ~$1.50**

### 🔍 AI Search
- Natural language search: *"react hooks tutorial"*, *"bitcoin price chart"*, *"funny programmer meme"*
- Searches tweet text, image OCR, visual tags, semantic tags, and categories simultaneously
- Results ranked by relevance

### 🗺️ Mindmap
- Interactive force-directed graph of all bookmarks organized by category
- Expand/collapse categories
- Click any node to open the tweet on X

### 📚 Browse & Filter
- Grid/list view with lazy-loaded media
- Filter by category, media type (photo/video/GIF), date range
- Sort by newest, oldest, or most relevant

### ⚙️ Categories
- 8 default categories: Funny Memes, AI Resources, Dev Tools, Design, Finance & Crypto, Productivity, News, General
- Each category has rich AI-readable descriptions for accurate classification
- Color-coded with confidence scores per assignment

### 📤 Export
- Download individual images and videos
- Export entire categories as ZIP archives
- Export all data as CSV or JSON

---

## Quick Start

### Prerequisites
- Node.js 18+
- An [Anthropic API key](https://console.anthropic.com) (for AI features — optional, browsing works without it)

### 1. Clone & Install

```bash
git clone https://github.com/yourusername/siftly.git
cd siftly
npm install
```

### 2. Set Up Database

```bash
npx prisma db push
```

This creates a local SQLite database at `prisma/dev.db`. No external database needed.

### 3. Configure Environment

```bash
cp .env.example .env.local
```

Edit `.env.local`:

```env
# Required
DATABASE_URL="file:./prisma/dev.db"

# Required for AI features (get yours at console.anthropic.com)
ANTHROPIC_API_KEY=sk-ant-...

# Optional: use a custom API endpoint (e.g. for proxies or local models)
# ANTHROPIC_BASE_URL=http://localhost:8318
```

### 4. Run

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000)

---

## Usage Guide

### Step 1: Import Bookmarks

1. Install the [twitter-web-exporter](https://github.com/prinsss/twitter-web-exporter) Chrome/Firefox extension
2. Go to [x.com/bookmarks](https://x.com/bookmarks) and scroll to load all bookmarks
3. Click the extension → **Export as JSON**
4. In Siftly, go to **Import** and upload the JSON file

> **Tip:** You can re-import the same file safely — duplicates are automatically skipped.

### Step 2: Run AI Categorization

1. Go to **Categorize** in the sidebar
2. Add your Anthropic API key in **Settings** (or set `ANTHROPIC_API_KEY` in `.env.local`)
3. Click **Start AI Categorization**

The pipeline runs 4 stages automatically. You can stop and resume anytime — it picks up where it left off.

> **Re-run:** Click "Re-run everything (force all)" to re-analyze bookmarks that were already processed.

### Step 3: Search & Explore

- Use **AI Search** to find bookmarks by natural language description
- Use **Browse** to filter by category or media type
- Use **Mindmap** to visually explore your knowledge graph

---

## Configuration

All settings can be managed in the **Settings** page at `/settings`, or via environment variables:

| Setting | Env Var | Description |
|---------|---------|-------------|
| Anthropic API Key | `ANTHROPIC_API_KEY` | Required for AI features |
| API Base URL | `ANTHROPIC_BASE_URL` | Custom endpoint (proxy, local model) |
| AI Model | Settings page | Choose which model to use for analysis |
| Database | `DATABASE_URL` | SQLite file path |

### Using a Custom API Endpoint

Siftly works with any OpenAI-compatible proxy or local model server. Set `ANTHROPIC_BASE_URL` to point to your endpoint:

```env
ANTHROPIC_BASE_URL=http://127.0.0.1:8318
```

This is useful for:
- OAuth-based access (e.g. Claude's X/Twitter OAuth proxy)
- Rate-limit management proxies
- Local Anthropic-compatible model servers

---

## Architecture

```
siftly/
├── app/                          # Next.js App Router pages
│   ├── api/
│   │   ├── bookmarks/            # Bookmark CRUD + search
│   │   ├── categorize/           # AI pipeline orchestration
│   │   ├── categories/           # Category management
│   │   ├── mindmap/              # Graph data for visualization
│   │   ├── search/ai/            # AI semantic search
│   │   └── settings/             # User settings
│   ├── bookmarks/                # Browse page
│   ├── categorize/               # AI pipeline UI
│   ├── import/                   # Import page
│   ├── mindmap/                  # Interactive graph
│   └── settings/                 # Configuration
│
├── components/
│   ├── nav.tsx                   # Sidebar navigation
│   ├── bookmark-card.tsx         # Bookmark display card
│   ├── category-card.tsx         # Category display
│   └── command-palette.tsx       # Ctrl+K search
│
├── lib/
│   ├── categorizer.ts            # AI categorization logic + prompts
│   ├── vision-analyzer.ts        # Image analysis + semantic enrichment
│   ├── rawjson-extractor.ts      # Zero-cost entity extraction from raw JSON
│   └── db.ts                     # Prisma client singleton
│
└── prisma/
    └── schema.prisma             # Database schema
```

### Database Schema

```
Bookmark          — tweet text, author, date, raw JSON, semantic tags, enrichment timestamp
  └── MediaItem   — images/videos/GIFs with AI-generated image tags
  └── BookmarkCategory — category assignments with confidence scores

Category          — name, slug, color, description
Setting           — key-value store for API keys and model preferences
```

---

## Tech Stack

| Technology | Role |
|------------|------|
| [Next.js 15](https://nextjs.org) | Full-stack React framework (App Router) |
| [TypeScript](https://www.typescriptlang.org) | Type safety throughout |
| [Prisma 7](https://www.prisma.io) | ORM for SQLite |
| [SQLite](https://sqlite.org) | Local database — no setup required |
| [Tailwind CSS v4](https://tailwindcss.com) | Styling |
| [Anthropic API](https://anthropic.com) | Vision analysis, semantic tagging, categorization |
| [React Flow](https://reactflow.dev) | Interactive mindmap graph |
| [Radix UI](https://www.radix-ui.com) | Accessible UI primitives |
| [Lucide React](https://lucide.dev) | Icons |

---

## Development

```bash
# Install dependencies
npm install

# Generate Prisma client
npx prisma generate

# Push schema to database
npx prisma db push

# Run development server
npm run dev

# Type check
npx tsc --noEmit

# Open Prisma Studio (database GUI)
npx prisma studio
```

### Adding Categories

Edit the `DEFAULT_CATEGORIES` array in `lib/categorizer.ts`. Each category needs:
- `name` — display name
- `slug` — URL-safe identifier
- `color` — hex color for the UI
- `description` — natural language description used in AI prompts (the more detailed, the better)

---

## Contributing

Contributions are welcome! Please read [CONTRIBUTING.md](CONTRIBUTING.md) for guidelines.

**Good first issues:**
- Add more known tool domains to `KNOWN_TOOL_DOMAINS` in `lib/rawjson-extractor.ts`
- Add more default categories in `lib/categorizer.ts`
- Improve the AI prompts for better categorization accuracy
- Add support for additional import formats

---

## Privacy

- All data is stored **locally** in a SQLite file on your machine
- The only external calls are to the Anthropic API (image data + tweet text for analysis)
- No telemetry, no tracking, no accounts
- Your bookmarks never touch any third-party server except Anthropic's API

---

## License

MIT — see [LICENSE](LICENSE)

---

<div align="center">
  <p>Built with ❤️ for people who actually use their bookmarks</p>
</div>
