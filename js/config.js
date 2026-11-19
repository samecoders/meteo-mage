// =====================================================================
//  메테오 법사 — 모든 밸런스·성능 수치는 이 파일 한 곳에서 조절합니다.
//  (시간 단위: 초, 거리 단위: 월드 단위. 내부 화면 1픽셀 = 월드 2단위)
// =====================================================================

export const CONFIG = {
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
      { key: 'slime',      speed: 78,  hp: 6, dmg: 6,  radius: 8,  exp: 1, mass: 0.8, sprite: 'mob_slime' },
      { key: 'bat',        speed: 108, hp: 2, dmg: 3,  radius: 8,  exp: 1, mass: 0.5, sprite: 'mob_bat', wobble: true },
      { key: 'wolf',       speed: 112, hp: 4, dmg: 5,  radius: 11, exp: 1, mass: 1.5, sprite: 'mob_wolf' },
      { key: 'mushroom',   speed: 56,  hp: 10, dmg: 7, radius: 9,  exp: 1, mass: 1.0, sprite: 'mob_mushroom' },
      { key: 'goblin',     speed: 104, hp: 8, dmg: 8,  radius: 10, exp: 2, mass: 1.2, sprite: 'mob_goblin' },
      { key: 'skeleton',   speed: 86,  hp: 12, dmg: 8, radius: 11, exp: 2, mass: 1.4, sprite: 'mob_skeleton' },
      { key: 'ghost',      speed: 96,  hp: 5, dmg: 5,  radius: 11, exp: 2, mass: 0,   sprite: 'mob_ghost', ghost: true },
      { key: 'orc',        speed: 70,  hp: 30, dmg: 12, radius: 13, exp: 3, mass: 2.2, sprite: 'mob_orc' },
      { key: 'golem',      speed: 46,  hp: 45, dmg: 15, radius: 15, exp: 4, mass: 3.0, sprite: 'mob_golem' },
      { key: 'darkknight', speed: 108, hp: 60, dmg: 14, radius: 13, exp: 6, mass: 2.2, sprite: 'mob_darkknight' },
    ],
    accel: 0.18,           // 틱당 목표 속도로 다가가는 비율(관성)
    pressureK: 12,         // 밀도 밀어내기 힘 계수 (붐빈 칸 → 덜 붐빈 칸). 압력 = (칸의 mass 합)²
    pressureCap: 2.2,      // 밀어내기 속도 상한 (몹 속도의 배수)
    farSkip: 1500,         // 법사에서 이 거리(축별) 밖의 몹은 밀어내기 생략 (기기와 무관한 고정값)
    despawnFactor: 1.75,   // 스폰 반경 × 이 값 보다 멀어지면 반대편으로 재배치
    flashTicks: 3,         // 피격 깜빡임 틱 수
  },

  // ------------------------------------------------------------ 스폰
  spawn: {
    // [게임 시간(초), 필드 목표 몹 수] — 사이 값은 선형 보간
    curve: [
      [0, 40], [20, 150], [45, 500], [90, 2000], [150, 6000], [210, 12000],
      [270, 20000], [330, 29000], [400, 39000], [480, 52000], [600, 60000],
    ],
    perTickMax: 220,       // 한 틱에 생성할 최대 몹 수(대규모 스폰을 여러 틱에 분산)
    radius: 1100,          // 기본 스폰 반경(월드). 줌 아웃 단계에 비례해 커짐
    groupMin: 8,           // 무리 크기
    groupMax: 160,
    groupPerTarget: 1 / 250, // 목표 몹 수 × 이 값 = 무리 크기
    fronts: 3,             // 동시에 밀려오는 물결 방향 수
    frontDrift: 0.35,      // 물결 방향이 초당 바뀌는 정도(라디안)
    randomGroupChance: 0.25, // 무작위 방향 무리 비율
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
    ],
  },

  // ------------------------------------------------------------ 떨어지는 아이템
  items: {
    max: 16,
    life: 25,
    pickupRadius: 22,
    dropMinKills: 300,     // 한방에 이만큼 이상 잡으면 아이템이 떨어질 수 있음
    potionChance: 0.12,    // 체력 물약: 체력 +potionHeal
    potionHeal: 35,
    magnetChance: 0.07,    // 자석: 필드의 모든 마력 구슬을 끌어옴
    chestCards: 1,         // 보스 보물상자: 보너스 카드 장수
  },

  // ------------------------------------------------------------ 법사
  player: {
    speed: 124,            // 법사보다 빠른 몹이 없게(가장 빠른 박쥐·늑대·흑기사 108~112). 2026-11-19 자동 플레이 측정으로 조정
    accel: 14,             // 가속/감속 보간 강도
    radius: 8,             // 몹 접촉 판정 반경
    // ---- 체력: 한 번 닿아도 바로 죽지 않음
    hp: 100,               // 최대 체력
    hurtInvuln: 0.8,       // 피해를 입은 뒤 무적 시간(깜빡임)
    knockRadius: 120,      // 피해를 입을 때 주변 몹을 밀쳐내는 반경(빠져나갈 틈)
    knockImpulse: 420,
    regen: 2.5,            // 초당 자연 회복
    regenDelay: 4,         // 마지막 피해 후 이 시간이 지나야 회복 시작
  },

  // ------------------------------------------------------------ 대시
  dash: {
    distance: 140,
    duration: 0.15,
    cooldown: 4,
    upgradePct: 0.2,       // 대시 강화 1단계당 거리 +20%
    maxUpgrades: 5,
    afterimages: 4,
  },

  // ------------------------------------------------------------ 마력
  mana: {
    max: 100,
    start: 50,             // 판 시작 때 마력(첫 메테오를 빨리 쓰게)
    regen: 2.4,            // 기본 초당 충전
    nearRadius: 230,       // 주변 몹 수를 세는 반경
    nearK: 1.2,            // 초당 추가 충전 = min(nearCap, nearK × log2(1 + 주변 몹 수))
    nearCap: 10,
    nearMissBand: 45,      // 폭발 반경 바로 바깥 이 거리 이내면 아슬아슬 보너스
    nearMissBonus: 20,     // 아슬아슬 보너스(마력 %)
  },

  // ------------------------------------------------------------ 메테오
  meteor: {
    radius: 120,           // 기본 폭발 반경 (중앙 메테오로 바꾸며 105→120: 봇 측정으로 이전 생존 시간에 맞춤)
    power: 10,             // 기본 위력(중심 피해)
    edgeDamage: 0.5,       // 가장자리 피해 비율
    fallTime: 1.2,
    fastFallTime: 0.9,
    rangeCardPct: 0.15,
    powerCardPct: 0.30,
    twinDelay: 0.5,
    target: 'center',      // 'center': 화면 중앙(법사)에 떨어지고 낙하 중 법사를 따라감, 법사는 피해 없음 / 'tap': 탭한 자리
    castGuard: true,       // target 'center': 메테오가 떨어지는 동안 법사는 피해·밀쳐내기 없음(몹이 모여들어 한꺼번에 터짐)
    selfDamage: 50,        // target 'tap' 일 때만: 자기 메테오 폭발에 휘말렸을 때 피해(대시로 피할 수 없음)
    shockRange: 1.7,       // 반경 × 이 값까지 충격파로 밀어냄
    shockImpulse: 300,
    fireDuration: 3,
    fireDps: 0.9,          // 화염 지대 초당 피해 = 위력 × 이 값
    hitstopMin: 0.03,
    hitstopMax: 0.12,
    hitstopKills: 3000,    // 이 킬 수에서 최대 히트스톱
    maxActive: 8,
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
    expBase: 100,          // Lv1→2 필요 경험치
    expGrowth: 2.0,        // 레벨마다 필요 경험치 배율(지수)
    killsPerGold: 10,      // 10킬당 골드 1
    comboMultK: 0.35,      // 한방 배율 = 1 + K × log10(1 + 킬 수)
    comboGoldBonus: [[100, 5], [500, 30], [1000, 80], [3000, 300], [8000, 1000]],
    specialEvery: 5,
    levelUpDelay: 0.6,     // 레벨업 카드가 뜨기 전 대기(게임 시간)
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

  // ------------------------------------------------------------ 주인공 모습(꾸미기 전용 — 능력치 완전히 같음) 가격
  heroes: {
    prices: { mage: 0, apprentice: 1500, pyromancer: 4000, icewitch: 8000, necromancer: 16000 },
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
    hero_apprentice:  { file: 'hero_apprentice.png',  size: [24, 24] },
    hero_pyromancer:  { file: 'hero_pyromancer.png',  size: [24, 24] },
    hero_icewitch:    { file: 'hero_icewitch.png',    size: [24, 24] },
    hero_necromancer: { file: 'hero_necromancer.png', size: [24, 24] },
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
    item_potion:      { file: 'item_potion.png',      size: [10, 12] },
    item_magnet:      { file: 'item_magnet.png',      size: [12, 12] },
    item_chest:       { file: 'item_chest.png',       size: [16, 14] },
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
  ],

  // ------------------------------------------------------------ 평원 장식(그림만, 판정 없음)
  decor: {
    chunk: 200,            // 이 크기(월드) 칸마다 장식 하나가 있을 확률
    chance: 0.16,
    kinds: ['prop_bush', 'prop_rock', 'prop_tree', 'prop_bush', 'prop_rock', 'prop_ruin'],
    dirtThreshold: 0.68,   // 흙 지대 비율(값이 클수록 적음)
  },

  // ------------------------------------------------------------ 랭킹 (Supabase)
  // 비워 두면 오프라인 모드(내 기기 기록만 표시)
  ranking: {
    supabaseUrl: '',       // 예: 'https://abcd1234.supabase.co'
    supabaseAnonKey: '',   // 프로젝트 Settings → API 의 anon public 키
    timeoutMs: 6000,
  },

  // ------------------------------------------------------------ 벤치마크
  bench: {
    autoMeteorEvery: 10,
    circleRadius: 420,
    circleSpeed: 0.35,     // 라디안/초
  },
};

// 내부 계산용 파생 값
export const TICK_DT = 1 / CONFIG.sim.tickRate;
