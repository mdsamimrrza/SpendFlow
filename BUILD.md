`# 🛠️ SpendFlow — Complete Local Build & Setup Guide

This guide walks you through the complete step-by-step process to clone, install, configure, run, and locally build the **SpendFlow** Android application (both Debug & Release APKs) on Windows, macOS, or Linux.

---

## 📋 Table of Contents
1. [System Prerequisites](#1-system-prerequisites)
2. [Android SDK & Environment Variables Setup](#2-android-sdk--environment-variables-setup)
3. [Repository Installation](#3-repository-installation)
4. [Environment Configuration (`.env`)](#4-environment-configuration-env)
5. [Running in Development Mode](#5-running-in-development-mode)
6. [Building Local Android APKs (Debug & Release)](#6-building-local-android-apks-debug--release)
7. [Installing the APK onto a Device / Emulator](#7-installing-the-apk-onto-a-device--emulator)
8. [Alternative Cloud Build (Expo EAS)](#8-alternative-cloud-build-expo-eas)
9. [Troubleshooting & Common Build Fixes](#9-troubleshooting--common-build-fixes)

---

## 1. System Prerequisites

Before starting, ensure your development machine has the following installed:

| Tool | Recommended Version | Download Link |
| :--- | :--- | :--- |
| **Node.js** | `v20.x` LTS or `v18.x` LTS | [nodejs.org](https://nodejs.org/) |
| **Java JDK** | `JDK 17` (Temurin / Oracle / OpenJDK) | [Adoptium Temurin 17](https://adoptium.net/temurin/releases/?version=17) |
| **Android Studio** | Latest (Ladybug / Koala) | [developer.android.com/studio](https://developer.android.com/studio) |
| **Git** | Latest | [git-scm.com](https://git-scm.com/) |

---

## 2. Android SDK & Environment Variables Setup

### A. Android Studio SDK Components
Open **Android Studio** $\rightarrow$ **More Actions** / **Settings** $\rightarrow$ **SDK Manager**:
1. **SDK Platforms**:
   * Check **Android 16.0** (API 36), which is the compile and target SDK currently used by the generated Android project.
2. **SDK Tools**:
   * Check **Android SDK Build-Tools 36.0.0**.
   * Check **Android SDK Command-line Tools (latest)**.
   * Check **Android SDK Platform-Tools**.
   * Check **Android Emulator**.

### B. Configure Environment Variables (Windows)
Open **System Properties** $\rightarrow$ **Environment Variables**:

1. **`JAVA_HOME`**:
   * Variable name: `JAVA_HOME`
   * Variable value: `C:\Program Files\Eclipse Adoptium\jdk-17.x.x` (or Android Studio's JBR: `C:\Program Files\Android\Android Studio\jbr`)

2. **`ANDROID_HOME`**:
   * Variable name: `ANDROID_HOME`
   * Variable value: `C:\Users\<YourUsername>\AppData\Local\Android\Sdk`

3. **`Path` (System/User Variable)**:
   Add the following entries to your `Path`:
   * `%JAVA_HOME%\bin`
   * `%ANDROID_HOME%\platform-tools`
   * `%ANDROID_HOME%\cmdline-tools\latest\bin`
   * `%ANDROID_HOME%\tools`

> **Verify in Terminal (PowerShell / Command Prompt)**:
> ```powershell
> java -version
> adb version
> ```

---

## 3. Repository Installation

1. **Clone the repository**:
   ```bash
   git clone https://github.com/mdsamimrrza/SpendFlow.git
   cd SpendFlow
   ```

2. **Install Node dependencies**:
   ```bash
   npm install
   ```

---

## 4. Environment Configuration (`.env`)

Create a `.env` file in the root directory:

```env
# Supabase Backend Configuration
EXPO_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
EXPO_PUBLIC_SUPABASE_KEY=your-supabase-key

# Real-time Currency Exchange API (Optional / Free Tier)
EXPO_PUBLIC_EXCHANGE_RATE_API_KEY=your-exchange-rate-key
```

---

## 5. Running in Development Mode

### A. Start the Metro Development Server
```bash
npx expo start -c
```

### B. Run on Platforms:
* **Press `a`** $\rightarrow$ Opens app in connected Android device or Android Emulator.
* **Press `w`** $\rightarrow$ Opens app in your default Web Browser (`http://localhost:8081`).
* **Press `r`** $\rightarrow$ Reloads the app / clear cache.

---

## 6. Building Local Android APKs (Debug & Release)

SpendFlow contains a configured `android/` native folder. If modifying native plugins or icons, you can regenerate it using:
```bash
npx expo prebuild --clean
```

### Step 1: Ensure `local.properties` exists
Ensure `android/local.properties` contains your Android SDK location:
```properties
sdk.dir=C\:\\Users\\<YourUsername>\\AppData\\Local\\Android\\Sdk
```

---

### Step 2: Build APK via Gradle

#### 🅰️ Build Debug APK (Fastest — No signing key required)
* **Windows (PowerShell)**:
  ```powershell
  cd android
  .\gradlew.bat assembleDebug
  ```
* **macOS / Linux**:
  ```bash
  cd android
  chmod +x gradlew
  ./gradlew assembleDebug
  ```
* **Output APK location**:
  ```
  android/app/build/outputs/apk/debug/app-debug.apk
  ```

---

#### 🅱️ Build Standalone Release APK (Optimized, Self-Contained)
* **Windows (PowerShell)**:
  ```powershell
  cd android
  .\gradlew.bat assembleRelease
  ```
* **macOS / Linux**:
  ```bash
  cd android
  chmod +x gradlew
  ./gradlew assembleRelease
  ```
* **Output APK location**:
  ```
  android/app/build/outputs/apk/release/app-release.apk
  ```

---

#### 🅲 Build Google Play Store Bundle (`.aab`)
If submitting to the Google Play Console:
```powershell
cd android
.\gradlew.bat bundleRelease
```
* **Output AAB location**:
  ```
  android/app/build/outputs/bundle/release/app-release.aab
  ```

---

## 7. Installing the APK onto a Device / Emulator

1. Connect your Android device via USB (ensure **USB Debugging** is enabled in Developer Options) or start your Android Studio Emulator.
2. Verify device is detected:
   ```bash
   adb devices
   ```
3. Install the APK directly:
   ```bash
   adb install -r android/app/build/outputs/apk/release/app-release.apk
   ```

---

## 8. Alternative Cloud Build (Expo EAS)

If you prefer building in the cloud without local Android Studio tools:

1. **Install EAS CLI**:
   ```bash
   npm install -g eas-cli
   ```
2. **Log into Expo**:
   ```bash
   eas login
   ```
3. **Trigger Cloud Build**:
   ```bash
   # Build APK for direct installation
   eas build -p android --profile preview

   # Build Production AAB for Google Play
   eas build -p android --profile production
   ```

---

## 9. Troubleshooting & Common Build Fixes

### ❌ Error: `SDK location not found. Define location with an ANDROID_HOME environment variable`
**Solution**: Create `android/local.properties` with:
```properties
sdk.dir=C\:\\Users\\<YourUsername>\\AppData\\Local\\Android\\Sdk
```

---

### ❌ Error: `Java heap space` or `OutOfMemoryError` during Gradle build
**Solution**: Increase Gradle heap memory in `android/gradle.properties`:
```properties
org.gradle.jvmargs=-Xmx4096m -XX:MaxMetaspaceSize=1024m
```

---

### ❌ Error: `Execution failed for task ':app:processDebugResources'`
**Solution**: Clean the build directory and restart Gradle:
```powershell
cd android
.\gradlew.bat clean
.\gradlew.bat assembleRelease
```

---

### ❌ Error: Metro cache conflicts / TypeScript errors
**Solution**: Run clean cache reset:
```bash
npx expo start -c
npx tsc --noEmit
```

---

## 📜 Build Verification Checklist
- [x] Node.js `v18+` or `v20+` installed.
- [x] Java JDK 17 configured in `JAVA_HOME`.
- [x] Android SDK Platform 34/35 & Build-Tools installed.
- [x] Supabase credentials provided in `.env`.
- [x] `npx tsc --noEmit` passes with 0 errors.
- [x] `.\gradlew.bat assembleRelease` completes with `BUILD SUCCESSFUL`.
