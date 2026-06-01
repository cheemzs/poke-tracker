const USD_TO_SGD = 1.35;
let cards = [];
let priceChart = null;
let colorEnabled = true;
let activeTypeFilter = '';
let activeMoversFilter = '';
let editingCardId = null;

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

async function init() {
  const res = await fetch('/api/me');
  if (!res.ok) { window.location.href = '/login.html'; return; }
  const { username } = await res.json();
  document.getElementById('username-display').textContent = username;
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
  if (cards.length === 0) return;
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

function toggleForm() {
  const f = document.getElementById('add-form');
  f.classList.toggle('open');
  if (f.classList.contains('open')) document.getElementById('f-name').focus();
}

async function addCard() {
  const name = document.getElementById('f-name').value.trim();
  const set = document.getElementById('f-set').value.trim();
  const type = document.getElementById('f-type').value;
  const grade = document.getElementById('f-grade').value;
  const price = parseFloat(document.getElementById('f-price').value);
  const url = document.getElementById('f-url').value.trim();
  if (!name) { toast('Please enter a card name.', 'error'); return; }
  if (!price || price <= 0) { toast('Please enter a valid purchase price.', 'error'); return; }
  const res = await fetch('/api/cards', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name, set, type, grade, purchasePrice: price, currentValue: null, lastUpdated: null, url, priceHistory: [] })
  });
  if (!res.ok) { toast('Failed to save card.', 'error'); return; }
  const card = await res.json();
  cards.push(card);
  render();
  toggleForm();
  toast(name + ' added to your vault.', 'success');
  document.getElementById('f-name').value = '';
  document.getElementById('f-set').value = '';
  document.getElementById('f-type').value = '';
  document.getElementById('f-url').value = '';
  document.getElementById('f-price').value = '';
  document.getElementById('f-grade').value = 'raw';
}

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

function openEditForm() {
  const card = cards.find(c => c.id === editingCardId);
  if (!card) return;
  document.getElementById('edit-id').value = card.id;
  document.getElementById('edit-name').value = card.name || '';
  document.getElementById('edit-set').value = card.set || '';
  document.getElementById('edit-type').value = card.type || '';
  document.getElementById('edit-grade').value = card.grade || 'raw';
  document.getElementById('edit-price').value = card.purchasePrice || '';
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
  const price = parseFloat(document.getElementById('edit-price').value);
  const url = document.getElementById('edit-url').value.trim();
  if (!name) { toast('Card name is required.', 'error'); return; }
  if (!price || price <= 0) { toast('Please enter a valid price.', 'error'); return; }
  const res = await fetch('/api/cards/' + id, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name, set, type, grade, purchasePrice: price, url })
  });
  if (!res.ok) { toast('Failed to save changes.', 'error'); return; }
  const idx = cards.findIndex(c => c.id === id);
  if (idx > -1) cards[idx] = { ...cards[idx], name, set, type, grade, purchasePrice: price, url };
  closeEditModal();
  render();
  toast('Card updated.', 'success');
}

function applyFilter() {
  activeTypeFilter = document.getElementById('filter-type').value;
  activeMoversFilter = document.getElementById('filter-movers').value;
  render();
}

function getFilteredCards() {
  let filtered = [...cards];
  if (activeTypeFilter) filtered = filtered.filter(c => c.type === activeTypeFilter);
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

function openCard(id) {
  const card = cards.find(c => c.id === id);
  if (!card) return;
  editingCardId = id;
  const cost = Number(card.purchasePrice);
  const val = card.currentValue != null ? Number(card.currentValue) : null;
  const profit = val != null ? val - cost : null;
  const colors = getTypeColor(card.type);

  const typeBar = document.getElementById('modal-type-bar');
  if (typeBar) typeBar.style.background = colors.border;

  document.getElementById('modal-name').textContent = card.name;
  document.getElementById('modal-meta').textContent = (card.set || 'Unknown set') + (card.type ? ' · ' + card.type : '');
  const gradeEl = document.getElementById('modal-grade');
  gradeEl.textContent = card.grade;
  gradeEl.className = 'badge ' + (card.grade === 'raw' ? 'badge-raw' : 'badge-psa');
  document.getElementById('modal-cost').textContent = 'SGD $' + cost.toFixed(2);
  document.getElementById('modal-value').textContent = val != null ? 'SGD $' + val.toFixed(2) : '—';
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
          y: {
            ticks: { callback: v => '$' + v, font: { size: 11, family: 'DM Mono' }, color: 'var(--text3)' },
            grid: { color: 'var(--border)' },
            border: { display: false }
          },
          x: {
            ticks: { font: { size: 11, family: 'DM Mono' }, color: 'var(--text3)' },
            grid: { display: false },
            border: { display: false }
          }
        }
      }
    });
  }
  document.getElementById('modal-overlay').classList.add('active');
}

function closeModal(e) {
  if (e && e.target !== document.getElementById('modal-overlay')) return;
  document.getElementById('modal-overlay').classList.remove('active');
  if (priceChart) { priceChart.destroy(); priceChart = null; }
}

document.addEventListener('keydown', e => {
  if (e.key === 'Escape') {
    document.getElementById('modal-overlay').classList.remove('active');
    document.getElementById('confirm-overlay').classList.remove('active');
    document.getElementById('edit-overlay').classList.remove('active');
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
  const priced = cards.filter(c => c.currentValue != null);
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

function render() {
  const tbody = document.getElementById('card-table');
  const cardList = document.getElementById('card-list');
  const filtered = getFilteredCards();
  const sorted = getSortedCards(filtered);

  if (cards.length === 0) {
    tbody.innerHTML = '<tr><td colspan="9"><div class="empty-state">Your vault is empty — add your first card to get started</div></td></tr>';
    cardList.innerHTML = '<div class="empty-state">Your vault is empty — add your first card to get started</div>';
    updateSummary();
    renderMovers();
    return;
  }

  tbody.innerHTML = sorted.map(c => {
    const cost = Number(c.purchasePrice);
    const val = c.currentValue != null ? Number(c.currentValue) : null;
    const profit = val != null ? val - cost : null;
    const profitStr = profit != null ? (profit >= 0 ? '↑ +' : '↓ ') + 'SGD $' + Math.abs(profit).toFixed(2) : '—';
    const profitClass = profit == null ? '' : profit >= 0 ? 'profit-pos' : 'profit-neg';
    const gradeClass = c.grade === 'raw' ? 'badge-raw' : 'badge-psa';
    const updated = c.lastUpdated ? new Date(c.lastUpdated).toLocaleDateString('en-SG') : '—';
    const colors = getTypeColor(c.type);
    const typeBadge = c.type
      ? '<span class="type-badge" style="background:' + colors.bg + '; color:' + colors.border + '; border: 1px solid ' + colors.border + ';">' + esc(c.type) + '</span>'
      : '<span class="type-badge type-unknown">—</span>';
    return '<tr class="card-row" onclick="openCard(\'' + c.id + '\')" style="border-left: 3px solid ' + colors.border + '">' +
      '<td title="' + esc(c.name) + '" style="font-weight:600;">' + esc(c.name) + '</td>' +
      '<td title="' + esc(c.set || '—') + '" style="color:var(--text2);">' + esc(c.set || '—') + '</td>' +
      '<td>' + typeBadge + '</td>' +
      '<td><span class="badge ' + gradeClass + '">' + esc(c.grade) + '</span></td>' +
      '<td style="font-family:var(--font-mono);">$' + cost.toFixed(2) + '</td>' +
      '<td style="font-family:var(--font-mono);">' + (val != null ? '$' + val.toFixed(2) : '—') + '</td>' +
      '<td class="' + profitClass + '" style="font-family:var(--font-mono); font-weight:600;">' + profitStr + '</td>' +
      '<td style="color:var(--text3); font-family:var(--font-mono); font-size:12px;">' + updated + '</td>' +
      '<td><button class="del-btn" onclick="event.stopPropagation(); deleteCard(\'' + c.id + '\')" title="Delete">✕</button></td>' +
    '</tr>';
  }).join('');

  cardList.innerHTML = sorted.map(c => {
    const cost = Number(c.purchasePrice);
    const val = c.currentValue != null ? Number(c.currentValue) : null;
    const profit = val != null ? val - cost : null;
    const profitStr = profit != null ? (profit >= 0 ? '↑ +' : '↓ -') + 'SGD $' + Math.abs(profit).toFixed(2) : '—';
    const profitClass = profit == null ? '' : profit >= 0 ? 'profit-pos' : 'profit-neg';
    const gradeClass = c.grade === 'raw' ? 'badge-raw' : 'badge-psa';
    const colors = getTypeColor(c.type);
    return '<div class="mobile-card" style="border-left: 3px solid ' + colors.border + ';" onclick="openCard(\'' + c.id + '\')">' +
      '<div class="mobile-card-top">' +
        '<div><div class="mobile-card-name">' + esc(c.name) + '</div>' +
        '<div class="mobile-card-set">' + esc(c.set || '—') + ' · <span class="badge ' + gradeClass + '">' + esc(c.grade) + '</span></div></div>' +
        '<button class="mobile-card-delete" onclick="event.stopPropagation(); deleteCard(\'' + c.id + '\')" title="Delete">✕</button>' +
      '</div>' +
      '<div class="mobile-card-bottom">' +
        '<div class="mobile-card-price">Paid: SGD $' + cost.toFixed(2) + '<br>Value: ' + fmt(val) + '</div>' +
        '<div class="mobile-card-profit ' + profitClass + '">' + profitStr + '</div>' +
      '</div></div>';
  }).join('');

  updateSummary();
  renderMovers();
}

function esc(str) {
  return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function updateSummary() {
  const count = cards.length;
  const cost = cards.reduce((s, c) => s + Number(c.purchasePrice), 0);
  const value = cards.reduce((s, c) => s + (c.currentValue != null ? Number(c.currentValue) : Number(c.purchasePrice)), 0);
  const profit = value - cost;

  document.getElementById('s-count').textContent = count;

  const costEl = document.getElementById('s-cost');
  const valueEl = document.getElementById('s-value');
  const profitEl = document.getElementById('s-profit');
  const headerVal = document.getElementById('header-value');

  animateValue(costEl, cost, 'SGD ');
  animateValue(valueEl, value, 'SGD ');
  if (headerVal) animateValue(headerVal, value, 'SGD ');

  const profitPrefix = profit >= 0 ? '↑ +SGD ' : '↓ -SGD ';
  profitEl.textContent = profitPrefix + '$' + Math.abs(profit).toFixed(2);
  profitEl.className = 'metric-value ' + (profit >= 0 ? 'pos' : 'neg');

  const profitCard = document.querySelector('.profit-card');
  const profitIcon = document.getElementById('profit-icon');
  if (profitCard) {
    profitCard.classList.toggle('pos', profit >= 0);
    profitCard.classList.toggle('neg', profit < 0);
  }
  if (profitIcon) profitIcon.textContent = profit >= 0 ? '💰' : '📉';
}

async function fetchPrice(card) {
  if (!card.url) return null;
  const urlMatch = card.url.match(/\/([^\/]+)$/);
  if (!urlMatch) return null;
  const numberMatch = urlMatch[1].match(/-(\d+)$/);
  const cardNumber = numberMatch ? numberMatch[1] : null;
  const slug = urlMatch[1].replace(/-\d+$/, '').replace(/-/g, ' ');
  const apiUrl = 'https://api.pokemontcg.io/v2/cards?q=name:%22' + encodeURIComponent(slug) + '%22&select=name,set,number,tcgplayer';
  const res = await fetch(apiUrl);
  if (!res.ok) return null;
  const data = await res.json();
  if (!data.data || data.data.length === 0) return null;
  const match = data.data.find(c => cardNumber && c.number === cardNumber) || data.data[0];
  const prices = match.tcgplayer ? match.tcgplayer.prices : null;
  if (!prices) return null;
  const base =
    (prices.holofoil && prices.holofoil.market) ? prices.holofoil.market :
    (prices.normal && prices.normal.market) ? prices.normal.market :
    (prices.reverseHolofoil && prices.reverseHolofoil.market) ? prices.reverseHolofoil.market : null;
  if (!base) return null;
  const gradeStr = card.grade ? card.grade.toLowerCase() : 'raw';
  let priceUSD = base;
  if (gradeStr === 'psa 10' || gradeStr === 'bgs 10') priceUSD *= 3.5;
  else if (gradeStr === 'psa 9' || gradeStr === 'bgs 9.5') priceUSD *= 1.5;
  else if (gradeStr === 'psa 8' || gradeStr === 'bgs 9') priceUSD *= 1.2;
  else if (gradeStr === 'psa 7') priceUSD *= 1.05;
  return Math.round(priceUSD * USD_TO_SGD * 100) / 100;
}

function isSameDay(ts1, ts2) {
  const d1 = new Date(ts1);
  const d2 = new Date(ts2);
  return d1.getFullYear() === d2.getFullYear() && d1.getMonth() === d2.getMonth() && d1.getDate() === d2.getDate();
}

async function refreshPrices(silent) {
  if (cards.length === 0) { if (!silent) toast('No cards to refresh.', 'info'); return; }
  const btn = document.querySelector('.btn-refresh');
  btn.disabled = true;
  btn.textContent = '↻ Fetching...';
  let updated = 0;
  for (let i = 0; i < cards.length; i++) {
    try {
      const price = await fetchPrice(cards[i]);
      if (price != null) {
        const now = Date.now();
        cards[i].currentValue = price;
        cards[i].lastUpdated = now;
        if (!cards[i].priceHistory) cards[i].priceHistory = [];
        const history = cards[i].priceHistory;
        const lastEntry = history[history.length - 1];
        if (!lastEntry || !isSameDay(lastEntry.date, now)) {
          history.push({ date: now, value: price });
        } else {
          history[history.length - 1] = { date: now, value: price };
        }
        await fetch('/api/cards/' + cards[i].id, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ currentValue: price, lastUpdated: now, priceHistory: history })
        });
        updated++;
      }
    } catch (e) {
      console.error('Failed for ' + cards[i].name, e);
    }
    await new Promise(r => setTimeout(r, 800));
  }
  localStorage.setItem('lastRefresh', Date.now().toString());
  render();
  document.getElementById('last-updated').textContent = 'Last refreshed: ' + new Date().toLocaleString('en-SG');
  btn.disabled = false;
  btn.textContent = '↻ Refresh prices';
  if (!silent) {
    if (updated > 0) toast('Updated ' + updated + ' card' + (updated > 1 ? 's' : '') + '.', 'success');
    else toast('No prices could be fetched. Check your PriceCharting URLs.', 'error');
  }
}

init();
