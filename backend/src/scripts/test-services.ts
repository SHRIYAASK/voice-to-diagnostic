import { gnaniSttService } from '../services/gnaniSttService';
import { gnaniTtsService } from '../services/gnaniTtsService';
import { hfEvonService, stripThinkingTags, SentenceChunker } from '../services/hfEvonService';

async function main() {
  console.log('--- Testing SentenceChunker ---');
  const chunker = new SentenceChunker();
  const s1 = chunker.push('Hello! How can I help you today? ');
  console.log('Chunker output:', s1);
  const s2 = chunker.push('Your AC may need filter cleaning.');
  const s3 = chunker.flush();
  console.log('Flushed:', s3);

  console.log('\n--- Testing thinking tag stripper ---');
  const stripped = stripThinkingTags('<think>internal reasoning steps</think>Hello world!');
  console.log('Stripped text:', stripped);

  console.log('\n--- Testing Evon service settings ---');
  console.log('Model ID:', hfEvonService.getModelId());
  console.log('Base URL:', hfEvonService.getBaseUrl());

  console.log('\n--- Testing Gnani TTS streaming test with Nalini voice ---');
  let received = 0;
  const ttsRes = await gnaniTtsService.streamSynthesize('Test synthesis.', (c) => {
    received++;
  });
  console.log('TTS stream result:', ttsRes.success, 'Chunks:', received, 'Error:', ttsRes.error);
}

main().catch(console.error);
