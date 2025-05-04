// build.js
import { build } from 'esbuild';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

async function runBuild() {
  try {
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
        js: '// This file is generated - do not edit!\n// Generated on: ' + new Date().toISOString(),
      },
    });
    console.log('⚡ Build completed successfully!');
  } catch (error) {
    console.error('❌ Build failed:', error);
    process.exit(1);
  }
}

runBuild();