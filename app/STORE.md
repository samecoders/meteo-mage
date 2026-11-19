# 메테오 법사 — 구글 플레이 출시 안내

이 폴더(`app/`)는 게임을 안드로이드 앱으로 감싸는 Capacitor 프로젝트입니다. 게임 파일은 상위 폴더에서 `www/`로 복사해서 앱 안에 넣습니다(인터넷 없이도 실행됨).

- 패키지 이름(앱 ID): `io.github.samecoders.meteormage` — **한 번 올리면 영원히 못 바꿉니다.** 바꾸려면 첫 업로드 전에 `capacitor.config.json`, `android/app/build.gradle`, `MainActivity.java` 폴더 경로를 함께 바꾸세요.
- 대상 API 36 (2026년 현재 구글 플레이 신규 앱 기준 충족), 최소 Android 7.0 (API 24)
- 세로 고정, 상태바·내비게이션바 숨김, 게임 중 화면 꺼짐 방지, 뒤로 버튼(게임 중 → 일시정지, 타이틀 → 앱 종료)
- 앱 이름은 폰 언어를 따라 12개 언어로 표시(한국어: 메테오 법사)

---

## 1. 출시까지 순서 (처음 한 번)

| 단계 | 누가 | 내용 |
|---|---|---|
| 1 | 직접 | [Play Console](https://play.google.com/console)에서 개발자 계정 만들기 (개인, 25달러 1회, 신분 확인 며칠 걸림) |
| 2 | 직접 | 업로드 키 만들기 (아래 2절) |
| 3 | 명령 | 출시용 번들(.aab) 만들기: `npm run bundle` |
| 4 | 직접 | Play Console에서 앱 만들기 → 스토어 등록정보·정책 항목 입력 (아래 3~5절의 글과 그림 사용) |
| 5 | 직접 | **비공개 테스트**: 테스터 12명 이상이 **14일 연속** 참여 (2023년 11월 이후 만든 개인 계정은 필수) |
| 6 | 직접 | 프로덕션 출시 신청 → 구글 검토(보통 며칠) → 공개 |

신규 개인 계정이면 계정 확인 + 14일 테스트 + 검토로 **첫 출시까지 3주 정도** 잡으세요. 테스터는 지인 12명의 구글 계정(Gmail)을 테스터 목록에 넣고, 각자 초대 링크로 참여한 뒤 앱을 깔아 두면 됩니다.

## 2. 업로드 키 만들기 (직접, 한 번만)

구글 플레이는 앱을 "업로드 키"로 서명해서 올려야 합니다. 비밀번호가 들어가므로 직접 만드세요. `app` 폴더에서:

```powershell
keytool -genkeypair -v -keystore upload-key.jks -alias upload -keyalg RSA -keysize 2048 -validity 10000
```

비밀번호와 이름 등을 물어봅니다. 그다음 `keystore.properties.example`을 `keystore.properties`로 복사하고 비밀번호를 채우세요.

- `upload-key.jks`와 `keystore.properties`는 `.gitignore`에 들어 있어 GitHub에 올라가지 않습니다. **다른 곳(USB, 비밀번호 관리자 등)에 꼭 따로 보관하세요.** 잃어버리면 Play Console에서 업로드 키 재설정을 요청해야 합니다.
- 실제 앱 서명은 구글이 관리합니다(Play 앱 서명, 기본값). 첫 업로드 때 그대로 두면 됩니다.

## 3. 빌드 명령 (`app` 폴더에서)

| 명령 | 하는 일 |
|---|---|
| `npm run sync` | 게임 파일을 `www/`로 복사하고 안드로이드 프로젝트에 반영 |
| `npm run apk` | 테스트용 APK → `android/app/build/outputs/apk/debug/app-debug.apk` (폰에 바로 설치 가능) |
| `npm run bundle` | 출시용 번들 → `android/app/build/outputs/bundle/release/app-release.aab` (Play Console에 올리는 파일) |
| `npm run icons` | `assets/`의 그림으로 앱 아이콘·스플래시 다시 만들기 (`node scripts/make-icons.mjs` 먼저) |
| `node scripts/screenshots.mjs ko en` | 스토어 스크린샷·그래픽 이미지 다시 찍기 (로컬 서버 8081이 떠 있어야 함) |

**업데이트를 올릴 때마다** `android/app/build.gradle`의 `versionCode`를 1씩 올리고(`versionName`은 보이는 버전, 예: "1.1"), `npm run bundle` 후 새 .aab를 올리세요. 게임 코드(js 등)는 상위 폴더에서 고치면 `npm run bundle`이 알아서 복사합니다.

빌드에는 안드로이드 SDK가 필요합니다. 이 PC에는 `D:/Android/Sdk`에 설치돼 있고(C 드라이브 공간 부족으로 D에 둠), `android/local.properties`의 `sdk.dir`이 그곳을 가리킵니다. 테스트용 에뮬레이터는 `D:/Android/avd/meteo_test`.

## 4. 스토어 등록정보 (복사해서 쓰기)

- **앱 이름**: 메테오 법사 / Meteor Mage
- **카테고리**: 게임 › 액션 (또는 아케이드)
- **개인정보처리방침 URL**: https://samecoders.github.io/meteo-mage/privacy.html
- **그래픽 이미지(1024×500)**: `store/feature_ko.png`, `store/feature_en.png`
- **휴대전화 스크린샷(1080×1920)**: `store/screenshots/ko/*.png`, `store/screenshots/en/*.png` (6장씩)
- **앱 아이콘(512×512)**: `../image/icon-512.png`

### 한국어

**앱 이름 (30자 이내)**
```
메테오 법사
```

**간단한 설명 (80자 이내)**
```
몹 수만 마리를 끌어모아 메테오 한 방에! 떨어지기 직전 대시로 탈출하는 서바이벌
```

**자세한 설명**
```
몹을 끌어모아, 하늘을 떨어뜨려라.

화면을 가득 메운 몹 수만 마리. 마법사가 가진 건 마력과 대시, 그리고 메테오 한 발뿐입니다.

■ 이렇게 놉니다
• 화면을 끌어서 이동하세요. 몹을 가까이 끌고 다닐수록 마력이 빨리 찹니다.
• 마력이 가득 차면 탭! 메테오가 지금 서 있는 자리에 떨어집니다.
• 떨어지는 동안 몹을 잔뜩 모았다가, 떨어지기 직전에 대시로 탈출하세요. 늦으면 내 메테오에 내가 맞습니다.
• 한 방에 수천 마리를 쓸어 담는 콤보의 쾌감!

■ 특징
• 버틸수록 늘어나 최대 6만 마리까지 — 슬라임, 박쥐, 늑대, 해골, 오크, 골렘, 흑기사…
• 2분마다 나타나는 보스: 돌진하는 오우거, 갈라지는 슬라임 킹, 해골을 부르는 리치, 불을 뿜는 드래곤
• 레벨업 카드로 메테오를 키우세요: 범위, 위력, 쌍둥이 메테오, 화염 지대, 빠른 낙하…
• 체력 물약, 자석, 보물상자, 쉴드와 대시 강화
• 골드로 메테오 모양(불꽃·얼음·독·번개·암흑·황금)과 주인공(견습생, 화염술사, 얼음 마녀, 강령술사) 구매
• 12개 언어 지원, 인터넷 없이도 플레이

얼마나 오래 버티고, 몇 마리나 쓸어버릴 수 있을까요?
```

### English

**App name (≤30)**
```
Meteor Mage
```

**Short description (≤80)**
```
Lure a horde of thousands, drop one meteor, dash out right before impact!
```

**Full description**
```
Lure the horde. Drop the sky.

Tens of thousands of monsters fill the screen. All the mage has is mana, a dash, and one meteor.

■ How to play
• Drag anywhere to move. The closer you lure the horde, the faster your mana charges.
• When mana is full, tap! The meteor drops right where you stand.
• Gather the horde while it falls, then dash out right before impact. Too slow, and your own meteor hits you.
• Wipe out thousands in a single blast and chase huge combos!

■ Features
• The longer you last, the bigger it gets, up to 60,000 monsters: slimes, bats, wolves, skeletons, orcs, golems, dark knights...
• A boss every two minutes: a charging ogre, a splitting slime king, a skeleton-summoning lich, a fire-breathing dragon
• Level-up cards grow your meteor: radius, power, twin meteors, fire zones, faster fall...
• Health potions, magnets, treasure chests, shields and dash upgrades
• Spend gold on meteor styles (fire, ice, poison, lightning, dark, gold) and heroes (apprentice, pyromancer, ice witch, necromancer)
• 12 languages, plays offline

How long can you survive, and how many can you take down?
```

## 5. 정책 항목 답변 (Play Console › 앱 콘텐츠)

| 항목 | 답 |
|---|---|
| 개인정보처리방침 | https://samecoders.github.io/meteo-mage/privacy.html |
| 광고 | 광고 없음 |
| 앱 액세스 권한 | 모든 기능을 제한 없이 사용 가능(로그인 없음) |
| 콘텐츠 등급(IARC 설문) | 게임 › 폭력: 판타지 몬스터를 처치하는 만화풍 폭력, 사실적 유혈 없음 / 성적 콘텐츠·욕설·약물·도박·사용자 간 소통 없음 / 디지털 구매 없음(골드는 게임 안에서만 획득). 예상 등급: 전체이용가~12세 |
| 타겟층 | **13세 이상**으로 선택 권장(13세 미만을 넣으면 가족 정책 심사가 추가됨) |
| 뉴스 앱 / 정부 앱 / 금융 기능 / 건강 | 아니요 |
| 데이터 보안(Data safety) | 아래 |

**데이터 보안 — 지금 빌드(온라인 랭킹 꺼짐)**: "사용자 데이터를 수집하거나 공유하지 않음". 진행 기록은 기기에만 저장됩니다.

**나중에 랭킹을 켜면**(`js/config.js`의 `ranking.supabaseUrl`·`supabaseKey`를 채우면) 데이터 보안을 이렇게 고치세요:
- 수집함: 개인 정보 › 이름(사용자가 정한 닉네임), 앱 활동 › 기타 사용자 생성 콘텐츠 또는 게임 기록(점수), 기기 또는 기타 ID(앱이 만든 무작위 ID)
- 목적: 앱 기능 / 공유: 안 함 / 전송 중 암호화: 예(HTTPS) / 삭제 요청: 문의 링크로 가능

## 6. 앱에서만 다른 점

- 뒤로 버튼: 게임 중 → 일시정지, 일시정지 → 계속하기, 랭킹·상점·설정 → 뒤로, 결과 화면 → 타이틀, 타이틀 → 앱 종료
- 이 처리는 `js/main.js`의 `setupNativeApp()`에 있고, 웹(GitHub Pages)에서는 아무 일도 하지 않습니다.

---

# 아이폰 (App Store)

맥 없이 **GitHub의 맥**에서 빌드해 App Store Connect로 바로 올립니다(`.github/workflows/ios.yml`). iOS 프로젝트는 `ios/`에 있고, 아이폰 전용·세로 고정·상태바 숨김·암호화 신고 면제가 설정돼 있습니다.

## 직접 해야 하는 일 (한 번)
1. [Apple Developer Program](https://developer.apple.com/programs/) 가입 — **1년 99달러**
2. [App Store Connect](https://appstoreconnect.apple.com) › 앱 › 새로운 앱: 플랫폼 iOS, 이름 `메테오 법사`(또는 Meteor Mage), 번들 ID `io.github.samecoders.meteormage` (목록에 없으면 [Identifiers](https://developer.apple.com/account/resources/identifiers/list)에서 먼저 등록)
3. App Store Connect › 사용자 및 액세스 › 통합 › **App Store Connect API** › 키 생성(액세스: 관리자) → `.p8` 파일 내려받기, 키 ID·Issuer ID 확인
4. 팀 ID: [개발자 계정 › 멤버십](https://developer.apple.com/account) 에 있는 10자리
5. 위 4개 값(팀 ID, 키 ID, Issuer ID, .p8 내용)을 Claude에게 주면 GitHub Secrets 등록과 빌드를 대신 합니다. 직접 하려면 GitHub 저장소 › Settings › Secrets and variables › Actions에 `APPLE_TEAM_ID`, `ASC_KEY_ID`, `ASC_ISSUER_ID`, `ASC_API_KEY` 로 넣고 Actions › iOS build › Run workflow.
6. 빌드가 올라가면(10~20분 뒤 TestFlight에 보임) 앱 정보 입력 → 심사 제출(보통 1~2일)

## App Store 등록정보
- **스크린샷(6.9인치, 1290×2796)**: `store/screenshots-ios/ko/*.png`, `store/screenshots-ios/en/*.png`
- **카테고리**: 게임 › 액션 / 보조: 아케이드
- **개인정보처리방침 URL**: https://samecoders.github.io/meteo-mage/privacy.html
- **지원 URL**: https://github.com/samecoders/meteo-mage/issues
- **앱 개인정보 보호(영양 성분표)**: 지금 빌드는 "데이터를 수집하지 않음". 랭킹을 켜면 구글 플레이 5절과 같은 항목(이름=닉네임, 게임 기록, 기기 ID)을 "앱 기능" 목적, "사용자와 연결 안 됨"으로 신고
- **연령 등급**: 만화 또는 판타지 폭력 "드물게/약하게", 나머지 없음 → 9+ 예상
- **이름(30자)**: 메테오 법사 / Meteor Mage
- **부제(30자)**: 몹을 끌어모아, 하늘을 떨어뜨려라 / Lure the horde. Drop the sky.
- **키워드(100자)**: 메테오,마법사,서바이벌,로그라이크,몹,액션,도트,픽셀,보스,대시 / meteor,mage,survivor,roguelike,horde,action,pixel,arcade,boss,dash
- **설명**: 위 구글 플레이 "자세한 설명"과 같은 글

**업데이트**: 게임을 고치고 push 한 뒤 Actions › iOS build › Run workflow 를 누르면 빌드 번호가 자동으로 올라가 새 빌드가 올라갑니다. 보이는 버전을 바꾸려면 Xcode 프로젝트의 `MARKETING_VERSION`(예: 1.1)을 바꾸세요.
