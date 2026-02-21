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
    if (s.includes('window.location.assign(associationUrl)')) {
        // Only patch if it hasn't been patched yet
        if (!s.includes('window.__openSolanaIntentUrl')) {
            s = s.replace(/window\.location\.assign\(associationUrl\);/g, 'if (window.__openSolanaIntentUrl) { window.__openSolanaIntentUrl(associationUrl); } else { window.location.assign(associationUrl); }');
            fs.writeFileSync(f, s);
            console.log('Patched Intent routing in ' + f);
            patchedCount++;
        }
    }

    // Also patch isSecureContext and navigator.userAgent strict checks that falsely label Capacitor Webviews as Unsupported
    if (s.includes('window.isSecureContext') && s.includes('WalletReadyState.Unsupported')) {
        s = s.replace(/this\._readyState\s*=\s*(?:typeof window === 'undefined' \|\| !window\.isSecureContext \|\| typeof document === 'undefined' \|\| !\/android\/i\.test\(navigator\.userAgent\)|typeof window === 'undefined' \|\| typeof document === 'undefined' \|\| !\/android\/i\.test\(navigator\.userAgent\))\s*\?\s*[^:]+\.WalletReadyState\.Unsupported\s*:\s*[^;]+\.WalletReadyState\.Loadable;/g, 'this._readyState = 1; /* Forced Loadable by patch-solana.mjs */');

        // Also catch the minified version just in case
        s = s.replace(/\w+\.set\(this,"u"===typeof window&&window\.isSecureContext&&"u"===typeof document&&\/android\/i\.test\(navigator\.userAgent\)\?\w+\.Loadable:\w+\.Unsupported\)/g, 'this._readyState = 1; /* Forced Loadable for minified */');

        fs.writeFileSync(f, s);
        console.log('Patched SecureContext in ' + f);
    }
});
console.log(`Patched ${patchedCount} files in @solana-mobile.`);
