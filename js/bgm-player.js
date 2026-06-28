/* =========================================
   MyMaple v5 - BGM Player
   맵에서 List 클릭 시 sMapBGM이 있으면 자동 반복 재생
   ========================================= */

// 재생 모드는 항상 기본값을 '반복 재생(loop)'로 시작한다.
// 사용자가 버튼으로 '순차 재생(queue)'로 바꿀 수는 있지만,
// 새로고침/재방문 시에는 다시 반복 재생으로 시작하도록 localStorage 저장은 사용하지 않음.

const BGM = {
    audio: null,
    container: null,
    state: {
        currentTrack: null,
        currentTrackName: '',
        currentTrackFileName: '',
        playing: false,
        volume: 0.5,
        minimized: true,
        mode: 'loop',               // 기본값은 항상 반복 재생
        queue: [],                  // [{ key, name }] - 외부에서 등록한 재생 대기열
        queueIndex: -1,             // 현재 재생 중인 항목의 queue 안 인덱스
        onTrackChange: null         // (key) => void  : 현재곡 변경 알림 콜백
    }
};


function ensurePlayerUI() {
    if (BGM.container) return;

    const iconUrl = (window.MyMapleData && typeof window.MyMapleData.resolveBgmIconPath === 'function')
        ? window.MyMapleData.resolveBgmIconPath()
        : 'MyMaple_PageInfo/Special_Image/Music_Image/BGM_Icon.png';

    const div = document.createElement('div');
    div.className = 'bgm-player minimized';
    div.innerHTML = `
        <div class="bgm-minimize-icon" title="펼치기">
            <img src="${iconUrl}" alt="BGM" onerror="this.style.display='none'; this.parentElement.style.background='var(--primary)';">
        </div>
        <div class="bgm-content">
            <div class="bgm-header">
                <span class="bgm-title-label">▶ NOW PLAYING</span>
                <div class="bgm-controls-top">
                    <button class="bgm-min-btn" title="최소화">_</button>
                    <button class="bgm-close-btn" title="닫기">×</button>
                </div>
            </div>
            <div class="bgm-track-name">트랙 없음</div>
            <div class="bgm-file-name">파일명 없음</div>
            <div class="bgm-controls-main">
                <button class="bgm-prev-btn" title="이전 곡" aria-label="이전 곡">⏮</button>
                <button class="bgm-toggle">▶</button>
                <button class="bgm-next-btn" title="다음 곡" aria-label="다음 곡">⏭</button>
                <div class="bgm-progress-wrap">
                    <div class="bgm-progress"><div class="bgm-progress-fill"></div></div>
                    <div class="bgm-time">
                        <span class="bgm-current">0:00</span>
                        <span class="bgm-total">0:00</span>
                    </div>
                </div>
            </div>
            <div class="bgm-bottom-row">
                <button class="bgm-mode-btn" data-mode="${BGM.state.mode}" title="재생 모드" aria-label="재생 모드 전환">
                    <span class="bgm-mode-icon" aria-hidden="true"></span>
                    <span class="bgm-mode-label"></span>
                </button>
                <div class="bgm-volume">
                    <span style="font-size:11px;color:#888;">🔊</span>
                    <input type="range" min="0" max="100" value="50">
                </div>
            </div>
        </div>
    `;
    document.body.appendChild(div);
    BGM.container = div;
    BGM.state.minimized = true;

    const audio = document.createElement('audio');
    audio.preload = 'auto';
    audio.loop = (BGM.state.mode === 'loop');
    document.body.appendChild(audio);
    BGM.audio = audio;

    const toggleBtn = div.querySelector('.bgm-toggle');
    toggleBtn.addEventListener('click', () => {
        if (audio.paused) audio.play().catch(e => console.warn('재생 실패', e));
        else audio.pause();
    });

    div.querySelector('.bgm-prev-btn').addEventListener('click', () => playRelative(-1));
    div.querySelector('.bgm-next-btn').addEventListener('click', () => playRelative(+1));

    const modeBtn = div.querySelector('.bgm-mode-btn');
    modeBtn.addEventListener('click', () => {
        BGM.state.mode = (BGM.state.mode === 'loop') ? 'queue' : 'loop';
        audio.loop = (BGM.state.mode === 'loop');
        updateModeButtonUi();
    });
    updateModeButtonUi();
    updateNavButtonsUi();

    div.querySelector('.bgm-min-btn').addEventListener('click', () => {
        div.classList.toggle('minimized');
        BGM.state.minimized = div.classList.contains('minimized');
    });
    div.querySelector('.bgm-minimize-icon').addEventListener('click', () => {
        div.classList.remove('minimized');
        BGM.state.minimized = false;
    });
    div.querySelector('.bgm-close-btn').addEventListener('click', () => {
        audio.pause();
        audio.src = '';
        div.classList.remove('active');
        div.querySelector('.bgm-track-name').textContent = '트랙 없음';
        div.querySelector('.bgm-file-name').textContent = '파일명 없음';
        BGM.state.currentTrack = null;
        BGM.state.currentTrackName = '';
        BGM.state.currentTrackFileName = '';
        BGM.state.playing = false;
    });

    audio.addEventListener('play', () => {
        toggleBtn.textContent = '❚❚';
        BGM.state.playing = true;
    });
    audio.addEventListener('pause', () => {
        toggleBtn.textContent = '▶';
        BGM.state.playing = false;
    });
    audio.addEventListener('timeupdate', () => {
        const pct = audio.duration ? (audio.currentTime / audio.duration) * 100 : 0;
        div.querySelector('.bgm-progress-fill').style.width = pct + '%';
        div.querySelector('.bgm-current').textContent = formatTime(audio.currentTime);
        if (audio.duration) div.querySelector('.bgm-total').textContent = formatTime(audio.duration);
    });
    audio.addEventListener('error', () => {
        console.warn('[BGM] 트랙을 찾을 수 없습니다:', audio.src);
        div.querySelector('.bgm-track-name').textContent = '트랙 파일을 찾을 수 없습니다';
        div.querySelector('.bgm-file-name').textContent = BGM.state.currentTrackFileName || '파일명 없음';
        // 파일 없는 곡 만난 경우 큐 모드면 다음 곡으로 자동 스킵
        if (BGM.state.mode === 'queue') {
            setTimeout(() => playRelative(+1, /*skipOnFail=*/true), 350);
        }
    });

    // 곡이 끝난 것 대응: queue 모드면 다음 곡으로
    audio.addEventListener('ended', () => {
        if (BGM.state.mode === 'queue') {
            playRelative(+1);
        }
        // loop 모드는 audio.loop=true 이므로 발생하지 않음
    });

    div.querySelector('.bgm-progress').addEventListener('click', (e) => {
        const rect = e.currentTarget.getBoundingClientRect();
        const ratio = (e.clientX - rect.left) / rect.width;
        if (audio.duration) audio.currentTime = ratio * audio.duration;
    });

    div.querySelector('input[type=range]').addEventListener('input', (e) => {
        const v = parseFloat(e.target.value) / 100;
        audio.volume = v;
        BGM.state.volume = v;
    });
    audio.volume = BGM.state.volume;
}

function formatTime(sec) {
    if (!sec || isNaN(sec)) return '0:00';
    const m = Math.floor(sec / 60);
    const s = Math.floor(sec % 60).toString().padStart(2, '0');
    return `${m}:${s}`;
}

function extractBgmFileName(bgmKey) {
    if (!bgmKey) return '';
    return String(bgmKey).split('/').pop() || String(bgmKey);
}

function updateModeButtonUi() {
    if (!BGM.container) return;
    const btn = BGM.container.querySelector('.bgm-mode-btn');
    if (!btn) return;
    const mode = BGM.state.mode;
    btn.dataset.mode = mode;
    btn.setAttribute('aria-pressed', mode === 'queue' ? 'true' : 'false');
    const iconEl = btn.querySelector('.bgm-mode-icon');
    const labelEl = btn.querySelector('.bgm-mode-label');
    if (mode === 'loop') {
        if (iconEl) iconEl.textContent = '🔁';
        if (labelEl) labelEl.textContent = '한 곡 반복';
        btn.title = '현재: 한 곡 반복 → 클릭하면 목록 연속 재생';
    } else {
        if (iconEl) iconEl.textContent = '⤵️';
        if (labelEl) labelEl.textContent = '목록 연속';
        btn.title = '현재: 정렬된 순서대로 연속 재생 → 클릭하면 한 곡 반복';
    }
    updateNavButtonsUi();
}

function updateNavButtonsUi() {
    if (!BGM.container) return;
    const prev = BGM.container.querySelector('.bgm-prev-btn');
    const next = BGM.container.querySelector('.bgm-next-btn');
    if (!prev || !next) return;
    const hasQueue = Array.isArray(BGM.state.queue) && BGM.state.queue.length > 1;
    const disabled = !hasQueue;
    prev.disabled = disabled;
    next.disabled = disabled;
    prev.classList.toggle('is-disabled', disabled);
    next.classList.toggle('is-disabled', disabled);
}

/**
 * 외부(예: music-bgm.js)에서 현재 정렬된 목록 전체를 큐로 등록.
 * @param {Array<{key:string, name:string}>} items
 * @param {{onTrackChange?: (key:string)=>void}} options
 */
function setQueue(items, options = {}) {
    const cleaned = Array.isArray(items) ? items.filter(it => it && it.key) : [];
    BGM.state.queue = cleaned.map(it => ({ key: String(it.key), name: String(it.name || it.key) }));
    // 현재 재생 중인 곡이 있으면 새 큐에서 다시 위치 찾기 (정렬 변경 대응)
    if (BGM.state.currentTrackKey) {
        const idx = BGM.state.queue.findIndex(it => it.key === BGM.state.currentTrackKey);
        BGM.state.queueIndex = idx;
    } else {
        BGM.state.queueIndex = -1;
    }
    if (typeof options.onTrackChange === 'function') {
        BGM.state.onTrackChange = options.onTrackChange;
    }
    updateNavButtonsUi();
}

function playRelative(offset, skipOnFail = false) {
    if (!BGM.state.queue.length) return;
    let idx = BGM.state.queueIndex;
    if (idx < 0) {
        // 큐에 재생 이력이 없으면 맨 앞부터
        idx = 0;
    } else {
        idx = idx + offset;
    }
    // 경계 처리: 대기열 끝을 넘으면 멈춤 (순환 아님)
    if (idx < 0 || idx >= BGM.state.queue.length) {
        if (!skipOnFail) stopBgm();
        return;
    }
    const next = BGM.state.queue[idx];
    BGM.state.queueIndex = idx;
    playBgm(next.key, next.name, true, { fromQueueNav: true });
}

function playBgm(bgmKey, displayName, autoPlay = true, opts = {}) {
    ensurePlayerUI();
    if (!bgmKey) {
        BGM.container.classList.remove('active');
        BGM.container.querySelector('.bgm-track-name').textContent = '트랙 없음';
        BGM.container.querySelector('.bgm-file-name').textContent = '파일명 없음';
        return;
    }

    const url = window.MyMapleData.resolveBgmPath(bgmKey);
    if (!url) return;

    const fileName = extractBgmFileName(bgmKey);
    const trackName = displayName || fileName;

    BGM.state.currentTrackKey = bgmKey;

    // 외부(예: music-bgm.js)에서 직접 곡 선택 시, 큐 안에서 인덱스 재정렬
    if (!opts.fromQueueNav && BGM.state.queue.length) {
        const idx = BGM.state.queue.findIndex(it => it.key === bgmKey);
        BGM.state.queueIndex = idx; // -1 if not found
    }
    updateNavButtonsUi();

    if (BGM.state.currentTrack === url) {
        BGM.state.currentTrackName = trackName;
        BGM.state.currentTrackFileName = fileName;
        BGM.container.querySelector('.bgm-track-name').textContent = BGM.state.currentTrackName;
        BGM.container.querySelector('.bgm-file-name').textContent = BGM.state.currentTrackFileName || '파일명 없음';
        if (autoPlay) BGM.audio.play().catch(() => {});
        BGM.container.classList.add('active');
        if (typeof BGM.state.onTrackChange === 'function') {
            try { BGM.state.onTrackChange(bgmKey); } catch (_) {}
        }
        return;
    }

    BGM.state.currentTrack = url;
    BGM.state.currentTrackName = trackName;
    BGM.state.currentTrackFileName = fileName;
    BGM.audio.src = url;
    BGM.audio.loop = (BGM.state.mode === 'loop');
    BGM.audio.load();

    BGM.container.querySelector('.bgm-track-name').textContent = BGM.state.currentTrackName;
    BGM.container.querySelector('.bgm-file-name').textContent = BGM.state.currentTrackFileName || '파일명 없음';
    BGM.container.classList.add('active');

    if (typeof BGM.state.onTrackChange === 'function') {
        try { BGM.state.onTrackChange(bgmKey); } catch (_) {}
    }

    if (autoPlay) {
        BGM.audio.play().catch(_ => {
            console.info('[BGM] 자동재생 차단됨. ▶ 버튼을 눌러주세요.');
        });
    }
}

function stopBgm() {
    if (BGM.audio) {
        BGM.audio.pause();
        BGM.audio.src = '';
    }
    if (BGM.container) {
        BGM.container.classList.remove('active');
        BGM.container.querySelector('.bgm-track-name').textContent = '트랙 없음';
        BGM.container.querySelector('.bgm-file-name').textContent = '파일명 없음';
    }
    BGM.state.currentTrack = null;
    BGM.state.currentTrackKey = null;
    BGM.state.currentTrackName = '';
    BGM.state.currentTrackFileName = '';
    BGM.state.playing = false;
    BGM.state.queueIndex = -1;
    if (typeof BGM.state.onTrackChange === 'function') {
        try { BGM.state.onTrackChange(null); } catch (_) {}
    }
}

function getCurrentMode() { return BGM.state.mode; }
function getCurrentTrackKey() { return BGM.state.currentTrackKey || null; }

window.MyMapleBGM = {
    playBgm,
    stopBgm,
    ensurePlayerUI,
    setQueue,
    playRelative,
    getCurrentMode,
    getCurrentTrackKey
};

document.addEventListener('DOMContentLoaded', ensurePlayerUI);
