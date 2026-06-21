require('dotenv').config();
const express = require('express');
const puppeteer = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
const cron = require('node-cron');
const axios = require('axios');
const fs = require('fs');
const path = require('path');

// Apply stealth camouflage plugins to clean browser signatures
puppeteer.use(StealthPlugin());

const app = express();
const PORT = process.env.PORT || 3000;
const CACHE_FILE_PATH = path.join(__dirname, 'cache.json');

app.get('/', (req, res) => {
    res.send('BSE Persistent Set-Delta Cloud Surveillance Engine is fully operational!');
});

app.listen(PORT,'0.0.0.0', () => {
    console.log(`Server listening on port ${PORT}`);
});

// A global Collection storing every unique headline fingerprint discovered today
let historicalNewsCache = new Set();
let isFirstSyncComplete = false;

// Safe helper function to load saved baseline strings on container startup
function loadCacheFromFile() {
    try {
        if (fs.existsSync(CACHE_FILE_PATH)) {
            const rawData = fs.readFileSync(CACHE_FILE_PATH, 'utf8');
            const parsedArray = JSON.parse(rawData);
            if (Array.isArray(parsedArray)) {
                historicalNewsCache = new Set(parsedArray);
                isFirstSyncComplete = true;
                console.log(`💾 CACHE LOADED: Restored ${historicalNewsCache.size} tracking signatures from persistent local storage.`);
            }
        }
    } catch (err) {
        console.error('⚠️ Cache storage read warning:', err.message);
    }
}

// Safe helper function to save current memory reference fingerprints to disk layout
function saveCacheToFile() {
    try {
        const arrayData = Array.from(historicalNewsCache);
        fs.writeFileSync(CACHE_FILE_PATH, JSON.stringify(arrayData), 'utf8');
    } catch (err) {
        console.error('⚠️ Cache storage write error:', err.message);
    }
}

async function sendNtfyNotification(newHeadline, previousTop2Text, link) {
    const payload = `🚨 NEW RELEASES DETECTED!\n\n🆕 LATEST ADDITION:\n${newHeadline}\n\n📌 ACTIVE HIGHLIGHTS:\n${previousTop2Text}`;
    
    try {
        await axios.post(process.env.NTFY_PUSH_URL, payload, {
            headers: {
                'Title': '🚨 New BSE Announcement!',
                'Click': link,
                'Priority': 'high'
            }
        });
        console.log('✅ NTFY SUCCESS: Fresh database delta notification pushed.');
    } catch (error) {
        console.error('❌ NTFY ERROR: Mobile alert delivery failed:', error.message);
    }
}

async function checkForNewNews() {
    console.log('Scanning live BSE India corporate stream elements...');
    let browser;
    try {
        browser = await puppeteer.launch({
            headless: true,
            args: [
                '--no-sandbox',
                '--disable-setuid-sandbox',
                '--disable-web-security',
                '--disable-features=IsolateOrigins,site-per-process',
                '--disable-gpu',
                '--disable-dev-shm-usage'
            ]
        });

        const page = await browser.newPage();
        await page.setViewport({ width: 1366, height: 768 });
        await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36');

        // Open primary layout target
        await page.goto(process.env.BSE_TARGET_URL, {
            waitUntil: 'networkidle2',
            timeout: 60000
        });

        // Wait explicitly for the dynamic data rows to clear the security challenge
        await page.waitForSelector('tr[ng-repeat*="cann"], tr.ng-scope, td.TChor', { timeout: 30000 }).catch(() => {});
        await new Promise(resolve => setTimeout(resolve, 4000));

        const currentAnnouncements = await page.evaluate(() => {
            const rows = document.querySelectorAll('tr[ng-repeat*="cann"], tr.ng-scope, table tr');
            const validAnnouncements = [];
            
            for (let row of rows) {
                const txt = row.innerText ? row.innerText.replace(/\s+/g, ' ').trim() : '';
                
                if (txt.length > 35 && txt.length < 600 && 
                    (txt.includes('Ltd') || txt.includes('Limited') || txt.includes('Infrastructure') || txt.includes('Announcement') || txt.includes('Company Update'))) {
                    
                    if (!/^\d+\./.test(txt) && 
                        !txt.includes('disseminated seamlessly') && 
                        !txt.includes('WITH ALL FAULTS') && 
                        !txt.includes('pre-verified by the Exchange') &&
                        !txt.includes('BSE Ltd (“Exchange”)') &&
                        !txt.includes('Exchange Received Time Exchange')) {
                        
                        validAnnouncements.push(txt);
                    }
                }
            }

            const uniqueAnnouncements = [...new Set(validAnnouncements)];

            // Keep JSW Infrastructure cleanly pinned at Entry #1 for console logging purposes
            const jswMatch = uniqueAnnouncements.find(item => item.includes('JSW Infrastructure Ltd'));
            if (jswMatch) {
                const filteredList = uniqueAnnouncements.filter(item => !item.includes('JSW Infrastructure Ltd'));
                filteredList.unshift(jswMatch);
                return filteredList;
            }

            return uniqueAnnouncements;
        });

        if (!currentAnnouncements || currentAnnouncements.length === 0) {
            console.log('BSE text stream container empty or rendering frame delayed. Retrying next round...');
            return;
        }

        // 1. DISPLAY ENTIRE LIVE CAPTURED LOG IN CONSOLE PANEL
        console.log('\n================================================================');
        console.log(`📊 LIVE CAPTURED DATASTREAM REPORT: FOUND ${currentAnnouncements.length} RECORDS`);
        console.log('================================================================');
        currentAnnouncements.forEach((headline, index) => {
            console.log(`[ENTRY #${index + 1}]: ${headline}\n----------------------------------------------------------------`);
        });
        console.log('================================================================\n');

        const articleLink = process.env.BSE_TARGET_URL;
        const top1Text = currentAnnouncements[0] || 'N/A';
        const top2Text = currentAnnouncements[1] || 'N/A';
        const backupHighlights = `1️⃣ ${top1Text}\n\n2️⃣ ${top2Text}`;

        // 2. INITIALIZATION STATE: Build baseline reference map if file cache was missing
        if (!isFirstSyncComplete) {
            currentAnnouncements.forEach(item => historicalNewsCache.add(item));
            isFirstSyncComplete = true;
            saveCacheToFile();
            
            console.log(`🎉 TRACKING SYNC ESTABLISHED!`);
            console.log(`Initialized surveillance tracking pool with ${historicalNewsCache.size} unique records.`);
            console.log(`Baseline locked onto current viewport snapshot.\n`);
            return;
        }

        // 3. PERSISTENT DELTA ANALYSIS LOOP
        let newlyDiscoveredItems = [];
        for (let entry of currentAnnouncements) {
            if (!historicalNewsCache.has(entry)) {
                newlyDiscoveredItems.push(entry);
            }
        }

        if (newlyDiscoveredItems.length > 0) {
            console.log(`🚨 SURVEILLANCE INTERCEPT: Found ${newlyDiscoveredItems.length} brand new uploads!`);
            
            for (let newItem of newlyDiscoveredItems) {
                historicalNewsCache.add(newItem);
                await sendNtfyNotification(newItem, backupHighlights, articleLink);
            }
            saveCacheToFile(); // Commit updates permanently to the file tracker asset
        } else {
            console.log(`Sync check complete: Snapshot size stable at ${historicalNewsCache.size} strings. No new corporate insertions.`);
        }

    } catch (error) {
        console.error('Data Stream Communication Fault:', error.message);
    } finally {
        if (browser) {
            await browser.close();
        }
    }
}

// Attempt to restore historical dataset state from disk immediately prior to scanning loop launch
loadCacheFromFile();
checkForNewNews();

// Scheduled monitoring cron loop (Runs automatically every 5 minutes)
cron.schedule('*/5 * * * *', () => {
    checkForNewNews();
});

// Render Deployment Keep-Alive script loop
cron.schedule('*/10 * * * *', async () => {
    try {
        const selfUrl = process.env.RENDER_EXTERNAL_URL;
        if (selfUrl) {
            await axios.get(selfUrl);
            console.log('Keep-Alive: Routine self-ping health check complete.');
        }
    } catch (err) {
        // Safe fail-silent bypass
    }
});