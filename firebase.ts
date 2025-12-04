import { initializeApp } from "firebase/app";
import { getDatabase } from "firebase/database";
import { getAuth, signInAnonymously } from "firebase/auth";

// 1. Check Environment Variables (Netlify / Vite)
const env = (import.meta as any).env;

// 2. Hardcoded Config (Updated with User URL)
const defaultFirebaseConfig = {
  apiKey: "AIzaSyDk9aiL8LPOOtrI6uz0fbWVrC-iG2NL_9c",
  authDomain: "noha-fc557.firebaseapp.com",
  projectId: "noha-fc557",
  storageBucket: "noha-fc557.firebasestorage.app",
  messagingSenderId: "84699767536",
  appId: "1:84699767536:web:0168131486be37546ad835",
  measurementId: "G-00LYZT46D4",
  // التأكد من الرابط الصحيح (بدون / في النهاية للمكتبة، لكنها تقبله)
  databaseURL: "https://noha-fc557-default-rtdb.firebaseio.com"
};

// Logic: Env vars > Local Storage (Manual) > Hardcoded Default
const envConfig = {
  apiKey: env?.VITE_FIREBASE_API_KEY,
  authDomain: env?.VITE_FIREBASE_AUTH_DOMAIN,
  databaseURL: env?.VITE_FIREBASE_DATABASE_URL,
  projectId: env?.VITE_FIREBASE_PROJECT_ID,
  storageBucket: env?.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: env?.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: env?.VITE_FIREBASE_APP_ID
};

// Check Local Storage for manual config
const manualConfigStr = localStorage.getItem('noah_firebase_config');
let manualConfig = null;
try {
    if (manualConfigStr) manualConfig = JSON.parse(manualConfigStr);
} catch (e) {
    console.error("Failed to parse manual config");
}

const finalConfig = (envConfig.apiKey && envConfig.databaseURL) 
    ? envConfig 
    : (manualConfig && manualConfig.apiKey) 
        ? manualConfig 
        : defaultFirebaseConfig;

let app;
let db: any = null;
let auth: any = null;
let isConfigured = false;

if (finalConfig.apiKey) {
    try {
        app = initializeApp(finalConfig);
        db = getDatabase(app);
        auth = getAuth(app); 
        isConfigured = true;
        console.log("Firebase Initialized with:", finalConfig.databaseURL);
    } catch (error) {
        console.error("Firebase Connection Failed", error);
    }
} else {
    console.log("⚠️ No valid Firebase config found.");
}

// Helper to Sign In Anonymously
export const signIn = async () => {
    if (auth) {
        try {
            const userCred = await signInAnonymously(auth);
            console.log("✅ Signed in anonymously:", userCred.user.uid);
            return { user: userCred.user, error: null };
        } catch (error: any) {
            console.error("❌ Auth failed:", error);
            return { user: null, error: error.code || error.message };
        }
    }
    return { user: null, error: "Auth not initialized" };
};

export const saveManualConfig = (config: any) => {
    localStorage.setItem('noah_firebase_config', JSON.stringify(config));
    window.location.reload();
};

export const clearManualConfig = () => {
    localStorage.removeItem('noah_firebase_config');
    window.location.reload();
}

export { db, isConfigured };