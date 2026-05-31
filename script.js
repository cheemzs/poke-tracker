const USD_TO_SGD = 1.35;
let cards = [];
let priceChart = null;
let activeTypeFilter = '';
let activeMoversFilter = '';

const TYPE_COLORS = {
  'Fire':      { bg: '#FFE0CC', border: '#FF8C42', chart: '#FF8C42' },
  'Water':     { bg: '#CCE8FF', border: '#4A90D9', chart: '#4A90D9' },
  'Grass':     { bg: '#D4F0C0', border: '#5DAA46', chart: '#5DAA46' },
  'Electric':  { bg: '#FFF5CC', border: '#F0C030', chart: '#F0C030' },
  'Psychic':   { bg: '#FFD6E8', border: '#E06090', chart: '#E06090' },
  'Fighting':  { bg: '#FFD6C0', border: '#C0602E', chart: '#C0602E' },
  'Dark':      { bg: '#D6D0E8', border: '#5A4E8C', chart: '#5A4E8C' },
  'Steel':     { bg: '#E0E8F0', border: '#8090A8', chart: '#8090A8' },
  'Dragon':    { bg: '#CCE0FF', border: '#3060C8', chart: '#3060C8' },
  'Fairy':     { bg: '#FFE0F0', border: '#E87EB8', chart: '#E87EB8' },
  'Normal':    { bg: '#F0EEE8', border: '#A8A878', chart: '#A8A878' },
  'Colorless': { bg: '#F5F5F5', border: '#B8B8B8', chart: '#B8B8B8' },
};

function getTypeColor(type) {
  return TYPE_COLORS[type] || { bg: '#f0efea', border: '#ccc', chart: '#1a1a1a' };
}

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
  if (!res.ok) { toast('Failed to save card. Please try again.', 'error'); return; }
  const card = await res.json();
  cards.push(card);
  render();
  toggleForm();
  toast(name + ' added to your collection.', 'success');
  document.getElementById('f-name').value = '';
  document.getElementById('f-set').value = '';
  document.getElementById('f-type').value = '';
  document.getElementById('f-url').value = '';
  document.getElementById('f-price').value = '';
  document.getElementById('f-grade').value = 'raw';
}

async function deleteCard(id) {
  const card = cards.find(c => c.id === id);
  const confirmed = await confirmDialog('Remove "' + (card ? card.name : 'this card') + '" from your collection?');
  if (!confirmed) return;
  const res = await fetch('/api/cards/' + id, { method: 'DELETE' });
  if (!res.ok) { toast('Failed to delete card.', 'error'); return; }
  cards = cards.filter(c => c.id !== id);
  render();
  toast('Card removed.', 'info');
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
  const cost = Number(card.purchasePrice);
  const val = card.currentValue != null ? Number(card.currentValue) : null;
  const profit = val != null ? val - cost : null;
  const colors = getTypeColor(card.type);

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
          pointRadius: 3,
          pointBackgroundColor: colors.chart,
          tension: 0.3,
          fill: true
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { display: false },
          tooltip: { callbacks: { label: ctx => 'SGD $' + Number(ctx.raw).toFixed(2) } }
        },
        scales: {
          y: { ticks: { callback: v => 'SGD $' + v, font: { size: 11 } }, grid: { color: '#f0efea' } },
          x: { ticks: { font: { size: 11 } }, grid: { display: false } }
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
    return '<div class="mover-card" style="border-left: 3px solid ' + colors.border + '; background: ' + colors.bg + ';" onclick="openCard(\'' + c.id + '\')">' +
      '<div><div class="mover-name">' + esc(c.name) + '</div><div class="mover-set">' + esc(c.set || '—') + '</div></div>' +
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
    tbody.innerHTML = '<tr><td colspan="9"><div class="empty-state">No cards yet — click "+ Add card" to get started</div></td></tr>';
    cardList.innerHTML = '<div class="empty-state">No cards yet — click "+ Add card" to get started</div>';
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
      '<td title="' + esc(c.name) + '">' + esc(c.name) + '</td>' +
      '<td title="' + esc(c.set || '—') + '">' + esc(c.set || '—') + '</td>' +
      '<td>' + typeBadge + '</td>' +
      '<td><span class="badge ' + gradeClass + '">' + esc(c.grade) + '</span></td>' +
      '<td>SGD $' + cost.toFixed(2) + '</td>' +
      '<td>' + fmt(val) + '</td>' +
      '<td class="' + profitClass + '">' + profitStr + '</td>' +
      '<td>' + updated + '</td>' +
      '<td><button class="del-btn" onclick="event.stopPropagation(); deleteCard(\'' + c.id + '\')" title="Delete">&#x2715;</button></td>' +
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
    return '<div class="mobile-card" style="border-left: 3px solid ' + colors.border + '; background: linear-gradient(to right, ' + colors.bg + ', white);" onclick="openCard(\'' + c.id + '\')">' +
      '<div class="mobile-card-top">' +
        '<div><div class="mobile-card-name">' + esc(c.name) + '</div>' +
        '<div class="mobile-card-set">' + esc(c.set || '—') + ' · <span class="badge ' + gradeClass + '">' + esc(c.grade) + '</span></div></div>' +
        '<button class="mobile-card-delete" onclick="event.stopPropagation(); deleteCard(\'' + c.id + '\')" title="Delete">&#x2715;</button>' +
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
  document.getElementById('s-cost').textContent = 'SGD $' + cost.toFixed(2);
  document.getElementById('s-value').textContent = 'SGD $' + value.toFixed(2);
  const pel = document.getElementById('s-profit');
  pel.textContent = (profit >= 0 ? '↑ +' : '↓ -') + 'SGD $' + Math.abs(profit).toFixed(2);
  pel.className = 'metric-value ' + (profit >= 0 ? 'pos' : 'neg');
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
  return d1.getFullYear() === d2.getFullYear() &&
    d1.getMonth() === d2.getMonth() &&
    d1.getDate() === d2.getDate();
}

async function refreshPrices(silent) {
  if (cards.length === 0) { if (!silent) toast('No cards to refresh.', 'info'); return; }
  const btn = document.querySelector('.refresh-btn');
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
    if (updated > 0) toast('Updated prices for ' + updated + ' card' + (updated > 1 ? 's' : '') + '.', 'success');
    else toast('No prices could be fetched. Check your PriceCharting URLs.', 'error');
  }
}

init();
