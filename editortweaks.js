const NEW_TEXT = 'Jump client editor - Tweaks enabled';

function applyEditorTweaks() {
  const version = document.getElementById('versionTxt');
  if (!version) return;

  if (!version.textContent.trim().startsWith('Krunker Editor')) return;

  version.textContent = NEW_TEXT;
}

module.exports = { applyEditorTweaks };