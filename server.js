const express = require('express');
const fs = require('fs');
const session = require('express-session');
const bcrypt = require('bcryptjs');

const app = express();
const USERS_FILE = 'users.json';
const CARDS_FILE = 'cards.json';

app.use(express.json());
app.use(session({
  secret: 'pokemon-tracker-secret-key',
  resave: false,
  saveUninitialized: false,
  cookie: { maxAge: 7 * 24 * 60 * 60 * 1000 }
}));

function readUsers() {
  if (!fs.existsSync(USERS_FILE)) return [];
  return JSON.parse(fs.readFileSync(USERS_FILE, 'utf8'));
}

function writeUsers(data) {
  fs.writeFileSync(USERS_FILE, JSON.stringify(data, null, 2));
}

function readCards() {
  if (!fs.existsSync(CARDS_FILE)) return [];
  return JSON.parse(fs.readFileSync(CARDS_FILE, 'utf8'));
}

function writeCards(data) {
  fs.writeFileSync(CARDS_FILE, JSON.stringify(data, null, 2));
}

function requireAuth(req, res, next) {
  if (!req.session.userId) return res.status(401).json({ error: 'Not logged in' });
  next();
}

app.post('/api/register', async (req, res) => {
  const { username, password } = req.body;
  if (!username || !password) return res.status(400).json({ error: 'Username and password required' });

  const users = readUsers();
  if (users.find(u => u.username.toLowerCase() === username.toLowerCase())) {
    return res.status(400).json({ error: 'Username already taken' });
  }

  const hash = await bcrypt.hash(password, 10);
  const user = { id: Date.now().toString(), username, password: hash };
  users.push(user);
  writeUsers(users);

  req.session.userId = user.id;
  req.session.username = user.username;
  res.json({ username: user.username });
});

app.post('/api/login', async (req, res) => {
  const { username, password } = req.body;
  const users = readUsers();
  const user = users.find(u => u.username.toLowerCase() === username.toLowerCase());

  if (!user || !(await bcrypt.compare(password, user.password))) {
    return res.status(401).json({ error: 'Invalid username or password' });
  }

  req.session.userId = user.id;
  req.session.username = user.username;
  res.json({ username: user.username });
});

app.post('/api/logout', (req, res) => {
  req.session.destroy();
  res.json({ ok: true });
});

app.get('/api/me', (req, res) => {
  if (!req.session.userId) return res.status(401).json({ error: 'Not logged in' });
  res.json({ username: req.session.username });
});

app.get('/api/cards', requireAuth, (req, res) => {
  const all = readCards();
  res.json(all.filter(c => c.userId === req.session.userId));
});

app.post('/api/cards', requireAuth, (req, res) => {
  const all = readCards();
  const card = { ...req.body, id: Date.now().toString(), userId: req.session.userId };
  all.push(card);
  writeCards(all);
  res.json(card);
});

app.put('/api/cards/:id', requireAuth, (req, res) => {
  let all = readCards();
  const idx = all.findIndex(c => c.id === req.params.id && c.userId === req.session.userId);
  if (idx === -1) return res.status(404).json({ error: 'Card not found' });
  all[idx] = { ...all[idx], ...req.body };
  writeCards(all);
  res.json({ ok: true });
});

app.delete('/api/cards/:id', requireAuth, (req, res) => {
  let all = readCards();
  const before = all.length;
  all = all.filter(c => !(c.id === req.params.id && c.userId === req.session.userId));
  if (all.length === before) return res.status(404).json({ error: 'Card not found' });
  writeCards(all);
  res.json({ ok: true });
});

app.use(express.static('.'));

app.listen(5000, () => console.log('Running on port 5000'));
