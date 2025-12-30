# MetaMask Approval Guard

A minimal Chrome extension MVP that protects MetaMask users from wallet-drain approvals.

## Features

- 🛡️ **Detects dangerous approvals**: Intercepts ERC-20 `approve()` and ERC-721/ERC-1155 `setApprovalForAll()` calls
- ⚠️ **Unlimited approval warnings**: Alerts when a dApp requests unlimited token spending
- 🚫 **Blacklist checking**: Compares contract and spender addresses against known malicious addresses
- 🔒 **Blocking UI**: Shows a warning overlay that requires explicit user action to proceed
- 🦊 **MetaMask focused**: Specifically targets MetaMask's ethereum provider

## How It Works

1. The extension injects a script into every page that intercepts calls to MetaMask's ethereum provider
2. When an `eth_sendTransaction` request is detected with approval function signatures, it's analyzed
3. If the transaction is risky (unlimited approval or blacklisted address), a blocking overlay is shown
4. The user must explicitly choose to block or proceed with the transaction

## Installation (Local Development)

### Prerequisites
- Google Chrome or Chromium-based browser
- MetaMask extension installed

### Steps

1. **Clone or download this repository**

2. **Generate icon files** (required for Chrome extension):
   ```bash
   cd /path/to/secmvp
   
   # Option 1: Create simple placeholder icons using ImageMagick
   convert -size 16x16 xc:#1a1a2e icons/icon16.png
   convert -size 48x48 xc:#1a1a2e icons/icon48.png
   convert -size 128x128 xc:#1a1a2e icons/icon128.png
   
   # Option 2: Or use any 16x16, 48x48, and 128x128 PNG images
   ```
   
   **Alternative**: If you don't have ImageMagick, create any PNG files with those dimensions, or use this one-liner with Python:
   ```bash
   python3 -c "
from PIL import Image
for size in [16, 48, 128]:
    img = Image.new('RGB', (size, size), '#1a1a2e')
    img.save(f'icons/icon{size}.png')
print('Icons created!')
"
   ```

3. **Load the extension in Chrome**:
   - Open Chrome and navigate to `chrome://extensions/`
   - Enable **Developer mode** (toggle in top right)
   - Click **Load unpacked**
   - Select the `secmvp` folder

4. **Verify installation**:
   - You should see "MetaMask Approval Guard" in your extensions list
   - Click the extension icon to see the popup UI
   - The status should show "Active & Protecting"

## Testing

### Test with a sample approval transaction

1. Visit any dApp that requests token approvals (e.g., Uniswap, OpenSea)
2. Initiate a token swap or NFT listing that requires approval
3. The extension should intercept the approval and show a warning if:
   - The approval amount is unlimited (max uint256 or close to it)
   - The contract or spender address is in the blacklist

### Manual test with console

You can test the interception by running this in the browser console on any page:

```javascript
// Simulate an unlimited ERC-20 approve call
if (window.ethereum) {
  window.ethereum.request({
    method: 'eth_sendTransaction',
    params: [{
      from: '0xYourAddress',
      to: '0xTokenContract',
      data: '0x095ea7b3000000000000000000000000spenderaddress0000000000000000000000ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff'
    }]
  }).catch(console.error);
}
```

## Blacklist

The blacklist is hardcoded in `background.js`. To add addresses:

```javascript
const BLACKLIST = [
  "0x0000000000000000000000000000000000000001",
  "0xdead000000000000000000000000000000000000",
  "0xbad0000000000000000000000000000000000000",
  // Add more malicious addresses here
];
```

## File Structure

```
secmvp/
├── manifest.json          # Chrome extension manifest (v3)
├── background.js          # Service worker - analyzes transactions
├── content.js             # Content script - bridges page and extension
├── injected.js            # Injected into page - intercepts MetaMask
├── popup.html             # Extension popup UI
├── popup.js               # Popup script
├── icons/
│   ├── icon16.png         # 16x16 icon
│   ├── icon48.png         # 48x48 icon
│   └── icon128.png        # 128x128 icon
└── README.md              # This file
```

## Detected Function Signatures

| Function | Selector | Standard |
|----------|----------|----------|
| `approve(address,uint256)` | `0x095ea7b3` | ERC-20 |
| `setApprovalForAll(address,bool)` | `0xa22cb465` | ERC-721/ERC-1155 |

## Limitations

- **Local development only**: Not production-ready
- **Static blacklist**: No dynamic updates
- **MetaMask only**: Doesn't support other wallets
- **No backend**: All processing is local
- **Basic detection**: More sophisticated attacks might evade detection

## Security Notes

⚠️ This is an MVP for educational purposes. For production use:
- Implement dynamic blacklist updates
- Add more comprehensive transaction analysis
- Support multiple wallet providers
- Add signature verification
- Consider rate limiting and anti-tampering measures

## License

MIT License - Use at your own risk.
