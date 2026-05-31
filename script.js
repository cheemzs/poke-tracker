const USD_TO_SGD = 1.35;
let cards = [];
let priceChart = null;

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
  setTimeout(() => {
    t.classList.remove('toast-show');
    setTimeout(() => t.remove(), 300);
  }, 3500);
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
  const grade = document.getElementById('f-grade').value;
  const price = parseFloat(document.getElementById('f-price').value);
  const url = document.getElementById('f-url').value.trim();

  if (!name) { toast('Please enter a card name.', 'error'); return; }
  if (!price || price <= 0) { toast('Please enter a valid purchase price.', 'error'); return; }

  const res = await fetch('/api/cards', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name, set, grade, purchasePrice: price, currentValue: null, lastUpdated: null, url, priceHistory: [] })
  });

  if (!res.ok) { toast('Failed to save card. Please try again.', 'error'); return; }

  const card = await res.json();
  cards.push(card);
  render();
  toggleForm();
  toast(name + ' added to your collection.', 'success');

  document.getElementById('f-name').value = '';
  document.getElementById('f-set').value = '';
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

function openCard(id) {
  const card = cards.find(c => c.id === id);
  if (!card) return;

  const cost = Number(card.purchasePrice);
  const val = card.currentValue != null ? Number(card.currentValue) : null;
  const profit = val != null ? val - cost : null;

  document.getElementById('modal-name').textContent = card.name;
  document.getElementById('modal-meta').textContent = card.set || 'Unknown set';

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
    ? new Date(card.lastUpdated).toLocaleDateString('en-SG')
    : '—';

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
          borderColor: '#1a1a1a',
          backgroundColor: 'rgba(26,26,26,0.06)',
          borderWidth: 1.5,
          pointRadius: 3,
          pointBackgroundColor: '#1a1a1a',
          tension: 0.3,
          fill: true
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { display: false },
          tooltip: {
            callbacks: {
              label: ctx => 'SGD $' + Number(ctx.raw).toFixed(2)
            }
          }
        },
        scales: {
          y: {
            ticks: { callback: v => 'SGD $' + v, font: { size: 11 } },
            grid: { color: '#f0efea' }
          },
          x: {
            ticks: { font: { size: 11 } },
            grid: { display: false }
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
  }
});

function fmt(val) {
  return val != null ? 'SGD $' + Number(val).toFixed(2) : '—';
}

let sortCol = null;
let sortDir = 1;

function sortBy(col) {
  if (sortCol === col) {
    sortDir *= -1;
  } else {
    sortCol = col;
    sortDir = 1;
  }
  render();
}

function getSortedCards() {
  if (!sortCol) return [...cards];
  return [...cards].sort((a, b) => {
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

function sortArrow(col) {
  if (sortCol !== col) return ' <span class="sort-arrow inactive">↕</span>';
  return ' <span class="sort-arrow">' + (sortDir === 1 ? '↑' : '↓') + '</span>';
}

function renderMovers() {
  const priced = cards.filter(c => c.currentValue != null);
  if (priced.length < 2) {
    document.getElementById('movers-section').style.display = 'none';
    return;
  }

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
    return '<div class="mover-card" onclick="openCard(\'' + c.id + '\')">' +
      '<div>' +
        '<div class="mover-name">' + esc(c.name) + '</div>' +
        '<div class="mover-set">' + esc(c.set || '—') + '</div>' +
      '</div>' +
      '<div class="mover-value ' + (pos ? 'profit-pos' : 'profit-neg') + '">' +
        (pos ? '↑' : '↓') + ' ' + Math.abs(pct).toFixed(1) + '%' +
        '<span class="mover-sgd">' + (pos ? '+' : '-') + 'SGD $' + Math.abs(profit).toFixed(2) + '</span>' +
      '</div>' +
    '</div>';
  }

  document.getElementById('movers-gainers').innerHTML = top.map(moverCard).join('');
  document.getElementById('movers-losers').innerHTML = bottom.map(moverCard).join('');
}

function render() {
  const tbody = document.getElementById('card-table');
  const cardList = document.getElementById('card-list');
  const sorted = getSortedCards();

  if (cards.length === 0) {
    tbody.innerHTML = '<tr><td colspan="8"><div class="empty-state">No cards yet — click "+ Add card" to get started</div></td></tr>';
    cardList.innerHTML = '<div class="empty-state">No cards yet — click "+ Add card" to get started</div>';
    updateSummary();
    renderMovers();
    return;
  }

  // Desktop table
  tbody.innerHTML = sorted.map(c => {
    const cost = Number(c.purchasePrice);
    const val = c.currentValue != null ? Number(c.currentValue) : null;
    const profit = val != null ? val - cost : null;
    const profitStr = profit != null
      ? (profit >= 0 ? '↑ +' : '↓ ') + 'SGD $' + Math.abs(profit).toFixed(2)
      : '—';
    const profitClass = profit == null ? '' : profit >= 0 ? 'profit-pos' : 'profit-neg';
    const gradeClass = c.grade === 'raw' ? 'badge-raw' : 'badge-psa';
    const updated = c.lastUpdated ? new Date(c.lastUpdated).toLocaleDateString('en-SG') : '—';

    return '<tr class="card-row" onclick="openCard(\'' + c.id + '\')">' +
      '<td title="' + esc(c.name) + '">' + esc(c.name) + '</td>' +
      '<td title="' + esc(c.set || '—') + '">' + esc(c.set || '—') + '</td>' +
      '<td><span class="badge ' + gradeClass + '">' + esc(c.grade) + '</span></td>' +
      '<td>SGD $' + cost.toFixed(2) + '</td>' +
      '<td>' + fmt(val) + '</td>' +
      '<td class="' + profitClass + '">' + profitStr + '</td>' +
      '<td>' + updated + '</td>' +
      '<td><button class="del-btn" onclick="event.stopPropagation(); deleteCard(\'' + c.id + '\')" title="Delete">&#x2715;</button></td>' +
    '</tr>';
  }).join('');

  // Mobile card list
  cardList.innerHTML = sorted.map(c => {
    const cost = Number(c.purchasePrice);
    const val = c.currentValue != null ? Number(c.currentValue) : null;
    const profit = val != null ? val - cost : null;
    const profitStr = profit != null
      ? (profit >= 0 ? '↑ +' : '↓ -') + 'SGD $' + Math.abs(profit).toFixed(2)
      : '—';
    const profitClass = profit == null ? '' : profit >= 0 ? 'profit-pos' : 'profit-neg';
    const gradeClass = c.grade === 'raw' ? 'badge-raw' : 'badge-psa';

    return '<div class="mobile-card" onclick="openCard(\'' + c.id + '\')">' +
      '<div class="mobile-card-top">' +
        '<div>' +
          '<div class="mobile-card-name">' + esc(c.name) + '</div>' +
          '<div class="mobile-card-set">' + esc(c.set || '—') + ' · <span class="badge ' + gradeClass + '">' + esc(c.grade) + '</span></div>' +
        '</div>' +
        '<button class="mobile-card-delete" onclick="event.stopPropagation(); deleteCard(\'' + c.id + '\')" title="Delete">&#x2715;</button>' +
      '</div>' +
      '<div class="mobile-card-bottom">' +
        '<div class="mobile-card-price">Paid: SGD $' + cost.toFixed(2) + '<br>Value: ' + fmt(val) + '</div>' +
        '<div class="mobile-card-profit ' + profitClass + '">' + profitStr + '</div>' +
      '</div>' +
    '</div>';
  }).join('');

  updateSummary();
  renderMovers();
}

function esc(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
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

  if (gradeStr === 'psa 10' || gradeStr === 'bgs 10') priceUSD = base * 3.5;
  else if (gradeStr === 'psa 9' || gradeStr === 'bgs 9.5') priceUSD = base * 1.5;
  else if (gradeStr === 'psa 8' || gradeStr === 'bgs 9') priceUSD = base * 1.2;
  else if (gradeStr === 'psa 7') priceUSD = base * 1.05;

  return Math.round(priceUSD * USD_TO_SGD * 100) / 100;
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
        cards[i].priceHistory.push({ date: now, value: price });
        await fetch('/api/cards/' + cards[i].id, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            currentValue: price,
            lastUpdated: now,
            priceHistory: cards[i].priceHistory
          })
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
  const now = new Date().toLocaleString('en-SG');
  document.getElementById('last-updated').textContent = 'Last refreshed: ' + now;
  btn.disabled = false;
  btn.textContent = '↻ Refresh prices';

  if (!silent) {
    if (updated > 0) {
      toast('Updated prices for ' + updated + ' card' + (updated > 1 ? 's' : '') + '.', 'success');
    } else {
      toast('No prices could be fetched. Check your PriceCharting URLs.', 'error');
    }
  }
}

init();
