const CATEGORY_META = {
  mountain: { label: '山脈', icon: '⛰️', color: '#8b5e3c' },
  river: { label: '河流', icon: '〰️', color: '#2b7bbb' },
  lake: { label: '湖泊', icon: '💧', color: '#39a0ca' },
  landform: { label: '特殊地形', icon: '🪨', color: '#d78235' },
  park: { label: '國家公園', icon: '🌲', color: '#2b7a4b' },
  animal: { label: '特有動物', icon: '🐾', color: '#b33a3a' },
  plant: { label: '特色植物', icon: '🌿', color: '#668b2f' }
};

const missions = [
  '比較喜馬拉雅山脈與烏拉山脈，觀察它們在亞洲的位置與形成方式。',
  '從長江上游移動到青藏高原，思考河流水源與地形的關係。',
  '選取特有動物，找出只自然分布於中國山地竹林的物種。',
  '比較戈壁沙漠與婆羅洲熱帶雨林的水分條件。',
  '選取特色植物，觀察高山、沙漠與熱帶植物的適應差異。',
  '找出亞洲的高原與大型湖泊，說明板塊活動與氣候的影響。'
];

const ASIA_BOUNDS = L.latLngBounds([-12, 25], [80, 180]);
const map = L.map('map', {
  minZoom: 2,
  maxZoom: 12,
  zoomControl: true,
  maxBounds: ASIA_BOUNDS.pad(0.12),
  maxBoundsViscosity: 0.75,
  worldCopyJump: false
}).fitBounds(ASIA_BOUNDS);
function updateLabelDensity() {
  document.getElementById('map').classList.toggle('map-overview', map.getZoom() < 4);
}
map.on('zoomend', updateLabelDensity);
updateLabelDensity();
const satelliteOptions = {
  maxZoom: 18,
  attribution: 'Tiles &copy; Esri, Maxar, Earthstar Geographics'
};
const primarySatelliteLayer = L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', satelliteOptions).addTo(map);
const backupSatelliteLayer = L.tileLayer('https://services.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', satelliteOptions);
let failedSatelliteTiles = 0;

primarySatelliteLayer.on('tileerror', () => {
  failedSatelliteTiles += 1;
  if (failedSatelliteTiles < 3 || map.hasLayer(backupSatelliteLayer)) return;
  map.removeLayer(primarySatelliteLayer);
  backupSatelliteLayer.addTo(map);
});

const groups = Object.fromEntries(Object.keys(CATEGORY_META).map(key => [key, L.layerGroup().addTo(map)]));
const selectedCategories = new Set(Object.keys(CATEGORY_META));
const markersById = new Map();
let places = [];
let quizzes = [];
let photosByPlace = {};
let currentQuiz = null;
let missionIndex = 0;

function markerIcon(category) {
  const meta = CATEGORY_META[category];
  return L.divIcon({ className: '', html: `<div class="custom-marker" style="background:${meta.color}"><span>${meta.icon}</span></div>`, iconSize: [30, 30], iconAnchor: [15, 30] });
}

async function loadJson(path) {
  const response = await fetch(path);
  if (!response.ok) throw new Error(`無法載入 ${path}`);
  return response.json();
}

function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>'"]/g, character => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;'
  })[character]);
}

function googleExploreUrl(place) {
  const query = encodeURIComponent(`${place.nameEn}, ${place.country}`);
  return `https://www.google.com/maps/search/?api=1&query=${query}`;
}

function buildPhotoGallery(place) {
  const photos = photosByPlace[place.id] || [];
  if (!photos.length) return '';

  return `<section class="info-section photo-section" aria-labelledby="photo-heading">
    <div class="photo-heading"><h2 id="photo-heading">CC 授權實景照片</h2><span>${photos.length} 張</span></div>
    <div class="photo-gallery">${photos.map(photo => `
      <figure class="photo-item${photo.panorama ? ' panorama' : ''}">
        <a href="${escapeHtml(photo.source)}" target="_blank" rel="noopener" aria-label="在 Wikimedia Commons 查看原始照片">
          <img src="${escapeHtml(photo.image)}" alt="${escapeHtml(`${place.nameZh}：${photo.title}`)}" loading="lazy" decoding="async" width="${photo.width}" height="${photo.height}">
          ${photo.panorama ? '<span class="panorama-badge">全景</span>' : ''}
        </a>
        <figcaption>
          <span class="photo-title">${escapeHtml(photo.title)}</span>
          <span>攝影／作者：${escapeHtml(photo.author)}</span>
          <a href="${escapeHtml(photo.licenseUrl)}" target="_blank" rel="noopener">${escapeHtml(photo.license)}</a>
        </figcaption>
      </figure>`).join('')}</div>
    <p class="photo-note">照片來自 Wikimedia Commons；點選照片可查看原始檔與完整授權資訊。</p>
  </section>`;
}

function buildInfo(place) {
  const meta = CATEGORY_META[place.category];
  const isSpecies = place.category === 'animal' || place.category === 'plant';
  const details = isSpecies ? `
    <div class="info-section"><h2>物種簡介</h2><p>${place.summary}</p></div>
    <div class="info-section"><h2>棲息環境</h2><p>${place.habitat}</p></div>
    <div class="info-section"><h2>辨識與生態特徵</h2><ul>${place.features.map(feature => `<li>${feature}</li>`).join('')}</ul></div>
    <div class="lesson-box conservation-box"><h2>保育現況</h2><p>${place.conservation}</p></div>
    <div class="info-section"><h2>思考問題</h2><p>${place.question}</p></div>` : `
    <div class="info-section"><h2>地形簡介</h2><p>${place.summary}</p></div>
    <div class="info-section"><h2>形成原因</h2><p>${place.formation}</p></div>
    <div class="info-section"><h2>觀察重點</h2><ul>${place.features.map(feature => `<li>${feature}</li>`).join('')}</ul></div>
    <div class="lesson-box"><h2>思考問題</h2><p>${place.question}</p></div>`;
  document.getElementById('infoPanel').innerHTML = `
    <p class="eyebrow">${meta.icon} ${meta.label}</p><h2 class="place-title">${place.nameZh}</h2><p class="place-en">${place.nameEn}${place.scientificName ? ` · <em>${place.scientificName}</em>` : ''}</p>
    <div class="tag-row"><span class="tag">${place.country}</span><span class="tag">${place.region}</span></div>
    ${buildPhotoGallery(place)}
    ${details}
    <div class="info-section action-links"><a href="${googleExploreUrl(place)}" target="_blank" rel="noopener">探索實景照片</a><a href="${place.video}" target="_blank" rel="noopener">公開影片搜尋</a></div>
    <div class="info-section"><h2>出處與延伸閱讀</h2><div class="source-card"><strong>官方／主要來源</strong><br><a href="${place.official}" target="_blank" rel="noopener">開啟來源網站</a></div><div class="source-card">${place.sourceNote}</div></div>`;
}

function selectPlace(place) {
  const zoom = place.category === 'animal' || place.category === 'plant' ? 7 : 6;
  map.flyTo([place.lat, place.lng], zoom, { duration: 1.1 });
  markersById.get(place.id)?.openTooltip();
  buildInfo(place);
}

function addPlaces() {
  places.forEach(place => {
    const isSpecies = place.category === 'animal' || place.category === 'plant';
    const marker = L.marker([place.lat, place.lng], { icon: markerIcon(place.category), title: place.nameZh });
    marker.bindTooltip(place.nameZh, { permanent: !isSpecies, direction: 'top', offset: [0, -27], className: 'map-label map-label-place' });
    marker.on('click', () => buildInfo(place));
    marker.addTo(groups[place.category]);
    markersById.set(place.id, marker);
  });
}

async function addGeoJsonLayer(path, category, style) {
  const data = await loadJson(path);
  return L.geoJSON(data, {
    style,
    onEachFeature(feature, layer) {
      const name = feature.properties.name;
      layer.bindTooltip(name, { permanent: true, direction: 'center', className: 'map-label map-label-line' });
      layer.bindPopup(`<strong>${name}</strong><br><small>${feature.properties.source}</small>`);
    }
  }).addTo(groups[category]);
}

function renderFilters() {
  const container = document.getElementById('categoryFilters');
  Object.entries(CATEGORY_META).forEach(([key, meta]) => {
    const button = document.createElement('button');
    button.className = 'filter-btn active';
    button.type = 'button';
    button.innerHTML = `${meta.icon} ${meta.label}`;
    button.addEventListener('click', () => {
      const active = selectedCategories.has(key);
      if (active) { selectedCategories.delete(key); map.removeLayer(groups[key]); } else { selectedCategories.add(key); groups[key].addTo(map); }
      button.classList.toggle('active', !active);
      renderPlaceList();
      performSearch();
    });
    container.appendChild(button);
  });
}

function renderPlaceList() {
  const list = document.getElementById('placeList');
  list.innerHTML = '';
  places.filter(place => selectedCategories.has(place.category)).forEach(place => {
    const button = document.createElement('button');
    button.type = 'button';
    button.innerHTML = `<span>${CATEGORY_META[place.category].icon}</span><span>${place.nameZh}<small>${place.nameEn}</small></span>`;
    button.addEventListener('click', () => selectPlace(place));
    list.appendChild(button);
  });
}

function renderLegend() {
  document.getElementById('legend').innerHTML = Object.values(CATEGORY_META).map(meta => `<div class="legend-item"><span class="legend-dot" style="background:${meta.color}"></span>${meta.icon} ${meta.label}</div>`).join('');
}

function performSearch() {
  const query = document.getElementById('searchInput').value.trim().toLowerCase();
  const results = query ? places.filter(place => selectedCategories.has(place.category) && `${place.nameZh} ${place.nameEn} ${place.scientificName || ''} ${place.region}`.toLowerCase().includes(query)).slice(0, 10) : [];
  const box = document.getElementById('searchResults');
  box.innerHTML = results.length ? '' : (query ? '<p class="hint">找不到符合的景點，請調整關鍵字或主題篩選。</p>' : '');
  results.forEach(place => {
    const button = document.createElement('button');
    button.type = 'button';
    button.textContent = `${CATEGORY_META[place.category].icon} ${place.nameZh}｜${place.nameEn}`;
    button.addEventListener('click', () => selectPlace(place));
    box.appendChild(button);
  });
}

function showQuiz() {
  currentQuiz = quizzes[Math.floor(Math.random() * quizzes.length)];
  document.getElementById('quizQuestion').textContent = currentQuiz.question;
  document.getElementById('quizFeedback').textContent = '';
  const box = document.getElementById('quizOptions');
  box.innerHTML = '';
  currentQuiz.options.forEach((option, index) => {
    const button = document.createElement('button');
    button.type = 'button';
    button.textContent = option;
    button.addEventListener('click', () => {
      [...box.children].forEach((item, optionIndex) => { item.disabled = true; if (optionIndex === currentQuiz.answer) item.classList.add('correct'); });
      if (index !== currentQuiz.answer) button.classList.add('wrong');
      document.getElementById('quizFeedback').textContent = `${index === currentQuiz.answer ? '答對了！' : '再觀察一次地圖。'} ${currentQuiz.explanation}`;
    });
    box.appendChild(button);
  });
}

async function init() {
  try {
    const [terrainPlaces, species, quizData, photoData] = await Promise.all([
      loadJson('data/places.json'),
      loadJson('data/species.json'),
      loadJson('data/quizzes.json'),
      loadJson('data/photos.json')
    ]);
    places = [...terrainPlaces, ...species];
    quizzes = quizData;
    photosByPlace = photoData;
    addPlaces(); renderFilters(); renderPlaceList(); renderLegend();
    await Promise.all([
      addGeoJsonLayer('geojson/mountains.geojson', 'mountain', { color: '#b78653', weight: 4, opacity: 0.9 }),
      addGeoJsonLayer('geojson/rivers.geojson', 'river', { color: '#42b8ee', weight: 4, opacity: 0.9 }),
      addGeoJsonLayer('geojson/lakes.geojson', 'lake', { color: '#75d1f2', weight: 2, fillColor: '#75d1f2', fillOpacity: 0.3 })
    ]);
  } catch (error) {
    document.getElementById('infoPanel').innerHTML = `<div class="empty-state"><h2>資料載入失敗</h2><p>${error.message}</p><p>請使用 GitHub Pages 開啟網站。</p></div>`;
    console.error(error);
  }
}

document.getElementById('searchBtn').addEventListener('click', performSearch);
document.getElementById('searchInput').addEventListener('keydown', event => { if (event.key === 'Enter') performSearch(); });
document.getElementById('nextMissionBtn').addEventListener('click', () => { missionIndex = (missionIndex + 1) % missions.length; document.getElementById('missionText').textContent = missions[missionIndex]; });
document.getElementById('tourBtn').addEventListener('click', () => {
  const route = ['himalayas', 'giant-panda', 'zhangjiajie', 'komodo-np', 'gobi-desert', 'yangtze-river', 'sundarbans-np'];
  let index = 0;
  const visit = () => { const place = places.find(item => item.id === route[index]); selectPlace(place); index = (index + 1) % route.length; };
  visit();
  const timer = setInterval(visit, 4200);
  setTimeout(() => clearInterval(timer), route.length * 4200);
});
const dialog = document.getElementById('quizDialog');
document.getElementById('quizBtn').addEventListener('click', () => { showQuiz(); dialog.showModal(); });
document.getElementById('nextQuizBtn').addEventListener('click', showQuiz);

init();
