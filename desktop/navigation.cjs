const ATLAS_URL = "https://atlas-ten-orpin.vercel.app";

function isAtlasUrl(value) {
  try {
    return new URL(value).origin === ATLAS_URL;
  } catch {
    return false;
  }
}

function isExternalUrl(value) {
  try {
    return ["https:", "http:", "mailto:"].includes(new URL(value).protocol);
  } catch {
    return false;
  }
}

module.exports = { ATLAS_URL, isAtlasUrl, isExternalUrl };
