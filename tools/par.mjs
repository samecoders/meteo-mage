// 봇 측정 병렬 실행기(node). 여러 프로세스로 나눠 돌리고 평균·표준오차를 출력.
// 사용: node tools/par.mjs '<JSON>'  예) node tools/par.mjs '{"hero":"mage","games":60}'
// JSON: hero, skin, build('alt'|'range'|'power'), god(bool), treasure(bool), maxSec, games, seed0, workers,
//       set: { "characters.hero_icewitch.speed": 1.15, ... }  (CONFIG 경로 덮어쓰기)
import { fork } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const me = fileURLToPath(import.meta.url);

if (process.argv[2] === '--worker') {
  const job = JSON.parse(process.argv[3]);
  const { CONFIG } = await import('../js/config.js');
  for (const [path, v] of Object.entries(job.set || {})) {
    const keys = path.split('.'); let o = CONFIG;
    for (let i = 0; i < keys.length - 1; i++) o = o[keys[i]];
    o[keys[keys.length - 1]] = v;
  }
  globalThis.__botGod = !!job.god;
  globalThis.__botBuild = job.build || 'alt';
  globalThis.__botTreasure = job.treasure !== false;
  const m = await import('../js/autoplay.js');
  const out = [];
  for (const seed of job.seeds) {
    const r = m.runGame({ seed, maxSec: job.maxSec || (job.god ? 480 : 900), hero: job.hero || 'mage', skin: job.skin || 'fire' });
    out.push({ kills: r.kills, survived: r.survived, level: r.level, treasures: r.treasures });
  }
  process.send(out);
  process.exit(0);
}

const spec = JSON.parse(process.argv[2] || '{}');
const games = spec.games || 60, workers = spec.workers || 11, seed0 = spec.seed0 || 5001;
const chunks = Array.from({ length: workers }, () => []);
for (let i = 0; i < games; i++) chunks[i % workers].push(seed0 + i);
const results = (await Promise.all(chunks.filter((c) => c.length).map((seeds) => new Promise((ok, bad) => {
  const p = fork(me, ['--worker', JSON.stringify({ ...spec, seeds })]);
  p.on('message', ok); p.on('error', bad);
})))).flat();
const stat = (f) => { const v = results.map(f), n = v.length, mean = v.reduce((a, b) => a + b, 0) / n; const sd = Math.sqrt(v.reduce((a, b) => a + (b - mean) ** 2, 0) / Math.max(1, n - 1)); return { mean, se: sd / Math.sqrt(n) }; };
const k = stat((r) => r.kills), s = stat((r) => r.survived), l = stat((r) => r.level), t = stat((r) => r.treasures);
console.log(JSON.stringify({ spec: { ...spec, games }, kills: Math.round(k.mean), killsSE: Math.round(k.se), surv: Math.round(s.mean), level: +l.mean.toFixed(2), treasures: +t.mean.toFixed(2) }));
