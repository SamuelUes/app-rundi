const { spawn, spawnSync } = require('node:child_process');
const { execFileSync } = require('node:child_process');
const { existsSync, mkdirSync, readFileSync, unlinkSync, writeFileSync } = require('node:fs');
const path = require('node:path');
const readline = require('node:readline');
const { promisify } = require('node:util');

const execFile = promisify(require('node:child_process').execFile);
const repoRoot = path.resolve(__dirname, '../..');
const frontendRoot = path.resolve(__dirname, '..');
const supabaseBin = path.join(frontendRoot, 'node_modules', '.bin', 'supabase');
const firebaseStatePath = path.join(frontendRoot, '.expo', 'rundi-firebase-emulator.json');
const dockerNetworkName = 'rundi-local-loopback';
const supabaseProjectId = 'rundi';
const functionsBin = path.join(repoRoot, 'functions', 'node_modules', '.bin', 'tsc');
const projectId = 'rundi-dev';
const region = 'us-central1';
const emulatorHost = '127.0.0.1';
const realtimeDatabaseUrl = `http://${emulatorHost}:9002?ns=${projectId}`;
const activeChildren = new Set();

function parseSupabaseStatusEnv(text) {
  const values = {};
  for (const line of text.split(/\r?\n/)) {
    const match = line.trim().match(/^(?:export\s+)?([A-Z_]+)=(.*)$/);
    if (!match) continue;
    const [, name, rawValue] = match;
    let value = rawValue.trim();
    if (value.startsWith('"') && value.endsWith('"')) {
      try {
        value = JSON.parse(value);
      } catch {
        value = value.slice(1, -1);
      }
    } else if (value.startsWith("'") && value.endsWith("'")) {
      value = value.slice(1, -1);
    }
    values[name] = value;
  }

  const apiUrlValue = values.API_URL;
  const anonKey = values.ANON_KEY || values.PUBLISHABLE_KEY;
  const serviceRoleKey = values.SERVICE_ROLE_KEY || values.SECRET_KEY;
  const jwtSecret = values.JWT_SECRET;
  const missing = [
    ['API_URL', apiUrlValue],
    ['ANON_KEY/PUBLISHABLE_KEY', anonKey],
    ['SERVICE_ROLE_KEY/SECRET_KEY', serviceRoleKey],
    ['JWT_SECRET', jwtSecret],
  ].filter(([, value]) => !value).map(([name]) => name);
  if (missing.length) {
    throw new Error(`Supabase CLI status omitted required local values: ${missing.join(', ')}`);
  }

  let apiUrl;
  try {
    apiUrl = new URL(apiUrlValue);
  } catch {
    throw new Error('Supabase CLI returned an invalid local API URL');
  }
  if (!['localhost', '127.0.0.1'].includes(apiUrl.hostname)) {
    throw new Error('Supabase CLI returned a non-local API URL; refusing to start in local mode');
  }

  return {
    apiUrl: apiUrlValue,
    anonKey,
    serviceRoleKey,
    jwtSecret,
  };
}

function buildChildEnvironments(baseEnv, supabaseEnv) {
  const functionsUrl = `http://${emulatorHost}:5001/${projectId}/${region}`;
  const expo = {
    ...baseEnv,
    NODE_ENV: 'development',
    BACKEND_MODE: 'firebase',
    USE_FIREBASE_EMULATORS: 'true',
    FIREBASE_PROJECT_ID: projectId,
    FIREBASE_EMULATOR_HOST: emulatorHost,
    FIREBASE_DATABASE_URL: realtimeDatabaseUrl,
    API_BASE_URL: functionsUrl,
    API_BASE_URL_FIREBASE: functionsUrl,
    API_BASE_URL_PRODUCTION: functionsUrl,
    API_BASE_URL_LOCAL: functionsUrl,
    PLATFORM_API_BASE_URL: functionsUrl,
    CALLS_REQUEST_BASE_URL: functionsUrl,
    WS_URL: realtimeDatabaseUrl,
    WS_URL_FIREBASE: realtimeDatabaseUrl,
    WS_URL_PRODUCTION: realtimeDatabaseUrl,
    WS_URL_LOCAL: realtimeDatabaseUrl,
    SUPABASE_URL: supabaseEnv.apiUrl,
    SUPABASE_ANON_KEY: supabaseEnv.anonKey,
    EXPO_PUBLIC_SUPABASE_URL: supabaseEnv.apiUrl,
    EXPO_PUBLIC_SUPABASE_KEY: supabaseEnv.anonKey,
    EXPO_PUBLIC_SUPABASE_ANON_KEY: supabaseEnv.anonKey,
  };
  delete expo.SUPABASE_SERVICE_ROLE_KEY;
  delete expo.SUPABASE_JWT_SECRET;
  delete expo.SERVICE_ROLE_KEY;
  delete expo.JWT_SECRET;

  const functions = {
    ...baseEnv,
    NODE_ENV: 'development',
    GCLOUD_PROJECT: projectId,
    USE_FIREBASE_EMULATORS: 'true',
    SUPABASE_URL: supabaseEnv.apiUrl,
    SUPABASE_ANON_KEY: supabaseEnv.anonKey,
    SUPABASE_SERVICE_ROLE_KEY: supabaseEnv.serviceRoleKey,
    SUPABASE_JWT_SECRET: supabaseEnv.jwtSecret,
  };

  return { expo, functions };
}

function shouldStopSupabase(wasAlreadyRunning) {
  return !wasAlreadyRunning;
}

function getJavaMajorVersion(output) {
  const match = output.match(/version\s+"(?:1\.)?(\d+)|openjdk\s+(\d+)/i);
  return Number(match?.[1] || match?.[2] || 0);
}

function redactSupabaseOutput(line) {
  return line
    .replace(
      /(\b(?:JWT secret|anon key|service[_ -]?role key|publishable|secret key|secret|access key|DB URL)\b\s*(?:│|:)\s*)\S+/i,
      '$1[redacted]',
    )
    .replace(/sb_(?:publishable|secret)_[A-Za-z0-9_-]+/g, '[redacted]');
}

function requireCommand(command, args, message) {
  try {
    return execFileSync(command, args, { cwd: repoRoot, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
  } catch {
    throw new Error(message);
  }
}

function isIncomingBlocked(output) {
  return /incoming connection .* is blocked/i.test(output || '');
}

function isDockerInboundBlockedByMacFirewall() {
  if (process.platform !== 'darwin') return false;
  const command = '/usr/libexec/ApplicationFirewall/socketfilterfw';
  const globalState = spawnSync(command, ['--getglobalstate'], { encoding: 'utf8' });
  if (globalState.status !== 0 || !/firewall is enabled/i.test(globalState.stdout || '')) return false;

  return [
    '/Applications/Docker.app',
    '/Applications/Docker.app/Contents/MacOS/com.docker.backend',
  ].some((appPath) => {
    const appState = spawnSync(command, ['--getappblocked', appPath], { encoding: 'utf8' });
    return appState.status === 0 && isIncomingBlocked(appState.stdout);
  });
}

function preflight() {
  if (!existsSync(supabaseBin)) {
    throw new Error('Falta Supabase CLI local. Instálala con `npm install --prefix Frontend`.');
  }
  if (!existsSync(path.join(frontendRoot, 'node_modules', '.bin', 'expo'))) {
    throw new Error('Faltan dependencias de Frontend. Ejecuta `npm install` dentro de Frontend.');
  }
  if (!existsSync(functionsBin)) {
    throw new Error('Faltan dependencias de Functions. Ejecuta `npm install` dentro de functions.');
  }

  requireCommand('docker', ['info', '--format', '{{.ServerVersion}}'], 'Docker no está iniciado. Inicia Docker Desktop y vuelve a ejecutar el comando.');
  const dockerOS = requireCommand('docker', ['info', '--format', '{{.OperatingSystem}}'], 'No se pudo identificar el runtime Docker.');
  requireCommand('firebase', ['--version'], 'Falta Firebase CLI. Instálala con `npm install --global firebase-tools`.');
  return dockerOS;
}

function requireJava21() {
  const java = spawnSync('java', ['-version'], { encoding: 'utf8' });
  if (java.error || java.status !== 0) {
    throw new Error('No se encontró Java. Firebase Emulator Suite requiere Java 21 o superior.');
  }
  const javaVersion = getJavaMajorVersion(`${java.stdout || ''}\n${java.stderr || ''}`);
  if (javaVersion < 21) {
    throw new Error(`Java ${javaVersion || 'desconocido'} activo; Firebase Emulator Suite requiere Java 21 o superior. Actualiza JAVA_HOME para esta terminal y vuelve a ejecutar.`);
  }
}

function isMissingSupabaseContainer(error) {
  const output = `${error.stdout || ''}\n${error.stderr || ''}\n${error.message || ''}`;
  return /No such container: supabase_db_rundi|container .* not found/i.test(output);
}

async function isSupabaseRunning() {
  try {
    await execFile(supabaseBin, ['status', '--output', 'json'], { cwd: repoRoot });
    return true;
  } catch (error) {
    if (isMissingSupabaseContainer(error)) return false;
    throw new Error('No se pudo determinar el estado de Supabase local; no iniciaré ni detendré servicios automáticamente.');
  }
}

function isLoopbackBinding(output) {
  const lines = output.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  return lines.every((line) => /^(?:127\.0\.0\.1|\[?::1\]?):\d+$/.test(line));
}

function ensureLoopbackDockerNetwork() {
  const inspect = () => spawnSync(
    'docker',
    ['network', 'inspect', '--format', '{{index .Options "com.docker.network.bridge.host_binding_ipv4"}}', dockerNetworkName],
    { cwd: repoRoot, encoding: 'utf8' },
  );
  let result = inspect();
  if (result.status !== 0) {
    const output = `${result.stderr || ''} ${result.stdout || ''}`;
    if (!/not found|no such network/i.test(output)) {
      throw new Error('No se pudo validar la red Docker local para Supabase.');
    }
    try {
      execFileSync('docker', [
        'network', 'create',
        '--driver', 'bridge',
        '--opt', 'com.docker.network.bridge.host_binding_ipv4=127.0.0.1',
        dockerNetworkName,
      ], { cwd: repoRoot, stdio: ['ignore', 'ignore', 'pipe'] });
    } catch {
      throw new Error('No se pudo crear la red Docker local limitada a loopback.');
    }
    result = inspect();
  }
  if (result.status !== 0 || result.stdout.trim() !== '127.0.0.1') {
    throw new Error('La red Docker local no limita los puertos publicados a 127.0.0.1.');
  }
}

function getUnsafeSupabasePortBindings() {
  let containers;
  try {
    containers = execFileSync('docker', ['ps', '--format', '{{.Names}}'], { cwd: repoRoot, encoding: 'utf8' });
  } catch {
    throw new Error('No se pudieron verificar los puertos publicados por Docker.');
  }
  return containers.split(/\r?\n/).map((name) => name.trim())
    .filter((name) => name.startsWith('supabase_') && name.endsWith(`_${supabaseProjectId}`))
    .flatMap((name) => {
      let bindings;
      try {
        bindings = execFileSync('docker', ['port', name], { cwd: repoRoot, encoding: 'utf8' });
      } catch {
        return [`${name}: no fue posible inspeccionar los puertos`];
      }
      return isLoopbackBinding(bindings) ? [] : [`${name}: ${bindings.trim().replace(/\r?\n/g, ', ')}`];
    });
}

function assertSupabaseLoopbackBindings() {
  const unsafe = getUnsafeSupabasePortBindings();
  if (!unsafe.length) return;
  if (isDockerInboundBlockedByMacFirewall()) {
    process.stdout.write('Docker Desktop publica puertos en todas las interfaces; las conexiones entrantes del backend están bloqueadas por el firewall de macOS.\n');
    return;
  }
  throw new Error(
    `Supabase está publicando puertos fuera de loopback (${unsafe.join('; ')}). ` +
    'La red bridge no aisló los puertos; se detendrán los contenedores. Bloquea conexiones entrantes de Docker Desktop o usa un runtime que respete host_binding_ipv4.',
  );
}

async function capture(command, args, cwd = repoRoot) {
  try {
    const { stdout } = await execFile(command, args, { cwd, encoding: 'utf8', maxBuffer: 10 * 1024 * 1024 });
    return stdout;
  } catch {
    throw new Error(`${path.basename(command)} ${args[0] || ''} falló`);
  }
}

function runLogged(command, args, cwd, env = process.env) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { cwd, env, stdio: ['inherit', 'pipe', 'pipe'] });
    activeChildren.add(child);
    const stream = (source) => {
      const lines = readline.createInterface({ input: source });
      lines.on('line', (line) => process.stdout.write(`${redactSupabaseOutput(line)}\n`));
    };
    stream(child.stdout);
    stream(child.stderr);
    child.once('error', (error) => {
      activeChildren.delete(child);
      reject(error);
    });
    child.once('close', (code, signal) => {
      activeChildren.delete(child);
      if (code === 0) resolve();
      else reject(new Error(`${path.basename(command)} terminó con ${signal || `código ${code}`}`));
    });
  });
}

function startChild(command, args, cwd, env, detached = false) {
  const child = spawn(command, args, { cwd, env, detached, stdio: 'inherit' });
  child.detachedProcessGroup = detached;
  activeChildren.add(child);
  child.once('error', () => {
    child.spawnError = true;
    activeChildren.delete(child);
  });
  child.once('close', () => {
    activeChildren.delete(child);
    if (detached) clearFirebaseState(child.pid);
  });
  return child;
}

function waitForChild(child, name) {
  if (child.spawnError) return Promise.resolve({ name, code: 1 });
  if (child.exitCode !== null) return Promise.resolve({ name, code: child.exitCode === 0 ? 0 : 1 });
  if (child.signalCode !== null) return Promise.resolve({ name, code: 1, signal: child.signalCode });
  return new Promise((resolve) => {
    child.once('close', (code, signal) => resolve({ name, code: code === 0 ? 0 : 1, signal }));
    child.once('error', () => resolve({ name, code: 1 }));
  });
}

function signalChild(child, signal) {
  if (child.detachedProcessGroup && child.pid !== undefined) process.kill(-child.pid, signal);
  else child.kill(signal);
}

function startFirebaseChild(env) {
  const child = startChild(
    'firebase',
    ['emulators:start', '--only', 'auth,firestore,database,functions', '--project', projectId],
    repoRoot,
    env,
    true,
  );
  if (child.pid !== undefined) {
    mkdirSync(path.dirname(firebaseStatePath), { recursive: true });
    writeFileSync(firebaseStatePath, JSON.stringify({ pid: child.pid, projectId }), { mode: 0o600 });
  }
  return child;
}

function readFirebaseState() {
  if (!existsSync(firebaseStatePath)) return null;
  try {
    return JSON.parse(readFileSync(firebaseStatePath, 'utf8'));
  } catch {
    throw new Error('El estado local de Firebase está dañado; no se enviará ninguna señal a procesos.');
  }
}

function clearFirebaseState(pid) {
  let state;
  try {
    state = readFirebaseState();
  } catch {
    return;
  }
  if (!state || state.pid !== pid) return;
  try {
    unlinkSync(firebaseStatePath);
  } catch {
    return;
  }
}

function firebaseProcessCommand(pid) {
  try {
    return execFileSync('ps', ['-p', String(pid), '-o', 'command='], { encoding: 'utf8' }).trim();
  } catch {
    return '';
  }
}

function isExpectedFirebaseProcess(state, command) {
  return Boolean(
    state && state.projectId === projectId && Number.isInteger(state.pid) &&
    command.includes('firebase') && command.includes('emulators:start') &&
    command.includes(`--project ${projectId}`),
  );
}

function processGroupExists(pid) {
  try {
    process.kill(-pid, 0);
    return true;
  } catch (error) {
    return error.code === 'EPERM';
  }
}

async function waitForProcessGroupExit(pid, attempts) {
  for (let index = 0; index < attempts; index += 1) {
    if (!processGroupExists(pid)) return true;
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  return !processGroupExists(pid);
}

async function stopFirebaseEmulator() {
  const state = readFirebaseState();
  if (!state) {
    process.stdout.write('No hay un Firebase Emulator administrado por start:local.\n');
    return;
  }
  if (state.projectId !== projectId || !Number.isSafeInteger(state.pid) || state.pid <= 1) {
    throw new Error('El estado local de Firebase no es válido; no se terminó ningún proceso.');
  }

  if (!processGroupExists(state.pid)) {
    clearFirebaseState(state.pid);
    process.stdout.write('El Firebase Emulator registrado ya estaba detenido.\n');
    return;
  }

  if (!isExpectedFirebaseProcess(state, firebaseProcessCommand(state.pid))) {
    throw new Error('El PID guardado no corresponde al Firebase Emulator de rundi-dev; no se terminó ningún proceso.');
  }

  process.kill(-state.pid, 'SIGTERM');
  if (!(await waitForProcessGroupExit(state.pid, 50))) {
    process.kill(-state.pid, 'SIGKILL');
    if (!(await waitForProcessGroupExit(state.pid, 10))) {
      throw new Error('Firebase Emulator no terminó tras SIGTERM/SIGKILL.');
    }
  }
  clearFirebaseState(state.pid);
  process.stdout.write('Firebase Emulator de rundi-dev detenido.\n');
}

async function stopSupabaseProject() {
  if (!(await isSupabaseRunning())) {
    process.stdout.write('Supabase local del proyecto rundi ya estaba detenido.\n');
    return;
  }
  await capture(supabaseBin, ['stop', '--project-id', supabaseProjectId]);
  process.stdout.write('Contenedores Supabase del proyecto rundi detenidos; los volúmenes se conservaron.\n');
}

async function stopChildren(children) {
  const running = children.filter(
    (child) => child && child.pid !== undefined && child.exitCode === null && child.signalCode === null,
  );
  for (const child of running) signalChild(child, 'SIGTERM');
  await Promise.all(running.map((child) => waitForChild(child, 'child')));
}

async function stopAllLocal() {
  const results = await Promise.allSettled([stopSupabaseProject(), stopFirebaseEmulator()]);
  const errors = results.filter((result) => result.status === 'rejected');
  if (errors.length) {
    throw new Error(errors.map((result) => result.reason.message).join('\n'));
  }
}

async function runStopCommand(command) {
  if (command === 'stop:docker') return stopSupabaseProject();
  if (command === 'stop:firebase') return stopFirebaseEmulator();
  if (command === 'stop:all') return stopAllLocal();
  throw new Error('Uso: npm run start:local | npm run stop:docker | npm run stop:firebase | npm run stop:all');
}

async function main() {
  let wasSupabaseRunning = true;
  let supabaseStartAttempted = false;
  let stopping = false;
  const children = [];
  const stopActiveChildren = () => {
    stopping = true;
    for (const child of activeChildren) {
      if (child.exitCode === null && child.signalCode === null) signalChild(child, 'SIGTERM');
    }
  };
  process.once('SIGINT', stopActiveChildren);
  process.once('SIGTERM', stopActiveChildren);

  try {
    const dockerOS = preflight();
    wasSupabaseRunning = await isSupabaseRunning();
    if (wasSupabaseRunning && getUnsafeSupabasePortBindings().length) {
      process.stdout.write('El stack Supabase existente publica puertos fuera de loopback; lo detendré preservando sus volúmenes antes de continuar.\n');
      await stopSupabaseProject();
      wasSupabaseRunning = false;
    }
    if (process.platform === 'darwin' && /Docker Desktop/i.test(dockerOS) && !isDockerInboundBlockedByMacFirewall()) {
      throw new Error('Docker Desktop aún permite conexiones entrantes y publica los puertos Supabase en 0.0.0.0. Bloquea el bundle registrado con `sudo /usr/libexec/ApplicationFirewall/socketfilterfw --blockapp /Applications/Docker.app` y verifica su estado, o usa un runtime que respete 127.0.0.1; no iniciaré el stack expuesto a la LAN.');
    }
    requireJava21();
    if (!wasSupabaseRunning) {
      ensureLoopbackDockerNetwork();
      supabaseStartAttempted = true;
      await runLogged(supabaseBin, ['start', '--network-id', dockerNetworkName], repoRoot);
    }
    assertSupabaseLoopbackBindings();

    const supabaseEnv = parseSupabaseStatusEnv(
      await capture(supabaseBin, ['status', '--output', 'env']),
    );
    await runLogged(supabaseBin, ['migration', 'up'], repoRoot);
    await runLogged('npm', ['--prefix', 'functions', 'run', 'build'], repoRoot);

    const childEnvironments = buildChildEnvironments(process.env, supabaseEnv);
    children.push(startFirebaseChild(childEnvironments.functions));
    children.push(startChild('npm', ['run', 'start'], frontendRoot, childEnvironments.expo));

    const result = await Promise.race(children.map((child, index) => waitForChild(child, index === 0 ? 'Firebase Emulator' : 'Expo')));
    if (result.code !== 0 && !stopping) {
      process.stderr.write(`${result.name} terminó antes de tiempo${result.signal ? ` (${result.signal})` : ''}.\n`);
    }
    return result.code;
  } finally {
    process.removeListener('SIGINT', stopActiveChildren);
    process.removeListener('SIGTERM', stopActiveChildren);
    await stopChildren(children);
    if (shouldStopSupabase(wasSupabaseRunning) && supabaseStartAttempted) {
      try {
        await capture(supabaseBin, ['stop']);
      } catch (error) {
        process.stderr.write(`No se pudo detener el Supabase iniciado por este comando: ${error.message}\n`);
      }
    }
  }
}

if (require.main === module) {
  const command = process.argv[2];
  const task = command ? runStopCommand(command) : main();
  task.then((code) => {
    process.exitCode = code || 0;
  }).catch((error) => {
    process.stderr.write(`${error.message}\n`);
    process.exitCode = 1;
  });
}

module.exports = {
  buildChildEnvironments,
  getJavaMajorVersion,
  isIncomingBlocked,
  isExpectedFirebaseProcess,
  isLoopbackBinding,
  parseSupabaseStatusEnv,
  redactSupabaseOutput,
  shouldStopSupabase,
};
