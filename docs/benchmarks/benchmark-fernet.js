const crypto = require('crypto');

class FernetBenchmark {
  constructor() {
    this.key = crypto.randomBytes(32);
    this.iterations = 1000;
    this.latencies = [];
  }

  generatePayload() {
    const payload = {
      id: crypto.randomUUID(),
      email: `user${Math.random().toString().slice(2, 8)}@example.com`,
      phone: `+${Math.random().toString().slice(2, 12)}`,
      ssn: Math.random().toString().slice(2, 11),
      creditCard: `${Math.random().toString().slice(2, 6)}-${Math.random().toString().slice(2, 6)}-${Math.random().toString().slice(2, 6)}-${Math.random().toString().slice(2, 6)}`,
      dob: `${Math.floor(Math.random() * 31) + 1}/${Math.floor(Math.random() * 12) + 1}/${Math.floor(Math.random() * 50) + 1970}`,
      address: `${Math.floor(Math.random() * 9999)} Main St, Apt ${Math.floor(Math.random() * 999)}, City, ST 12345`,
      passport: `${String.fromCharCode(65 + Math.floor(Math.random() * 26))}${Math.random().toString().slice(2, 10)}`,
      timestamp: new Date().toISOString(),
      metadata: {
        source: 'api-gateway',
        region: 'us-west-2',
        sessionId: crypto.randomUUID(),
        ipAddress: `${Math.floor(Math.random() * 256)}.${Math.floor(Math.random() * 256)}.${Math.floor(Math.random() * 256)}.${Math.floor(Math.random() * 256)}`
      }
    };
    return JSON.stringify(payload);
  }

  encrypt(plaintext) {
    const iv = crypto.randomBytes(16);
    const cipher = crypto.createCipheriv('aes-128-cbc', this.key.slice(0, 16), iv);
    let encrypted = cipher.update(plaintext, 'utf8', 'hex');
    encrypted += cipher.final('hex');
    return iv.toString('hex') + ':' + encrypted;
  }

  decrypt(ciphertext) {
    const [ivHex, encrypted] = ciphertext.split(':');
    const iv = Buffer.from(ivHex, 'hex');
    const decipher = crypto.createDecipheriv('aes-128-cbc', this.key.slice(0, 16), iv);
    let decrypted = decipher.update(encrypted, 'hex', 'utf8');
    decrypted += decipher.final('utf8');
    return decrypted;
  }

  run() {
    const payload = this.generatePayload();
    const payloadSize = Buffer.byteLength(payload, 'utf8');

    console.log(`Iniciando benchmark Fernet (AES-128-CBC)...\n`);
    console.log(`Tamaño del payload: ${(payloadSize / 1024).toFixed(2)}KB`);
    console.log(`Iteraciones: ${this.iterations}\n`);

    for (let i = 0; i < this.iterations; i++) {
      const start = process.hrtime.bigint();

      const encrypted = this.encrypt(payload);
      const decrypted = this.decrypt(encrypted);

      const end = process.hrtime.bigint();
      const latencyMs = Number(end - start) / 1_000_000;

      this.latencies.push(latencyMs);

      if (decrypted !== payload) {
        throw new Error(`Verificación fallida en iteración ${i}`);
      }
    }

    this.printResults();
  }

  printResults() {
    const sorted = [...this.latencies].sort((a, b) => a - b);
    const sum = this.latencies.reduce((a, b) => a + b, 0);
    const avg = sum / this.latencies.length;
    const max = Math.max(...this.latencies);
    const min = Math.min(...this.latencies);
    const p95Index = Math.ceil(this.latencies.length * 0.95) - 1;
    const p95 = sorted[p95Index];

    console.log('┌─────────────────────────────────────────────────────┐');
    console.log('│          BENCHMARK FERNET - AES-128-CBC             │');
    console.log('├─────────────────────────────────────────────────────┤');
    console.log(`│ Métrica              │ Valor                          │`);
    console.log('├─────────────────────────────────────────────────────┤');
    console.log(`│ Promedio (μ)         │ ${avg.toFixed(4).padEnd(30)}│`);
    console.log(`│ Percentil 95 (P95)   │ ${p95.toFixed(4).padEnd(30)}│`);
    console.log(`│ Máximo (Peak)        │ ${max.toFixed(4).padEnd(30)}│`);
    console.log(`│ Mínimo                │ ${min.toFixed(4).padEnd(30)}│`);
    console.log('├─────────────────────────────────────────────────────┤');

    const status = p95 < 5 ? '✓ VÁLIDO' : '✗ FUERA LÍMITE';
    console.log(`│ Estado (P95 < 5ms)   │ ${status.padEnd(30)}│`);

    console.log('└─────────────────────────────────────────────────────┘');
  }
}

const benchmark = new FernetBenchmark();
benchmark.run();
