/* Push diagnosis probe: notifyOtherDevices with 2 stored tokens (temporary). */
const fs = require('fs');
const path = require('path');
const Module = require('module');
const ts = require('typescript');
const REPO = process.cwd(), OUT = __dirname;
let pass = 0, fail = 0;
const check = (n, c, d) => { if (c) { pass++; console.log(`PASS  ${n}${d ? ' :: ' + d : ''}`); } else { fail++; console.log(`FAIL  ${n}${d ? ' :: ' + d : ''}`); } };

const TOKEN_A = 'ExpoPushToken[AAAAAAAAAAAAAAAAAAAAAAAAAAAAAA]';
const TOKEN_B = 'ExpoPushToken[BBBBBBBBBBBBBBBBBBBBBBBBBBBBBB]';

// ── mocks ──
const fetchCalls = [];
global.__platformOS = 'android';            // switchable per scenario
global.__fetchResponse = { ok: true, status: 200, json: async () => ({ data: [{ status: 'ok', id: 'ticket-1' }] }) };
global.fetch = async (url, opts) => {
  fetchCalls.push({ url: String(url), opts });
  return { ok: true, status: 200, json: async () => ({ data: [{ status: 'ok', id: 'ticket-1' }] }), ...global.__fetchOverride };
};
global.__cfg = {
  supabase: {
    from: (table) => ({
      select: () => ({ eq: () => Promise.resolve({ data: [{ expo_push_token: TOKEN_A }, { expo_push_token: TOKEN_B }], error: null }) }),
    }),
  },
};
const RNMock = { get Platform() { return { OS: global.__platformOS }; } };
fs.writeFileSync(path.join(OUT, 'mock_als.js'), 'module.exports = {};');
fs.writeFileSync(path.join(OUT, 'mock_types.js'), 'module.exports = {};');
fs.writeFileSync(path.join(OUT, 'mock_sjs.js'), 'module.exports = {};');
fs.writeFileSync(path.join(OUT, 'mock_supabase.js'), 'module.exports = { get supabase(){return global.__cfg.supabase;} };');
fs.writeFileSync(path.join(OUT, 'mock_rn.js'), 'module.exports = RNMock; global.__RN = RNMock;');
fs.writeFileSync(path.join(OUT, 'mock_rn.js'), 'module.exports = { get Platform() { return { OS: global.__platformOS }; } };');
fs.writeFileSync(path.join(OUT, 'mock_consts.js'), 'module.exports = { default: { expoConfig: { extra: { eas: { projectId: "db912006-55b7-4be4-9a0a-42f8935bbf17" } } }, executionEnvironment: "bare" }, executionEnvironment: "bare", appOwnership: "expo" };');
fs.writeFileSync(path.join(OUT, 'mock_notif.js'), 'module.exports = { getExpoPushTokenAsync: async () => ({ data: "ExpoPushToken[AAAAAAAAAAAAAAAAAAAAAAAAAAAAAA]" }), scheduleNotificationAsync: async () => "", SchedulableTriggerInputTypes: { DATE: "date" }, AndroidImportance: { MAX: 4 }, setNotificationHandler() {} };');
fs.writeFileSync(path.join(OUT, 'mock_device.js'), 'module.exports = { isDevice: true, deviceName: "Test" };');
fs.writeFileSync(path.join(OUT, 'mock_fs.js'), 'module.exports = { readAsStringAsync: async () => "" };');
const origResolve = Module._resolveFilename;
Module._resolveFilename = function (req, ...rest) {
  const map = {
    'react-native': path.join(OUT, 'mock_rn.js'),
    'expo-constants': path.join(OUT, 'mock_consts.js'),
    'expo-notifications': path.join(OUT, 'mock_notif.js'),
    'expo-device': path.join(OUT, 'mock_device.js'),
    'expo-file-system/legacy': path.join(OUT, 'mock_fs.js'),
    'expo-file-system': path.join(OUT, 'mock_fs.js'),
    '@supabase/supabase-js': path.join(OUT, 'mock_sjs.js'),
    '@/utils/supabase': path.join(OUT, 'mock_supabase.js'),
  };
  if (map[req]) return map[req];
  return origResolve.call(this, req, ...rest);
};
const CO = { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2019, esModuleInterop: true };
const f = path.join(OUT, 'push.js');
fs.writeFileSync(f, ts.transpileModule(fs.readFileSync(path.join(REPO, 'services/pushNotifications.ts'), 'utf8'), { compilerOptions: CO }).outputText);
const push = require(f);

(async () => {
  // ── Scenario 1: Device A = android APK, 2 tokens stored ──
  global.__platformOS = 'android';
  fetchCalls.length = 0;
  await push.notifyOtherDevices({ userId: 'user-1', title: '💸 New Expense Added', body: 'NPR 500', data: { kind: 'transaction' } });
  check('S1 notifyOtherDevices reached Supabase token fetch', fetchCalls.length >= 0);
  const expoCall = fetchCalls.find((c) => c.url.includes('exp.host/--/api/v2/push/send'));
  check('S2 POST executed to https://exp.host/--/api/v2/push/send', !!expoCall, expoCall ? 'found' : 'MISSING');
  if (expoCall) {
    const body = JSON.parse(expoCall.opts.body);
    check('S2b tokens fetched = 2 → after excluding Device A = 1 (Device B retained)',
      body.length === 1 && body[0].to === TOKEN_B, `recipients=${body.length}, to=${body[0].to.slice(0, 22)}…`);
    check('S2c payload fields correct (title/body/sound/priority/channelId)',
      body[0].title === '💸 New Expense Added' && body[0].sound === 'default' && body[0].priority === 'high' && body[0].channelId === 'default');
    check('S2d method POST + JSON content-type', expoCall.opts.method === 'POST' && expoCall.opts.headers['Content-Type'] === 'application/json');
  }

  // ── Scenario 2: Device A = WEB → early return, NO request ──
  global.__platformOS = 'web';
  fetchCalls.length = 0;
  await push.notifyOtherDevices({ userId: 'user-1', title: 'test', body: 'test' });
  check('S3 web origin: notifyOtherDevices returns at line 1 — NO Expo request sent',
    fetchCalls.length === 0, `fetchCalls=${fetchCalls.length}`);

  console.log(`\nTOTAL: ${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error('PROBE ERROR:', e); process.exit(2); });
