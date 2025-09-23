const { spawn } = require('child_process');

if (process.type !== 'browser') {
  try {
    const env = { ...process.env };
    delete env.ELECTRON_RUN_AS_NODE;
    const args = process.argv.slice(1);
    const child = spawn(process.execPath, args, {
      env,
      stdio: 'inherit',
    });
    child.on('exit', (code) => process.exit(code ?? 0));
    child.on('error', (err) => {
      console.error('[bootstrap] Failed to relaunch Electron:', err?.message || err);
      process.exit(1);
    });
  } catch (err) {
    console.error('[bootstrap] Failed to relaunch Electron:', err?.message || err);
    process.exit(1);
  }
} else {
  require('./main.js');
}
