# AI Knowledge Assistant

An AI-powered assistant that answers questions from uploaded documents, performs intent-based actions, and orchestrates multi-step workflows using **n8n**.

---

## Architecture

```
Client (Browser/API)
        │
        ▼  POST /api/ask  |  POST /api/upload
┌───────────────────┐
│  Express Backend  │  (Node.js)
│  • Rate limiting  │
│  • Context memory │
│  • PDF parsing    │
└────────┬──────────┘
         │ Webhook call
         ▼
┌──────────────────────────────────────────────────┐
│              n8n Workflow Engine                 │
│  1. Parse & classify intent                      │
│  2. Route: answer / summarise / extract / action │
│  3. Call OpenAI (via HTTP node)                  │
│  4. Branch: save to log OR send email            │
│  5. Respond to webhook                           │
└──────────────────────────────────────────────────┘
         │
         ▼
┌──────────────────┐     ┌──────────────────────┐
│  OpenAI GPT-4o   │     │  Optional: Pinecone   │
│  (LLM + embeds)  │     │  (Vector RAG search)  │
└──────────────────┘     └──────────────────────┘
```

---

## Quick Start

### 1. Clone and install

```bash
git clone https://github.com/yourname/ai-knowledge-assistant
cd ai-knowledge-assistant/backend
npm install
```

### 2. Configure environment

```bash
cp .env.example .env
# Edit .env — add your OPENAI_API_KEY at minimum
```

### 3. Install and run n8n

```bash
# Option A: npx (no install needed)
npx n8n

# Option B: global install
npm install -g n8n
n8n start
```

n8n will open at **http://localhost:5678**

### 4. Import the workflow

1. Open n8n → **Workflows → Import from file**
2. Select `n8n/workflow.json`
3. Click **Save** then **Activate**
4. Copy the webhook URL (shown in the Webhook Trigger node) and paste into `.env`:
   ```
   N8N_WEBHOOK_URL=http://localhost:5678/webhook/ai-assistant
   ```

### 5. Add OpenAI key to n8n environment

In n8n Settings → **Environment Variables**, add:
```
OPENAI_API_KEY = sk-your-key-here
```

### 6. Start the backend

```bash
npm run dev
```

Backend runs at **http://localhost:3000**

---

## API Reference

### POST /api/ask

Ask the assistant a question.

```bash
curl -X POST http://localhost:3000/api/ask \
  -H "Content-Type: application/json" \
  -d '{
    "query": "Summarize this document and email me the key points",
    "sessionId": "user-123",
    "useN8n": true
  }'
```

**Response:**
```json
{
  "success": true,
  "sessionId": "user-123",
  "query": "Summarize this document...",
  "answer": "The document covers...",
  "intent": "summarise",
  "keyPoints": ["Point 1", "Point 2"],
  "actions": [],
  "source": "n8n",
  "timestamp": "2025-01-01T12:00:00.000Z"
}
```

### POST /api/upload

Upload a PDF or text file.

```bash
curl -X POST http://localhost:3000/api/upload \
  -F "file=@/path/to/document.pdf"
```

**Response:**
```json
{
  "success": true,
  "documentId": "uuid-here",
  "filename": "document.pdf",
  "chunkCount": 12,
  "preview": "First 200 characters of extracted text..."
}
```

Then reference it in `/ask`:
```json
{ "query": "What are the main risks?", "documentId": "uuid-here" }
```

### GET /api/health
Returns server status.

### DELETE /api/ask/context/:sessionId
Clears conversation memory for a session.

---

## Prompt Engineering Strategy

### Role-based system prompt
The LLM is always given a strict system persona: "You are an AI Knowledge Assistant." This anchors the model's role and prevents scope drift.

### Structured JSON output
All LLM calls use `response_format: { type: "json_object" }` (OpenAI's JSON mode). The system prompt specifies the exact schema:
```json
{
  "intent": "answer|summarise|extract|action",
  "answer": "string",
  "keyPoints": [],
  "extractedData": {},
  "confidence": 0.0-1.0,
  "suggestedActions": []
}
```
This eliminates hallucinated formatting and makes responses reliably parseable.

### Context window management
The last 8 conversation turns are sent as the `messages` array. Older history is trimmed. Documents are truncated to 6,000 characters. This keeps token usage low while maintaining conversational coherence.

### Temperature tuning
- `0.3` for answer/summarise — factual, consistent
- `0.2` for extract/action — highly deterministic
- `0.7+` is never used (would increase hallucination risk)

### Intent classification (two-stage)
1. **Fast keyword pre-filter** in the n8n Code node (regex, ~0ms)
2. **LLM refinement** on the next call for accuracy

This means simple "answer" queries never hit the slower action-branch logic.

---

## Bonus: Enabling RAG (Vector Search)

1. Create a free [Pinecone](https://pinecone.io) index (dimension: 1536)
2. Add your keys to `.env`
3. In `documentService.js`, after chunking, call `llmService.getEmbedding(chunk)` and upsert to Pinecone
4. In `ask.js`, before calling the LLM, query Pinecone with the query embedding and inject the top-3 chunks as document context

---

## Project Structure

```
ai-knowledge-assistant/
├── backend/
│   ├── server.js              # Express entry point
│   ├── .env.example           # Environment variable template
│   ├── package.json
│   ├── routes/
│   │   ├── ask.js             # POST /api/ask
│   │   ├── upload.js          # POST /api/upload
│   │   └── health.js          # GET /api/health
│   ├── services/
│   │   ├── llmService.js      # OpenAI integration
│   │   ├── n8nService.js      # n8n webhook client
│   │   ├── documentService.js # PDF parsing + chunking
│   │   └── contextService.js  # Session memory
│   └── uploads/               # Temporary uploaded files
└── n8n/
    └── workflow.json          # Import this into n8n
```

---

## Estimated Setup Time

| Task | Time |
|------|------|
| Install dependencies + n8n | 10 min |
| Import workflow + configure | 10 min |
| Add API keys | 5 min |
| First test query | 5 min |
| **Total** | **~30 min** |
