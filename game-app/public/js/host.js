
// ExcelJS is ~926KB and only teachers importing or exporting a spreadsheet ever need it, yet
// it was loaded eagerly on the portal for every student on every visit. Fetch it on demand.
let excelJsPromise = null;
function loadExcelJs() {
  if (window.ExcelJS) return Promise.resolve(window.ExcelJS);
  if (!excelJsPromise) {
    excelJsPromise = new Promise((resolve, reject) => {
      const script = document.createElement('script');
      script.src = '/vendor/exceljs.min.js';
      script.onload = () => resolve(window.ExcelJS);
      script.onerror = () => { excelJsPromise = null; reject(new Error(window.BuiI18n.t('g.excelLoadFailed'))); };
      document.head.appendChild(script);
    });
  }
  return excelJsPromise;
}
'use strict';

const { t, server: serverText, lang: uiLang } = window.BuiI18n;

// 唔好望落嚟 — teacher host console.
// Setup (pick set, duration) -> lobby (join code + roster) -> live board
// (mountain + ranked progress) -> results. Also a minimal question-set editor.

(function () {
  const $ = id => document.getElementById(id);
  const socket = io('/game');
  const launchParams = new URLSearchParams(location.search);
  const fromHub = launchParams.get('hub') === '1';
  const hubUrl = location.pathname.endsWith('/preview') ? '/games/preview?role=teacher' : '/games';

  let teacherName = t('g.teacherFallback');
  let selectedSetId = null;
  let editingSetId = null;      // null = creating new
  let roomCode = null;
  let liveTimerHandle = null;
  let gameEndsAt = null;
  let latestPositions = [];
  const setDetailsCache = new Map();
  const accessoryGlyphs = { none: '', cap: '🎓', crown: '👑', star: '⭐' };

  function show(screenId) {
    document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
    $(screenId).classList.add('active');
  }

  function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  }

  // ---------------- session ----------------
  const teacherReady = fetch('/api/auth/me', { credentials: 'include' })
    .then(r => r.ok ? r.json() : null)
    .then(data => {
      const u = data?.student;
      if (u?.name) teacherName = u.name;
    })
    .catch(() => {});

  // ---------------- question sets ----------------
  async function loadSets() {
    const el = $('setList');
    el.innerHTML = `<p class="muted">${escapeHtml(t('g.loading'))}</p>`;
    try {
      const res = await fetch('/api/game/teacher/sets', { credentials: 'include' });
      const data = await res.json();
      if (!data.success) throw new Error(data.message);
      el.innerHTML = '';
      data.sets.forEach(set => {
        const item = document.createElement('div');
        item.className = 'set-item';
        const row = document.createElement('div');
        row.className = 'set-row' + (set.id === selectedSetId ? ' selected' : '');
        row.innerHTML = `
          ${set.builtin ? `<span class="tag">${escapeHtml(t('g.builtinTag'))}</span>` : ''}
          <span class="title">${escapeHtml(set.title)}</span>
          <span class="count">${escapeHtml(t('g.questionCount',{count:set.questionCount}))}</span>
          <button class="btn secondary small set-expand-btn" type="button" data-expand="${set.id}" aria-expanded="false">${escapeHtml(t('g.expand'))}</button>
          ${set.builtin ? '' : `<button class="btn secondary small" data-edit="${set.id}">✏️</button>
          <button class="btn secondary small" data-del="${set.id}" style="color:var(--coral)">🗑</button>`}
        `;
        const preview = document.createElement('div');
        preview.className = 'set-preview';
        preview.hidden = true;
        row.addEventListener('click', (e) => {
          if (e.target.closest('button')) return;
          selectedSetId = set.id;
          document.querySelectorAll('.set-row').forEach(r => r.classList.remove('selected'));
          row.classList.add('selected');
          $('createRoomBtn').disabled = false;
        });
        row.querySelector('[data-expand]')?.addEventListener('click', () => toggleSetPreview(set, preview, row.querySelector('[data-expand]')));
        row.querySelector('[data-edit]')?.addEventListener('click', () => openEditor(set.id));
        row.querySelector('[data-del]')?.addEventListener('click', async () => {
          if (!confirm(t('g.confirmDelete',{title:set.title}))) return;
          await fetch(`/api/game/teacher/sets/${set.id}`, { method: 'DELETE', credentials: 'include' });
          if (selectedSetId === set.id) { selectedSetId = null; $('createRoomBtn').disabled = true; }
          setDetailsCache.delete(set.id);
          loadSets();
        });
        item.append(row, preview);
        el.appendChild(item);
      });
      if (!data.dbAvailable) {
        const note = document.createElement('p');
        note.className = 'muted';
        note.style.marginTop = '8px';
        note.textContent = t('g.noDbNote');
        el.appendChild(note);
      }
    } catch (e) {
      el.innerHTML = `<p class="error-msg">${escapeHtml(serverText(e.message) || t('g.loadFailed'))}</p>`;
    }
  }
  loadSets();

  async function toggleSetPreview(set, preview, button) {
    const opening = preview.hidden;
    document.querySelectorAll('.set-preview').forEach(panel => { panel.hidden = true; });
    document.querySelectorAll('.set-expand-btn').forEach(control => {
      control.setAttribute('aria-expanded', 'false');
      control.textContent = t('g.expand');
    });
    if (!opening) return;
    preview.hidden = false;
    button.setAttribute('aria-expanded', 'true');
    button.textContent = t('g.collapse');
    preview.innerHTML = `<p class="muted">${escapeHtml(t('g.loadingQuestions'))}</p>`;
    try {
      let detail = setDetailsCache.get(set.id);
      if (!detail) {
        const res = await fetch(`/api/game/teacher/sets/${set.id}`, { credentials: 'include' });
        const data = await res.json();
        if (!data.success) throw new Error(serverText(data.message) || t('g.loadFailed'));
        detail = data.set;
        setDetailsCache.set(set.id, detail);
      }
      preview.innerHTML = detail.questions.map((q, index) => `
        <div class="set-preview-question">
          <strong>${index + 1}. ${escapeHtml(q.question)}</strong>
          ${q.image ? `<img class="set-preview-image" src="${escapeHtml(q.image)}" alt="${escapeHtml(t('g.questionImageAlt'))}" loading="lazy">` : ''}
          <div class="set-preview-choices">
            ${q.choices.map((choice, choiceIndex) => `
              <span class="${choiceIndex === q.correctIndex ? 'correct' : ''}">
                ${['A', 'B', 'C', 'D'][choiceIndex]}. ${escapeHtml(choice)}
              </span>`).join('')}
          </div>
        </div>`).join('');
    } catch (e) {
      preview.innerHTML = `<p class="error-msg">${escapeHtml(serverText(e.message) || t('g.loadFailed'))}</p>`;
    }
  }

  // ---------------- set editor ----------------
  const QUESTION_IMAGE_MAX_BYTES = 256 * 1024;
  const QUESTION_IMAGE_MAX_SOURCE_BYTES = 16 * 1024 * 1024;

  async function normalizeQuestionImage(blob) {
    if (!blob || blob.size > QUESTION_IMAGE_MAX_SOURCE_BYTES) throw new Error(t('g.imageTooLarge'));
    const objectUrl = URL.createObjectURL(blob);
    try {
      const image = new Image();
      const loaded = new Promise((resolve, reject) => {
        image.onload = resolve;
        image.onerror = () => reject(new Error(t('g.imageInvalid')));
      });
      image.src = objectUrl;
      await loaded;
      const maxWidth = 1280;
      const maxHeight = 960;
      let scale = Math.min(1, maxWidth / image.naturalWidth, maxHeight / image.naturalHeight);
      for (let resize = 0; resize < 5; resize++, scale *= 0.82) {
        const canvas = document.createElement('canvas');
        canvas.width = Math.max(1, Math.round(image.naturalWidth * scale));
        canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));
        const context = canvas.getContext('2d');
        if (!context) throw new Error(t('g.imageInvalid'));
        context.fillStyle = '#fff';
        context.fillRect(0, 0, canvas.width, canvas.height);
        context.drawImage(image, 0, 0, canvas.width, canvas.height);
        for (const quality of [0.86, 0.78, 0.7, 0.62, 0.54]) {
          const dataUrl = canvas.toDataURL('image/jpeg', quality);
          const base64 = dataUrl.slice(dataUrl.indexOf(',') + 1);
          if (Math.floor(base64.length * 3 / 4) <= QUESTION_IMAGE_MAX_BYTES) return dataUrl;
        }
      }
      throw new Error(t('g.imageTooLarge'));
    } finally {
      URL.revokeObjectURL(objectUrl);
    }
  }

  function questionBlock(q = {}) {
    const div = document.createElement('div');
    div.className = 'editor-q';
    const choices = q.choices || ['', '', '', ''];
    div.innerHTML = `
      <div class="q-num"></div>
      <button class="del-q" title="${escapeHtml(t('g.deleteQuestion'))}">✕</button>
      <input type="text" class="q-question" maxlength="200" placeholder="${escapeHtml(t('g.questionPh'))}" value="${escapeHtml(q.question || '')}">
      <div class="q-image-tools">
        <input type="file" class="q-image-input" accept="image/jpeg,image/png,image/webp,image/gif" hidden>
        <button class="btn secondary small q-image-pick" type="button">${escapeHtml(t(q.image ? 'g.questionImageChange' : 'g.questionImageAdd'))}</button>
        <button class="q-image-remove" type="button" aria-label="${escapeHtml(t('g.questionImageRemove'))}" title="${escapeHtml(t('g.questionImageRemove'))}" hidden>✕</button>
        <span class="muted">${escapeHtml(t('g.questionImageHint'))}</span>
      </div>
      <img class="q-editor-image" alt="${escapeHtml(t('g.questionImageAlt'))}" hidden>
      ${[0, 1, 2, 3].map(i => `
        <div class="choice-line">
          <input type="radio" name="" value="${i}" ${q.correctIndex === i ? 'checked' : ''} title="${escapeHtml(t('g.correctAnswer'))}">
          <input type="text" class="q-choice-input" maxlength="80" placeholder="${escapeHtml(t('g.choicePh',{letter:['A','B','C','D'][i]}) + (i >= 2 ? t('g.choiceOptional') : ''))}" value="${escapeHtml(choices[i] || '')}">
        </div>`).join('')}
    `;
    div.querySelector('.del-q').addEventListener('click', () => { div.remove(); renumber(); });
    const imagePreview = div.querySelector('.q-editor-image');
    const imageRemove = div.querySelector('.q-image-remove');
    const imagePick = div.querySelector('.q-image-pick');
    const imageInput = div.querySelector('.q-image-input');
    function setQuestionImage(image) {
      div.dataset.image = image || '';
      imagePreview.hidden = !image;
      imageRemove.hidden = !image;
      imagePick.textContent = t(image ? 'g.questionImageChange' : 'g.questionImageAdd');
      if (image) imagePreview.src = image;
      else imagePreview.removeAttribute('src');
    }
    setQuestionImage(q.image || '');
    imagePick.addEventListener('click', () => imageInput.click());
    imageRemove.addEventListener('click', () => setQuestionImage(''));
    imageInput.addEventListener('change', async () => {
      const file = imageInput.files?.[0];
      imageInput.value = '';
      if (!file) return;
      try {
        setQuestionImage(await normalizeQuestionImage(file));
        $('editorError').textContent = '';
      } catch (error) {
        $('editorError').textContent = error.message || t('g.imageInvalid');
      }
    });
    return div;
  }

  function renumber() {
    [...$('editorQuestions').children].forEach((div, i) => {
      div.querySelector('.q-num').textContent = t('g.questionNo',{n:i + 1});
      div.querySelectorAll('input[type="radio"]').forEach(r => r.name = `correct-${i}`);
    });
  }

  function addQuestion(q) {
    $('editorQuestions').appendChild(questionBlock(q));
    renumber();
  }

  async function openEditor(setId) {
    editingSetId = setId || null;
    $('editorError').textContent = '';
    $('excelImportStatus').textContent = t('g.excelHint');
    $('editorQuestions').innerHTML = '';
    if (setId) {
      $('editorTitle').textContent = t('g.editorEdit');
      const res = await fetch(`/api/game/teacher/sets/${setId}`, { credentials: 'include' });
      const data = await res.json();
      if (!data.success) { alert(serverText(data.message) || t('g.loadFailed')); return; }
      $('editorSetTitle').value = data.set.title;
      data.set.questions.forEach(addQuestion);
    } else {
      $('editorTitle').textContent = t('g.editorNew');
      $('editorSetTitle').value = '';
      for (let i = 0; i < 3; i++) addQuestion();
    }
    show('editorScreen');
  }

  $('newSetBtn').addEventListener('click', () => openEditor(null));
  $('addQuestionBtn').addEventListener('click', () => addQuestion());
  $('editorBackBtn').addEventListener('click', () => { loadSets(); show('setupScreen'); });
  $('excelImportBtn').addEventListener('click', () => $('excelImportInput').click());
  $('excelImportInput').addEventListener('change', importExcelQuestions);
  $('excelTemplateBtn').addEventListener('click', downloadExcelTemplate);

  function excelCellText(cell) {
    const value = cell?.value;
    if (value == null) return '';
    if (typeof value === 'object') {
      if (Array.isArray(value.richText)) return value.richText.map(part => part.text || '').join('').trim();
      if (value.text != null) return String(value.text).trim();
      if (value.result != null) return String(value.result).trim();
    }
    return String(value).trim();
  }

  async function importExcelQuestions(event) {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    $('editorError').textContent = '';
    $('excelImportStatus').textContent = t('g.excelReading',{name:file.name});
    try {
      await loadExcelJs();
      const workbook = new ExcelJS.Workbook();
      await workbook.xlsx.load(await file.arrayBuffer());
      const sheet = workbook.worksheets[0];
      if (!sheet) throw new Error(t('g.excelNoSheet'));
      const headers = new Map();
      sheet.getRow(1).eachCell((cell, column) => headers.set(excelCellText(cell).toLowerCase(), column));
      const hasHeader = headers.has('question');
      const columns = {
        question: headers.get('question') || 1,
        optionA: headers.get('optiona') || 2,
        optionB: headers.get('optionb') || 3,
        optionC: headers.get('optionc') || 4,
        optionD: headers.get('optiond') || 5,
        correctAnswer: headers.get('correctanswer') || 6,
        image: headers.get('image') || headers.get('picture') || headers.get('圖片') || 7,
      };
      const firstDataRow = hasHeader ? 2 : 1;
      const imageByRow = new Map();
      for (const embedded of sheet.getImages()) {
        const imageRow = Math.floor(embedded.range.tl.row) + 1;
        const imageColumn = Math.floor(embedded.range.tl.col) + 1;
        if (imageColumn !== columns.image) continue;
        const media = workbook.getImage(Number(embedded.imageId));
        const mime = { jpeg: 'image/jpeg', png: 'image/png', gif: 'image/gif' }[media.extension];
        const imageBlob = media.buffer
          ? new Blob([media.buffer], { type: mime })
          : media.base64 ? await (await fetch(`data:${mime};base64,${media.base64}`)).blob() : null;
        if (!imageBlob) throw new Error(t('g.excelImageInvalid', { row: imageRow }));
        imageByRow.set(imageRow, await normalizeQuestionImage(imageBlob));
      }
      const questions = [];
      for (let rowNumber = firstDataRow; rowNumber <= sheet.rowCount; rowNumber++) {
        const row = sheet.getRow(rowNumber);
        const question = excelCellText(row.getCell(columns.question));
        const choices = ['optionA', 'optionB', 'optionC', 'optionD'].map(key => excelCellText(row.getCell(columns[key])));
        const correctAnswer = excelCellText(row.getCell(columns.correctAnswer)).toUpperCase();
        if (!question && choices.every(value => !value) && !correctAnswer && !imageByRow.has(rowNumber)) continue;
        if (!question) throw new Error(t('g.excelNoQuestion',{row:rowNumber}));
        if (choices.some(choice => !choice)) throw new Error(t('g.excelNoOptions',{row:rowNumber}));
        if (!['A', 'B', 'C', 'D'].includes(correctAnswer)) {
          throw new Error(t('g.excelBadAnswer',{row:rowNumber}));
        }
        questions.push({ question, choices, correctIndex: correctAnswer.charCodeAt(0) - 65, image: imageByRow.get(rowNumber) || null });
      }
      if (!questions.length) throw new Error(t('g.excelEmpty'));
      $('editorQuestions').innerHTML = '';
      questions.forEach(addQuestion);
      if (!$('editorSetTitle').value.trim()) {
        $('editorSetTitle').value = file.name.replace(/\.xlsx$/i, '').slice(0, 60);
      }
      $('excelImportStatus').textContent = t('g.excelImported',{count:questions.length});
    } catch (e) {
      $('excelImportStatus').textContent = t('g.excelFailed');
      $('editorError').textContent = e.message || t('g.excelUnreadable');
    }
  }

  async function downloadExcelTemplate() {
    $('editorError').textContent = '';
    try {
      await loadExcelJs();
      const workbook = new ExcelJS.Workbook();
      workbook.creator = 'BuiO';
      const sheet = workbook.addWorksheet('Questions', { views: [{ state: 'frozen', ySplit: 1 }] });
      sheet.columns = [
        { header: 'question', key: 'question', width: 42 },
        { header: 'optionA', key: 'optionA', width: 22 },
        { header: 'optionB', key: 'optionB', width: 22 },
        { header: 'optionC', key: 'optionC', width: 22 },
        { header: 'optionD', key: 'optionD', width: 22 },
        { header: 'correctAnswer', key: 'correctAnswer', width: 18 },
        { header: 'image', key: 'image', width: 24 },
      ];
      sheet.addRow({
        question: t('g.qSample'),
        optionA: '48',
        optionB: '54',
        optionC: '56',
        optionD: '64',
        correctAnswer: 'C',
        image: '',
      });
      sheet.getRow(2).height = 72;
      sheet.getCell('G1').note = t('g.excelImageNote');
      const sampleCanvas = document.createElement('canvas');
      sampleCanvas.width = 320;
      sampleCanvas.height = 180;
      const sampleContext = sampleCanvas.getContext('2d');
      sampleContext.fillStyle = '#f3f9ff';
      sampleContext.fillRect(0, 0, sampleCanvas.width, sampleCanvas.height);
      sampleContext.fillStyle = '#182747';
      sampleContext.font = 'bold 22px sans-serif';
      sampleContext.fillText('7 × 8 = ?', 18, 31);
      for (let row = 0; row < 7; row++) {
        for (let column = 0; column < 8; column++) {
          sampleContext.beginPath();
          sampleContext.fillStyle = (row + column) % 2 ? '#43c5d2' : '#8a75ef';
          sampleContext.arc(35 + column * 34, 58 + row * 16, 5, 0, Math.PI * 2);
          sampleContext.fill();
        }
      }
      const sampleImageId = workbook.addImage({ base64: sampleCanvas.toDataURL('image/png').split(',')[1], extension: 'png' });
      sheet.addImage(sampleImageId, { tl: { col: 6, row: 1 }, ext: { width: 156, height: 88 } });
      const header = sheet.getRow(1);
      header.font = { bold: true, color: { argb: 'FFFFFFFF' } };
      header.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1F8F70' } };
      header.alignment = { vertical: 'middle', horizontal: 'center' };
      header.height = 24;
      sheet.autoFilter = 'A1:G1';
      sheet.getColumn(6).eachCell((cell, rowNumber) => {
        if (rowNumber > 1) cell.dataValidation = {
          type: 'list',
          allowBlank: false,
          formulae: ['"A,B,C,D"'],
        };
      });
      const buffer = await workbook.xlsx.writeBuffer();
      const url = URL.createObjectURL(new Blob([buffer], {
        type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      }));
      const link = document.createElement('a');
      link.href = url;
      link.download = 'BuiO-question-bank-template.xlsx';
      link.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      $('excelImportStatus').textContent = t('g.templateDone');
    } catch (e) {
      $('editorError').textContent = e.message || t('g.templateFailed');
    }
  }

  $('saveSetBtn').addEventListener('click', async () => {
    const title = $('editorSetTitle').value.trim();
    const questions = [];
    for (const div of $('editorQuestions').children) {
      const question = div.querySelector('.q-question').value.trim();
      if (!question) continue;
      const inputs = [...div.querySelectorAll('.q-choice-input')];
      const radios = [...div.querySelectorAll('input[type="radio"]')];
      const filled = [];
      const idxMap = [];
      inputs.forEach((inp, i) => {
        const v = inp.value.trim();
        if (v) { idxMap[i] = filled.length; filled.push(v); }
      });
      const checkedIdx = radios.findIndex(r => r.checked);
      const correctIndex = checkedIdx >= 0 && idxMap[checkedIdx] !== undefined ? idxMap[checkedIdx] : -1;
      questions.push({ question, choices: filled, correctIndex, image: div.dataset.image || null });
    }
    $('editorError').textContent = '';
    try {
      const url = editingSetId ? `/api/game/teacher/sets/${editingSetId}` : '/api/game/teacher/sets';
      const res = await fetch(url, {
        method: editingSetId ? 'PUT' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ title, questions }),
      });
      const data = await res.json();
      if (!data.success) throw new Error(data.message);
      setDetailsCache.clear();
      loadSets();
      show('setupScreen');
    } catch (e) {
      $('editorError').textContent = serverText(e.message) || t('g.saveFailed');
    }
  });

  // ---------------- create room / lobby ----------------
  function readGameSettings() {
    const maxEnergy = Number($('maxEnergyInput').value);
    const energyPerCorrect = Number($('energyPerCorrectInput').value);
    if (!Number.isInteger(maxEnergy) || maxEnergy < 20 || maxEnergy > 500) {
      throw new Error(t('g.maxEnergyRange'));
    }
    if (!Number.isInteger(energyPerCorrect) || energyPerCorrect < 1 || energyPerCorrect > maxEnergy) {
      throw new Error(t('g.energyRange',{max:maxEnergy}));
    }
    return {
      maxEnergy,
      energyPerCorrect,
      infiniteEnergy: $('infiniteEnergyToggle').checked,
    };
  }

  function syncEnergyControls() {
    const maxEnergy = Math.min(Math.max(Number($('maxEnergyInput').value) || 100, 20), 500);
    $('energyPerCorrectInput').max = String(maxEnergy);
    const infinite = $('infiniteEnergyToggle').checked;
    $('energyPerCorrectInput').disabled = infinite;
    $('energyPerCorrectInput').closest('.field').classList.toggle('control-disabled', infinite);
  }
  $('maxEnergyInput').addEventListener('input', syncEnergyControls);
  $('infiniteEnergyToggle').addEventListener('change', syncEnergyControls);
  syncEnergyControls();

  function createRoom() {
    $('setupError').textContent = '';
    let settings;
    try {
      settings = readGameSettings();
    } catch (e) {
      $('setupError').textContent = e.message;
      return;
    }
    $('createRoomBtn').disabled = true;
    socket.emit('host:create', {
      setId: selectedSetId,
      durationSec: Number($('durationSelect').value),
      hostName: teacherName,
      settings,
    }, (res) => {
      $('createRoomBtn').disabled = false;
      if (!res?.ok) {
        const message = serverText(res?.message) || t('g.createFailed');
        $('setupError').textContent = message;
        if (fromHub) {
          document.documentElement.classList.remove('hub-launch');
          $('lobbyTitle').textContent = t('g.createFailedTitle');
          $('lobbyInfo').textContent = message;
          $('lobbyError').textContent = t('g.createFailedHint');
          show('lobbyScreen');
        }
        return;
      }
      roomCode = res.code;
      const energyLabel = res.settings.infiniteEnergy
        ? t('g.energyInfinite',{max:res.settings.maxEnergy})
        : t('g.energyLimited',{max:res.settings.maxEnergy,gain:res.settings.energyPerCorrect});
      $('lobbyInfo').textContent = t('g.lobbyInfo',{title:res.setTitle,count:res.questionCount,minutes:Math.round(res.durationSec / 60),energy:energyLabel});
      $('lobbyRoster').innerHTML = `<span class="muted">${escapeHtml(t('g.waitingStudents'))}</span>`;
      $('startGameBtn').disabled = true;
      document.documentElement.classList.remove('hub-launch');
      $('lobbyTitle').textContent = t('g.roomReady');
      show('lobbyScreen');
    });
  }
  $('createRoomBtn').addEventListener('click', createRoom);

  socket.on('lobby:roster', (players) => {
    const el = $('lobbyRoster');
    if (!players.length) {
      el.innerHTML = `<span class="muted">${escapeHtml(t('g.waitingStudents'))}</span>`;
      $('startGameBtn').disabled = true;
      return;
    }
    el.innerHTML = players.map(p => {
      const accessory = accessoryGlyphs[p.avatar?.accessory] || '';
      return `<span class="chip">${accessory}<span class="roster-dot character-${escapeHtml(p.avatar?.character || 'blue')}"></span>${escapeHtml(p.name)}</span>`;
    }).join('');
    $('startGameBtn').disabled = false;
    // keep the live list in sync with joins during the game too
    renderLiveList();
  });

  $('cancelRoomBtn').addEventListener('click', () => {
    socket.emit('host:close');
    roomCode = null;
    if (fromHub) location.href = hubUrl;
    else show('setupScreen');
  });

  $('startGameBtn').addEventListener('click', () => {
    socket.emit('host:start', (res) => {
      if (!res?.ok) { $('lobbyError').textContent = serverText(res?.message) || t('g.startFailed'); return; }
      show('liveScreen');
    });
  });

  // ---------------- live board ----------------
  socket.on('game:start', ({ durationSec, startedAt }) => {
    gameEndsAt = startedAt + durationSec * 1000;
    clearInterval(liveTimerHandle);
    liveTimerHandle = setInterval(() => {
      const left = Math.max(0, (gameEndsAt - Date.now()) / 1000);
      $('liveTimer').textContent = `⏱ ${Math.floor(left / 60)}:${String(Math.floor(left % 60)).padStart(2, '0')}`;
    }, 500);
  });

  socket.on('game:positions', (list) => {
    latestPositions = list;
    renderLiveList();
    renderMountain();
  });

  socket.on('game:summit', ({ name, place }) => {
    // flash could be added; the list already shows 🏔️ via f flag
  });

  function renderLiveList() {
    const el = $('liveList');
    if (!latestPositions.length) { el.innerHTML = `<p class="muted">${escapeHtml(t('g.waitingData'))}</p>`; return; }
    const sorted = [...latestPositions].sort((a, b) => (b.f - a.f) || ((b.progress ?? b.h) - (a.progress ?? a.h)));
    el.innerHTML = sorted.map((p, i) => `
      <div class="live-row${p.f ? ' finished' : ''}">
        <div class="rank">${['🥇', '🥈', '🥉'][i] || (i + 1)}</div>
        <div class="name">${escapeHtml(p.name)}${p.f ? ' 🏔️' : ''}</div>
        <div class="bar"><div style="width:${Math.round((p.progress ?? p.h) * 100)}%"></div></div>
        <div class="pct">${Math.round((p.progress ?? p.h) * 100)}%</div>
      </div>`).join('');
  }

  function renderMountain() {
    const canvas = $('mountainCanvas');
    const ctx = canvas.getContext('2d');
    const W = canvas.width, H = canvas.height;
    // sky
    const grad = ctx.createLinearGradient(0, 0, 0, H);
    grad.addColorStop(0, '#131c33');
    grad.addColorStop(0.4, '#3d6a9e');
    grad.addColorStop(1, '#aee3ff');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, W, H);
    // mountain silhouette
    ctx.fillStyle = 'rgba(255,255,255,.18)';
    ctx.beginPath();
    ctx.moveTo(0, H);
    ctx.lineTo(W * 0.5, 26);
    ctx.lineTo(W, H);
    ctx.closePath();
    ctx.fill();
    // summit flag
    ctx.font = '16px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('🚩', W / 2, 22);
    // player dots
    for (const p of latestPositions) {
      const y = H - 14 - (p.progress ?? p.h) * (H - 44);
      const x = W / 2 + ((hash(p.name) % 60) - 30);
      ctx.font = '15px sans-serif';
      ctx.fillText(p.f ? '🏆' : '🔵', x, y);
    }
  }

  function hash(s) {
    let h = 0;
    for (let i = 0; i < s.length; i++) h = ((h << 5) - h + s.charCodeAt(i)) | 0;
    return Math.abs(h);
  }

  // ---------------- game over ----------------
  socket.on('game:over', ({ reason, leaderboard }) => {
    clearInterval(liveTimerHandle);
    const reasons = { time: t('g.reasonTime'), host: t('g.reasonHost'), 'all-finished': t('g.reasonAllDone') };
    $('resultReason').textContent = reasons[reason] || '';
    const list = $('resultsList');
    list.innerHTML = leaderboard.map(row => `
      <div class="result-row${row.rank <= 3 ? ` top${row.rank}` : ''}">
        <div class="rank">${['🥇', '🥈', '🥉'][row.rank - 1] || row.rank}</div>
        <div class="name">${escapeHtml(row.name)}${row.finished ? ' 🏔️' : ''}</div>
        <div class="stat">✅${row.correct} ❌${row.wrong}</div>
        <div class="height">${Math.round((row.bestProgress ?? row.bestHeight) * 100)}%</div>
      </div>`).join('');
    show('resultScreen');
  });

  $('endGameBtn').addEventListener('click', () => {
    if (confirm(t('g.confirmEnd'))) socket.emit('host:end');
  });

  $('playAgainBtn').addEventListener('click', () => {
    socket.emit('host:close');
    roomCode = null;
    latestPositions = [];
    if (fromHub) location.href = hubUrl;
    else { loadSets(); show('setupScreen'); }
  });

  socket.on('room:closed', () => { /* host initiated; nothing to do */ });

  async function autoCreateFromHub() {
    if (launchParams.get('autocreate') !== '1' || !launchParams.get('setId')) return;
    await teacherReady;
    selectedSetId = launchParams.get('setId');
    $('durationSelect').value = launchParams.get('durationSec') || '480';
    $('maxEnergyInput').value = launchParams.get('maxEnergy') || '100';
    $('energyPerCorrectInput').value = launchParams.get('energyPerCorrect') || '25';
    $('infiniteEnergyToggle').checked = launchParams.get('infiniteEnergy') === '1';
    syncEnergyControls();
    $('createRoomBtn').disabled = false;
    createRoom();
  }
  autoCreateFromHub();
})();
