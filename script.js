/* ═══════════════════════════════════════════════════════════════════
   POKEVAULT — script.js  v5.0
   Key changes from v4:
   - Card picker shown BEFORE adding a card (not just for image lookup)
   - Robust multi-word & apostrophe name search (Misty's Psyduck, etc.)
   - Promo card support via wildcard number search
   - Lucario theme removed (dark + light only)
   - Stored imageUrl + tcgId on each card record
   ═══════════════════════════════════════════════════════════════════ */
'use strict';

// ── State ─────────────────────────────────────────────────────────────────
let USD_TO_SGD          = 1.35;
let cards               = [];
let priceChart          = null;
let colorEnabled        = true;
let activeTypeFilter    = '';
let activeSetFilter     = '';
let activeMoversFilter  = '';
let searchQuery         = '';
let editingCardId       = null;
let activeCollectionTab = 'active';
let sortCol             = null;
let sortDir             = 1;

const _alertedTargets = new Set();

// Card detail modal image state
let _cardImageUrl        = null;
let _cardImageLoaded     = false;
let _pendingImageResults = [];
let _pendingImageCard    = null;

// View-picker state (card detail image tab)
let _viewPickerResults  = [];
let _viewPickerCallback = null;
let _viewPickerAll      = [];   // unfiltered list for search

// Add-card picker state
let _addPickerResults   = [];   // all TCG results
let _addPickerFiltered  = [];   // after search filter
let _addPickerSelected  = null; // chosen TCG result object
let _pendingAddPayload  = null; // form values waiting for picker confirmation

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
const THEMES = ['dark', 'light'];

function setTheme(theme) {
  if (!THEMES.includes(theme)) theme = 'dark';
  document.documentElement.setAttribute('data-theme', theme);
  localStorage.setItem('pv-theme', theme);
  document.querySelectorAll('.theme-option').forEach(btn => {
    btn.classList.toggle('active', btn.getAttribute('data-theme') === theme);
  });
}

(function initTheme() {
  let saved = localStorage.getItem('pv-theme') || 'dark';
  // Migrate legacy values
  if (!THEMES.includes(saved)) saved = 'dark';
  setTheme(saved);
})();

window.addEventListener('scroll', () => {
  document.getElementById('site-header')?.classList.toggle('scrolled', window.scrollY > 20);
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
  if (!cards.filter(c => !c.sold).length) return;
  const last      = localStorage.getItem('lastRefresh');
  const oneDayAgo = Date.now() - 24 * 60 * 60 * 1000;
  if (!last || parseInt(last, 10) < oneDayAgo) {
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
  const a = new Date(ts1), b = new Date(ts2);
  return a.getFullYear() === b.getFullYear() &&
         a.getMonth()    === b.getMonth()    &&
         a.getDate()     === b.getDate();
}

function animateValue(el, target, prefix) {
  const start    = parseFloat(el.getAttribute('data-val') || '0');
  const duration = 600;
  const t0       = performance.now();
  const step = now => {
    const p    = Math.min((now - t0) / duration, 1);
    const ease = 1 - Math.pow(1 - p, 3);
    el.textContent = prefix + '$' + (start + (target - start) * ease).toFixed(2);
    if (p < 1) requestAnimationFrame(step);
    else { el.textContent = prefix + '$' + target.toFixed(2); el.setAttribute('data-val', target); }
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

// ── TCG API helpers ───────────────────────────────────────────────────────

/**
 * Build search-safe name queries from a raw card name.
 *
 * Rules:
 * - Apostrophes (') are TCG API query operators and must be removed entirely
 *   rather than encoded — "Misty's" → "Mistys"
 * - Multi-word names are supported natively; we do NOT quote the name since
 *   the API treats the whole value as a substring match when unquoted
 * - We produce multiple query variants to maximise hit rate:
 *     1. Exact quoted match (works for single-word names, e.g. "Charmander")
 *     2. Unquoted for multi-word names (e.g. Misty Psyduck)
 *     3. First-word wildcard for partial/promo variants
 */
function buildNameQueries(rawName) {
  // Strip parenthesised variant suffix first: "Charmander (Pokemon Center)" → "Charmander"
  const base = rawName.replace(/\s*\(.*$/, '').trim();
  // Remove apostrophes — they are query operators in the TCG API
  const clean = base.replace(/['"]/g, '').trim();
  const queries = [];

  // 1. Exact quoted match (best for single-word names)
  queries.push(`name:"${clean}"`);

  // 2. Unquoted multi-word match (better for "Origin Forme Palkia", "Misty Psyduck")
  if (clean.includes(' ')) {
    queries.push(`name:${clean.split(' ').join(' name:')}`);
  }

  // 3. Wildcard on first word — catches promos and edge cases
  const firstWord = clean.split(' ')[0];
  if (firstWord.length >= 3) {
    queries.push(`name:${firstWord}*`);
  }

  return queries;
}

function buildSetQuery(rawSet) {
  if (!rawSet) return null;
  const clean = rawSet.replace(/['"]/g, '').trim();
  return clean || null;
}

/** Score a TCG result against the user's input name + set */
function scoreResult(result, cardName, cardSet) {
  const cleanName  = cardName.replace(/['"]/g, '').replace(/\s*\(.*$/, '').trim().toLowerCase();
  const cleanSet   = (cardSet || '').replace(/['"]/g, '').trim().toLowerCase();
  const rName      = (result.name  || '').toLowerCase();
  const rSetName   = (result.set?.name || '').toLowerCase();
  const rNum       = (result.number || '').toLowerCase();
  let score = 0;

  // Name matching
  if (rName === cleanName)             score += 10;
  else if (rName.includes(cleanName))  score +=  5;
  else if (cleanName.includes(rName))  score +=  3;

  // Set matching
  if (cleanSet) {
    if (rSetName === cleanSet)                                             score += 6;
    else if (rSetName.includes(cleanSet) || cleanSet.includes(rSetName))  score += 3;
    const firstWord = cleanSet.split(' ')[0];
    if (firstWord.length > 2 && rSetName.includes(firstWord))             score += 1;
  }

  // Promo / variant bonus — if result number contains letters it's a promo
  if (/[a-z]/i.test(rNum)) score += 1;

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
  if (g === 'psa 10' || g === 'bgs 10')  return baseUSD * 3.5;
  if (g === 'psa 9'  || g === 'bgs 9.5') return baseUSD * 1.5;
  if (g === 'psa 8'  || g === 'bgs 9')   return baseUSD * 1.2;
  if (g === 'psa 7')                      return baseUSD * 1.05;
  return baseUSD;
}

/**
 * Query the Pokemon TCG API.
 * Tries multiple query variants (built from buildNameQueries) and merges
 * deduplicated results.  Set filter applied where provided.
 */
async function queryTCG(cardName, cardSet, fields = 'name,set,number,tcgplayer,images') {
  const base       = 'https://api.pokemontcg.io/v2/cards';
  const nameQueries = buildNameQueries(cardName);
  const setQuery    = buildSetQuery(cardSet);
  const seen        = new Set();
  const allResults  = [];

  for (const nameQ of nameQueries) {
    const queries = setQuery
      ? [
          `${nameQ} set.name:"${setQuery}"`,
          `${nameQ} set.name:${setQuery.split(' ')[0]}*`,
          nameQ,
        ]
      : [nameQ];

    for (const q of queries) {
      const url = `${base}?q=${encodeURIComponent(q)}&select=${fields}&orderBy=-set.releaseDate&pageSize=36`;
      try {
        const res  = await fetch(url);
        if (!res.ok) continue;
        const data = await res.json();
        if (!data.data?.length) continue;
        for (const r of data.data) {
          if (!seen.has(r.id)) {
            seen.add(r.id);
            allResults.push(r);
          }
        }
        // If we already have good results, don't spam all fallbacks
        if (allResults.length >= 20) break;
      } catch { /* try next */ }
    }
    if (allResults.length >= 20) break;
  }

  return allResults;
}

// ── Add-card flow: search → picker → save ────────────────────────────────

/**
 * Called when user clicks "Search cards →" in the add form.
 * Validates the form, queries TCG, then shows the card picker.
 */
async function searchAndPickCard() {
  const name         = document.getElementById('f-name').value.trim();
  const set          = document.getElementById('f-set').value.trim();
  const type         = document.getElementById('f-type').value;
  const grade        = document.getElementById('f-grade').value;
  const quantity     = parseInt(document.getElementById('f-quantity').value, 10) || 1;
  const price        = parseFloat(document.getElementById('f-price').value);
  const purchaseDate = document.getElementById('f-purchase-date').value;
  const targetPrice  = parseFloat(document.getElementById('f-target').value) || null;
  const notes        = document.getElementById('f-notes').value.trim();

  if (!name)               { toast('Please enter a card name.', 'error'); return; }
  if (!price || price <= 0) { toast('Please enter a valid purchase price.', 'error'); return; }

  // Store payload for later use when picker confirms
  _pendingAddPayload = { name, set, type, grade, quantity, price, purchaseDate, targetPrice, notes };

  const btn = document.getElementById('btn-search-cards');
  btn.disabled    = true;
  btn.textContent = 'Searching…';

  try {
    const results = await queryTCG(name, set, 'name,set,number,images,tcgplayer');
    if (!results.length) {
      toast('No cards found — adding with no image. Try a different name or set.', 'info');
      await saveCardDirect(_pendingAddPayload, null);
      return;
    }

    // Sort by relevance
    const scored = results
      .map(r => ({ ...r, _score: scoreResult(r, name, set) }))
      .sort((a, b) => b._score - a._score);

    _addPickerResults  = scored;
    _addPickerFiltered = scored;
    _addPickerSelected = null;

    openAddPicker(scored, name, set);
  } catch (e) {
    console.error('Card search error:', e);
    toast('Search failed. Adding card without image.', 'error');
    await saveCardDirect(_pendingAddPayload, null);
  } finally {
    btn.disabled    = false;
    btn.textContent = 'Search cards →';
  }
}

function openAddPicker(results, cardName, cardSet) {
  document.getElementById('add-picker-title').textContent =
    'Select the correct "' + cardName + '"' + (cardSet ? ' from ' + cardSet : '');
  document.getElementById('add-picker-search').value = '';
  document.getElementById('add-picker-confirm').disabled = true;
  renderAddPickerGrid(results);
  document.getElementById('add-picker-overlay').classList.add('active');
}

function renderAddPickerGrid(results) {
  const grid = document.getElementById('add-picker-grid');
  if (!results.length) {
    grid.innerHTML = '<div class="picker-empty">No results match your filter.</div>';
    return;
  }
  grid.innerHTML = results.map((r, i) => {
    const thumb = r.images?.small || r.images?.large || '';
    return `<div class="picker-item" data-idx="${i}" onclick="selectAddPickerItem(${i})">` +
      '<div class="picker-img-wrap">' +
        (thumb ? `<img src="${esc(thumb)}" alt="${esc(r.name)}" loading="lazy" />` : '<div class="picker-no-img">No image</div>') +
      '</div>' +
      '<div class="picker-info">' +
        `<div class="picker-name">${esc(r.name)}</div>` +
        `<div class="picker-set">${esc(r.set?.name || '—')}</div>` +
        `<div class="picker-num">#${esc(r.number || '?')}</div>` +
      '</div></div>';
  }).join('');
}

function filterAddPicker() {
  const q = document.getElementById('add-picker-search').value.trim().toLowerCase();
  _addPickerFiltered = q
    ? _addPickerResults.filter(r =>
        (r.name || '').toLowerCase().includes(q) ||
        (r.set?.name || '').toLowerCase().includes(q) ||
        (r.number || '').toLowerCase().includes(q)
      )
    : _addPickerResults;

  // Reset selection if selected item is no longer visible
  const stillVisible = _addPickerSelected &&
    _addPickerFiltered.some(r => r.id === _addPickerSelected.id);
  if (!stillVisible) {
    _addPickerSelected = null;
    document.getElementById('add-picker-confirm').disabled = true;
  }

  renderAddPickerGrid(_addPickerFiltered);

  // Re-highlight selection if still visible
  if (_addPickerSelected) {
    const newIdx = _addPickerFiltered.findIndex(r => r.id === _addPickerSelected.id);
    if (newIdx >= 0) {
      document.querySelector(`#add-picker-grid .picker-item[data-idx="${newIdx}"]`)
        ?.classList.add('selected');
    }
  }
}

function selectAddPickerItem(filteredIdx) {
  _addPickerSelected = _addPickerFiltered[filteredIdx] || null;
  document.querySelectorAll('#add-picker-grid .picker-item').forEach((el, i) => {
    el.classList.toggle('selected', i === filteredIdx);
  });
  document.getElementById('add-picker-confirm').disabled = !_addPickerSelected;
}

async function confirmAddPicker() {
  if (!_addPickerSelected || !_pendingAddPayload) return;
  document.getElementById('add-picker-overlay').classList.remove('active');
  await saveCardDirect(_pendingAddPayload, _addPickerSelected);
}

function closeAddPicker() {
  document.getElementById('add-picker-overlay').classList.remove('active');
  _addPickerSelected = null;
  _pendingAddPayload = null;
}

/**
 * Persist the card to the server.
 * tcgResult may be null (user skipped picker or search failed).
 */
async function saveCardDirect(payload, tcgResult) {
  const { name, set, type, grade, quantity, price, purchaseDate, targetPrice, notes } = payload;

  const displayName = tcgResult
    ? `${tcgResult.name} (${tcgResult.set?.name || set || '?'} #${tcgResult.number || '?'})`
    : name;

  const imageUrl = tcgResult ? (tcgResult.images?.large || tcgResult.images?.small || null) : null;
  const tcgId    = tcgResult?.id || null;

  const res = await fetch('/api/cards', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      name: displayName, set: tcgResult?.set?.name || set,
      type, grade, quantity,
      purchasePrice: price, purchaseDate, targetPrice, notes,
      currentValue: null, lastUpdated: null, url: '', priceHistory: [],
      imageUrl, tcgId,
    }),
  });

  if (!res.ok) { toast('Failed to save card.', 'error'); return; }

  const card = await res.json();
  cards.push(card);
  render();
  toggleForm();
  toast(displayName + ' added to your vault.', 'success');

  // Reset add form
  ['f-name','f-set','f-notes'].forEach(id => { document.getElementById(id).value = ''; });
  document.getElementById('f-price').value         = '';
  document.getElementById('f-target').value        = '';
  document.getElementById('f-quantity').value      = '1';
  document.getElementById('f-purchase-date').value = '';
  document.getElementById('f-type').value          = '';
  document.getElementById('f-grade').value         = 'raw';

  _pendingAddPayload = null;
  _addPickerSelected = null;
}

// ── Delete card ───────────────────────────────────────────────────────────
async function deleteCard(id) {
  const card = cards.find(c => c.id === id);
  if (!await confirmDialog('Remove "' + (card?.name ?? 'this card') + '" from your vault?')) return;
  const res = await fetch('/api/cards/' + id, { method: 'DELETE' });
  if (!res.ok) { toast('Failed to delete card.', 'error'); return; }
  cards = cards.filter(c => c.id !== id);
  _alertedTargets.delete(id);
  render();
  toast('Card removed.', 'info');
}

// ── Reset vault ───────────────────────────────────────────────────────────
async function resetVault() {
  if (!await confirmDialog('Delete ALL cards from your vault? This cannot be undone.')) return;
  let failed = 0;
  for (const card of [...cards]) {
    const res = await fetch('/api/cards/' + card.id, { method: 'DELETE' });
    if (!res.ok) failed++;
  }
  if (failed) toast(failed + ' card(s) could not be deleted.', 'error');
  cards = [];
  _alertedTargets.clear();
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
  const id           = document.getElementById('edit-id').value;
  const name         = document.getElementById('edit-name').value.trim();
  const set          = document.getElementById('edit-set').value.trim();
  const type         = document.getElementById('edit-type').value;
  const grade        = document.getElementById('edit-grade').value;
  const quantity     = parseInt(document.getElementById('edit-quantity').value, 10) || 1;
  const price        = parseFloat(document.getElementById('edit-price').value);
  const purchaseDate = document.getElementById('edit-purchase-date').value;
  const targetPrice  = parseFloat(document.getElementById('edit-target').value) || null;
  const notes        = document.getElementById('edit-notes').value.trim();
  const url          = document.getElementById('edit-url').value.trim();

  if (!name)               { toast('Card name is required.', 'error'); return; }
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
    _alertedTargets.delete(id);
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
  if (!last || !isSameDay(last.date, now)) history.push({ date: now, value: val });
  else history[history.length - 1] = { date: now, value: val };

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
      const ap = (Number(a.currentValue) - Number(a.purchasePrice)) / Number(a.purchasePrice);
      const bp = (Number(b.currentValue) - Number(b.purchasePrice)) / Number(b.purchasePrice);
      return bp - ap;
    });
    if (activeMoversFilter === 'gainers')     filtered = sorted.slice(0, 5);
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
    let av, bv;
    switch (sortCol) {
      case 'name':          av = a.name.toLowerCase();            bv = b.name.toLowerCase();           break;
      case 'set':           av = (a.set||'').toLowerCase();       bv = (b.set||'').toLowerCase();       break;
      case 'purchasePrice': av = Number(a.purchasePrice);         bv = Number(b.purchasePrice);         break;
      case 'currentValue':  av = Number(a.currentValue  || 0);    bv = Number(b.currentValue  || 0);   break;
      case 'profit':
        av = a.currentValue != null ? Number(a.currentValue) - Number(a.purchasePrice) : -Infinity;
        bv = b.currentValue != null ? Number(b.currentValue) - Number(b.purchasePrice) : -Infinity;
        break;
      case 'lastUpdated': av = a.lastUpdated || 0; bv = b.lastUpdated || 0; break;
      default: return 0;
    }
    return av < bv ? -sortDir : av > bv ? sortDir : 0;
  });
}

// ── CSV Export ────────────────────────────────────────────────────────────
function exportCSV() {
  const all = [...cards.filter(c => !c.sold), ...cards.filter(c => c.sold)];
  if (!all.length) { toast('No cards to export.', 'info'); return; }

  const headers = ['Name','Set','Type','Grade','Quantity','Purchase Price (SGD)','Current Value (SGD)',
    'P/L (SGD)','Purchase Date','Target Price','Notes','Status','Sold Price','Sold Date','Sold To'];
  const rows = all.map(c => {
    const cost = Number(c.purchasePrice) * (c.quantity || 1);
    const val  = c.sold
      ? Number(c.soldPrice || 0) * (c.quantity || 1)
      : c.currentValue != null ? Number(c.currentValue) * (c.quantity || 1) : '';
    const pl = c.sold
      ? ((Number(c.soldPrice || 0) - Number(c.purchasePrice)) * (c.quantity || 1)).toFixed(2)
      : c.currentValue != null ? ((Number(c.currentValue) - Number(c.purchasePrice)) * (c.quantity || 1)).toFixed(2) : '';
    return [
      c.name, c.set||'', c.type||'', c.grade||'', c.quantity||1,
      cost.toFixed(2), val !== '' ? Number(val).toFixed(2) : '', pl,
      c.purchaseDate||'', c.targetPrice||'', c.notes||'',
      c.sold ? 'Sold' : 'Active',
      c.sold ? (c.soldPrice||'') : '',
      c.sold ? (c.soldDate||'')  : '',
      c.sold ? (c.soldTo||'')    : '',
    ].map(v => '"' + String(v).replace(/"/g, '""') + '"');
  });

  const csv  = [headers.map(h => '"' + h + '"').join(','), ...rows.map(r => r.join(','))].join('\n');
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url  = URL.createObjectURL(blob);
  const a    = Object.assign(document.createElement('a'), {
    href: url,
    download: 'pokevault-' + new Date().toISOString().split('T')[0] + '.csv',
  });
  a.click();
  URL.revokeObjectURL(url);
  toast('Collection exported.', 'success');
}

// ── Price fetching ────────────────────────────────────────────────────────
async function fetchPrice(card) {
  try {
    const results = await queryTCG(card.name, card.set, 'name,set,number,tcgplayer');
    if (!results.length) return null;

    const scored = results
      .map(r => ({ ...r, _score: scoreResult(r, card.name, card.set) }))
      .sort((a, b) => b._score - a._score);

    // If card has a stored tcgId, prefer that match
    const byId = card.tcgId ? scored.find(r => r.id === card.tcgId) : null;
    const best = byId || scored[0];

    const base = extractPrice(best.tcgplayer?.prices);
    if (base == null) return null;
    return Math.round(applyGradeMultiplier(base, card.grade) * USD_TO_SGD * 100) / 100;
  } catch (e) {
    console.error('fetchPrice error for ' + card.name, e);
    return null;
  }
}

async function refreshPrices(silent = false) {
  const active = cards.filter(c => !c.sold);
  if (!active.length) { if (!silent) toast('No cards to refresh.', 'info'); return; }

  const btn       = document.querySelector('.btn-refresh');
  btn.disabled    = true;
  btn.textContent = '↻ Fetching…';
  let updated     = 0;

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
    if (updated) toast('Updated ' + updated + ' card' + (updated !== 1 ? 's' : '') + '.', 'success');
    else toast('No prices found. Try setting values manually.', 'error');
  }
}

// ── Card image fetching (detail modal) ────────────────────────────────────
async function fetchCardImageResults(card) {
  try {
    return await queryTCG(card.name, card.set, 'name,set,number,images');
  } catch (e) {
    console.warn('fetchCardImageResults error:', e);
    return [];
  }
}

// ── View picker (image tab inside card detail modal) ──────────────────────
function openViewPicker(results, card) {
  return new Promise(resolve => {
    _viewPickerResults  = results;
    _viewPickerAll      = results;
    _viewPickerCallback = resolve;

    document.getElementById('picker-title').textContent =
      'Select the correct "' + card.name + '" card';
    document.getElementById('picker-search').value = '';
    renderViewPickerGrid(results);
    document.getElementById('picker-overlay').classList.add('active');
  });
}

function renderViewPickerGrid(results) {
  const grid = document.getElementById('picker-grid');
  if (!results.length) {
    grid.innerHTML = '<div class="picker-empty">No results match your filter.</div>';
    return;
  }
  grid.innerHTML = results.map((r, i) => {
    const thumb = r.images?.small || r.images?.large || '';
    return `<div class="picker-item" onclick="pickViewCard(${i})">` +
      '<div class="picker-img-wrap">' +
        (thumb ? `<img src="${esc(thumb)}" alt="${esc(r.name)}" loading="lazy" />` : '<div class="picker-no-img">No image</div>') +
      '</div>' +
      '<div class="picker-info">' +
        `<div class="picker-name">${esc(r.name)}</div>` +
        `<div class="picker-set">${esc(r.set?.name || '—')}</div>` +
        `<div class="picker-num">#${esc(r.number || '?')}</div>` +
      '</div></div>';
  }).join('');
}

function filterViewPicker() {
  const q = document.getElementById('picker-search').value.trim().toLowerCase();
  _viewPickerResults = q
    ? _viewPickerAll.filter(r =>
        (r.name || '').toLowerCase().includes(q) ||
        (r.set?.name || '').toLowerCase().includes(q) ||
        (r.number || '').toLowerCase().includes(q)
      )
    : _viewPickerAll;
  renderViewPickerGrid(_viewPickerResults);
}

function pickViewCard(index) {
  document.getElementById('picker-overlay').classList.remove('active');
  if (_viewPickerCallback) {
    _viewPickerCallback(_viewPickerResults[index] || null);
    _viewPickerCallback = null;
  }
}

function closePickerModal() {
  document.getElementById('picker-overlay').classList.remove('active');
  if (_viewPickerCallback) { _viewPickerCallback(null); _viewPickerCallback = null; }
}

// ── Modal image tab ───────────────────────────────────────────────────────
function switchModalTab(tab) {
  document.getElementById('modal-panel-info').style.display  = tab === 'info'  ? 'block' : 'none';
  document.getElementById('modal-panel-image').style.display = tab === 'image' ? 'block' : 'none';
  document.getElementById('modal-tab-info').classList.toggle('active',  tab === 'info');
  document.getElementById('modal-tab-image').classList.toggle('active', tab === 'image');
  if (tab === 'image') _renderImageTab();
}

function _renderImageTab() {
  const loadingEl  = document.getElementById('modal-image-loading');
  const foundEl    = document.getElementById('modal-image-found');
  const notFoundEl = document.getElementById('modal-image-notfound');
  const largeImg   = document.getElementById('modal-card-image-large');

  if (_cardImageLoaded && _cardImageUrl) {
    loadingEl.style.display  = 'none';
    foundEl.style.display    = 'block';
    notFoundEl.style.display = 'none';
    if (largeImg.src !== _cardImageUrl) largeImg.src = _cardImageUrl;
  } else if (_cardImageLoaded && !_cardImageUrl) {
    loadingEl.style.display  = 'none';
    foundEl.style.display    = 'none';
    notFoundEl.style.display = 'flex';
  } else {
    loadingEl.style.display  = 'flex';
    foundEl.style.display    = 'none';
    notFoundEl.style.display = 'none';
  }
}

function switchModalTabWithPicker(tab) {
  switchModalTab(tab);
  if (tab === 'image' && !_cardImageLoaded && _pendingImageResults.length) {
    _showImagePicker(_pendingImageResults, _pendingImageCard);
  }
}

async function _showImagePicker(results, card) {
  const withImages = results.filter(r => r.images?.small || r.images?.large);
  if (!withImages.length) {
    _cardImageUrl    = null;
    _cardImageLoaded = true;
    _renderImageTab();
    return;
  }
  const chosen     = await openViewPicker(withImages, card);
  _cardImageUrl    = chosen ? (chosen.images?.large || chosen.images?.small || null) : null;
  _cardImageLoaded = true;
  _renderImageTab();
}

// ── Card detail modal ─────────────────────────────────────────────────────
async function openCard(id) {
  const card = cards.find(c => c.id === id);
  if (!card) return;
  editingCardId    = id;
  _cardImageUrl    = null;
  _cardImageLoaded = false;

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

  // If card has a stored imageUrl, use it directly
  if (card.imageUrl) {
    _cardImageUrl    = card.imageUrl;
    _cardImageLoaded = true;
  } else {
    // Async fetch image candidates
    fetchCardImageResults(card).then(async results => {
      if (!results.length) {
        _cardImageUrl    = null;
        _cardImageLoaded = true;
      } else {
        const scored = results
          .map(r => ({ ...r, _score: scoreResult(r, card.name, card.set) }))
          .sort((a, b) => b._score - a._score);

        const topScore    = scored[0]._score;
        const runnerScore = scored[1]?._score ?? 0;
        const autoSelect  = topScore > 0 && (topScore - runnerScore) >= 5;

        let chosen = null;
        if (autoSelect || scored.length === 1) {
          chosen = scored[0];
        } else {
          _cardImageLoaded     = false;
          _pendingImageResults = scored;
          _pendingImageCard    = card;

          const imagePanel = document.getElementById('modal-panel-image');
          if (imagePanel?.style.display !== 'none') {
            _showImagePicker(scored, card);
          }
          return;
        }

        _cardImageUrl    = chosen?.images?.large || chosen?.images?.small || null;
        _cardImageLoaded = true;
      }
      const imagePanel = document.getElementById('modal-panel-image');
      if (imagePanel?.style.display !== 'none') _renderImageTab();
    });
  }

  _renderPriceChart(card, colors);
}

function _renderPriceChart(card, colors) {
  const history        = card.priceHistory || [];
  const emptyEl        = document.getElementById('modal-chart-empty');
  const chartContainer = document.querySelector('.modal-chart-container');

  if (history.length < 2) {
    emptyEl.style.display        = 'block';
    chartContainer.style.display = 'none';
    return;
  }
  emptyEl.style.display        = 'none';
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
        y: {
          ticks: { callback: v => '$' + v, font: { size: 11, family: 'DM Mono' }, color: 'var(--text3)' },
          grid: { color: 'var(--border)' },
          border: { display: false },
        },
        x: {
          ticks: { font: { size: 11, family: 'DM Mono' }, color: 'var(--text3)' },
          grid: { display: false },
          border: { display: false },
        },
      },
    },
  });
}

function closeModal(e) {
  if (e && e.target !== document.getElementById('modal-overlay')) return;
  _destroyModal();
}

function _destroyModal() {
  document.getElementById('modal-overlay').classList.remove('active');
  if (priceChart) { priceChart.destroy(); priceChart = null; }
  _cardImageUrl        = null;
  _cardImageLoaded     = false;
  _pendingImageResults = [];
  _pendingImageCard    = null;
}

document.addEventListener('keydown', e => {
  if (e.key !== 'Escape') return;
  ['modal-overlay','confirm-overlay','edit-overlay','sell-overlay',
   'manual-price-overlay','picker-overlay','add-picker-overlay']
    .forEach(id => document.getElementById(id)?.classList.remove('active'));
  if (priceChart) { priceChart.destroy(); priceChart = null; }
  // Clean up add-picker state if dismissed by Escape
  _addPickerSelected = null;
  _pendingAddPayload = null;
});

// ── Movers ────────────────────────────────────────────────────────────────
function renderMovers() {
  const priced  = cards.filter(c => !c.sold && c.currentValue != null);
  const section = document.getElementById('movers-section');
  if (priced.length < 2) { section.style.display = 'none'; return; }
  section.style.display = 'block';

  const sorted = [...priced].sort((a, b) => {
    const ap = (Number(a.currentValue) - Number(a.purchasePrice)) / Number(a.purchasePrice);
    const bp = (Number(b.currentValue) - Number(b.purchasePrice)) / Number(b.purchasePrice);
    return bp - ap;
  });

  const moverCard = c => {
    const profit = Number(c.currentValue) - Number(c.purchasePrice);
    const pct    = (profit / Number(c.purchasePrice)) * 100;
    const pos    = profit >= 0;
    const colors = getTypeColor(c.type);
    return `<div class="mover-card" style="border-left:3px solid ${colors.border};" onclick="openCard('${c.id}')">` +
      `<div style="overflow:hidden;"><div class="mover-name">${esc(c.name)}</div><div class="mover-set">${esc(c.set||'—')}</div></div>` +
      `<div class="mover-value ${pos ? 'profit-pos' : 'profit-neg'}">${pos ? '↑' : '↓'} ${Math.abs(pct).toFixed(1)}%` +
        `<span class="mover-sgd">${pos ? '+' : '-'}SGD $${Math.abs(profit).toFixed(2)}</span></div></div>`;
  };

  document.getElementById('movers-gainers').innerHTML = sorted.slice(0, 3).map(moverCard).join('');
  document.getElementById('movers-losers').innerHTML  = sorted.slice(-3).reverse().map(moverCard).join('');
}

function checkTargetAlerts() {
  cards
    .filter(c => !c.sold && c.targetPrice && c.currentValue != null &&
                 Number(c.currentValue) >= Number(c.targetPrice) &&
                 !_alertedTargets.has(c.id))
    .forEach(c => {
      _alertedTargets.add(c.id);
      toast('🎯 ' + c.name + ' hit your target of SGD $' + Number(c.targetPrice).toFixed(2) + '!', 'success');
    });
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

  const tbody     = document.getElementById('card-table');
  const cardList  = document.getElementById('card-list');
  const filtered  = getFilteredCards();
  const sorted    = getSortedCards(filtered);
  const soldCards = cards.filter(c => c.sold);

  // ── Active cards ──
  if (!cards.filter(c => !c.sold).length) {
    tbody.innerHTML    = '<tr><td colspan="11"><div class="empty-state">Your vault is empty — add your first card to get started</div></td></tr>';
    cardList.innerHTML = '<div class="empty-state">Your vault is empty — add your first card to get started</div>';
  } else if (!sorted.length) {
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
        ? `<span class="type-badge" style="background:${colors.bg};color:${colors.border};border:1px solid ${colors.border};">${esc(c.type)}</span>`
        : '<span class="type-badge type-unknown">—</span>';
      const targetHit = c.targetPrice && c.currentValue != null && Number(c.currentValue) >= Number(c.targetPrice);
      const rowStyle  = `border-left:3px solid ${colors.border}${targetHit ? ';box-shadow:inset 0 0 0 1px rgba(76,175,125,0.2);' : ''};`;
      return `<tr class="card-row${targetHit ? ' target-hit' : ''}" onclick="openCard('${c.id}')" style="${rowStyle}">` +
        `<td title="${esc(c.name)}" style="font-weight:600;">${esc(c.name)}${targetHit ? ' <span style="color:var(--green);font-size:11px;">🎯</span>' : ''}</td>` +
        `<td title="${esc(c.set||'—')}" style="color:var(--text2);">${esc(c.set||'—')}</td>` +
        `<td>${typeBadge}</td>` +
        `<td><span class="badge ${gradeClass}">${esc(c.grade)}</span></td>` +
        `<td style="font-family:var(--font-mono);color:var(--text2);">×${c.quantity||1}</td>` +
        `<td style="font-family:var(--font-mono);">$${cost.toFixed(2)}</td>` +
        `<td style="font-family:var(--font-mono);">${val != null ? '$'+val.toFixed(2) : '<span style="color:var(--text3);">—</span>'}</td>` +
        `<td class="${profitClass}" style="font-family:var(--font-mono);font-weight:600;">${profitStr}</td>` +
        `<td style="color:var(--text3);font-family:var(--font-mono);font-size:12px;">${updated}</td>` +
        `<td><button class="btn-row-edit" onclick="event.stopPropagation();openEditForm('${c.id}')" title="Edit">✎</button></td>` +
        `<td><button class="del-btn" onclick="event.stopPropagation();deleteCard('${c.id}')" title="Delete">✕</button></td>` +
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
          `<div class="mobile-card-set">${esc(c.set||'—')} · <span class="badge ${gradeClass}">${esc(c.grade)}</span>${c.quantity>1?' ×'+c.quantity:''}</div></div>` +
          '<div style="display:flex;gap:8px;align-items:center;">' +
            `<button class="mobile-card-delete" onclick="event.stopPropagation();openEditForm('${c.id}')" title="Edit" style="font-size:14px;">✎</button>` +
            `<button class="mobile-card-delete" onclick="event.stopPropagation();deleteCard('${c.id}')" title="Delete">✕</button>` +
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
  if (!soldCards.length) {
    soldTbody.innerHTML = '<tr><td colspan="9"><div class="empty-state">No sold cards yet</div></td></tr>';
    soldList.innerHTML  = '<div class="empty-state">No sold cards yet</div>';
  } else {
    soldTbody.innerHTML = soldCards.map(c => {
      const profit      = c.soldPrice ? (Number(c.soldPrice) - Number(c.purchasePrice)) * (c.quantity||1) : null;
      const profitStr   = profit != null ? (profit >= 0 ? '↑ +' : '↓ ') + 'SGD $' + Math.abs(profit).toFixed(2) : '—';
      const profitClass = profit == null ? '' : profit >= 0 ? 'profit-pos' : 'profit-neg';
      return '<tr>' +
        `<td style="font-weight:600;">${esc(c.name)}</td>` +
        `<td style="color:var(--text2);">${esc(c.set||'—')}</td>` +
        `<td><span class="badge ${c.grade==='raw'?'badge-raw':'badge-psa'}">${esc(c.grade)}</span></td>` +
        `<td style="font-family:var(--font-mono);">$${(Number(c.purchasePrice)*(c.quantity||1)).toFixed(2)}</td>` +
        `<td style="font-family:var(--font-mono);">${c.soldPrice?'$'+Number(c.soldPrice).toFixed(2):'—'}</td>` +
        `<td class="${profitClass}" style="font-family:var(--font-mono);font-weight:600;">${profitStr}</td>` +
        `<td style="color:var(--text3);font-family:var(--font-mono);font-size:12px;">${c.soldDate||'—'}</td>` +
        `<td style="color:var(--text2);font-size:12px;">${esc(c.soldTo||'—')}</td>` +
        `<td><button class="del-btn" onclick="deleteCard('${c.id}')" title="Delete">✕</button></td>` +
        '</tr>';
    }).join('');

    soldList.innerHTML = soldCards.map(c => {
      const profit      = c.soldPrice ? (Number(c.soldPrice) - Number(c.purchasePrice)) * (c.quantity||1) : null;
      const profitStr   = profit != null ? (profit >= 0 ? '+' : '') + 'SGD $' + (profit).toFixed(2) : '—';
      const profitClass = profit == null ? '' : profit >= 0 ? 'profit-pos' : 'profit-neg';
      return '<div class="mobile-card">' +
        '<div class="mobile-card-top">' +
          `<div><div class="mobile-card-name">${esc(c.name)}</div>` +
          `<div class="mobile-card-set">${esc(c.set||'—')} · sold ${c.soldDate||'—'}</div></div>` +
        '</div>' +
        '<div class="mobile-card-bottom">' +
          `<div class="mobile-card-price">Paid: SGD $${Number(c.purchasePrice).toFixed(2)}<br>Sold: ${c.soldPrice?'SGD $'+Number(c.soldPrice).toFixed(2):'—'}</div>` +
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
