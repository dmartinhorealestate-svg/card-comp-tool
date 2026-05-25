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
          content: `Search for recent sold prices for: "${cardDesc}". Look for actual eBay sales from 2025 or 2026.`
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
          content: `I need recent eBay comp values for this sports card: ${cardDesc}

Search data found: ${searchText.substring(0, 2000) || 'No search data available'}

Today is ${currentMonth} ${currentYear}. Based on the search data above AND your knowledge of current sports card market values, provide 3 realistic recent sold prices for this SPECIFIC card.

Important: 
- Use realistic current market prices (not inflated old prices)
- All dates must be real months like "May 2026" or "Mar 2026"
- The suggestedComp should be the average

Return ONLY this JSON with no other text:
{"sales":[{"price":65.00,"date":"May 2026","title":"${cardDesc}"},{"price":58.00,"date":"Apr 2026","title":"${cardDesc}"},{"price":55.00,"date":"Mar 2026","title":"${cardDesc}"}],"suggestedComp":59.33}`
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
