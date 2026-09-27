const BOARD_WIDTH = 60;
const BOARD_HEIGHT = 36;
const CELL_SIZE = 16;
const COOLDOWN_MS = 15 * 60 * 1000;

const PALETTE = [
  '#ffffff',
  '#0f172a',
  '#ef4444',
  '#f97316',
  '#facc15',
  '#22c55e',
  '#14b8a6',
  '#3b82f6',
  '#8b5cf6',
  '#ec4899',
  '#fda4af',
  '#c084fc'
];

const STORAGE_KEYS = {
  board: 'pixelBattleBoardV1',
  cooldown: 'pixelBattleCooldownV1',
  selectedColor: 'pixelBattleSelectedColorV1'
};

const state = {
  board: new Map(),
  selectedColor: '#3b82f6',
  cooldownUntil: 0,
  isConfigured: Boolean(window.SUPABASE_CONFIG && window.SUPABASE_CONFIG.url && window.SUPABASE_CONFIG.anonKey)
};

const canvas = document.getElementById('pixelCanvas');
const ctx = canvas.getContext('2d');
const colorPalette = document.getElementById('colorPalette');
const cooldownLabel = document.getElementById('cooldownLabel');
const cooldownTimer = document.getElementById('cooldownTimer');
const statusText = document.getElementById('statusText');
const toast = document.getElementById('toast');
const resetDemoButton = document.getElementById('resetDemoButton');

function showToast(message) {
  toast.textContent = message;
  toast.classList.add('visible');
  clearTimeout(showToast.timeoutId);
  showToast.timeoutId = setTimeout(() => {
    toast.classList.remove('visible');
  }, 1800);
}

function renderPalette() {
  colorPalette.innerHTML = '';

  PALETTE.forEach((color) => {
    const swatch = document.createElement('button');
    swatch.type = 'button';
    swatch.className = `color-swatch ${state.selectedColor.toLowerCase() === color.toLowerCase() ? 'selected' : ''}`;
    swatch.style.background = color;
    swatch.title = color;
    swatch.setAttribute('aria-label', `Вибрати колір ${color}`);
    swatch.addEventListener('click', () => {
      state.selectedColor = color;
      localStorage.setItem(STORAGE_KEYS.selectedColor, color);
      renderPalette();
      showToast(`Вибрано колір ${color}`);
    });
    colorPalette.appendChild(swatch);
  });
}

function drawBackgroundGrid() {
  ctx.fillStyle = '#dfe6eb';
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  ctx.strokeStyle = 'rgba(15, 23, 42, 0.08)';
  ctx.lineWidth = 1;

  for (let x = 0; x <= BOARD_WIDTH; x += 1) {
    ctx.beginPath();
    ctx.moveTo(x * CELL_SIZE, 0);
    ctx.lineTo(x * CELL_SIZE, canvas.height);
    ctx.stroke();
  }

  for (let y = 0; y <= BOARD_HEIGHT; y += 1) {
    ctx.beginPath();
    ctx.moveTo(0, y * CELL_SIZE);
    ctx.lineTo(canvas.width, y * CELL_SIZE);
    ctx.stroke();
  }
}

function drawBoard() {
  drawBackgroundGrid();

  for (const [key, color] of state.board.entries()) {
    const [x, y] = key.split(',').map(Number);
    ctx.fillStyle = color;
    ctx.fillRect(x * CELL_SIZE, y * CELL_SIZE, CELL_SIZE, CELL_SIZE);
  }
}

function keyForCell(x, y) {
  return `${x},${y}`;
}

function loadLocalBoard() {
  const boardJson = localStorage.getItem(STORAGE_KEYS.board);
  if (boardJson) {
    const parsed = JSON.parse(boardJson);
    state.board = new Map(Object.entries(parsed));
  }

  const cooldownValue = Number(localStorage.getItem(STORAGE_KEYS.cooldown) || 0);
  if (cooldownValue && cooldownValue > Date.now()) {
    state.cooldownUntil = cooldownValue;
  }

  const storedSelectedColor = localStorage.getItem(STORAGE_KEYS.selectedColor) || PALETTE[7];
  state.selectedColor = storedSelectedColor;
  renderPalette();
}

function saveLocalBoard() {
  const plain = Object.fromEntries(state.board.entries());
  localStorage.setItem(STORAGE_KEYS.board, JSON.stringify(plain));
}

function updateCooldownUI() {
  const remaining = Math.max(0, state.cooldownUntil - Date.now());

  if (remaining > 0) {
    cooldownLabel.textContent = 'Зачекайте';
    const minutes = Math.floor(remaining / 60000);
    const seconds = Math.floor((remaining % 60000) / 1000);
    cooldownTimer.textContent = `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
    statusText.textContent = 'Можна поставити наступний піксель через таймер.';
  } else {
    cooldownLabel.textContent = 'Доступно зараз';
    cooldownTimer.textContent = '00:00';
    statusText.textContent = 'Готово до малювання.';
  }
}

function tickCooldown() {
  updateCooldownUI();
  if (state.cooldownUntil > Date.now()) {
    requestAnimationFrame(tickCooldown);
  }
}

function setCooldown() {
  state.cooldownUntil = Date.now() + COOLDOWN_MS;
  localStorage.setItem(STORAGE_KEYS.cooldown, String(state.cooldownUntil));
  updateCooldownUI();
  requestAnimationFrame(tickCooldown);
}

function canPlacePixel() {
  return Date.now() >= state.cooldownUntil;
}

function getSupabaseHeaders() {
  return {
    apikey: window.SUPABASE_CONFIG.anonKey,
    Authorization: `Bearer ${window.SUPABASE_CONFIG.anonKey}`,
    'Content-Type': 'application/json'
  };
}

async function fetchBoardFromSupabase() {
  const url = `${window.SUPABASE_CONFIG.url}/rest/v1/pixel_map?select=x,y,color`;

  const response = await fetch(url, {
    method: 'GET',
    headers: getSupabaseHeaders()
  });

  if (!response.ok) {
    throw new Error('Не вдалося завантажити дані з Supabase');
  }

  const rows = await response.json();
  const map = new Map();

  rows.forEach((row) => {
    map.set(keyForCell(row.x, row.y), row.color);
  });

  state.board = map;
  saveLocalBoard();
  drawBoard();
}

async function savePixelToSupabase(x, y, color) {
  const url = `${window.SUPABASE_CONFIG.url}/rest/v1/pixel_map?on_conflict=x,y`;
  const payload = [{
    x,
    y,
    color,
    updated_at: new Date().toISOString()
  }];

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      ...getSupabaseHeaders(),
      Prefer: 'resolution=merge-duplicates'
    },
    body: JSON.stringify(payload)
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(text || 'Не вдалося зберегти піксель');
  }
}

async function refreshBoard() {
  if (!state.isConfigured) {
    drawBoard();
    return;
  }

  try {
    await fetchBoardFromSupabase();
    statusText.textContent = 'Полотно синхронізовано з Supabase.';
  } catch (error) {
    console.error(error);
    statusText.textContent = 'Проблема з підключенням до Supabase, працює демо-режим.';
    drawBoard();
  }
}

function paintPixel(x, y, color) {
  const key = keyForCell(x, y);
  state.board.set(key, color);
  saveLocalBoard();
  drawBoard();
}

async function handlePixelClick(event) {
  const rect = canvas.getBoundingClientRect();
  const scaleX = canvas.width / rect.width;
  const scaleY = canvas.height / rect.height;

  const clickX = Math.floor((event.clientX - rect.left) * scaleX);
  const clickY = Math.floor((event.clientY - rect.top) * scaleY);

  const x = Math.floor(clickX / CELL_SIZE);
  const y = Math.floor(clickY / CELL_SIZE);

  if (x < 0 || x >= BOARD_WIDTH || y < 0 || y >= BOARD_HEIGHT) {
    return;
  }

  if (!canPlacePixel()) {
    showToast('Таймер активний. Спробуйте пізніше.');
    return;
  }

  const color = state.selectedColor;

  try {
    if (state.isConfigured) {
      await savePixelToSupabase(x, y, color);
      await fetchBoardFromSupabase();
    } else {
      paintPixel(x, y, color);
    }

    setCooldown();
    showToast('Піксель успішно поставлено!');
  } catch (error) {
    console.error(error);
    showToast('Не вдалося поставити піксель. Спробуйте ще раз.');
  }
}

function resetDemoState() {
  state.board.clear();
  localStorage.removeItem(STORAGE_KEYS.board);
  localStorage.removeItem(STORAGE_KEYS.cooldown);
  state.cooldownUntil = 0;
  updateCooldownUI();
  drawBoard();
  showToast('Демо-дані скинуто.');
}

async function init() {
  const selectedColor = localStorage.getItem(STORAGE_KEYS.selectedColor) || PALETTE[7];
  state.selectedColor = selectedColor;
  renderPalette();
  loadLocalBoard();
  updateCooldownUI();
  drawBoard();

  canvas.addEventListener('click', handlePixelClick);
  resetDemoButton.addEventListener('click', resetDemoState);

  if (state.isConfigured) {
    statusText.textContent = 'Підключено до Supabase. Завантаження полотна...';
    await refreshBoard();
  } else {
    statusText.textContent = 'Демо-режим активний. Для роботи в реальному часі додайте Supabase налаштування.';
  }

  if (state.cooldownUntil > Date.now()) {
    requestAnimationFrame(tickCooldown);
  }
}

init();
