"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.registerPushToken = registerPushToken;
exports.unregisterPushToken = unregisterPushToken;
exports.notifyOtherDevices = notifyOtherDevices;
const react_native_1 = require("react-native");
const Notifications = __importStar(require("expo-notifications"));
const Device = __importStar(require("expo-device"));
const expo_constants_1 = __importDefault(require("expo-constants"));
const supabase_1 = require("@/utils/supabase");
// Remote push is unsupported inside Expo Go since SDK 53 — degrade gracefully there.
const isExpoGo = expo_constants_1.default.executionEnvironment === 'storeClient';
const EXPO_PUSH_ENDPOINT = 'https://exp.host/--/api/v2/push/send';
/**
 * Registers this device's Expo push token under the signed-in user.
 * Safe to call repeatedly — upserts the same token idempotently.
 */
async function registerPushToken(userId) {
    var _a, _b, _c, _d, _e;
    if (react_native_1.Platform.OS === 'web') {
        console.log('[Push] Skipped: web platform');
        return;
    }
    if (isExpoGo) {
        console.log('[Push] Skipped: Expo Go does not support push tokens (SDK 53+). Build a standalone APK to test cross-device push.');
        return;
    }
    if (!Device.isDevice) {
        console.log('[Push] Skipped: not a physical device (emulator/simulator)');
        return;
    }
    try {
        const existing = await Notifications.getPermissionsAsync();
        let status = existing.status;
        if (status !== 'granted') {
            const requested = await Notifications.requestPermissionsAsync();
            status = requested.status;
        }
        if (status !== 'granted') {
            console.warn('[Push] Permission denied — token not registered');
            return;
        }
        const projectId = (_d = (_c = (_b = (_a = expo_constants_1.default.expoConfig) === null || _a === void 0 ? void 0 : _a.extra) === null || _b === void 0 ? void 0 : _b.eas) === null || _c === void 0 ? void 0 : _c.projectId) !== null && _d !== void 0 ? _d : 'db912006-55b7-4be4-9a0a-42f8935bbf17';
        const tokenResponse = await Notifications.getExpoPushTokenAsync({ projectId });
        const token = tokenResponse.data;
        if (!token) {
            console.warn('[Push] No token returned from Expo');
            return;
        }
        const { error } = await supabase_1.supabase.from('device_tokens').upsert({
            user_id: userId,
            expo_push_token: token,
            platform: react_native_1.Platform.OS,
            device_name: (_e = Device.deviceName) !== null && _e !== void 0 ? _e : null,
            updated_at: new Date().toISOString(),
        }, { onConflict: 'expo_push_token' });
        if (error) {
            console.warn('[Push] Supabase upsert failed:', error.message);
        }
        else {
            console.log('[Push] Token registered successfully:', token.slice(0, 20) + '...');
        }
    }
    catch (err) {
        console.warn('[Push] Token registration failed:', err);
    }
}
/** Removes this device's token (call on sign-out). */
async function unregisterPushToken(userId) {
    var _a, _b, _c, _d;
    if (react_native_1.Platform.OS === 'web' || isExpoGo)
        return;
    try {
        const projectId = (_d = (_c = (_b = (_a = expo_constants_1.default.expoConfig) === null || _a === void 0 ? void 0 : _a.extra) === null || _b === void 0 ? void 0 : _b.eas) === null || _c === void 0 ? void 0 : _c.projectId) !== null && _d !== void 0 ? _d : 'db912006-55b7-4be4-9a0a-42f8935bbf17';
        const tokenResponse = await Notifications.getExpoPushTokenAsync({ projectId });
        await supabase_1.supabase.from('device_tokens').delete().match({
            user_id: userId,
            expo_push_token: tokenResponse.data,
        });
    }
    catch {
        // best-effort cleanup
    }
}
/**
 * Sends a push notification to ALL of the user's other devices.
 * Fire-and-forget — failures are logged, never thrown.
 */
async function notifyOtherDevices(payload) {
    var _a, _b, _c, _d;
    if (react_native_1.Platform.OS === 'web' || isExpoGo)
        return;
    try {
        const projectId = (_d = (_c = (_b = (_a = expo_constants_1.default.expoConfig) === null || _a === void 0 ? void 0 : _a.extra) === null || _b === void 0 ? void 0 : _b.eas) === null || _c === void 0 ? void 0 : _c.projectId) !== null && _d !== void 0 ? _d : 'db912006-55b7-4be4-9a0a-42f8935bbf17';
        // Our own token — exclude the sending device so it doesn't notify itself
        let ownToken = null;
        try {
            const own = await Notifications.getExpoPushTokenAsync({ projectId });
            ownToken = own.data;
        }
        catch {
            ownToken = null;
        }
        const { data: tokens, error } = await supabase_1.supabase
            .from('device_tokens')
            .select('expo_push_token')
            .eq('user_id', payload.userId);
        if (error) {
            console.warn('[Push] Failed to fetch device tokens:', error.message);
            return;
        }
        if (!(tokens === null || tokens === void 0 ? void 0 : tokens.length)) {
            console.log('[Push] No device tokens found for user');
            return;
        }
        const messages = tokens
            .map((row) => row.expo_push_token)
            .filter((token) => token && token !== ownToken)
            .map((token) => {
            var _a;
            return ({
                to: token,
                title: payload.title,
                body: payload.body,
                data: (_a = payload.data) !== null && _a !== void 0 ? _a : {},
                sound: 'default',
                priority: 'high',
                channelId: 'default',
            });
        });
        if (!messages.length) {
            console.log('[Push] No other devices to notify (only this device registered)');
            return;
        }
        console.log(`[Push] Sending to ${messages.length} device(s)...`);
        const response = await fetch(EXPO_PUSH_ENDPOINT, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(messages),
        });
        const result = await response.json().catch(() => null);
        console.log('[Push] Expo response:', JSON.stringify(result));
    }
    catch (err) {
        console.warn('[Push] Cross-device notify failed:', err);
    }
}
