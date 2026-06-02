let USD_TO_SGD = 1.35;
let cards = [];
let priceChart = null;
let colorEnabled = true;
let activeTypeFilter = '';
let activeSetFilter = '';
let activeMoversFilter = '';
let searchQuery = '';
let editingCardId = null;
let activeCollectionTab = 'active';

const TYPE_COLORS = {
  'Fire':      { bg: 'rgba(255,100,50,0.12)', border: '#ff6432', chart: '#ff6432' },
  'Water':     { bg: 'rgba(74,144,217,0.12)', border: '#4a90d9', chart: '#4a90d9' },
  'Grass':     { bg: 'rgba(76,175,80,0.12)',  border: '#4caf50', chart: '#4caf50' },
  'Electric':  { bg: 'rgba(255,200,0,0.12)',  border: '#ffc800', chart: '#ffc800' },
  'Psychic':   { bg: 'rgba(220,80,160,0.12)', border: '#dc50a0', chart: '#dc50a0' },
  'Fighting':  { bg: 'rgba(192,80,40,0.12)',  border: '#c05028', chart: '#c05028' },
  'Dark':      { bg: 'rgba(80,60,120,0.12)',  border: '#503c78', chart: '#8060c0' },
  'Steel':     { bg: 'rgba(120,140,160,0.12)',border: '#788ca0', chart: '#788ca0' },
  'Dragon':    { bg: 'rgba(40,100,220,0.12)', border: '#2864dc', chart: '#2864dc' },
  'Fairy':     { bg: 'rgba(240,100,180,0.12)',border: '#f064b4', chart: '#f064b4' },
  'Normal':    { bg: 'rgba(160,160,120,0.12)',border: '#a0a078', chart: '#a0a078' },
  'Colorless': { bg: 'rgba(180,180,180,0.08)',border: '#b4b4b4', chart: '#b4b4b4' },
};

function getTypeColor(type) {
  if (!colorEnabled) return { bg: 'transparent', border: 'var(--border)', chart: '#c9a84c' };
  return TYPE_COLORS[type] || { bg: 'transparent', border: 'var(--border)', chart: '#c9a84c' };
}

function toggleColors() {
  colorEnabled = document.getElementById('color-toggle').checked;
  render();
}

function toggleTheme() {
  const html = document.documentElement;
  html.setAttribute('data-theme', html.getAttribute('data-theme') === 'dark' ? 'light' : 'dark');
}

window.addEventListener('scroll', () => {
  const header = document.getElementById('site-header');
  if (header) header.classList.toggle('scrolled', window.scrollY > 20);
});

// ── Live exchange rate ──────────────────────────────────────────────
async function fetchExchangeRate() {
  try {
    const res = await fetch('https://api.exchangerate-api.com/v4/latest/USD');
    if (!res.ok) return;
    const data = await res.json();
    if (data.rates && data.rates.SGD) {
      USD_TO_SGD = data.rates.SGD;
      const el = document.getElementById('fx-rate');
      if (el) el.textContent = 'USD/SGD: ' + USD_TO_SGD.toFixed(4);
    }
  } catch (e) {
    console.warn('Could not fetch exchange rate, using fallback 1.35');
  }
}

// ── Init ────────────────────────────────────────────────────────────
async function init() {
  const res = await fetch('/api/me');
  if (!res.ok) { window.location.href = '/login.html'; return; }
  const { username } = await res.json();
  document.getElementById('username-display').textContent = username;
  await fetchExchangeRate();
  await loadCards();
  checkAutoRefresh();
}

async function logout() {
  await fetch('/api/logout', { method: 'POST' });
  window.location.href = '/login.html';
}

async function loadCards() {
  const res = await fetch('/api/cards');
  if (!res.ok) { window.location.href = '/login.html'; return; }
  cards = await res.json();
  render();
}

async function checkAutoRefresh() {
  const active = cards.filter(c => !c.sold);
  if (active.length === 0) return;
  const lastRefresh = localStorage.getItem('lastRefresh');
  const oneDayAgo = Date.now() - 24 * 60 * 60 * 1000;
  if (!lastRefresh || parseInt(lastRefresh) < oneDayAgo) {
    toast('Auto-refreshing prices...', 'info');
    await refreshPrices(true);
  }
}

function animateValue(el, target, prefix) {
  const start = parseFloat(el.getAttribute('data-val') || '0');
  const duration = 600;
  const startTime = performance.now();
  function step(now) {
    const p = Math.min((now - startTime) / duration, 1);
    const ease = 1 - Math.pow(1 - p, 3);
    const current = start + (target - start) * ease;
    el.textContent = prefix + '$' + current.toFixed(2);
    if (p < 1) requestAnimationFrame(step);
    else { el.textContent = prefix + '$' + target.toFixed(2); el.setAttribute('data-val', target); }
  }
  requestAnimationFrame(step);
}

function toast(message, type) {
  const container = document.getElementById('toast-container');
  const t = document.createElement('div');
  t.className = 'toast toast-' + (type || 'info');
  t.textContent = message;
  container.appendChild(t);
  setTimeout(() => t.classList.add('toast-show'), 10);
  setTimeout(() => { t.classList.remove('toast-show'); setTimeout(() => t.remove(), 300); }, 3500);
}

function confirmDialog(message) {
  return new Promise(resolve => {
    document.getElementById('confirm-message').textContent = message;
    const overlay = document.getElementById('confirm-overlay');
    overlay.classList.add('active');
    const ok = document.getElementById('confirm-ok');
    const cancel = document.getElementById('confirm-cancel');
    function cleanup(result) {
      overlay.classList.remove('active');
      ok.removeEventListener('click', onOk);
      cancel.removeEventListener('click', onCancel);
      resolve(result);
    }
    function onOk() { cleanup(true); }
    function onCancel() { cleanup(false); }
    ok.addEventListener('click', onOk);
    cancel.addEventListener('click', onCancel);
  });
}

function switchTab(tab) {
  activeCollectionTab = tab;
  document.getElementById('tab-active').classList.toggle('active', tab === 'active');
  document.getElementById('tab-sold').classList.toggle('active', tab === 'sold');
  document.getElementById('panel-active').style.display = tab === 'active' ? 'block' : 'none';
  document.getElementById('panel-sold').style.display = tab === 'sold' ? 'block' : 'none';
}

function toggleForm() {
  const f = document.getElementById('add-form');
  f.classList.toggle('open');
  if (f.classList.contains('open')) document.getElementById('f-name').focus();
}

// ── Set filter ──────────────────────────────────────────────────────
function populateSetFilter() {
  const sets = [...new Set(cards.filter(c => !c.sold && c.set).map(c => c.set))].sort();
  const sel = document.getElementById('filter-set');
  const current = sel.value;
  sel.innerHTML = '<option value="">All sets</option>' + sets.map(s => `<option value="${esc(s)}"${s === current ? ' selected' : ''}>${esc(s)}</option>`).join('');
}

// ── Add card ────────────────────────────────────────────────────────
async function addCard() {
  const name = document.getElementById('f-name').value.trim();
  const set = document.getElementById('f-set').value.trim();
  const type = document.getElementById('f-type').value;
  const grade = document.getElementById('f-grade').value;
  const quantity = parseInt(document.getElementById('f-quantity').value) || 1;
  const price = parseFloat(document.getElementById('f-price').value);
  const purchaseDate = document.getElementById('f-purchase-date').value;
  const targetPrice = parseFloat(document.getElementById('f-target').value) || null;
  const notes = document.getElementById('f-notes').value.trim();
  const url = document.getElementById('f-url').value.trim();
  if (!name) { toast('Please enter a card name.', 'error'); return; }
  if (!price || price <= 0) { toast('Please enter a valid purchase price.', 'error'); return; }
  const res = await fetch('/api/cards', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name, set, type, grade, quantity, purchasePrice: price, purchaseDate, targetPrice, notes, currentValue: null, lastUpdated: null, url, priceHistory: [] })
  });
  if (!res.ok) { toast('Failed to save card.', 'error'); return; }
  const card = await res.json();
  cards.push(card);
  render();
  toggleForm();
  toast(name + ' added to your vault.', 'success');
  ['f-name','f-set','f-url','f-notes'].forEach(id => document.getElementById(id).value = '');
  document.getElementById('f-price').value = '';
  document.getElementById('f-target').value = '';
  document.getElementById('f-quantity').value = '1';
  document.getElementById('f-purchase-date').value = '';
  document.getElementById('f-type').value = '';
  document.getElementById('f-grade').value = 'raw';
}

// ── Delete card ─────────────────────────────────────────────────────
async function deleteCard(id) {
  const card = cards.find(c => c.id === id);
  const confirmed = await confirmDialog('Remove "' + (card ? card.name : 'this card') + '" from your vault?');
  if (!confirmed) return;
  const res = await fetch('/api/cards/' + id, { method: 'DELETE' });
  if (!res.ok) { toast('Failed to delete card.', 'error'); return; }
  cards = cards.filter(c => c.id !== id);
  render();
  toast('Card removed.', 'info');
}

// ── Reset vault ─────────────────────────────────────────────────────
async function resetVault() {
  const confirmed = await confirmDialog('Delete ALL cards from your vault? This cannot be undone.');
  if (!confirmed) return;
  const snapshot = [...cards];
  let failed = 0;
  for (const card of snapshot) {
    const res = await fetch('/api/cards/' + card.id, { method: 'DELETE' });
    if (!res.ok) failed++;
  }
  if (failed > 0) { toast(failed + ' cards could not be deleted.', 'error'); }
  cards = [];
  render();
  toast('Vault reset. All cards removed.', 'info');
}

// ── Edit modal ──────────────────────────────────────────────────────
function openEditForm(idOverride) {
  const targetId = idOverride || editingCardId;
  if (!targetId) return;
  editingCardId = targetId;
  const card = cards.find(c => c.id === targetId);
  if (!card) return;
  document.getElementById('edit-id').value = card.id;
  document.getElementById('edit-name').value = card.name || '';
  document.getElementById('edit-set').value = card.set || '';
  document.getElementById('edit-type').value = card.type || '';
  document.getElementById('edit-grade').value = card.grade || 'raw';
  document.getElementById('edit-quantity').value = card.quantity || 1;
  document.getElementById('edit-price').value = card.purchasePrice || '';
  document.getElementById('edit-purchase-date').value = card.purchaseDate || '';
  document.getElementById('edit-target').value = card.targetPrice || '';
  document.getElementById('edit-notes').value = card.notes || '';
  document.getElementById('edit-url').value = card.url || '';
  document.getElementById('modal-overlay').classList.remove('active');
  document.getElementById('edit-overlay').classList.add('active');
}

function closeEditModal() {
  document.getElementById('edit-overlay').classList.remove('active');
}

async function saveEdit() {
  const id = document.getElementById('edit-id').value;
  const name = document.getElementById('edit-name').value.trim();
  const set = document.getElementById('edit-set').value.trim();
  const type = document.getElementById('edit-type').value;
  const grade = document.getElementById('edit-grade').value;
  const quantity = parseInt(document.getElementById('edit-quantity').value) || 1;
  const price = parseFloat(document.getElementById('edit-price').value);
  const purchaseDate = document.getElementById('edit-purchase-date').value;
  const targetPrice = parseFloat(document.getElementById('edit-target').value) || null;
  const notes = document.getElementById('edit-notes').value.trim();
  const url = document.getElementById('edit-url').value.trim();
  if (!name) { toast('Card name is required.', 'error'); return; }
  if (!price || price <= 0) { toast('Please enter a valid price.', 'error'); return; }
  const res = await fetch('/api/cards/' + id, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name, set, type, grade, quantity, purchasePrice: price, purchaseDate, targetPrice, notes, url })
  });
  if (!res.ok) { toast('Failed to save changes.', 'error'); return; }
  const idx = cards.findIndex(c => c.id === id);
  if (idx > -1) cards[idx] = { ...cards[idx], name, set, type, grade, quantity, purchasePrice: price, purchaseDate, targetPrice, notes, url };
  closeEditModal();
  render();
  toast('Card updated.', 'success');
}

// ── Sell modal ──────────────────────────────────────────────────────
function openSellForm() {
  const card = cards.find(c => c.id === editingCardId);
  if (!card) return;
  document.getElementById('sell-id').value = card.id;
  document.getElementById('sell-price').value = card.currentValue || '';
  document.getElementById('sell-date').value = new Date().toISOString().split('T')[0];
  document.getElementById('sell-to').value = '';
  document.getElementById('modal-overlay').classList.remove('active');
  document.getElementById('sell-overlay').classList.add('active');
}

function closeSellModal() {
  document.getElementById('sell-overlay').classList.remove('active');
}

async function confirmSell() {
  const id = document.getElementById('sell-id').value;
  const soldPrice = parseFloat(document.getElementById('sell-price').value);
  const soldDate = document.getElementById('sell-date').value;
  const soldTo = document.getElementById('sell-to').value.trim();
  if (!soldPrice || soldPrice <= 0) { toast('Please enter a valid sale price.', 'error'); return; }
  const res = await fetch('/api/cards/' + id, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ sold: true, soldPrice, soldDate, soldTo })
  });
  if (!res.ok) { toast('Failed to mark as sold.', 'error'); return; }
  const idx = cards.findIndex(c => c.id === id);
  if (idx > -1) cards[idx] = { ...cards[idx], sold: true, soldPrice, soldDate, soldTo };
  closeSellModal();
  render();
  toast('Card marked as sold.', 'success');
}

// ── Manual price override ───────────────────────────────────────────
function openManualPrice() {
  const card = cards.find(c => c.id === editingCardId);
  if (!card) return;
  document.getElementById('manual-price-id').value = card.id;
  document.getElementById('manual-price-val').value = card.currentValue || '';
  document.getElementById('modal-overlay').classList.remove('active');
  document.getElementById('manual-price-overlay').classList.add('active');
  setTimeout(() => document.getElementById('manual-price-val').focus(), 100);
}

function closeManualPriceModal() {
  document.getElementById('manual-price-overlay').classList.remove('active');
}

async function saveManualPrice() {
  const id = document.getElementById('manual-price-id').value;
  const val = parseFloat(document.getElementById('manual-price-val').value);
  if (!val || val <= 0) { toast('Please enter a valid price.', 'error'); return; }
  const now = Date.now();
  const idx = cards.findIndex(c => c.id === id);
  if (idx < 0) return;
  const history = [...(cards[idx].priceHistory || [])];
  const lastEntry = history[history.length - 1];
  if (!lastEntry || !isSameDay(lastEntry.date, now)) {
    history.push({ date: now, value: val });
  } else {
    history[history.length - 1] = { date: now, value: val };
  }
  const res = await fetch('/api/cards/' + id, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ currentValue: val, lastUpdated: now, priceHistory: history })
  });
  if (!res.ok) { toast('Failed to save price.', 'error'); return; }
  cards[idx].currentValue = val;
  cards[idx].lastUpdated = now;
  cards[idx].priceHistory = history;
  closeManualPriceModal();
  render();
  toast('Price updated manually.', 'success');
}

// ── Filters ─────────────────────────────────────────────────────────
function applyFilter() {
  activeTypeFilter = document.getElementById('filter-type').value;
  activeSetFilter = document.getElementById('filter-set').value;
  activeMoversFilter = document.getElementById('filter-movers').value;
  render();
}

function applySearch() {
  searchQuery = document.getElementById('search-input').value.trim().toLowerCase();
  render();
}

function getFilteredCards() {
  let filtered = cards.filter(c => !c.sold);
  if (searchQuery) filtered = filtered.filter(c =>
    c.name.toLowerCase().includes(searchQuery) ||
    (c.set || '').toLowerCase().includes(searchQuery)
  );
  if (activeTypeFilter) filtered = filtered.filter(c => c.type === activeTypeFilter);
  if (activeSetFilter) filtered = filtered.filter(c => c.set === activeSetFilter);
  if (activeMoversFilter) {
    const priced = filtered.filter(c => c.currentValue != null);
    const sorted = [...priced].sort((a, b) => {
      const aPct = (Number(a.currentValue) - Number(a.purchasePrice)) / Number(a.purchasePrice);
      const bPct = (Number(b.currentValue) - Number(b.purchasePrice)) / Number(b.purchasePrice);
      return bPct - aPct;
    });
    if (activeMoversFilter === 'gainers') filtered = sorted.slice(0, 5);
    else if (activeMoversFilter === 'losers') filtered = sorted.slice(-5).reverse();
  }
  return filtered;
}

// ── CSV Export ───────────────────────────────────────────────────────
function exportCSV() {
  const active = cards.filter(c => !c.sold);
  const sold = cards.filter(c => c.sold);
  const all = [...active, ...sold];
  if (all.length === 0) { toast('No cards to export.', 'info'); return; }

  const headers = ['Name','Set','Type','Grade','Quantity','Purchase Price (SGD)','Current Value (SGD)','P/L (SGD)','Purchase Date','Target Price','Notes','Status','Sold Price','Sold Date','Sold To'];
  const rows = all.map(c => {
    const cost = Number(c.purchasePrice) * (c.quantity || 1);
    const val = c.sold
      ? Number(c.soldPrice || 0) * (c.quantity || 1)
      : (c.currentValue != null ? Number(c.currentValue) * (c.quantity || 1) : '');
    const pl = c.sold
      ? ((Number(c.soldPrice || 0) - Number(c.purchasePrice)) * (c.quantity || 1)).toFixed(2)
      : (c.currentValue != null ? ((Number(c.currentValue) - Number(c.purchasePrice)) * (c.quantity || 1)).toFixed(2) : '');
    return [
      c.name, c.set || '', c.type || '', c.grade || '', c.quantity || 1,
      cost.toFixed(2), val !== '' ? Number(val).toFixed(2) : '',
      pl, c.purchaseDate || '', c.targetPrice || '', c.notes || '',
      c.sold ? 'Sold' : 'Active',
      c.sold ? (c.soldPrice || '') : '',
      c.sold ? (c.soldDate || '') : '',
      c.sold ? (c.soldTo || '') : ''
    ].map(v => '"' + String(v).replace(/"/g, '""') + '"');
  });

  const csv = [headers.map(h => '"' + h + '"').join(','), ...rows.map(r => r.join(','))].join('\n');
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'pokevault-' + new Date().toISOString().split('T')[0] + '.csv';
  a.click();
  URL.revokeObjectURL(url);
  toast('Collection exported.', 'success');
}

// ── Card image fetching ──────────────────────────────────────────────
async function fetchCardImage(card) {
  try {
    const namePart = card.name.replace(/['"]/g, '').trim();

    // Stage 1: exact name + set
    if (card.set) {
      const setSanitized = card.set.replace(/['"]/g, '').trim();
      const q1 = `name:"${namePart}" set.name:"${setSanitized}"`;
      const url1 = 'https://api.pokemontcg.io/v2/cards?q=' + encodeURIComponent(q1) + '&select=name,set,images&orderBy=-set.releaseDate&pageSize=10';
      const res1 = await fetch(url1);
      if (res1.ok) {
        const data1 = await res1.json();
        const img = extractImageFromResults(data1.data, card);
        if (img) return img;
      }
    }

    // Stage 2: name only
    const q2 = `name:"${namePart}"`;
    const url2 = 'https://api.pokemontcg.io/v2/cards?q=' + encodeURIComponent(q2) + '&select=name,set,images&orderBy=-set.releaseDate&pageSize=10';
    const res2 = await fetch(url2);
    if (!res2.ok) return null;
    const data2 = await res2.json();
    return extractImageFromResults(data2.data, card);
  } catch (e) {
    console.warn('fetchCardImage error:', e);
    return null;
  }
}

function extractImageFromResults(results, card) {
  if (!results || results.length === 0) return null;
  const cardSetLower = (card.set || '').toLowerCase();
  const scored = results.map(r => {
    let score = 0;
    if (r.name && r.name.toLowerCase() === card.name.toLowerCase()) score += 10;
    if (cardSetLower && r.set && r.set.name) {
      const rSetLower = r.set.name.toLowerCase();
      if (rSetLower === cardSetLower) score += 5;
      else if (rSetLower.includes(cardSetLower) || cardSetLower.includes(rSetLower)) score += 3;
    }
    return { ...r, _score: score };
  }).sort((a, b) => b._score - a._score);

  for (const match of scored) {
    const img = match.images && (match.images.large || match.images.small);
    if (img) return img;
  }
  return null;
}

// ── Card detail modal ────────────────────────────────────────────────
async function openCard(id) {
  const card = cards.find(c => c.id === id);
  if (!card) return;
  editingCardId = id;
  const cost = Number(card.purchasePrice);
  const val = card.currentValue != null ? Number(card.currentValue) : null;
  const profit = val != null ? (val - cost) * (card.quantity || 1) : null;
  const colors = getTypeColor(card.type);

  const typeBar = document.getElementById('modal-type-bar');
  if (typeBar) typeBar.style.background = colors.border;

  document.getElementById('modal-name').textContent = card.name + (card.quantity > 1 ? ' ×' + card.quantity : '');
  document.getElementById('modal-meta').textContent = (card.set || 'Unknown set') + (card.type ? ' · ' + card.type : '');
  const gradeEl = document.getElementById('modal-grade');
  gradeEl.textContent = card.grade;
  gradeEl.className = 'badge ' + (card.grade === 'raw' ? 'badge-raw' : 'badge-psa');
  document.getElementById('modal-cost').textContent = 'SGD $' + (cost * (card.quantity || 1)).toFixed(2);
  document.getElementById('modal-value').textContent = val != null ? 'SGD $' + (val * (card.quantity || 1)).toFixed(2) : '—';

  const profitEl = document.getElementById('modal-profit');
  if (profit != null) {
    profitEl.textContent = (profit >= 0 ? '↑ +' : '↓ ') + 'SGD $' + Math.abs(profit).toFixed(2);
    profitEl.className = 'modal-stat-value ' + (profit >= 0 ? 'profit-pos' : 'profit-neg');
  } else {
    profitEl.textContent = '—';
    profitEl.className = 'modal-stat-value';
  }

  document.getElementById('modal-updated').textContent = card.lastUpdated
    ? new Date(card.lastUpdated).toLocaleDateString('en-SG') : '—';
  document.getElementById('modal-purchase-date').textContent = card.purchaseDate || '—';

  const targetEl = document.getElementById('modal-target');
  if (card.targetPrice) {
    const hit = val != null && val >= card.targetPrice;
    targetEl.textContent = 'SGD $' + Number(card.targetPrice).toFixed(2) + (hit ? ' ✓ Target reached!' : '');
    targetEl.style.color = hit ? 'var(--green)' : 'var(--text)';
  } else {
    targetEl.textContent = '—';
    targetEl.style.color = '';
  }

  const notesWrap = document.getElementById('modal-notes-wrap');
  const notesEl = document.getElementById('modal-notes');
  if (card.notes) {
    notesWrap.style.display = 'block';
    notesEl.textContent = card.notes;
  } else {
    notesWrap.style.display = 'none';
  }

  // ── Card image ──
  const imgWrap = document.getElementById('modal-card-image-wrap');
  const imgEl = document.getElementById('modal-card-image');
  imgWrap.style.display = 'none';
  imgEl.src = '';
  imgEl.classList.remove('loaded');

  document.getElementById('modal-overlay').classList.add('active');

  // Fetch image async (non-blocking, shows after modal opens)
  fetchCardImage(card).then(imgUrl => {
    if (imgUrl) {
      imgEl.onload = () => {
        imgEl.classList.add('loaded');
        imgWrap.style.display = 'flex';
      };
      imgEl.onerror = () => { imgWrap.style.display = 'none'; };
      imgEl.src = imgUrl;
    }
  });

  // ── Price chart ──
  const history = card.priceHistory || [];
  const emptyEl = document.getElementById('modal-chart-empty');
  const chartContainer = document.querySelector('.modal-chart-container');
  if (history.length < 2) {
    emptyEl.style.display = 'block';
    chartContainer.style.display = 'none';
  } else {
    emptyEl.style.display = 'none';
    chartContainer.style.display = 'block';
    const labels = history.map(p => new Date(p.date).toLocaleDateString('en-SG'));
    const values = history.map(p => p.value);
    if (priceChart) { priceChart.destroy(); priceChart = null; }
    const ctx = document.getElementById('price-chart').getContext('2d');
    priceChart = new Chart(ctx, {
      type: 'line',
      data: {
        labels,
        datasets: [{
          label: 'Value (SGD)',
          data: values,
          borderColor: colors.chart,
          backgroundColor: colors.bg,
          borderWidth: 2,
          pointRadius: 4,
          pointBackgroundColor: colors.chart,
          pointBorderColor: 'var(--bg2)',
          pointBorderWidth: 2,
          tension: 0.4,
          fill: true
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { display: false },
          tooltip: {
            backgroundColor: 'var(--bg3)',
            borderColor: 'var(--border2)',
            borderWidth: 1,
            titleColor: 'var(--text2)',
            bodyColor: 'var(--text)',
            callbacks: { label: ctx => 'SGD $' + Number(ctx.raw).toFixed(2) }
          }
        },
        scales: {
          y: { ticks: { callback: v => '$' + v, font: { size: 11, family: 'DM Mono' }, color: 'var(--text3)' }, grid: { color: 'var(--border)' }, border: { display: false } },
          x: { ticks: { font: { size: 11, family: 'DM Mono' }, color: 'var(--text3)' }, grid: { display: false }, border: { display: false } }
        }
      }
    });
  }
}

function closeModal(e) {
  if (e && e.target !== document.getElementById('modal-overlay')) return;
  document.getElementById('modal-overlay').classList.remove('active');
  if (priceChart) { priceChart.destroy(); priceChart = null; }
}

document.addEventListener('keydown', e => {
  if (e.key === 'Escape') {
    ['modal-overlay','confirm-overlay','edit-overlay','sell-overlay','manual-price-overlay'].forEach(id => {
      document.getElementById(id).classList.remove('active');
    });
    if (priceChart) { priceChart.destroy(); priceChart = null; }
  }
});

function fmt(val) { return val != null ? 'SGD $' + Number(val).toFixed(2) : '—'; }

let sortCol = null;
let sortDir = 1;

function sortBy(col) {
  if (sortCol === col) { sortDir *= -1; } else { sortCol = col; sortDir = 1; }
  render();
}

function getSortedCards(list) {
  if (!sortCol) return list;
  return [...list].sort((a, b) => {
    let aVal, bVal;
    if (sortCol === 'name') { aVal = a.name.toLowerCase(); bVal = b.name.toLowerCase(); }
    else if (sortCol === 'set') { aVal = (a.set || '').toLowerCase(); bVal = (b.set || '').toLowerCase(); }
    else if (sortCol === 'purchasePrice') { aVal = Number(a.purchasePrice); bVal = Number(b.purchasePrice); }
    else if (sortCol === 'currentValue') { aVal = Number(a.currentValue || 0); bVal = Number(b.currentValue || 0); }
    else if (sortCol === 'profit') {
      aVal = a.currentValue != null ? Number(a.currentValue) - Number(a.purchasePrice) : -Infinity;
      bVal = b.currentValue != null ? Number(b.currentValue) - Number(b.purchasePrice) : -Infinity;
    }
    else if (sortCol === 'lastUpdated') { aVal = a.lastUpdated || 0; bVal = b.lastUpdated || 0; }
    if (aVal < bVal) return -1 * sortDir;
    if (aVal > bVal) return 1 * sortDir;
    return 0;
  });
}

function renderMovers() {
  const priced = cards.filter(c => !c.sold && c.currentValue != null);
  if (priced.length < 2) { document.getElementById('movers-section').style.display = 'none'; return; }
  document.getElementById('movers-section').style.display = 'block';
  const sorted = [...priced].sort((a, b) => {
    const aPct = (Number(a.currentValue) - Number(a.purchasePrice)) / Number(a.purchasePrice);
    const bPct = (Number(b.currentValue) - Number(b.purchasePrice)) / Number(b.purchasePrice);
    return bPct - aPct;
  });
  const top = sorted.slice(0, 3);
  const bottom = sorted.slice(-3).reverse();
  function moverCard(c) {
    const profit = Number(c.currentValue) - Number(c.purchasePrice);
    const pct = (profit / Number(c.purchasePrice)) * 100;
    const pos = profit >= 0;
    const colors = getTypeColor(c.type);
    return '<div class="mover-card" style="border-left: 3px solid ' + colors.border + ';" onclick="openCard(\'' + c.id + '\')">' +
      '<div style="overflow:hidden;"><div class="mover-name">' + esc(c.name) + '</div><div class="mover-set">' + esc(c.set || '—') + '</div></div>' +
      '<div class="mover-value ' + (pos ? 'profit-pos' : 'profit-neg') + '">' +
        (pos ? '↑' : '↓') + ' ' + Math.abs(pct).toFixed(1) + '%' +
        '<span class="mover-sgd">' + (pos ? '+' : '-') + 'SGD $' + Math.abs(profit).toFixed(2) + '</span>' +
      '</div></div>';
  }
  document.getElementById('movers-gainers').innerHTML = top.map(moverCard).join('');
  document.getElementById('movers-losers').innerHTML = bottom.map(moverCard).join('');
}

function checkTargetAlerts() {
  const active = cards.filter(c => !c.sold && c.targetPrice && c.currentValue != null);
  const hits = active.filter(c => Number(c.currentValue) >= Number(c.targetPrice));
  hits.forEach(c => {
    toast('🎯 ' + c.name + ' hit your target of SGD $' + Number(c.targetPrice).toFixed(2) + '!', 'success');
  });
}

function render() {
  populateSetFilter();
  const tbody = document.getElementById('card-table');
  const cardList = document.getElementById('card-list');
  const filtered = getFilteredCards();
  const sorted = getSortedCards(filtered);
  const soldCards = cards.filter(c => c.sold);

  if (cards.filter(c => !c.sold).length === 0) {
    tbody.innerHTML = '<tr><td colspan="11"><div class="empty-state">Your vault is empty — add your first card to get started</div></td></tr>';
    cardList.innerHTML = '<div class="empty-state">Your vault is empty — add your first card to get started</div>';
  } else if (sorted.length === 0) {
    tbody.innerHTML = '<tr><td colspan="11"><div class="empty-state">No cards match your filters</div></td></tr>';
    cardList.innerHTML = '<div class="empty-state">No cards match your filters</div>';
  } else {
    tbody.innerHTML = sorted.map(c => {
      const cost = Number(c.purchasePrice) * (c.quantity || 1);
      const val = c.currentValue != null ? Number(c.currentValue) * (c.quantity || 1) : null;
      const profit = val != null ? val - cost : null;
      const profitStr = profit != null ? (profit >= 0 ? '↑ +' : '↓ ') + 'SGD $' + Math.abs(profit).toFixed(2) : '—';
      const profitClass = profit == null ? '' : profit >= 0 ? 'profit-pos' : 'profit-neg';
      const gradeClass = c.grade === 'raw' ? 'badge-raw' : 'badge-psa';
      const updated = c.lastUpdated ? new Date(c.lastUpdated).toLocaleDateString('en-SG') : '—';
      const colors = getTypeColor(c.type);
      const typeBadge = c.type
        ? '<span class="type-badge" style="background:' + colors.bg + '; color:' + colors.border + '; border: 1px solid ' + colors.border + ';">' + esc(c.type) + '</span>'
        : '<span class="type-badge type-unknown">—</span>';
      const targetHit = c.targetPrice && c.currentValue != null && Number(c.currentValue) >= Number(c.targetPrice);
      const rowStyle = 'border-left: 3px solid ' + colors.border + (targetHit ? '; box-shadow: inset 0 0 0 1px rgba(76,175,125,0.3);' : '') + ';';
      return '<tr class="card-row' + (targetHit ? ' target-hit' : '') + '" onclick="openCard(\'' + c.id + '\')" style="' + rowStyle + '">' +
        '<td title="' + esc(c.name) + '" style="font-weight:600;">' + esc(c.name) + (targetHit ? ' <span style="color:var(--green); font-size:11px;">🎯</span>' : '') + '</td>' +
        '<td title="' + esc(c.set || '—') + '" style="color:var(--text2);">' + esc(c.set || '—') + '</td>' +
        '<td>' + typeBadge + '</td>' +
        '<td><span class="badge ' + gradeClass + '">' + esc(c.grade) + '</span></td>' +
        '<td style="font-family:var(--font-mono); color:var(--text2);">×' + (c.quantity || 1) + '</td>' +
        '<td style="font-family:var(--font-mono);">$' + cost.toFixed(2) + '</td>' +
        '<td style="font-family:var(--font-mono);">' + (val != null ? '$' + val.toFixed(2) : '<span style="color:var(--text3);">—</span>') + '</td>' +
        '<td class="' + profitClass + '" style="font-family:var(--font-mono); font-weight:600;">' + profitStr + '</td>' +
        '<td style="color:var(--text3); font-family:var(--font-mono); font-size:12px;">' + updated + '</td>' +
        '<td><button class="btn-row-edit" onclick="event.stopPropagation(); openEditForm(\'' + c.id + '\')" title="Edit">✎</button></td>' +
        '<td><button class="del-btn" onclick="event.stopPropagation(); deleteCard(\'' + c.id + '\')" title="Delete">✕</button></td>' +
      '</tr>';
    }).join('');

    cardList.innerHTML = sorted.map(c => {
      const cost = Number(c.purchasePrice) * (c.quantity || 1);
      const val = c.currentValue != null ? Number(c.currentValue) * (c.quantity || 1) : null;
      const profit = val != null ? val - cost : null;
      const profitStr = profit != null ? (profit >= 0 ? '↑ +' : '↓ -') + 'SGD $' + Math.abs(profit).toFixed(2) : '—';
      const profitClass = profit == null ? '' : profit >= 0 ? 'profit-pos' : 'profit-neg';
      const gradeClass = c.grade === 'raw' ? 'badge-raw' : 'badge-psa';
      const colors = getTypeColor(c.type);
      const targetHit = c.targetPrice && c.currentValue != null && Number(c.currentValue) >= Number(c.targetPrice);
      return '<div class="mobile-card' + (targetHit ? ' target-hit' : '') + '" style="border-left: 3px solid ' + colors.border + ';" onclick="openCard(\'' + c.id + '\')">' +
        '<div class="mobile-card-top">' +
          '<div><div class="mobile-card-name">' + esc(c.name) + (targetHit ? ' 🎯' : '') + '</div>' +
          '<div class="mobile-card-set">' + esc(c.set || '—') + ' · <span class="badge ' + gradeClass + '">' + esc(c.grade) + '</span>' + (c.quantity > 1 ? ' ×' + c.quantity : '') + '</div></div>' +
          '<div style="display:flex;gap:8px;align-items:center;">' +
          '<button class="mobile-card-delete" onclick="event.stopPropagation(); openEditForm(\'' + c.id + '\')" title="Edit" style="font-size:14px;">✎</button>' +
          '<button class="mobile-card-delete" onclick="event.stopPropagation(); deleteCard(\'' + c.id + '\')" title="Delete">✕</button>' +
          '</div>' +
        '</div>' +
        '<div class="mobile-card-bottom">' +
          '<div class="mobile-card-price">Paid: SGD $' + cost.toFixed(2) + '<br>Value: ' + fmt(val) + '</div>' +
          '<div class="mobile-card-profit ' + profitClass + '">' + profitStr + '</div>' +
        '</div></div>';
    }).join('');
  }

  // Sold table
  const soldTbody = document.getElementById('sold-table');
  const soldList = document.getElementById('sold-list');
  if (soldCards.length === 0) {
    soldTbody.innerHTML = '<tr><td colspan="9"><div class="empty-state">No sold cards yet</div></td></tr>';
    soldList.innerHTML = '<div class="empty-state">No sold cards yet</div>';
  } else {
    soldTbody.innerHTML = soldCards.map(c => {
      const profit = c.soldPrice ? (Number(c.soldPrice) - Number(c.purchasePrice)) * (c.quantity || 1) : null;
      const profitStr = profit != null ? (profit >= 0 ? '↑ +' : '↓ ') + 'SGD $' + Math.abs(profit).toFixed(2) : '—';
      const profitClass = profit == null ? '' : profit >= 0 ? 'profit-pos' : 'profit-neg';
      return '<tr>' +
        '<td style="font-weight:600;">' + esc(c.name) + '</td>' +
        '<td style="color:var(--text2);">' + esc(c.set || '—') + '</td>' +
        '<td><span class="badge ' + (c.grade === 'raw' ? 'badge-raw' : 'badge-psa') + '">' + esc(c.grade) + '</span></td>' +
        '<td style="font-family:var(--font-mono);">$' + (Number(c.purchasePrice) * (c.quantity || 1)).toFixed(2) + '</td>' +
        '<td style="font-family:var(--font-mono);">' + (c.soldPrice ? '$' + Number(c.soldPrice).toFixed(2) : '—') + '</td>' +
        '<td class="' + profitClass + '" style="font-family:var(--font-mono); font-weight:600;">' + profitStr + '</td>' +
        '<td style="color:var(--text3); font-family:var(--font-mono); font-size:12px;">' + (c.soldDate || '—') + '</td>' +
        '<td style="color:var(--text2); font-size:12px;">' + esc(c.soldTo || '—') + '</td>' +
        '<td><button class="del-btn" onclick="deleteCard(\'' + c.id + '\')" title="Delete">✕</button></td>' +
      '</tr>';
    }).join('');

    soldList.innerHTML = soldCards.map(c => {
      const profit = c.soldPrice ? (Number(c.soldPrice) - Number(c.purchasePrice)) * (c.quantity || 1) : null;
      const profitStr = profit != null ? (profit >= 0 ? '+' : '') + 'SGD $' + profit.toFixed(2) : '—';
      const profitClass = profit == null ? '' : profit >= 0 ? 'profit-pos' : 'profit-neg';
      return '<div class="mobile-card">' +
        '<div class="mobile-card-top">' +
          '<div><div class="mobile-card-name">' + esc(c.name) + '</div>' +
          '<div class="mobile-card-set">' + esc(c.set || '—') + ' · sold ' + (c.soldDate || '—') + '</div></div>' +
        '</div>' +
        '<div class="mobile-card-bottom">' +
          '<div class="mobile-card-price">Paid: SGD $' + Number(c.purchasePrice).toFixed(2) + '<br>Sold: ' + (c.soldPrice ? 'SGD $' + Number(c.soldPrice).toFixed(2) : '—') + '</div>' +
          '<div class="mobile-card-profit ' + profitClass + '">' + profitStr + '</div>' +
        '</div></div>';
    }).join('');
  }

  updateSummary();
  renderMovers();
  checkTargetAlerts();
}

function esc(str) {
  return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function updateSummary() {
  const active = cards.filter(c => !c.sold);
  const sold = cards.filter(c => c.sold);
  const count = active.reduce((s, c) => s + (c.quantity || 1), 0);
  const cost = active.reduce((s, c) => s + Number(c.purchasePrice) * (c.quantity || 1), 0);
  const value = active.reduce((s, c) => s + (c.currentValue != null ? Number(c.currentValue) : Number(c.purchasePrice)) * (c.quantity || 1), 0);
  const profit = value - cost;
  const realised = sold.reduce((s, c) => s + (c.soldPrice ? (Number(c.soldPrice) - Number(c.purchasePrice)) * (c.quantity || 1) : 0), 0);

  document.getElementById('s-count').textContent = count;
  animateValue(document.getElementById('s-cost'), cost, 'SGD ');
  animateValue(document.getElementById('s-value'), value, 'SGD ');
  if (document.getElementById('header-value')) animateValue(document.getElementById('header-value'), value, 'SGD ');

  const pel = document.getElementById('s-profit');
  pel.textContent = (profit >= 0 ? '↑ +SGD ' : '↓ -SGD ') + '$' + Math.abs(profit).toFixed(2);
  pel.className = 'metric-value ' + (profit >= 0 ? 'pos' : 'neg');

  const rel = document.getElementById('s-realised');
  rel.textContent = (realised >= 0 ? '+SGD $' : '-SGD $') + Math.abs(realised).toFixed(2);
  rel.className = 'metric-value ' + (realised >= 0 ? 'pos' : 'neg');

  const profitCard = document.querySelector('.profit-card');
  const profitIcon = document.getElementById('profit-icon');
  if (profitCard) { profitCard.classList.toggle('pos', profit >= 0); profitCard.classList.toggle('neg', profit < 0); }
  if (profitIcon) profitIcon.textContent = profit >= 0 ? '💰' : '📉';
}

// ── Price fetching ───────────────────────────────────────────────────
async function fetchPrice(card) {
  try {
    const namePart = card.name.replace(/['"]/g, '').trim();

    if (card.set) {
      const setSanitized = card.set.replace(/['"]/g, '').trim();
      const q1 = `name:"${namePart}" set.name:"${setSanitized}"`;
      const url1 = 'https://api.pokemontcg.io/v2/cards?q=' + encodeURIComponent(q1) + '&select=name,set,number,tcgplayer&orderBy=-set.releaseDate&pageSize=20';
      const res1 = await fetch(url1);
      if (res1.ok) {
        const data1 = await res1.json();
        if (data1.data && data1.data.length > 0) {
          const price = extractPriceFromResults(data1.data, card);
          if (price != null) return price;
        }
      }

      const setFirstWord = setSanitized.split(' ')[0];
      if (setFirstWord.length > 2) {
        const q2 = `name:"${namePart}" set.name:${setFirstWord}*`;
        const url2 = 'https://api.pokemontcg.io/v2/cards?q=' + encodeURIComponent(q2) + '&select=name,set,number,tcgplayer&orderBy=-set.releaseDate&pageSize=20';
        const res2 = await fetch(url2);
        if (res2.ok) {
          const data2 = await res2.json();
          if (data2.data && data2.data.length > 0) {
            const price = extractPriceFromResults(data2.data, card);
            if (price != null) return price;
          }
        }
      }
    }

    const q3 = `name:"${namePart}"`;
    const url3 = 'https://api.pokemontcg.io/v2/cards?q=' + encodeURIComponent(q3) + '&select=name,set,number,tcgplayer&orderBy=-set.releaseDate&pageSize=20';
    const res3 = await fetch(url3);
    if (!res3.ok) return null;
    const data3 = await res3.json();
    if (!data3.data || data3.data.length === 0) return null;
    return extractPriceFromResults(data3.data, card);

  } catch (e) {
    console.error('fetchPrice error for ' + card.name, e);
    return null;
  }
}

function extractPriceFromResults(results, card) {
  const cardSetLower = (card.set || '').toLowerCase();

  const scored = results.map(r => {
    let score = 0;
    if (r.name.toLowerCase() === card.name.toLowerCase()) score += 10;
    if (cardSetLower && r.set && r.set.name) {
      const rSetLower = r.set.name.toLowerCase();
      if (rSetLower === cardSetLower) score += 5;
      else if (rSetLower.includes(cardSetLower) || cardSetLower.includes(rSetLower)) score += 3;
      const firstWord = cardSetLower.split(' ')[0];
      if (firstWord.length > 3 && rSetLower.includes(firstWord)) score += 1;
    }
    return { ...r, _score: score };
  }).sort((a, b) => b._score - a._score);

  for (const match of scored) {
    const prices = match.tcgplayer ? match.tcgplayer.prices : null;
    if (!prices) continue;

    const preferredKeys = ['holofoil','1stEditionHolofoil','normal','reverseHolofoil','unlimited','1stEdition'];
    let base = null;
    for (const key of preferredKeys) {
      if (prices[key]?.market) { base = prices[key].market; break; }
    }
    if (!base) {
      for (const key of Object.keys(prices)) {
        if (prices[key]?.market) { base = prices[key].market; break; }
      }
    }
    if (!base) continue;

    const gradeStr = (card.grade || 'raw').toLowerCase();
    let priceUSD = base;
    if (gradeStr === 'psa 10' || gradeStr === 'bgs 10') priceUSD *= 3.5;
    else if (gradeStr === 'psa 9' || gradeStr === 'bgs 9.5') priceUSD *= 1.5;
    else if (gradeStr === 'psa 8' || gradeStr === 'bgs 9') priceUSD *= 1.2;
    else if (gradeStr === 'psa 7') priceUSD *= 1.05;

    return Math.round(priceUSD * USD_TO_SGD * 100) / 100;
  }
  return null;
}

function isSameDay(ts1, ts2) {
  const d1 = new Date(ts1); const d2 = new Date(ts2);
  return d1.getFullYear() === d2.getFullYear() && d1.getMonth() === d2.getMonth() && d1.getDate() === d2.getDate();
}

async function refreshPrices(silent) {
  const active = cards.filter(c => !c.sold);
  if (active.length === 0) { if (!silent) toast('No cards to refresh.', 'info'); return; }
  const btn = document.querySelector('.btn-refresh');
  btn.disabled = true;
  btn.textContent = '↻ Fetching...';
  let updated = 0;
  for (let i = 0; i < active.length; i++) {
    try {
      const price = await fetchPrice(active[i]);
      if (price != null) {
        const now = Date.now();
        const idx = cards.findIndex(c => c.id === active[i].id);
        cards[idx].currentValue = price;
        cards[idx].lastUpdated = now;
        if (!cards[idx].priceHistory) cards[idx].priceHistory = [];
        const history = cards[idx].priceHistory;
        const lastEntry = history[history.length - 1];
        if (!lastEntry || !isSameDay(lastEntry.date, now)) {
          history.push({ date: now, value: price });
        } else {
          history[history.length - 1] = { date: now, value: price };
        }
        await fetch('/api/cards/' + cards[idx].id, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ currentValue: price, lastUpdated: now, priceHistory: history })
        });
        updated++;
      }
    } catch (e) { console.error('Failed for ' + active[i].name, e); }
    await new Promise(r => setTimeout(r, 300));
  }
  localStorage.setItem('lastRefresh', Date.now().toString());
  render();
  document.getElementById('last-updated').textContent = 'Last refreshed: ' + new Date().toLocaleString('en-SG') + ' · USD/SGD: ' + USD_TO_SGD.toFixed(4);
  btn.disabled = false;
  btn.textContent = '↻ Refresh prices';
  if (!silent) {
    if (updated > 0) toast('Updated ' + updated + ' card' + (updated > 1 ? 's' : '') + '.', 'success');
    else toast('No prices found. Try setting values manually.', 'error');
  }
}

init();
