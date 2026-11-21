# 배경음악 파일 (선택)

이 폴더에 아래 파일을 넣으면 그 파일을 틉니다. 없으면 `js/music.js` 의 내장 음악(FM풍 합성)이 나옵니다.

| 파일 | 쓰는 곳 |
|---|---|
| bgm_title.mp3 | 타이틀 — 반복 |
| bgm_field.mp3 | 평원 기본 — 반복 |
| bgm_battle.mp3 | 위기(보스가 있거나 몹 2만 넘음) — 반복 |
| bgm_star.mp3 | 무적의 별 — 반복 |
| jingle_meteor.mp3 | 레벨 5 메테오 습득 — 한 번 |
| jingle_levelup.mp3 | 레벨 업 — 한 번 |
| jingle_gameover.mp3 | 게임 오버 — 한 번 |
| bgm_hero_earth.mp3 | 푸른 대마법사 테마(웅장하고 듬직한 노현자) — 없으면 bgm_field |
| bgm_field.mp3 | 견습 마법사 테마(경쾌한 모험 행진곡) |
| bgm_hero_frost.mp3 | 얼음 마녀 테마 — 없으면 bgm_field |
| bgm_hero_necro.mp3 | 강령술사 테마(아직 없음) — 없으면 bgm_ruin |
| bgm_hero_fire.mp3 | 화염술사 테마 — 없으면 bgm_field |
| bgm_wolf / bgm_golem / bgm_siege.mp3 | 늑대 무리 습격 / 골렘 행진 / 포위 무리 — 반복 |
| bgm_boss.mp3 | 보스가 필드에 있을 때 — 반복 |
| bgm_ruin.mp3 | 유적 개방 대습격 — 반복(없으면 bgm_siege) |
| jingle_boss / jingle_chest / jingle_relic / jingle_resonance.mp3 | 보스 등장 / 상자 / 유물 / 공명 — 한 번 |
| jingle_meteor_fire / _ice / _poison / _lightning / _dark / _gold.mp3 | 메테오를 부를 때, 장착한 모양별 — 한 번 |

곡 우선순위(높은 순): 무적의 별 > 유적 대습격 > 보스 > 늑대·골렘·포위 습격 > 몹 2만 이상(bgm_battle) > 캐릭터 테마.
조건이 끝나고 5초 뒤 다음 순위로 1.5초 크로스페이드하고, 돌아갈 때는 멈췄던 위치부터 이어 틉니다. 메모리에는 긴 곡을 최대 4곡까지만 둡니다.

- 앞뒤 무음은 불러올 때 잘라냅니다.
- 반복 구간은 `js/config.js` 의 `audio.tracks.<이름>.loopStart / loopEnd`(초, 무음 자른 뒤 기준)로 정합니다. 0 이면 처음부터 끝까지.
