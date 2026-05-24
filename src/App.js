import React, { useState, useEffect } from 'react';

function App() {
  const [imageBase64, setImageBase64] = useState(null);
  const [imageURL, setImageURL] = useState(null);
  const [cardData, setCardData] = useState(null);
  const [editData, setEditData] = useState(null);
  const [confirmed, setConfirmed] = useState(false);
  const [loading, setLoading] = useState(false);
  const [compValue, setCompValue] = useState('');
  const [cards, setCards] = useState([]);
  const [total, setTotal] = useState(0);

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
      setCompValue('');
      const reader = new FileReader();
      reader.onload = () => {
        const base64 = reader.result.split(',')[1];
        setImageBase64(base64);
      };
      reader.readAsDataURL(file);
    }
  }

  async function analyzeCard() {
    if (!imageBase64) return;
    setLoading(true);
    setCardData(null);
    setEditData(null);
    setConfirmed(false);
    try {
      const response = await fetch('/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ imageBase64 }),
      });
      const parsed = await response.json();
      if (parsed.error) throw new Error(parsed.error);
      setCardData(parsed);
      setEditData({ ...parsed, rookie: false });
    } catch (err) {
      setCardData({ error: 'Could not parse card data. Try again.' });
    }
    setLoading(false);
  }

  function handleEditChange(field, value) {
    setEditData(prev => ({ ...prev, [field]: value }));
  }

  function confirmCard() {
    setCardData(editData);
    setConfirmed(true);
  }

  async function addToTotal() {
    const value = parseFloat(compValue);
    if (isNaN(value)) return;
    const newCard = { ...cardData, compValue: value };
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
    setCompValue('');
  }

  async function clearSession() {
    await fetch('/cards', { method: 'DELETE' });
    setCards([]);
    setTotal(0);
  }

  const fields = ['player', 'year', 'brand', 'cardNumber', 'variation'];

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
              <strong>Card {i + 1}:</strong> {c.player} {c.year} {c.rookie ? '⭐ RC' : ''} - ${c.compValue.toFixed(2)}
            </div>
          ))}
          <button onClick={clearSession} style={{ padding: '10px 20px', background: '#e74c3c', color: 'white', border: 'none', borderRadius: '6px', marginBottom: '20px' }}>
            Clear Session
          </button>
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

      {cardData && cardData.error && (
        <p style={{ color: 'red' }}>{cardData.error}</p>
      )}

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

          <div style={{ marginBottom: '16px' }}>
            <label style={{ display: 'block', fontWeight: 'bold', marginBottom: '8px' }}>Rookie Card?</label>
            <div style={{ display: 'flex', gap: '10px' }}>
              <button
                onClick={() => handleEditChange('rookie', true)}
                style={{ padding: '10px 24px', background: editData.rookie ? '#4CAF50' : '#ddd', color: editData.rookie ? 'white' : '#333', border: 'none', borderRadius: '6px', fontSize: '16px', fontWeight: 'bold' }}>
                Yes
              </button>
              <button
                onClick={() => handleEditChange('rookie', false)}
                style={{ padding: '10px 24px', background: !editData.rookie ? '#e74c3c' : '#ddd', color: !editData.rookie ? 'white' : '#333', border: 'none', borderRadius: '6px', fontSize: '16px', fontWeight: 'bold' }}>
                No
              </button>
            </div>
          </div>

          <button onClick={confirmCard} style={{ padding: '10px 20px', background: '#4CAF50', color: 'white', border: 'none', borderRadius: '6px', fontSize: '16px' }}>
            Confirm Card
          </button>
        </div>
      )}

      {confirmed && (
        <div style={{ marginTop: '20px', padding: '15px', background: '#e8f5e9', borderRadius: '8px' }}>
          <h3>Enter Comp Value:</h3>
          <input
            type="number"
            placeholder="Enter $ value"
            value={compValue}
            onChange={e => setCompValue(e.target.value)}
            style={{ padding: '10px', fontSize: '16px', width: '200px', marginRight: '10px' }}
          />
          <button onClick={addToTotal} style={{ padding: '10px 20px', background: '#2196F3', color: 'white', border: 'none', borderRadius: '6px', fontSize: '16px' }}>
            Add to Total
          </button>
        </div>
      )}
    </div>
  );
}

export default App;
