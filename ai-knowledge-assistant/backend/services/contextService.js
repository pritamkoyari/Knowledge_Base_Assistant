// services/contextService.js — per-session conversation memory
// Stores { sessionId -> [{role, content, timestamp}] }
// Replace with Redis in production for multi-instance support

const sessions = new Map();
const MAX_TURNS = 20;           // per session
const SESSION_TTL_MS = 2 * 60 * 60 * 1000; // 2 hours

// Periodic cleanup — remove sessions older than TTL
setInterval(() => {
  const now = Date.now();
  for (const [id, data] of sessions) {
    if (now - data.lastAccess > SESSION_TTL_MS) {
      sessions.delete(id);
    }
  }
}, 15 * 60 * 1000); // run every 15 minutes

function getOrCreate(sessionId) {
  if (!sessions.has(sessionId)) {
    sessions.set(sessionId, { turns: [], lastAccess: Date.now() });
  }
  const s = sessions.get(sessionId);
  s.lastAccess = Date.now();
  return s;
}

/**
 * Get conversation history as an array of {role, content} objects.
 */
function getHistory(sessionId) {
  const s = getOrCreate(sessionId);
  return s.turns.map(t => ({ role: t.role, content: t.content }));
}

/**
 * Add a user + assistant turn to the session.
 */
function addTurn(sessionId, userMessage, assistantMessage) {
  const s = getOrCreate(sessionId);
  s.turns.push({ role: 'user', content: userMessage, ts: Date.now() });
  s.turns.push({ role: 'assistant', content: typeof assistantMessage === 'object'
    ? JSON.stringify(assistantMessage)
    : assistantMessage, ts: Date.now() });

  // Trim to MAX_TURNS
  if (s.turns.length > MAX_TURNS * 2) {
    s.turns = s.turns.slice(-MAX_TURNS * 2);
  }
}

/**
 * Clear a session's history.
 */
function clearHistory(sessionId) {
  sessions.delete(sessionId);
}

module.exports = { getHistory, addTurn, clearHistory };
