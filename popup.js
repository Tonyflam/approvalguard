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
});
