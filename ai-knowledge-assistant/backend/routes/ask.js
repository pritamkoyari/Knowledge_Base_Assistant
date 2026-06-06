// routes/ask.js — POST /api/ask
const express = require('express');
const router = express.Router();
const n8nService = require('../services/n8nService');
const llmService = require('../services/llmService');
const contextService = require('../services/contextService');

/**
 * POST /api/ask
 * Body: { query, sessionId?, useN8n?, documentId? }
 *
 * Flow:
 *   1. Load conversation context for sessionId
 *   2. If useN8n=true  → send to n8n webhook, return its response
 *   3. If useN8n=false → call LLM directly (for simple queries)
 */
router.post('/ask', async (req, res) => {
  const { query, sessionId, useN8n = true, documentId } = req.body;

  if (!query || typeof query !== 'string' || !query.trim()) {
    return res.status(400).json({ error: 'query field is required and must be a non-empty string.' });
  }

  const sid = sessionId || 'default';

  try {
    // 1. Load previous context (last 10 turns)
    const history = contextService.getHistory(sid);

    if (useN8n) {
      // ── Path A: Full n8n orchestration ──────────────────────
      const n8nPayload = {
        query: query.trim(),
        sessionId: sid,
        documentId: documentId || null,
        history,          // passed so n8n can build the prompt with context
        timestamp: new Date().toISOString(),
      };

      const n8nResponse = await n8nService.sendToN8n(n8nPayload);

      // Persist the new turn in context memory
      contextService.addTurn(sid, query, n8nResponse.answer || n8nResponse.message || '');

      return res.json({
        success: true,
        sessionId: sid,
        query,
        answer: n8nResponse.answer || n8nResponse.message,
        intent: n8nResponse.intent,
        actions: n8nResponse.actions || [],
        source: 'n8n',
        timestamp: new Date().toISOString(),
      });

    } else {
      // ── Path B: Direct LLM (no workflow orchestration) ──────
      const answer = await llmService.ask(query.trim(), history);
      contextService.addTurn(sid, query, answer);

      return res.json({
        success: true,
        sessionId: sid,
        query,
        answer,
        intent: 'direct',
        actions: [],
        source: 'direct-llm',
        timestamp: new Date().toISOString(),
      });
    }

  } catch (err) {
    console.error('[/api/ask] Error:', err.message);
    return res.status(500).json({
      error: 'Failed to process query.',
      details: err.message,
    });
  }
});

/**
 * DELETE /api/ask/context/:sessionId
 * Clear the conversation history for a session
 */
router.delete('/ask/context/:sessionId', (req, res) => {
  contextService.clearHistory(req.params.sessionId);
  res.json({ success: true, message: 'Context cleared.' });
});

module.exports = router;
