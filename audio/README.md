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

- 앞뒤 무음은 불러올 때 잘라냅니다.
- 반복 구간은 `js/config.js` 의 `audio.tracks.<이름>.loopStart / loopEnd`(초, 무음 자른 뒤 기준)로 정합니다. 0 이면 처음부터 끝까지.
