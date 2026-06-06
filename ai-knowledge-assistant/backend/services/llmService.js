// services/llmService.js — Google Gemini integration
const axios = require('axios');

const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const GEMINI_URL = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${GEMINI_API_KEY}`;

const SYSTEM_PROMPT = `You are an intelligent AI Knowledge Assistant.
Your role:
- Answer questions clearly using provided context or uploaded documents.
- Summarise documents when requested.
- Extract structured data when asked.
- Classify intent as: answer, summarise, extract, action, or unclear.
- Never hallucinate. If you don't know, say so.
- Always respond in valid JSON:
  {
    "intent": "answer|summarise|extract|action|unclear",
    "answer": "Your main response here",
    "keyPoints": [],
    "extractedData": {},
    "confidence": 0.0-1.0,
    "suggestedActions": []
  }`;

async function ask(query, history = [], documentContext = '') {
  // Build conversation parts
  const parts = [];

  if (documentContext) {
    parts.push({ text: `Document context:\n---\n${documentContext}\n---\n` });
  }

  // Add history
  const contents = [];
  for (const turn of history.slice(-8)) {
    contents.push({
      role: turn.role === 'assistant' ? 'model' : 'user',
      parts: [{ text: turn.content }]
    });
  }

  // Add current query
  contents.push({ role: 'user', parts: [{ text: query }] });

  const payload = {
    system_instruction: { parts: [{ text: SYSTEM_PROMPT }] },
    contents,
    generationConfig: {
      temperature: 0.3,
      maxOutputTokens: 1000,
      responseMimeType: 'application/json'  // forces JSON output
    }
  };

  let attempt = 0;
  while (attempt <= 2) {
    try {
      const response = await axios.post(GEMINI_URL, payload);
      const raw = response.data.candidates[0].content.parts[0].text;

      try {
        return JSON.parse(raw);
      } catch {
        return { intent: 'answer', answer: raw, confidence: 0.8, keyPoints: [], extractedData: {} };
      }

    } catch (err) {
      attempt++;
      if (attempt > 2) throw err;
      await new Promise(r => setTimeout(r, 1000 * attempt));
    }
  }
}

async function classifyIntent(query) {
  const payload = {
    contents: [{ role: 'user', parts: [{ text: query }] }],
    system_instruction: {
      parts: [{ text: 'Classify intent as one of: answer, summarise, extract, action, unclear. Return JSON only: {"intent":"...","confidence":0.0-1.0}' }]
    },
    generationConfig: { temperature: 0, maxOutputTokens: 50, responseMimeType: 'application/json' }
  };

  const response = await axios.post(GEMINI_URL, payload);
  return JSON.parse(response.data.candidates[0].content.parts[0].text);
}

async function getEmbedding(text) {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/text-embedding-004:embedContent?key=${GEMINI_API_KEY}`;
  const response = await axios.post(url, {
    model: 'models/text-embedding-004',
    content: { parts: [{ text: text.slice(0, 8000) }] }
  });
  return response.data.embedding.values;
}

module.exports = { ask, classifyIntent, getEmbedding };