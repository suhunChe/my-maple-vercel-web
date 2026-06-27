# 🍁 MyMaple v5 — 마이 메이플 아카이브

메이플스토리의 세계관·지역·NPC·몬스터·BGM·아카이브 기록을 한곳에서 탐험하는 정적 웹사이트입니다.
PPTX 기획서(V2) 기반으로 새 JSON 명세(`MyMaple_PageInfo`)에 완벽 대응하도록 재작성된 버전입니다.

## 📂 프로젝트 구조

```
mymaple/
├── index.html              # 메인 — 테마관 + 외부 사이트 (MainPage.json 동적 로드)
├── world-select.html       # 세계관 선택 — 메이플/그란디스/마스테리아 가로 슬라이더
├── world-map.html          # 월드맵 — 좌측 지역 리스트 + 중앙 지도 + 핀 + 맵 리스트
├── life-detail.html        # NPC/MOB 아카이브 상세 — 좌측 탭 + 우측 상세 + BGM 자동재생
├── css/
│   └── main.css            # 통합 스타일시트 (메이플 게임 UI 톤)
├── js/
│   ├── common.js           # 공용 유틸 (헤더, 토스트, escapeHtml 등)
│   ├── data-loader.js      # MyMaple_PageInfo JSON 동적 로더 + 캐시
│   └── bgm-player.js       # 하단 고정 BGM 플레이어 (반복 재생)
├── README.md
├── start-server.sh
├── vercel.json
└── MyMaple_PageInfo/       # ⚠️ 사용자가 직접 복사해야 함
    ├── World/
    │   ├── WorldMap/       # 메이플 월드 (계층적 JSON)
    │   └── GWorldMap/      # 그란디스
    ├── Mob/                # 몬스터 (각 ID별 폴더)
    ├── Npc/                # NPC
    ├── Item/               # 아이템
    ├── MapMark/            # 맵 미니아이콘
    ├── MapBGM/             # 필드 BGM (mp3)
    ├── Archive/            # 지역별 아카이브 이미지
    └── Special_Image/
        ├── HomePage_Theme_Image/   # 메인 페이지 카드 (MainPage.json + 이미지)
        ├── Map_Pin/                # dot_*.png + ClickPos.png
        └── Mob_Npc_Icon/           # Mob.png, Npc.png
```

## ⚠️ 시작 전 필수 작업

`MyMaple_PageInfo` 폴더는 용량이 매우 커서 별도로 배포되었습니다.
**프로젝트 폴더 안에 `MyMaple_PageInfo` 폴더를 직접 복사**해 주세요.

복사 후 다음 경로가 존재해야 합니다:
```
mymaple/MyMaple_PageInfo/Special_Image/HomePage_Theme_Image/MainPage.json
mymaple/MyMaple_PageInfo/World/WorldMap/WorldMap.json
mymaple/MyMaple_PageInfo/World/GWorldMap/GWorldMap.json
... (등등)
```

## 🚀 실행 방법

`fetch()`로 JSON을 로드하기 때문에 **반드시 로컬 정적 서버**로 실행해야 합니다.

### Python (추천)
```bash
cd mymaple
python3 -m http.server 8000
# 또는: ./start-server.sh
```
브라우저에서 `http://localhost:8000` 접속.

### 그 외
- Node.js: `npx serve .` 또는 `npx http-server -p 8000`
- VS Code Live Server 확장
- Vercel 배포 (단, MyMaple_PageInfo가 매우 크므로 배포 용량 한도 주의)

## ✨ 주요 기능 (v5)

### 1. **메인 페이지** (`index.html`)
- `MyMaple_PageInfo/Special_Image/HomePage_Theme_Image/MainPage.json`을 동적으로 로드
- `MainPageListDate[]`의 테마 카드 (스토리 / 음악 / 굿즈)
- `bOnline=false`면 카드에 "🔒 업데이트 예정" 배지, 클릭 시 토스트
- `External_link_site[]`의 외부 사이트 카드 (환산 주스탯, 인벤, 스타포스 시뮬레이션)

### 2. **세계관 선택** (`world-select.html`)
- 메이플 월드 / 그란디스 / 마스테리아 가로 슬라이더
- 좌우 화살표로 한 칸씩 스크롤 (PPTX 슬라이드 2)
- 마스테리아는 오프라인 — 클릭 시 토스트

### 3. **월드맵** (`world-map.html`)
- 새 JSON 구조 완벽 대응:
  - 루트 `MapLinkDate[]` (다른 지역으로 진입)
  - 하위 `MapListDate[]` (이 지역의 맵 핀)
  - `sMapData[]` 배열 (한 핀 안의 여러 서브맵)
- 좌측 사이드바에 지역 리스트, 마우스 오버 시 `sListMapUpData_Desc` 툴팁
- 중앙 지도 위에 핀 표시 — `nPinType` 기반 dot 이미지
- 핀 마우스 오버 시 `sToolTip` 표시
- **List 핀 클릭** → 사이드바에 선택 표시 + 지도 위 ClickPos.png 화살표 + sMapData[] 카드 그리드 펼침
- `bIsArchive=true`인 지역은 "📜 아카이브 보기" 버튼 → 모달
- 루트 월드 진입 시 `sWorldArchiveMapDesc`로 월드 아카이브 정보 표시

### 4. **Life 매칭 / 아카이브 상세** (`life-detail.html`)
- 좌측 탭: NPC / MOB (개수 표시)
- 첫 진입 시 자동으로 첫 항목 선택 표시
- 우측 상세 카드:
  - **공통**: 이미지 + 이름 + ID 태그 + 타입 태그
  - **MOB**: 레벨/HP/경험치 등 스탯 그리드 + 💰 메소 드랍량 (`nMesoMin~Max`)
  - **NPC**: 역할(`sFunc`) + 대사(`nN0~`, `nD0~`, `sS0~`)
  - **NPC**: 연관 인물(`sRelatedNpcID`) — 칩 클릭 시 해당 NPC로 이동
  - **공통**: `bIsArchive=true`이면 📜 아카이브 박스 (조사원 리트의 기록)
- BGM 자동 재생 (`MapData_sMapBGM` 매칭, 반복 재생 기본)

### 5. **공통 기능**
- 페이지 상단 토스트 메시지 (오프라인 항목 클릭 시)
- 한글 파일명 다중 인코딩 시도 (NFC/NFD 정규화 + encodeURIComponent/encodeURI)
- 캐시된 fetch (반복 요청 방지)
- 모든 페이지 공통 헤더 (`common.js`의 `renderSiteHeader`)

## 🛠️ 새 JSON 명세 대응

### 루트 World JSON
```jsonc
{
  "sBaseMapName": "메이플 월드",
  "sWorldArchiveMapName": "...",        // 신규
  "sWorldArchiveMapDesc": "...",        // 신규
  "sWorldArchiveMapImagePath": "...",   // 신규 (Windows 절대 경로 → 자동 변환)
  "MapLinkDate": [                       // 이전 MapListDate에서 이름 변경
    {
      "sLinkMapID": "WorldMap010",       // 이전 sMapID
      "pntOrigin": { "x": 299, "y": 126 },                  // 부모 위 핀 좌표
      "sToolTip": "빅토리아 아일랜드",                        // 마우스 오버 텍스트
      "nPinType": 0,
      "pntListMapUpData_PinPoint": { "x": -242, "y": -55 }, // 자식 진입 좌표
      "sListMapUpData_Desc": "...",
      "sListMapUpData_MainCity": "...",
      "bIsArchive": true,                                    // 신규
      "sArchiveDesc": "...",                                 // 신규
      "sArchiveImagePath": "..."                             // 신규
    }
  ]
}
```

### 하위 World JSON
- `MapLinkDate[]` (더 깊은 하위 지역)
- `MapListDate[]` (이 지역의 맵 핀, 한 핀에 `sMapData[]` 배열)
- 각 `sMapData` 항목은 `MapData_sMapID/sMapName/sMapSubName/sMapBGM/sMapIcon/sLifeList`

### Mob JSON
- `nMesoMin`, `nMesoMax` 신규 (메소 드랍량)
- `bIsArchive`, `sArchiveregionDesc` 신규 (조사원 리트의 기록)
- `sLifeList`는 현재 null 처리 (드랍 아이템 섹션은 v5에서 제거)

### Npc JSON
- `sRelatedNpcID` 신규 (연관 인물, 콤마/세미콜론/공백으로 구분된 ID 목록)
- `bIsArchive`, `sArchiveregionDesc` 신규

## 🎨 페이지 흐름

```
index.html (메인)
   ↓ 스토리 카드 클릭
world-select.html (세계관 선택)
   ↓ 메이플 월드 / 그란디스 카드
world-map.html (월드맵)
   ↓ 핀 클릭 또는 사이드바 항목 클릭
   ├─ MapLinkDate 항목 → 더 깊은 world-map.html (path 누적)
   └─ MapListDate 항목 → 같은 페이지에서 sMapData 카드 펼침
       ↓ sMapData 카드 클릭
life-detail.html (NPC/MOB 아카이브)
   ↓ 연관 NPC 칩 클릭
life-detail.html?type=npc&id=xxx (단일 엔티티 보기)
```

## 📋 다음 단계 (v6 후보)

이번 v5에서는 핵심 흐름만 구현했습니다. 추후 추가 예정:
- **전체 NPC/MOB 도감 페이지** (헤더의 도감 메뉴, 현재 비활성)
- **음악 / 굿즈 테마관**
- **통합 검색** (이름·ID 자동완성)
- **인물 관계도 시각화**
- **BGM 트랙 리스트 페이지**
- **즐겨찾기/북마크**

---

🍁 **MyMaple v5** — 새 JSON 명세 + PPTX 디자인 가이드 V2 적용 버전
