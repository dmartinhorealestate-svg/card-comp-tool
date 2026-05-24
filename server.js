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
            { type: 'text', text: 'This is a sports card. Respond with ONLY a JSON object with fields: player, year, brand, cardNumber, variation. No markdown, no extra text.' }
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
    const { player, year, brand, cardNumber, variation, grade, rookie } = req.body;
    const cardDesc = `${year} ${brand} ${player} ${variation || ''} ${rookie ? 'Rookie' : ''} ${grade || 'Raw'}`.trim();

    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': process.env.ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-5',
        max_tokens: 2048,
        tools: [{ type: 'web_search_20250305', name: 'web_search' }],
        messages: [
          {
            role: 'user',
            content: `Search eBay sold listings for "${cardDesc}" sports card and tell me the sold prices you find.`
          }
        ]
      })
    });

    const data = await response.json();
    if (data.error) return res.status(500).json({ error: data.error.message });

    const allText = (data.content || []).map(b => {
      if (b.type === 'text') return b.text;
      if (b.type === 'tool_result') return JSON.stringify(b.content);
      return '';
    }).join(' ');

    const prices = [];
    const priceRegex = /\$?([\d,]+\.?\d{0,2})/g;
    let match;
    while ((match = priceRegex.exec(allText)) !== null) {
      const val = parseFloat(match[1].replace(',', ''));
      if (val > 1 && val < 100000) prices.push(val);
    }

    if (prices.length === 0) {
      const parseResponse = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'x-api-key': process.env.ANTHROPIC_API_KEY,
          'anthropic-version': '2023-06-01',
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          model: 'claude-sonnet-4-5',
          max_tokens: 512,
          messages: [{
            role: 'user',
            content: `Based on your knowledge of sports card values, what would a "${cardDesc}" sell for on eBay? Give me only a JSON object like this with no other text: {"sales":[{"price":50.00,"date":"2025","title":"estimated value"}],"suggestedComp":50.00}`
          }]
        })
      });
      const parseData = await parseResponse.json();
      const parseText = (parseData.content || []).map(b => b.text || '').join('').replace(/```json/g,'').replace(/```/g,'').trim();
      const jsonMatch = parseText.match(/\{[\s\S]*\}/);
      if (!jsonMatch) return res.status(500).json({ error: 'No comp data found' });
      return res.json(JSON.parse(jsonMatch[0]));
    }

    const avg = prices.slice(0, 3).reduce((a, b) => a + b, 0) / Math.min(prices.length, 3);
    const sales = prices.slice(0, 3).map(p => ({ price: p, date: '2025', title: cardDesc }));
    res.json({ sales, suggestedComp: Math.round(avg * 100) / 100 });

  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

app.get('/{*path}', (req, res) => {
  res.sendFile(path.join(__dirname, 'build', 'index.html'));
});

app.listen(process.env.PORT || 3001, () => console.log('Server running'));
