// =====================================================================
//  메테오 법사 — 모든 밸런스·성능 수치는 이 파일 한 곳에서 조절합니다.
//  (시간 단위: 초, 거리 단위: 월드 단위. 내부 화면 1픽셀 = 월드 2단위)
// =====================================================================

// 화면 아래쪽 이 비율(40%)에는 메테오(마력 링)와 대시 버튼만 둔다. 이동하는 손가락이 가리는 자리라서.
// 다른 버튼·숫자·알림·팝업은 모두 위쪽에. ui.js 의 checkHudLayout() 이 이 값으로 배치를 검사한다.
export const HUD_BOTTOM_FORBIDDEN = 0.4;

// ---- 랭킹 서버(Supabase). 둘 중 하나라도 비어 있으면 랭킹을 끄고 내 기기 최고 기록만 보여 줌.
// 공개 키(sb_publishable_…)만 넣는다. 비밀 키(sb_secret_…)는 절대 코드에 넣지 않는다.
export const SUPABASE_URL = 'https://rmikpqoyqklhliqndfuq.supabase.co';   // 프로젝트 URL 예: 'https://abcd1234.supabase.co'
export const SUPABASE_KEY = 'sb_publishable_4AhzOUtIeMpRHzy1l1ZSGw_nJvJFyP7';   // 'sb_publishable_' 로 시작하는 공개 키
export const RANKING_SEASON = 3;  // 규칙이 바뀌면 올리고 tools/spawn_cap.html 로 상한표 SQL 을 다시 만들 것

export const CONFIG = {
  // ------------------------------------------------------------ 화면 배치(HTML UI)
  ui: {
    bottomForbidden: HUD_BOTTOM_FORBIDDEN,
    bottomAllowed: ['mana', 'btnDash', 'rightCol', 'hudBottom'],  // 아래쪽에 있어도 되는 것
    notifyMaxY: 1 / 3,     // 알림(아이템 획득·메테오 습득 등)은 화면 위 1/3 안에서만
    minButton: 48,         // 버튼 최소 크기(CSS 픽셀)
    // 튕기기 대시: 이동하던 손가락을 빠르게 쓸고 떼면 그 방향으로 대시(설정에서 끌 수 있음)
    flickWindow: 0.1,      // 떼기 직전 이 시간(초) 동안의 손가락 속도로 판단
    flickSpeed: 1100,      // 이 속도(CSS 픽셀/초) 이상이면 대시
    flickMinDist: 28,      // 그 시간 동안 최소 이만큼(CSS 픽셀)은 움직여야 함
    toastMax: 3,           // 상단 알림 최대 개수(새 알림이 오면 오래된 것부터 사라짐)
    deathSlowMs: 600,      // 죽는 순간 슬로모션 시간(실제 시간 ms)
    deathSlowScale: 0.3,   // 그동안 게임 속도
  },

  // ------------------------------------------------------------ 시뮬레이션
  sim: {
    tickRate: 30,          // 게임 로직 틱/초 (고정)
    maxCatchupTicks: 3,    // 한 프레임에 따라잡을 최대 틱 수. 더 밀리면 게임 시간이 늦춰짐
    maxMobs: 60000,        // 동시에 존재할 수 있는 최대 몹 수
  },

  // ------------------------------------------------------------ 화면/카메라
  view: {
    worldPerPx: 2,         // 내부 화면 1픽셀 = 월드 2단위 (짧은 변 360px = 월드 720단위)
    baseShort: 360,        // 기본 내부 화면 짧은 변(픽셀)
    maxShort: 600,         // 최대 줌 아웃 시 내부 화면 짧은 변(픽셀) (360 → 480 → 600)
    zoomSteps: [360, 480, 600],
    zoomFit: 2.6,          // 폭발 지름 × 이 값 이 짧은 변(월드)보다 크면 줌 아웃
    zoomSpeed: 90,         // 줌 변화 속도 (내부 픽셀/초) — 천천히
    camLerp: 7,            // 카메라 따라가기 강도(클수록 빠름)
    lead: 0.32,            // 이동 방향으로 앞을 더 보여 줌: 속도 × 이 시간(초)
    leadMax: 110,          // 앞보기 최대 거리(월드)
  },

  // ------------------------------------------------------------ 공간 격자
  grid: {
    cellSize: 32,          // 칸 크기(월드)
    cols: 160,             // 법사 중심 유한 영역: 160×32 = 5120 단위
    rows: 160,
  },

  // ------------------------------------------------------------ 몹
  // 일반 몹(타입 배열). dmg: 법사에 닿았을 때 주는 피해(법사 체력 player.hp 기준). 순서 = 타입 번호 = 아틀라스 앞쪽 스프라이트 순서 (바꾸면 typeWeights 도 같이)
  // mass: 밀도 압력에서 차지하는 몫(큰 몹일수록 넓게 퍼짐), wobble: 박쥐처럼 좌우로 흔들며 날기,
  // ghost: 무리를 통과(밀어내기 무시) + 반투명
  mobs: {
    types: [
      { key: 'slime',      speed: 78,  hp: 5, dmg: 6,  radius: 8,  exp: 1, mass: 0.8, sprite: 'mob_slime' },
      { key: 'bat',        speed: 108, hp: 2, dmg: 3,  radius: 8,  exp: 1, mass: 0.5, sprite: 'mob_bat', wobble: true },
      { key: 'wolf',       speed: 112, hp: 4, dmg: 5,  radius: 11, exp: 1, mass: 1.5, sprite: 'mob_wolf' },
      { key: 'mushroom',   speed: 56,  hp: 10, dmg: 7, radius: 9,  exp: 1, mass: 1.0, sprite: 'mob_mushroom' },
      { key: 'goblin',     speed: 104, hp: 8, dmg: 8,  radius: 10, exp: 2, mass: 1.2, sprite: 'mob_goblin' },
      { key: 'skeleton',   speed: 86,  hp: 12, dmg: 8, radius: 11, exp: 2, mass: 1.4, sprite: 'mob_skeleton' },
      { key: 'ghost',      speed: 96,  hp: 5, dmg: 5,  radius: 11, exp: 2, mass: 0,   sprite: 'mob_ghost', ghost: true },
      // 6단계(메테오 위력): 오크·골렘·흑기사 체력을 낮춰 위력을 올리면 한 방 처치가 가능하게(대신 hpTime 으로 점점 단단해짐)
      { key: 'orc',        speed: 70,  hp: 16, dmg: 12, radius: 13, exp: 3, mass: 2.2, sprite: 'mob_orc' },
      { key: 'golem',      speed: 46,  hp: 22, dmg: 15, radius: 15, exp: 4, mass: 3.0, sprite: 'mob_golem' },
      { key: 'darkknight', speed: 108, hp: 28, dmg: 14, radius: 13, exp: 6, mass: 2.2, sprite: 'mob_darkknight' },
    ],
    accel: 0.18,           // 틱당 목표 속도로 다가가는 비율(관성)
    pressureK: 12,         // 밀도 밀어내기 힘 계수 (붐빈 칸 → 덜 붐빈 칸). 압력 = (칸의 mass 합)²
    pressureCap: 2.2,      // 밀어내기 속도 상한 (몹 속도의 배수)
    farSkip: 1500,         // 법사에서 이 거리(축별) 밖의 몹은 밀어내기 생략 (기기와 무관한 고정값)
    despawnFactor: 1.75,   // 스폰 반경 × 이 값 보다 멀어지면 반대편으로 재배치
    flashTicks: 3,         // 피격 깜빡임 틱 수
    // 초반 완화: 처음 easeTime 초 동안 몹 체력·속도를 낮췄다가 서서히 원래 값으로
    easeTime: 180,         // ※ 난이도 프리셋(DIFFICULTY)이 덮어씀
    easeHp: 0.5,           // 0초일 때 체력 배율
    easeSpeed: 0.72,       // 0초일 때 속도 배율
    speedMul: 1,           // 모든 몹 속도 배율(난이도 프리셋)
    // 시간에 따른 체력 배율(초반 완화 뒤에 곱함): 3분쯤부터 가장자리 늑대·골렘이, 6분쯤부터 중간 골렘이 기본 위력에 살아남게
    hpTime: [[0, 1], [120, 1], [180, 1.3], [360, 1.45], [540, 1.6], [720, 1.8], [900, 2]],
  },

  // ------------------------------------------------------------ 스폰
  spawn: {
    // [게임 시간(초), 필드 목표 몹 수] — 사이 값은 선형 보간
    // 대략 1분 300 / 3분 2,000 / 6분 10,000 / 9분 30,000 / 12분 50,000
    curve: [
      [0, 60], [30, 160], [60, 300], [120, 900], [180, 2000], [270, 5000],
      [360, 10000], [450, 18000], [540, 30000], [630, 40000], [720, 50000], [840, 60000],
    ],
    // 시작 직후: 화면 가장자리 바로 밖에서 생겨 3초 안에 첫 무리가 보이게
    openingTime: 10,       // 이 시간(초) 동안
    openingMargin: 50,     // 화면 가장자리에서 이만큼 바깥(월드). 화면 크기는 기기와 무관하게 9:16 로 가정
    openingAspect: 16 / 9,
    zoomMargin: 150,       // 줌아웃 때 스폰 반경 = max(radius, 화면 반높이 + 이 값)
    perTickMax: 220,       // 한 틱에 생성할 최대 몹 수(대규모 스폰을 여러 틱에 분산)
    radius: 1100,          // 기본 스폰 반경(월드). 줌 아웃 단계에 비례해 커짐
    groupMin: 8,           // 무리 크기
    groupMax: 160,
    groupPerTarget: 1 / 250, // 목표 몹 수 × 이 값 = 무리 크기
    fronts: 3,             // 동시에 밀려오는 물결 방향 수
    frontDrift: 0.35,      // 물결 방향이 초당 바뀌는 정도(라디안)
    randomGroupChance: 0.25, // 무작위 방향 무리 비율
    // 아래 curveMul · typeFrom · typeWeights · ring 은 난이도 프리셋(DIFFICULTY)이 덮어씀
    curveMul: 1,           // 스폰 곡선 전체 배율
    typeFrom: {},          // 몹 종류별 첫 등장 시각(초) 예: { wolf: 60 }
    ring: { on: false },   // 포위 무리
    // [시간, 타입별 가중치] — 순서: 슬라임 박쥐 늑대 버섯 고블린 해골 유령 오크 골렘 흑기사
    typeWeights: [
      [0,   [1.00, 0,    0,    0,    0,    0,    0,    0,    0,    0   ]],
      [30,  [0.75, 0.25, 0,    0,    0,    0,    0,    0,    0,    0   ]],
      [60,  [0.50, 0.20, 0.15, 0.15, 0,    0,    0,    0,    0,    0   ]],
      [120, [0.35, 0.15, 0.15, 0.10, 0.15, 0.10, 0,    0,    0,    0   ]],
      [180, [0.25, 0.12, 0.13, 0.08, 0.14, 0.12, 0.08, 0.08, 0,    0   ]],
      [270, [0.18, 0.10, 0.12, 0.06, 0.12, 0.12, 0.10, 0.10, 0.07, 0.03]],
      [360, [0.12, 0.10, 0.10, 0.05, 0.10, 0.12, 0.10, 0.12, 0.12, 0.07]],
      [480, [0.10, 0.10, 0.10, 0.04, 0.08, 0.12, 0.10, 0.13, 0.13, 0.10]],
    ],
  },

  // ------------------------------------------------------------ 보스
  // 2분마다 kinds 순서대로 등장(끝나면 처음부터, 더 강하게). 체력 = hp × hpGrowth^(등장 순번)
  boss: {
    interval: 120,         // 등장 간격(초)
    hp: 60,                // 첫 보스 체력 (위력 10~13 기준 메테오 5발 정도)
    hpGrowth: 1.35,        // 등장할 때마다 체력 배율
    radius: 40,
    contactDmg: 25,        // 보스에 닿았을 때 피해
    gold: 300,             // 처치 골드
    exp: 250,
    max: 6,                // 동시에 있을 수 있는 보스 수
    kinds: [
      // 오거: 잠깐 멈춰 힘을 모았다가 법사 쪽으로 돌진
      { key: 'ogre',      sprite: 'mob_boss',       speed: 62, every: 5,   windup: 0.8, chargeTime: 0.9, chargeMult: 3.4 },
      // 슬라임 왕: 죽으면 슬라임 split 마리로 터짐
      { key: 'slimeking', sprite: 'boss_slimeking', speed: 52, split: 220 },
      // 리치: every 초마다 해골 summon 마리 소환
      { key: 'lich',      sprite: 'boss_lich',      speed: 56, every: 6,   summon: 36 },
      // 드래곤: every 초마다 법사가 갈 자리로 불덩이 발사(대시로 통과 가능, 쉴드로 막음)
      { key: 'dragon',    sprite: 'boss_dragon',    speed: 72, every: 3.2, fireSpeed: 270, fireRadius: 13, fireLife: 4, fireDmg: 20 },
      // 미믹: 나무 상자가 변한 작은 보스(정기 보스 순서에는 안 나옴 — special)
      { key: 'mimic',     sprite: 'mimic',          speed: 84, special: true },
    ],
  },

  // ------------------------------------------------------------ 맵 아이템
  // 효과는 그 판에만(죽으면 사라짐). 시간제 효과를 다시 먹으면 시간이 연장된다.
  items: {
    max: 24,               // 필드 아이템 풀 크기(보물상자에서 나온 것 포함)
    fieldMax: 6,           // 평원에 저절로 생기는 아이템 최대 수
    everyMin: 8, everyMax: 12,   // 생성 간격(초)
    distMin: 250, distMax: 600,  // 법사에게서 떨어진 거리(월드)
    firstAt: 6,            // 첫 아이템 생성 시각(초)
    life: 30,              // 이 시간이 지나면 사라짐
    blinkLast: 5,          // 사라지기 전 깜빡이는 시간
    pickupRadius: 26,
    rarity: { common: 0.6, rare: 0.3, legend: 0.1 },
    kindWeight: {},        // 같은 등급 안에서 종류별 가중치(기본 1). 예: { potion: 0.5 }
    starMaxField: 99,      // 무적의 별이 필드에 동시에 있을 수 있는 수
    meteorOnly: ['ring', 'lens', 'twin', 'fury'],  // 메테오를 배우기 전(레벨 4 이하)에는 안 나옴
    chestItems: 3,         // 보물상자를 열면 나오는 아이템 수
    chestLife: 60,
    // 효과 수치
    // ※ starTime·heartMax·kindWeight·starMaxField 는 난이도 프리셋(DIFFICULTY)이 덮어씀
    starTime: 7, starSpeed: 0.3, starBlink: 2,
    heartMax: 6,
    crystalExpPct: 0.3,    // 레벨 4 이하에서 마력 결정: 필요 경험치의 30%
    bootsPct: 0.08, bootsMax: 5,
    featherPct: 0.12, featherMax: 5,
    magnetTime: 2.5,
    coinsGold: 150, coinsGoldPerMin: 60,   // 금화 주머니: 150 + 분당 60
    scrollPct: 0.5,
    hourglassTime: 6, hourglassSlow: 0.5,
    bombRadius: 190, bombPower: 40,
    thunderCount: 300, thunderDamage: 999,
    orbMax: 5,
    ringPct: 0.1, ringMax: 5,
    lensPct: 0.06, lensMax: 5,
    twinTime: 15,
    furyTime: 10, furyMult: 3,
    // 종류: key = 파일 item_<key>.png, 이름은 lang 의 item.<key>.name
    kinds: [
      { key: 'star',      rarity: 'legend' },
      { key: 'potion',    rarity: 'common' },
      { key: 'heart',     rarity: 'rare' },
      { key: 'crystal',   rarity: 'common' },
      { key: 'boots',     rarity: 'common' },
      { key: 'feather',   rarity: 'common' },
      { key: 'magnet',    rarity: 'common' },
      { key: 'coins',     rarity: 'common' },
      { key: 'scroll',    rarity: 'rare' },
      { key: 'hourglass', rarity: 'rare' },
      { key: 'bomb',      rarity: 'rare' },
      { key: 'thunder',   rarity: 'rare' },
      { key: 'orb',       rarity: 'common' },
      { key: 'ring',      rarity: 'rare' },
      { key: 'lens',      rarity: 'rare' },
      { key: 'twin',      rarity: 'legend' },
      { key: 'fury',      rarity: 'legend' },
      { key: 'chest',     rarity: 'boss' },
    ],
  },

  // ------------------------------------------------------------ 보물 탐험 (찾아가서 열어야 하는 보물)
  // 등장 시간·거리 규칙은 모두에게 같고 위치만 판마다 무작위(시드 난수). 보상은 그 판에만 유효
  treasure: {
    max: 8,                // 동시에 있을 수 있는 보물 수
    openRadius: 30,        // 상자 위에 있다고 보는 거리
    wood: {
      first: 40, everyMin: 50, everyMax: 70, distMin: 300, distMax: 700,
      openTime: 1.0,       // 1초 머물면 열림(원형 게이지)
      decay: 0.5,          // 벗어나면 게이지가 초당 이만큼(비율) 줄어듦
      expPct: 0.6,         // 보상: 현재 레벨 필요 경험치의 60%
      items: 2,            // + 맵 아이템 2개가 튀어나옴
      mimicChance: 0.1,    // 10% 는 미믹
      life: 120,           // 안 열면 사라짐(초)
    },
    mimic: {
      wakeAt: 0.2,         // 게이지가 이만큼 차면 미믹으로 변함
      hp: 45, hpGrowth: 1.25,   // 체력 = hp × hpGrowth^(분)
      summon: 70, summonRadius: 150,   // 변할 때 주변에 몹 무리 소환
    },
    gold: {
      first: 240, everyMin: 90, everyMax: 120, distMin: 500, distMax: 900,
      openTime: 1.5,       // 엘리트가 남아 있으면 1.5초 머물러 강제로 열기
      elitesMin: 8, elitesMax: 15,
      eliteHp: 10,         // 엘리트 체력 배율(같은 종류 일반 몹 대비)
      eliteRing: 90,       // 상자를 둘러싼 거리
      guardRadius: 420,    // 법사가 이 거리 안에 오면 엘리트가 쫓아옴, 아니면 상자 곁을 지킴
      life: 150,
      levels: 1,           // 보상: 즉시 레벨업 1 (+ 3단계: 유물 3개 중 1개)
    },
    ruin: {
      times: [120, 480, 840],   // 한 판 최대 3개
      distMin: 900, distMax: 1500,
      runes: 3, runeRadius: 400, runePick: 24,
      altarRadius: 44,     // 제단에 서 있다고 보는 거리
      levels: 2,           // 보상: 레벨 +2 (+ 3단계: 전설 유물 3개 중 1개)
      openPause: 1.0,      // 개방 연출(게임 멈춤)
      siegeTime: 10,       // 개방 순간부터 10초간 사방에서 대습격
      siegeEvery: 1.0,     // 초마다
      siegeCount: 90, siegeCountPerMin: 12, siegeRadius: 520, siegeDirs: 8,
    },
    pingNear: 700,         // 이 거리 안이면 "띠링"(가까울수록 빨라짐)
    unitsPerMeter: 10,     // 나침반 거리 표시: 월드 10단위 = 1m
  },

  // ------------------------------------------------------------ 유물 (그 판 내내, 최대 6개, 중복 없음). 그림: image/relic_<key>.png
  relics: {
    max: 6, choices: 3,
    weight: { common: 5, rare: 3.5, legend: 1.5 },   // 황금 상자 선택지 등급 가중치(유적은 전설 우선)
    list: [
      { key: 'gravity', rarity: 'legend' },  // 중력의 핵
      { key: 'echo',    rarity: 'legend' },  // 메아리 룬
      { key: 'phoenix', rarity: 'legend' },  // 불사조 깃털
      { key: 'rain',    rarity: 'legend' },  // 유성우
      { key: 'heart',   rarity: 'rare' },    // 거인의 심장
      { key: 'spring',  rarity: 'rare' },    // 마나의 샘
      { key: 'shadow',  rarity: 'rare' },    // 그림자 분신
      { key: 'comet',   rarity: 'rare' },    // 혜성 꼬리
      { key: 'rift',    rarity: 'rare' },    // 시간 균열
      { key: 'crown',   rarity: 'rare' },    // 탐욕의 왕관
      { key: 'lens',    rarity: 'common' },  // 탐사자의 렌즈
      { key: 'bolt',    rarity: 'common' },  // 분열 마법탄
    ],
    resonance: [
      { key: 'gravityEcho', a: 'gravity', b: 'echo' },     // 두 번째 폭발도 몹을 끌어당김
      { key: 'shadowComet', a: 'shadow', b: 'comet' },     // 분신이 사라질 때 폭발
      { key: 'crownLens',   a: 'crown', b: 'lens' },       // 나무 상자가 가끔 황금 상자로
    ],
    gravityRange: 1.5, gravityPull: 110,        // 반경 × 1.5 안 몹을 초당 110 만큼 중심으로
    echoDelay: 2, echoPower: 0.5, echoFall: 0.7, // 폭발 2초 뒤 같은 자리에 50% 위력(마지막 0.7초는 낙하 표시)
    phoenixRadius: 320, phoenixPower: 60,
    rainCount: 6, rainRadius: 55, rainPower: 1.0, rainSpread: 2.2, rainFall: 0.5,   // 폭발 반경 × 2.2 안에 작은 운석 6개
    heartPlus: 2,
    springEvery: 100, springMana: 5,           // 100마리마다 마력 +5%
    shadowTime: 2, shadowLure: 320,            // 분신 2초, 이 거리 안 몹을 끌어당김
    shadowBlastR: 130, shadowBlastPower: 1.2,  // 공명: 사라질 때 폭발(위력 = 메테오 위력 × 1.2)
    cometTime: 3, cometR: 46, cometSteps: 4,   // 대시 경로에 불길 4개, 3초
    riftSlow: 0.5,
    crownMul: 2, crownMobs: 1.25,
    lensTreasureMul: 1.4, crownLensGold: 0.25, // 공명: 나무 상자 25% 가 황금 상자로
    boltSplitAngle: 0.55, boltSplitLife: 0.35, boltSplitDamage: 0.6,
  },

  // ------------------------------------------------------------ 마법탄 (레벨 1부터 자동 발사)
  bolts: {
    max: 300,              // 풀 크기
    rate: 3,               // 초당 발사 횟수(기본)
    count: 1,              // 한 번에 나가는 수(기본)
    pierce: 0,             // 관통 수(기본)
    damage: 3.2,
    speed: 560,
    life: 0.9,
    radius: 5,             // 충돌 반경(+몹 반경)
    range: 520,            // 이 거리 안의 가장 가까운 몹을 노림
    spread: 0.16,          // 여러 발일 때 사이 각도(라디안)
    rateCardPct: 0.25,     // 발사 속도 카드 +25%
    maxCount: 10, maxPierce: 6,
  },

  // ------------------------------------------------------------ 법사
  player: {
    speed: 161,            // 2026-11-20: 124 → +30%
    accelTime: 0.08,       // 최고 속도까지 걸리는 시간(초)
    stopTime: 0.03,        // 손을 떼면 이 시간 안에 멈춤(밀리지 않게)
    radius: 8,             // 몹 접촉 판정 반경
    // ---- 체력: 하트. 몹에 닿으면 1칸, 0칸이면 게임오버. 자기 메테오는 한 방에 죽음
    hearts: 3,             // 시작 하트
    // ※ hurtInvuln·regenDelay·regenEvery 는 난이도 프리셋(DIFFICULTY)이 덮어씀
    hurtInvuln: 1.5,       // 맞은 뒤 무적 시간(깜빡임)
    knockRadius: 220,      // 맞을 때 주변 몹을 넓게 밀쳐냄
    knockImpulse: 620,
    regenDelay: 6,         // 마지막으로 맞고 이 시간이 지나면
    regenEvery: 5,         // 이 간격마다 하트 1칸씩 회복
    fastTrail: 0.85,       // 최고 속도의 이 비율 이상이면 잔상·속도선
  },

  // ------------------------------------------------------------ 대시
  dash: {
    distance: 140,
    duration: 0.15,
    cooldown: 2.5,
    upgradePct: 0.2,       // 대시 강화 1단계당 거리 +20%
    scaleWithMeteor: true, // 범위 카드로 메테오 반경이 커진 만큼 대시 거리도 늘어남(자기 메테오에서 항상 탈출 가능)
    maxUpgrades: 5,
    afterimages: 4,
  },

  // ------------------------------------------------------------ 마력
  mana: {
    max: 100,
    regen: 11,             // 기본 초당 충전 (평균 6~8초에 한 번 쏠 수 있게. 레벨 5에 메테오를 배우면 가득 찬 채로 시작)
    nearRadius: 230,       // 주변 몹 수를 세는 반경
    nearK: 1.0,            // 초당 추가 충전 = min(nearCap, nearK × log2(1 + 주변 몹 수))
    nearCap: 6,
    nearMissBand: 45,      // 폭발 반경 바로 바깥 이 거리 이내면 아슬아슬 보너스
    nearMissBonus: 20,     // 아슬아슬 보너스(마력 %)
  },

  // ------------------------------------------------------------ 메테오
  meteor: {
    radius: 120,           // 기본 폭발 반경 (중앙 메테오로 바꾸며 105→120: 봇 측정으로 이전 생존 시간에 맞춤)
    power: 10,             // 기본 위력(중심 피해)
    edgeDamage: 0.4,       // 가장자리 피해 감소 비율(가장자리 피해 = 위력 × 60%)
    fallTime: 1.0,
    fastFallTime: 0.8,
    unlockLevel: 5,        // 이 레벨에 메테오 습득(그 전에는 마력 링이 숨겨지고 탭해도 아무 일 없음)
    learnTime: 3,          // 메테오 습득 안내 시간(초, 게임 정지)
    rangeCardPct: 0.15,
    rangeCardSteps: [0.15, 0.15, 0.12, 0.1, 0.08],   // 범위 카드 n번째 증가율(같은 카드를 거듭 고를수록 줄어듦)
    powerCardSteps: [0.3, 0.24, 0.18, 0.14, 0.1],    // 위력 카드 n번째 증가율
    overkillRefund: 0.01,  // 오버킬 피해 1당 마력(%) 환급
    overkillMax: 30,       // 폭발 한 번 환급 상한(마력 %)
    killRangeMob: 'golem', // 폭발 원 안에 '이 몹도 죽는 범위' 점선 원
    powerCardPct: 0.30,
    twinDelay: 0.5,
    // 2차 수정(2026-11-20): 메테오 버튼(또는 Space)을 누른 순간 법사가 서 있는 자리에 고정해서 떨어짐. 평원 탭은 아무 일 없음
    target: 'center',
    // 반드시 탈출 가능: 낙하 시간 = max(fallTime, 폭발 반경 ÷ (법사 현재 이동 속도 × escapeFactor))
    escapeFactor: 0.85,
    escapeHint: true,      // 반경 안에 있는 동안 몹이 가장 적은 쪽으로 연한 화살표(설정에서 끔)      // 'center': 누른 순간의 화면 중앙(법사 자리)에 고정해서 떨어짐 / 'tap': 탭한 자리
    castGuard: false,      // true 면 내 메테오가 떨어지는 동안 몹에게 안 다침(2차 수정: 끔 — 더 어렵게)       // target 'center': 메테오가 떨어지는 동안 몹에게는 안 다치고 밀쳐내지도 않음(몹이 모여듦). 자기 메테오 피해는 그대로
    // 자기 메테오 폭발에 휘말리면 한 방에 죽음(대시 중이어도). 쉴드·무적의 별만 막는다        // 자기 메테오 폭발에 휘말렸을 때 피해. 대시 중이어도 맞음 → 떨어지기 전에 반경 밖으로 대시(거리 140 > 반경 120)
    shockRange: 1.7,       // 반경 × 이 값까지 충격파로 밀어냄
    shockImpulse: 300,
    fireDuration: 3,
    fireDps: 0.9,          // 화염 지대 초당 피해 = 위력 × 이 값
    hitstopMin: 0.03,
    hitstopMax: 0.12,
    hitstopKills: 3000,    // 이 킬 수에서 최대 히트스톱
    maxActive: 24,         // 메아리·유성우 포함
  },

  // ------------------------------------------------------------ 마력 구슬
  orbs: {
    max: 300,
    blockCells: 4,         // 폭발 1회당 4×4 칸 단위로 묶어 구슬 1개
    manaPerKill: 0.05,
    maxPerBlast: 22,       // 폭발 1회로 생기는 구슬 마력 총합 상한(메테오가 너무 자주 나오지 않게)
    maxValue: 40,          // 구슬 하나 최대 마력
    pickupRadius: 18,
    magnetRadius: 80,
    magnetCardMult: 2.2,   // 마력 자석 카드 1장당 흡수 범위 배율
    magnetSpeed: 420,
    life: 40,
  },

  // ------------------------------------------------------------ 성장
  progress: {
    // 필요 경험치: 표(Lv1→2, Lv2→3, …). 표 끝 다음부터는 마지막 값 × expGrowth^(넘은 레벨)
    // 목표: 레벨 5 ≈ 1분 30초, 레벨 7 ≈ 3분. 초반은 빨리, 레벨 8 이후 가파르게
    expTable: [12, 30, 55, 90, 520, 1200, 2600],
    expGrowth: 2.1,
    killsPerGold: 10,      // 10킬당 골드 1
    comboMultK: 0.35,      // 한방 배율 = 1 + K × log10(1 + 킬 수)
    comboGoldBonus: [[100, 5], [500, 30], [1000, 80], [3000, 300], [8000, 1000]],
    specialEvery: 5,       // 특수 카드: 레벨 10, 15, 20… (레벨 5는 메테오 습득)
    levelUpDelay: 0.15,    // 레벨업 카드가 뜨기 전 대기(게임 시간) — 0.2초 안에
    resumePushRadius: 230, // 카드를 고르고 다시 시작할 때 법사 주변 몹을 밀어냄
    resumePushImpulse: 600,
    chainTime: 2,          // 연속 킬 콤보: 이 시간 안에 다음 킬이 이어지면 유지
  },

  // ------------------------------------------------------------ 판 안 상점
  shop: {
    shieldBase: 100,
    shieldGrowth: 2.0,
    dashBase: 150,
    dashGrowth: 2.0,
    shieldPushRadius: 260,
    shieldPushImpulse: 620,
    shieldInvuln: 1.5,
  },

  // ------------------------------------------------------------ 메테오 모양(꾸미기 전용) 가격
  skins: {
    prices: { fire: 0, ice: 2000, poison: 5000, lightning: 10000, dark: 20000, gold: 40000 },
  },

  // ------------------------------------------------------------ 캐릭터 3종(보관 골드로 해금, 판을 넘어 남음)
  // 낙하 시간 공식(탈출 가능)은 캐릭터 이동 속도로 계산. 이동 속도는 항상 가장 빠른 몹(123)보다 빠름
  heroes: {
    prices: { fire_mage: 0, frost_witch: 1500, earth_sage: 3000 },
  },
  characters: {
    fire_mage:   { sprite: 'mage',       speed: 1.00, hearts: 3, theme: 'hero_fire' },   // 불꽃 법사(기본)
    frost_witch: { sprite: 'mage_frost', speed: 1.08, hearts: 2, theme: 'hero_frost',
      boltSlow: 0.7, boltSlowTime: 1 },             // 마법탄에 맞은 몹 1초간 30% 느려짐
    earth_sage:  { sprite: 'mage_earth', speed: 0.92, hearts: 4, theme: 'hero_earth',
      quakeSlow: 0.6, quakeTime: 2, quakeRange: 1.5 },   // 메테오 폭발 후 2초간 반경 1.5배 안 몹 40% 느려짐
  },

  // ------------------------------------------------------------ 이펙트 상한 [저, 중, 고]
  effects: {
    maxCorpses:   [300, 1000, 2000],
    maxParticles: [800, 2000, 4000],
    maxCraters:   [0, 20, 40],
    shadows:      [false, true, true],
    maxPopups: 20,
    craterLife: 25,
    shakeMax: 7,
  },

  // ------------------------------------------------------------ 자동 화질
  quality: {
    downFps: 45,           // 최근 2초 평균이 이보다 낮으면 한 단계 낮춤
    upFps: 58,             // 6초 동안 이보다 높으면 한 단계 올림
    window: 2,
  },

  // ------------------------------------------------------------ 픽셀 변환
  pixel: {
    // 고정 32색 팔레트 (순서 바꾸지 마세요 — 코드 도형 텍스처가 인덱스로 참조)
    palette: [
      '#000000', '#1a1c2c', '#5d275d', '#b13e53', '#ef7d57', '#ffcd75', '#a7f070', '#38b764',
      '#257179', '#29366f', '#3b5dc9', '#41a6f6', '#73eff7', '#f4f4f4', '#94b0c2', '#566c86',
      '#333c57', '#7a4a2a', '#a86b3c', '#d9a066', '#6b3e75', '#9b5fc0', '#e04040', '#ff9040',
      '#ffe040', '#1e4d2b', '#3e7a3a', '#5f9e48', '#2a1a12', '#4a4a58', '#8a8a96', '#ffffff',
    ],
    outlineIndex: 1,       // 자동 외곽선 색 (팔레트 인덱스)
    keyColor: [255, 0, 255],
    keyTolerance: 110,     // 마젠타 배경 허용 오차 (RGB 거리)
    alphaThreshold: 128,
    darkLuma: 60,          // 이보다 어두우면 외곽선 픽셀로 간주
    outlineNeeded: 0.55,   // 가장자리 중 어두운 픽셀 비율이 이보다 낮으면 외곽선 추가
    // 이미 도트로 찍힌 작은 이미지(가로·세로 모두 nativeMax 이하)는 줄이지 않고 원래 해상도 그대로 쓴다
    // (투명 테두리 잘라내기 + 반투명 제거만). 큰 AI 원본만 size 로 변환.
    nativeMax: 128,
    snapNative: false,     // true 면 원래 해상도 이미지도 32색 팔레트로 맞춤
  },

  // 이미지 파일과 목표 픽셀 크기 [가로, 세로] — 큰 원본을 변환할 때와 이미지가 없어 도형으로 그릴 때의 크기
  // faceLeft: 그림이 왼쪽을 보고 있음(좌우 반전 기준을 뒤집음)
  sprites: {
    mage:             { file: 'mage.png',             size: [24, 24] },
    mage_frost:       { file: 'mage_frost.png',       size: [24, 24], fit: true },   // 서리 마녀(없으면 법사 색 바꿈)
    mage_earth:       { file: 'mage_earth.png',       size: [24, 24], fit: true },   // 대지의 현자
    mob_slime:        { file: 'mob_slime.png',        size: [12, 12] },
    mob_bat:          { file: 'mob_bat.png',          size: [14, 10] },
    mob_wolf:         { file: 'mob_wolf.png',         size: [16, 16] },
    mob_mushroom:     { file: 'mob_mushroom.png',     size: [12, 14] },
    mob_goblin:       { file: 'mob_goblin.png',       size: [14, 14] },
    mob_skeleton:     { file: 'mob_skeleton.png',     size: [16, 16] },
    mob_ghost:        { file: 'mob_ghost.png',        size: [16, 16] },
    mob_orc:          { file: 'mob_orc.png',          size: [18, 18] },
    mob_golem:        { file: 'mob_golem.png',        size: [20, 20] },
    mob_darkknight:   { file: 'mob_darkknight.png',   size: [18, 20] },
    mob_boss:         { file: 'mob_boss.png',         size: [40, 40] },
    boss_slimeking:   { file: 'boss_slimeking.png',   size: [40, 34] },
    boss_lich:        { file: 'boss_lich.png',        size: [36, 40] },
    boss_dragon:      { file: 'boss_dragon.png',      size: [40, 40], faceLeft: true },
    meteor_fire:      { file: 'meteor_fire.png',      size: [24, 24] },
    meteor_ice:       { file: 'meteor_ice.png',       size: [24, 24] },
    meteor_poison:    { file: 'meteor_poison.png',    size: [24, 24] },
    meteor_lightning: { file: 'meteor_lightning.png', size: [24, 24] },
    meteor_dark:      { file: 'meteor_dark.png',      size: [24, 24] },
    meteor_gold:      { file: 'meteor_gold.png',      size: [24, 24] },
    fx_explosion:     { file: 'fx_explosion.png',     size: [24, 24] },
    fx_hit:           { file: 'fx_hit.png',           size: [16, 16] },
    fx_levelup:       { file: 'fx_levelup.png',       size: [32, 20] },
    item_expgem:      { file: 'item_expgem.png',      size: [10, 8] },
    item_coin:        { file: 'item_coin.png',        size: [10, 10] },
    // 맵 아이템: 16×16(보물상자 20×20). 더 큰 도트 그림은 이 크기로 줄여서 씀(fit)
    item_star:        { file: 'item_star.png',        size: [16, 16], fit: true },
    item_potion:      { file: 'item_potion.png',      size: [16, 16], fit: true },
    item_heart:       { file: 'item_heart.png',       size: [16, 16], fit: true },
    item_crystal:     { file: 'item_crystal.png',     size: [16, 16], fit: true },
    item_boots:       { file: 'item_boots.png',       size: [16, 16], fit: true },
    item_feather:     { file: 'item_feather.png',     size: [16, 16], fit: true },
    item_magnet:      { file: 'item_magnet.png',      size: [16, 16], fit: true },
    item_coins:       { file: 'item_coins.png',       size: [16, 16], fit: true },
    item_scroll:      { file: 'item_scroll.png',      size: [16, 16], fit: true },
    item_hourglass:   { file: 'item_hourglass.png',   size: [16, 16], fit: true },
    item_bomb:        { file: 'item_bomb.png',        size: [16, 16], fit: true },
    item_thunder:     { file: 'item_thunder.png',     size: [16, 16], fit: true },
    item_orb:         { file: 'item_orb.png',         size: [16, 16], fit: true },
    item_ring:        { file: 'item_ring.png',        size: [16, 16], fit: true },
    item_lens:        { file: 'item_lens.png',        size: [16, 16], fit: true },
    item_twin:        { file: 'item_twin.png',        size: [16, 16], fit: true },
    item_fury:        { file: 'item_fury.png',        size: [16, 16], fit: true },
    item_chest:       { file: 'item_chest.png',       size: [20, 20], fit: true },
    // 보물
    chest_wood:       { file: 'chest_wood.png',       size: [20, 20], fit: true },
    chest_gold:       { file: 'chest_gold.png',       size: [20, 20], fit: true },
    mimic:            { file: 'mimic.png',            size: [24, 24], fit: true },
    altar:            { file: 'altar.png',            size: [40, 40], fit: true },
    rune:             { file: 'rune.png',             size: [12, 12], fit: true },
    prop_tree:        { file: 'prop_tree.png',        size: [22, 24] },
    prop_rock:        { file: 'prop_rock.png',        size: [16, 14] },
    prop_bush:        { file: 'prop_bush.png',        size: [18, 14] },
    prop_ruin:        { file: 'prop_ruin.png',        size: [16, 26] },
    ground:           { file: 'ground.png',           size: [32, 32], tile: true },
    ground_dirt:      { file: 'ground_dirt.png',      size: [32, 32], tile: true },
    title_bg:         { file: 'title_bg.png',         size: [180, 320], tile: true },
    icon:             { file: 'icon-512.png',         size: [32, 32], exportScale: 16 },
  },

  // HTML UI 에만 쓰는 이미지(변환 없이 그대로 표시, 없으면 기존 CSS 모양)
  uiImages: [
    'ui_frame', 'ui_button', 'ui_button_pressed', 'ui_skull', 'ui_clock', 'ui_crown', 'ui_gear', 'ui_heart',
    'ui_medal_gold', 'ui_medal_silver', 'ui_medal_bronze',
    'icon_multimeteor', 'icon_bigmeteor', 'icon_speed', 'icon_cooldown', 'icon_hp', 'icon_shield',
    'item_magnet', 'item_chest', 'fx_explosion', 'meteor_fire_down',
    'ui_dash', 'ui_shield', 'ui_dashup',
    'item_star', 'item_potion', 'item_heart', 'item_crystal', 'item_boots', 'item_feather', 'item_coins', 'item_scroll',
    'item_hourglass', 'item_bomb', 'item_thunder', 'item_orb', 'item_ring', 'item_lens', 'item_twin', 'item_fury',
    'relic_gravity', 'relic_echo', 'relic_phoenix', 'relic_rain', 'relic_heart', 'relic_spring',
    'relic_shadow', 'relic_comet', 'relic_rift', 'relic_crown', 'relic_lens', 'relic_bolt',
  ],

  // ------------------------------------------------------------ 평원 장식(그림만, 판정 없음)
  decor: {
    chunk: 200,            // 이 크기(월드) 칸마다 장식 하나가 있을 확률
    chance: 0.16,
    kinds: ['prop_bush', 'prop_rock', 'prop_tree', 'prop_bush', 'prop_rock', 'prop_ruin'],
    dirtThreshold: 0.68,   // 흙 지대 비율(값이 클수록 적음)
  },

  // ------------------------------------------------------------ 소리
  // 음악 파일(audio/*.mp3)이 있으면 그것, 없으면 js/music.js 의 내장 FM 음악. loopStart/loopEnd(초)는 앞뒤 무음을 잘라낸 뒤 기준, 0 이면 끝까지
  audio: {
    musicVolume: 0.7,      // 기본값(설정에서 바꾸면 저장)
    sfxVolume: 0.8,
    inGameMusic: 0.7,      // 경기 중에는 효과음이 들리게 음악을 이만큼으로
    duckLevel: 0.35,       // 메테오 폭발 순간 음악을 이만큼으로
    duckTime: 0.3,         // 줄였다 되돌리는 시간(초)
    crossfade: 1.5,        // 곡 전환 시간(초)
    battleMobs: 20000,     // 필드 몹이 이보다 많거나 보스가 있으면 위기 음악
    battleRelease: 10,     // 조건이 풀리고 이만큼 지나면 되돌아감
    trimThreshold: 0.003,  // mp3 앞뒤 무음 판정(진폭)
    tracks: {
      title:  { file: 'bgm_title.mp3',  loop: true,  loopStart: 0, loopEnd: 0 },
      field:  { file: 'bgm_field.mp3',  loop: true,  loopStart: 0, loopEnd: 0 },
      battle: { file: 'bgm_battle.mp3', loop: true,  loopStart: 0, loopEnd: 0 },
      star:   { file: 'bgm_star.mp3',   loop: true,  loopStart: 0, loopEnd: 0 },
      // 캐릭터 테마·사건 곡(파일이 없으면 fallback 의 내장 곡)
      hero_fire:  { file: 'bgm_hero_fire.mp3',  loop: true, loopStart: 0, loopEnd: 0, fallback: 'field' },
      hero_frost: { file: 'bgm_hero_frost.mp3', loop: true, loopStart: 0, loopEnd: 0, fallback: 'field' },
      hero_earth: { file: 'bgm_hero_earth.mp3', loop: true, loopStart: 0, loopEnd: 0, fallback: 'field' },
      wolf:   { file: 'bgm_wolf.mp3',   loop: true, loopStart: 0, loopEnd: 0, fallback: 'battle' },
      golem:  { file: 'bgm_golem.mp3',  loop: true, loopStart: 0, loopEnd: 0, fallback: 'battle' },
      siege:  { file: 'bgm_siege.mp3',  loop: true, loopStart: 0, loopEnd: 0, fallback: 'battle' },
      boss:   { file: 'bgm_boss.mp3',   loop: true, loopStart: 0, loopEnd: 0, fallback: 'battle' },
      ruin:   { file: 'bgm_ruin.mp3',   loop: true, loopStart: 0, loopEnd: 0, fallback: 'battle' },
      meteor:   { file: 'jingle_meteor.mp3',   loop: false },   // 레벨 5 메테오 습득
      levelup:  { file: 'jingle_levelup.mp3',  loop: false },
      gameover: { file: 'jingle_gameover.mp3', loop: false },
      bossj:     { file: 'jingle_boss.mp3',      loop: false, fallback: 'jboss' },
      chest:     { file: 'jingle_chest.mp3',     loop: false, fallback: 'chest' },
      relic:     { file: 'jingle_relic.mp3',     loop: false, fallback: 'relic' },
      resonance: { file: 'jingle_resonance.mp3', loop: false, fallback: 'resonance' },
      // 메테오를 부를 때: 장착한 모양의 징글(jingle_meteor_<모양>.mp3)
      ...Object.fromEntries(['fire', 'ice', 'poison', 'lightning', 'dark', 'gold'].map((k) => ['call_' + k, { file: 'jingle_meteor_' + k + '.mp3', loop: false, fallback: 'meteorcall' }])),
    },
    maxTracks: 4,          // 메모리에 올리는 긴 곡 최대 수
    hold: 5,               // 조건이 끝나고 이만큼(초) 뒤 다음 순위 곡으로
    callDuck: 0.5,         // 메테오 징글 동안 배경음악 절반
    raidMusic: 15,         // 포위·늑대·골렘 습격 곡을 트는 시간(초)
  },

  // ------------------------------------------------------------ 랭킹 (Supabase)
  // 비워 두면 오프라인 모드(내 기기 기록만 표시)
  ranking: {
    supabaseUrl: SUPABASE_URL,
    supabaseKey: SUPABASE_KEY,
    timeoutMs: 5000,
    season: RANKING_SEASON,
    cacheSec: 30,          // 랭킹 화면: 같은 탭은 이 시간 동안 다시 불러오지 않음
    rankedDifficulty: 'normal',   // 이 난이도만 랭킹에 등록
  },

  // ------------------------------------------------------------ 벤치마크
  bench: {
    autoMeteorEvery: 10,
    // ?autoplay=1 : 봇이 autoplayGames 판을 하고 평균 생존 시간·도달 레벨을 콘솔과 화면에 출력
    autoplayGames: 10,
    autoplayMaxSec: 900,
    autoplaySpeed: 40,     // 한 화면 프레임에 돌리는 게임 프레임 수(빨리 감기)
    circleRadius: 420,
    circleSpeed: 0.35,     // 라디안/초
  },
};

// =====================================================================
//  난이도 프리셋. CONFIG.difficulty 의 값을 시작할 때 CONFIG 에 덮어씀.
//  easy = 1차 수정 값(보관), normal = 2차 수정 값(지금 쓰는 값), hard = 더 어렵게.
//  랭킹은 ranking.rankedDifficulty(normal)만 등록. 화면에는 아직 난이도 선택이 없음.
// =====================================================================
const WEIGHTS_V1 = [
  [0,   [1.00, 0,    0,    0,    0,    0,    0,    0,    0,    0   ]],
  [30,  [0.75, 0.25, 0,    0,    0,    0,    0,    0,    0,    0   ]],
  [60,  [0.50, 0.20, 0.15, 0.15, 0,    0,    0,    0,    0,    0   ]],
  [120, [0.35, 0.15, 0.15, 0.10, 0.15, 0.10, 0,    0,    0,    0   ]],
  [180, [0.25, 0.12, 0.13, 0.08, 0.14, 0.12, 0.08, 0.08, 0,    0   ]],
  [270, [0.18, 0.10, 0.12, 0.06, 0.12, 0.12, 0.10, 0.10, 0.07, 0.03]],
  [360, [0.12, 0.10, 0.10, 0.05, 0.10, 0.12, 0.10, 0.12, 0.12, 0.07]],
  [480, [0.10, 0.10, 0.10, 0.04, 0.08, 0.12, 0.10, 0.13, 0.13, 0.10]],
];
// 늑대 1분부터, 골렘 2분부터(typeFrom 으로 그 전에는 절대 안 나옴)
const WEIGHTS_V2 = [
  [0,   [1.00, 0,    0,    0,    0,    0,    0,    0,    0,    0   ]],
  [30,  [0.75, 0.25, 0,    0,    0,    0,    0,    0,    0,    0   ]],
  [60,  [0.50, 0.20, 0.15, 0.15, 0,    0,    0,    0,    0,    0   ]],
  [120, [0.33, 0.15, 0.15, 0.10, 0.15, 0.10, 0,    0,    0.02, 0   ]],
  [180, [0.24, 0.12, 0.13, 0.08, 0.13, 0.12, 0.08, 0.07, 0.03, 0   ]],
  [270, [0.18, 0.10, 0.12, 0.06, 0.12, 0.12, 0.10, 0.10, 0.07, 0.03]],
  [360, [0.12, 0.10, 0.10, 0.05, 0.10, 0.12, 0.10, 0.12, 0.12, 0.07]],
  [480, [0.10, 0.10, 0.10, 0.04, 0.08, 0.12, 0.10, 0.13, 0.13, 0.10]],
];
export const DIFFICULTY = {
  easy: {   // 1차 수정(2026-11-20 오전) 값
    player: { regenDelay: 6, regenEvery: 5, hurtInvuln: 1.5 },
    mobs: { easeTime: 180, speedMul: 1 },
    spawn: { curveMul: 1, typeFrom: {}, typeWeights: WEIGHTS_V1, ring: { on: false } },
    items: { starTime: 7, starMaxField: 99, heartMax: 6, kindWeight: {} },
  },
  normal: { // 2차 수정: 속도감은 그대로, 조금 더 어렵게
    player: { regenDelay: 8, regenEvery: 8, hurtInvuln: 1.0 },
    mobs: { easeTime: 90, speedMul: 1.1 },          // 가장 빠른 늑대 112×1.1=123 < 법사 161
    spawn: {
      curveMul: 1.3, typeFrom: { wolf: 60, golem: 120 }, typeWeights: WEIGHTS_V2,
      // 포위 무리: 1분 30초부터 30~40초마다 법사를 빙 둘러싼 고리로 나타나 조여옴. 한 군데 틈이 있음
      ring: { on: true, from: 90, everyMin: 30, everyMax: 40, warn: 2, radius: 360, count: 120, countPerMin: 25, countMax: 320, rows: 2, rowGap: 22, gapAngle: 0.75 },
    },
    items: { starTime: 5, starMaxField: 1, heartMax: 5, kindWeight: { potion: 0.5 } },
  },
  hard: {
    player: { regenDelay: 10, regenEvery: 10, hurtInvuln: 0.8 },
    mobs: { easeTime: 45, speedMul: 1.18 },
    spawn: {
      curveMul: 1.6, typeFrom: { wolf: 45, golem: 90 }, typeWeights: WEIGHTS_V2,
      ring: { on: true, from: 60, everyMin: 24, everyMax: 30, warn: 2, radius: 340, count: 150, countPerMin: 35, countMax: 400, rows: 2, rowGap: 20, gapAngle: 0.6 },
    },
    items: { starTime: 4, starMaxField: 1, heartMax: 4, kindWeight: { potion: 0.35 } },
  },
};
CONFIG.difficulty = 'normal';

/** 난이도 프리셋을 CONFIG 에 덮어씀(섹션 안의 키만 바꿈) */
export function applyDifficulty(name) {
  const pr = DIFFICULTY[name] || DIFFICULTY.normal;
  for (const sec in pr) Object.assign(CONFIG[sec], pr[sec]);
  CONFIG.difficulty = DIFFICULTY[name] ? name : 'normal';
}
applyDifficulty(CONFIG.difficulty);

// 내부 계산용 파생 값
export const TICK_DT = 1 / CONFIG.sim.tickRate;
