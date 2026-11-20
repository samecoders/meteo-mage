# image/ 폴더

비어 있어도 게임은 코드로 만든 픽셀 도형으로 실행됩니다. 아래 이름으로 파일을 넣으면 코드 수정 없이 자동 교체됩니다.
원본(AI 이미지)을 그대로 넣어도 로드할 때 `js/pixel.js`가 저해상도 스프라이트로 바꾸며, `tools/pixelize.html`로 미리 변환해 넣으면 로딩이 더 빠릅니다.

| 파일 | 목표 크기 | 비고 |
|---|---|---|
| mage.png | 24×24 | 오른쪽을 보는 법사 |
| mob_slime.png | 12×12 | 오른쪽을 봄 |
| mob_wolf.png | 16×16 | 오른쪽을 봄 |
| mob_golem.png | 20×20 | 오른쪽을 봄 |
| mob_boss.png | 40×40 | 오른쪽을 봄 |
| ground.png | 32×32 | 이음매 없는 반복 타일 |
| title_bg.jpg (또는 title_bg.png) | 180×320 | 세로 배경 |
| icon-512.png | 32×32 → 512×512 저장 | PWA 아이콘 |
| meteor_fire.png / meteor_ice.png / meteor_poison.png / meteor_lightning.png / meteor_dark.png / meteor_gold.png | 24×24 | 왼쪽 아래로 떨어지는 모양(꼬리는 오른쪽 위) |

배경은 순수 마젠타(#FF00FF)로 만들어 주세요. 글자는 넣지 않습니다.

## 2026-11-19 잘라 넣은 16비트 에셋

`Gemini_Generated_Image_*.png` 원본 3장을 잘라 만든 파일입니다. 스프라이트는 원본의 도트 격자에 맞춰 줄인 실제 해상도이고, 배경은 투명(알파 0, 색상값은 마젠타)입니다. 비율이 찌그러지지 않도록 정사각형 캔버스 가운데에 배치했습니다.

- 기존 코드가 읽는 이름: mage, mob_slime, mob_wolf, mob_golem, mob_boss(오거), ground, title_bg(180×320), icon-512, meteor_fire/ice/poison/lightning/dark/gold(왼쪽 아래로 떨어지게 45° 회전)
- 똑바로 떨어지는 메테오 원본: meteor_*_down.png
- 추가 주인공: hero_pyromancer, hero_icewitch, hero_necromancer, hero_apprentice
- 추가 몹: mob_bat, mob_mushroom, mob_goblin, mob_skeleton, mob_ghost, mob_orc, mob_darkknight
- 추가 보스: boss_slimeking, boss_lich, boss_dragon
- 이펙트: fx_hit, fx_explosion, fx_crater, fx_levelup
- 드롭 아이템: item_expgem, item_coin, item_potion, item_magnet, item_chest
- 장식물: prop_tree, prop_rock, prop_bush, prop_ruin, 바닥 타일 ground_dirt
- 스킬 아이콘: icon_multimeteor, icon_bigmeteor, icon_speed, icon_cooldown, icon_hp, icon_shield
- HUD 아이콘: ui_heart, ui_skull, ui_crown, ui_medal_gold, ui_medal_silver, ui_medal_bronze, ui_clock, ui_gear
- UI 조각: ui_frame(9-slice), ui_button, ui_button_pressed

추가 파일은 `js/config.js` 의 `sprites` / `uiImages` 에 등록되어 있습니다(2026-11-19). 아직 쓰지 않는 것: fx_crater, meteor_*_down(불꽃 제외), icon_hp, ui_heart, ui_gear.
가로·세로 128px 이하 이미지는 크기를 줄이지 않고 원래 도트 해상도 그대로 씁니다.

## 2026-11-20 아이템 18종 + 버튼 아이콘 3종

`Gemini_Generated_Image_v2.png`를 잘라 만든 파일입니다. 배경은 투명이고 원래 도트 해상도(약 22~31px, 정사각형 캔버스)입니다.

- 아이템: item_star, item_potion, item_heart, item_crystal, item_boots, item_feather, item_magnet, item_coins, item_scroll, item_hourglass, item_bomb, item_thunder, item_orb, item_ring, item_lens, item_twin, item_fury, item_chest
- 버튼 아이콘: ui_dash, ui_shield, ui_dashup
- item_potion, item_magnet, item_chest는 새 그림으로 바꿨고, 이전 그림은 `*_v1.png`로 남겨 두었습니다.
