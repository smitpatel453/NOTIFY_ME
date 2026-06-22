const express = require('express');
const puppeteer = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
puppeteer.use(StealthPlugin());

const cron = require('node-cron');
const axios = require('axios');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;
const NTFY_TOPIC = process.env.HALF_STR;
const BSE_URL = process.env.BSE_TARGET_URL || 'https://www.bseindia.com/corporates/ann';

let trackingCache = [];
let meetingAnnouncements = [];

app.get('/', (req, res) => {
    res.status(200).send('OK');
});

app.get('/favicon.ico', (req, res) => res.status(204).end());

// 📺 NEW ENDPOINT: Display all Meeting announcements in a web interface
app.get('/announcements', (req, res) => {
    const html = `
    <!DOCTYPE html>
    <html>
    <head>
        <title>BSE Meeting Announcements</title>
        <style>
            body { font-family: Arial, sans-serif; max-width: 1000px; margin: 20px auto; padding: 20px; background: #f9f9f9; }
            h1 { color: #333; border-bottom: 3px solid #0066cc; padding-bottom: 10px; }
            .announcement { margin: 15px 0; padding: 15px; background: #ffffff; border-left: 5px solid #0066cc; border-radius: 4px; cursor: pointer; transition: all 0.3s; box-shadow: 0 2px 4px rgba(0,0,0,0.1); }
            .announcement:hover { background: #f0f7ff; transform: translateX(5px); }
            a { color: #0066cc; text-decoration: none; font-size: 16px; line-height: 1.6; display: block; }
            .count { color: #666; font-size: 16px; margin: 10px 0; }
            hr { border: none; border-top: 2px solid #ddd; margin: 20px 0; }
            .empty { color: #999; font-size: 16px; padding: 20px; }
        </style>
    </head>
    <body>
        <h1>🎯 BSE Meeting Announcements</h1>
        <p class="count">📊 Total Meeting Announcements: <strong>${meetingAnnouncements.length}</strong></p>
        <hr>
        ${meetingAnnouncements.length > 0 
            ? meetingAnnouncements.map((item, index) => `
                <div class="announcement">
                    <a href="${BSE_URL}" target="_blank">[${index + 1}] ${item.headline}</a>
                </div>
            `).join('')
            : '<p class="empty">No announcements with "Meeting" found yet. Checking every 5 minutes...</p>'
        }
    </body>
    </html>
    `;

    res.send(html);
});

async function runBseSurveillance() {
    console.log('\nScanning live BSE India corporate stream elements...');
    let browser;

    try {
        const isProduction = process.env.NODE_ENV === 'production';
        
        const launchArgs = [
            '--no-sandbox',
            '--disable-setuid-sandbox',
            '--disable-features=site-per-process'
        ];

        if (isProduction) {
            launchArgs.push('--single-process');
        }

        browser = await puppeteer.launch({
            headless: true,
            args: launchArgs
        });

        const page = await browser.newPage();
        
        await page.setRequestInterception(true);
        page.on('request', (req) => {
            if (['image', 'stylesheet', 'font', 'media'].includes(req.resourceType())) {
                req.abort();
            } else {
                req.continue();
            }
        });

        await page.goto('https://www.bseindia.com/corporates/ann', {
            waitUntil: 'networkidle2',
            timeout: 60000
        });

        // ⏱️ Crucial 4-second delay layout render checkpoint to allow the dynamic Microsoft ASP lifecycle grid to load completely
        await new Promise(resolve => setTimeout(resolve, 4000));

        // AIRTIGHT GRID SLICER ENGINE: Isolates every unique row container independently
        const liveAnnouncements = await page.evaluate((defaultUrl) => {
            // Target every announcement content cell specifically
            const announcementCells = Array.from(document.querySelectorAll('td.TblContent, table[id*="tblAnn"] td, .bc_table_row'));
            
            // Fallback: collect structural cells containing core disclosure timelines
            let rawTargets = announcementCells;
            if (rawTargets.length === 0) {
                rawTargets = Array.from(document.querySelectorAll('td')).filter(td => td.innerText.includes('Exchange Received Time'));
            }

            let allAnnouncements = [];

            rawTargets.forEach(td => {
                const clonedTd = td.cloneNode(true);

                // Extract PDF element paths if they exist anywhere within the item cluster
                const anchor = clonedTd.querySelector('a[href*="xmlData"], a');
                const attachedLink = anchor ? anchor.href : defaultUrl;

                // Option A DOM Filtering Engine: Purges internal dynamic background tags
                const subSpans = clonedTd.querySelectorAll('span');
                subSpans.forEach(span => span.remove());

                let fullText = clonedTd.innerText.trim();

                // Split by "Exchange Received Time" to isolate individual announcements
                const announcements = fullText.split(/Exchange Received Time/).filter(text => text.trim().length > 0);

                announcements.forEach(announcement => {
                    // Clean up the text - remove metadata and extra phrases
                    let cleanText = announcement
                        .replace(/Read less\.\.\s*/gi, '')
                        .replace(/Read More\.\.\s*/gi, '')
                        .replace(/\s*Ref:\s*REGULATION.*$/gi, '')
                        .replace(/Exchange Disseminated Time.*$/gi, '')
                        .replace(/Time Taken.*$/gi, '')
                        .replace(/\s+/g, ' ') // Normalize whitespace
                        .trim();

                    // Extract headline (company name + description before timestamps)
                    const headlineMatch = cleanText.match(/^([A-Za-z0-9\s\.\,\-\(\)&]+?)(?:\s+Read|$)/i);
                    let headline = headlineMatch ? headlineMatch[1].trim() : cleanText.split('\n')[0].trim();

                    // Remove leading date patterns like "22Jun2026" or "22-06-2026"
                    headline = headline.replace(/^\d{1,2}(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\d{4}\s*/i, '')
                                      .replace(/^\d{1,2}-\d{2}-\d{4}\s*/i, '')
                                      .replace(/^\d{1,2}\/\d{2}\/\d{4}\s*/i, '')
                                      .trim();

                    if (headline.length > 40 && !headline.includes('disseminated') && !headline.includes('WITH ALL FAULTS')) {
                        allAnnouncements.push({
                            headline: headline,
                            text: cleanText,
                            link: attachedLink
                        });
                    }
                });
            });

            // Remove duplicates and return unique announcements
            const uniqueAnnouncements = [];
            const seen = new Set();

            allAnnouncements.forEach(item => {
                // 🔍 FILTER: Only include announcements containing "Meeting"
                if (item.headline.toLowerCase().includes('meeting') && !seen.has(item.headline)) {
                    seen.add(item.headline);
                    uniqueAnnouncements.push(item);
                }
            });

            return uniqueAnnouncements;
        }, BSE_URL);

        console.log(`📊 LIVE CAPTURED DATASTREAM REPORT: FOUND ${liveAnnouncements.length} DISTINCT RECORDS.`);

        if (liveAnnouncements.length === 0) {
            console.log('BSE text stream container empty or rendering frame delayed. Retrying next round...');
            await browser.close();
            return;
        }

        // Display all captured announcements in console
        console.log('\n================================================================');
        console.log(`📊 LIVE CAPTURED ANNOUNCEMENTS: ${liveAnnouncements.length} RECORDS`);
        console.log('================================================================');
        liveAnnouncements.forEach((item, index) => {
            console.log(`[ENTRY #${index + 1}]: ${item.headline}\n----------------------------------------------------------------`);
        });
        console.log('================================================================\n');

        if (trackingCache.length === 0) {
            trackingCache = liveAnnouncements.map(item => item.headline);
            console.log(`🎉 TRACKING SYNC ESTABLISHED!`);
            console.log(`Initialized surveillance tracking pool with ${trackingCache.length} unique records.`);
            console.log(`Baseline locked onto current viewport snapshot.\n`);
            await browser.close();
            return;
        }

        const newUploads = liveAnnouncements.filter(item => !trackingCache.includes(item.headline));

        if (newUploads.length > 0) {
            console.log(`🚨 SURVEILLANCE INTERCEPT: Found ${newUploads.length} brand new uploads!`);

            for (const record of newUploads) {
                trackingCache.push(record.headline);

                // 🔍 CASE-INSENSITIVE KEYWORD TARGET FILTER
                const containsMeeting = record.headline.toLowerCase().includes('meeting');

                if (containsMeeting) {
                    console.log(`🎯 MATCH FOUND: Processing alert transmission for 'Meeting'...`);
                    
                    // Store announcement for web display
                    const existingIndex = meetingAnnouncements.findIndex(item => item.headline === record.headline);
                    if (existingIndex === -1) {
                        meetingAnnouncements.unshift({ headline: record.headline, link: record.link });
                        if (meetingAnnouncements.length > 100) {
                            meetingAnnouncements = meetingAnnouncements.slice(0, 100);
                        }
                    }
                    
                    // 🔔 Clean notification message - only headline text
                    const alertPayload = `🔔 MEETING ALERT DETECTED!\n\n🆕 NEW ANNOUNCEMENT:\n${record.headline}`;

                    try {
                        await axios.post(`https://ntfy.sh/${NTFY_TOPIC}`, alertPayload, {
                            headers: { 
                                'Title': '🎯 BSE Meeting Announcement',
                                'Click': BSE_URL
                            },
                            timeout: 10000
                        });
                        console.log('✅ Notification successfully delivered to device.');
                    } catch (ntfyErr) {
                        console.error(`❌ NTFY ERROR: ${ntfyErr.response?.status || ntfyErr.message}`);
                    }

                    // ⏱️ ANTI-SPAM TRAFFIC PACING DELAY BUFFER
                    await new Promise(resolve => setTimeout(resolve, 2000));
                } else {
                    console.log(`skip alert: Filtered out (No 'meeting' context)`);
                }
            }

            if (trackingCache.length > 300) {
                trackingCache = trackingCache.slice(-200);
            }
        } else {
            console.log(`✅ Sync check complete: Snapshot size stable at ${trackingCache.length} strings. No new corporate insertions.`);
        }

    } catch (globalError) {
        console.error('Data Stream Communication Fault:', globalError.message);
    } finally {
        if (browser) {
            await browser.close();
        }
    }
}

cron.schedule('*/5 * * * *', () => {
    runBseSurveillance();
});

app.listen(PORT, () => {
    console.log(`Server listening on port ${PORT}`);
    runBseSurveillance();
});