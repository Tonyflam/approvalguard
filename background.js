// MetaMask Approval Guard - Background Service Worker

// Known malicious contract addresses (blacklist)
const BLACKLIST = [
  "0x0000000000000000000000000000000000000001", // Example malicious address
  "0xdead000000000000000000000000000000000000", // Example malicious address
  "0xbad0000000000000000000000000000000000000", // Example malicious address
  // Add more known malicious addresses here
];

// Unlimited approval threshold (max uint256)
const UNLIMITED_APPROVAL = "0xffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff";
const UNLIMITED_THRESHOLD = BigInt("0x" + "f".repeat(64)) / BigInt(2); // Half of max uint256

// ERC-20 approve function selector: approve(address,uint256)
const ERC20_APPROVE_SELECTOR = "0x095ea7b3";

// ERC-721 setApprovalForAll function selector: setApprovalForAll(address,bool)
const ERC721_SET_APPROVAL_FOR_ALL_SELECTOR = "0xa22cb465";

// Store pending transactions awaiting user decision
const pendingTransactions = new Map();

// Listen for messages from content script
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  console.log("[Background] Received message:", message.type);

  if (message.type === "ANALYZE_TRANSACTION") {
    const analysis = analyzeTransaction(message.data);
    
    if (analysis.isRisky) {
      // Store the pending transaction
      const txId = Date.now().toString();
      pendingTransactions.set(txId, {
        tabId: sender.tab.id,
        transaction: message.data,
        analysis: analysis
      });

      // Send back that we need user confirmation
      sendResponse({
        action: "SHOW_WARNING",
        txId: txId,
        analysis: analysis
      });
    } else {
      sendResponse({ action: "ALLOW" });
    }
    return true;
  }

  if (message.type === "USER_DECISION") {
    const pending = pendingTransactions.get(message.txId);
    if (pending) {
      // Notify the content script of the decision
      chrome.tabs.sendMessage(pending.tabId, {
        type: "TRANSACTION_DECISION",
        txId: message.txId,
        allow: message.allow
      });
      pendingTransactions.delete(message.txId);
    }
    sendResponse({ success: true });
    return true;
  }

  if (message.type === "GET_PENDING_TX") {
    const pending = pendingTransactions.get(message.txId);
    sendResponse(pending || null);
    return true;
  }
});

function analyzeTransaction(txData) {
  const result = {
    isRisky: false,
    risks: [],
    contractAddress: null,
    methodName: null,
    spender: null,
    amount: null,
    isUnlimited: false,
    isBlacklisted: false
  };

  if (!txData || !txData.to || !txData.data) {
    return result;
  }

  const to = txData.to.toLowerCase();
  const data = txData.data.toLowerCase();
  result.contractAddress = to;

  // Check if contract is blacklisted
  if (BLACKLIST.map(a => a.toLowerCase()).includes(to)) {
    result.isBlacklisted = true;
    result.isRisky = true;
    result.risks.push("Contract address is on the blacklist!");
  }

  // Check for ERC-20 approve
  if (data.startsWith(ERC20_APPROVE_SELECTOR)) {
    result.methodName = "approve (ERC-20)";
    
    // Extract spender address (bytes 4-36, padded to 32 bytes)
    if (data.length >= 74) {
      result.spender = "0x" + data.slice(34, 74);
    }

    // Extract amount (bytes 36-68)
    if (data.length >= 138) {
      const amountHex = "0x" + data.slice(74, 138);
      result.amount = amountHex;

      // Check for unlimited approval
      try {
        const amount = BigInt(amountHex);
        if (amount >= UNLIMITED_THRESHOLD) {
          result.isUnlimited = true;
          result.isRisky = true;
          result.risks.push("Unlimited token approval detected!");
        }
      } catch (e) {
        console.error("Error parsing amount:", e);
      }
    }

    // Check if spender is blacklisted
    if (result.spender && BLACKLIST.map(a => a.toLowerCase()).includes(result.spender.toLowerCase())) {
      result.isBlacklisted = true;
      result.isRisky = true;
      result.risks.push("Spender address is on the blacklist!");
    }
  }

  // Check for ERC-721 setApprovalForAll
  if (data.startsWith(ERC721_SET_APPROVAL_FOR_ALL_SELECTOR)) {
    result.methodName = "setApprovalForAll (ERC-721/ERC-1155)";

    // Extract operator address
    if (data.length >= 74) {
      result.spender = "0x" + data.slice(34, 74);
    }

    // Extract approval boolean (1 = approved)
    if (data.length >= 138) {
      const approved = data.slice(136, 138);
      if (approved === "01" || data.slice(74, 138).endsWith("1")) {
        result.isUnlimited = true;
        result.isRisky = true;
        result.risks.push("NFT approval for all tokens detected!");
      }
    }

    // Check if operator is blacklisted
    if (result.spender && BLACKLIST.map(a => a.toLowerCase()).includes(result.spender.toLowerCase())) {
      result.isBlacklisted = true;
      result.isRisky = true;
      result.risks.push("Operator address is on the blacklist!");
    }
  }

  return result;
}

// Log when service worker starts
console.log("[MetaMask Approval Guard] Background service worker started");
