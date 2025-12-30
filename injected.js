// MetaMask Approval Guard - Injected Script
// This script runs in the page context to intercept MetaMask ethereum provider calls

(function() {
  "use strict";

  console.log("[MetaMask Approval Guard] Injected script loaded");

  // Store pending requests waiting for approval
  const pendingRequests = new Map();
  let requestCounter = 0;

  // ERC-20 approve function selector
  const ERC20_APPROVE_SELECTOR = "0x095ea7b3";
  // ERC-721 setApprovalForAll function selector
  const ERC721_SET_APPROVAL_FOR_ALL_SELECTOR = "0xa22cb465";
  // increaseAllowance selector
  const INCREASE_ALLOWANCE_SELECTOR = "0x39509351";

  // Dangerous signature methods
  const DANGEROUS_SIGN_METHODS = [
    "eth_signTypedData_v4",
    "eth_signTypedData_v3", 
    "eth_signTypedData",
    "eth_sign"
  ];

  // Permit type hashes and keywords to detect
  const DANGEROUS_PERMIT_TYPES = [
    "Permit",           // EIP-2612 Permit
    "PermitSingle",     // Permit2
    "PermitBatch",      // Permit2 batch
    "OrderComponents",  // Seaport (OpenSea)
    "Order",            // Various DEX orders
    "BulkOrder",        // Seaport bulk
    "SetApprovalForAll",
    "Approval",
    "increaseAllowance",
    "TokenPermissions"
  ];

  // Seaport contract addresses (OpenSea)
  const SEAPORT_ADDRESSES = [
    "0x00000000000000adc04c56bf30ac9d3c0aaf14dc", // Seaport 1.5
    "0x00000000000001ad428e4906ae43d8f9852d0dd6", // Seaport 1.6
     "0x0000000000000068f116a894984e2db1123eb395", // Seaport 1.4
  ];

  // Permit2 addresses
  const PERMIT2_ADDRESSES = [
    "0x000000000022d473030f116ddee9f6b43ac78ba3", // Permit2 on all chains
  ];

  // Function to check if transaction is an approval call
  function isApprovalTransaction(params) {
    if (!params || !params.data) return false;
    const data = params.data.toLowerCase();
    return data.startsWith(ERC20_APPROVE_SELECTOR) || 
           data.startsWith(ERC721_SET_APPROVAL_FOR_ALL_SELECTOR) ||
           data.startsWith(INCREASE_ALLOWANCE_SELECTOR);
  }

  // Check if typed data signature is dangerous (Permit, Seaport, etc.)
  function analyzeTypedData(params) {
    const result = {
      isDangerous: false,
      reason: null,
      details: {}
    };

    try {
      // params can be [address, typedData] or just typedData object
      let typedData = params;
      if (Array.isArray(params)) {
        typedData = params[1] || params[0];
      }

      // Parse if string
      if (typeof typedData === 'string') {
        try {
          typedData = JSON.parse(typedData);
        } catch (e) {
          console.log("[MetaMask Guard] Could not parse typed data");
          return result;
        }
      }

      if (!typedData) return result;

      const dataStr = JSON.stringify(typedData).toLowerCase();
      result.details.raw = typedData;

      // Check domain for known dangerous contracts
      if (typedData.domain) {
        const verifyingContract = (typedData.domain.verifyingContract || "").toLowerCase();
        result.details.verifyingContract = verifyingContract;
        result.details.chainId = typedData.domain.chainId;
        result.details.name = typedData.domain.name;

        // Check for Seaport
        if (SEAPORT_ADDRESSES.includes(verifyingContract)) {
          result.isDangerous = true;
          result.reason = "Seaport/OpenSea order signature - could list your NFTs for sale!";
          result.details.type = "Seaport";
        }

        // Check for Permit2
        if (PERMIT2_ADDRESSES.includes(verifyingContract)) {
          result.isDangerous = true;
          result.reason = "Permit2 signature - grants token spending approval!";
          result.details.type = "Permit2";
        }
      }

      // Check primaryType
      const primaryType = (typedData.primaryType || "").toLowerCase();
      result.details.primaryType = typedData.primaryType;

      for (const dangerousType of DANGEROUS_PERMIT_TYPES) {
        if (primaryType.includes(dangerousType.toLowerCase())) {
          result.isDangerous = true;
          result.reason = `${dangerousType} signature detected - may grant token/NFT approval!`;
          result.details.type = dangerousType;
          break;
        }
      }

      // Check types object for permit-related types
      if (typedData.types) {
        const typesStr = JSON.stringify(typedData.types).toLowerCase();
        for (const dangerousType of DANGEROUS_PERMIT_TYPES) {
          if (typesStr.includes(dangerousType.toLowerCase())) {
            result.isDangerous = true;
            result.reason = `${dangerousType} signature detected - may grant token/NFT approval!`;
            result.details.type = dangerousType;
            break;
          }
        }
      }

      // Check message content for spender, operator, or approval-related fields
      if (typedData.message) {
        const message = typedData.message;
        result.details.message = message;

        // Check for spender field (common in Permit)
        if (message.spender) {
          result.details.spender = message.spender;
          result.isDangerous = true;
          result.reason = "Permit signature with spender - grants token spending approval!";
        }

        // Check for operator (common in NFT approvals)
        if (message.operator) {
          result.details.operator = message.operator;
          result.isDangerous = true;
          result.reason = "Operator approval signature detected!";
        }

        // Check for unlimited values
        if (message.value) {
          const valueStr = message.value.toString();
          if (valueStr.includes("ffffffff") || valueStr.length > 50) {
            result.isDangerous = true;
            result.reason = "Unlimited token approval signature!";
            result.details.unlimitedValue = true;
          }
        }

        // Check for allowed field with amount
        if (message.details && message.details.amount) {
          const amountStr = message.details.amount.toString();
          if (amountStr.includes("ffffffff") || amountStr.length > 50) {
            result.isDangerous = true;
            result.reason = "Unlimited Permit2 approval!";
            result.details.unlimitedValue = true;
          }
        }

        // Seaport specific: check for offer/consideration
        if (message.offer || message.consideration) {
          result.isDangerous = true;
          result.reason = "Seaport order - could transfer your NFTs/tokens!";
          result.details.type = "Seaport Order";
          result.details.offer = message.offer;
          result.details.consideration = message.consideration;
        }
      }

      // Generic check for suspicious keywords in the entire data
      const suspiciousKeywords = ['spender', 'operator', 'approved', 'allowance', 'permit', 'seaport', 'offer', 'consideration'];
      for (const keyword of suspiciousKeywords) {
        if (dataStr.includes(keyword) && !result.isDangerous) {
          result.isDangerous = true;
          result.reason = `Suspicious signature containing "${keyword}" - verify carefully!`;
        }
      }

    } catch (error) {
      console.error("[MetaMask Guard] Error analyzing typed data:", error);
    }

    return result;
  }

  // Check if eth_sign is being used (very dangerous)
  function isEthSignDangerous(params) {
    return {
      isDangerous: true,
      reason: "eth_sign detected - This can sign ANY data including transactions! VERY DANGEROUS!",
      details: {
        type: "eth_sign",
        message: params[1] || params[0]
      }
    };
  }

  // Wait for user decision from content script
  function waitForDecision(requestId) {
    return new Promise((resolve) => {
      const handler = (event) => {
        if (event.source !== window) return;
        if (event.data.type === "METAMASK_GUARD_TX_RESPONSE" && 
            event.data.requestId === requestId) {
          window.removeEventListener("message", handler);
          resolve(event.data.allow);
        }
      };
      window.addEventListener("message", handler);
    });
  }

  // Intercept ethereum provider
  function interceptProvider(provider) {
    if (!provider || provider._metamaskGuardIntercepted) return provider;

    const originalRequest = provider.request.bind(provider);

    provider.request = async function(args) {
      console.log("[MetaMask Guard] Intercepted request:", args.method);

      // Intercept eth_sendTransaction
      if (args.method === "eth_sendTransaction" && args.params && args.params[0]) {
        const txParams = args.params[0];

        if (isApprovalTransaction(txParams)) {
          console.log("[MetaMask Guard] Intercepted approval transaction:", txParams);

          const requestId = `req_${++requestCounter}_${Date.now()}`;

          window.postMessage({
            type: "METAMASK_GUARD_TX_REQUEST",
            requestId: requestId,
            transaction: {
              to: txParams.to,
              from: txParams.from,
              data: txParams.data,
              value: txParams.value,
              gas: txParams.gas,
              gasPrice: txParams.gasPrice
            }
          }, "*");

          const allowed = await waitForDecision(requestId);

          if (!allowed) {
            console.log("[MetaMask Guard] Transaction blocked by user");
            throw new Error("Transaction blocked by MetaMask Approval Guard");
          }

          console.log("[MetaMask Guard] Transaction allowed by user");
        }
      }

      // Intercept dangerous signature methods
      if (DANGEROUS_SIGN_METHODS.includes(args.method) && args.params) {
        console.log("[MetaMask Guard] Intercepted signature request:", args.method, args.params);

        let analysis;
        
        if (args.method === "eth_sign") {
          analysis = isEthSignDangerous(args.params);
        } else {
          analysis = analyzeTypedData(args.params);
        }

        if (analysis.isDangerous) {
          console.log("[MetaMask Guard] Dangerous signature detected:", analysis);

          const requestId = `sig_${++requestCounter}_${Date.now()}`;

          window.postMessage({
            type: "METAMASK_GUARD_SIGNATURE_REQUEST",
            requestId: requestId,
            signatureRequest: {
              method: args.method,
              reason: analysis.reason,
              details: analysis.details,
              params: args.params
            }
          }, "*");

          const allowed = await waitForDecision(requestId);

          if (!allowed) {
            console.log("[MetaMask Guard] Signature blocked by user");
            throw new Error("Signature blocked by MetaMask Approval Guard");
          }

          console.log("[MetaMask Guard] Signature allowed by user");
        }
      }

      // Proceed with original request
      return originalRequest(args);
    };

    // Also intercept legacy sendAsync and send methods
    if (provider.sendAsync) {
      const originalSendAsync = provider.sendAsync.bind(provider);
      provider.sendAsync = function(payload, callback) {
        if (payload.method === "eth_sendTransaction" && payload.params && payload.params[0]) {
          const txParams = payload.params[0];
          
          if (isApprovalTransaction(txParams)) {
            const requestId = `req_${++requestCounter}_${Date.now()}`;

            window.postMessage({
              type: "METAMASK_GUARD_TX_REQUEST",
              requestId: requestId,
              transaction: {
                to: txParams.to,
                from: txParams.from,
                data: txParams.data,
                value: txParams.value,
                gas: txParams.gas,
                gasPrice: txParams.gasPrice
              }
            }, "*");

            waitForDecision(requestId).then(allowed => {
              if (!allowed) {
                callback(new Error("Transaction blocked by MetaMask Approval Guard"), null);
              } else {
                originalSendAsync(payload, callback);
              }
            });
            return;
          }
        }

        // Also handle signature methods in sendAsync
        if (DANGEROUS_SIGN_METHODS.includes(payload.method) && payload.params) {
          let analysis;
          if (payload.method === "eth_sign") {
            analysis = isEthSignDangerous(payload.params);
          } else {
            analysis = analyzeTypedData(payload.params);
          }

          if (analysis.isDangerous) {
            const requestId = `sig_${++requestCounter}_${Date.now()}`;

            window.postMessage({
              type: "METAMASK_GUARD_SIGNATURE_REQUEST",
              requestId: requestId,
              signatureRequest: {
                method: payload.method,
                reason: analysis.reason,
                details: analysis.details,
                params: payload.params
              }
            }, "*");

            waitForDecision(requestId).then(allowed => {
              if (!allowed) {
                callback(new Error("Signature blocked by MetaMask Approval Guard"), null);
              } else {
                originalSendAsync(payload, callback);
              }
            });
            return;
          }
        }

        return originalSendAsync(payload, callback);
      };
    }

    provider._metamaskGuardIntercepted = true;
    console.log("[MetaMask Guard] Provider intercepted successfully");
    return provider;
  }

  // Intercept window.ethereum when it becomes available
  function setupInterception() {
    if (window.ethereum) {
      interceptProvider(window.ethereum);
    }

    let _ethereum = window.ethereum;

    Object.defineProperty(window, "ethereum", {
      get() {
        return _ethereum;
      },
      set(value) {
        _ethereum = interceptProvider(value);
      },
      configurable: true
    });

    // Handle providers array
    if (window.ethereum && window.ethereum.providers) {
      window.ethereum.providers.forEach(interceptProvider);
    }
  }

  // Run setup
  setupInterception();

  // Retry for late-loading providers
  setTimeout(setupInterception, 100);
  setTimeout(setupInterception, 500);
  setTimeout(setupInterception, 1000);
  setTimeout(setupInterception, 2000);

})();
