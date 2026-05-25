import React, { useState, useEffect } from 'react';

function App() {
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

  function handleImageUpload(e) {
    const file = e.target.files[0];
    if (file) {
      setImageURL(URL.createObjectURL(file));
      setCardData(null);
      setEditData(null);
      setConfirmed(false);
      setCompResult(null);
      setCompValue('');
      const reader = new FileReader();
      reader.onload = () => setImageBase64(reader.result.split(',')[1]);
      reader.readAsDataURL(file);
    }
  }

  async function analyzeCard() {
    if (!imageBase64) return;
    setLoading(true);
    setCardData(null);
    setEditData(null);
    setConfirmed(false);
    setCompResult(null);
    try {
      const response = await fetch('/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ imageBase64 }),
      });
      const parsed = await response.json();
      if (parsed.error) throw new Error(parsed.error);
      setCardData(parsed);
      setEditData({ ...parsed, rookie: false, grade: 'Raw', tags: parsed.tags || [] });
    } catch (err) {
      setCardData({ error: 'Could not parse card data. Try again.' });
    }
    setLoading(false);
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
    try {
      const response = await fetch('/comp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(editData),
      });
      const data = await response.json();
      if (data.error) throw new Error(data.error);
      setCompResult(data);
      setCompValue(data.suggestedComp?.toString() || '');
      setConfirmed(true);
    } catch (err) {
      setCompResult({ error: 'Could not find comps. Try again.' });
    }
    setCompLoading(false);
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
    setConfirmed(false);
    setCardData(null);
    setEditData(null);
    setImageURL(null);
    setImageBase64(null);
    setCompResult(null);
    setCompValue('');
    setShowOffer(false);
    setOfferData(null);
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
    setOfferData({
      offerPrice: Math.round(offerTotal * 100) / 100
    });
    setShowOffer(true);
  }

  const fields = ['player', 'year', 'brand', 'cardNumber', 'variation'];
  const grades = ['Raw', 'PSA 7', 'PSA 8', 'PSA 9', 'PSA 10', 'BGS 9', 'BGS 9.5', 'BGS 10'];
  const allTags = ['Auto', 'RPA', 'Numbered', 'Case Hit', 'Parallel', 'Rookie', 'GOAT', 'HOF', 'Elite', 'Superstar', 'Breakout'];

  return (
    <div style={{ fontFamily: 'sans-serif', maxWidth: '600px', margin: '0 auto', padding: '20px' }}>
      <h1>Card Comp Tool</h1>
      <p>Cards logged: {cards.length} | Running Total: ${total.toFixed(2)}</p>
      <hr />

      {cards.length > 0 && (
        <div>
          <h3>Session Cards:</h3>
          {cards.map((c, i) => (
            <div key={i} style={{ padding: '10px', background: '#f0f9f0', borderRadius: '6px', marginBottom: '8px' }}>
              <strong>Card {i + 1}:</strong> {c.player} {c.year} {c.grade} {c.rookie ? '⭐ RC' : ''} - ${c.compValue.toFixed(2)}
              {c.tags && c.tags.length > 0 && (
                <div style={{ marginTop: '4px' }}>
                  {c.tags.map(tag => (
                    <span key={tag} style={{ background: '#9C27B0', color: 'white', borderRadius: '4px', padding: '2px 6px', fontSize: '12px', marginRight: '4px' }}>{tag}</span>
                  ))}
                </div>
              )}
            </div>
          ))}
          <div style={{ display: 'flex', gap: '10px', marginBottom: '20px' }}>
            <button onClick={clearSession} style={{ padding: '10px 20px', background: '#e74c3c', color: 'white', border: 'none', borderRadius: '6px' }}>
              Clear Session
            </button>
            <button onClick={calculateOffer} style={{ padding: '10px 20px', background: '#2196F3', color: 'white', border: 'none', borderRadius: '6px' }}>
              Calculate Offer
            </button>
          </div>

          {showOffer && offerData && (
            <div style={{ padding: '20px', background: '#1a1a2e', borderRadius: '8px', marginBottom: '20px', color: 'white' }}>
              <h3 style={{ marginTop: 0 }}>Collection Offer</h3>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '22px', background: '#9C27B0', padding: '12px', borderRadius: '6px' }}>
                <span>Offer Price:</span>
                <strong>${offerData.offerPrice.toFixed(2)}</strong>
              </div>
            </div>
          )}
        </div>
      )}

      <h2>Upload a Card</h2>
      <input type="file" accept="image/*" onChange={handleImageUpload} />

      {imageURL && (
        <div>
          <img src={imageURL} alt="card" style={{ maxWidth: '100%', marginTop: '10px', borderRadius: '8px' }} />
          {!cardData && (
            <button onClick={analyzeCard} disabled={loading} style={{ marginTop: '10px', padding: '10px 20px', background: '#2196F3', color: 'white', border: 'none', borderRadius: '6px', fontSize: '16px' }}>
              {loading ? 'Analyzing...' : 'Analyze Card'}
            </button>
          )}
        </div>
      )}

      {cardData && cardData.error && <p style={{ color: 'red' }}>{cardData.error}</p>}

      {editData && !confirmed && !cardData.error && (
        <div style={{ marginTop: '20px', padding: '15px', background: '#f5f5f5', borderRadius: '8px' }}>
          <h3>Edit Card Details:</h3>
          {fields.map(field => (
            <div key={field} style={{ marginBottom: '10px' }}>
              <label style={{ display: 'block', fontWeight: 'bold', marginBottom: '4px', textTransform: 'capitalize' }}>{field}:</label>
              <input
                type="text"
                value={editData[field] || ''}
                onChange={e => handleEditChange(field, e.target.value)}
                style={{ width: '100%', padding: '8px', fontSize: '16px', borderRadius: '6px', border: '1px solid #ccc', boxSizing: 'border-box' }}
              />
            </div>
          ))}

          <div style={{ marginBottom: '12px' }}>
            <label style={{ display: 'block', fontWeight: 'bold', marginBottom: '4px' }}>Grade:</label>
            <select value={editData.grade || 'Raw'} onChange={e => handleEditChange('grade', e.target.value)}
              style={{ width: '100%', padding: '8px', fontSize: '16px', borderRadius: '6px', border: '1px solid #ccc' }}>
              {grades.map(g => <option key={g} value={g}>{g}</option>)}
            </select>
          </div>

          <div style={{ marginBottom: '16px' }}>
            <label style={{ display: 'block', fontWeight: 'bold', marginBottom: '8px' }}>Tags:</label>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
              {allTags.map(tag => (
                <button key={tag} onClick={() => toggleTag(tag)}
                  style={{ padding: '6px 12px', background: (editData.tags || []).includes(tag) ? '#9C27B0' : '#ddd', color: (editData.tags || []).includes(tag) ? 'white' : '#333', border: 'none', borderRadius: '20px', fontSize: '14px', cursor: 'pointer' }}>
                  {tag}
                </button>
              ))}
            </div>
            {editData.grade && editData.grade !== 'Raw' && (
              <p style={{ fontSize: '13px', color: '#666', marginTop: '6px' }}>+ Graded tag auto-applied</p>
            )}
            <p style={{ fontSize: '13px', color: '#9C27B0', marginTop: '4px' }}>
              Total tags: {(editData.tags || []).length + (editData.grade && editData.grade !== 'Raw' ? 1 : 0)}
              {((editData.tags || []).length + (editData.grade && editData.grade !== 'Raw' ? 1 : 0)) >= 4 ? ' → 85% offer' : ' → 70% offer'}
            </p>
          </div>

          <button onClick={getComps} disabled={compLoading}
            style={{ padding: '12px 24px', background: '#9C27B0', color: 'white', border: 'none', borderRadius: '6px', fontSize: '16px', width: '100%' }}>
            {compLoading ? 'Finding Comps...' : '🔍 Get Comps'}
          </button>

          {compResult && compResult.error && <p style={{ color: 'red', marginTop: '10px' }}>{compResult.error}</p>}
        </div>
      )}

      {confirmed && compResult && (
        <div style={{ marginTop: '20px', padding: '15px', background: '#f3e5f5', borderRadius: '8px' }}>
          <h3>Recent Sales:</h3>
          {compResult.sales && compResult.sales.map((s, i) => (
            <div key={i} style={{ padding: '8px', background: 'white', borderRadius: '6px', marginBottom: '6px', display: 'flex', justifyContent: 'space-between' }}>
              <span>{s.date}</span>
              <strong>${s.price}</strong>
            </div>
          ))}
          <div style={{ marginTop: '12px', padding: '12px', background: '#9C27B0', color: 'white', borderRadius: '6px', textAlign: 'center', fontSize: '18px' }}>
            Suggested Comp: <strong>${compResult.suggestedComp}</strong>
          </div>

          <h3 style={{ marginTop: '16px' }}>Enter Comp Value:</h3>
          <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
            <input type="number" placeholder="Enter $ value" value={compValue}
              onChange={e => setCompValue(e.target.value)}
              style={{ padding: '10px', fontSize: '16px', flex: 1, borderRadius: '6px', border: '1px solid #ccc' }} />
            <button onClick={addToTotal}
              style={{ padding: '10px 20px', background: '#2196F3', color: 'white', border: 'none', borderRadius: '6px', fontSize: '16px' }}>
              Add to Total
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

export default App;
