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

async function searchEbaySold(query) {
  try {
    const encoded = encodeURIComponent(query);
    const url = `https://svcs.ebay.com/services/search/FindingService/v1?OPERATION-NAME=findCompletedItems&SERVICE-VERSION=1.0.0&SECURITY-APPNAME=${process.env.EBAY_APP_ID}&RESPONSE-DATA-FORMAT=JSON&keywords=${encoded}&itemFilter(0).name=SoldItemsOnly&itemFilter(0).value=true&sortOrder=EndTimeSoonest&paginationInput.entriesPerPage=5`;
    
    const response = await fetch(url);
    const data = await response.json();
    
    const items = data?.findCompletedItemsResponse?.[0]?.searchResult?.[0]?.item || [];
    console.log('eBay sold items found:', items.length);
    
    return items.map(item => ({
      title: item.title?.[0],
      price: item.sellingStatus?.[0]?.currentPrice?.[0]?.__value__,
      date: item.listingInfo?.[0]?.endTime?.[0]
    }));
  } catch (err) {
    console.error('eBay search error:', err);
    return [];
  }
}

app.post('/comp', async (req, res) => {
  try {
    const { player, year, brand, cardNumber, variation, grade, rookie } = req.body;
    const gradeClean = grade || 'Raw';
    const now = new Date();
    const currentMonth = now.toLocaleString('default', { month: 'long' });
    const currentYear = now.getFullYear();
    const cardDesc = `${year} ${brand} ${player} ${cardNumber ? '#' + cardNumber : ''} ${variation || ''} ${gradeClean}`.trim();

    const searchQuery = `${player} ${year} ${brand} ${cardNumber ? '#'+cardNumber : ''} ${variation || ''} ${gradeClean}`;
    const ebayItems = await searchEbaySold(searchQuery);

    let ebayText = '';
    if (ebayItems.length > 0) {
      ebayText = ebayItems.map(item => {
        const date = item.date ? new Date(item.date).toLocaleDateString('en-US', { month: 'short', year: 'numeric' }) : 'Recent';
        return `${item.title}: $${parseFloat(item.price).toFixed(2)} sold ${date}`;
      }).join('\n');
    }

    console.log('eBay sold results:', ebayText);

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
          content: `I need comp values for: ${cardDesc}
Today: ${currentMonth} ${currentYear}

eBay SOLD listings:
${ebayText || 'No sold listings found'}

Use the actual sold prices above. If no sold listings, estimate current ${currentYear} market value.

Return ONLY this JSON:
{"sales":[{"price":PRICE1,"date":"DATE1","title":"TITLE1"},{"price":PRICE2,"date":"DATE2","title":"TITLE2"},{"price":PRICE3,"date":"DATE3","title":"TITLE3"}],"suggestedComp":AVERAGE}`
        }]
      })
    });

    const data = await response.json();
    const text = (data.content || [])
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
