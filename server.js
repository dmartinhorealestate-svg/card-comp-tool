require('dotenv').config();
const fetch = require('node-fetch');
const express = require('express');
const cors = require('cors');
const fs = require('fs');
const app = express();

app.use(cors());
app.use(express.json({ limit: '10mb' }));

const DB_FILE = './sessions.json';

function loadCards() {
  if (!fs.existsSync(DB_FILE)) return [];
  try {
    const data = fs.readFileSync(DB_FILE, 'utf8');
    return JSON.parse(data);
  } catch (e) {
    return [];
  }
}

function saveCards(cards) {
  fs.writeFileSync(DB_FILE, JSON.stringify(cards, null, 2));
}

app.get('/cards', (req, res) => {
  res.json(loadCards());
});

app.post('/cards', (req, res) => {
  const cards = loadCards();
  const newCard = req.body;
  cards.push(newCard);
  saveCards(cards);
  res.json({ success: true });
});

app.delete('/cards', (req, res) => {
  saveCards([]);
  res.json({ success: true });
});

app.post('/analyze', async (req, res) => {
  const { imageBase64 } = req.body;
  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': process.env.ANTHROPIC_API_KEY,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: 'claude-sonnet-4-5',
      max_tokens: 1024,
      messages: [{
        role: 'user',
        content: [
          { type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data: imageBase64 } },
          { type: 'text', text: 'This is a sports card. Respond with ONLY a JSON object, no other text, no backticks. Example: {"player":"Joey Votto","year":"2020","set":"National Treasures","variation":"Gear","printRun":"1/5","tags":["Autograph","Patch","Numbered"]} For tags only include ones you can see: Rookie Card, Autograph, Patch, Low Print Run, Graded, Numbered, Refractor, Game Used.' }
        ]
      }]
    })
  });
  const data = await response.json();
  console.log(JSON.stringify(data));
  res.json(data);
});

app.listen(3001, () => console.log('Server running on port 3001'));
