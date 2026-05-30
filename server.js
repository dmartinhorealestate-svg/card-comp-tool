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
const APP_PASSWORD = process.env.APP_PASSWORD || '0801';

function loadSession() {
  try {
    const data = fs.readFileSync(SESSIONS_FILE, 'utf8');
    const parsed = JSON.parse(data);
    if (Array.isArray(parsed)) return { cards: parsed, sessionName: '', lowPct: 70, highPct: 85 };
    return parsed;
  } catch { return { cards: [], sessionName: '', lowPct: 70, highPct: 85 }; }
}

function saveSession(session) {
  fs.writeFileSync(SESSIONS_FILE, JSON.stringify(session));
}

function checkAuth(req, res, next) {
  const pw = req.headers['x-app-password'];
  if (pw !== APP_PASSWORD) return res.status(401).json({ error: 'Unauthorized' });
  next();
}

app.get('/cards', checkAuth, (req, res) => {
  const session = loadSession();
  res.json({
    cards: session.cards || [],
    sessionName: session.sessionName || '',
    lowPct: session.lowPct !== undefined ? session.lowPct : 70,
    highPct: session.highPct !== undefined ? session.highPct : 85,
  });
});

app.post('/cards', checkAuth, (req, res) => {
  const session = loadSession();
  if (!Array.isArray(session.cards)) session.cards = [];
  session.cards.push(req.body);
  saveSession(session);
  res.json({
    cards: session.cards,
    sessionName: session.sessionName || '',
    lowPct: session.lowPct !== undefined ? session.lowPct : 70,
    highPct: session.highPct !== undefined ? session.highPct : 85,
  });
});

app.put('/cards', checkAuth, (req, res) => {
  const session = loadSession();
  session.cards = req.body.cards;
  saveSession(session);
  res.json({
    cards: session.cards,
    sessionName: session.sessionName || '',
    lowPct: session.lowPct !== undefined ? session.lowPct : 70,
    highPct: session.highPct !== undefined ? session.highPct : 85,
  });
});

app.put('/session-name', checkAuth, (req, res) => {
  const session = loadSession();
  session.sessionName = req.body.sessionName || '';
  saveSession(session);
  res.json({ sessionName: session.sessionName });
});

app.put('/percentages', checkAuth, (req, res) => {
  const session = loadSession();
  session.lowPct = parseFloat(req.body.lowPct) || 70;
  session.highPct = parseFloat(req.body.highPct) || 85;
  saveSession(session);
  res.json({ lowPct: session.lowPct, highPct: session.highPct });
});

app.delete('/cards', checkAuth, (req, res) => {
  const session = loadSession();
  session.cards = [];
  session.sessionName = req.body.sessionName || '';
  saveSession(session);
  res.json({ cards: [], sessionName: session.sessionName });
});

app.get('/print', (req, res) => {
  const pw = req.query.pw;
  if (pw !== APP_PASSWORD) return res.status(401).send('Unauthorized');

  const session = loadSession();
  const cards = session.cards || [];
  const sessionName = session.sessionName || 'Session';
  const lowPct = session.lowPct !== undefined ? session.lowPct : 70;
  const highPct = session.highPct !== undefined ? session.highPct : 85;
  const total = cards.reduce((sum, c) => sum + c.compValue, 0);
  const buyTotal = cards.reduce((sum, c) => {
    const tagCount = (c.tags || []).length + (c.grade && c.grade !== 'Raw' ? 1 : 0);
    const pct = tagCount >= 4 ? highPct / 100 : lowPct / 100;
    return sum + c.compValue * pct;
  }, 0);

  let rows = '';
  cards.forEach((c, i) => {
    const tagCount = (c.tags || []).length + (c.grade && c.grade !== 'Raw' ? 1 : 0);
    const pct = tagCount >= 4 ? highPct / 100 : lowPct / 100;
    const buyPrice = (c.compValue * pct).toFixed(2);
    const pctLabel = tagCount >= 4 ? highPct + '%' : lowPct + '%';
    const tags = c.tags && c.tags.length > 0 ? c.tags.join(', ') : '-';
    rows += '<tr>';
    rows += '<td>' + (i + 1) + '</td>';
    rows += '<td>' + c.player + '</td>';
    rows += '<td>' + c.year + '</td>';
    rows += '<td>' + c.brand + '</td>';
    rows += '<td>' + (c.grade || 'Raw') + '</td>';
    rows += '<td>' + tags + '</td>';
    rows += '<td>$' + c.compValue.toFixed(2) + '</td>';
    rows += '<td>$' + buyPrice + ' <span style="font-size:11px;color:#888;">(' + pctLabel + ')</span></td>';
    rows += '<td></td>';
    rows += '</tr>';
  });

  const date = new Date().toLocaleDateString();

  let html = '<!DOCTYPE html>';
  html += '<html><head><title>CM Collectibles - ' + sessionName + '</title>';
  html += '<style>';
  html += 'body { font-family: sans-serif; padding: 24px; color: #000; }';
  html += 'h1 { color: #FF6B00; margin-bottom: 4px; }';
  html += 'h2 { margin: 0 0 4px; color: #333; font-size: 18px; }';
  html += 'p { margin: 0 0 16px; color: #555; font-size: 14px; }';
  html += 'table { width: 100%; border-collapse: collapse; font-size: 13px; }';
  html += 'th { background: #FF6B00; color: white; padding: 8px; text-align: left; }';
  html += 'td { padding: 8px; border-bottom: 1px solid #ddd; }';
  html += 'tr:nth-child(even) { background: #f9f9f9; }';
  html += '.total { font-weight: bold; font-size: 15px; margin-top: 16px; text-align: right; }';
  html += '@media print { button { display: none; } }';
  html += '</style></head><body>';
  html += '<h1>CM Collectibles</h1>';
  html += '<h2>' + sessionName + '</h2>';
  html += '<p>' + date + '</p>';
  html += '<table><thead><tr>';
  html += '<th>#</th><th>Player</th><th>Year</th><th>Brand</th><th>Grade</th><th>Tags</th><th>Comp Value</th><th>Buy Price</th><th>Sold For</th>';
  html += '</tr></thead><tbody>';
  html += rows;
  html += '</tbody></table>';
  html += '<div class="total">Total Comp: $' + total.toFixed(2) + ' &nbsp;|&nbsp; Total Buy: $' + buyTotal.toFixed(2) + '</div>';
  html += '<br/><button onclick="window.print()" style="padding:10px 20px;background:#FF6B00;color:white;border:none;border-radius:6px;font-size:16px;cursor:pointer;">Print</button>';
  html += '</body></html>';

  res.send(html);
});

app.get('/export-csv', (req, res) => {
  const pw = req.query.pw;
  if (pw !== APP_PASSWORD) return res.status(401).send('Unauthorized');

  const session = loadSession();
  const cards = session.cards || [];
  const sessionName = session.sessionName || 'Session';
  const lowPct = session.lowPct !== undefined ? session.lowPct : 70;
  const highPct = session.highPct !== undefined ? session.highPct : 85;
  const date = new Date().toLocaleDateString();

  let csv = 'Session: ' + sessionName + '\n';
  csv += 'Date: ' + date + '\n\n';
  csv += '#,Player,Year,Brand,Grade,Card Number,Print Run,Tags,Comp Value,Buy Price,Sold For\n';

  cards.forEach((c, i) => {
    const tagCount = (c.tags || []).length + (c.grade && c.grade !== 'Raw' ? 1 : 0);
    const pct = tagCount >= 4 ? highPct / 100 : lowPct / 100;
    const buyPrice = (c.compValue * pct).toFixed(2);
    const tags = c.tags && c.tags.length > 0 ? c.tags.join(' | ') : '';
    csv += (i + 1) + ',';
    csv += '"' + (c.player || '') + '",';
    csv += '"' + (c.year || '') + '",';
    csv += '"' + (c.brand || '') + '",';
    csv += '"' + (c.grade || 'Raw') + '",';
    csv += '"' + (c.cardNumber || '') + '",';
    csv += '"' + (c.printRun || '') + '",';
    csv += '"' + tags + '",';
    csv += c.compValue.toFixed(2) + ',';
    csv += buyPrice + ',';
    csv += '\n';
  });

  const total = cards.reduce((sum, c) => sum + c.compValue, 0);
  const buyTotal = cards.reduce((sum, c) => {
    const tagCount = (c.tags || []).length + (c.grade && c.grade !== 'Raw' ? 1 : 0);
    const pct = tagCount >= 4 ? highPct / 100 : lowPct / 100;
    return sum + c.compValue * pct;
  }, 0);

  csv += '\n,,,,,,,,Total Comp,Total Buy,\n';
  csv += ',,,,,,,,' + total.toFixed(2) + ',' + buyTotal.toFixed(2) + ',\n';

  const filename = sessionName.replace(/[^a-z0-9]/gi, '_') + '_' + new Date().toISOString().slice(0,10) + '.csv';
  res.setHeader('Content-Type', 'text/csv');
  res.setHeader('Content-Disposition', 'attachment; filename="' + filename + '"');
  res.send(csv);
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
            { type: 'text', text: 'This is a sports card. Analyze it and respond with ONLY a JSON object with these fields:\n- player (string)\n- year (string)\n- brand (string)\n- cardNumber (string or empty string "" if not visible on the card)\n- variation (string)\n- printRun (string - ONLY if there is a print run number visible on the card. Return ONLY the total, formatted as "/Y". For example if you see "003/125" return "/125", if you see "045/99" return "/99", if you see "1/1" return "/1". If no print run visible, return empty string "")\n- tags (array of strings from this list only):\n  "Auto" (if autograph present),\n  "RPA" (if rookie patch auto),\n  "Numbered" (if print run shown like /10 /99 /149 etc),\n  "Case Hit",\n  "Parallel" (include type like "Parallel - Prizm Gold"),\n  "Rookie" (if rookie card),\n  "GOAT" (if all-time great like Brady, LeBron, Jordan, etc),\n  "HOF" (if hall of famer),\n  "Elite" (if elite level player),\n  "Superstar" (if superstar player),\n  "Breakout" (if breakout/rising player)\n\nImportant: cardNumber is the card catalog number like #304. printRun is the limited edition number shown as "/125" or "/99". These are different fields.\nIf cardNumber is not clearly visible, use empty string "".\nNo markdown, no extra text, only JSON.' }
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
      cardNumber ? '#' + cardNumber : null,
      variation || null,
      printRun ? printRun : null,
      grade && grade !== 'Raw' ? grade : null
    ].filter(Boolean);
    const searchQuery = parts.join(' ');
    const cardLadderUrl = 'https://app.cardladder.com';
    res.json({ cardLadderUrl, searchQuery });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/{*path}', (req, res) => {
  res.sendFile(path.join(__dirname, 'build', 'index.html'));
});

app.listen(process.env.PORT || 3001, () => console.log('Server running'));
