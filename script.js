const USD_TO_SGD = 1.35;
let cards = [];

async function loadCards() {
  const res = await fetch('/api/cards');
  cards = await res.json();
  render();
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

  if (!name || !price || !url) {
    alert('Please fill in card name, purchase price and URL.');
    return;
  }

  const res = await fetch('/api/cards', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name, set, grade, purchasePrice: price, currentValue: null, lastUpdated: null, url })
  });

  const card = await res.json();
  cards.push(card);
  render();
  toggleForm();

  document.getElementById('f-name').value = '';
  document.getElementById('f-set').value = '';
  document.getElementById('f-url').value = '';
  document.getElementById('f-price').value = '';
  document.getElementById('f-grade').value = 'raw';
}

async function deleteCard(id) {
  if (!confirm('Remove this card?')) return;
  await fetch('/api/cards/' + id, { method: 'DELETE' });
  cards = cards.filter(c => c.id !== id);
  render();
}

function fmt(val) {
  return val != null ? 'SGD $' + val.toFixed(2) : '—';
}

function render() {
  const tbody = document.getElementById('card-table');

  if (cards.length === 0) {
    tbody.innerHTML = '<tr><td colspan="8"><div class="empty-state">No cards yet — add your first card above</div></td></tr>';
    updateSummary();
    return;
  }

  tbody.innerHTML = cards.map(c => {
    const profit = c.currentValue != null ? c.currentValue - c.purchasePrice : null;
    const profitStr = profit != null ? (profit >= 0 ? '+' : '') + 'SGD $' + Math.abs(profit).toFixed(2) : '—';
    const profitClass = profit == null ? '' : profit >= 0 ? 'profit-pos' : 'profit-neg';
    const gradeClass = c.grade === 'raw' ? 'badge-raw' : 'badge-psa';
    const updated = c.lastUpdated ? new Date(c.lastUpdated).toLocaleDateString('en-SG') : '—';

    return '<tr>' +
      '<td title="' + c.name + '">' + c.name + '</td>' +
      '<td title="' + (c.set || '—') + '">' + (c.set || '—') + '</td>' +
      '<td><span class="badge ' + gradeClass + '">' + c.grade + '</span></td>' +
      '<td>SGD $' + c.purchasePrice.toFixed(2) + '</td>' +
      '<td>' + fmt(c.currentValue) + '</td>' +
      '<td class="' + profitClass + '">' + profitStr + '</td>' +
      '<td>' + updated + '</td>' +
      '<td><button class="del-btn" onclick="deleteCard(' + c.id + ')" title="Delete">✕</button></td>' +
    '</tr>';
  }).join('');

  updateSummary();
}

function updateSummary() {
  const count = cards.length;
  const cost = cards.reduce((s, c) => s + c.purchasePrice, 0);
  const value = cards.reduce((s, c) => s + (c.currentValue != null ? c.currentValue : c.purchasePrice), 0);
  const profit = value - cost;

  document.getElementById('s-count').textContent = count;
  document.getElementById('s-cost').textContent = 'SGD $' + cost.toFixed(2);
  document.getElementById('s-value').textContent = 'SGD $' + value.toFixed(2);

  const pel = document.getElementById('s-profit');
  pel.textContent = (profit >= 0 ? '+' : '-') + 'SGD $' + Math.abs(profit).toFixed(2);
  pel.className = 'metric-value ' + (profit >= 0 ? 'pos' : 'neg');
}

async function fetchPrice(card) {
  const urlMatch = card.url.match(/\/([^\/]+)$/);
  if (!urlMatch) return null;

  const numberMatch = urlMatch[1].match(/-(\d+)$/);
  const cardNumber = numberMatch ? numberMatch[1] : null;
  const slug = urlMatch[1].replace(/-\d+$/, '').replace(/-/g, ' ');

  const apiUrl = 'https://api.pokemontcg.io/v2/cards?q=name:%22' + encodeURIComponent(slug) + '%22&select=name,set,number,tcgplayer';
  const res = await fetch(apiUrl);
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

async function refreshPrices() {
  const btn = document.querySelector('.refresh-btn');
  btn.disabled = true;
  btn.textContent = '↻ Fetching...';

  for (let i = 0; i < cards.length; i++) {
    try {
      const price = await fetchPrice(cards[i]);
      if (price) {
        cards[i].currentValue = price;
        cards[i].lastUpdated = Date.now();
        await fetch('/api/cards/' + cards[i].id, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ currentValue: price, lastUpdated: cards[i].lastUpdated })
        });
      }
    } catch (e) {
      console.error('Failed for ' + cards[i].name, e);
    }
    await new Promise(r => setTimeout(r, 1000));
  }

  render();
  document.getElementById('last-updated').textContent = 'Last refreshed: ' + new Date().toLocaleString('en-SG');
  btn.disabled = false;
  btn.textContent = '↻ Refresh prices';
}

loadCards();
