// routes/upload.js — POST /api/upload
const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const { v4: uuidv4 } = require('uuid');
const documentService = require('../services/documentService');

// ─── Multer config ────────────────────────────────────────────
const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, path.join(__dirname, '../uploads')),
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname);
    cb(null, `${uuidv4()}${ext}`);
  },
});

const fileFilter = (req, file, cb) => {
  const allowed = ['application/pdf', 'text/plain', 'text/markdown'];
  if (allowed.includes(file.mimetype)) {
    cb(null, true);
  } else {
    cb(new Error('Only PDF, TXT, and MD files are supported.'), false);
  }
};

const upload = multer({
  storage,
  fileFilter,
  limits: { fileSize: 10 * 1024 * 1024 }, // 10 MB max
});

/**
 * POST /api/upload
 * Form-data: file (PDF / TXT / MD)
 * Returns: { documentId, filename, chunkCount, preview }
 */
router.post('/upload', upload.single('file'), async (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: 'No file uploaded or unsupported format.' });
  }

  try {
    const result = await documentService.processDocument(req.file);

    return res.json({
      success: true,
      documentId: result.documentId,
      filename: req.file.originalname,
      size: req.file.size,
      chunkCount: result.chunkCount,
      preview: result.preview,   // first 200 chars of extracted text
      timestamp: new Date().toISOString(),
    });

  } catch (err) {
    console.error('[/api/upload] Error:', err.message);
    return res.status(500).json({ error: 'Failed to process file.', details: err.message });
  }
});

/**
 * GET /api/documents
 * List all uploaded documents (in-memory store, no DB needed for demo)
 */
router.get('/documents', (req, res) => {
  const docs = documentService.listDocuments();
  res.json({ success: true, documents: docs });
});

module.exports = router;
