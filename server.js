'use strict';

const express        = require('express');
const session        = require('express-session');
const bcrypt         = require('bcryptjs');
const { createClient } = require('@supabase/supabase-js');

// ── Supabase ──────────────────────────────────────────────────────────────
const SUPABASE_URL = 'https://kilkeuaeusfqsobhxlou.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImtpbGtldWFldXNmcXNvYmh4bG91Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODAwMjYyNjEsImV4cCI6MjA5NTYwMjI2MX0.Gph5uSVo45L7__58vRZz-KaVrs8o6RSdnQusY2csJTw';
const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

// ── App setup ─────────────────────────────────────────────────────────────
const app = express();

app.use(express.json());
app.use(session({
  secret: 'pokevault-secret-key-v3',
  resave: false,
  saveUninitialized: false,
  cookie: { maxAge: 7 * 24 * 60 * 60 * 1000 }
}));

// ── Middleware ────────────────────────────────────────────────────────────
function requireAuth(req, res, next) {
  if (!req.session.userId) {
    return res.status(401).json({ error: 'Not logged in' });
  }
  next();
}

// ── Helpers ───────────────────────────────────────────────────────────────
function dbCardToClient(c) {
  return {
    id:            c.id,
    name:          c.name,
    set:           c.set_name,
    type:          c.type,
    grade:         c.grade,
    quantity:      c.quantity      ?? 1,
    purchasePrice: c.purchase_price,
    purchaseDate:  c.purchase_date,
    targetPrice:   c.target_price,
    notes:         c.notes,
    currentValue:  c.current_value,
    lastUpdated:   c.last_updated,
    url:           c.url,
    priceHistory:  c.price_history  ?? [],
    sold:          c.sold           ?? false,
    soldPrice:     c.sold_price,
    soldDate:      c.sold_date,
    soldTo:        c.sold_to,
  };
}

// ── Auth routes ───────────────────────────────────────────────────────────
app.post('/api/register', async (req, res) => {
  const { username, password } = req.body;
  if (!username?.trim() || !password) {
    return res.status(400).json({ error: 'Username and password required' });
  }
  const { data: existing } = await supabase
    .from('users')
    .select('id')
    .ilike('username', username.trim())
    .single();
  if (existing) {
    return res.status(400).json({ error: 'Username already taken' });
  }
  const hash = await bcrypt.hash(password, 10);
  const id   = Date.now().toString();
  const { error } = await supabase
    .from('users')
    .insert([{ id, username: username.trim(), password: hash }]);
  if (error) {
    return res.status(500).json({ error: 'Failed to create account' });
  }
  req.session.userId   = id;
  req.session.username = username.trim();
  res.json({ username: username.trim() });
});

app.post('/api/login', async (req, res) => {
  const { username, password } = req.body;
  if (!username || !password) {
    return res.status(400).json({ error: 'Username and password required' });
  }
  const { data: user } = await supabase
    .from('users')
    .select('*')
    .ilike('username', username)
    .single();
  if (!user || !(await bcrypt.compare(password, user.password))) {
    return res.status(401).json({ error: 'Invalid username or password' });
  }
  req.session.userId   = user.id;
  req.session.username = user.username;
  res.json({ username: user.username });
});

app.post('/api/logout', (req, res) => {
  req.session.destroy(() => res.json({ ok: true }));
});

app.get('/api/me', (req, res) => {
  if (!req.session.userId) {
    return res.status(401).json({ error: 'Not logged in' });
  }
  res.json({ username: req.session.username });
});

// ── Card routes ───────────────────────────────────────────────────────────
app.get('/api/cards', requireAuth, async (req, res) => {
  const { data, error } = await supabase
    .from('cards')
    .select('*')
    .eq('user_id', req.session.userId)
    .order('id', { ascending: true });
  if (error) return res.status(500).json({ error: 'Failed to fetch cards' });
  res.json(data.map(dbCardToClient));
});

app.post('/api/cards', requireAuth, async (req, res) => {
  const {
    name, set, type, grade, quantity, purchasePrice,
    purchaseDate, targetPrice, notes, currentValue,
    lastUpdated, url, priceHistory,
  } = req.body;
  const id = Date.now().toString();
  const record = {
    id,
    user_id:        req.session.userId,
    name,
    set_name:       set,
    type,
    grade,
    quantity:       quantity ?? 1,
    purchase_price: purchasePrice,
    purchase_date:  purchaseDate,
    target_price:   targetPrice,
    notes,
    current_value:  currentValue,
    last_updated:   lastUpdated,
    url,
    price_history:  priceHistory ?? [],
    sold:           false,
  };
  const { error } = await supabase.from('cards').insert([record]);
  if (error) return res.status(500).json({ error: 'Failed to save card' });
  res.json(dbCardToClient({ ...record, sold: false }));
});

// Full value update (price refresh)
app.put('/api/cards/:id', requireAuth, async (req, res) => {
  const { currentValue, lastUpdated, priceHistory } = req.body;
  const { error } = await supabase
    .from('cards')
    .update({ current_value: currentValue, last_updated: lastUpdated, price_history: priceHistory })
    .eq('id', req.params.id)
    .eq('user_id', req.session.userId);
  if (error) return res.status(500).json({ error: 'Failed to update card' });
  res.json({ ok: true });
});

// Partial update (edit / sell)
app.patch('/api/cards/:id', requireAuth, async (req, res) => {
  const allowed = {
    name:          'name',
    set:           'set_name',
    type:          'type',
    grade:         'grade',
    quantity:      'quantity',
    purchasePrice: 'purchase_price',
    purchaseDate:  'purchase_date',
    targetPrice:   'target_price',
    notes:         'notes',
    url:           'url',
    sold:          'sold',
    soldPrice:     'sold_price',
    soldDate:      'sold_date',
    soldTo:        'sold_to',
  };
  const update = {};
  for (const [clientKey, dbKey] of Object.entries(allowed)) {
    if (req.body[clientKey] !== undefined) update[dbKey] = req.body[clientKey];
  }
  if (Object.keys(update).length === 0) {
    return res.status(400).json({ error: 'No fields to update' });
  }
  const { error } = await supabase
    .from('cards')
    .update(update)
    .eq('id', req.params.id)
    .eq('user_id', req.session.userId);
  if (error) return res.status(500).json({ error: 'Failed to update card' });
  res.json({ ok: true });
});

app.delete('/api/cards/:id', requireAuth, async (req, res) => {
  const { error } = await supabase
    .from('cards')
    .delete()
    .eq('id', req.params.id)
    .eq('user_id', req.session.userId);
  if (error) return res.status(500).json({ error: 'Failed to delete card' });
  res.json({ ok: true });
});

// ── Static files ──────────────────────────────────────────────────────────
app.use(express.static('.'));

app.listen(5000, () => console.log('PokeVault v3 running on port 5000'));
