// MetaMask Approval Guard - Content Script
// This script runs in the content script context and bridges between the injected script and background

console.log("[MetaMask Approval Guard] Content script loaded");

// Inject the page script to intercept MetaMask calls
function injectScript() {
  const script = document.createElement("script");
  script.src = chrome.runtime.getURL("injected.js");
  script.onload = function() {
    this.remove();
  };
  (document.head || document.documentElement).appendChild(script);
}

// Inject as early as possible
injectScript();

// Store pending transaction callbacks
const pendingCallbacks = new Map();

// Listen for messages from the injected script (page context)
window.addEventListener("message", async (event) => {
  if (event.source !== window) return;
  
  // Handle transaction requests
  if (event.data.type === "METAMASK_GUARD_TX_REQUEST") {
    console.log("[Content] Received transaction request:", event.data);
    
    try {
      // Send to background for analysis
      const response = await chrome.runtime.sendMessage({
        type: "ANALYZE_TRANSACTION",
        data: event.data.transaction
      });

      console.log("[Content] Background response:", response);

      if (response.action === "SHOW_WARNING") {
        // Store the transaction ID for later
        pendingCallbacks.set(response.txId, event.data.requestId);
        
        // Show warning overlay
        showWarningOverlay(response.txId, response.analysis);
      } else {
        // Allow the transaction
        window.postMessage({
          type: "METAMASK_GUARD_TX_RESPONSE",
          requestId: event.data.requestId,
          allow: true
        }, "*");
      }
    } catch (error) {
      console.error("[Content] Error communicating with background:", error);
      // On error, allow the transaction (fail open for usability)
      window.postMessage({
        type: "METAMASK_GUARD_TX_RESPONSE",
        requestId: event.data.requestId,
        allow: true
      }, "*");
    }
  }

  // Handle signature requests (Permit, Seaport, etc.)
  if (event.data.type === "METAMASK_GUARD_SIGNATURE_REQUEST") {
    console.log("[Content] Received signature request:", event.data);
    
    const sigRequest = event.data.signatureRequest;
    const txId = `sig_${Date.now()}`;
    
    // Store the callback
    pendingCallbacks.set(txId, event.data.requestId);
    
    // Create analysis object for the warning overlay
    const analysis = {
      isRisky: true,
      risks: [sigRequest.reason],
      methodName: sigRequest.method,
      contractAddress: sigRequest.details.verifyingContract || "Unknown",
      spender: sigRequest.details.spender || sigRequest.details.operator || null,
      isUnlimited: sigRequest.details.unlimitedValue || false,
      isBlacklisted: false,
      isSignature: true,
      signatureType: sigRequest.details.type || sigRequest.method,
      signatureDetails: sigRequest.details
    };
    
    // Log: Signature intercepted & warning displayed
    chrome.runtime.sendMessage({
      type: "LOG_EVENT",
      eventType: "SIGNATURE_INTERCEPTED",
      details: {
        url: window.location.href,
        method: sigRequest.method,
        signatureType: analysis.signatureType,
        contractAddress: analysis.contractAddress,
        spender: analysis.spender,
        risks: analysis.risks
      }
    });
    chrome.runtime.sendMessage({
      type: "LOG_EVENT",
      eventType: "WARNING_DISPLAYED",
      details: {
        url: window.location.href,
        txId: txId,
        type: 'signature'
      }
    });
    
    // Show warning overlay for signature
    showSignatureWarningOverlay(txId, analysis, sigRequest);
  }
});

// Listen for decisions from background
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === "TRANSACTION_DECISION") {
    const requestId = pendingCallbacks.get(message.txId);
    if (requestId) {
      window.postMessage({
        type: "METAMASK_GUARD_TX_RESPONSE",
        requestId: requestId,
        allow: message.allow
      }, "*");
      pendingCallbacks.delete(message.txId);
      removeWarningOverlay();
    }
  }
});

// Warning overlay UI
function showWarningOverlay(txId, analysis) {
  // Remove any existing overlay
  removeWarningOverlay();

  const overlay = document.createElement("div");
  overlay.id = "metamask-guard-overlay";
  overlay.innerHTML = `
    <style>
      @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap');
      
      #metamask-guard-overlay {
        position: fixed;
        top: 0;
        left: 0;
        width: 100%;
        height: 100%;
        background: rgba(0, 0, 0, 0.92);
        backdrop-filter: blur(8px);
        z-index: 2147483647;
        display: flex;
        align-items: center;
        justify-content: center;
        font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
        animation: fadeIn 0.3s ease-out;
      }
      
      @keyframes fadeIn {
        from { opacity: 0; }
        to { opacity: 1; }
      }
      
      @keyframes slideUp {
        from { transform: translateY(30px); opacity: 0; }
        to { transform: translateY(0); opacity: 1; }
      }
      
      @keyframes pulse {
        0%, 100% { transform: scale(1); }
        50% { transform: scale(1.05); }
      }
      
      @keyframes glow {
        0%, 100% { box-shadow: 0 0 20px rgba(255, 107, 107, 0.4), 0 0 60px rgba(255, 107, 107, 0.2); }
        50% { box-shadow: 0 0 30px rgba(255, 107, 107, 0.6), 0 0 80px rgba(255, 107, 107, 0.3); }
      }
      
      .guard-modal {
        background: linear-gradient(145deg, #1e1e2e 0%, #151521 100%);
        border: 1px solid rgba(255, 107, 107, 0.3);
        border-radius: 24px;
        padding: 0;
        max-width: 480px;
        width: 90%;
        color: white;
        animation: slideUp 0.4s ease-out, glow 3s ease-in-out infinite;
        overflow: hidden;
      }
      
      .guard-header {
        background: linear-gradient(135deg, #ff6b6b 0%, #ee5a5a 100%);
        padding: 28px 32px;
        display: flex;
        align-items: center;
        gap: 20px;
      }
      
      .guard-shield {
        width: 64px;
        height: 64px;
        background: rgba(255, 255, 255, 0.2);
        border-radius: 16px;
        display: flex;
        align-items: center;
        justify-content: center;
        font-size: 32px;
        animation: pulse 2s ease-in-out infinite;
      }
      
      .guard-header-text h2 {
        font-size: 22px;
        font-weight: 700;
        margin: 0 0 4px 0;
        color: white;
        letter-spacing: -0.5px;
      }
      
      .guard-header-text p {
        font-size: 14px;
        margin: 0;
        color: rgba(255, 255, 255, 0.85);
        font-weight: 500;
      }
      
      .guard-body {
        padding: 28px 32px;
      }
      
      .guard-threat-level {
        display: flex;
        align-items: center;
        gap: 12px;
        background: rgba(255, 107, 107, 0.1);
        border: 1px solid rgba(255, 107, 107, 0.3);
        border-radius: 12px;
        padding: 14px 18px;
        margin-bottom: 24px;
      }
      
      .threat-icon {
        font-size: 24px;
      }
      
      .threat-text {
        flex: 1;
      }
      
      .threat-text strong {
        display: block;
        color: #ff6b6b;
        font-size: 14px;
        font-weight: 600;
      }
      
      .threat-text span {
        font-size: 12px;
        color: #888;
      }
      
      .threat-badge {
        background: #ff6b6b;
        color: white;
        padding: 6px 12px;
        border-radius: 20px;
        font-size: 11px;
        font-weight: 700;
        text-transform: uppercase;
        letter-spacing: 0.5px;
      }
      
      .guard-risks {
        margin-bottom: 24px;
      }
      
      .guard-risks h4 {
        font-size: 12px;
        color: #666;
        text-transform: uppercase;
        letter-spacing: 1px;
        margin: 0 0 12px 0;
        font-weight: 600;
      }
      
      .risk-item {
        display: flex;
        align-items: flex-start;
        gap: 12px;
        padding: 12px 16px;
        background: rgba(255, 255, 255, 0.03);
        border-radius: 10px;
        margin-bottom: 8px;
        border-left: 3px solid #ff6b6b;
      }
      
      .risk-item span:first-child {
        font-size: 16px;
      }
      
      .risk-item span:last-child {
        color: #ccc;
        font-size: 14px;
        line-height: 1.4;
      }
      
      .guard-details {
        background: rgba(255, 255, 255, 0.03);
        border-radius: 14px;
        padding: 20px;
        margin-bottom: 24px;
      }
      
      .guard-details h4 {
        font-size: 12px;
        color: #666;
        text-transform: uppercase;
        letter-spacing: 1px;
        margin: 0 0 16px 0;
        font-weight: 600;
      }
      
      .detail-row {
        display: flex;
        justify-content: space-between;
        align-items: center;
        padding: 10px 0;
        border-bottom: 1px solid rgba(255, 255, 255, 0.06);
      }
      
      .detail-row:last-child {
        border-bottom: none;
      }
      
      .detail-label {
        color: #888;
        font-size: 13px;
        font-weight: 500;
      }
      
      .detail-value {
        color: #4fc3f7;
        font-family: 'SF Mono', Monaco, 'Courier New', monospace;
        font-size: 12px;
        max-width: 55%;
        text-align: right;
        word-break: break-all;
      }
      
      .detail-value.danger {
        color: #ff6b6b;
        font-weight: 600;
      }
      
      .detail-value.unlimited {
        background: linear-gradient(90deg, #ff6b6b, #ff8e53);
        -webkit-background-clip: text;
        -webkit-text-fill-color: transparent;
        font-weight: 700;
      }
      
      .guard-buttons {
        display: flex;
        gap: 12px;
      }
      
      .guard-btn {
        flex: 1;
        padding: 16px 24px;
        border-radius: 12px;
        font-size: 15px;
        font-weight: 600;
        cursor: pointer;
        border: none;
        transition: all 0.2s ease;
        display: flex;
        align-items: center;
        justify-content: center;
        gap: 8px;
      }
      
      .guard-btn-block {
        background: linear-gradient(135deg, #4ade80 0%, #22c55e 100%);
        color: #000;
        flex: 1.5;
      }
      
      .guard-btn-block:hover {
        transform: translateY(-2px);
        box-shadow: 0 8px 24px rgba(74, 222, 128, 0.4);
      }
      
      .guard-btn-proceed {
        background: rgba(255, 255, 255, 0.05);
        border: 1px solid rgba(255, 255, 255, 0.1);
        color: #666;
        font-size: 13px;
      }
      
      .guard-btn-proceed:hover {
        border-color: #ff6b6b;
        color: #ff6b6b;
        background: rgba(255, 107, 107, 0.1);
      }
      
      .guard-footer {
        text-align: center;
        padding-top: 20px;
        border-top: 1px solid rgba(255, 255, 255, 0.06);
        margin-top: 8px;
      }
      
      .guard-footer p {
        font-size: 12px;
        color: #555;
        margin: 0;
        line-height: 1.5;
      }
      
      .guard-branding {
        display: flex;
        align-items: center;
        justify-content: center;
        gap: 8px;
        margin-top: 16px;
        padding-top: 16px;
        border-top: 1px solid rgba(255, 255, 255, 0.06);
      }
      
      .guard-branding span {
        font-size: 11px;
        color: #444;
        font-weight: 500;
      }
    </style>
    <div class="guard-modal">
      <div class="guard-header">
        <div class="guard-shield">🛡️</div>
        <div class="guard-header-text">
          <h2>Transaction Blocked</h2>
          <p>Potentially dangerous approval detected</p>
        </div>
      </div>
      
      <div class="guard-body">
        <div class="guard-threat-level">
          <span class="threat-icon">⚠️</span>
          <div class="threat-text">
            <strong>High Risk Transaction</strong>
            <span>This could drain your wallet</span>
          </div>
          <span class="threat-badge">${analysis.isUnlimited ? 'UNLIMITED' : 'RISKY'}</span>
        </div>
        
        <div class="guard-risks">
          <h4>🚨 Threats Detected</h4>
          ${analysis.risks.map(risk => `
            <div class="risk-item">
              <span>⚡</span>
              <span>${escapeHtml(risk)}</span>
            </div>
          `).join('')}
        </div>

        <div class="guard-details">
          <h4>📋 Transaction Details</h4>
          <div class="detail-row">
            <span class="detail-label">Method</span>
            <span class="detail-value">${escapeHtml(analysis.methodName || 'Unknown')}</span>
          </div>
          <div class="detail-row">
            <span class="detail-label">Contract</span>
            <span class="detail-value">${escapeHtml(analysis.contractAddress || 'Unknown')}</span>
          </div>
          ${analysis.spender ? `
          <div class="detail-row">
            <span class="detail-label">Spender</span>
            <span class="detail-value danger">${escapeHtml(analysis.spender)}</span>
          </div>
          ` : ''}
          ${analysis.isUnlimited ? `
          <div class="detail-row">
            <span class="detail-label">Amount</span>
            <span class="detail-value unlimited">♾️ UNLIMITED</span>
          </div>
          ` : ''}
          ${analysis.isBlacklisted ? `
          <div class="detail-row">
            <span class="detail-label">Status</span>
            <span class="detail-value danger">🚫 BLACKLISTED</span>
          </div>
          ` : ''}
        </div>

        <div class="guard-buttons">
          <button class="guard-btn guard-btn-block" id="guard-block-btn">
            <span>✓</span> Block & Stay Safe
          </button>
          <button class="guard-btn guard-btn-proceed" id="guard-proceed-btn">
            Proceed
          </button>
        </div>
        
        <div class="guard-footer">
          <p>Approving unlimited spending can drain your entire wallet.<br>Only proceed if you fully trust this contract.</p>
          <div class="guard-branding">
            <span>🛡️ Protected by MetaMask Approval Guard</span>
          </div>
        </div>
      </div>
    </div>
  `;

  document.body.appendChild(overlay);

  // Add event listeners
  document.getElementById("guard-block-btn").addEventListener("click", () => {
    handleUserDecision(txId, false);
  });

  document.getElementById("guard-proceed-btn").addEventListener("click", () => {
    if (confirm("Are you absolutely sure? This could drain your wallet!")) {
      handleUserDecision(txId, true);
    }
  });
}

function removeWarningOverlay() {
  const overlay = document.getElementById("metamask-guard-overlay");
  if (overlay) {
    overlay.remove();
  }
}

async function handleUserDecision(txId, allow) {
  // Log decision for signature requests (handled locally, not in background)
  if (txId.startsWith('sig_')) {
    chrome.runtime.sendMessage({
      type: "LOG_EVENT",
      eventType: "USER_DECISION",
      details: {
        url: window.location.href,
        txId: txId,
        decision: allow ? 'PROCEED' : 'BLOCK',
        type: 'signature'
      }
    });
  }
  
  try {
    await chrome.runtime.sendMessage({
      type: "USER_DECISION",
      txId: txId,
      allow: allow
    });
  } catch (error) {
    console.error("[Content] Error sending user decision:", error);
  }
  
  // Also handle locally in case message fails
  const requestId = pendingCallbacks.get(txId);
  if (requestId) {
    window.postMessage({
      type: "METAMASK_GUARD_TX_RESPONSE",
      requestId: requestId,
      allow: allow
    }, "*");
    pendingCallbacks.delete(txId);
  }
  
  removeWarningOverlay();
}

function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

// Signature warning overlay (for Permit, Seaport, etc.)
function showSignatureWarningOverlay(txId, analysis, sigRequest) {
  // Remove any existing overlay
  removeWarningOverlay();

  const overlay = document.createElement("div");
  overlay.id = "metamask-guard-overlay";
  overlay.innerHTML = `
    <style>
      @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap');
      
      #metamask-guard-overlay {
        position: fixed;
        top: 0;
        left: 0;
        width: 100%;
        height: 100%;
        background: rgba(10, 0, 0, 0.95);
        backdrop-filter: blur(10px);
        z-index: 2147483647;
        display: flex;
        align-items: center;
        justify-content: center;
        font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
        animation: fadeIn 0.3s ease-out;
      }
      
      @keyframes fadeIn {
        from { opacity: 0; }
        to { opacity: 1; }
      }
      
      @keyframes slideUp {
        from { transform: translateY(40px) scale(0.95); opacity: 0; }
        to { transform: translateY(0) scale(1); opacity: 1; }
      }
      
      @keyframes alertPulse {
        0%, 100% { 
          box-shadow: 0 0 40px rgba(255, 59, 48, 0.5), 
                      0 0 80px rgba(255, 59, 48, 0.3),
                      inset 0 0 60px rgba(255, 59, 48, 0.05);
          border-color: rgba(255, 59, 48, 0.8);
        }
        50% { 
          box-shadow: 0 0 60px rgba(255, 59, 48, 0.7), 
                      0 0 100px rgba(255, 59, 48, 0.4),
                      inset 0 0 80px rgba(255, 59, 48, 0.08);
          border-color: rgba(255, 100, 80, 1);
        }
      }
      
      @keyframes iconPulse {
        0%, 100% { transform: scale(1); }
        50% { transform: scale(1.1); }
      }
      
      @keyframes shimmer {
        0% { background-position: -200% center; }
        100% { background-position: 200% center; }
      }
      
      .guard-modal {
        background: linear-gradient(160deg, #1c1016 0%, #120a0a 50%, #0d0808 100%);
        border: 2px solid rgba(255, 59, 48, 0.6);
        border-radius: 28px;
        max-width: 520px;
        width: 92%;
        color: white;
        animation: slideUp 0.4s ease-out, alertPulse 2s ease-in-out infinite;
        overflow: hidden;
      }
      
      .guard-danger-banner {
        background: linear-gradient(135deg, #ff3b30 0%, #ff2d55 50%, #ff3b30 100%);
        background-size: 200% 100%;
        animation: shimmer 3s linear infinite;
        padding: 14px 24px;
        display: flex;
        align-items: center;
        justify-content: center;
        gap: 10px;
      }
      
      .guard-danger-banner span {
        font-size: 13px;
        font-weight: 700;
        text-transform: uppercase;
        letter-spacing: 2px;
      }
      
      .guard-header {
        padding: 32px 32px 24px;
        text-align: center;
      }
      
      .guard-alert-icon {
        width: 80px;
        height: 80px;
        background: linear-gradient(135deg, rgba(255, 59, 48, 0.2) 0%, rgba(255, 45, 85, 0.2) 100%);
        border: 2px solid rgba(255, 59, 48, 0.5);
        border-radius: 24px;
        display: flex;
        align-items: center;
        justify-content: center;
        font-size: 40px;
        margin: 0 auto 20px;
        animation: iconPulse 1.5s ease-in-out infinite;
      }
      
      .guard-header h2 {
        font-size: 26px;
        font-weight: 800;
        margin: 0 0 8px 0;
        background: linear-gradient(90deg, #ff6b6b, #ff3b30, #ff6b6b);
        background-size: 200% 100%;
        -webkit-background-clip: text;
        -webkit-text-fill-color: transparent;
        animation: shimmer 2s linear infinite;
        letter-spacing: -0.5px;
      }
      
      .guard-header p {
        font-size: 15px;
        color: #999;
        margin: 0;
      }
      
      .guard-body {
        padding: 0 32px 32px;
      }
      
      .attack-type-badge {
        display: inline-flex;
        align-items: center;
        gap: 8px;
        background: rgba(255, 59, 48, 0.15);
        border: 1px solid rgba(255, 59, 48, 0.4);
        padding: 10px 18px;
        border-radius: 30px;
        margin-bottom: 24px;
      }
      
      .attack-type-badge .dot {
        width: 8px;
        height: 8px;
        background: #ff3b30;
        border-radius: 50%;
        animation: iconPulse 1s ease-in-out infinite;
      }
      
      .attack-type-badge span {
        font-size: 13px;
        font-weight: 600;
        color: #ff6b6b;
        text-transform: uppercase;
        letter-spacing: 0.5px;
      }
      
      .guard-warning-box {
        background: linear-gradient(135deg, rgba(255, 59, 48, 0.12) 0%, rgba(255, 45, 85, 0.08) 100%);
        border: 1px solid rgba(255, 59, 48, 0.3);
        border-radius: 16px;
        padding: 20px;
        margin-bottom: 24px;
      }
      
      .warning-title {
        display: flex;
        align-items: center;
        gap: 10px;
        margin-bottom: 12px;
      }
      
      .warning-title span:first-child {
        font-size: 20px;
      }
      
      .warning-title h4 {
        font-size: 16px;
        font-weight: 700;
        color: #ff6b6b;
        margin: 0;
      }
      
      .warning-description {
        font-size: 14px;
        color: #bbb;
        line-height: 1.6;
        margin: 0;
      }
      
      .guard-risks {
        margin-bottom: 24px;
      }
      
      .risk-item {
        display: flex;
        align-items: flex-start;
        gap: 14px;
        padding: 14px 18px;
        background: rgba(255, 255, 255, 0.03);
        border-radius: 12px;
        margin-bottom: 10px;
        border-left: 3px solid #ff3b30;
        transition: all 0.2s;
      }
      
      .risk-item:hover {
        background: rgba(255, 255, 255, 0.05);
        transform: translateX(4px);
      }
      
      .risk-icon {
        width: 32px;
        height: 32px;
        background: rgba(255, 59, 48, 0.2);
        border-radius: 8px;
        display: flex;
        align-items: center;
        justify-content: center;
        font-size: 16px;
        flex-shrink: 0;
      }
      
      .risk-text {
        color: #ddd;
        font-size: 14px;
        line-height: 1.5;
      }
      
      .guard-details {
        background: rgba(255, 255, 255, 0.03);
        border-radius: 16px;
        padding: 20px;
        margin-bottom: 24px;
      }
      
      .details-header {
        display: flex;
        align-items: center;
        gap: 8px;
        margin-bottom: 16px;
        padding-bottom: 12px;
        border-bottom: 1px solid rgba(255, 255, 255, 0.08);
      }
      
      .details-header span {
        font-size: 12px;
        color: #666;
        text-transform: uppercase;
        letter-spacing: 1px;
        font-weight: 600;
      }
      
      .detail-row {
        display: flex;
        justify-content: space-between;
        align-items: center;
        padding: 12px 0;
        border-bottom: 1px solid rgba(255, 255, 255, 0.05);
      }
      
      .detail-row:last-child {
        border-bottom: none;
        padding-bottom: 0;
      }
      
      .detail-label {
        color: #777;
        font-size: 13px;
        font-weight: 500;
      }
      
      .detail-value {
        color: #4fc3f7;
        font-family: 'SF Mono', Monaco, monospace;
        font-size: 12px;
        max-width: 55%;
        text-align: right;
        word-break: break-all;
      }
      
      .detail-value.danger {
        color: #ff6b6b;
        font-weight: 600;
      }
      
      .guard-buttons {
        display: flex;
        gap: 14px;
      }
      
      .guard-btn {
        flex: 1;
        padding: 18px 24px;
        border-radius: 14px;
        font-size: 15px;
        font-weight: 700;
        cursor: pointer;
        border: none;
        transition: all 0.25s ease;
        display: flex;
        align-items: center;
        justify-content: center;
        gap: 10px;
      }
      
      .guard-btn-block {
        background: linear-gradient(135deg, #34d399 0%, #10b981 100%);
        color: #000;
        flex: 1.6;
        box-shadow: 0 4px 20px rgba(52, 211, 153, 0.3);
      }
      
      .guard-btn-block:hover {
        transform: translateY(-3px);
        box-shadow: 0 8px 30px rgba(52, 211, 153, 0.5);
      }
      
      .guard-btn-proceed {
        background: rgba(255, 255, 255, 0.05);
        border: 1px solid rgba(255, 255, 255, 0.1);
        color: #555;
        font-size: 12px;
      }
      
      .guard-btn-proceed:hover {
        border-color: rgba(255, 59, 48, 0.5);
        color: #ff6b6b;
        background: rgba(255, 59, 48, 0.1);
      }
      
      .guard-footer {
        text-align: center;
        margin-top: 24px;
        padding-top: 20px;
        border-top: 1px solid rgba(255, 255, 255, 0.06);
      }
      
      .guard-footer p {
        font-size: 12px;
        color: #555;
        margin: 0 0 12px 0;
        line-height: 1.6;
      }
      
      .guard-branding {
        display: flex;
        align-items: center;
        justify-content: center;
        gap: 8px;
      }
      
      .guard-branding span {
        font-size: 11px;
        color: #444;
        font-weight: 500;
      }
    </style>
    <div class="guard-modal">
      <div class="guard-danger-banner">
        <span>🚨 Phishing Attack Detected 🚨</span>
      </div>
      
      <div class="guard-header">
        <div class="guard-alert-icon">🛡️</div>
        <h2>Signature Request Blocked</h2>
        <p>This website is attempting to steal your assets</p>
      </div>
      
      <div class="guard-body">
        <div class="attack-type-badge">
          <div class="dot"></div>
          <span>${escapeHtml(analysis.signatureType || analysis.methodName)}</span>
        </div>
        
        <div class="guard-warning-box">
          <div class="warning-title">
            <span>⚠️</span>
            <h4>What This Signature Does</h4>
          </div>
          <p class="warning-description">
            Signing this message will grant permanent access to your tokens and NFTs. 
            The attacker can drain your wallet without any further approval.
          </p>
        </div>
        
        <div class="guard-risks">
          ${analysis.risks.map(risk => `
            <div class="risk-item">
              <div class="risk-icon">💀</div>
              <span class="risk-text">${escapeHtml(risk)}</span>
            </div>
          `).join('')}
        </div>

        <div class="guard-details">
          <div class="details-header">
            <span>📋 Signature Details</span>
          </div>
          <div class="detail-row">
            <span class="detail-label">Method</span>
            <span class="detail-value">${escapeHtml(analysis.methodName || 'Unknown')}</span>
          </div>
          ${analysis.contractAddress && analysis.contractAddress !== 'Unknown' ? `
          <div class="detail-row">
            <span class="detail-label">Contract</span>
            <span class="detail-value">${escapeHtml(analysis.contractAddress)}</span>
          </div>
          ` : ''}
          ${analysis.spender ? `
          <div class="detail-row">
            <span class="detail-label">Spender</span>
            <span class="detail-value danger">${escapeHtml(analysis.spender)}</span>
          </div>
          ` : ''}
          ${analysis.signatureDetails && analysis.signatureDetails.name ? `
          <div class="detail-row">
            <span class="detail-label">Protocol</span>
            <span class="detail-value">${escapeHtml(analysis.signatureDetails.name)}</span>
          </div>
          ` : ''}
          <div class="detail-row">
            <span class="detail-label">Website</span>
            <span class="detail-value danger">${escapeHtml(window.location.hostname)}</span>
          </div>
        </div>

        <div class="guard-buttons">
          <button class="guard-btn guard-btn-block" id="guard-block-btn">
            ✓ Block & Stay Safe
          </button>
          <button class="guard-btn guard-btn-proceed" id="guard-proceed-btn">
            Ignore Warning
          </button>
        </div>
        
        <div class="guard-footer">
          <p>If you weren't expecting this, close the tab immediately.<br>This is likely a phishing scam.</p>
          <div class="guard-branding">
            <span>🛡️ Protected by MetaMask Approval Guard</span>
          </div>
        </div>
      </div>
    </div>
  `;

  document.body.appendChild(overlay);

  // Add event listeners
  document.getElementById("guard-block-btn").addEventListener("click", () => {
    handleUserDecision(txId, false);
  });

  document.getElementById("guard-proceed-btn").addEventListener("click", () => {
    const confirmMsg = "⚠️ FINAL WARNING ⚠️\\n\\n" +
      "You are about to sign a message that could:\\n" +
      "• Drain ALL your tokens\\n" +
      "• Steal ALL your NFTs\\n" +
      "• Give permanent access to your wallet\\n\\n" +
      "Only proceed if you 100% trust this website.\\n\\n" +
      "Type 'I UNDERSTAND THE RISK' to continue:";
    
    const userInput = prompt(confirmMsg);
    if (userInput === "I UNDERSTAND THE RISK") {
      handleUserDecision(txId, true);
    }
  });
}
