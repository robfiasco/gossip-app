import fs from 'fs';
import path from 'path';
import { commitStoriesToMemory } from './storyMemory.mjs';

const cwd = process.cwd();
const PREMIUM_STORIES_PATH = path.join(cwd, 'data', 'ct_stories.json');
const PUBLIC_PREMIUM_STORIES_PATH = path.join(cwd, 'public', 'data', 'validator_stories.json');
const NEWS_CARDS_PATH = path.join(cwd, 'news_cards.json');

const main = () => {
    const candidatePaths = [
        PREMIUM_STORIES_PATH,
        PUBLIC_PREMIUM_STORIES_PATH,
        NEWS_CARDS_PATH,
    ];

    try {
        let items = [];
        for (const filePath of candidatePaths) {
            if (!fs.existsSync(filePath)) continue;
            const data = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
            const parsedItems = Array.isArray(data) ? data : (data.items || []);
            if (parsedItems.length > 0) {
                items = parsedItems;
                break;
            }
        }

        if (items.length > 0) {
            commitStoriesToMemory(items);
        } else {
            console.log("No story items found to commit.");
        }
    } catch (err) {
        console.error("Failed to commit memory:", err.message);
        process.exit(1);
    }
};

main();
