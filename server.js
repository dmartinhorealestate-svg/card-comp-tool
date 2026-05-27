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
  } catch { return []; }
}

function saveCards(cards) {
  fs.writeFileSync(SESSIONS_FILE, JSON.stringify({ cards }));
}

app.get('/cards', (req, res) => res.json({ cards: loadCards() }));

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
            { type: 'text', text: `This is a sports card. Analyze it and respond with ONLY a JSON object with these fields:
- player (string)
- year (string)
- brand (string)
- cardNumber (string or empty string "" if not visible on the card)
- variation (string)
- printRun (string - ONLY if there is a print run number like "1/5" or "45/99" visible on the card, otherwise empty string "")
- tags (array of strings from this list only): 
  "Auto" (if autograph present),
  "RPA" (if rookie patch auto),
  "Numbered" (if print run shown like /10 /99 /149 etc),
  "Case Hit",
  "Parallel" (include type like "Parallel - Prizm Gold"),
  "Rookie" (if rookie card),
  "GOAT" (if all-time great like Brady, LeBron, Jordan, etc),
  "HOF" (if hall of famer),
  "Elite" (if elite level player),
  "Superstar" (if superstar player),
  "Breakout" (if breakout/rising player)

Important: cardNumber is the card's catalog number like #304. printRun is the limited edition number like 1/5 or 45/99. These are different fields.
If cardNumber is not clearly visible, use empty string "".
No markdown, no extra text, only JSON.` }
          ]
        }]
      })
    });
    const data = await response.json();
    const text = (data.content || []).map(b => b.text || '').join('').replace(/```json/g,'').replace(/```/g,'').trim();
    const match = text.match(/\{[\s\S]*\}/);
    if (!match) return res.status(500).json({ error: 'No JSON found' });
    res.json(JSON.parse(match[0]));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/comp', async (req, res) => {
  try {
    const { player, year, brand, cardNumber, variation, grade, printRun } = req.body;
    
    const parts = [
      player,
      year,
      brand,
      cardNumber ? `#${cardNumber}` : null,
      variation || null,
      printRun ? `${printRun}` : null,
      grade && grade !== 'Raw' ? grade : null
    ].filter(Boolean);

    const searchQuery = parts.join(' ');
    const cardLadderUrl = `https://app.cardladder.com`;
    
    res.json({ cardLadderUrl, searchQuery });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/{*path}', (req, res) => {
  res.sendFile(path.join(__dirname, 'build', 'index.html'));
});

app.listen(process.env.PORT || 3001, () => console.log('Server running'));
