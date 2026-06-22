const express = require('express');
const puppeteer = require('puppeteer');
const cron = require('node-cron');
const axios = require('axios');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;
const NTFY_TOPIC = process.env.HALF_STR;
// 'smit_news_aler23ts_7739';

// Persistent local cache array to track seen announcement signatures
let trackingCache = [];

// Base routing check status for your Cron-Job.org keeping-alive network pings
app.get('/', (req, res) => {
    res.send('BSE Persistent Set-Delta Cloud Surveillance Engine is fully operational!');
});

// Route to silence browser favicon 404 errors in your console log
app.get('/favicon.ico', (req, res) => res.status(204).end());

/**
 * Core scraping orchestrator logic utilizing Option A node filtering
 */
async function runBseSurveillance() {
    console.log('\nScanning live BSE India corporate stream elements...');
    let browser;

    try {
        const isProduction = process.env.NODE_ENV === 'production';
        
        browser = await puppeteer.launch({
            headless: true,
            args: [
                '--no-sandbox',
                '--disable-setuid-sandbox',
                // Uses single-process ONLY on cloud deployment to manage memory spikes safely
                isProduction ? '--single-process' : '--disable-features=site-per-process'
            ]
        });

        const page = await browser.newPage();
        
        // Block heavy, unneeded assets to minimize your Render outbound bandwidth bytes usage
        await page.setRequestInterception(true);
        page.on('request', (req) => {
            if (['image', 'stylesheet', 'font', 'media'].includes(req.resourceType())) {
                req.abort();
            } else {
                req.continue();
            }
        });

        // Navigate to the BSE Corporate Announcement streaming terminal
        await page.goto('https://www.bseindia.com/corporates/anndet_new.aspx', {
            waitUntil: 'networkidle2',
            timeout: 60000
        });

        // Tiny 2-second stabilization delay buffer to completely eliminate data frame detachment race conditions
        await new Promise(resolve => setTimeout(resolve, 2000));

        // OPTION A DOM PARSING ENGINE: Targets and clones row contexts safely
        const liveAnnouncements = await page.evaluate(() => {
            // Find all anchor links that contain the PDF attachment icon download paths
            const anchors = Array.from(document.querySelectorAll('a[href*="xmlData"]'));
            
            return anchors.map(anchor => {
                // Navigate up the element hierarchy to find the main container row cell text
                const parentTd = anchor.closest('td');
                if (!parentTd) return null;

                // Clone the cell node so we can alter it safely without breaking the live web application state
                const clonedTd = parentTd.cloneNode(true);

                // Strip away all secondary background elements (like internal script blocks or dynamic sub-spans)
                const targetSpans = clonedTd.querySelectorAll('span');
                targetSpans.forEach(span => span.remove());

                // Return a clean text structure stripped of background junk data
                return {
                    text: clonedTd.innerText.trim(),
                    link: anchor.href
                };
            }).filter(item => item !== null && item.text.length > 0);
        });

        console.log(`📊 LIVE CAPTURED DATASTREAM REPORT: FOUND ${liveAnnouncements.length} RECORDS.`);

        // Handle the initial boot condition where cache is empty (prevents alert spam arrays)
        if (trackingCache.length === 0) {
            trackingCache = liveAnnouncements.map(item => item.text);
            console.log(`💾 CACHE INITIALIZED: Baseline set with ${trackingCache.length} tracked signatures.`);
            await browser.close();
            return;
        }

        // Identify brand-new entries by checking them against our tracking array signatures
        const newUploads = liveAnnouncements.filter(item => !trackingCache.includes(item.text));

        if (newUploads.length > 0) {
            console.log(`🚨 SURVEILLANCE INTERCEPT: Found ${newUploads.length} brand new uploads!`);

            for (const record of newUploads) {
                // Add the new record signature to the tracker array cache instantly
                trackingCache.push(record.text);

                // 🔍 CASE-INSENSITIVE KEYWORD FILTER ENGINE
                const containsMeeting = record.text.toLowerCase().includes('meeting');

                if (containsMeeting) {
                    console.log(`🎯 MATCH FOUND: Processing alert transmission for 'Meeting'...`);
                    
                    const alertPayload = `🔔 BSE MEETING ALERT\n\n${record.text}\n\n🔗 PDF Link: ${record.link}`;

                    try {
                        // Dispatch the single filtered request payload to ntfy
                        await axios.post(`https://ntfy.sh/${NTFY_TOPIC}`, alertPayload, {
                            headers: { 'Title': 'BSE Corporate Announcement' }
                        });
                        console.log('✅ Notification successfully delivered to device.');
                    } catch (ntfyErr) {
                        console.error(`❌ NTFY ERROR: Mobile alert delivery failed: Request failed with status code ${ntfyErr.response ? ntfyErr.response.status : ntfyErr.message}`);
                    }

                    // ⏱️ ANTI-SPAM TRAFFIC PACING DELAY BUFFER
                    // Forces a clean 2-second sleep to completely eliminate HTTP 429 Rate Limits
                    await new Promise(resolve => setTimeout(resolve, 2000));

                } else {
                    // Log out the ignored background records silently
                    console.log(`skip alert: Filtered out (No 'meeting' context) -> "${record.text.substring(0, 35)}..."`);
                }
            }

            // Keep memory trim by ensuring tracking array cache doesn't accumulate memory space forever
            if (trackingCache.length > 200) {
                trackingCache = trackingCache.slice(-150);
            }
        } else {
            console.log('⏭️ Stream verified. Zero delta updates detected across active matrices.');
        }

    } catch (globalError) {
        console.error('Data Stream Communication Fault:', globalError.message);
    } finally {
        if (browser) {
            await browser.close();
        }
    }
}

// Main operational background loop configured to check the stream every 5 minutes
cron.schedule('*/5 * * * *', () => {
    runBseSurveillance();
});

// Spin up active listener interface for external incoming Cron-Job.org guard pings
app.listen(PORT, () => {
    console.log(`Server listening on port ${PORT}`);
    // Optional: Trigger a direct scraping execution cycle right at app initialization startup
    runBseSurveillance();
});