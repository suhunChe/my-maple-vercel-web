/* =========================================
   MyMaple v5 - BGM Player
   맵에서 List 클릭 시 sMapBGM이 있으면 자동 반복 재생
   ========================================= */

const BGM = {
    audio: null,
    container: null,
    state: {
        currentTrack: null,
        currentTrackName: '',
        currentTrackFileName: '',
        playing: false,
        volume: 0.5,
        minimized: true
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
                <button class="bgm-toggle">▶</button>
                <div class="bgm-progress-wrap">
                    <div class="bgm-progress"><div class="bgm-progress-fill"></div></div>
                    <div class="bgm-time">
                        <span class="bgm-current">0:00</span>
                        <span class="bgm-total">0:00</span>
                    </div>
                </div>
            </div>
            <div class="bgm-volume">
                <span style="font-size:11px;color:#888;">🔊</span>
                <input type="range" min="0" max="100" value="50">
            </div>
        </div>
    `;
    document.body.appendChild(div);
    BGM.container = div;
    BGM.state.minimized = true;

    const audio = document.createElement('audio');
    audio.preload = 'auto';
    audio.loop = true;   // 기본 반복 재생
    document.body.appendChild(audio);
    BGM.audio = audio;

    const toggleBtn = div.querySelector('.bgm-toggle');
    toggleBtn.addEventListener('click', () => {
        if (audio.paused) audio.play().catch(e => console.warn('재생 실패', e));
        else audio.pause();
    });

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

function playBgm(bgmKey, displayName, autoPlay = true) {
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

    if (BGM.state.currentTrack === url) {
        BGM.state.currentTrackName = trackName;
        BGM.state.currentTrackFileName = fileName;
        BGM.container.querySelector('.bgm-track-name').textContent = BGM.state.currentTrackName;
        BGM.container.querySelector('.bgm-file-name').textContent = BGM.state.currentTrackFileName || '파일명 없음';
        if (autoPlay) BGM.audio.play().catch(() => {});
        BGM.container.classList.add('active');
        return;
    }

    BGM.state.currentTrack = url;
    BGM.state.currentTrackName = trackName;
    BGM.state.currentTrackFileName = fileName;
    BGM.audio.src = url;
    BGM.audio.load();

    BGM.container.querySelector('.bgm-track-name').textContent = BGM.state.currentTrackName;
    BGM.container.querySelector('.bgm-file-name').textContent = BGM.state.currentTrackFileName || '파일명 없음';
    BGM.container.classList.add('active');

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
    BGM.state.currentTrackName = '';
    BGM.state.currentTrackFileName = '';
    BGM.state.playing = false;
}

window.MyMapleBGM = { playBgm, stopBgm, ensurePlayerUI };

document.addEventListener('DOMContentLoaded', ensurePlayerUI);
