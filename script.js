/* ═══════════════════════════════════════════════════════════════════
   POKEVAULT — script.js  v3.0
   ═══════════════════════════════════════════════════════════════════ */

'use strict';

// ── State ─────────────────────────────────────────────────────────────────
let USD_TO_SGD        = 1.35;
let cards             = [];
let priceChart        = null;
let colorEnabled      = true;
let activeTypeFilter  = '';
let activeSetFilter   = '';
let activeMoversFilter = '';
let searchQuery       = '';
let editingCardId     = null;
let activeCollectionTab = 'active';
let sortCol           = null;
let sortDir           = 1;

// Cached card image state for the current modal
let _currentCardImageUrl    = null;
let _currentCardImageLoaded = false;

// ── Type colour map ───────────────────────────────────────────────────────
const TYPE_COLORS = {
  Fire:      { bg: 'rgba(255,100,50,0.12)',  border: '#ff6432', chart: '#ff6432' },
  Water:     { bg: 'rgba(74,144,217,0.12)',  border: '#4a90d9', chart: '#4a90d9' },
  Grass:     { bg: 'rgba(76,175,80,0.12)',   border: '#4caf50', chart: '#4caf50' },
  Electric:  { bg: 'rgba(255,200,0,0.12)',   border: '#ffc800', chart: '#ffc800' },
  Psychic:   { bg: 'rgba(220,80,160,0.12)',  border: '#dc50a0', chart: '#dc50a0' },
  Fighting:  { bg: 'rgba(192,80,40,0.12)',   border: '#c05028', chart: '#c05028' },
  Dark:      { bg: 'rgba(80,60,120,0.12)',   border: '#503c78', chart: '#8060c0' },
  Steel:     { bg: 'rgba(120,140,160,0.12)', border: '#788ca0', chart: '#788ca0' },
  Dragon:    { bg: 'rgba(40,100,220,0.12)',  border: '#2864dc', chart: '#2864dc' },
  Fairy:     { bg: 'rgba(240,100,180,0.12)', border: '#f064b4', chart: '#f064b4' },
  Normal:    { bg: 'rgba(160,160,120,0.12)', border: '#a0a078', chart: '#a0a078' },
  Colorless: { bg: 'rgba(180,180,180,0.08)', border: '#b4b4b4', chart: '#b4b4b4' },
};

function getTypeColor(type) {
  if (!colorEnabled) return { bg: 'transparent', border: 'var(--border)', chart: 'var(--accent)' };
  return TYPE_COLORS[type] || { bg: 'transparent', border: 'var(--border)', chart: 'var(--accent)' };
}

function toggleColors() {
  colorEnabled = document.getElementById('color-toggle').checked;
  render();
}

// ── Theme ─────────────────────────────────────────────────────────────────
const THEMES = ['dark', 'light', 'dark2', 'lucario'];

function setTheme(theme) {
  document.documentElement.setAttribute('data-theme', theme);
  localStorage.setItem('pv-theme', theme);
  document.querySelectorAll('.theme-option').forEach(btn => {
    btn.classList.toggle('active', btn.getAttribute('data-theme') === theme);
  });
}

(function initTheme() {
  const saved = localStorage.getItem('pv-theme') || 'dark';
  setTheme(THEMES.includes(saved) ? saved : 'dark');
})();

window.addEventListener('scroll', () => {
  const header = document.getElementById('site-header');
  if (header) header.classList.toggle('scrolled', window.scrollY > 20);
});

// ── Exchange rate ─────────────────────────────────────────────────────────
async function fetchExchangeRate() {
  try {
    const res = await fetch('https://api.exchangerate-api.com/v4/latest/USD');
    if (!res.ok) return;
    const data = await res.json();
    if (data.rates?.SGD) {
      USD_TO_SGD = data.rates.SGD;
      const el = document.getElementById('fx-rate');
      if (el) el.textContent = 'USD/SGD: ' + USD_TO_SGD.toFixed(4);
    }
  } catch {
    console.warn('Exchange rate fetch failed — using fallback 1.35');
  }
}

// ── Init / Auth ───────────────────────────────────────────────────────────
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
  const active     = cards.filter(c => !c.sold);
  if (active.length === 0) return;
  const lastRefresh = localStorage.getItem('lastRefresh');
  const oneDayAgo   = Date.now() - 24 * 60 * 60 * 1000;
  if (!lastRefresh || parseInt(lastRefresh, 10) < oneDayAgo) {
    toast('Auto-refreshing prices…', 'info');
    await refreshPrices(true);
  }
}

// ── Utilities ─────────────────────────────────────────────────────────────
function esc(str) {
  return String(str)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;')
    .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function fmt(val) {
  return val != null ? 'SGD $' + Number(val).toFixed(2) : '—';
}

function isSameDay(ts1, ts2) {
  const d1 = new Date(ts1);
  const d2 = new Date(ts2);
  return d1.getFullYear() === d2.getFullYear() &&
         d1.getMonth()    === d2.getMonth()    &&
         d1.getDate()     === d2.getDate();
}

function animateValue(el, target, prefix) {
  const start    = parseFloat(el.getAttribute('data-val') || '0');
  const duration = 600;
  const startTime = performance.now();
  const step = now => {
    const p    = Math.min((now - startTime) / duration, 1);
    const ease = 1 - Math.pow(1 - p, 3);
    el.textContent = prefix + '$' + (start + (target - start) * ease).toFixed(2);
    if (p < 1) {
      requestAnimationFrame(step);
    } else {
      el.textContent = prefix + '$' + target.toFixed(2);
      el.setAttribute('data-val', target);
    }
  };
  requestAnimationFrame(step);
}

function toast(message, type = 'info') {
  const container = document.getElementById('toast-container');
  const el        = document.createElement('div');
  el.className    = 'toast toast-' + type;
  el.textContent  = message;
  container.appendChild(el);
  setTimeout(() => el.classList.add('toast-show'), 10);
  setTimeout(() => {
    el.classList.remove('toast-show');
    setTimeout(() => el.remove(), 300);
  }, 3500);
}

function confirmDialog(message) {
  return new Promise(resolve => {
    document.getElementById('confirm-message').textContent = message;
    const overlay = document.getElementById('confirm-overlay');
    overlay.classList.add('active');
    const ok     = document.getElementById('confirm-ok');
    const cancel = document.getElementById('confirm-cancel');
    function cleanup(result) {
      overlay.classList.remove('active');
      ok.removeEventListener('click', onOk);
      cancel.removeEventListener('click', onCancel);
      resolve(result);
    }
    const onOk     = () => cleanup(true);
    const onCancel = () => cleanup(false);
    ok.addEventListener('click', onOk);
    cancel.addEventListener('click', onCancel);
  });
}

// ── Tab navigation ────────────────────────────────────────────────────────
function switchTab(tab) {
  activeCollectionTab = tab;
  document.getElementById('tab-active').classList.toggle('active', tab === 'active');
  document.getElementById('tab-sold').classList.toggle('active',   tab === 'sold');
  document.getElementById('panel-active').style.display = tab === 'active' ? 'block' : 'none';
  document.getElementById('panel-sold').style.display   = tab === 'sold'   ? 'block' : 'none';
}

function toggleForm() {
  const f = document.getElementById('add-form');
  f.classList.toggle('open');
  if (f.classList.contains('open')) document.getElementById('f-name').focus();
}

// ── Set filter ────────────────────────────────────────────────────────────
function populateSetFilter() {
  const sets    = [...new Set(cards.filter(c => !c.sold && c.set).map(c => c.set))].sort();
  const sel     = document.getElementById('filter-set');
  const current = sel.value;
  sel.innerHTML = '<option value="">All sets</option>' +
    sets.map(s => `<option value="${esc(s)}"${s === current ? ' selected' : ''}>${esc(s)}</option>`).join('');
}

// ── Add card ──────────────────────────────────────────────────────────────
async function addCard() {
  const name         = document.getElementById('f-name').value.trim();
  const set          = document.getElementById('f-set').value.trim();
  const variant      = document.getElementById('f-variant').value.trim();
  const type         = document.getElementById('f-type').value;
  const grade        = document.getElementById('f-grade').value;
  const quantity     = parseInt(document.getElementById('f-quantity').value, 10) || 1;
  const price        = parseFloat(document.getElementById('f-price').value);
  const purchaseDate = document.getElementById('f-purchase-date').value;
  const targetPrice  = parseFloat(document.getElementById('f-target').value) || null;
  const notes        = document.getElementById('f-notes').value.trim();

  if (!name)              { toast('Please enter a card name.', 'error'); return; }
  if (!price || price <= 0) { toast('Please enter a valid purchase price.', 'error'); return; }

  // Build the display name: append variant if provided
  const displayName = variant ? `${name} (${variant})` : name;

  const res = await fetch('/api/cards', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      name: displayName, set, type, grade, quantity,
      purchasePrice: price, purchaseDate, targetPrice, notes,
      currentValue: null, lastUpdated: null, url: '', priceHistory: [],
    }),
  });
  if (!res.ok) { toast('Failed to save card.', 'error'); return; }
  const card = await res.json();
  cards.push(card);
  render();
  toggleForm();
  toast(displayName + ' added to your vault.', 'success');

  // Reset form
  ['f-name', 'f-set', 'f-variant', 'f-notes'].forEach(id => document.getElementById(id).value = '');
  document.getElementById('f-price').value        = '';
  document.getElementById('f-target').value       = '';
  document.getElementById('f-quantity').value     = '1';
  document.getElementById('f-purchase-date').value = '';
  document.getElementById('f-type').value         = '';
  document.getElementById('f-grade').value        = 'raw';
}

// ── Delete card ───────────────────────────────────────────────────────────
async function deleteCard(id) {
  const card      = cards.find(c => c.id === id);
  const confirmed = await confirmDialog('Remove "' + (card ? card.name : 'this card') + '" from your vault?');
  if (!confirmed) return;
  const res = await fetch('/api/cards/' + id, { method: 'DELETE' });
  if (!res.ok) { toast('Failed to delete card.', 'error'); return; }
  cards = cards.filter(c => c.id !== id);
  render();
  toast('Card removed.', 'info');
}

// ── Reset vault ───────────────────────────────────────────────────────────
async function resetVault() {
  const confirmed = await confirmDialog('Delete ALL cards from your vault? This cannot be undone.');
  if (!confirmed) return;
  let failed = 0;
  for (const card of [...cards]) {
    const res = await fetch('/api/cards/' + card.id, { method: 'DELETE' });
    if (!res.ok) failed++;
  }
  if (failed > 0) toast(failed + ' card(s) could not be deleted.', 'error');
  cards = [];
  render();
  toast('Vault reset. All cards removed.', 'info');
}

// ── Edit modal ────────────────────────────────────────────────────────────
function openEditForm(idOverride) {
  const targetId = idOverride || editingCardId;
  if (!targetId) return;
  editingCardId = targetId;
  const card = cards.find(c => c.id === targetId);
  if (!card) return;

  document.getElementById('edit-id').value            = card.id;
  document.getElementById('edit-name').value          = card.name          || '';
  document.getElementById('edit-set').value           = card.set           || '';
  document.getElementById('edit-type').value          = card.type          || '';
  document.getElementById('edit-grade').value         = card.grade         || 'raw';
  document.getElementById('edit-quantity').value      = card.quantity      || 1;
  document.getElementById('edit-price').value         = card.purchasePrice || '';
  document.getElementById('edit-purchase-date').value = card.purchaseDate  || '';
  document.getElementById('edit-target').value        = card.targetPrice   || '';
  document.getElementById('edit-notes').value         = card.notes         || '';
  document.getElementById('edit-url').value           = card.url           || '';

  document.getElementById('modal-overlay').classList.remove('active');
  document.getElementById('edit-overlay').classList.add('active');
}

function closeEditModal() {
  document.getElementById('edit-overlay').classList.remove('active');
}

async function saveEdit() {
  const id          = document.getElementById('edit-id').value;
  const name        = document.getElementById('edit-name').value.trim();
  const set         = document.getElementById('edit-set').value.trim();
  const type        = document.getElementById('edit-type').value;
  const grade       = document.getElementById('edit-grade').value;
  const quantity    = parseInt(document.getElementById('edit-quantity').value, 10) || 1;
  const price       = parseFloat(document.getElementById('edit-price').value);
  const purchaseDate = document.getElementById('edit-purchase-date').value;
  const targetPrice = parseFloat(document.getElementById('edit-target').value) || null;
  const notes       = document.getElementById('edit-notes').value.trim();
  const url         = document.getElementById('edit-url').value.trim();

  if (!name)              { toast('Card name is required.', 'error'); return; }
  if (!price || price <= 0) { toast('Please enter a valid price.', 'error'); return; }

  const res = await fetch('/api/cards/' + id, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name, set, type, grade, quantity, purchasePrice: price, purchaseDate, targetPrice, notes, url }),
  });
  if (!res.ok) { toast('Failed to save changes.', 'error'); return; }
  const idx = cards.findIndex(c => c.id === id);
  if (idx > -1) {
    cards[idx] = { ...cards[idx], name, set, type, grade, quantity, purchasePrice: price, purchaseDate, targetPrice, notes, url };
  }
  closeEditModal();
  render();
  toast('Card updated.', 'success');
}

// ── Sell modal ────────────────────────────────────────────────────────────
function openSellForm() {
  const card = cards.find(c => c.id === editingCardId);
  if (!card) return;
  document.getElementById('sell-id').value    = card.id;
  document.getElementById('sell-price').value = card.currentValue || '';
  document.getElementById('sell-date').value  = new Date().toISOString().split('T')[0];
  document.getElementById('sell-to').value    = '';
  document.getElementById('modal-overlay').classList.remove('active');
  document.getElementById('sell-overlay').classList.add('active');
}

function closeSellModal() {
  document.getElementById('sell-overlay').classList.remove('active');
}

async function confirmSell() {
  const id        = document.getElementById('sell-id').value;
  const soldPrice = parseFloat(document.getElementById('sell-price').value);
  const soldDate  = document.getElementById('sell-date').value;
  const soldTo    = document.getElementById('sell-to').value.trim();
  if (!soldPrice || soldPrice <= 0) { toast('Please enter a valid sale price.', 'error'); return; }
  const res = await fetch('/api/cards/' + id, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ sold: true, soldPrice, soldDate, soldTo }),
  });
  if (!res.ok) { toast('Failed to mark as sold.', 'error'); return; }
  const idx = cards.findIndex(c => c.id === id);
  if (idx > -1) cards[idx] = { ...cards[idx], sold: true, soldPrice, soldDate, soldTo };
  closeSellModal();
  render();
  toast('Card marked as sold.', 'success');
}

// ── Manual price modal ────────────────────────────────────────────────────
function openManualPrice() {
  const card = cards.find(c => c.id === editingCardId);
  if (!card) return;
  document.getElementById('manual-price-id').value  = card.id;
  document.getElementById('manual-price-val').value = card.currentValue || '';
  document.getElementById('modal-overlay').classList.remove('active');
  document.getElementById('manual-price-overlay').classList.add('active');
  setTimeout(() => document.getElementById('manual-price-val').focus(), 100);
}

function closeManualPriceModal() {
  document.getElementById('manual-price-overlay').classList.remove('active');
}

async function saveManualPrice() {
  const id  = document.getElementById('manual-price-id').value;
  const val = parseFloat(document.getElementById('manual-price-val').value);
  if (!val || val <= 0) { toast('Please enter a valid price.', 'error'); return; }
  const idx = cards.findIndex(c => c.id === id);
  if (idx < 0) return;
  const now     = Date.now();
  const history = [...(cards[idx].priceHistory || [])];
  const last    = history[history.length - 1];
  if (!last || !isSameDay(last.date, now)) {
    history.push({ date: now, value: val });
  } else {
    history[history.length - 1] = { date: now, value: val };
  }
  const res = await fetch('/api/cards/' + id, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ currentValue: val, lastUpdated: now, priceHistory: history }),
  });
  if (!res.ok) { toast('Failed to save price.', 'error'); return; }
  cards[idx] = { ...cards[idx], currentValue: val, lastUpdated: now, priceHistory: history };
  closeManualPriceModal();
  render();
  toast('Price updated manually.', 'success');
}

// ── Filters & search ──────────────────────────────────────────────────────
function applyFilter() {
  activeTypeFilter   = document.getElementById('filter-type').value;
  activeSetFilter    = document.getElementById('filter-set').value;
  activeMoversFilter = document.getElementById('filter-movers').value;
  render();
}

function applySearch() {
  searchQuery = document.getElementById('search-input').value.trim().toLowerCase();
  render();
}

function getFilteredCards() {
  let filtered = cards.filter(c => !c.sold);
  if (searchQuery) {
    filtered = filtered.filter(c =>
      c.name.toLowerCase().includes(searchQuery) ||
      (c.set || '').toLowerCase().includes(searchQuery)
    );
  }
  if (activeTypeFilter) filtered = filtered.filter(c => c.type === activeTypeFilter);
  if (activeSetFilter)  filtered = filtered.filter(c => c.set  === activeSetFilter);
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

// ── Sort ──────────────────────────────────────────────────────────────────
function sortBy(col) {
  sortDir = sortCol === col ? -sortDir : 1;
  sortCol = col;
  render();
}

function getSortedCards(list) {
  if (!sortCol) return list;
  return [...list].sort((a, b) => {
    let aVal, bVal;
    switch (sortCol) {
      case 'name':          aVal = a.name.toLowerCase();            bVal = b.name.toLowerCase();            break;
      case 'set':           aVal = (a.set || '').toLowerCase();     bVal = (b.set || '').toLowerCase();     break;
      case 'purchasePrice': aVal = Number(a.purchasePrice);         bVal = Number(b.purchasePrice);         break;
      case 'currentValue':  aVal = Number(a.currentValue  || 0);    bVal = Number(b.currentValue  || 0);    break;
      case 'profit':
        aVal = a.currentValue != null ? Number(a.currentValue) - Number(a.purchasePrice) : -Infinity;
        bVal = b.currentValue != null ? Number(b.currentValue) - Number(b.purchasePrice) : -Infinity;
        break;
      case 'lastUpdated':   aVal = a.lastUpdated || 0;              bVal = b.lastUpdated || 0;              break;
      default: return 0;
    }
    if (aVal < bVal) return -1 * sortDir;
    if (aVal > bVal) return  1 * sortDir;
    return 0;
  });
}

// ── CSV Export ────────────────────────────────────────────────────────────
function exportCSV() {
  const all = [...cards.filter(c => !c.sold), ...cards.filter(c => c.sold)];
  if (all.length === 0) { toast('No cards to export.', 'info'); return; }

  const headers = ['Name','Set','Type','Grade','Quantity','Purchase Price (SGD)','Current Value (SGD)','P/L (SGD)','Purchase Date','Target Price','Notes','Status','Sold Price','Sold Date','Sold To'];
  const rows = all.map(c => {
    const cost = Number(c.purchasePrice) * (c.quantity || 1);
    const val  = c.sold
      ? Number(c.soldPrice || 0) * (c.quantity || 1)
      : (c.currentValue != null ? Number(c.currentValue) * (c.quantity || 1) : '');
    const pl   = c.sold
      ? ((Number(c.soldPrice || 0) - Number(c.purchasePrice)) * (c.quantity || 1)).toFixed(2)
      : (c.currentValue != null ? ((Number(c.currentValue) - Number(c.purchasePrice)) * (c.quantity || 1)).toFixed(2) : '');
    return [
      c.name, c.set || '', c.type || '', c.grade || '', c.quantity || 1,
      cost.toFixed(2), val !== '' ? Number(val).toFixed(2) : '', pl,
      c.purchaseDate || '', c.targetPrice || '', c.notes || '',
      c.sold ? 'Sold' : 'Active',
      c.sold ? (c.soldPrice || '') : '',
      c.sold ? (c.soldDate  || '') : '',
      c.sold ? (c.soldTo    || '') : '',
    ].map(v => '"' + String(v).replace(/"/g, '""') + '"');
  });

  const csv  = [headers.map(h => '"' + h + '"').join(','), ...rows.map(r => r.join(','))].join('\n');
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url  = URL.createObjectURL(blob);
  const a    = Object.assign(document.createElement('a'), { href: url, download: 'pokevault-' + new Date().toISOString().split('T')[0] + '.csv' });
  a.click();
  URL.revokeObjectURL(url);
  toast('Collection exported.', 'success');
}

// ── TCG API helpers ───────────────────────────────────────────────────────
/**
 * Build a sanitised query term for the Pokemon TCG API.
 * Handles apostrophes in names like "Misty's Psyduck" correctly,
 * and supports promo-variant lookups.
 */
function sanitiseName(name) {
  // Remove everything after the first '(' so variant suffixes don't break the API query
  const base = name.replace(/\s*\(.*$/, '').trim();
  // Escape apostrophes by removing them (the API uses them as query syntax)
  return base.replace(/'/g, '').replace(/"/g, '').trim();
}

function sanitiseSet(set) {
  return (set || '').replace(/'/g, '').replace(/"/g, '').trim();
}

/**
 * Extract a variant hint from the stored card name.
 * e.g. "Charmander (Pokemon Center)" => "Pokemon Center"
 *      "Charmander (086/197)"         => "086/197"
 */
function extractVariant(name) {
  const m = name.match(/\(([^)]+)\)/);
  return m ? m[1].trim() : null;
}

/**
 * Score a TCG API result against a stored card, taking into account
 * the set name, card number / variant, and promo hints.
 */
function scoreResult(result, card) {
  const cardNameLower = sanitiseName(card.name).toLowerCase();
  const cardSetLower  = sanitiseSet(card.set).toLowerCase();
  const variant       = extractVariant(card.name);
  const rSetLower     = (result.set?.name || '').toLowerCase();
  const rNum          = (result.number   || '').toLowerCase();
  let score = 0;

  // Name match
  if (result.name?.toLowerCase() === cardNameLower) score += 10;
  else if (result.name?.toLowerCase().includes(cardNameLower)) score += 4;

  // Set match
  if (cardSetLower) {
    if (rSetLower === cardSetLower)                                        score += 6;
    else if (rSetLower.includes(cardSetLower) || cardSetLower.includes(rSetLower)) score += 3;
    const firstWord = cardSetLower.split(' ')[0];
    if (firstWord.length > 2 && rSetLower.includes(firstWord))            score += 1;
  }

  // Variant / promo number match (e.g. "086/197" or "Pokemon Center")
  if (variant) {
    const varLower = variant.toLowerCase();
    if (rNum && rNum === varLower)                                         score += 8;
    else if (rNum && rNum.includes(varLower))                             score += 4;
    // Promo flavour text in set name (e.g. "Pokemon Center")
    if (rSetLower.includes(varLower))                                     score += 5;
  }

  return score;
}

const PRICE_KEY_ORDER = ['holofoil','1stEditionHolofoil','normal','reverseHolofoil','unlimited','1stEdition'];

function extractPrice(prices) {
  if (!prices) return null;
  for (const key of PRICE_KEY_ORDER) {
    if (prices[key]?.market) return prices[key].market;
  }
  for (const key of Object.keys(prices)) {
    if (prices[key]?.market) return prices[key].market;
  }
  return null;
}

function applyGradeMultiplier(baseUSD, grade) {
  const g = (grade || 'raw').toLowerCase();
  if (g === 'psa 10' || g === 'bgs 10')   return baseUSD * 3.5;
  if (g === 'psa 9'  || g === 'bgs 9.5')  return baseUSD * 1.5;
  if (g === 'psa 8'  || g === 'bgs 9')    return baseUSD * 1.2;
  if (g === 'psa 7')                       return baseUSD * 1.05;
  return baseUSD;
}

/**
 * Query the Pokemon TCG API.
 * Tries three strategies in order:
 *   1. name + full set name (exact)
 *   2. name + first word of set name (wildcard)
 *   3. name only (broadest)
 */
async function queryTCG(namePart, setSanitized, fields = 'name,set,number,tcgplayer') {
  const base = 'https://api.pokemontcg.io/v2/cards';
  const queries = [];

  if (setSanitized) {
    queries.push(`name:"${namePart}" set.name:"${setSanitized}"`);
    const firstWord = setSanitized.split(' ')[0];
    if (firstWord.length > 2) {
      queries.push(`name:"${namePart}" set.name:${firstWord}*`);
    }
  }
  queries.push(`name:"${namePart}"`);

  for (const q of queries) {
    const url = `${base}?q=${encodeURIComponent(q)}&select=${fields}&orderBy=-set.releaseDate&pageSize=30`;
    try {
      const res  = await fetch(url);
      if (!res.ok) continue;
      const data = await res.json();
      if (data.data?.length) return data.data;
    } catch { /* continue to next query */ }
  }
  return [];
}

// ── Price fetching ────────────────────────────────────────────────────────
async function fetchPrice(card) {
  try {
    const namePart    = sanitiseName(card.name);
    const setSanitized = sanitiseSet(card.set);
    const results     = await queryTCG(namePart, setSanitized, 'name,set,number,tcgplayer');
    if (!results.length) return null;

    const scored = results
      .map(r => ({ ...r, _score: scoreResult(r, card) }))
      .sort((a, b) => b._score - a._score);

    for (const match of scored) {
      const base = extractPrice(match.tcgplayer?.prices);
      if (base == null) continue;
      const priceUSD = applyGradeMultiplier(base, card.grade);
      return Math.round(priceUSD * USD_TO_SGD * 100) / 100;
    }
    return null;
  } catch (e) {
    console.error('fetchPrice error for ' + card.name, e);
    return null;
  }
}

async function refreshPrices(silent = false) {
  const active = cards.filter(c => !c.sold);
  if (active.length === 0) { if (!silent) toast('No cards to refresh.', 'info'); return; }
  const btn     = document.querySelector('.btn-refresh');
  btn.disabled  = true;
  btn.textContent = '↻ Fetching…';
  let updated   = 0;

  for (let i = 0; i < active.length; i++) {
    try {
      const price = await fetchPrice(active[i]);
      if (price != null) {
        const now = Date.now();
        const idx = cards.findIndex(c => c.id === active[i].id);
        if (idx < 0) continue;
        const history = [...(cards[idx].priceHistory || [])];
        const last    = history[history.length - 1];
        if (!last || !isSameDay(last.date, now)) history.push({ date: now, value: price });
        else history[history.length - 1] = { date: now, value: price };

        cards[idx] = { ...cards[idx], currentValue: price, lastUpdated: now, priceHistory: history };
        await fetch('/api/cards/' + cards[idx].id, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ currentValue: price, lastUpdated: now, priceHistory: history }),
        });
        updated++;
      }
    } catch (e) {
      console.error('Refresh failed for ' + active[i].name, e);
    }
    await new Promise(r => setTimeout(r, 300));
  }

  localStorage.setItem('lastRefresh', Date.now().toString());
  render();
  const el = document.getElementById('last-updated');
  if (el) el.textContent = 'Last refreshed: ' + new Date().toLocaleString('en-SG') + ' · USD/SGD: ' + USD_TO_SGD.toFixed(4);
  btn.disabled    = false;
  btn.textContent = '↻ Refresh prices';
  if (!silent) {
    if (updated > 0) toast('Updated ' + updated + ' card' + (updated !== 1 ? 's' : '') + '.', 'success');
    else toast('No prices found. Try setting values manually.', 'error');
  }
}

// ── Card image fetching ───────────────────────────────────────────────────
async function fetchCardImage(card) {
  try {
    const namePart     = sanitiseName(card.name);
    const setSanitized = sanitiseSet(card.set);
    const results      = await queryTCG(namePart, setSanitized, 'name,set,number,images');
    if (!results.length) return null;

    const scored = results
      .map(r => ({ ...r, _score: scoreResult(r, card) }))
      .sort((a, b) => b._score - a._score);

    for (const match of scored) {
      const img = match.images?.large || match.images?.small;
      if (img) return img;
    }
    return null;
  } catch (e) {
    console.warn('fetchCardImage error:', e);
    return null;
  }
}

// ── Modal image tab ───────────────────────────────────────────────────────
function switchModalTab(tab) {
  document.getElementById('modal-panel-info').style.display  = tab === 'info'  ? 'block' : 'none';
  document.getElementById('modal-panel-image').style.display = tab === 'image' ? 'block' : 'none';
  document.getElementById('modal-tab-info').classList.toggle('active',  tab === 'info');
  document.getElementById('modal-tab-image').classList.toggle('active', tab === 'image');
  if (tab === 'image') _showImageTab();
}

function _showImageTab() {
  const loadingEl  = document.getElementById('modal-image-loading');
  const foundEl    = document.getElementById('modal-image-found');
  const notFoundEl = document.getElementById('modal-image-notfound');
  const largeImg   = document.getElementById('modal-card-image-large');

  if (_currentCardImageLoaded && _currentCardImageUrl) {
    loadingEl.style.display  = 'none';
    foundEl.style.display    = 'block';
    notFoundEl.style.display = 'none';
    if (largeImg.src !== _currentCardImageUrl) largeImg.src = _currentCardImageUrl;
  } else if (_currentCardImageLoaded && !_currentCardImageUrl) {
    loadingEl.style.display  = 'none';
    foundEl.style.display    = 'none';
    notFoundEl.style.display = 'flex';
  } else {
    loadingEl.style.display  = 'flex';
    foundEl.style.display    = 'none';
    notFoundEl.style.display = 'none';
  }
}

// ── Card detail modal ─────────────────────────────────────────────────────
async function openCard(id) {
  const card = cards.find(c => c.id === id);
  if (!card) return;
  editingCardId = id;
  _currentCardImageUrl    = null;
  _currentCardImageLoaded = false;

  const cost   = Number(card.purchasePrice);
  const val    = card.currentValue != null ? Number(card.currentValue) : null;
  const profit = val != null ? (val - cost) * (card.quantity || 1) : null;
  const colors = getTypeColor(card.type);

  const typeBar = document.getElementById('modal-type-bar');
  if (typeBar) typeBar.style.background = colors.border;

  document.getElementById('modal-name').textContent = card.name + (card.quantity > 1 ? ' ×' + card.quantity : '');
  document.getElementById('modal-meta').textContent = (card.set || 'Unknown set') + (card.type ? ' · ' + card.type : '');

  const gradeEl       = document.getElementById('modal-grade');
  gradeEl.textContent = card.grade;
  gradeEl.className   = 'badge ' + (card.grade === 'raw' ? 'badge-raw' : 'badge-psa');

  document.getElementById('modal-cost').textContent  = 'SGD $' + (cost * (card.quantity || 1)).toFixed(2);
  document.getElementById('modal-value').textContent = val != null ? 'SGD $' + (val * (card.quantity || 1)).toFixed(2) : '—';

  const profitEl = document.getElementById('modal-profit');
  if (profit != null) {
    profitEl.textContent = (profit >= 0 ? '↑ +' : '↓ ') + 'SGD $' + Math.abs(profit).toFixed(2);
    profitEl.className   = 'modal-stat-value ' + (profit >= 0 ? 'profit-pos' : 'profit-neg');
  } else {
    profitEl.textContent = '—';
    profitEl.className   = 'modal-stat-value';
  }

  document.getElementById('modal-updated').textContent       = card.lastUpdated ? new Date(card.lastUpdated).toLocaleDateString('en-SG') : '—';
  document.getElementById('modal-purchase-date').textContent = card.purchaseDate || '—';

  const targetEl = document.getElementById('modal-target');
  if (card.targetPrice) {
    const hit = val != null && val >= card.targetPrice;
    targetEl.textContent = 'SGD $' + Number(card.targetPrice).toFixed(2) + (hit ? ' ✓ Target reached!' : '');
    targetEl.style.color = hit ? 'var(--green)' : '';
  } else {
    targetEl.textContent = '—';
    targetEl.style.color = '';
  }

  const notesWrap = document.getElementById('modal-notes-wrap');
  if (card.notes) {
    notesWrap.style.display = 'block';
    document.getElementById('modal-notes').textContent = card.notes;
  } else {
    notesWrap.style.display = 'none';
  }

  document.getElementById('modal-image-caption').textContent = card.name + (card.set ? ' — ' + card.set : '');

  switchModalTab('info');
  document.getElementById('modal-overlay').classList.add('active');

  // Fetch image asynchronously
  fetchCardImage(card).then(imgUrl => {
    _currentCardImageUrl    = imgUrl || null;
    _currentCardImageLoaded = true;
    const imagePanel = document.getElementById('modal-panel-image');
    if (imagePanel?.style.display !== 'none') _showImageTab();
  });

  // Price history chart
  const history        = card.priceHistory || [];
  const emptyEl        = document.getElementById('modal-chart-empty');
  const chartContainer = document.querySelector('.modal-chart-container');

  if (history.length < 2) {
    emptyEl.style.display       = 'block';
    chartContainer.style.display = 'none';
  } else {
    emptyEl.style.display       = 'none';
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
          fill: true,
        }],
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
            callbacks: { label: ctx => 'SGD $' + Number(ctx.raw).toFixed(2) },
          },
        },
        scales: {
          y: { ticks: { callback: v => '$' + v, font: { size: 11, family: 'DM Mono' }, color: 'var(--text3)' }, grid: { color: 'var(--border)' }, border: { display: false } },
          x: { ticks: { font: { size: 11, family: 'DM Mono' }, color: 'var(--text3)' }, grid: { display: false }, border: { display: false } },
        },
      },
    });
  }
}

function closeModal(e) {
  if (e && e.target !== document.getElementById('modal-overlay')) return;
  document.getElementById('modal-overlay').classList.remove('active');
  if (priceChart) { priceChart.destroy(); priceChart = null; }
  _currentCardImageUrl    = null;
  _currentCardImageLoaded = false;
}

document.addEventListener('keydown', e => {
  if (e.key !== 'Escape') return;
  ['modal-overlay','confirm-overlay','edit-overlay','sell-overlay','manual-price-overlay'].forEach(id => {
    document.getElementById(id)?.classList.remove('active');
  });
  if (priceChart) { priceChart.destroy(); priceChart = null; }
});

// ── Movers ────────────────────────────────────────────────────────────────
function renderMovers() {
  const priced = cards.filter(c => !c.sold && c.currentValue != null);
  const section = document.getElementById('movers-section');
  if (priced.length < 2) { section.style.display = 'none'; return; }
  section.style.display = 'block';

  const sorted = [...priced].sort((a, b) => {
    const aPct = (Number(a.currentValue) - Number(a.purchasePrice)) / Number(a.purchasePrice);
    const bPct = (Number(b.currentValue) - Number(b.purchasePrice)) / Number(b.purchasePrice);
    return bPct - aPct;
  });

  const moverCard = c => {
    const profit = Number(c.currentValue) - Number(c.purchasePrice);
    const pct    = (profit / Number(c.purchasePrice)) * 100;
    const pos    = profit >= 0;
    const colors = getTypeColor(c.type);
    return '<div class="mover-card" style="border-left:3px solid ' + colors.border + ';" onclick="openCard(\'' + c.id + '\')">' +
      '<div style="overflow:hidden;"><div class="mover-name">' + esc(c.name) + '</div><div class="mover-set">' + esc(c.set || '—') + '</div></div>' +
      '<div class="mover-value ' + (pos ? 'profit-pos' : 'profit-neg') + '">' +
        (pos ? '↑' : '↓') + ' ' + Math.abs(pct).toFixed(1) + '%' +
        '<span class="mover-sgd">' + (pos ? '+' : '-') + 'SGD $' + Math.abs(profit).toFixed(2) + '</span>' +
      '</div></div>';
  };

  document.getElementById('movers-gainers').innerHTML = sorted.slice(0, 3).map(moverCard).join('');
  document.getElementById('movers-losers').innerHTML  = sorted.slice(-3).reverse().map(moverCard).join('');
}

function checkTargetAlerts() {
  cards
    .filter(c => !c.sold && c.targetPrice && c.currentValue != null && Number(c.currentValue) >= Number(c.targetPrice))
    .forEach(c => toast('🎯 ' + c.name + ' hit your target of SGD $' + Number(c.targetPrice).toFixed(2) + '!', 'success'));
}

// ── Summary ───────────────────────────────────────────────────────────────
function updateSummary() {
  const active   = cards.filter(c => !c.sold);
  const sold     = cards.filter(c =>  c.sold);
  const count    = active.reduce((s, c) => s + (c.quantity || 1), 0);
  const cost     = active.reduce((s, c) => s + Number(c.purchasePrice) * (c.quantity || 1), 0);
  const value    = active.reduce((s, c) => s + (c.currentValue != null ? Number(c.currentValue) : Number(c.purchasePrice)) * (c.quantity || 1), 0);
  const profit   = value - cost;
  const realised = sold.reduce((s, c) => s + (c.soldPrice ? (Number(c.soldPrice) - Number(c.purchasePrice)) * (c.quantity || 1) : 0), 0);

  document.getElementById('s-count').textContent = count;
  animateValue(document.getElementById('s-cost'),  cost,  'SGD ');
  animateValue(document.getElementById('s-value'), value, 'SGD ');
  const headerVal = document.getElementById('header-value');
  if (headerVal) animateValue(headerVal, value, 'SGD ');

  const pel = document.getElementById('s-profit');
  pel.textContent = (profit >= 0 ? '↑ +SGD $' : '↓ -SGD $') + Math.abs(profit).toFixed(2);
  pel.className   = 'metric-value ' + (profit >= 0 ? 'pos' : 'neg');

  const rel = document.getElementById('s-realised');
  rel.textContent = (realised >= 0 ? '+SGD $' : '-SGD $') + Math.abs(realised).toFixed(2);
  rel.className   = 'metric-value ' + (realised >= 0 ? 'pos' : 'neg');

  const profitCard = document.querySelector('.profit-card');
  const profitIcon = document.getElementById('profit-icon');
  profitCard?.classList.toggle('pos', profit >= 0);
  profitCard?.classList.toggle('neg', profit  < 0);
  if (profitIcon) profitIcon.textContent = profit >= 0 ? '💰' : '📉';
}

// ── Render ────────────────────────────────────────────────────────────────
function render() {
  populateSetFilter();
  const tbody    = document.getElementById('card-table');
  const cardList = document.getElementById('card-list');
  const filtered = getFilteredCards();
  const sorted   = getSortedCards(filtered);
  const soldCards = cards.filter(c => c.sold);

  // ── Active cards ──
  if (cards.filter(c => !c.sold).length === 0) {
    tbody.innerHTML    = '<tr><td colspan="11"><div class="empty-state">Your vault is empty — add your first card to get started</div></td></tr>';
    cardList.innerHTML = '<div class="empty-state">Your vault is empty — add your first card to get started</div>';
  } else if (sorted.length === 0) {
    tbody.innerHTML    = '<tr><td colspan="11"><div class="empty-state">No cards match your filters</div></td></tr>';
    cardList.innerHTML = '<div class="empty-state">No cards match your filters</div>';
  } else {
    tbody.innerHTML = sorted.map(c => {
      const cost        = Number(c.purchasePrice) * (c.quantity || 1);
      const val         = c.currentValue != null ? Number(c.currentValue) * (c.quantity || 1) : null;
      const profit      = val != null ? val - cost : null;
      const profitStr   = profit != null ? (profit >= 0 ? '↑ +' : '↓ ') + 'SGD $' + Math.abs(profit).toFixed(2) : '—';
      const profitClass = profit == null ? '' : profit >= 0 ? 'profit-pos' : 'profit-neg';
      const gradeClass  = c.grade === 'raw' ? 'badge-raw' : 'badge-psa';
      const updated     = c.lastUpdated ? new Date(c.lastUpdated).toLocaleDateString('en-SG') : '—';
      const colors      = getTypeColor(c.type);
      const typeBadge   = c.type
        ? `<span class="type-badge" style="background:${colors.bg}; color:${colors.border}; border:1px solid ${colors.border};">${esc(c.type)}</span>`
        : '<span class="type-badge type-unknown">—</span>';
      const targetHit = c.targetPrice && c.currentValue != null && Number(c.currentValue) >= Number(c.targetPrice);
      const rowStyle  = 'border-left:3px solid ' + colors.border + (targetHit ? '; box-shadow:inset 0 0 0 1px rgba(76,175,125,0.2);' : '') + ';';
      return `<tr class="card-row${targetHit ? ' target-hit' : ''}" onclick="openCard('${c.id}')" style="${rowStyle}">` +
        `<td title="${esc(c.name)}" style="font-weight:600;">${esc(c.name)}${targetHit ? ' <span style="color:var(--green);font-size:11px;">🎯</span>' : ''}</td>` +
        `<td title="${esc(c.set || '—')}" style="color:var(--text2);">${esc(c.set || '—')}</td>` +
        `<td>${typeBadge}</td>` +
        `<td><span class="badge ${gradeClass}">${esc(c.grade)}</span></td>` +
        `<td style="font-family:var(--font-mono); color:var(--text2);">×${c.quantity || 1}</td>` +
        `<td style="font-family:var(--font-mono);">$${cost.toFixed(2)}</td>` +
        `<td style="font-family:var(--font-mono);">${val != null ? '$' + val.toFixed(2) : '<span style="color:var(--text3);">—</span>'}</td>` +
        `<td class="${profitClass}" style="font-family:var(--font-mono); font-weight:600;">${profitStr}</td>` +
        `<td style="color:var(--text3); font-family:var(--font-mono); font-size:12px;">${updated}</td>` +
        `<td><button class="btn-row-edit" onclick="event.stopPropagation(); openEditForm('${c.id}')" title="Edit">✎</button></td>` +
        `<td><button class="del-btn" onclick="event.stopPropagation(); deleteCard('${c.id}')" title="Delete">✕</button></td>` +
        '</tr>';
    }).join('');

    cardList.innerHTML = sorted.map(c => {
      const cost        = Number(c.purchasePrice) * (c.quantity || 1);
      const val         = c.currentValue != null ? Number(c.currentValue) * (c.quantity || 1) : null;
      const profit      = val != null ? val - cost : null;
      const profitStr   = profit != null ? (profit >= 0 ? '↑ +' : '↓ -') + 'SGD $' + Math.abs(profit).toFixed(2) : '—';
      const profitClass = profit == null ? '' : profit >= 0 ? 'profit-pos' : 'profit-neg';
      const gradeClass  = c.grade === 'raw' ? 'badge-raw' : 'badge-psa';
      const colors      = getTypeColor(c.type);
      const targetHit   = c.targetPrice && c.currentValue != null && Number(c.currentValue) >= Number(c.targetPrice);
      return `<div class="mobile-card${targetHit ? ' target-hit' : ''}" style="border-left:3px solid ${colors.border};" onclick="openCard('${c.id}')">` +
        '<div class="mobile-card-top">' +
          `<div><div class="mobile-card-name">${esc(c.name)}${targetHit ? ' 🎯' : ''}</div>` +
          `<div class="mobile-card-set">${esc(c.set || '—')} · <span class="badge ${gradeClass}">${esc(c.grade)}</span>${c.quantity > 1 ? ' ×' + c.quantity : ''}</div></div>` +
          '<div style="display:flex;gap:8px;align-items:center;">' +
            `<button class="mobile-card-delete" onclick="event.stopPropagation(); openEditForm('${c.id}')" title="Edit" style="font-size:14px;">✎</button>` +
            `<button class="mobile-card-delete" onclick="event.stopPropagation(); deleteCard('${c.id}')" title="Delete">✕</button>` +
          '</div>' +
        '</div>' +
        '<div class="mobile-card-bottom">' +
          `<div class="mobile-card-price">Paid: SGD $${cost.toFixed(2)}<br>Value: ${fmt(val)}</div>` +
          `<div class="mobile-card-profit ${profitClass}">${profitStr}</div>` +
        '</div></div>';
    }).join('');
  }

  // ── Sold cards ──
  const soldTbody = document.getElementById('sold-table');
  const soldList  = document.getElementById('sold-list');
  if (soldCards.length === 0) {
    soldTbody.innerHTML = '<tr><td colspan="9"><div class="empty-state">No sold cards yet</div></td></tr>';
    soldList.innerHTML  = '<div class="empty-state">No sold cards yet</div>';
  } else {
    soldTbody.innerHTML = soldCards.map(c => {
      const profit      = c.soldPrice ? (Number(c.soldPrice) - Number(c.purchasePrice)) * (c.quantity || 1) : null;
      const profitStr   = profit != null ? (profit >= 0 ? '↑ +' : '↓ ') + 'SGD $' + Math.abs(profit).toFixed(2) : '—';
      const profitClass = profit == null ? '' : profit >= 0 ? 'profit-pos' : 'profit-neg';
      return '<tr>' +
        `<td style="font-weight:600;">${esc(c.name)}</td>` +
        `<td style="color:var(--text2);">${esc(c.set || '—')}</td>` +
        `<td><span class="badge ${c.grade === 'raw' ? 'badge-raw' : 'badge-psa'}">${esc(c.grade)}</span></td>` +
        `<td style="font-family:var(--font-mono);">$${(Number(c.purchasePrice) * (c.quantity || 1)).toFixed(2)}</td>` +
        `<td style="font-family:var(--font-mono);">${c.soldPrice ? '$' + Number(c.soldPrice).toFixed(2) : '—'}</td>` +
        `<td class="${profitClass}" style="font-family:var(--font-mono); font-weight:600;">${profitStr}</td>` +
        `<td style="color:var(--text3); font-family:var(--font-mono); font-size:12px;">${c.soldDate || '—'}</td>` +
        `<td style="color:var(--text2); font-size:12px;">${esc(c.soldTo || '—')}</td>` +
        `<td><button class="del-btn" onclick="deleteCard('${c.id}')" title="Delete">✕</button></td>` +
        '</tr>';
    }).join('');

    soldList.innerHTML = soldCards.map(c => {
      const profit      = c.soldPrice ? (Number(c.soldPrice) - Number(c.purchasePrice)) * (c.quantity || 1) : null;
      const profitStr   = profit != null ? (profit >= 0 ? '+' : '') + 'SGD $' + profit.toFixed(2) : '—';
      const profitClass = profit == null ? '' : profit >= 0 ? 'profit-pos' : 'profit-neg';
      return '<div class="mobile-card">' +
        '<div class="mobile-card-top">' +
          `<div><div class="mobile-card-name">${esc(c.name)}</div>` +
          `<div class="mobile-card-set">${esc(c.set || '—')} · sold ${c.soldDate || '—'}</div></div>` +
        '</div>' +
        '<div class="mobile-card-bottom">' +
          `<div class="mobile-card-price">Paid: SGD $${Number(c.purchasePrice).toFixed(2)}<br>Sold: ${c.soldPrice ? 'SGD $' + Number(c.soldPrice).toFixed(2) : '—'}</div>` +
          `<div class="mobile-card-profit ${profitClass}">${profitStr}</div>` +
        '</div></div>';
    }).join('');
  }

  updateSummary();
  renderMovers();
  checkTargetAlerts();
}

// ── Bootstrap ─────────────────────────────────────────────────────────────
init();
