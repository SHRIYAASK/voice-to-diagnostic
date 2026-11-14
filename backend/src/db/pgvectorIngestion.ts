/**
 * PGVector & Document Ingestion Service for ApplianceCare AI
 *
 * Ingests both TXT documentation and PDF manuals into:
 * 1. PostgreSQL with pgvector (when database is available)
 * 2. In-memory / filesystem cache (for resilient zero-latency fallback)
 *
 * Handles:
 * - PDF extraction for 'airconditioner-manual.pdf'
 * - TXT extraction for the 4 core service/maintenance documents
 * - Metadata tagging (audience: customer vs technician, model, document_type)
 * - 128-dimensional normalized dense vector embedding generation
 */

import fs from 'fs';
import path from 'path';
import { pool, testConnection } from './connection';
import { DocumentChunk } from '../engine/retrievalService';

// PDFParse commonjs dynamic load
const { PDFParse } = require('pdf-parse');

export interface IngestionResult {
  totalChunks: number;
  txtChunks: number;
  pdfChunks: number;
  audienceBreakdown: { customer: number; technician: number };
  pgVectorInserted: boolean;
  dbRowsCount?: number;
}

/**
 * Deterministically generates a 128-dimensional normalized dense embedding vector
 * based on token frequency and semantic hashing (cosine compatible)
 */
export function generateEmbedding(text: string, dimensions: number = 128): number[] {
  const vec = new Array(dimensions).fill(0);
  const words = text
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter((w) => w.length > 2);

  if (words.length === 0) return vec;

  for (const word of words) {
    // 32-bit FNV-1a hash
    let hash = 2166136261;
    for (let i = 0; i < word.length; i++) {
      hash ^= word.charCodeAt(i);
      hash = Math.imul(hash, 16777619);
    }
    const bucket = Math.abs(hash) % dimensions;
    const sign = (hash & 1) === 0 ? 1 : -1;
    vec[bucket] += sign * (1 / Math.sqrt(words.length));
  }

  // L2 normalize
  let norm = 0;
  for (let i = 0; i < dimensions; i++) norm += vec[i] * vec[i];
  norm = Math.sqrt(norm);
  if (norm > 0) {
    for (let i = 0; i < dimensions; i++) vec[i] = Number((vec[i] / norm).toFixed(6));
  }

  return vec;
}

/**
 * Extracts and chunks text from airconditioner-manual.pdf
 */
export async function extractAndChunkPdf(pdfPath: string): Promise<DocumentChunk[]> {
  if (!fs.existsSync(pdfPath)) {
    console.warn(`[Ingestion] PDF file not found at ${pdfPath}`);
    return [];
  }

  const buffer = fs.readFileSync(pdfPath);
  const parser = new PDFParse({ data: buffer });
  const parsed = await parser.getText();
  const rawText = parsed.text || '';

  // Split on prominent section headings
  const rawSections = rawText.split(/\n(?=[A-Z\s]{4,30}\n)/);
  const chunks: DocumentChunk[] = [];
  let chunkIdx = 1;

  for (const sec of rawSections) {
    const clean = sec.trim();
    if (clean.length < 100) continue;

    const firstLine = clean.split('\n')[0].trim().slice(0, 80);
    const lower = clean.toLowerCase();

    // Determine audience
    let audience: 'customer' | 'technician' = 'customer';
    let docType: 'maintenance' | 'warranty' | 'electrical_specs' | 'troubleshooting' | 'error_code' = 'maintenance';

    if (
      lower.includes('disassembly') ||
      lower.includes('pcb') ||
      lower.includes('refrigerant') ||
      lower.includes('terminal block') ||
      lower.includes('multimeter')
    ) {
      audience = 'technician';
      docType = 'troubleshooting';
    } else if (lower.includes('warranty') || lower.includes('guarantee')) {
      docType = 'warranty';
    } else if (lower.includes('troubleshooting') || lower.includes('error')) {
      docType = 'troubleshooting';
    }

    const chunkId = `pdf_chunk_${String(chunkIdx++).padStart(3, '0')}`;
    const tokens = clean
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, ' ')
      .split(/\s+/)
      .filter((w: string) => w.length > 2);

    chunks.push({
      chunk_id: chunkId,
      appliance_type: 'air-conditioner',
      model: 'UW-Q18WUZA',
      source: 'airconditioner-manual.pdf',
      section: firstLine || `PDF Manual Section ${chunkIdx}`,
      audience,
      verification_status: 'verified',
      document_type: docType,
      content: clean,
      tokens,
      vector: generateEmbedding(clean),
    });
  }

  return chunks;
}

/**
 * Ingestion orchestrator: processes TXT + PDF and loads into pgvector & local cache
 */
export async function ingestAllKnowledge(): Promise<IngestionResult> {
  const candidates = [
    path.resolve(__dirname, '../../docs/lg-airconditioner'),
    path.resolve(process.cwd(), 'docs/lg-airconditioner'),
    path.resolve(__dirname, '../../../docs/lg-airconditioner'),
    path.resolve(process.cwd(), '../docs/lg-airconditioner'),
  ];
  const dataDir = candidates.find((c) => fs.existsSync(c)) || candidates[0];
  const pdfPath = path.join(dataDir, 'airconditioner-manual.pdf');

  console.log('🔄 [Ingestion] Starting ingestion of PDF manual and TXT files...');

  // 1. Process PDF
  const pdfChunks = await extractAndChunkPdf(pdfPath);
  console.log(`📄 [Ingestion] Extracted ${pdfChunks.length} chunks from airconditioner-manual.pdf`);

  // Write a clean markdown/text extract for hybrid in-memory loader
  const pdfExtractPath = path.join(dataDir, 'extracted_pdf_manual.txt');
  const formattedPdfText = pdfChunks
    .map((c, i) => `${i + 1}. ${c.section.toUpperCase()}\n${c.content}\n\n`)
    .join('\n');
  fs.writeFileSync(pdfExtractPath, formattedPdfText, 'utf-8');

  // 2. Read TXT chunks from the 4 text files
  const txtFiles = [
    { file: 'manual_disassembly_maintenance.txt', docType: 'maintenance' as const, audience: 'technician' as const },
    { file: 'manual_electrical_specs.txt', docType: 'electrical_specs' as const, audience: 'technician' as const },
    { file: 'troubleshooting_error_codes.txt', docType: 'troubleshooting' as const, audience: 'technician' as const },
    { file: 'warranty_policy_rules.txt', docType: 'warranty' as const, audience: 'customer' as const },
  ];

  const allChunks: DocumentChunk[] = [...pdfChunks];
  let txtCounter = 1;

  for (const item of txtFiles) {
    const fullPath = path.join(dataDir, item.file);
    if (!fs.existsSync(fullPath)) continue;

    const raw = fs.readFileSync(fullPath, 'utf-8');
    const sections = raw.split(/\n(?=\d+\.\s+[A-Z])/);

    for (let i = 0; i < sections.length; i++) {
      const sec = sections[i].trim();
      if (sec.length < 50) continue;

      const firstLine = sec.split('\n')[0].trim().slice(0, 80);
      let aud = item.audience;
      let status: 'verified' | 'unverified_warning' | 'policy_pending' = 'verified';

      if (item.file === 'manual_disassembly_maintenance.txt') {
        aud = sec.includes('1.2 User-level maintenance') ? 'customer' : 'technician';
      } else if (item.file === 'manual_electrical_specs.txt') {
        status = 'unverified_warning';
      } else if (item.file === 'warranty_policy_rules.txt') {
        status = 'policy_pending';
      }

      allChunks.push({
        chunk_id: `txt_chunk_${String(txtCounter++).padStart(3, '0')}`,
        appliance_type: 'air-conditioner',
        model: 'UW-Q18WUZA',
        source: item.file,
        section: firstLine || `Section ${i + 1}`,
        audience: aud,
        verification_status: status,
        document_type: item.docType,
        content: sec,
        tokens: sec.toLowerCase().replace(/[^a-z0-9\s]/g, ' ').split(/\s+/).filter((w: string) => w.length > 2),
        vector: generateEmbedding(sec),
      });
    }
  }

  const audienceBreakdown = {
    customer: allChunks.filter((c) => c.audience === 'customer').length,
    technician: allChunks.filter((c) => c.audience === 'technician').length,
  };

  // 3. Insert into PostgreSQL pgvector if reachable
  let pgVectorInserted = false;
  let dbRowsCount = 0;

  const isDbAlive = await testConnection();
  if (isDbAlive) {
    try {
      console.log('🐘 [PGVector] PostgreSQL is connected. Ensuring table and inserting chunks...');
      await pool.query('CREATE EXTENSION IF NOT EXISTS vector;');
      await pool.query(`
        CREATE TABLE IF NOT EXISTS document_chunks (
          chunk_id VARCHAR(100) PRIMARY KEY,
          appliance_type VARCHAR(50) NOT NULL DEFAULT 'air-conditioner',
          model VARCHAR(100) NOT NULL DEFAULT 'UW-Q18WUZA',
          source VARCHAR(255) NOT NULL,
          section VARCHAR(255),
          audience VARCHAR(20) NOT NULL,
          verification_status VARCHAR(50) NOT NULL,
          document_type VARCHAR(50) NOT NULL,
          content TEXT NOT NULL,
          embedding vector(128),
          created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
        );
      `);

      for (const chunk of allChunks) {
        const vecStr = `[${chunk.vector?.join(',')}]`;
        await pool.query(
          `INSERT INTO document_chunks (chunk_id, appliance_type, model, source, section, audience, verification_status, document_type, content, embedding)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10::vector)
           ON CONFLICT (chunk_id) DO UPDATE SET
             content = EXCLUDED.content,
             embedding = EXCLUDED.embedding;`,
          [
            chunk.chunk_id,
            chunk.appliance_type,
            chunk.model,
            chunk.source,
            chunk.section,
            chunk.audience,
            chunk.verification_status,
            chunk.document_type,
            chunk.content,
            vecStr,
          ]
        );
      }

      const countRes = await pool.query('SELECT COUNT(*) FROM document_chunks');
      dbRowsCount = parseInt(countRes.rows[0].count, 10);
      pgVectorInserted = true;
      console.log(`✅ [PGVector] Successfully saved ${dbRowsCount} chunks in PostgreSQL!`);
    } catch (err: any) {
      console.warn('⚠️ [PGVector] Error inserting to PostgreSQL:', err.message);
    }
  } else {
    console.log('ℹ️ [PGVector] PostgreSQL not reachable. Extracted chunks are ready in local resilient storage.');
  }

  return {
    totalChunks: allChunks.length,
    txtChunks: txtCounter - 1,
    pdfChunks: pdfChunks.length,
    audienceBreakdown,
    pgVectorInserted,
    dbRowsCount,
  };
}
