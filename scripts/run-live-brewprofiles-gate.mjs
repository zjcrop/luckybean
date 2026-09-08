import { spawn } from 'node:child_process';

const tests = [
  'tests/v123-live-brewprofiles.mjs',
  'tests/v126-live-matching-temperature.mjs',
  'tests/v124p-live-clever-production.mjs'
];
const MAX_ATTEMPTS = 3;
const TRANSIENT = /SUPABASE_EDGE_RUNTIME_SERVICE_DEGRADED|Service is temporarily unavailable/i;

function run(file) {
  return new Promise(resolve => {
    const child = spawn(process.execPath, [file], {
      cwd: process.cwd(),
      env: process.env,
      stdio: ['ignore', 'pipe', 'pipe']
    });
    let output = '';
    const forward = (stream, target) => stream.on('data', chunk => {
      const text = chunk.toString();
      output += text;
      target.write(text);
    });
    forward(child.stdout, process.stdout);
    forward(child.stderr, process.stderr);
    child.on('error', error => resolve({ code: 1, output: `${output}\n${error.stack || error}` }));
    child.on('close', code => resolve({ code: code ?? 1, output }));
  });
}

for (const file of tests) {
  let passed = false;
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt += 1) {
    if (attempt > 1) console.log(`[live-brewprofiles] retry ${attempt}/${MAX_ATTEMPTS}: ${file}`);
    const result = await run(file);
    if (result.code === 0) {
      passed = true;
      break;
    }
    const retryable = TRANSIENT.test(result.output);
    if (!retryable || attempt === MAX_ATTEMPTS) {
      console.error(`[live-brewprofiles] ${file} failed; retryable=${retryable}; attempt=${attempt}`);
      process.exit(result.code || 1);
    }
    await new Promise(resolve => setTimeout(resolve, 500 * attempt));
  }
  if (!passed) process.exit(1);
}
