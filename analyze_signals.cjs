const fs = require('fs');

const raw = JSON.parse(fs.readFileSync('./signals_raw.json', 'utf8'));
const texts = raw.map(t => t.full_text || '').map(t => t.toLowerCase());

const stopWords = new Set(['the', 'and', 'to', 'of', 'a', 'in', 'is', 'for', 'on', 'with', 'this', 'that', 'it', 'are', 'be', 'as', 'at', 'from', 'an', 'we', 'by', 'will', 'has', 'have', 'or', 'your', 'can', 'all', 'more', 'about', 'our', 'my', 'you', 'if', 'so', 'just', 'but', 'not', 'what', 'their', 'when', 'up', 'out', 'one', 'new', 'now', 'get', 'like', 'do', 'no', 'us', 'time', 'how', 'me', 'some', 't.co', 'https', 'via', 'rt', 'gm', 'gn', 'sol', 'solana']);

const wordCounts = {};
const bigramCounts = {};

texts.forEach(text => {
    const words = text.replace(/[^\w\s]/g, '').split(/\s+/).filter(w => w.length > 2 && !stopWords.has(w));

    words.forEach((word, i) => {
        wordCounts[word] = (wordCounts[word] || 0) + 1;
        if (i < words.length - 1) {
            const bigram = `${word} ${words[i + 1]}`;
            bigramCounts[bigram] = (bigramCounts[bigram] || 0) + 1;
        }
    });
});

console.log("--- TOP WORDS ---");
Object.entries(wordCounts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 30)
    .forEach(([k, v]) => console.log(`${k}: ${v}`));

console.log("\n--- TOP BIGRAMS ---");
Object.entries(bigramCounts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 30)
    .forEach(([k, v]) => console.log(`${k}: ${v}`));
