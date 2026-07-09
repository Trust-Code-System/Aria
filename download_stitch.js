const fs = require('fs');
const https = require('https');
const path = require('path');

const screens = [
  "07630681cfd54252afc86db6bc841a0d",
  "1e5db04990a04d7da09c0f01075799e3",
  "22d48c3e938b4a23a701b7e879866d86",
  "418f0ebda622425e9b0d0aed6ff07f89",
  "42ebe42baf864147999ab6d6673ced1c",
  "6285062025b34af4b0bd275fe6aed5ce",
  "6c0f6e7f22b44a91a22bb28cb5dfe6ee",
  "77f385716a26415e8419b294ba8e8c96",
  "a3b5cce726e54ae0936d5f929c26a976",
  "asset-stub-assets_8b3e53bd675b4df7bf3ef8a69a83f6a2",
  "b709bb430e564351b1c52f95f28b3519",
  "bb1d512649274b4d94d2d1a16ef6bd2e",
  "c44d7b041a4e400ebad97bd40ad0ce3e",
  "c923d30b198c4a00bbced9cb9b011e0f",
  "dc89105481504f71ac806943d1902178",
  "e78a8a1ab262408480f4a8ded0e1aa3a"
];

const projectId = "7421825266936433620";
const apiKey = process.env.STITCH_API_KEY;
const outDir = path.join(__dirname, 'stitch-screens');

if (!apiKey) {
  throw new Error("Set STITCH_API_KEY before running this script.");
}

if (!fs.existsSync(outDir)) {
  fs.mkdirSync(outDir);
}

function fetchMCP(screenId) {
  return new Promise((resolve, reject) => {
    const data = JSON.stringify({
      jsonrpc: "2.0",
      id: 1,
      method: "tools/call",
      params: {
        name: "get_screen",
        arguments: {
          name: `projects/${projectId}/screens/${screenId}`,
          projectId,
          screenId
        }
      }
    });

    const req = https.request('https://stitch.googleapis.com/mcp', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Goog-Api-Key': apiKey,
        'Content-Length': data.length
      }
    }, (res) => {
      let body = '';
      res.on('data', chunk => body += chunk);
      res.on('end', () => {
        try {
          const parsed = JSON.parse(body);
          if (parsed.error) return reject(parsed.error);
          
          // The MCP tool returns JSON string in the result.content text
          const contentText = parsed.result?.content?.[0]?.text;
          if (contentText) {
             const screenData = JSON.parse(contentText);
             resolve(screenData);
          } else {
             reject(new Error("No content text returned"));
          }
        } catch (e) {
          reject(e);
        }
      });
    });

    req.on('error', reject);
    req.write(data);
    req.end();
  });
}

function downloadUrl(url, dest) {
  return new Promise((resolve, reject) => {
    https.get(url, (res) => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        https.get(res.headers.location, (res2) => {
          const f = fs.createWriteStream(dest);
          res2.pipe(f);
          f.on('finish', () => { f.close(); resolve(); });
        }).on('error', reject);
      } else {
        const f = fs.createWriteStream(dest);
        res.pipe(f);
        f.on('finish', () => { f.close(); resolve(); });
      }
    }).on('error', reject);
  });
}

async function main() {
  for (let i = 0; i < screens.length; i++) {
    const screenId = screens[i];
    console.log(`Fetching ${screenId}...`);
    try {
      const data = await fetchMCP(screenId);
      const title = data.title || screenId;
      const htmlUrl = data.htmlCode?.downloadUrl;
      if (!htmlUrl) {
         console.log(`No HTML URL for ${title}`);
         continue;
      }
      
      const dest = path.join(outDir, title.replace(/[^a-zA-Z0-9]/g, '_') + '.html');
      
      if (htmlUrl.startsWith('data:text/html;base64,')) {
        const b64 = htmlUrl.split(',')[1];
        fs.writeFileSync(dest, Buffer.from(b64, 'base64'));
        console.log(`Saved ${title} from base64`);
      } else {
        await downloadUrl(htmlUrl, dest);
        console.log(`Saved ${title} from URL`);
      }
    } catch (e) {
      console.error(`Failed ${screenId}:`, e.message || e);
    }
  }
}

main().then(() => console.log('All done!')).catch(console.error);
