# MyMaple — GitHub Actions 자동화 안내

## 창팝 최근 30일 통계 자동 갱신

매일 새벽(한국 시간 03:00, UTC 18:00)에 자동으로:

1. YouTube 플레이리스트의 영상 목록을 가져오고
2. 각 영상의 현재 조회수/좋아요 수를 수집하고
3. `PageInfo_Update Data/Changpop_Info/ChangpopRecent30Stats.json` 에 일별 스냅샷을 누적
4. 최근 30일 증가량과 점수를 다시 계산
5. 변경 사항이 있으면 자동으로 commit/push

이렇게 동작합니다.

---

## 처음 한 번만 해야 하는 설정

### 1. Repository Secrets 등록
GitHub 저장소 페이지에서:

`Settings` → `Secrets and variables` → `Actions` → `New repository secret`

아래 2개를 등록합니다.

| Name                  | Value                                  |
| --------------------- | -------------------------------------- |
| `YOUTUBE_API_KEY`     | YouTube Data API v3 키                  |
| `YOUTUBE_PLAYLIST_ID` | 창팝 재생목록 ID (예: `PLNgG1y22I83A`)   |

> 키 노출 방지를 위해 절대 `ChangpopConfig.json` 같은 일반 파일에 넣지 마세요.

### 2. (선택) Repository Variables
필요할 때만 등록하면 됩니다.

| Name                    | 기본값 | 설명                              |
| ----------------------- | ------ | --------------------------------- |
| `CHANGPOP_MAX_VIDEOS`   | 200    | 통계에 포함할 최대 영상 수         |
| `CHANGPOP_WINDOW_DAYS`  | 30     | 윈도우 일수                        |
| `CHANGPOP_WEIGHT_VIEW`  | 1      | 점수 — 조회수 1 증가당 가중치       |
| `CHANGPOP_WEIGHT_LIKE`  | 20     | 점수 — 좋아요 1 증가당 가중치       |

### 3. Actions 권한
`Settings` → `Actions` → `General` → `Workflow permissions` 에서
`Read and write permissions` 를 선택해야 자동 commit/push 가 가능합니다.

---

## 실행 방법

- 자동: 매일 한 번 새벽에 실행
- 수동: `Actions` 탭 → `Update Changpop Recent 30 Stats` → `Run workflow`

---

## 로컬 테스트 (선택)

로컬에서 직접 한 번 돌려보고 싶다면:

```bash
export YOUTUBE_API_KEY=...
export YOUTUBE_PLAYLIST_ID=...
node scripts/update-changpop-stats.mjs
```

성공하면 `PageInfo_Update Data/Changpop_Info/ChangpopRecent30Stats.json` 파일이 갱신됩니다.
