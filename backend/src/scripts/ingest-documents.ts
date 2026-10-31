/**
 * Document Ingestion Script
 * Ingests TXT files and airconditioner-manual.pdf into pgvector & local cache
 *
 * Usage:
 * npx ts-node src/scripts/ingest-documents.ts
 */

import { ingestAllKnowledge } from '../db/pgvectorIngestion';

async function main() {
  console.log('======================================================================');
  console.log('   ApplianceCare AI — TXT & PDF Manual PGVector Ingestion Engine      ');
  console.log('======================================================================\n');

  const start = Date.now();
  try {
    const res = await ingestAllKnowledge();
    const duration = Date.now() - start;

    console.log('\n----------------------------------------------------------------------');
    console.log('   INGESTION REPORT                                                   ');
    console.log('----------------------------------------------------------------------');
    console.log(`• Total Knowledge Chunks:    ${res.totalChunks}`);
    console.log(`• PDF Chunks Extracted:      ${res.pdfChunks} (from airconditioner-manual.pdf)`);
    console.log(`• TXT Chunks Extracted:      ${res.txtChunks} (from 4 technical docs)`);
    console.log(`• Customer Chunks:           ${res.audienceBreakdown.customer} (user-safe filter/cleaning/warranty)`);
    console.log(`• Technician Chunks:         ${res.audienceBreakdown.technician} (230V/disassembly/PCB gated)`);
    console.log(`• PostgreSQL pgvector Sync:  ${res.pgVectorInserted ? `✅ Synced (${res.dbRowsCount} rows in DB)` : 'ℹ️ Resilient local storage (Postgres offline)'}`);
    console.log(`• Execution Time:            ${duration} ms`);
    console.log('======================================================================\n');

    process.exit(0);
  } catch (err: any) {
    console.error('❌ [Ingestion Error]:', err.message);
    process.exit(1);
  }
}

main();
