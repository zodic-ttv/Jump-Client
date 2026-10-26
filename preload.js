const { ipcRenderer, webFrame } = require('electron');
const { createSettingsUi, settingsStyle } = require('./settings-ui');
const settings = ipcRenderer.sendSync('settings:get');

const fs = require('fs');
const path = require('path');
const { error } = require('console');

const logoPath = path.join(__dirname, 'Assets', 'jumptext.png');
const logoData = fs.existsSync(logoPath)
  ? 'data:image/png;base64,' + fs.readFileSync(logoPath).toString('base64')
  : null;

const featureCss = {
  selectableChat:
    '#chatList, #chatList * { user-select: text !important; -webkit-user-select: text !important; pointer-events: auto !important; }'
};


const styleText = `
  #aadsContainer, #adCon, .adsbygoogle { display: none !important; }
  .kc-link { cursor: pointer; text-decoration: underline; }
  .kc-link:hover { opacity: 0.8; }
  .kc-star { color: #eb5656; }
  .kc-star-blue { color: #5a6bc7; }
  .kc-folder-row { cursor: pointer; }
  .kc-chev { font-size: 20px; vertical-align: middle; }
  .kc-indent { padding-left: 28px !important; }
`;

const featureStyle = document.createElement('style');

function installMousePatch(enabled) {
  webFrame.executeJavaScript(`
    (function () {
      window.__kcRawInput = ${enabled ? 'true' : 'false'};
      const original = Element.prototype.requestPointerLock;
      Element.prototype.requestPointerLock = function (options) {
        if (!window.__kcRawInput) return original.call(this, options);
        const merged = Object.assign({}, options, { unadjustedMovement: true });
        const result = original.call(this, merged);
        if (result && typeof result.catch === 'function') {
          result.catch(() => original.call(this, options));
        }
        return result;
      };
    })();
  `);
}

function setMousePatch(enabled) {
  webFrame.executeJavaScript('window.__kcRawInput = ' + (enabled ? 'true' : 'false') + ';');
}

installMousePatch(settings.rawInput);




function applyFeatures() {
  let css = '';
  for (const [key, rules] of Object.entries(featureCss)) {
    if (settings[key]) css += rules + '\n';
  }
}

function onSettingChanged(key, value) {
  settings[key] = value;
  ipcRenderer.invoke('settings:set', key, value);
  if (key === 'rawInput') setMousePatch(value);
  applyFeatures();
}

const settingsUi = createSettingsUi(settings, onSettingChanged);

function dismissClientPopup() {
  const pop = document.querySelector('#popupHolder');
  if (!pop) return;

  const isNotice = /discontinuing this version/i.test(pop.textContent);

  if (isNotice && !pop.dataset.kcHidden) {
    pop.dataset.kcPrev = pop.style.display;
    pop.style.display = 'none';
    pop.dataset.kcHidden = '1';
  } else if (!isNotice && pop.dataset.kcHidden) {
    pop.style.display = pop.dataset.kcPrev || '';
    delete pop.dataset.kcHidden;
    delete pop.dataset.kcPrev;
  }
}

function changegamenameholder() {
  if (!logoData) return;

  const logo = document.querySelector('#gameNameHolder #mainLogo');
  if (!logo) return;

  logo.src = logoData;
  logo.style.width = '50%';
  logo.style.height = 'auto';
  logo.style.position = 'relative';
  logo.style.transform = 'translate(0px, -40%)';
}

function replacepopularnow() {
  const holder = document.querySelector('#subLogoButtons .popRail');
  if (!holder) return;
  holder.dataset.jumpInfo = '1';
  holder.style.height = 'auto';

  const header = holder.querySelector('.popRailHeader');
  const container = holder.querySelector('.popRailCards');
  const card = container?.querySelector('.popRailCard');
    

  if (header) {
    const textNode = [...header.childNodes].find(
      node => node.nodeType === Node.TEXT_NODE
    );

    if (textNode) {
      textNode.textContent = 'Jump Info';
    } else if (header.textContent.trim() !== 'Jump Info') {
      header.textContent = 'Jump Info';
    }
  }

  if (!container || !card) return;

    // hide all the card stuff
  container.querySelectorAll('.popRailCard').forEach((el, i) => {
    el.style.display = i === 0 ? 'flex' : 'none';
  });

    


  if (!card.dataset.jumpInfoCreated) {
    card.dataset.jumpInfoCreated = 'true';

    card.innerHTML = `
      <div class="jumpInfoStats">
        <div>Leaderboard Position: 0</div>
        <div>Jumps completed: 0</div>
        <div>Points: 0pts</div>
      </div>
    `;

        // interaction remove stuff
    card.onclick = null;
    card.removeAttribute('onclick');
    card.removeAttribute('title');
    card.style.cursor = 'default';
    card.style.justifyContent = 'flex-start';
    card.style.alignItems = 'center';
    card.style.width = '100%';
    card.style.boxSizing = 'border-box';
  }

  holder.style.width = '100%';
  holder.style.maxWidth = 'none';
  container.style.width = '100%';
  container.style.maxWidth = 'none';
}

function overrideTeamName() {
  const teamnamesection = document.querySelector('#bottomLeftTeamName');
  if (!teamnamesection) return;

  if (teamnamesection.textContent !== 'Points: 1') {
    teamnamesection.textContent = 'Points: 1';
  }
}

let teamNameObserver = null;
let teamNameTarget = null;

function watchTeamName() {
  const teamnamesection = document.querySelector('#bottomLeftTeamName');
  if (!teamnamesection || teamnamesection === teamNameTarget) return;

  teamNameTarget = teamnamesection;
  if (teamNameObserver) teamNameObserver.disconnect();

  overrideTeamName();
  teamNameObserver = new MutationObserver(overrideTeamName);
  teamNameObserver.observe(teamnamesection, {
    childList: true,
    subtree: true,
    characterData: true
  });
}
window.addEventListener('DOMContentLoaded', () => {
  const baseStyle = document.createElement('style');
  baseStyle.textContent = styleText + settingsStyle;
  document.head.append(baseStyle);
  document.head.append(featureStyle);
  applyFeatures();
  

  let queued = false;

  const observer = new MutationObserver(() => {
    if (queued) return;

    queued = true;

    setTimeout(() => {
      queued = false;

      if (document.pointerLockElement) return;

      dismissClientPopup();
      changegamenameholder();
      

      if (settings.jumpInfo) replacepopularnow();

      settingsUi.ensureSections();
      watchTeamName();
    }, 100);
  });

  observer.observe(document.documentElement, {
    childList: true,
    subtree: true
  });

  // One interval only, instead of creating a new one
  // every time the DOM changes.
  setInterval(() => {
    if (document.pointerLockElement) return;

    dismissClientPopup();
    changegamenameholder();

    if (settings.jumpInfo) replacepopularnow();

    settingsUi.ensureSections();
    watchTeamName();
  }, 1000);
});
