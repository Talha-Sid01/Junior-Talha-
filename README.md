# Jr. Talha — Personal RAG Chatbot

A personal AI assistant that answers visitor questions about Talha using only facts stored in a Pinecone vector knowledge base. Two surfaces, one Next.js app:

- **`/`** (public) — Chat widget where visitors ask questions and get grounded answers
- **`/admin`** (password-protected) — Dashboard where Talha adds knowledge via plain text

## Architecture

```
PUBLIC SURFACE                          ADMIN SURFACE
app/page.tsx (chat UI)                  app/admin/page.tsx (dashboard)
       │                                       │
       ▼ fetch                                 ▼ server action
app/api/chat/route.ts                   lib/actions/ingest.ts
       │                                       │
       ▼                                       ▼
lib/agent.ts (LangGraph.js)             lib/ingest.ts
  retrieve → gate → generate/decline      chunk → embed → upsert
       │              │                       │
       ▼              ▼                       ▼
lib/vectorstore.ts (Pinecone)           lib/vectorstore.ts (Pinecone)
       │
       ▼ (generate path only)
lib/groq.ts → Groq API
```

### Key Design: Grounded, Not Creative

1. **Relevance gating** — If no Pinecone result scores above the threshold, Groq is never called. Hard code-level branch, not a prompted refusal.
2. **Schema-constrained generation** — Groq returns Zod-validated JSON with `is_grounded` flag and `sources`, never freeform prose.

## Tech Stack

| Layer | Tool |
|-------|------|
| Framework | Next.js (App Router, TypeScript) |
| UI | React + Tailwind CSS |
| Orchestration | LangGraph.js |
| LLM | Groq API (with live model resolution) |
| Embeddings | HuggingFace (`sentence-transformers/all-MiniLM-L6-v2`) |
| Vector Store | Pinecone (serverless, cosine metric) |
| Auth | bcryptjs + jose (JWT session cookies) |
| Validation | Zod |

## Setup

### 1. Clone & Install

```bash
git clone <repo-url>
cd junior-sid
npm install
```

### 2. Configure Environment

Copy the example and fill in your keys:

```bash
cp .env.example .env.local
```

| Variable | Where to get it |
|----------|----------------|
| `PINECONE_API_KEY` | [Pinecone Console](https://app.pinecone.io/) |
| `GROQ_API_KEY` | [Groq Console](https://console.groq.com/) |
| `HF_TOKEN` | [HuggingFace Settings](https://huggingface.co/settings/tokens) |
| `ADMIN_PASSWORD_HASH` | Generate locally (see below) |
| `SESSION_SECRET` | Any random 32+ character string |

### 3. Generate Admin Password Hash

```bash
node -e "require('bcryptjs').hash('your-chosen-password', 10).then(console.log)"
```

Copy the output (starts with `$2a$` or `$2b$`) into `ADMIN_PASSWORD_HASH` in `.env.local`.

**Never store the plain password in `.env.local` — only the hash.**

### 4. Run Locally

```bash
npm run dev
```

- Chat: [http://localhost:3000](http://localhost:3000)
- Admin: [http://localhost:3000/admin/login](http://localhost:3000/admin/login)

### 5. Add Knowledge

1. Log in at `/admin/login` with your password
2. Select a category (bio, skills, projects, experience, general)
3. Paste text content about Talha
4. Click "Add Knowledge" — content is chunked, embedded, and stored immediately
5. Go to `/` and ask a question — the new content is queryable right away

## Deployment

This is a single Next.js app — deploy to Vercel with:

```bash
vercel
```

Set all environment variables in the Vercel dashboard. No separate backend/frontend hosting needed.

### Rate Limiting Note

The built-in rate limiter is in-memory (10 req/min/IP), suitable for single-instance deploys. For multi-region Vercel deployments, swap to `@upstash/ratelimit` for shared state.

## Project Structure

```
├── app/
│   ├── page.tsx                  # Public chat page
│   ├── layout.tsx                # Root layout + SEO
│   ├── globals.css               # Design system
│   ├── api/chat/route.ts         # Chat API endpoint
│   └── admin/
│       ├── login/page.tsx        # Admin login
│       └── page.tsx              # Knowledge dashboard
├── components/
│   ├── ChatWidget.tsx            # Chat interface
│   └── AdminKnowledgeForm.tsx    # Knowledge form
├── lib/
│   ├── embeddings.ts             # HuggingFace embeddings
│   ├── vectorstore.ts            # Pinecone operations
│   ├── schemas.ts                # Zod schemas
│   ├── ingest.ts                 # Text chunking pipeline
│   ├── groq.ts                   # LLM integration
│   ├── agent.ts                  # LangGraph agent
│   ├── rate-limit.ts             # IP rate limiter
│   └── actions/
│       ├── login.ts              # Auth server action
│       └── ingest.ts             # Ingestion server action
├── middleware.ts                  # Admin route protection
├── .env.example                  # Env template
└── README.md
```

## Calibrating the Relevance Threshold

The default `RELEVANCE_THRESHOLD` in `lib/agent.ts` is `0.75`. Once real content is loaded:

1. Run ~10 in-domain questions and ~10 off-topic questions
2. Log the top Pinecone score for each
3. Pick a threshold that cleanly separates the two groups
4. Update the constant in `lib/agent.ts`

**Remember:** Pinecone cosine scores are **similarity** (higher = more relevant), not distance.
