import { useState, useRef, useCallback } from "react";

const ANTHROPIC_MODEL = "claude-sonnet-4-20250514";

const styles = `
  @import url('https://fonts.googleapis.com/css2?family=Bebas+Neue&family=DM+Sans:wght@300;400;500;600&family=DM+Mono:wght@400;500&display=swap');

  * { box-sizing: border-box; margin: 0; padding: 0; }

  :root {
    --bg: #0a0a0f;
    --surface: #12121a;
    --surface2: #1a1a26;
    --border: #2a2a3d;
    --accent: #00e5a0;
    --accent2: #ff6b35;
    --accent3: #6c63ff;
    --text: #e8e8f0;
    --muted: #7070a0;
    --ebay-green: #00c853;
    --amazon-orange: #ff9900;
    --danger: #ff4560;
    --warn: #ffd600;
  }

  body { background: var(--bg); color: var(--text); font-family: 'DM Sans', sans-serif; }

  .app {
    min-height: 100vh;
    background: var(--bg);
    background-image:
      radial-gradient(ellipse 80% 40% at 50% -10%, rgba(0,229,160,0.08) 0%, transparent 60%),
      radial-gradient(ellipse 40% 30% at 90% 80%, rgba(108,99,255,0.07) 0%, transparent 60%);
    padding: 0 0 60px;
  }

  /* HEADER */
  .header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 24px 32px 20px;
    border-bottom: 1px solid var(--border);
    background: rgba(10,10,15,0.8);
    backdrop-filter: blur(12px);
    position: sticky;
    top: 0;
    z-index: 100;
  }

  .logo {
    display: flex;
    align-items: baseline;
    gap: 2px;
  }

  .logo-flip {
    font-family: 'Bebas Neue', sans-serif;
    font-size: 32px;
    letter-spacing: 2px;
    color: var(--accent);
    line-height: 1;
  }

  .logo-scout {
    font-family: 'Bebas Neue', sans-serif;
    font-size: 32px;
    letter-spacing: 2px;
    color: var(--text);
    line-height: 1;
  }

  .logo-tag {
    font-size: 11px;
    color: var(--muted);
    font-family: 'DM Mono', monospace;
    letter-spacing: 1px;
    margin-left: 10px;
  }

  .header-pills {
    display: flex;
    gap: 8px;
  }

  .pill {
    font-size: 11px;
    font-family: 'DM Mono', monospace;
    padding: 4px 10px;
    border-radius: 20px;
    letter-spacing: 0.5px;
  }

  .pill-ebay { background: rgba(0,200,83,0.15); color: var(--ebay-green); border: 1px solid rgba(0,200,83,0.3); }
  .pill-amazon { background: rgba(255,153,0,0.15); color: var(--amazon-orange); border: 1px solid rgba(255,153,0,0.3); }

  /* MAIN CONTENT */
  .main { max-width: 860px; margin: 0 auto; padding: 40px 24px 0; }

  /* INPUT CARD */
  .input-card {
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: 20px;
    overflow: hidden;
    margin-bottom: 32px;
  }

  .tab-bar {
    display: flex;
    border-bottom: 1px solid var(--border);
  }

  .tab {
    flex: 1;
    padding: 16px;
    background: none;
    border: none;
    color: var(--muted);
    font-family: 'DM Sans', sans-serif;
    font-size: 14px;
    font-weight: 500;
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 8px;
    transition: all 0.2s;
    letter-spacing: 0.3px;
  }

  .tab.active {
    color: var(--accent);
    background: rgba(0,229,160,0.06);
    border-bottom: 2px solid var(--accent);
    margin-bottom: -1px;
  }

  .tab:hover:not(.active) { color: var(--text); background: rgba(255,255,255,0.03); }

  .input-body { padding: 24px; }

  /* PHOTO DROP ZONE */
  .drop-zone {
    border: 2px dashed var(--border);
    border-radius: 16px;
    padding: 48px 24px;
    text-align: center;
    cursor: pointer;
    transition: all 0.2s;
    position: relative;
    overflow: hidden;
  }

  .drop-zone:hover, .drop-zone.drag-over {
    border-color: var(--accent);
    background: rgba(0,229,160,0.04);
  }

  .drop-zone input { position: absolute; inset: 0; opacity: 0; cursor: pointer; width: 100%; }

  .drop-icon {
    font-size: 48px;
    margin-bottom: 12px;
    display: block;
  }

  .drop-label {
    font-size: 16px;
    font-weight: 500;
    color: var(--text);
    margin-bottom: 6px;
  }

  .drop-sub {
    font-size: 13px;
    color: var(--muted);
  }

  .preview-img {
    width: 100%;
    max-height: 280px;
    object-fit: contain;
    border-radius: 12px;
    margin-bottom: 16px;
  }

  /* TEXT INPUT */
  .desc-textarea {
    width: 100%;
    background: var(--surface2);
    border: 1px solid var(--border);
    border-radius: 12px;
    padding: 16px;
    color: var(--text);
    font-family: 'DM Sans', sans-serif;
    font-size: 15px;
    line-height: 1.6;
    resize: none;
    transition: border-color 0.2s;
    outline: none;
  }

  .desc-textarea:focus { border-color: var(--accent); }
  .desc-textarea::placeholder { color: var(--muted); }

  /* OPTIONS ROW */
  .options-row {
    display: flex;
    gap: 12px;
    margin-top: 16px;
    flex-wrap: wrap;
  }

  .option-input {
    background: var(--surface2);
    border: 1px solid var(--border);
    border-radius: 10px;
    padding: 10px 14px;
    color: var(--text);
    font-family: 'DM Mono', monospace;
    font-size: 13px;
    outline: none;
    transition: border-color 0.2s;
    width: 160px;
  }

  .option-input:focus { border-color: var(--accent); }
  .option-input::placeholder { color: var(--muted); }

  .option-label {
    font-size: 12px;
    color: var(--muted);
    margin-bottom: 4px;
    font-family: 'DM Mono', monospace;
    letter-spacing: 0.5px;
  }

  /* SEARCH BUTTON */
  .search-btn {
    width: 100%;
    margin-top: 20px;
    padding: 16px;
    background: var(--accent);
    color: #0a0a0f;
    border: none;
    border-radius: 12px;
    font-family: 'Bebas Neue', sans-serif;
    font-size: 20px;
    letter-spacing: 3px;
    cursor: pointer;
    transition: all 0.2s;
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 10px;
  }

  .search-btn:hover:not(:disabled) {
    background: #00f5b0;
    transform: translateY(-1px);
    box-shadow: 0 8px 24px rgba(0,229,160,0.3);
  }

  .search-btn:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  /* LOADING */
  .loading-wrap {
    text-align: center;
    padding: 60px 24px;
  }

  .spinner {
    width: 48px;
    height: 48px;
    border: 3px solid var(--border);
    border-top-color: var(--accent);
    border-radius: 50%;
    animation: spin 0.8s linear infinite;
    margin: 0 auto 24px;
  }

  @keyframes spin { to { transform: rotate(360deg); } }

  .loading-step {
    font-size: 14px;
    color: var(--muted);
    font-family: 'DM Mono', monospace;
    animation: pulse 1.5s ease-in-out infinite;
  }

  @keyframes pulse { 0%,100%{opacity:0.5} 50%{opacity:1} }

  /* RESULTS */
  .results { display: flex; flex-direction: column; gap: 20px; }

  .item-banner {
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: 20px;
    padding: 24px 28px;
  }

  .item-name {
    font-family: 'Bebas Neue', sans-serif;
    font-size: 28px;
    letter-spacing: 1.5px;
    color: var(--text);
    margin-bottom: 6px;
  }

  .item-condition {
    font-size: 13px;
    color: var(--muted);
    font-family: 'DM Mono', monospace;
  }

  /* VERDICT CARD */
  .verdict-card {
    border-radius: 20px;
    padding: 24px 28px;
    display: flex;
    align-items: flex-start;
    gap: 20px;
    border: 1px solid;
  }

  .verdict-buy {
    background: rgba(0,200,83,0.08);
    border-color: rgba(0,200,83,0.3);
  }

  .verdict-maybe {
    background: rgba(255,214,0,0.08);
    border-color: rgba(255,214,0,0.3);
  }

  .verdict-pass {
    background: rgba(255,69,96,0.08);
    border-color: rgba(255,69,96,0.3);
  }

  .verdict-icon { font-size: 40px; flex-shrink: 0; }

  .verdict-label {
    font-family: 'Bebas Neue', sans-serif;
    font-size: 22px;
    letter-spacing: 2px;
    margin-bottom: 6px;
  }

  .verdict-buy .verdict-label { color: var(--ebay-green); }
  .verdict-maybe .verdict-label { color: var(--warn); }
  .verdict-pass .verdict-label { color: var(--danger); }

  .verdict-reason {
    font-size: 14px;
    color: var(--text);
    line-height: 1.6;
  }

  /* METRICS GRID */
  .metrics-grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
    gap: 16px;
  }

  .metric-card {
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: 16px;
    padding: 20px;
  }

  .metric-source {
    font-size: 11px;
    font-family: 'DM Mono', monospace;
    letter-spacing: 1px;
    margin-bottom: 8px;
    display: flex;
    align-items: center;
    gap: 6px;
  }

  .metric-source.ebay { color: var(--ebay-green); }
  .metric-source.amazon { color: var(--amazon-orange); }

  .metric-value {
    font-family: 'Bebas Neue', sans-serif;
    font-size: 36px;
    letter-spacing: 1px;
    line-height: 1;
    margin-bottom: 4px;
  }

  .metric-label {
    font-size: 12px;
    color: var(--muted);
  }

  .metric-sub {
    font-size: 12px;
    color: var(--muted);
    margin-top: 8px;
    padding-top: 8px;
    border-top: 1px solid var(--border);
    font-family: 'DM Mono', monospace;
  }

  /* SOLD HISTORY */
  .section-title {
    font-family: 'Bebas Neue', sans-serif;
    font-size: 18px;
    letter-spacing: 2px;
    color: var(--muted);
    margin-bottom: 14px;
    display: flex;
    align-items: center;
    gap: 10px;
  }

  .section-title::after {
    content: '';
    flex: 1;
    height: 1px;
    background: var(--border);
  }

  .sold-list {
    display: flex;
    flex-direction: column;
    gap: 8px;
  }

  .sold-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 12px 16px;
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: 10px;
    gap: 12px;
  }

  .sold-title {
    font-size: 13px;
    color: var(--text);
    flex: 1;
    line-height: 1.4;
  }

  .sold-price {
    font-family: 'DM Mono', monospace;
    font-size: 14px;
    font-weight: 500;
    color: var(--ebay-green);
    white-space: nowrap;
  }

  .sold-date {
    font-size: 11px;
    color: var(--muted);
    font-family: 'DM Mono', monospace;
    white-space: nowrap;
  }

  .sold-condition {
    font-size: 11px;
    padding: 2px 8px;
    border-radius: 4px;
    background: rgba(0,200,83,0.12);
    color: var(--ebay-green);
    white-space: nowrap;
  }

  /* PROFIT CALC */
  .profit-card {
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: 16px;
    padding: 24px;
  }

  .profit-row {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 10px 0;
    border-bottom: 1px solid var(--border);
    font-size: 14px;
  }

  .profit-row:last-child { border-bottom: none; }
  .profit-row-label { color: var(--muted); }
  .profit-row-value { font-family: 'DM Mono', monospace; font-weight: 500; }
  .profit-positive { color: var(--ebay-green); }
  .profit-negative { color: var(--danger); }
  .profit-neutral { color: var(--text); }

  .profit-total {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 16px 0 0;
    margin-top: 8px;
  }

  .profit-total-label {
    font-family: 'Bebas Neue', sans-serif;
    font-size: 20px;
    letter-spacing: 1.5px;
  }

  .profit-total-value {
    font-family: 'Bebas Neue', sans-serif;
    font-size: 32px;
    letter-spacing: 1px;
  }

  .calc-input-row {
    display: flex;
    gap: 12px;
    margin-bottom: 20px;
    flex-wrap: wrap;
  }

  .calc-field { flex: 1; min-width: 140px; }

  /* ERROR */
  .error-card {
    background: rgba(255,69,96,0.08);
    border: 1px solid rgba(255,69,96,0.3);
    border-radius: 16px;
    padding: 24px;
    text-align: center;
    color: var(--danger);
    font-size: 14px;
  }

  /* RESET BTN */
  .reset-btn {
    background: none;
    border: 1px solid var(--border);
    border-radius: 10px;
    padding: 10px 20px;
    color: var(--muted);
    font-family: 'DM Sans', sans-serif;
    font-size: 13px;
    cursor: pointer;
    transition: all 0.2s;
    display: block;
    margin: 0 auto;
  }

  .reset-btn:hover { color: var(--text); border-color: var(--text); }

  .badge {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    font-size: 11px;
    padding: 3px 8px;
    border-radius: 6px;
    font-family: 'DM Mono', monospace;
  }

  .badge-count {
    background: rgba(0,229,160,0.12);
    color: var(--accent);
    border: 1px solid rgba(0,229,160,0.25);
  }
`;

// ─── PARSE STRUCTURED RESPONSE FROM CLAUDE ───────────────────────────────────
function parseResearch(raw) {
  try {
    const clean = raw.replace(/```json|```/g, "").trim();
    const start = clean.indexOf("{");
    const end = clean.lastIndexOf("}");
    return JSON.parse(clean.slice(start, end + 1));
  } catch {
    return null;
  }
}

// ─── PROFIT CALCULATOR ────────────────────────────────────────────────────────
function ProfitCalc({ avgSold, amazonPrice, shipping }) {
  const [cost, setCost] = useState("");
  const [platform, setPlatform] = useState("ebay");
  const [overrideShipping, setOverrideShipping] = useState("");

  const sellPrice = platform === "ebay" ? avgSold : amazonPrice;
  const feeRate = platform === "ebay" ? 0.1325 : 0.15;

  // Use override if typed, else use eBay-sourced estimate for eBay, 0 for Amazon (FBA)
  const shippingCost = overrideShipping !== ""
    ? parseFloat(overrideShipping) || 0
    : platform === "ebay"
      ? (shipping?.estimatedCost ?? 5.50)
      : 0;

  const fees = sellPrice ? +(sellPrice * feeRate).toFixed(2) : 0;
  const net = sellPrice
    ? +(sellPrice - fees - shippingCost - (parseFloat(cost) || 0)).toFixed(2)
    : 0;
  const roi = cost && parseFloat(cost) > 0 && sellPrice
    ? +((net / parseFloat(cost)) * 100).toFixed(0)
    : null;

  const shippingLabel = shipping
    ? `${shipping.carrier ?? "Carrier"} · ${shipping.packageType ?? "est."} · ${shipping.weightEstimate ?? ""}`
    : "eBay average estimate";

  return (
    <div className="profit-card">
      {/* Shipping info banner */}
      {platform === "ebay" && shipping && (
        <div style={{
          background: "rgba(0,229,160,0.06)",
          border: "1px solid rgba(0,229,160,0.2)",
          borderRadius: 10,
          padding: "10px 14px",
          marginBottom: 20,
          display: "flex",
          alignItems: "flex-start",
          gap: 10,
        }}>
          <span style={{ fontSize: 18 }}>📦</span>
          <div>
            <div style={{ fontSize: 12, color: "var(--accent)", fontFamily: "'DM Mono', monospace", letterSpacing: 1, marginBottom: 4 }}>
              EBAY SHIPPING ESTIMATE
            </div>
            <div style={{ fontSize: 13, color: "var(--text)" }}>
              <strong>${(shipping.estimatedCost ?? 5.50).toFixed(2)}</strong>
              {" · "}{shippingLabel}
            </div>
            {shipping.note && (
              <div style={{ fontSize: 12, color: "var(--muted)", marginTop: 4 }}>{shipping.note}</div>
            )}
          </div>
        </div>
      )}

      <div className="calc-input-row">
        <div className="calc-field">
          <div className="option-label">YOUR COST $</div>
          <input
            className="option-input"
            style={{ width: "100%" }}
            type="number"
            placeholder="0.00"
            value={cost}
            onChange={e => setCost(e.target.value)}
          />
        </div>
        <div className="calc-field">
          <div className="option-label">SELL ON</div>
          <select
            className="option-input"
            style={{ width: "100%" }}
            value={platform}
            onChange={e => setPlatform(e.target.value)}
          >
            <option value="ebay">eBay</option>
            <option value="amazon">Amazon (FBA)</option>
          </select>
        </div>
        <div className="calc-field">
          <div className="option-label">OVERRIDE SHIPPING $</div>
          <input
            className="option-input"
            style={{ width: "100%" }}
            type="number"
            placeholder={platform === "ebay" ? `${(shipping?.estimatedCost ?? 5.50).toFixed(2)} (est)` : "0.00 (FBA)"}
            value={overrideShipping}
            onChange={e => setOverrideShipping(e.target.value)}
          />
        </div>
      </div>

      {sellPrice ? (
        <>
          <div className="profit-row">
            <span className="profit-row-label">Sale Price (avg sold)</span>
            <span className="profit-row-value profit-neutral">${sellPrice.toFixed(2)}</span>
          </div>
          <div className="profit-row">
            <span className="profit-row-label">
              Platform Fees ({(feeRate * 100).toFixed(2)}%{platform === "ebay" ? " + PayPal" : " FBA"})
            </span>
            <span className="profit-row-value profit-negative">−${fees}</span>
          </div>
          <div className="profit-row">
            <span className="profit-row-label">
              Shipping to Buyer
              {overrideShipping === "" && platform === "ebay" && (
                <span style={{ fontSize: 11, color: "var(--accent)", marginLeft: 6 }}>eBay est.</span>
              )}
              {platform === "amazon" && (
                <span style={{ fontSize: 11, color: "var(--muted)", marginLeft: 6 }}>FBA included</span>
              )}
            </span>
            <span className="profit-row-value profit-negative">−${shippingCost.toFixed(2)}</span>
          </div>
          {cost && parseFloat(cost) > 0 && (
            <div className="profit-row">
              <span className="profit-row-label">Your Purchase Cost</span>
              <span className="profit-row-value profit-negative">−${parseFloat(cost).toFixed(2)}</span>
            </div>
          )}
          <div className="profit-total">
            <span className="profit-total-label">NET PROFIT</span>
            <span className={`profit-total-value ${net >= 0 ? "profit-positive" : "profit-negative"}`}>
              {net >= 0 ? "+" : ""}${net.toFixed(2)}
              {roi !== null && (
                <span style={{ fontSize: 15, marginLeft: 10, color: roi >= 30 ? "var(--ebay-green)" : roi >= 0 ? "var(--warn)" : "var(--danger)" }}>
                  ({roi}% ROI)
                </span>
              )}
            </span>
          </div>

          {/* ROI meter */}
          {roi !== null && (
            <div style={{ marginTop: 16, padding: "12px 0 0", borderTop: "1px solid var(--border)" }}>
              <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
                <span style={{ fontSize: 11, color: "var(--muted)", fontFamily: "'DM Mono', monospace" }}>ROI METER</span>
                <span style={{ fontSize: 11, color: "var(--muted)", fontFamily: "'DM Mono', monospace" }}>
                  {roi < 0 ? "💸 losing" : roi < 20 ? "😐 thin" : roi < 50 ? "👍 decent" : "🔥 great flip"}
                </span>
              </div>
              <div style={{ background: "var(--border)", borderRadius: 4, height: 6, overflow: "hidden" }}>
                <div style={{
                  width: `${Math.min(Math.max(roi, 0), 100)}%`,
                  height: "100%",
                  background: roi < 20 ? "var(--danger)" : roi < 50 ? "var(--warn)" : "var(--ebay-green)",
                  borderRadius: 4,
                  transition: "width 0.4s ease",
                }} />
              </div>
            </div>
          )}
        </>
      ) : (
        <p style={{ color: "var(--muted)", fontSize: 13, textAlign: "center" }}>No price data available for this platform</p>
      )}
    </div>
  );
}

// ─── MAIN APP ─────────────────────────────────────────────────────────────────
export default function FlipScout() {
  const [tab, setTab] = useState("photo");
  const [description, setDescription] = useState("");
  const [imageData, setImageData] = useState(null);
  const [imagePreview, setImagePreview] = useState(null);
  const [loading, setLoading] = useState(false);
  const [loadingStep, setLoadingStep] = useState("");
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);
  const [dragOver, setDragOver] = useState(false);
  const fileRef = useRef();

  const handleFile = useCallback((file) => {
    if (!file || !file.type.startsWith("image/")) return;
    const reader = new FileReader();
    reader.onload = (e) => {
      setImagePreview(e.target.result);
      setImageData(e.target.result.split(",")[1]);
    };
    reader.readAsDataURL(file);
  }, []);

  const handleDrop = (e) => {
    e.preventDefault();
    setDragOver(false);
    handleFile(e.dataTransfer.files[0]);
  };

  const doResearch = async () => {
    setLoading(true);
    setError(null);
    setResult(null);

    try {
      // Step 1: Identify item (if photo)
      let itemDescription = description;

      if (tab === "photo" && imageData) {
        setLoadingStep("🔍 Identifying item from photo...");
        const identRes = await fetch("https://api.anthropic.com/v1/messages", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            model: ANTHROPIC_MODEL,
            max_tokens: 1000,
            messages: [{
              role: "user",
              content: [
                { type: "image", source: { type: "base64", media_type: "image/jpeg", data: imageData } },
                { type: "text", text: `Identify this item for resale research. Provide a specific, searchable description including: brand, model, item type, condition (if visible), and any notable features. Be specific — include model numbers if visible. Format: just the description, no extra text.` }
              ]
            }]
          })
        });
        const identData = await identRes.json();
        itemDescription = identData.content?.find(b => b.type === "text")?.text || "Unknown item";
      }

      // Step 2: Research pricing
      setLoadingStep("📦 Searching eBay sold listings...");
      await new Promise(r => setTimeout(r, 600));
      setLoadingStep("🛒 Checking Amazon pricing...");
      await new Promise(r => setTimeout(r, 600));
      setLoadingStep("📊 Analyzing profit potential...");

      const researchRes = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          model: ANTHROPIC_MODEL,
          max_tokens: 1000,
          tools: [{ type: "web_search_20250305", name: "web_search" }],
          messages: [{
            role: "user",
            content: `You are a resale market research expert. Research this item and return ONLY a valid JSON object (no markdown, no explanation):

ITEM: "${itemDescription}"

Search for:
1. eBay SOLD listings (not active) — find real recent sold prices
2. Amazon current price

Return this exact JSON structure:
{
  "itemName": "clean product name",
  "itemSummary": "brief 1-sentence description",
  "ebay": {
    "avgSoldPrice": number or null,
    "soldCount": number,
    "lowSold": number or null,
    "highSold": number or null,
    "recentSales": [
      { "title": "listing title", "price": number, "date": "Mon YYYY", "condition": "Used/New/etc" }
    ]
  },
  "amazon": {
    "currentPrice": number or null,
    "priceRange": "low-high string or null",
    "condition": "New/Used/Both",
    "note": "brief note about Amazon listings"
  },
  "shipping": {
    "estimatedCost": number,
    "carrier": "USPS / UPS / FedEx / etc",
    "packageType": "Poly Mailer / Small Box / Medium Box / Large Box / Freight",
    "weightEstimate": "e.g. 1-2 lbs / 5-10 lbs",
    "note": "brief reason — e.g. most eBay sellers charged $6.99 USPS First Class, or item is heavy so UPS Ground ~$18"
  },
  "verdict": {
    "rating": "BUY" | "MAYBE" | "PASS",
    "reason": "2-3 sentence explanation of resale potential, profit margin, and recommendation. Factor in realistic shipping cost."
  }
}

SHIPPING GUIDANCE: Look at what actual eBay sold listings charged for shipping on this item. Base estimatedCost on the most common shipping method used by sellers. For small/light items (under 1 lb) use USPS First Class ~$4-6. For medium items (1-5 lbs) use USPS Priority ~$8-14. For heavy/large items use UPS Ground ~$15-30. For furniture/appliances note freight. If free shipping was offered on most listings, set estimatedCost to 0 and note that in the note field.

Use real web search data. If you can't find sold data, use null. Be honest.`
          }]
        })
      });

      const researchData = await researchRes.json();
      const fullText = researchData.content
        .filter(b => b.type === "text")
        .map(b => b.text)
        .join("\n");

      const parsed = parseResearch(fullText);
      if (!parsed) throw new Error("Couldn't parse research data. Try a more specific description.");
      parsed._rawDescription = itemDescription;
      setResult(parsed);
    } catch (err) {
      setError(err.message || "Something went wrong. Please try again.");
    } finally {
      setLoading(false);
      setLoadingStep("");
    }
  };

  const reset = () => {
    setResult(null);
    setError(null);
    setImageData(null);
    setImagePreview(null);
    setDescription("");
  };

  const canSearch = (tab === "photo" && imageData) || (tab === "text" && description.trim().length > 3);

  const verdictConfig = {
    BUY: { cls: "verdict-buy", icon: "💰", label: "BUY IT" },
    MAYBE: { cls: "verdict-maybe", icon: "🤔", label: "MAYBE — DO THE MATH" },
    PASS: { cls: "verdict-pass", icon: "🚫", label: "PASS ON IT" },
  };

  return (
    <>
      <style>{styles}</style>
      <div className="app">
        <header className="header">
          <div className="logo">
            <span className="logo-flip">Flip</span>
            <span className="logo-scout">Scout</span>
            <span className="logo-tag">by shannon</span>
          </div>
          <div className="header-pills">
            <span className="pill pill-ebay">● eBay Sold</span>
            <span className="pill pill-amazon">● Amazon</span>
          </div>
        </header>

        <main className="main">
          {!result && !loading && (
            <div className="input-card">
              <div className="tab-bar">
                <button className={`tab ${tab === "photo" ? "active" : ""}`} onClick={() => setTab("photo")}>
                  📷 Scan a Photo
                </button>
                <button className={`tab ${tab === "text" ? "active" : ""}`} onClick={() => setTab("text")}>
                  ✏️ Describe It
                </button>
              </div>

              <div className="input-body">
                {tab === "photo" ? (
                  imagePreview ? (
                    <>
                      <img src={imagePreview} alt="Preview" className="preview-img" />
                      <button className="reset-btn" onClick={() => { setImageData(null); setImagePreview(null); }}>
                        × Remove photo
                      </button>
                    </>
                  ) : (
                    <div
                      className={`drop-zone ${dragOver ? "drag-over" : ""}`}
                      onDragOver={e => { e.preventDefault(); setDragOver(true); }}
                      onDragLeave={() => setDragOver(false)}
                      onDrop={handleDrop}
                    >
                      <input
                        ref={fileRef}
                        type="file"
                        accept="image/*"
                        capture="environment"
                        onChange={e => handleFile(e.target.files[0])}
                      />
                      <span className="drop-icon">📸</span>
                      <div className="drop-label">Tap to take a photo or upload</div>
                      <div className="drop-sub">Supports JPG, PNG, HEIC — drag & drop works too</div>
                    </div>
                  )
                ) : (
                  <textarea
                    className="desc-textarea"
                    rows={4}
                    placeholder="e.g. Cuisinart 14-cup food processor model DFP-14BCWX, used, no scratches…"
                    value={description}
                    onChange={e => setDescription(e.target.value)}
                  />
                )}

                <button className="search-btn" onClick={doResearch} disabled={!canSearch}>
                  🔍 RESEARCH THIS ITEM
                </button>
              </div>
            </div>
          )}

          {loading && (
            <div className="loading-wrap">
              <div className="spinner" />
              <div className="loading-step">{loadingStep}</div>
            </div>
          )}

          {error && (
            <>
              <div className="error-card">⚠️ {error}</div>
              <br />
              <button className="reset-btn" onClick={reset}>← Try again</button>
            </>
          )}

          {result && (
            <div className="results">
              {/* Item name */}
              <div className="item-banner">
                <div className="item-name">{result.itemName}</div>
                <div className="item-condition">{result.itemSummary}</div>
              </div>

              {/* Verdict */}
              {result.verdict && (() => {
                const v = verdictConfig[result.verdict.rating] || verdictConfig.MAYBE;
                return (
                  <div className={`verdict-card ${v.cls}`}>
                    <div className="verdict-icon">{v.icon}</div>
                    <div>
                      <div className="verdict-label">{v.label}</div>
                      <div className="verdict-reason">{result.verdict.reason}</div>
                    </div>
                  </div>
                );
              })()}

              {/* Key metrics */}
              <div className="metrics-grid">
                <div className="metric-card">
                  <div className="metric-source ebay">◆ EBAY SOLD AVG</div>
                  <div className="metric-value" style={{ color: "var(--ebay-green)" }}>
                    {result.ebay?.avgSoldPrice ? `$${result.ebay.avgSoldPrice.toFixed(0)}` : "N/A"}
                  </div>
                  <div className="metric-label">average recent sale</div>
                  {result.ebay?.lowSold && result.ebay?.highSold && (
                    <div className="metric-sub">Range: ${result.ebay.lowSold}–${result.ebay.highSold}</div>
                  )}
                </div>

                <div className="metric-card">
                  <div className="metric-source ebay">◆ EBAY SOLD COUNT</div>
                  <div className="metric-value" style={{ color: "var(--accent)" }}>
                    {result.ebay?.soldCount ?? "—"}
                  </div>
                  <div className="metric-label">recent sold listings</div>
                  <div className="metric-sub">only completed sales</div>
                </div>

                <div className="metric-card">
                  <div className="metric-source amazon">◆ AMAZON PRICE</div>
                  <div className="metric-value" style={{ color: "var(--amazon-orange)" }}>
                    {result.amazon?.currentPrice ? `$${result.amazon.currentPrice.toFixed(0)}` : "N/A"}
                  </div>
                  <div className="metric-label">{result.amazon?.condition || "current"}</div>
                  {result.amazon?.note && <div className="metric-sub">{result.amazon.note}</div>}
                </div>
              </div>

              {/* eBay recent sold */}
              {result.ebay?.recentSales?.length > 0 && (
                <div>
                  <div className="section-title">
                    RECENT EBAY SOLD
                    <span className="badge badge-count">{result.ebay.recentSales.length} sales</span>
                  </div>
                  <div className="sold-list">
                    {result.ebay.recentSales.map((s, i) => (
                      <div className="sold-row" key={i}>
                        <div className="sold-title">{s.title}</div>
                        <div className="sold-condition">{s.condition}</div>
                        <div className="sold-date">{s.date}</div>
                        <div className="sold-price">${typeof s.price === "number" ? s.price.toFixed(2) : s.price}</div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Profit calculator */}
              <div>
                <div className="section-title">PROFIT CALCULATOR</div>
                <ProfitCalc
                  avgSold={result.ebay?.avgSoldPrice}
                  amazonPrice={result.amazon?.currentPrice}
                  shipping={result.shipping}
                />
              </div>

              <button className="reset-btn" onClick={reset}>← Research another item</button>
            </div>
          )}
        </main>
      </div>
    </>
  );
}

