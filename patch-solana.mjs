import fs from 'fs';
import path from 'path';

function walk(dir) {
    let results = [];
    if (!fs.existsSync(dir)) return results;
    const list = fs.readdirSync(dir);
    list.forEach(function (file) {
        file = path.join(dir, file);
        const stat = fs.statSync(file);
        if (stat && stat.isDirectory()) {
            results = results.concat(walk(file));
        } else if (file.endsWith('.js')) {
            results.push(file);
        }
    });
    return results;
}

const files = walk('node_modules/@solana-mobile');
let patchedCount = 0;
files.forEach(f => {
    let s = fs.readFileSync(f, 'utf8');
    let patched = false;

    if (s.includes('window.location.assign(associationUrl)')) {
        if (!s.includes('window.__openSolanaIntentUrl')) {
            s = s.replace(/window\.location\.assign\(associationUrl\);/g, 'if (window.__openSolanaIntentUrl) { window.__openSolanaIntentUrl(associationUrl); } else { window.location.assign(associationUrl); }');
            patched = true;
            console.log('Patched Intent routing in ' + f);
        }
    }

    if (s.includes('yield detectionPromise;')) {
        if (!s.includes('if (!window.__openSolanaIntentUrl)')) {
            s = s.replace(/yield detectionPromise;/g, 'if (!window.__openSolanaIntentUrl) { yield detectionPromise; }');
            patched = true;
            console.log('Patched detectionPromise in ' + f);
        }
    }

    if (s.includes('window.isSecureContext')) {
        // Replace strict `isSecureContext` checks with true to bypass Capacitor Android HTTP localhost issues
        s = s.replace(/!window\.isSecureContext/g, 'false');
        s = s.replace(/window\.isSecureContext/g, 'true');
        patched = true;
        console.log('Patched isSecureContext in ' + f);
    }

    if (s.includes('!isWebView(navigator.userAgent)')) {
        // Allow Capacitor WebViews to register the Local Solana Mobile Wallet Auto-connect Standard
        s = s.replace(/!isWebView\(navigator\.userAgent\)/g, 'true');
        patched = true;
        console.log('Patched Webview check in ' + f);
    }

    // Also catch the WalletReadyState.Unsupported assignment from older @solana-mobile/wallet-adapter-mobile v2.1
    if (s.includes('WalletReadyState.Unsupported')) {
        let oldS = s;
        s = s.replace(/this\._readyState\s*=\s*(?:typeof window === 'undefined' \|\| !window\.isSecureContext \|\| typeof document === 'undefined' \|\| !\/android\/i\.test\(navigator\.userAgent\)|typeof window === 'undefined' \|\| typeof document === 'undefined' \|\| !\/android\/i\.test\(navigator\.userAgent\))\s*\?\s*[^:]+\.WalletReadyState\.Unsupported\s*:\s*[^;]+\.WalletReadyState\.Loadable;/g, 'this._readyState = 1; /* Forced Loadable by patch-solana.mjs */');
        s = s.replace(/\w+\.set\(this,"u"===typeof window&&true&&"u"===typeof document&&\/android\/i\.test\(navigator\.userAgent\)\?\w+\.Loadable:\w+\.Unsupported\)/g, 'this._readyState = 1; /* Forced Loadable for minified */');
        s = s.replace(/_BaseSolanaMobileWalletAdapter_readyState\.set\(this,\s*getIsSupported\(\)\s*\?\s*([^;:]+)\s*:\s*[^;)]+\);/g, '_BaseSolanaMobileWalletAdapter_readyState.set(this, $1); /* Forced Loadable by patch-solana.mjs */');

        if (s !== oldS) {
            patched = true;
            console.log('Patched WalletReadyState in ' + f);
        }
    }

    if (patched) {
        fs.writeFileSync(f, s);
        patchedCount++;
    }
});
console.log(`Patched ${patchedCount} files in @solana-mobile.`);
