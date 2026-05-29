import React, { useState, useEffect } from 'react';

function App() {
  const [queue, setQueue] = useState([]);
  const [queueIndex, setQueueIndex] = useState(0);
  const [imageBase64, setImageBase64] = useState(null);
  const [imageURL, setImageURL] = useState(null);
  const [cardData, setCardData] = useState(null);
  const [editData, setEditData] = useState(null);
  const [confirmed, setConfirmed] = useState(false);
  const [loading, setLoading] = useState(false);
  const [compLoading, setCompLoading] = useState(false);
  const [compResult, setCompResult] = useState(null);
  const [compValue, setCompValue] = useState('');
  const [cards, setCards] = useState([]);
  const [total, setTotal] = useState(0);
  const [showOffer, setShowOffer] = useState(false);
  const [offerData, setOfferData] = useState(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    fetch('/cards')
      .then(r => r.json())
      .then(data => {
        if (data.cards) {
          setCards(data.cards);
          setTotal(data.cards.reduce((sum, c) => sum + c.compValue, 0));
        }
      })
      .catch(() => {});
  }, []);

  async function analyzeImage(base64) {
    setLoading(true);
    setCardData(null);
    setEditData(null);
    setConfirmed(false);
    setCompResult(null);
    try {
      const response = await fetch('/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ imageBase64: base64 }),
      });
      const parsed = await response.json();
      if (parsed.error) throw new Error(parsed.error);
      setCardData(parsed);
      setEditData({ ...parsed, grade: 'Raw', tags: parsed.tags || [], printRun: parsed.printRun || '' });
    } catch (err) {
      setCardData({ error: 'Could not parse card data. Try again.' });
    }
    setLoading(false);
  }

  function loadImageFromFile(file) {
    const url = URL.createObjectURL(file);
    setImageURL(url);
    setCardData(null);
    setEditData(null);
    setConfirmed(false);
    setCompResult(null);
    setCompValue('');
    setCopied(false);
    const reader = new FileReader();
    reader.onload = () => {
      const base64 = reader.result.split(',')[1];
      setImageBase64(base64);
      analyzeImage(base64);
    };
    reader.readAsDataURL(file);
  }

  function handleImageUpload(e) {
    const files = Array.from(e.target.files);
    if (files.length === 0) return;
    setQueue(files);
    setQueueIndex(0);
    loadImageFromFile(files[0]);
  }

  function handleEditChange(field, value) {
    setEditData(prev => ({ ...prev, [field]: value }));
  }

  function toggleTag(tag) {
    setEditData(prev => {
      const tags = prev.tags || [];
      return {
        ...prev,
        tags: tags.includes(tag) ? tags.filter(t => t !== tag) : [...tags, tag]
      };
    });
  }

  async function getComps() {
    setCompLoading(true);
    setCompResult(null);
    setCopied(false);
    try {
      const response = await fetch('/comp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(editData),
      });
      const data = await response.json();
      if (data.error) throw new Error(data.error);
      setCompResult(data);
      setConfirmed(true);
    } catch (err) {
      setCompResult({ error: 'Could not generate Card Ladder link. Try again.' });
    }
    setCompLoading(false);
  }

  function copySearchText() {
    navigator.clipboard.writeText(compResult.searchQuery);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  async function deleteCard(index) {
    const newCards = cards.filter((_, i) => i !== index);
    const newTotal = newCards.reduce((sum, c) => sum + c.compValue, 0);
    await fetch('/cards', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ cards: newCards }),
    });
    setCards(newCards);
    setTotal(newTotal);
  }

  async function addToTotal() {
    const value = parseFloat(compValue);
    if (isNaN(value)) return;
    const newCard = { ...editData, compValue: value };
    const response = await fetch('/cards', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(newCard),
    });
    const data = await response.json();
    if (data.cards) {
      setCards(data.cards);
      setTotal(data.cards.reduce((sum, c) => sum + c.compValue, 0));
    }

    const nextIndex = queueIndex + 1;
    if (nextIndex < queue.length) {
      setQueueIndex(nextIndex);
      loadImageFromFile(queue[nextIndex]);
    } else {
      setQueue([]);
      setQueueIndex(0);
      setConfirmed(false);
      setCardData(null);
      setEditData(null);
      setImageURL(null);
      setImageBase64(null);
      setCompResult(null);
      setCompValue('');
      setCopied(false);
    }
  }

  async function clearSession() {
    await fetch('/cards', { method: 'DELETE' });
    setCards([]);
    setTotal(0);
    setShowOffer(false);
    setOfferData(null);
  }

  function calculateOffer() {
    let offerTotal = 0;
    cards.forEach(card => {
      const tagCount = (card.tags || []).length + (card.grade && card.grade !== 'Raw' ? 1 : 0);
      const pct = tagCount >= 4 ? 0.85 : 0.70;
      offerTotal += card.compValue * pct;
    });
    setOfferData({ offerPrice: Math.round(offerTotal * 100) / 100 });
    setShowOffer(true);
  }

  const fields = ['player', 'year', 'brand', 'cardNumber', 'variation'];
  const grades = ['Raw', 'PSA 7', 'PSA 8', 'PSA 9', 'PSA 10', 'BGS 9', 'BGS 9.5', 'BGS 10'];
  const allTags = ['Auto', 'RPA', 'Numbered', 'Case Hit', 'Parallel', 'Rookie', 'GOAT', 'HOF', 'Elite', 'Superstar', 'Breakout'];

  const styles = {
    app: { fontFamily: 'sans-serif', maxWidth: '600px', margin: '0 auto', padding: '20px', minHeight: '100vh', backgroundColor: '#0a0a0a', color: 'white' },
    header: { textAlign: 'center', marginBottom: '20px' },
    logo: { width: '180px', marginBottom: '10px' },
    totalBar: { background: '#1a1a1a', border: '1px solid #FF6B00', borderRadius: '8px', padding: '12px 16px', marginBottom: '20px', display: 'flex', justifyContent: 'space-between', fontSize: '16px' },
    orangeText: { color: '#FF6B00', fontWeight: 'bold' },
    card: { padding: '10px', background: '#1a1a1a', border: '1px solid #333', borderRadius: '6px', marginBottom: '8px' },
    tag: { background: '#FF6B00', color: 'white', borderRadius: '4px', padding: '2px 6px', fontSize: '12px', marginRight: '4px' },
    btnOrange: { padding: '10px 20px', background: '#FF6B00', color: 'white', border: 'none', borderRadius: '6px', fontSize: '16px', cursor: 'pointer' },
    btnRed: { padding: '10px 20px', background: '#c0392b', color: 'white', border: 'none', borderRadius: '6px', fontSize: '16px', cursor: 'pointer' },
    btnBlue: { padding: '10px 20px', background: '#1565C0', color: 'white', border: 'none', borderRadius: '6px', fontSize: '16px', cursor: 'pointer' },
    section: { background: '#1a1a1a', border: '1px solid #333', borderRadius: '8px', padding: '15px', marginTop: '20px' },
    label: { display: 'block', fontWeight: 'bold', marginBottom: '4px', color: '#FF6B00', textTransform: 'capitalize' },
    input: { width: '100%', padding: '8px', fontSize: '16px', borderRadius: '6px', border: '1px solid #444', boxSizing: 'border-box', background: '#0a0a0a', color: 'white' },
    select: { width: '100%', padding: '8px', fontSize: '16px', borderRadius: '6px', border: '1px solid #444', background: '#0a0a0a', color: 'white' },
    offerBox: { padding: '20px', background: '#1a1a1a', border: '2px solid #FF6B00', borderRadius: '8px', marginBottom: '20px', color: 'white' },
    queueBar: { background: '#1a1a1a', border: '1px solid #FF6B00', borderRadius: '8px', padding: '10px 16px', marginBottom: '16px', textAlign: 'center', color: '#FF6B00', fontWeight: 'bold', fontSize: '16px' },
  };

  return (
    <div style={styles.app}>
      <div style={styles.header}>
        <img src="/logo.jpg" alt="CM Collectibles" style={styles.logo} />
      </div>

      <div style={styles.totalBar}>
        <span>Cards: <span style={styles.orangeText}>{cards.length}</span></span>
        <span>Total: <span style={styles.orangeText}>${total.toFixed(2)}</span></span>
      </div>

      {cards.length > 0 && (
        <div>
          <h3 style={{ color: '#FF6B00' }}>Session Cards:</h3>
          {cards.map((c, i) => (
            <div key={i} style={{ ...styles.card, display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
              <div>
                <strong>{c.player}</strong> {c.year} {c.grade} — <span style={styles.orangeText}>${c.compValue.toFixed(2)}</span>
                {c.printRun && <span style={{ marginLeft: '6px', color: '#FF6B00' }}>#{c.printRun}</span>}
                {c.tags && c.tags.length > 0 && (
                  <div style={{ marginTop: '4px' }}>
                    {c.tags.map(tag => <span key={tag} style={styles.tag}>{tag}</span>)}
                  </div>
                )}
              </div>
              <button onClick={() => deleteCard(i)} style={{ background: '#c0392b', color: 'white', border: 'none', borderRadius: '4px', padding: '4px 8px', cursor: 'pointer', fontSize: '16px', marginLeft: '8px' }}>✕</button>
            </div>
          ))}
          <div style={{ display: 'flex', gap: '10px', marginBottom: '20px', marginTop: '10px' }}>
            <button onClick={clearSession} style={styles.btnRed}>Clear Session</button>
            <button onClick={calculateOffer} style={styles.btnOrange}>Calculate Offer</button>
          </div>

          {showOffer && offerData && (
            <div style={styles.offerBox}>
              <h3 style={{ marginTop: 0, color: '#FF6B00' }}>Collection Offer</h3>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '24px', background: '#FF6B00', padding: '12px', borderRadius: '6px' }}>
                <span>Offer Price:</span>
                <strong>${offerData.offerPrice.toFixed(2)}</strong>
              </div>
            </div>
          )}
        </div>
      )}

      <div style={styles.section}>
        <h2 style={{ color: '#FF6B00', marginTop: 0 }}>Upload Cards</h2>
        <input type="file" accept="image/*" multiple onChange={handleImageUpload} style={{ color: 'white' }} />

        {queue.length > 1 && (
          <div style={styles.queueBar}>
            Card {queueIndex + 1} of {queue.length}
          </div>
        )}

        {imageURL && (
          <div>
            <img src={imageURL} alt="card" style={{ maxWidth: '100%', marginTop: '10px', borderRadius: '8px' }} />
            {loading && (
              <div style={{ textAlign: 'center', marginTop: '12px', color: '#FF6B00', fontSize: '16px' }}>
                🔍 Analyzing card...
              </div>
            )}
          </div>
        )}

        {cardData && cardData.error && <p style={{ color: 'red' }}>{cardData.error}</p>}
      </div>

      {editData && !confirmed && !cardData?.error && (
        <div style={styles.section}>
          <h3 style={{ color: '#FF6B00', marginTop: 0 }}>Edit Card Details:</h3>
          {fields.map(field => (
            <div key={field} style={{ marginBottom: '10px' }}>
              <label style={styles.label}>{field}:</label>
              <input type="text" value={editData[field] || ''} onChange={e => handleEditChange(field, e.target.value)} style={styles.input} />
            </div>
          ))}

          <div style={{ marginBottom: '10px' }}>
            <label style={styles.label}>Print Run (if numbered, e.g. 1/5):</label>
            <input type="text" value={editData.printRun || ''} onChange={e => handleEditChange('printRun', e.target.value)} placeholder="e.g. 1/5 or 45/99" style={styles.input} />
          </div>

          <div style={{ marginBottom: '12px' }}>
            <label style={styles.label}>Grade:</label>
            <select value={editData.grade || 'Raw'} onChange={e => handleEditChange('grade', e.target.value)} style={styles.select}>
              {grades.map(g => <option key={g} value={g}>{g}</option>)}
            </select>
          </div>

          <div style={{ marginBottom: '16px' }}>
            <label style={styles.label}>Tags:</label>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
              {allTags.map(tag => (
                <button key={tag} onClick={() => toggleTag(tag)}
                  style={{ padding: '6px 12px', background: (editData.tags || []).includes(tag) ? '#FF6B00' : '#333', color: 'white', border: 'none', borderRadius: '20px', fontSize: '14px', cursor: 'pointer' }}>
                  {tag}
                </button>
              ))}
            </div>
            {editData.grade && editData.grade !== 'Raw' && (
              <p style={{ fontSize: '13px', color: '#aaa', marginTop: '6px' }}>+ Graded tag auto-applied</p>
            )}
            <p style={{ fontSize: '13px', color: '#FF6B00', marginTop: '4px' }}>
              Total tags: {(editData.tags || []).length + (editData.grade && editData.grade !== 'Raw' ? 1 : 0)}
              {((editData.tags || []).length + (editData.grade && editData.grade !== 'Raw' ? 1 : 0)) >= 4 ? ' → 85% offer' : ' → 70% offer'}
            </p>
          </div>

          <button onClick={getComps} disabled={compLoading} style={{ ...styles.btnOrange, width: '100%', padding: '14px' }}>
            {compLoading ? 'Loading...' : '🔍 Get Comps'}
          </button>

          {compResult && compResult.error && <p style={{ color: 'red', marginTop: '10px' }}>{compResult.error}</p>}
        </div>
      )}

      {confirmed && compResult && compResult.cardLadderUrl && (
        <div style={styles.section}>
          <label style={styles.label}>Search Text:</label>
          <div style={{ display: 'flex', gap: '8px', marginBottom: '16px' }}>
            <div style={{ flex: 1, padding: '10px', background: '#0a0a0a', borderRadius: '6px', border: '1px solid #444', fontSize: '14px', wordBreak: 'break-all', color: 'white' }}>
              {compResult.searchQuery}
            </div>
            <button onClick={copySearchText}
              style={{ padding: '10px 16px', background: copied ? '#4CAF50' : '#555', color: 'white', border: 'none', borderRadius: '6px', fontSize: '14px', whiteSpace: 'nowrap', cursor: 'pointer' }}>
              {copied ? '✓ Copied!' : 'Copy'}
            </button>
          </div>

          <a href={compResult.cardLadderUrl} target="_blank" rel="noopener noreferrer"
            style={{ display: 'block', padding: '14px', background: '#FF6B00', color: 'white', borderRadius: '6px', textAlign: 'center', fontSize: '18px', textDecoration: 'none', marginBottom: '16px', fontWeight: 'bold' }}>
            📊 Open Card Ladder
          </a>

          <h3 style={{ color: '#FF6B00' }}>Enter Comp Value:</h3>
          <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
            <input
              type="number"
              placeholder="Enter $ value"
              value={compValue}
              onChange={e => setCompValue(e.target.value)}
              inputMode="decimal"
              autoFocus
              style={{ ...styles.input, flex: 1 }}
            />
            <button onClick={addToTotal} style={styles.btnBlue}>
              {queue.length > 1 && queueIndex < queue.length - 1 ? 'Add & Next Card' : 'Add to Total'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

export default App;
