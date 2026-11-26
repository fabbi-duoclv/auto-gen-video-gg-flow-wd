import { readCharacters } from '../src/excel-reader.js';

const chars = await readCharacters();
for (const c of chars) {
  console.log(`=== ${c.name} (ID ${c.id}) ===`);
  console.log(`Headshot: ${c.promptHeadshot}`);
  console.log('');
}
