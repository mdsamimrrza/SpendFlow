// ==========================================================================
// SpendFlow Website - Dynamic GitHub Release & Interactivity Controller
// ==========================================================================

const GITHUB_REPO = 'mdsamimrrza/SpendFlow';
const FALLBACK_APK_URL = `https://github.com/${GITHUB_REPO}/releases/latest/download/spendflow-latest.apk`;
const RELEASES_PAGE_URL = `https://github.com/${GITHUB_REPO}/releases`;

let currentDownloadUrl = FALLBACK_APK_URL;

// DOM Elements
const downloadBtn = document.getElementById('primaryDownloadBtn');
const navDownloadBtn = document.getElementById('navDownloadBtn');
const qrModalBtn = document.getElementById('openQrModalBtn');
const qrModal = document.getElementById('qrModal');
const closeQrModalBtn = document.getElementById('closeQrModalBtn');
const qrCodeContainer = document.getElementById('qrCodeContainer');
const versionTag = document.getElementById('versionTag');
const releaseDateTag = document.getElementById('releaseDateTag');
const downloadCountTag = document.getElementById('downloadCountTag');
const sizeTag = document.getElementById('sizeTag');

// 1. Fetch Latest Release Info from GitHub API
async function fetchLatestRelease() {
  try {
    const res = await fetch(`https://api.github.com/repos/${GITHUB_REPO}/releases/latest`);
    if (!res.ok) throw new Error('No release found');
    const data = await res.json();

    if (data.tag_name) {
      if (versionTag) versionTag.textContent = data.tag_name;
    }

    if (data.published_at && releaseDateTag) {
      const date = new Date(data.published_at);
      releaseDateTag.textContent = date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
    }

    // Find .apk asset
    const apkAsset = data.assets?.find(a => a.name.endsWith('.apk'));
    if (apkAsset) {
      currentDownloadUrl = apkAsset.browser_download_url;
      if (sizeTag && apkAsset.size) {
        const sizeMb = (apkAsset.size / (1024 * 1024)).toFixed(1);
        sizeTag.textContent = `${sizeMb} MB`;
      }
      if (downloadCountTag && apkAsset.download_count !== undefined) {
        downloadCountTag.textContent = `${apkAsset.download_count}+ Downloads`;
      }
    } else if (data.html_url) {
      currentDownloadUrl = data.html_url;
    }
  } catch (err) {
    console.log('Using default release fallback URL:', currentDownloadUrl);
  }

  // Update download button URLs
  if (downloadBtn) downloadBtn.href = currentDownloadUrl;
  if (navDownloadBtn) navDownloadBtn.href = currentDownloadUrl;
  generateQrCode(currentDownloadUrl);
}

// 2. Generate Mobile QR Code using dynamic SVG encoder
function generateQrCode(url) {
  if (!qrCodeContainer) return;
  // Use quickchart/google QR API for crisp high-res SVG/PNG rendering
  const qrApiUrl = `https://api.qrserver.com/v1/create-qr-code/?size=240x240&data=${encodeURIComponent(url)}&color=06090F&bgcolor=FFFFFF&margin=1`;
  
  qrCodeContainer.innerHTML = `
    <img src="${qrApiUrl}" alt="Scan QR Code to Download SpendFlow APK" width="200" height="200" style="display:block; margin:0 auto; border-radius: 8px;" />
  `;
}

// 3. Modal Event Handlers
if (qrModalBtn) {
  qrModalBtn.addEventListener('click', (e) => {
    e.preventDefault();
    if (qrModal) qrModal.classList.add('active');
  });
}

if (closeQrModalBtn) {
  closeQrModalBtn.addEventListener('click', () => {
    if (qrModal) qrModal.classList.remove('active');
  });
}

if (qrModal) {
  qrModal.addEventListener('click', (e) => {
    if (e.target === qrModal) {
      qrModal.classList.remove('active');
    }
  });
}

document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && qrModal?.classList.contains('active')) {
    qrModal.classList.remove('active');
  }
});

// Initialize on page load
document.addEventListener('DOMContentLoaded', () => {
  fetchLatestRelease();
});
