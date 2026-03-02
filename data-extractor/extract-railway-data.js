#!/usr/bin/env node
/**
 * Africa Railway Data Extraction Script
 * 
 * This script queries the Overpass API to extract railway stations and railway lines
 * for each African country, saving them as static JSON files for use by the web application.
 * 
 * Usage:
 *   node extract-railway-data.js [country-code]
 *   node extract-railway-data.js --all
 *   node extract-railway-data.js --region "Southern Africa"
 * 
 * Output:
 *   data/stations/{country-code}.json - Station data
 *   data/railways/{country-code}.json - Railway geometry data
 *   data/manifest.json - Index of all available data files
 */

const fs = require('fs');
const path = require('path');
const https = require('https');

// Load country definitions
const countriesData = require('./countries.json');

const OVERPASS_ENDPOINTS = [
    'https://overpass-api.de/api/interpreter',
    'https://overpass.kumi.systems/api/interpreter',
    'https://maps.mail.ru/osm/tools/overpass/api/interpreter'
];

const RATE_LIMIT_DELAY = 5000; // 5 seconds between requests
const MAX_RETRIES = 3;
const REQUEST_TIMEOUT = 120000; // 2 minutes

// Ensure output directories exist
const DATA_DIR = path.join(__dirname, '..', 'data');
const STATIONS_DIR = path.join(DATA_DIR, 'stations');
const RAILWAYS_DIR = path.join(DATA_DIR, 'railways');

[DATA_DIR, STATIONS_DIR, RAILWAYS_DIR].forEach(dir => {
    if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
    }
});

/**
 * Make an HTTP request with timeout and retry logic
 */
function makeRequest(url, body, endpointIndex = 0, retries = 0) {
    return new Promise((resolve, reject) => {
        const endpoint = OVERPASS_ENDPOINTS[endpointIndex];
        const fullUrl = endpoint;
        
        console.log(`  [Request] Using endpoint: ${endpoint} (attempt ${retries + 1})`);
        
        const urlObj = new URL(fullUrl);
        const options = {
            hostname: urlObj.hostname,
            port: 443,
            path: urlObj.pathname,
            method: 'POST',
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded',
                'Content-Length': Buffer.byteLength(body),
                'User-Agent': 'AfricaRailwayCalculator/2.0 (https://github.com/njfinney/Africa_Railway_Calculator)'
            },
            timeout: REQUEST_TIMEOUT
        };

        const req = https.request(options, (res) => {
            let data = '';
            
            res.on('data', chunk => data += chunk);
            res.on('end', () => {
                if (res.statusCode === 200) {
                    try {
                        const json = JSON.parse(data);
                        resolve(json);
                    } catch (e) {
                        reject(new Error(`Invalid JSON response: ${e.message}`));
                    }
                } else if (res.statusCode === 429 || res.statusCode === 504) {
                    // Rate limited or timeout - try next endpoint or retry
                    if (endpointIndex < OVERPASS_ENDPOINTS.length - 1) {
                        console.log(`  [Retry] Status ${res.statusCode}, trying next endpoint...`);
                        setTimeout(() => {
                            resolve(makeRequest(url, body, endpointIndex + 1, 0));
                        }, RATE_LIMIT_DELAY);
                    } else if (retries < MAX_RETRIES) {
                        console.log(`  [Retry] Status ${res.statusCode}, retrying in ${RATE_LIMIT_DELAY/1000}s...`);
                        setTimeout(() => {
                            resolve(makeRequest(url, body, 0, retries + 1));
                        }, RATE_LIMIT_DELAY * (retries + 1));
                    } else {
                        reject(new Error(`HTTP ${res.statusCode} after ${MAX_RETRIES} retries`));
                    }
                } else {
                    reject(new Error(`HTTP ${res.statusCode}: ${data.substring(0, 200)}`));
                }
            });
        });

        req.on('timeout', () => {
            req.destroy();
            if (endpointIndex < OVERPASS_ENDPOINTS.length - 1) {
                console.log(`  [Timeout] Trying next endpoint...`);
                resolve(makeRequest(url, body, endpointIndex + 1, retries));
            } else if (retries < MAX_RETRIES) {
                console.log(`  [Timeout] Retrying...`);
                resolve(makeRequest(url, body, 0, retries + 1));
            } else {
                reject(new Error('Request timeout after all retries'));
            }
        });

        req.on('error', (e) => {
            if (retries < MAX_RETRIES) {
                console.log(`  [Error] ${e.message}, retrying...`);
                setTimeout(() => {
                    resolve(makeRequest(url, body, endpointIndex, retries + 1));
                }, RATE_LIMIT_DELAY);
            } else {
                reject(e);
            }
        });

        req.write(body);
        req.end();
    });
}

/**
 * Query Overpass API for railway stations in a country
 */
async function extractStations(country) {
    const [south, west, north, east] = country.bbox;
    
    const query = `
[out:json][timeout:120][bbox:${south},${west},${north},${east}];
(
  node["railway"~"station|halt|stop|service_station"];
  way["railway"~"station|halt|service_station"];
  node["public_transport"="station"]["train"="yes"];
  way["public_transport"="station"];
  way["building"="train_station"];
  node["name"~"[Ss]tation|[Ee]stação|[Gg]are|[Hh]alt"];
);
out center tags;`;

    console.log(`  Extracting stations for ${country.name}...`);
    
    const data = await makeRequest('overpass', `data=${encodeURIComponent(query)}`);
    
    if (!data.elements || data.elements.length === 0) {
        console.log(`  No stations found for ${country.name}`);
        return [];
    }
    
    // Process and deduplicate stations
    const stationMap = new Map();
    
    for (const el of data.elements) {
        const lat = el.type === 'way' ? el.center?.lat : el.lat;
        const lon = el.type === 'way' ? el.center?.lon : el.lon;
        
        if (!lat || !lon) continue;
        
        const name = el.tags?.name || el.tags?.ref || `Unnamed (${el.type} ${el.id})`;
        const locKey = `${lat.toFixed(4)},${lon.toFixed(4)}`; // ~10m precision for dedup
        
        // Keep the entry with the better name
        if (!stationMap.has(locKey) || 
            (name.toLowerCase().includes('station') || name.toLowerCase().includes('estação') || name.toLowerCase().includes('gare'))) {
            stationMap.set(locKey, {
                id: el.id,
                lat: parseFloat(lat.toFixed(6)),
                lon: parseFloat(lon.toFixed(6)),
                name: name,
                type: el.tags?.railway || 'station',
                country: country.code
            });
        }
    }
    
    const stations = Array.from(stationMap.values()).sort((a, b) => a.name.localeCompare(b.name));
    console.log(`  Found ${stations.length} stations in ${country.name}`);
    
    return stations;
}

/**
 * Query Overpass API for railway lines in a country
 */
async function extractRailways(country) {
    const [south, west, north, east] = country.bbox;
    
    const query = `
[out:json][timeout:180][bbox:${south},${west},${north},${east}];
way["railway"~"rail|narrow_gauge|light_rail|subway|tram|disused|abandoned|preserved"];
out geom;`;

    console.log(`  Extracting railways for ${country.name}...`);
    
    const data = await makeRequest('overpass', `data=${encodeURIComponent(query)}`);
    
    if (!data.elements || data.elements.length === 0) {
        console.log(`  No railways found for ${country.name}`);
        return [];
    }
    
    // Process railways - keep geometry but simplify for file size
    const railways = data.elements
        .filter(el => el.geometry && el.geometry.length >= 2)
        .map(el => ({
            id: el.id,
            type: el.tags?.railway || 'rail',
            geometry: el.geometry.map(p => [
                parseFloat(p.lat.toFixed(5)), 
                parseFloat(p.lon.toFixed(5))
            ])
        }));
    
    console.log(`  Found ${railways.length} railway segments in ${country.name}`);
    
    return railways;
}

/**
 * Extract data for a single country and save to files
 */
async function processCountry(country) {
    console.log(`\n[${country.code}] Processing ${country.name}...`);
    
    try {
        // Extract stations
        const stations = await extractStations(country);
        const stationsFile = path.join(STATIONS_DIR, `${country.code}.json`);
        fs.writeFileSync(stationsFile, JSON.stringify({
            country: country.code,
            name: country.name,
            region: country.region,
            bbox: country.bbox,
            extracted: new Date().toISOString(),
            count: stations.length,
            stations: stations
        }, null, 2));
        console.log(`  Saved ${stationsFile}`);
        
        // Rate limit delay
        await new Promise(r => setTimeout(r, RATE_LIMIT_DELAY));
        
        // Extract railways
        const railways = await extractRailways(country);
        const railwaysFile = path.join(RAILWAYS_DIR, `${country.code}.json`);
        fs.writeFileSync(railwaysFile, JSON.stringify({
            country: country.code,
            name: country.name,
            region: country.region,
            bbox: country.bbox,
            extracted: new Date().toISOString(),
            count: railways.length,
            railways: railways
        }, null, 2));
        console.log(`  Saved ${railwaysFile}`);
        
        return {
            code: country.code,
            name: country.name,
            region: country.region,
            bbox: country.bbox,
            stationCount: stations.length,
            railwayCount: railways.length,
            success: true
        };
    } catch (error) {
        console.error(`  [ERROR] Failed to process ${country.name}: ${error.message}`);
        return {
            code: country.code,
            name: country.name,
            region: country.region,
            bbox: country.bbox,
            stationCount: 0,
            railwayCount: 0,
            success: false,
            error: error.message
        };
    }
}

/**
 * Update the manifest file with extraction results
 */
function updateManifest(results) {
    const manifestFile = path.join(DATA_DIR, 'manifest.json');
    
    let manifest = {
        version: '2.0',
        generated: new Date().toISOString(),
        countries: {}
    };
    
    // Load existing manifest if it exists
    if (fs.existsSync(manifestFile)) {
        try {
            manifest = JSON.parse(fs.readFileSync(manifestFile, 'utf8'));
        } catch (e) {
            console.log('Creating new manifest...');
        }
    }
    
    // Update with new results
    for (const result of results) {
        manifest.countries[result.code] = {
            name: result.name,
            region: result.region,
            bbox: result.bbox,
            stationCount: result.stationCount,
            railwayCount: result.railwayCount,
            hasData: result.success && (result.stationCount > 0 || result.railwayCount > 0),
            lastUpdated: new Date().toISOString()
        };
    }
    
    manifest.generated = new Date().toISOString();
    
    fs.writeFileSync(manifestFile, JSON.stringify(manifest, null, 2));
    console.log(`\nUpdated manifest: ${manifestFile}`);
}

/**
 * Main execution
 */
async function main() {
    const args = process.argv.slice(2);
    
    let countriesToProcess = [];
    
    if (args.includes('--all')) {
        countriesToProcess = countriesData.countries;
    } else if (args.includes('--region')) {
        const regionIndex = args.indexOf('--region');
        const regionName = args[regionIndex + 1];
        const regionCodes = countriesData.regions[regionName];
        if (!regionCodes) {
            console.error(`Unknown region: ${regionName}`);
            console.error(`Available regions: ${Object.keys(countriesData.regions).join(', ')}`);
            process.exit(1);
        }
        countriesToProcess = countriesData.countries.filter(c => regionCodes.includes(c.code));
    } else if (args.length > 0) {
        // Process specific country codes
        const codes = args.map(a => a.toUpperCase());
        countriesToProcess = countriesData.countries.filter(c => codes.includes(c.code));
        if (countriesToProcess.length === 0) {
            console.error(`No matching countries found for: ${args.join(', ')}`);
            console.error(`Available codes: ${countriesData.countries.map(c => c.code).join(', ')}`);
            process.exit(1);
        }
    } else {
        console.log('Africa Railway Data Extraction Script');
        console.log('=====================================');
        console.log('');
        console.log('Usage:');
        console.log('  node extract-railway-data.js ZA MW MZ   # Extract specific countries');
        console.log('  node extract-railway-data.js --region "Southern Africa"');
        console.log('  node extract-railway-data.js --all      # Extract all countries');
        console.log('');
        console.log('Available regions:', Object.keys(countriesData.regions).join(', '));
        console.log('Available countries:', countriesData.countries.map(c => c.code).join(', '));
        process.exit(0);
    }
    
    console.log(`\nProcessing ${countriesToProcess.length} countries...`);
    console.log('Countries:', countriesToProcess.map(c => c.name).join(', '));
    
    const results = [];
    
    for (let i = 0; i < countriesToProcess.length; i++) {
        const country = countriesToProcess[i];
        console.log(`\n[${i + 1}/${countriesToProcess.length}]`);
        
        const result = await processCountry(country);
        results.push(result);
        
        // Rate limit between countries
        if (i < countriesToProcess.length - 1) {
            console.log(`  Waiting ${RATE_LIMIT_DELAY/1000}s before next country...`);
            await new Promise(r => setTimeout(r, RATE_LIMIT_DELAY));
        }
    }
    
    // Update manifest
    updateManifest(results);
    
    // Summary
    console.log('\n=====================================');
    console.log('EXTRACTION SUMMARY');
    console.log('=====================================');
    const successful = results.filter(r => r.success);
    const failed = results.filter(r => !r.success);
    console.log(`Successful: ${successful.length}/${results.length}`);
    console.log(`Total stations: ${successful.reduce((sum, r) => sum + r.stationCount, 0)}`);
    console.log(`Total railway segments: ${successful.reduce((sum, r) => sum + r.railwayCount, 0)}`);
    
    if (failed.length > 0) {
        console.log('\nFailed countries:');
        failed.forEach(r => console.log(`  - ${r.name}: ${r.error}`));
    }
}

main().catch(error => {
    console.error('Fatal error:', error);
    process.exit(1);
});
