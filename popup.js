// MetaMask Approval Guard - Popup Script

document.addEventListener("DOMContentLoaded", async () => {
  // Load stats from storage
  try {
    const stats = await chrome.storage.local.get(["scannedCount", "blockedCount"]);
    
    document.getElementById("scannedCount").textContent = stats.scannedCount || 0;
    document.getElementById("blockedCount").textContent = stats.blockedCount || 0;
  } catch (error) {
    console.error("Error loading stats:", error);
  }

  // Update status indicator
  const statusIndicator = document.getElementById("statusIndicator");
  const statusInfo = document.getElementById("statusInfo");
  const statusTitle = document.getElementById("statusTitle");
  const statusDesc = document.getElementById("statusDesc");

  // Check if service worker is active
  try {
    await chrome.runtime.sendMessage({ type: "PING" });
    statusIndicator.classList.remove("inactive");
    statusIndicator.textContent = "✓";
    statusInfo.classList.remove("inactive");
    statusTitle.textContent = "Protection Active";
    statusDesc.textContent = "Monitoring all transactions";
  } catch (error) {
    statusIndicator.classList.add("inactive");
    statusIndicator.textContent = "✕";
    statusInfo.classList.add("inactive");
    statusTitle.textContent = "Protection Inactive";
    statusTitle.style.color = "#f87171";
    statusDesc.textContent = "Service worker not responding";
  }

  // Load and display recent events
  loadEventLog();
});

// Load event log from storage
async function loadEventLog() {
  const logContainer = document.getElementById("eventLog");
  if (!logContainer) return;

  try {
    const { eventLog = [] } = await chrome.storage.local.get('eventLog');
    
    if (eventLog.length === 0) {
      logContainer.innerHTML = '<div class="log-empty">No events yet</div>';
      return;
    }

    // Show last 10 events, newest first
    const recentEvents = eventLog.slice(-10).reverse();
    logContainer.innerHTML = recentEvents.map(event => {
      const time = new Date(event.timestamp).toLocaleTimeString();
      const icon = getEventIcon(event.type);
      const label = getEventLabel(event.type, event.decision);
      return `<div class="log-entry ${event.type.toLowerCase()}">
        <span class="log-icon">${icon}</span>
        <span class="log-label">${label}</span>
        <span class="log-time">${time}</span>
      </div>`;
    }).join('');
  } catch (error) {
    console.error("Error loading event log:", error);
    logContainer.innerHTML = '<div class="log-empty">Error loading logs</div>';
  }
}

function getEventIcon(type) {
  switch(type) {
    case 'TRANSACTION_INTERCEPTED': return '🔍';
    case 'SIGNATURE_INTERCEPTED': return '✍️';
    case 'WARNING_DISPLAYED': return '⚠️';
    case 'USER_DECISION': return '👤';
    default: return '📝';
  }
}

function getEventLabel(type, decision) {
  switch(type) {
    case 'TRANSACTION_INTERCEPTED': return 'Transaction intercepted';
    case 'SIGNATURE_INTERCEPTED': return 'Signature intercepted';
    case 'WARNING_DISPLAYED': return 'Warning shown';
    case 'USER_DECISION': 
      return decision === 'BLOCK' ? 'Blocked by user' : 'User proceeded';
    default: return type;
  }
}

// Clear logs button handler
document.getElementById("clearLogs")?.addEventListener("click", async () => {
  await chrome.storage.local.set({ eventLog: [] });
  loadEventLog();
});
