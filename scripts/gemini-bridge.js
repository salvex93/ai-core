const fs = require('fs');
const path = require('path');
const https = require('https');

// --- CARGA RECURSIVA DE ENV ---
(function loadEnv() {
  let currentPath = __dirname;
  while (currentPath !== path.parse(currentPath).root) {
    const envPath = path.join(currentPath, '.env');
    if (fs.existsSync(envPath)) {
      const content = fs.readFileSync(envPath, 'utf8');
      content.split('\n').forEach(line => {
        const match = line.match(/^\s*([\w.-]+)\s*=\s*(.*)?\s*$/);
        if (match) {
          let value = (match[2] || '').trim().replace(/^['"]|['"]$/g, '');
          process.env[match[1]] = value;
        }
      });
      return;
    }
    currentPath = path.dirname(currentPath);
  }
})();

const API_KEY = process.env.GEMINI_API_KEY;
// URL: v1 (producción)
// MODELO: gemini-2.0-flash (disponible y estable)
const MODEL = 'gemini-2.0-flash';
const API_URL = `https://generativelanguage.googleapis.com/v1/models/${MODEL}:generateContent?key=${API_KEY}`;

if (!API_KEY) {
  console.error('[Error] GEMINI_API_KEY no encontrada en el árbol de directorios.');
  process.exit(1);
}

// Lógica de envío (simplificada para que no falle)
const mission = process.argv.slice(2).join(' ');
const data = JSON.stringify({
  contents: [{ parts: [{ text: mission }] }]
});

const req = https.request(API_URL, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' }
}, (res) => {
  let responseBody = '';
  res.on('data', (chunk) => responseBody += chunk);
  res.on('end', () => {
    if (res.statusCode !== 200) {
      console.error(`[Error ${res.statusCode}]`, responseBody);
      process.exit(1);
    }
    console.log(responseBody);
  });
});

req.on('error', (e) => console.error(e));
req.write(data);
req.end();
