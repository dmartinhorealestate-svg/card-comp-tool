require('dotenv').config();
const fetch = require('node-fetch').default;
const express = require('express');
const cors = require('cors');
const fs = require('fs');
const path = require('path');

const app = express();
app.use(cors());
app.use(express.json({ limit: '10mb' }));
app.use(express.static(path.join(__dirname, 'build')));

const SESSIONS_FILE = path.join(__dirname, 'sessions.json');

function loadCards() {
  try {
    const data = fs.readFileSync(SESSIONS_FILE, 'utf8');
    return JSON.parse(data).cards || [];
  } catch {
    return [];
  }
}

function saveCards(cards) {
  fs.writeFileSync(SESSIONS_FILE, JSON.stringify({ cards }));
}

app.get('/cards', (req, res) => {
  const cards = loadCards();
  res.json({ cards });
});

app.post('/cards', (req, res) => {
  const cards = loadCards();
  cards.push(req.body);
  saveCards(cards);
  res.json({ cards });
});

app.delete('/cards', (req, res) => {
  saveCards([]);
  res.json({ cards: [] });
});

app.post('/analyze', async (req, res) => {
  try {
    const { imageBase64 } = req.body;
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': process.env.ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-5',
        max_tokens: 1024,
        messages: [{
          role: 'user',
          content: [
            { type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data: imageBase64 } },
            { type: 'text', text: 'This is a sports card. Respond with ONLY a JSON object with fields: player, year, brand, cardNumber, variation. No markdown, no extra text.' }
          ]
        }]
      })
    });
    const data = await response.json();
    const text = data.content.map(b => b.text || '').join('').replace(/```json/g,'').replace(/```/g,'').trim();
    const match = text.match(/\{[\s\S]*\}/);
    if (!match) return res.status(500).json({ error: 'No JSON found' });
    const parsed = JSON.parse(match[0]);
    res.json(parsed);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

app.get('/{*path}', (req, res) => {
  res.sendFile(path.join(__dirname, 'build', 'index.html'));
});

app.listen(process.env.PORT || 3001, () => console.log('Server running'));
