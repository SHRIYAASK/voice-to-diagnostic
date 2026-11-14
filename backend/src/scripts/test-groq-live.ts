import Groq from 'groq-sdk';
import dotenv from 'dotenv';

dotenv.config();

async function test() {
  const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });
  const models = ['qwen/qwen3.8-27b', 'openai/gpt-oss-20b', 'openai/gpt-oss-120b'];
  for (const model of models) {
    try {
      console.log('Testing model:', model);
      const completion = await groq.chat.completions.create({
        model,
        messages: [
          { role: 'system', content: 'You are an option matcher. Output JSON: {"selected_index": number}.' },
          { role: 'user', content: 'Options:\n0: No cool air\n1: Weak cooling\n2: Starts and stops\n\nUser: the room starts to cool and stops in between' },
        ],
        temperature: 0.1,
        max_tokens: 100,
      });
      console.log(`Success on ${model}:\n`, completion.choices[0].message.content);
      break;
    } catch (e: any) {
      console.log(`Failed on ${model}:`, e.message);
    }
  }
}

test().catch(e => console.error('Error:', e.message));
