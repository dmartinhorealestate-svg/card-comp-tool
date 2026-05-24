import { useState, useEffect } from 'react';

function App() {
  const [image, setImage] = useState(null);
  const [imageBase64, setImageBase64] = useState(null);
  const [cardData, setCardData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [confirmed, setConfirmed] = useState(false);
  const [compValue, setCompValue] = useState('');
  const [cards, setCards] = useState([]);
  const [total, setTotal] = useState(0);

  useEffect(() => {
    fetch('http://localhost:3001/cards')
      .then(res => res.json())
      .then(savedCards => {
        setCards(savedCards);
        const savedTotal = savedCards.reduce((sum, c) => sum + c.compValue, 0);
        setTotal(savedTotal);
      });
  }, []);

  function handleImageUpload(e) {
    const file = e.target.files[0];
    if (file) {
      setImage(URL.createObjectURL(file));
      setCardData(null);
      setConfirmed(false);
      setCompValue('');
      const reader = new FileReader();
      reader.onloadend = () => {
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
    setConfirmed(false);
    try {
      const response = await fetch('http://localhost:3001/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ imageBase64 }),
      });
      const data = await response.json();
      const text = data.content.map(b => b.text || "").join("");
      const jsonMatch = text.match(/\{[\s\S]*\}/);
      if (!jsonMatch) throw new Error('No JSON found');
      const parsed = JSON.parse(jsonMatch[0]);
      setCardData(parsed);
    } catch (err) {
      setCardData({ error: 'Could not parse card data. Try again.' });
    }
    setLoading(false);
  }

  async function addToTotal() {
    const value = parseFloat(compValue);
    if (isNaN(value)) return;
    const newCard = { cardData, compValue: value };
    await fetch('http://localhost:3001/cards', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(newCard),
    });
    setCards([...cards, newCard]);
    setTotal(total + value);
    setImage(null);
    setImageBase64(null);
    setCardData(null);
    setConfirmed(false);
    setCompValue('');
  }

  async function clearSession() {
    await fetch('http://localhost:3001/cards', { method: 'DELETE' });
    setCards([]);
    setTotal(0);
  }

  const buySignal = cardData && cardData.tags && cardData.tags.length >= 3;

  return (
    <div style={{ padding: '20px', fontFamily: 'Arial', maxWidth: '600px', margin: '0 auto' }}>
      <h1>Card Comp Tool</h1>
      <p>Cards logged: {cards.length} | Running Total: ${total.toFixed(2)}</p>
      <hr />

      {cards.length > 0 && (
        <div style={{ marginBottom: '20px' }}>
          <h3>Session Cards:</h3>
          {cards.map((card, i) => (
            <div key={i} style={{ padding: '8px', background: '#e8f5e9', borderRadius: '6px', marginBottom: '6px' }}>
              <strong>Card {i + 1}:</strong> {card.cardData.player} {card.cardData.year} - ${card.compValue.toFixed(2)}
            </div>
          ))}
          <button onClick={clearSession} style={{ marginTop: '10px', padding: '8px 16px', background: '#f44336', color: 'white', border: 'none', borderRadius: '6px', fontSize: '14px' }}>
            Clear Session
          </button>
        </div>
      )}

      <h2>Upload a Card</h2>
      <input type="file" accept="image/*" onChange={handleImageUpload} />
      {image && <img src={image} alt="card" style={{ width: '100%', marginTop: '20px' }} />}
      {image && !cardData && (
        <button onClick={analyzeCard} style={{ marginTop: '10px', padding: '10px 20px', fontSize: '16px' }}>
          {loading ? 'Analyzing...' : 'Identify Card'}
        </button>
      )}

      {cardData && !cardData.error && !confirmed && (
        <div style={{ marginTop: '20px', padding: '15px', background: '#f0f0f0', borderRadius: '8px' }}>
          <h3>Card Details:</h3>
          <p><strong>Player:</strong> {cardData.player}</p>
          <p><strong>Year:</strong> {cardData.year}</p>
          <p><strong>Set:</strong> {cardData.set}</p>
          <p><strong>Variation:</strong> {cardData.variation}</p>
          <p><strong>Print Run:</strong> {cardData.printRun}</p>
          <div style={{ marginTop: '10px' }}>
            <strong>Tags:</strong>{' '}
            {cardData.tags && cardData.tags.length > 0
              ? cardData.tags.map((tag, i) => (
                  <span key={i} style={{ display: 'inline-block', background: '#2196F3', color: 'white', borderRadius: '12px', padding: '3px 10px', marginRight: '6px', marginTop: '4px', fontSize: '13px' }}>
                    {tag}
                  </span>
                ))
              : <span>None detected</span>
            }
          </div>
          <div style={{ marginTop: '12px', padding: '10px', borderRadius: '8px', background: buySignal ? '#e8f5e9' : '#fff3e0', border: buySignal ? '2px solid #4CAF50' : '2px solid #FF9800' }}>
            {buySignal
              ? <strong style={{ color: '#2e7d32' }}>BUY SIGNAL - {cardData.tags.length} tags detected</strong>
              : <strong style={{ color: '#e65100' }}>No buy signal - only {cardData.tags ? cardData.tags.length : 0} tag(s) detected (need 3+)</strong>
            }
          </div>
          <p style={{ marginTop: '15px' }}><strong>Is this correct?</strong></p>
          <button onClick={() => setConfirmed(true)} style={{ padding: '10px 20px', marginRight: '10px', background: '#4CAF50', color: 'white', border: 'none', borderRadius: '6px', fontSize: '16px' }}>
            Yes, correct
          </button>
          <button onClick={() => { setCardData(null); setConfirmed(false); }} style={{ padding: '10px 20px', background: '#f44336', color: 'white', border: 'none', borderRadius: '6px', fontSize: '16px' }}>
            No, retry
          </button>
        </div>
      )}

      {cardData && cardData.error && (
        <p style={{ color: 'red' }}>{cardData.error}</p>
      )}

      {confirmed && (
        <div style={{ marginTop: '20px', padding: '15px', background: '#e8f5e9', borderRadius: '8px' }}>
          <h3>Enter Comp Value:</h3>
          <input
            type="number"
            placeholder="Enter $ value"
            value={compValue}
            onChange={(e) => setCompValue(e.target.value)}
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
