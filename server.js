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
    const isGraded = gradeClean !== 'Raw';
    const gradingCo = gradeClean.includes('PSA') ? 'PSA' : gradeClean.includes('BGS') ? 'BGS' : '';
    const gradeNum = gradeClean.replace('PSA ', '').replace('BGS ', '');

    const searchQuery = `${year} ${brand} ${player} ${cardNumber ? '#' + cardNumber : ''} ${variation || ''} ${isGraded ? gradingCo + ' ' + gradeNum : 'raw'} sold price 2025 2026`;

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
          content: `Search for: "${searchQuery}". Find at least 3 recent eBay sold prices with dates for this specific card.`
        }]
      })
    });

    const step1Data = await step1.json();
    if (step1Data.error) return res.status(500).json({ error: step1Data.error.message });
    const searchText = extractAllText(step1Data.content);

    const now = new Date();
    const currentMonth = now.toLocaleString('default', { month: 'long' });
    const currentYear = now.getFullYear();

    const step2 = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': process.env.ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 1024,
        messages: [{
          role: 'user',
          content: `Here is search data for: ${year} ${brand} ${player} ${cardNumber ? '#' + cardNumber : ''} ${variation || ''} ${gradeClean}

${searchText.substring(0, 4000)}

Today is ${currentMonth} ${currentYear}. Extract up to 3 recent sold prices with their actual dates. Every sale MUST have a real date like "May 2026" or "Apr 2026" - never use "Date not specified".

Return ONLY this JSON:
{"sales":[{"price":65.00,"date":"May 2026","title":"2020 Donruss Jordan Love PSA 10"},{"price":58.00,"date":"Apr 2026","title":"2020 Donruss Jordan Love PSA 10"},{"price":55.00,"date":"Mar 2026","title":"2020 Donruss Jordan Love PSA 10"}],"suggestedComp":59.00}`
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
