import { mkdirSync, rmSync } from 'node:fs';
const results = new URL('../results/', import.meta.url);
rmSync(results, { recursive: true, force: true });
mkdirSync(new URL('contracts/', results), { recursive: true });
