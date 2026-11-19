// 상위 폴더의 게임 파일을 www/ 로 복사 (도구·원본 이미지·문서는 빼고)
import { cpSync, rmSync, mkdirSync, existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join, dirname, basename } from 'node:path';
import { fileURLToPath } from 'node:url';

const app = join(dirname(fileURLToPath(import.meta.url)), '..');
const root = join(app, '..');
const www = join(app, 'www');
if (existsSync(www)) rmSync(www, { recursive: true, force: true });
mkdirSync(www, { recursive: true });

const skip = (p) => {
  const b = basename(p);
  return b.startsWith('Gemini_Generated_Image_') || b === 'README.md';
};
for (const f of ['index.html', 'manifest.webmanifest']) cpSync(join(root, f), join(www, f));
for (const d of ['css', 'js', 'lang', 'image']) {
  cpSync(join(root, d), join(www, d), { recursive: true, filter: (src) => !skip(src) });
}
// 앱 전용: Capacitor 런타임(registerPlugin 등)을 넣고 index.html 에서 게임보다 먼저 불러옴
cpSync(join(app, 'node_modules', '@capacitor', 'core', 'dist', 'capacitor.js'), join(www, 'capacitor.js'));
const idx = join(www, 'index.html');
const html = readFileSync(idx, 'utf8');
const tag = '<script src="capacitor.js"></script>\n  <script type="module" src="js/main.js"></script>';
if (!html.includes('<script type="module" src="js/main.js"></script>')) throw new Error('main.js script tag not found');
writeFileSync(idx, html.replace('<script type="module" src="js/main.js"></script>', tag));
console.log('copied game files to', www);
