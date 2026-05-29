const express = require('express');
const fs = require('fs');
const path = require('path');
const app = express();

app.use(express.json());
app.use(express.static('.'));

const DB_FILE = 'cards.json';

function readDB() {
  if (!fs.existsSync(DB_FILE)) return [];
  return JSON.parse(fs.readFileSync(DB_FILE, 'utf8'));
}

function writeDB(data) {
  fs.writeFileSync(DB_FILE, JSON.stringify(data, null, 2));
}

app.get('/api/cards', (req, res) => {
  res.json(readDB());
});

app.post('/api/cards', (req, res) => {
  const cards = readDB();
  const card = { ...req.body, id: Date.now() };
  cards.push(card);
  writeDB(cards);
  res.json(card);
});

app.put('/api/cards/:id', (req, res) => {
  let cards = readDB();
  cards = cards.map(c => c.id == req.params.id ? { ...c, ...req.body } : c);
  writeDB(cards);
  res.json({ ok: true });
});

app.delete('/api/cards/:id', (req, res) => {
  let cards = readDB();
  cards = cards.filter(c => c.id != req.params.id);
  writeDB(cards);
  res.json({ ok: true });
});

app.listen(5000, () => console.log('Running on port 5000'));