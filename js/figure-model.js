/* =========================================
   MyMaple v6 — 피규어 모델실 (figure-model)
   - 카테고리 고정: Mob / Npc / Character / Item
   - 각 카테고리 폴더 안에 _items.json (예: ["핑크빈", "슬라임"])
   - 각 아이템 폴더 = MyMaple_PageInfo/Special_Image/Modelling/<카테고리>/<아이템명>/
     ├─ 1.png ~ N.png  (정면/후면/좌/우/상/하, 자동 개수 감지)
     ├─ description.txt
     └─ <아무파일명>.glb 또는 .stl  (자동 탐지)
   ========================================= */

(function () {
    const C = window.MyMapleCommon;
    const D = window.MyMapleData;
    const escapeHtml = C.escapeHtml;

    const ROOT_PATH = `${D.PATHS.SPECIAL_IMG}/Modelling`;

    // 고정 카테고리 목록 (폴더명 = 표시 라벨)
    const FIXED_CATEGORIES = [
        { key: 'Mob',       label: 'Mob' },
        { key: 'Npc',       label: 'Npc' },
        { key: 'Character', label: 'Character' },
        { key: 'Item',      label: 'Item' }
    ];

    const IMAGE_EXTS = ['png', 'jpg', 'jpeg', 'webp'];
    const MODEL_EXTS = ['glb', 'stl', 'gltf'];
    const MAX_IMAGE_PROBE = 12;   // 최대 1.png ~ 12.png까지 시도
    const MAX_MODEL_PROBE_NAMES = 24; // 한 폴더 안에서 모델 후보 추정 시도 제한

    const state = {
        categories: [],     // [{ key, label, items: [{ name }] }]
        query: '',
        view: 'list',
        currentItem: null,    // { name }
        currentCategory: null,// { key, label }
        currentModelFile: '', // 자동 탐지된 모델 파일명 (예: "PinkBean.glb")
        images: [],           // [{ url, index }]
        imageIndex: 0,
        autoplayTimer: null,
        autoplay: false,
        viewer: null
    };

    const els = {
        listView: document.getElementById('figure-list-view'),
        detailView: document.getElementById('figure-detail-view'),
        categoriesWrap: document.getElementById('figure-categories'),
        countChip: document.getElementById('figure-count'),
        searchInput: document.getElementById('figure-search-input'),
        searchClear: document.getElementById('figure-search-clear'),
        backBtn: document.getElementById('figure-back-btn'),
        breadcrumb: document.getElementById('figure-breadcrumb'),
        stage: document.getElementById('figure-gallery-stage'),
        prevBtn: document.getElementById('figure-gallery-prev'),
        nextBtn: document.getElementById('figure-gallery-next'),
        autoplayBtn: document.getElementById('figure-gallery-autoplay'),
        thumbStrip: document.getElementById('figure-thumb-strip'),
        infoCategory: document.getElementById('figure-info-category'),
        infoTitle: document.getElementById('figure-info-title'),
        downloadBtn: document.getElementById('figure-download-btn'),
        downloadExt: document.getElementById('figure-download-ext'),
        descBody: document.getElementById('figure-description-body'),
        descFile: document.getElementById('figure-description-file')
    };

    function mountHeader() {
        const mount = document.getElementById('header-mount');
        if (!mount) return;
        mount.innerHTML = C.renderSiteHeader('figure', C.getInfoNavItems ? C.getInfoNavItems() : null);
        if (typeof C.bindHeaderOfflineLinks === 'function') C.bindHeaderOfflineLinks();
    }

    // ---------- 경로 ----------
    function itemFolderPath(catKey, itemName) {
        // 폴더명에 한글이 있을 수 있으므로 encodeURIComponent 처리한 URL을 별도로 빌드
        return `${ROOT_PATH}/${catKey}/${itemName}`;
    }
    function itemFolderUrl(catKey, itemName) {
        return `${ROOT_PATH}/${encodeURIComponent(catKey)}/${encodeURIComponent(itemName)}`;
    }

    // ---------- _items.json 로드 ----------
    async function loadCategoryItems(cat) {
        const url = `${itemFolderUrl(cat.key, '_items.json')}`.replace(/\/_items\.json$/, '/_items.json');
        // 위 표현은 한글 안전하지만 단순화:
        const directUrl = `${ROOT_PATH}/${encodeURIComponent(cat.key)}/_items.json`;
        try {
            const res = await fetch(directUrl, { cache: 'no-cache' });
            if (!res.ok) return [];
            const text = (await res.text()).replace(/^\uFEFF/, '');
            const data = JSON.parse(text);
            if (!Array.isArray(data)) return [];
            // 두 가지 포맷 허용:
            //   1) ["핑크빈", "슬라임"]
            //   2) [{ "name": "핑크빈", "label": "보스 핑크빈" }]
            return data
                .map(it => typeof it === 'string'
                    ? { name: String(it).trim(), label: '' }
                    : (it && it.name ? { name: String(it.name).trim(), label: String(it.label || '').trim() } : null))
                .filter(Boolean);
        } catch (err) {
            // 폴더가 아직 없거나 _items.json 없음 → 빈 배열
            return [];
        }
    }

    async function loadIndex() {
        try {
            const results = await Promise.all(FIXED_CATEGORIES.map(async (cat) => {
                const items = await loadCategoryItems(cat);
                return { key: cat.key, label: cat.label, items };
            }));
            state.categories = results;
            renderList();
        } catch (err) {
            console.warn('[Figure] 인덱스 로드 실패', err);
            els.categoriesWrap.innerHTML = `<div class="figure-empty">목록을 불러오지 못했습니다.</div>`;
            els.countChip.textContent = '0 종';
        }
    }

    // ---------- 자원 자동 탐지 (이미지/모델) ----------
    function probeUrl(url) {
        return new Promise(resolve => {
            // 모델 파일은 HEAD 요청으로 확인 (Image 객체로는 못 잡음)
            // 이미지면 Image() 가 더 빠름
            const isImage = /\.(png|jpe?g|webp)$/i.test(url);
            if (isImage) {
                const img = new Image();
                img.onload = () => resolve(true);
                img.onerror = () => resolve(false);
                img.src = url;
                return;
            }
            fetch(url, { method: 'HEAD', cache: 'no-cache' })
                .then(res => resolve(res.ok))
                .catch(() => resolve(false));
        });
    }

    async function probeImagesSequential(catKey, itemName) {
        // 1.png ~ MAX_IMAGE_PROBE.png 순차 시도, 처음 누락이 나오면 멈춤
        const list = [];
        for (let i = 1; i <= MAX_IMAGE_PROBE; i++) {
            let found = '';
            for (const ext of IMAGE_EXTS) {
                const u = `${itemFolderUrl(catKey, itemName)}/${i}.${ext}`;
                // eslint-disable-next-line no-await-in-loop
                if (await probeUrl(u)) { found = u; break; }
            }
            if (!found) break;
            list.push({ url: found, index: i });
        }
        return list;
    }

    async function probeModelFile(catKey, itemName) {
        // 후보 파일명 풀: 폴더이름.*, model.*, item.name.* 등
        // 사용자가 모델 파일명을 자유롭게 정해도 자동 탐지되도록 후보를 만들고 HEAD로 확인
        const candidates = new Set();
        const baseNames = [itemName, 'model', 'Model', itemName.toLowerCase()];
        baseNames.forEach(n => MODEL_EXTS.forEach(e => candidates.add(`${n}.${e}`)));
        // 최후의 수단: 카테고리 폴더 안에 manifest 형태로 model_files.json 같은 것 사용 가능
        // 하지만 일단 후보군만 시도
        for (const fname of candidates) {
            const u = `${itemFolderUrl(catKey, itemName)}/${encodeURIComponent(fname)}`;
            // eslint-disable-next-line no-await-in-loop
            if (await probeUrl(u)) return fname;
        }
        return ''; // 못 찾음
    }

    // ---------- 리스트 화면 ----------
    function thumbUrlOf(cat, item) {
        // 카드 썸네일 = 1.png (없으면 다른 확장자도 fallback은 onerror에서 처리)
        return `${itemFolderUrl(cat.key, item.name)}/1.png`;
    }

    function applyFilter() {
        const q = (state.query || '').trim().toLowerCase();
        if (!q) return state.categories;
        return state.categories.map(cat => ({
            ...cat,
            items: cat.items.filter(it =>
                String(it.name).toLowerCase().includes(q) ||
                String(it.label || '').toLowerCase().includes(q) ||
                String(cat.label).toLowerCase().includes(q)
            )
        })).filter(cat => cat.items.length);
    }

    function renderList() {
        const filtered = applyFilter();
        const total = filtered.reduce((acc, cat) => acc + cat.items.length, 0);
        els.countChip.textContent = `${total} 종`;

        if (!total) {
            els.categoriesWrap.innerHTML = `
                <div class="figure-empty">
                    ${state.query
                        ? '검색 결과가 없습니다.'
                        : `등록된 피규어가 없습니다.<br>각 카테고리 폴더에 <code>_items.json</code>을 만들고 아이템 이름을 적어 주세요.`}
                </div>`;
            return;
        }

        const html = filtered.map(cat => {
            // 항목 없는 카테고리는 표시하지 않음 (filter에서 처리)
            const cards = cat.items.map(item => {
                const thumb = thumbUrlOf(cat, item);
                const displayLabel = item.label || item.name;
                return `
                    <button type="button" class="figure-card" data-cat="${escapeHtml(cat.key)}" data-name="${escapeHtml(item.name)}">
                        <span class="figure-card-thumb">
                            <img src="${thumb}" alt="${escapeHtml(displayLabel)}" loading="lazy"
                                 onerror="this.classList.add('is-missing'); this.removeAttribute('src');">
                            <span class="figure-card-thumb-fallback">No Image</span>
                        </span>
                        <span class="figure-card-meta">
                            <span class="figure-card-name">${escapeHtml(displayLabel)}</span>
                        </span>
                    </button>`;
            }).join('');
            return `
                <section class="figure-cat-section">
                    <header class="figure-cat-header">
                        <h3 class="figure-cat-title">${escapeHtml(cat.label)}</h3>
                        <span class="figure-cat-count">${cat.items.length} 종</span>
                    </header>
                    <div class="figure-card-grid">${cards}</div>
                </section>`;
        }).join('');

        els.categoriesWrap.innerHTML = html;
    }

    // ---------- 상세 화면 ----------
    function findItem(catKey, name) {
        const cat = state.categories.find(c => c.key === catKey);
        if (!cat) return null;
        const item = cat.items.find(i => i.name === name);
        if (!item) return null;
        return { cat, item };
    }

    async function openDetail(catKey, name) {
        const ref = findItem(catKey, name);
        if (!ref) return;
        const { cat, item } = ref;

        state.view = 'detail';
        state.currentCategory = cat;
        state.currentItem = item;
        state.imageIndex = 0;
        state.currentModelFile = '';
        stopAutoplay();
        disposeViewer();

        els.listView.hidden = true;
        els.detailView.hidden = false;
        window.scrollTo({ top: 0, behavior: 'instant' });

        const displayLabel = item.label || item.name;
        els.breadcrumb.innerHTML = `
            <a href="figure-model.html" class="figure-breadcrumb-link">피규어 모델실</a>
            <span class="figure-breadcrumb-sep">/</span>
            <span class="figure-breadcrumb-cat">${escapeHtml(cat.label)}</span>
            <span class="figure-breadcrumb-sep">/</span>
            <span class="figure-breadcrumb-name">${escapeHtml(displayLabel)}</span>
        `;
        els.infoCategory.textContent = cat.label;
        els.infoTitle.textContent = displayLabel;

        // 다운로드 버튼은 모델 탐지 후 활성화
        els.downloadBtn.href = '#';
        els.downloadBtn.removeAttribute('download');
        els.downloadExt.textContent = '';
        els.downloadBtn.classList.add('is-disabled');

        // description.txt
        els.descBody.textContent = '설명을 불러오는 중...';
        loadDescription(cat, item);

        // 이미지 / 모델 동시 탐지
        const [images, modelFile] = await Promise.all([
            probeImagesSequential(cat.key, item.name),
            probeModelFile(cat.key, item.name)
        ]);
        state.images = images;
        state.currentModelFile = modelFile;

        // 다운로드 버튼 갱신
        if (modelFile) {
            const modelUrl = `${itemFolderUrl(cat.key, item.name)}/${encodeURIComponent(modelFile)}`;
            const ext = (modelFile.split('.').pop() || '').toUpperCase();
            els.downloadBtn.href = modelUrl;
            els.downloadBtn.setAttribute('download', modelFile);
            els.downloadExt.textContent = ext ? `.${ext.toLowerCase()}` : '';
            els.downloadBtn.classList.remove('is-disabled');
        }

        renderThumbStrip();
        renderStage(0);

        // URL 업데이트
        try {
            const url = new URL(window.location.href);
            url.searchParams.set('cat', cat.key);
            url.searchParams.set('name', item.name);
            history.replaceState(null, '', url.toString());
        } catch (_) {}
    }

    function closeDetail() {
        state.view = 'list';
        state.currentCategory = null;
        state.currentItem = null;
        state.currentModelFile = '';
        stopAutoplay();
        disposeViewer();
        els.detailView.hidden = true;
        els.listView.hidden = false;
        try {
            const url = new URL(window.location.href);
            url.searchParams.delete('cat');
            url.searchParams.delete('name');
            history.replaceState(null, '', url.toString());
        } catch (_) {}
    }

    async function loadDescription(cat, item) {
        const url = `${itemFolderUrl(cat.key, item.name)}/description.txt`;
        els.descFile.textContent = 'description.txt';
        try {
            const res = await fetch(url, { cache: 'no-cache' });
            if (!res.ok) throw new Error(`HTTP ${res.status}`);
            const text = (await res.text()).replace(/^\uFEFF/, '');
            els.descBody.textContent = text.trim() ? text : '(설명이 비어 있습니다.)';
        } catch (err) {
            els.descBody.textContent = '설명 파일(description.txt)을 찾을 수 없습니다.';
        }
    }

    // ---------- 갤러리 / 3D 뷰어 ----------
    function totalSlides() {
        const imgN = state.images.length;
        const has3d = !!state.currentModelFile;
        return imgN + (has3d ? 1 : 0);
    }
    function isModelSlide(idx) {
        return !!state.currentModelFile && idx === state.images.length;
    }

    function renderThumbStrip() {
        const html = state.images.map((img, idx) => `
            <li class="figure-thumb ${idx === state.imageIndex ? 'is-active' : ''}" data-slide="${idx}">
                <img src="${img.url}" alt="${idx + 1}" loading="lazy">
            </li>
        `).join('') + (state.currentModelFile ? `
            <li class="figure-thumb figure-thumb-3d ${state.imageIndex === state.images.length ? 'is-active' : ''}" data-slide="${state.images.length}">
                <span class="figure-thumb-3d-badge">3D</span>
            </li>` : '');
        els.thumbStrip.innerHTML = html || '<li class="figure-thumb-empty">이미지가 없습니다</li>';
    }

    function renderStage(idx) {
        const total = totalSlides();
        if (!total) {
            disposeViewer();
            els.stage.innerHTML = '<div class="figure-stage-empty">이미지나 모델이 없습니다.</div>';
            updateNavButtonsUi();
            return;
        }
        if (idx < 0) idx = total - 1;
        if (idx >= total) idx = 0;
        state.imageIndex = idx;

        disposeViewer();

        if (isModelSlide(idx)) {
            els.stage.innerHTML = `
                <div class="figure-3d-host">
                    <div class="figure-3d-canvas" id="figure-3d-canvas"></div>
                    <div class="figure-3d-status" id="figure-3d-status">3D 모델을 불러오는 중...</div>
                    <div class="figure-3d-hint">마우스: 회전 · 휠: 확대 · 우클릭+드래그: 이동</div>
                </div>`;
            mountViewer();
        } else {
            const img = state.images[idx];
            els.stage.innerHTML = `
                <img class="figure-stage-img" src="${img.url}" alt="${idx + 1}/${state.images.length}">
                <div class="figure-stage-counter">${idx + 1} / ${state.images.length}</div>`;
        }

        els.thumbStrip.querySelectorAll('.figure-thumb').forEach(li => {
            const k = Number(li.dataset.slide);
            li.classList.toggle('is-active', k === idx);
        });
        updateNavButtonsUi();
    }

    function updateNavButtonsUi() {
        const total = totalSlides();
        const disabled = total <= 1;
        els.prevBtn.disabled = disabled;
        els.nextBtn.disabled = disabled;
        els.prevBtn.classList.toggle('is-disabled', disabled);
        els.nextBtn.classList.toggle('is-disabled', disabled);
    }

    function goPrev() { renderStage(state.imageIndex - 1); }
    function goNext() { renderStage(state.imageIndex + 1); }

    // ---------- 자동 재생 ----------
    function startAutoplay() {
        stopAutoplay();
        state.autoplay = true;
        els.autoplayBtn.setAttribute('aria-pressed', 'true');
        els.autoplayBtn.classList.add('is-on');
        els.autoplayBtn.querySelector('.figure-gallery-autoplay-icon').textContent = '❚❚';
        state.autoplayTimer = setInterval(() => {
            if (isModelSlide(state.imageIndex)) return;
            goNext();
        }, 2800);
    }
    function stopAutoplay() {
        state.autoplay = false;
        if (state.autoplayTimer) {
            clearInterval(state.autoplayTimer);
            state.autoplayTimer = null;
        }
        els.autoplayBtn?.setAttribute('aria-pressed', 'false');
        els.autoplayBtn?.classList.remove('is-on');
        const iconEl = els.autoplayBtn?.querySelector('.figure-gallery-autoplay-icon');
        if (iconEl) iconEl.textContent = '▶';
    }
    function toggleAutoplay() {
        if (state.autoplay) stopAutoplay();
        else startAutoplay();
    }

    // ---------- three.js 3D 뷰어 ----------
    function disposeViewer() {
        if (state.viewer && typeof state.viewer.dispose === 'function') {
            try { state.viewer.dispose(); } catch (_) {}
        }
        state.viewer = null;
    }

    function mountViewer() {
        if (!window.THREE) {
            const status = document.getElementById('figure-3d-status');
            if (status) status.textContent = 'three.js 라이브러리를 불러오지 못했습니다.';
            return;
        }
        const item = state.currentItem;
        const cat = state.currentCategory;
        const modelFile = state.currentModelFile;
        if (!item || !cat || !modelFile) return;
        const modelUrl = `${itemFolderUrl(cat.key, item.name)}/${encodeURIComponent(modelFile)}`;
        const ext = (modelFile.split('.').pop() || '').toLowerCase();

        const host = document.getElementById('figure-3d-canvas');
        const statusEl = document.getElementById('figure-3d-status');
        if (!host) return;

        const scene = new THREE.Scene();
        scene.background = new THREE.Color(0x0e131a);

        const w = host.clientWidth || 600;
        const h = host.clientHeight || 400;
        const camera = new THREE.PerspectiveCamera(40, w / h, 0.1, 5000);
        camera.position.set(0, 0, 200);

        const renderer = new THREE.WebGLRenderer({ antialias: true });
        renderer.setPixelRatio(window.devicePixelRatio || 1);
        renderer.setSize(w, h);
        host.appendChild(renderer.domElement);

        const hemi = new THREE.HemisphereLight(0xffffff, 0x202830, 0.9);
        scene.add(hemi);
        const dir = new THREE.DirectionalLight(0xffffff, 0.9);
        dir.position.set(150, 200, 150);
        scene.add(dir);
        const dir2 = new THREE.DirectionalLight(0xffd9a8, 0.4);
        dir2.position.set(-150, -100, -200);
        scene.add(dir2);

        const controls = new THREE.OrbitControls(camera, renderer.domElement);
        controls.enableDamping = true;
        controls.dampingFactor = 0.08;

        let rafId = 0;
        let modelObj = null;
        let resizeObs = null;
        let disposed = false;

        function animate() {
            if (disposed) return;
            rafId = requestAnimationFrame(animate);
            controls.update();
            renderer.render(scene, camera);
        }

        function frameObject(obj) {
            const box = new THREE.Box3().setFromObject(obj);
            const size = new THREE.Vector3();
            const center = new THREE.Vector3();
            box.getSize(size);
            box.getCenter(center);
            obj.position.x -= center.x;
            obj.position.y -= center.y;
            obj.position.z -= center.z;
            const maxDim = Math.max(size.x, size.y, size.z) || 1;
            const fov = camera.fov * (Math.PI / 180);
            const dist = (maxDim / 2) / Math.tan(fov / 2) * 1.8;
            camera.position.set(dist * 0.6, dist * 0.4, dist);
            camera.near = Math.max(0.1, dist / 1000);
            camera.far = dist * 100;
            camera.updateProjectionMatrix();
            controls.target.set(0, 0, 0);
            controls.update();
        }

        function onResize() {
            if (disposed) return;
            const w2 = host.clientWidth || 600;
            const h2 = host.clientHeight || 400;
            renderer.setSize(w2, h2);
            camera.aspect = w2 / h2;
            camera.updateProjectionMatrix();
        }
        if ('ResizeObserver' in window) {
            resizeObs = new ResizeObserver(onResize);
            resizeObs.observe(host);
        }
        window.addEventListener('resize', onResize);

        if (ext === 'stl') {
            const loader = new THREE.STLLoader();
            loader.load(modelUrl, (geometry) => {
                if (disposed) return;
                geometry.computeVertexNormals();
                const mat = new THREE.MeshStandardMaterial({
                    color: 0xff9100, metalness: 0.05, roughness: 0.7
                });
                modelObj = new THREE.Mesh(geometry, mat);
                scene.add(modelObj);
                frameObject(modelObj);
                if (statusEl) statusEl.style.display = 'none';
                animate();
            }, undefined, (err) => {
                console.warn('[Figure] STL 로드 실패', err);
                if (statusEl) statusEl.textContent = 'STL 모델을 불러오지 못했습니다.';
            });
        } else if (ext === 'glb' || ext === 'gltf') {
            const loader = new THREE.GLTFLoader();
            loader.load(modelUrl, (gltf) => {
                if (disposed) return;
                modelObj = gltf.scene;
                scene.add(modelObj);
                frameObject(modelObj);
                if (statusEl) statusEl.style.display = 'none';
                animate();
            }, undefined, (err) => {
                console.warn('[Figure] GLB 로드 실패', err);
                if (statusEl) statusEl.textContent = 'GLB 모델을 불러오지 못했습니다.';
            });
        } else {
            if (statusEl) statusEl.textContent = `지원하지 않는 모델 확장자: ${ext}`;
        }

        state.viewer = {
            dispose() {
                disposed = true;
                if (rafId) cancelAnimationFrame(rafId);
                window.removeEventListener('resize', onResize);
                if (resizeObs) resizeObs.disconnect();
                try { controls.dispose(); } catch (_) {}
                if (modelObj) {
                    scene.remove(modelObj);
                    modelObj.traverse?.(node => {
                        if (node.geometry) node.geometry.dispose?.();
                        if (node.material) {
                            if (Array.isArray(node.material)) node.material.forEach(m => m.dispose?.());
                            else node.material.dispose?.();
                        }
                    });
                }
                renderer.dispose();
                if (renderer.domElement?.parentNode === host) host.removeChild(renderer.domElement);
            }
        };
    }

    // ---------- 이벤트 ----------
    function bindEvents() {
        els.categoriesWrap.addEventListener('click', (e) => {
            const card = e.target.closest('.figure-card');
            if (!card) return;
            const cat = card.dataset.cat;
            const name = card.dataset.name;
            openDetail(cat, name);
        });

        let timer = null;
        els.searchInput.addEventListener('input', (e) => {
            clearTimeout(timer);
            timer = setTimeout(() => {
                state.query = e.target.value || '';
                renderList();
            }, 90);
        });
        els.searchInput.addEventListener('keydown', (e) => {
            if (e.key === 'Escape') {
                els.searchInput.value = '';
                state.query = '';
                renderList();
            }
        });
        els.searchClear.addEventListener('click', () => {
            els.searchInput.value = '';
            state.query = '';
            renderList();
            els.searchInput.focus();
        });

        els.backBtn.addEventListener('click', closeDetail);

        els.prevBtn.addEventListener('click', () => { stopAutoplay(); goPrev(); });
        els.nextBtn.addEventListener('click', () => { stopAutoplay(); goNext(); });
        els.autoplayBtn.addEventListener('click', toggleAutoplay);
        els.thumbStrip.addEventListener('click', (e) => {
            const li = e.target.closest('.figure-thumb');
            if (!li) return;
            const k = Number(li.dataset.slide);
            if (Number.isFinite(k)) {
                stopAutoplay();
                renderStage(k);
            }
        });

        document.addEventListener('keydown', (e) => {
            if (state.view !== 'detail') return;
            if (e.target && /^(INPUT|TEXTAREA)$/i.test(e.target.tagName)) return;
            if (e.key === 'ArrowLeft')  { stopAutoplay(); goPrev(); }
            else if (e.key === 'ArrowRight') { stopAutoplay(); goNext(); }
            else if (e.key === 'Escape') { closeDetail(); }
        });
    }

    function maybeOpenFromUrl() {
        try {
            const url = new URL(window.location.href);
            const cat = url.searchParams.get('cat');
            const name = url.searchParams.get('name');
            if (cat && name && findItem(cat, name)) {
                openDetail(cat, name);
            }
        } catch (_) {}
    }

    async function init() {
        mountHeader();
        bindEvents();
        await loadIndex();
        maybeOpenFromUrl();
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();
