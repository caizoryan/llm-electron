import fs from 'fs';
import path from 'path';
import { spawn } from 'child_process';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const srcDir = path.join(__dirname, 'src');
let debounceTimer = null;

function compile() {
  console.log('\n[watch] compiling...');
  const child = spawn('npm', ['run', 'build'], {
    stdio: 'inherit',
    shell: true,
  });

  child.on('close', (code) => {
    if (code === 0) {
      console.log('[watch] compile succeeded');
    } else {
      console.log(`[watch] compile failed with code ${code}`);
    }
  });
}

function onChange(eventType, filename) {
  if (!filename) return;
  clearTimeout(debounceTimer);
  debounceTimer = setTimeout(compile, 150);
}

fs.watch(srcDir, { recursive: true }, onChange);
console.log(`[watch] watching ${srcDir}`);
compile();
