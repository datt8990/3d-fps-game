// Zero-Config Production Build Script for Vercel Static + Serverless Deployment
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const DIST = path.join(ROOT, 'dist');

function copyDirRecursive(src, dest) {
  fs.mkdirSync(dest, { recursive: true });
  for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
    const sPath = path.join(src, entry.name);
    const dPath = path.join(dest, entry.name);
    if (entry.isDirectory()) {
      copyDirRecursive(sPath, dPath);
    } else {
      fs.copyFileSync(sPath, dPath);
    }
  }
}

function copySingleFile(src, dest) {
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  fs.copyFileSync(src, dest);
}

console.log('⚡ Building FPS ONLINE – BATTLE STRIKE for Production / Vercel...');

if (fs.existsSync(DIST)) {
  fs.rmSync(DIST, { recursive: true, force: true });
}

// 1. Copy Frontend Public Assets -> dist/
copyDirRecursive(path.join(ROOT, 'public'), DIST);

// 2. Copy Shared Physics, Maps & GameRoomCore Engine -> dist/shared/
copyDirRecursive(path.join(ROOT, 'shared'), path.join(DIST, 'shared'));

// 3. Copy Local Vendor Bundles (Three.js & PeerJS WebRTC) -> dist/vendor/
copySingleFile(
  path.join(ROOT, 'node_modules', 'three', 'build', 'three.module.min.js'),
  path.join(DIST, 'vendor', 'three', 'build', 'three.module.min.js')
);
copySingleFile(
  path.join(ROOT, 'node_modules', 'peerjs', 'dist', 'peerjs.min.js'),
  path.join(DIST, 'vendor', 'peerjs', 'peerjs.min.js')
);

console.log('✅ Build complete! Output directory: dist/ (Ready for Vercel & Static CDN)');
