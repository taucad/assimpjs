#!/usr/bin/env node
/**
 * Render glTF models to PNG snapshots using Puppeteer + glTF-Sample-Renderer.
 *
 * Uses a standalone render page (render.html) that loads the renderer library
 * directly with programmatic camera, environment, and background control to
 * produce images matching the USD renderer for apples-to-apples comparison.
 *
 * Camera: orbit at yaw=30°, pitch=20° (matching USD renderer)
 * Background: white (#ffffff)
 * Environment: neutral HDR IBL (no environment map in background)
 *
 * Usage:
 *   node test/render_gltf_snapshots.js
 *   node test/render_gltf_snapshots.js --filter "Box*"
 *   node test/render_gltf_snapshots.js --width 512
 */

const puppeteer = require('puppeteer');
const http = require('http');
const fs = require('fs');
const path = require('path');

const PROJECT_ROOT = path.resolve(__dirname, '..');
const VIEWER_DIR = path.join(PROJECT_ROOT, 'repos', 'glTF-Sample-Viewer', 'dist');
const RENDERER_DIR = path.join(PROJECT_ROOT, 'repos', 'glTF-Sample-Viewer', 'glTF-Sample-Renderer');
const SAMPLE_ASSETS = path.join(PROJECT_ROOT, 'repos', 'glTF-Sample-Assets', 'Models');
const MODEL_INDEX = path.join(SAMPLE_ASSETS, 'model-index.json');
const DEFAULT_OUTPUT = path.join(PROJECT_ROOT, 'output', 'gltf', 'renders');

const ENV_BASE = 'https://raw.githubusercontent.com/KhronosGroup/glTF-Sample-Environments/low_resolution_hdrs/';
const DEFAULT_ENV = 'neutral';

const CAMERA_YAW = 30;
const CAMERA_PITCH = 20;

const MIME_TYPES = {
    '.html': 'text/html', '.js': 'application/javascript', '.mjs': 'application/javascript',
    '.css': 'text/css', '.png': 'image/png', '.jpg': 'image/jpeg', '.gif': 'image/gif',
    '.json': 'application/json', '.glb': 'model/gltf-binary', '.gltf': 'model/gltf+json',
    '.bin': 'application/octet-stream', '.hdr': 'application/octet-stream',
    '.ktx2': 'application/octet-stream', '.webp': 'image/webp',
    '.svg': 'image/svg+xml', '.woff': 'font/woff', '.woff2': 'font/woff2',
    '.wasm': 'application/wasm', '.map': 'application/json',
};

function createStaticServer(rootDirs) {
    return http.createServer((req, res) => {
        let urlPath = decodeURIComponent(req.url.split('?')[0]);
        if (urlPath === '/') urlPath = '/render.html';

        for (const root of rootDirs) {
            const filePath = path.join(root, urlPath);
            if (fs.existsSync(filePath) && fs.statSync(filePath).isFile()) {
                const ext = path.extname(filePath).toLowerCase();
                const mime = MIME_TYPES[ext] || 'application/octet-stream';
                res.writeHead(200, {
                    'Content-Type': mime,
                    'Access-Control-Allow-Origin': '*',
                });
                fs.createReadStream(filePath).pipe(res);
                return;
            }
        }
        res.writeHead(404);
        res.end('Not found: ' + urlPath);
    });
}

function findModelFile(name, variants) {
    if (variants['glTF-Binary']) {
        const p = path.join(SAMPLE_ASSETS, name, 'glTF-Binary', variants['glTF-Binary']);
        if (fs.existsSync(p)) return { path: p, relative: `/models/${name}/glTF-Binary/${variants['glTF-Binary']}` };
    }
    if (variants['glTF']) {
        const p = path.join(SAMPLE_ASSETS, name, 'glTF', variants['glTF']);
        if (fs.existsSync(p)) return { path: p, relative: `/models/${name}/glTF/${variants['glTF']}` };
    }
    return null;
}

function parseArgs() {
    const args = {
        width: 512, height: 512, filter: null, output: DEFAULT_OUTPUT,
        yaw: CAMERA_YAW, pitch: CAMERA_PITCH, env: DEFAULT_ENV,
    };
    for (let i = 2; i < process.argv.length; i++) {
        if (process.argv[i] === '--width') args.width = parseInt(process.argv[++i]);
        if (process.argv[i] === '--height') args.height = parseInt(process.argv[++i]);
        if (process.argv[i] === '--filter') args.filter = process.argv[++i];
        if (process.argv[i] === '--output') args.output = process.argv[++i];
        if (process.argv[i] === '--yaw') args.yaw = parseFloat(process.argv[++i]);
        if (process.argv[i] === '--pitch') args.pitch = parseFloat(process.argv[++i]);
        if (process.argv[i] === '--env') args.env = process.argv[++i];
    }
    return args;
}

async function renderModel(page, modelUrl, envUrl, outputPath, args) {
    const renderUrl = new URL('http://localhost:18080/render.html');
    renderUrl.searchParams.set('model', modelUrl);
    if (envUrl) renderUrl.searchParams.set('env', envUrl);
    renderUrl.searchParams.set('width', args.width);
    renderUrl.searchParams.set('height', args.height);
    renderUrl.searchParams.set('yaw', args.yaw);
    renderUrl.searchParams.set('pitch', args.pitch);

    try {
        await page.goto(renderUrl.toString(), { waitUntil: 'networkidle0', timeout: 30000 });
    } catch (e) {
        await page.goto(renderUrl.toString(), { waitUntil: 'load', timeout: 15000 });
    }

    await page.waitForSelector('canvas#canvas', { timeout: 10000 });

    const maxWait = 15000;
    const pollInterval = 200;
    let waited = 0;
    while (waited < maxWait) {
        const ready = await page.evaluate(() => window.__RENDER_READY);
        if (ready) break;
        await new Promise(r => setTimeout(r, pollInterval));
        waited += pollInterval;
    }

    const error = await page.evaluate(() => window.__RENDER_ERROR);
    if (error) {
        console.log(`    [render error: ${error}]`);
        return false;
    }

    await page.screenshot({
        path: outputPath,
        type: 'png',
        omitBackground: true,
        clip: { x: 0, y: 0, width: args.width, height: args.height },
    });
    return true;
}

async function main() {
    const args = parseArgs();

    if (!fs.existsSync(VIEWER_DIR)) {
        console.error(`Viewer not built. Run: cd repos/glTF-Sample-Viewer && npm run build`);
        process.exit(1);
    }
    if (!fs.existsSync(MODEL_INDEX)) {
        console.error(`Model index not found: ${MODEL_INDEX}`);
        process.exit(1);
    }

    fs.mkdirSync(args.output, { recursive: true });

    const server = createStaticServer([VIEWER_DIR, RENDERER_DIR + '/dist']);
    server.listen(18080, '127.0.0.1');

    const staticModelServer = http.createServer((req, res) => {
        let urlPath = decodeURIComponent(req.url.split('?')[0]);
        const filePath = path.join(SAMPLE_ASSETS, urlPath.replace('/models/', ''));
        if (fs.existsSync(filePath) && fs.statSync(filePath).isFile()) {
            const ext = path.extname(filePath).toLowerCase();
            const mime = MIME_TYPES[ext] || 'application/octet-stream';
            res.writeHead(200, {
                'Content-Type': mime,
                'Access-Control-Allow-Origin': '*',
            });
            fs.createReadStream(filePath).pipe(res);
            return;
        }
        res.writeHead(404);
        res.end('Not found');
    });
    staticModelServer.listen(18081, '127.0.0.1');

    const envUrl = args.env ? `${ENV_BASE}${args.env}.hdr` : null;

    console.log('Launching browser...');
    const browser = await puppeteer.launch({
        headless: 'new',
        args: [
            '--no-sandbox',
            '--disable-setuid-sandbox',
            '--use-gl=angle',
            '--use-angle=metal',
            `--window-size=${args.width},${args.height}`,
        ],
    });

    const page = await browser.newPage();
    await page.setViewport({ width: args.width, height: args.height });

    const models = JSON.parse(fs.readFileSync(MODEL_INDEX, 'utf-8'));
    const results = [];
    let passed = 0, failed = 0, skipped = 0;

    console.log(`Rendering ${models.length} models at ${args.width}x${args.height}`);
    console.log(`Camera: yaw=${args.yaw}° pitch=${args.pitch}° | Env: ${args.env || 'none'}\n`);

    for (const model of models) {
        const name = model.name;
        if (args.filter && !name.match(new RegExp(args.filter.replace('*', '.*')))) continue;

        const variants = model.variants || {};
        const file = findModelFile(name, variants);
        if (!file) {
            console.log(`  SKIP  ${name} (no importable file)`);
            skipped++;
            results.push({ name, status: 'skip' });
            continue;
        }

        const outPath = path.join(args.output, `${name}.png`);
        const modelUrl = `http://localhost:18081/models${file.relative.replace('/models', '')}`;

        try {
            const ok = await renderModel(page, modelUrl, envUrl, outPath, args);
            if (ok && fs.existsSync(outPath)) {
                const sizeKB = (fs.statSync(outPath).size / 1024).toFixed(1);
                console.log(`  OK    ${name} (${sizeKB} KB)`);
                passed++;
                results.push({ name, status: 'pass', size: fs.statSync(outPath).size });
            } else {
                console.log(`  FAIL  ${name}`);
                failed++;
                results.push({ name, status: 'fail', error: 'render failed' });
            }
        } catch (e) {
            console.log(`  FAIL  ${name}: ${e.message.substring(0, 80)}`);
            failed++;
            results.push({ name, status: 'fail', error: e.message.substring(0, 200) });
        }
    }

    console.log(`\n${'='.repeat(60)}`);
    console.log(`Results: ${passed} passed, ${failed} failed, ${skipped} skipped`);

    fs.writeFileSync(
        path.join(args.output, 'render-results.json'),
        JSON.stringify(results, null, 2)
    );

    await browser.close();
    server.close();
    staticModelServer.close();
    console.log(`Output: ${args.output}`);
}

main().catch(e => { console.error(e); process.exit(1); });
