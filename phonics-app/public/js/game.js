const state = {
  me: null, levels: [], progress: null, level: null, queue: [], wordIndex: 0,
  joined: [], mistakes: 0, sessionStars: 0, startedAt: 0, busy: false,
  currentAudio: null, audioSequence: 0, accent: 'en-gb', accentLabel: '英式英語',
  ttsAvailable: false, ttsUrls: new Map(),
};

const $ = selector => document.querySelector(selector);
const levelScreen = $('#levelScreen');
const gameScreen = $('#gameScreen');

async function api(path, options = {}) {
  const response = await fetch(path, {
    credentials: 'include',
    ...options,
    headers: { ...(options.body ? { 'Content-Type': 'application/json' } : {}), ...(options.headers || {}) },
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw Object.assign(new Error(data.message || '暫時無法連接平台'), { status: response.status });
  return data;
}

function escapeHtml(value) {
  return String(value ?? '').replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;');
}

function shuffle(items) {
  const result = [...items];
  for (let index = result.length - 1; index > 0; index -= 1) {
    const target = Math.floor(Math.random() * (index + 1));
    [result[index], result[target]] = [result[target], result[index]];
  }
  return result;
}

let toastTimer;
function toast(message) {
  const node = $('#toast');
  node.textContent = message;
  node.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => node.classList.remove('show'), 1900);
}

function stopAudio() {
  state.audioSequence += 1;
  if (state.currentAudio) {
    state.currentAudio.pause();
    state.currentAudio.currentTime = 0;
    state.currentAudio = null;
  }
}

function playAudio(url) {
  stopAudio();
  const sequence = state.audioSequence;
  return new Promise(resolve => {
    const audio = new Audio(url);
    state.currentAudio = audio;
    const finish = () => {
      if (state.currentAudio === audio) state.currentAudio = null;
      resolve(sequence === state.audioSequence);
    };
    audio.addEventListener('ended', finish, { once: true });
    audio.addEventListener('error', () => {
      $('#audioStatus').textContent = '音檔未能播放，請重新整理後再試。';
      $('#audioStatus').classList.add('error');
      finish();
    }, { once: true });
    audio.play().catch(() => {
      $('#audioStatus').textContent = '請先按一下畫面，再按喇叭播放發音。';
      $('#audioStatus').classList.add('error');
      finish();
    });
  });
}

async function googleTtsUrl({ wordId = '', accent = state.accent, preview = false }) {
  const key = preview ? `preview:${accent}` : `${accent}:${wordId}`;
  if (state.ttsUrls.has(key)) return state.ttsUrls.get(key);
  const response = await fetch('/api/phonics/tts', {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ wordId, accent, preview }),
  });
  if (!response.ok) {
    const data = await response.json().catch(() => ({}));
    throw new Error(data.message || 'Google TTS 暫時無法使用。');
  }
  const url = URL.createObjectURL(await response.blob());
  state.ttsUrls.set(key, url);
  return url;
}

async function speakWord(entry, accent = state.accent) {
  if (!state.ttsAvailable) return false;
  stopAudio();
  const requestSequence = state.audioSequence;
  try {
    const url = await googleTtsUrl({ wordId: entry.id, accent });
    if (requestSequence !== state.audioSequence) return false;
    return await playAudio(url);
  } catch (error) {
    $('#audioStatus').textContent = error.message;
    $('#audioStatus').classList.add('error');
    toast(error.message);
    return false;
  }
}

async function speakPreview(accent) {
  if (!state.ttsAvailable) return false;
  stopAudio();
  const requestSequence = state.audioSequence;
  try {
    const url = await googleTtsUrl({ accent, preview: true });
    if (requestSequence !== state.audioSequence) return false;
    return await playAudio(url);
  } catch (error) {
    toast(error.message);
    return false;
  }
}

function progressFor(levelId) {
  return state.progress?.levels?.find(item => item.levelId === levelId) || { mastered: 0, wordCount: 0, stars: 0, words: [] };
}

function renderSummary() {
  const progress = state.progress || { masteredWords: 0, totalWords: 0, totalStars: 0, attempts: 0 };
  $('#summaryRow').innerHTML = [
    ['⭐', progress.totalStars, '累積星星'],
    ['✅', `${progress.masteredWords}/${progress.totalWords}`, '已掌握單字'],
    ['🚂', progress.attempts, '完成旅程'],
  ].map(([icon, value, label]) => `<div class="summary-card"><span class="summary-icon">${icon}</span><div><strong>${value}</strong><span>${label}</span></div></div>`).join('');
}

function renderLevels() {
  renderSummary();
  $('#levelGrid').innerHTML = state.levels.map(level => {
    const progress = progressFor(level.id);
    const pct = level.words.length ? Math.round(progress.mastered / level.words.length * 100) : 0;
    return `<button class="level-card" data-level="${escapeHtml(level.id)}">
      <span class="level-card-head"><span class="level-number">${level.order}</span><span class="level-badge">${escapeHtml(level.badge)}</span></span>
      <h3>${escapeHtml(level.title)}</h3><span class="subtitle">${escapeHtml(level.subtitle)}</span>
      <p>${escapeHtml(level.description)}</p>
      <span class="level-card-footer"><span>${progress.mastered}/${level.words.length} 已掌握</span><span class="mini-progress"><span style="width:${pct}%"></span></span></span>
    </button>`;
  }).join('');
  document.querySelectorAll('[data-level]').forEach(button => button.addEventListener('click', () => startLevel(button.dataset.level)));
}

function startLevel(levelId) {
  state.level = state.levels.find(item => item.id === levelId);
  if (!state.level) return;
  state.queue = shuffle(state.level.words);
  state.wordIndex = 0;
  state.sessionStars = 0;
  levelScreen.classList.add('hidden');
  gameScreen.classList.remove('hidden');
  renderWord();
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

function currentWord() { return state.queue[state.wordIndex]; }

function renderWord() {
  stopAudio();
  state.joined = [];
  state.mistakes = 0;
  state.startedAt = Date.now();
  state.busy = false;
  const entry = currentWord();
  const done = state.wordIndex;
  $('#journeyLabel').textContent = `${state.level.subtitle} · ${done + 1}/${state.queue.length}`;
  $('#progressBar').style.width = `${done / state.queue.length * 100}%`;
  $('#starCounter').textContent = `★ ${state.sessionStars}`;
  $('#targetEmoji').textContent = entry.emoji;
  $('#wordMode').textContent = entry.mode === 'syllable' ? 'SYLLABLE TRAIN · 音節列車' : 'PHONEME TRAIN · 音素列車';
  $('#targetHint').textContent = `${entry.zh} · ${'_ '.repeat(entry.segments.length).trim()}`;
  $('#listenWord').onclick = () => speakWord(entry);
  $('#listenWord').disabled = !state.ttsAvailable;
  $('#listenWord').textContent = state.ttsAvailable ? '🔊 聽完整單字' : '🔇 Google TTS 尚未設定';
  $('#slowBlend').disabled = !state.ttsAvailable;
  $('#trackZone').className = 'track-zone';
  renderTrain();
  renderBank();
}

function renderTrain() {
  const entry = currentWord();
  const unitLabel = entry.mode === 'syllable' ? '音節' : '音';
  $('#joinedTrain').innerHTML = state.joined.map(index => {
    const item = entry.segments[index];
    return `<span class="joined-carriage"><span>${escapeHtml(item.text.replace('_', '·'))}</span><small>/${escapeHtml(item.ipa)}/</small></span>`;
  }).join('');
  const text = state.joined.map(index => entry.segments[index].text.replace('_', '')).join('');
  const blendIpa = entry.segments.slice(0, state.joined.length).map(item => item.ipa).join('');
  $('#blendReadout').innerHTML = `<span>已連接 ${state.joined.length || 0} 個${unitLabel}</span><strong>${escapeHtml(text || '—')}</strong><small>${state.joined.length ? `音素次序：/${escapeHtml(blendIpa)}/；接完整後播放自然單字` : '接上第一節車廂開始'}</small>`;
  $('#dropHint').classList.toggle('hidden', state.joined.length > 0);
}

function renderBank() {
  const entry = currentWord();
  const indices = shuffle(entry.segments.map((_item, index) => index));
  $('#carriageBank').innerHTML = indices.map(index => {
    const item = entry.segments[index];
    return `<div class="carriage ${state.joined.includes(index) ? 'used' : ''}" role="button" tabindex="0" aria-label="接駁 ${escapeHtml(item.text)}" draggable="true" data-segment="${index}">
      <span class="letters">${escapeHtml(item.text.replace('_', '·'))}</span><span class="ipa">/${escapeHtml(item.ipa)}/</span>
    </div>`;
  }).join('');
  document.querySelectorAll('.carriage').forEach(button => {
    button.addEventListener('click', () => connectSegment(Number(button.dataset.segment)));
    button.addEventListener('keydown', event => {
      if (event.key !== 'Enter' && event.key !== ' ') return;
      event.preventDefault();
      connectSegment(Number(button.dataset.segment));
    });
    button.addEventListener('dragstart', event => event.dataTransfer.setData('text/plain', button.dataset.segment));
  });
}

async function connectSegment(index) {
  if (state.busy || state.joined.includes(index)) return;
  const entry = currentWord();
  const expected = state.joined.length;
  if (index !== expected) {
    state.mistakes += 1;
    const track = $('#trackZone');
    track.classList.remove('wrong');
    void track.offsetWidth;
    track.classList.add('wrong');
    toast('再看一次音素次序，找出下一節車廂。');
    return;
  }

  state.busy = true;
  state.joined.push(index);
  renderTrain();
  renderBank();
  if (state.joined.length < entry.segments.length) {
    state.busy = false;
    return;
  }

  if (state.ttsAvailable) await speakWord(entry);
  $('#targetHint').textContent = `${entry.spelling} · ${entry.zh}`;
  const stars = state.mistakes === 0 ? 3 : state.mistakes <= 2 ? 2 : 1;
  state.sessionStars += stars;
  $('#starCounter').textContent = `★ ${state.sessionStars}`;
  $('#trackZone').classList.add('departing');
  if (state.me.role !== 'teacher') {
    try {
      await api('/api/phonics/attempts', {
        method: 'POST',
        body: JSON.stringify({
          wordId: entry.id,
          assembled: entry.segments.map(item => item.text),
          mistakes: state.mistakes,
          elapsedMs: Date.now() - state.startedAt,
        }),
      });
    } catch (error) { toast(`進度未能儲存：${error.message}`); }
  }
  await new Promise(resolve => setTimeout(resolve, 950));
  state.wordIndex += 1;
  if (state.wordIndex >= state.queue.length) return finishLevel();
  renderWord();
}

async function finishLevel() {
  $('#progressBar').style.width = '100%';
  if (state.me.role !== 'teacher') {
    try { state.progress = (await api('/api/phonics/progress')).progress; } catch {}
  }
  const maximum = state.queue.length * 3;
  $('#resultText').textContent = `你完成了 ${state.queue.length} 個單字，共得到 ${state.sessionStars}/${maximum} 顆星。`;
  $('#resultStars').textContent = state.sessionStars >= maximum * .8 ? '★★★' : state.sessionStars >= maximum * .5 ? '★★' : '★';
  $('#celebration').classList.remove('hidden');
}

function returnToLevels() {
  stopAudio();
  $('#celebration').classList.add('hidden');
  gameScreen.classList.add('hidden');
  levelScreen.classList.remove('hidden');
  renderLevels();
}

$('#trackZone').addEventListener('dragover', event => { event.preventDefault(); $('#trackZone').classList.add('drag-over'); });
$('#trackZone').addEventListener('dragleave', () => $('#trackZone').classList.remove('drag-over'));
$('#trackZone').addEventListener('drop', event => {
  event.preventDefault();
  $('#trackZone').classList.remove('drag-over');
  connectSegment(Number(event.dataTransfer.getData('text/plain')));
});
$('#slowBlend').addEventListener('click', () => speakWord(currentWord()));
$('#resetWord').addEventListener('click', renderWord);
$('#backToLevels').addEventListener('click', returnToLevels);
$('#chooseAnother').addEventListener('click', returnToLevels);
$('#replayLevel').addEventListener('click', () => { $('#celebration').classList.add('hidden'); startLevel(state.level.id); });
document.querySelectorAll('[data-preview-audio]').forEach(button => button.addEventListener('click', () => {
  speakPreview(button.dataset.previewAudio);
}));

async function init() {
  try {
    const me = await api('/api/auth/me');
    state.me = me.student;
    $('#userChip').textContent = `${state.me.name}${state.me.role === 'teacher' ? ' · 預覽' : ''}`;
    $('#accentPreviewPanel').classList.add('hidden');
    const previewAccent = new URLSearchParams(location.search).get('accent');
    const catalogUrl = state.me.role === 'teacher' && previewAccent
      ? `/api/phonics/catalog?accent=${encodeURIComponent(previewAccent)}`
      : '/api/phonics/catalog';
    const [catalog, progress] = await Promise.all([
      api(catalogUrl),
      state.me.role === 'teacher' ? Promise.resolve({ progress: null }) : api('/api/phonics/progress'),
    ]);
    state.accent = catalog.accent || 'en-gb';
    state.accentLabel = catalog.accentLabel || (state.accent === 'en-us' ? '美式英語' : '英式英語');
    state.ttsAvailable = catalog.ttsAvailable === true;
    $('#accentPreviewPanel').classList.toggle('hidden', state.me.role !== 'teacher' || !state.ttsAvailable);
    $('#audioStatus').textContent = state.ttsAvailable
      ? `完整單字使用 Google Cloud TTS（${state.accentLabel}）；單音及半詞不使用合成語音。`
      : 'Google TTS 尚未設定，完整單字朗讀暫時停用。';
    $('#audioStatus').classList.remove('error');
    state.levels = catalog.levels;
    state.progress = progress.progress;
    renderLevels();
  } catch (error) {
    if (error.status === 401) return location.replace('/');
    $('#levelGrid').innerHTML = `<div class="panel" style="padding:24px">${escapeHtml(error.message)}</div>`;
  }
}

init();
