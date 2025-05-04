// build.js
import { build } from 'esbuild';
import { fileURLToPath } from 'url';
import { dirname } from 'path';
import { exec } from 'child_process';
import { promisify } from 'util';

const execPromise = promisify(exec);
const __filename = fileURLToPath(import.meta.url);

async function runTypeScriptCompilation() {
  console.log('Running TypeScript compilation...');
  try {
    const { stdout, stderr } = await execPromise('npx tsc');
    if (stdout) console.log(stdout);
    if (stderr) console.error(stderr);
  } catch (error) {
    console.error('TypeScript compilation failed:', error.message);
    process.exit(1);
  }
}

async function runBuild() {
  try {
    // First run TypeScript compilation
    await runTypeScriptCompilation();

    // Then run esbuild
    await build({
      entryPoints: ['src/index.ts'],
      bundle: false, // Disable bundling to avoid ESM issues
      minify: process.env.NODE_ENV === 'production',
      sourcemap: true,
      platform: 'node',
      target: 'node16',
      outdir: 'dist',
      format: 'esm',
      banner: {
        js:
          '// This file is generated - do not edit!\n// Generated on: ' + new Date().toISOString(),
      },
    });
    console.log('⚡ Build completed successfully!');
  } catch (error) {
    console.error('❌ Build failed:', error);
    process.exit(1);
  }
}

runBuild();
