import { createJiti } from 'jiti';
import fs from 'node:fs';
import path from 'node:path';

const jiti = createJiti(path.resolve(process.cwd(), 'dummy.js'));

const testDir = path.resolve(process.cwd(), 'test');
const files = fs.readdirSync(testDir).filter(f => f.endsWith('.test.ts'));

console.log('--- EJECUTANDO SUITE DE TESTS ---');
for (const file of files) {
  console.log(`Cargando archivo de test: ${file}`);
  jiti(path.join(testDir, file));
}
