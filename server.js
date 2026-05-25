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
- cardNumber (string)
- variation (string)
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

function extractAllText(content) {
  let text = '';
  for (const block of (content || [])) {
    if (block.type === 'text') {
      text += block.text + ' ';
    } else if (block.type === 'tool_result') {
      if (Array.isArray(block.content)) {
        for (const inner of block.content) {
          if (inner.type === 'text') text += inner.text + ' ';
        }
      } else if (typeof block.content === 'string') {
        text += block.content + ' ';
      }
    }
  }
  return text.trim();
}

app.post('/comp', async (req, res) => {
  try {
    const { player, year, brand, cardNumber, variation, grade, rookie } = req.body;
    const gradeClean = grade || 'Raw';
    const now = new Date();
    const currentMonth = now.toLocaleString('default', { month: 'long' });
    const currentYear = now.getFullYear();
    const cardDesc = `${year} ${brand} ${player} ${cardNumber ? '#' + cardNumber : ''} ${variation || ''} ${gradeClean}`.trim();

    const searchQuery = `${player} ${year} ${brand} ${cardNumber ? '#'+cardNumber : ''} ${variation || ''} ${gradeClean} sold`;

    const step1 = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': process.env.ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 2048,
        tools: [{ type: 'web_search_20250305', name: 'web_search' }],
        messages: [{
          role: 'user',
          content: `Search for "${searchQuery}" on eBay completed listings. List every price you find.`
        }]
      })
    });

    const step1Data = await step1.json();
    const searchText = step1Data.error ? '' : extractAllText(step1Data.content);

    const step2 = await fetch('https://api.anthropic.com/v1/messages', {
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
          content: `Card: ${cardDesc}
Today: ${currentMonth} ${currentYear}
Search results: ${searchText.substring(0, 2000)}

Give me 3 recent sold prices for this card. Use real prices from search if available, otherwise estimate current ${currentYear} market value. Be realistic, not inflated.

Return ONLY this JSON:
{"sales":[{"price":PRICE1,"date":"DATE1","title":"${cardDesc}"},{"price":PRICE2,"date":"DATE2","title":"${cardDesc}"},{"price":PRICE3,"date":"DATE3","title":"${cardDesc}"}],"suggestedComp":AVERAGE}`
        }]
      })
    });

    const step2Data = await step2.json();
    const text = (step2Data.content || [])
      .map(b => b.text || '')
      .join('')
      .replace(/```json/g,'')
      .replace(/```/g,'')
      .trim();

    const match = text.match(/\{[\s\S]*\}/);
    if (!match) return res.status(500).json({ error: 'No comp data found' });
    res.json(JSON.parse(match[0]));
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

app.get('/{*path}', (req, res) => {
  res.sendFile(path.join(__dirname, 'build', 'index.html'));
});

app.listen(process.env.PORT || 3001, () => console.log('Server running'));
