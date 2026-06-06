// services/documentService.js — parse uploaded files, store content
const fs = require('fs-extra');
const path = require('path');
const pdf = require('pdf-parse');
const { v4: uuidv4 } = require('uuid');

// In-memory store: { documentId: { id, filename, text, chunks, uploadedAt } }
// Replace with a real DB (PostgreSQL / MongoDB) in production
const documentStore = new Map();

/**
 * Split text into overlapping chunks for RAG retrieval.
 * chunkSize: tokens (approximate — 1 token ≈ 4 chars)
 * overlap:   chars to repeat between chunks for context continuity
 */
function chunkText(text, chunkSize = 800, overlapChars = 100) {
  const chunks = [];
  let start = 0;
  while (start < text.length) {
    const end = Math.min(start + chunkSize * 4, text.length);
    chunks.push(text.slice(start, end).trim());
    start = end - overlapChars;
    if (start >= text.length) break;
  }
  return chunks.filter(c => c.length > 20);
}

/**
 * Extract raw text from the uploaded file.
 */
async function extractText(filePath, mimetype) {
  if (mimetype === 'application/pdf') {
    const buffer = await fs.readFile(filePath);
    const data = await pdf(buffer);
    return data.text;
  }
  // Plain text / markdown
  return fs.readFile(filePath, 'utf8');
}

/**
 * Process an uploaded file — extract text, chunk it, store it.
 * Returns { documentId, chunkCount, preview }
 */
async function processDocument(file) {
  const text = await extractText(file.path, file.mimetype);
  const chunks = chunkText(text);
  const documentId = uuidv4();

  documentStore.set(documentId, {
    id: documentId,
    filename: file.originalname,
    storedPath: file.path,
    text,
    chunks,
    uploadedAt: new Date().toISOString(),
  });

  return {
    documentId,
    chunkCount: chunks.length,
    preview: text.slice(0, 200).replace(/\s+/g, ' '),
  };
}

/**
 * Get the full text of a document for LLM context.
 * Truncated to ~6000 chars to fit within a context window.
 */
function getDocumentContext(documentId, maxChars = 6000) {
  const doc = documentStore.get(documentId);
  if (!doc) return null;
  return doc.text.slice(0, maxChars);
}

/**
 * Simple keyword search across chunks (used when no vector DB is configured).
 */
function searchChunks(documentId, query, topK = 3) {
  const doc = documentStore.get(documentId);
  if (!doc) return [];

  const words = query.toLowerCase().split(/\s+/);
  const scored = doc.chunks.map((chunk, i) => {
    const lower = chunk.toLowerCase();
    const score = words.reduce((acc, w) => acc + (lower.includes(w) ? 1 : 0), 0);
    return { index: i, score, text: chunk };
  });

  return scored
    .filter(c => c.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, topK)
    .map(c => c.text);
}

/**
 * List all stored documents (id, filename, uploadedAt)
 */
function listDocuments() {
  return Array.from(documentStore.values()).map(({ id, filename, uploadedAt, chunkCount }) => ({
    id, filename, uploadedAt, chunkCount: chunkCount || 0,
  }));
}

module.exports = { processDocument, getDocumentContext, searchChunks, listDocuments };
