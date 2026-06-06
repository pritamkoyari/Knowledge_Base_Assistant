// services/n8nService.js — sends requests to the n8n webhook
const axios = require('axios');

const N8N_WEBHOOK_URL = process.env.N8N_WEBHOOK_URL || 'http://localhost:5678/webhook/ai-assistant';
const N8N_SECRET = process.env.N8N_SECRET || '';
const TIMEOUT_MS = 30000; // 30s — n8n workflows can be slow

/**
 * Send a payload to n8n and return the parsed response.
 * Retries up to 2 times on network errors.
 */
async function sendToN8n(payload) {
  const headers = {
    'Content-Type': 'application/json',
    ...(N8N_SECRET && { 'x-n8n-secret': N8N_SECRET }),
  };

  let lastError;
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const response = await axios.post(N8N_WEBHOOK_URL, payload, {
        headers,
        timeout: TIMEOUT_MS,
      });

      // n8n returns the last node's output — normalise it
      const data = response.data;

      // Handle both array responses (n8n wraps in array) and plain objects
      const result = Array.isArray(data) ? data[0] : data;

      return {
        answer: result.answer || result.output || result.message || 'No answer returned from workflow.',
        intent: result.intent || 'unknown',
        actions: result.actions || [],
        rawN8nOutput: result,
      };

    } catch (err) {
      lastError = err;

      // Don't retry on 4xx errors (bad payload)
      if (err.response && err.response.status >= 400 && err.response.status < 500) {
        throw new Error(`n8n webhook rejected request: ${err.response.status} ${err.response.data?.message || ''}`);
      }

      if (attempt < 3) {
        console.warn(`[n8n] Attempt ${attempt} failed, retrying in ${attempt}s…`);
        await new Promise(r => setTimeout(r, 1000 * attempt));
      }
    }
  }

  // All retries exhausted — fall through to a graceful error
  console.error('[n8n] All retries failed:', lastError.message);
  throw new Error(`Could not reach n8n workflow: ${lastError.message}`);
}

module.exports = { sendToN8n };
