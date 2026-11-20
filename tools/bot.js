// 밸런스 측정용 자동 플레이 봇 — 실제 코드는 js/autoplay.js (?autoplay=1 과 같은 봇).
// tools/balance.html 과 node 측정에서 사용: node -e "import('./tools/bot.js').then(m=>console.log(m.runGame({seed:1})))"
export { runGame, summary } from '../js/autoplay.js';
