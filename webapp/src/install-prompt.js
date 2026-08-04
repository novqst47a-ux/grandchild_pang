// 홈 화면 설치 안내. 매니페스트와 서비스 워커는 이미 있어서 브라우저 주소창 메뉴로 설치가
// 되기는 했지만, 그 메뉴를 찾아 들어가는 일은 어르신에게 너무 멀다. 그래서 앱을 연 뒤
// 큰 팝업으로 한 번 물어보고, 한 번 눌러 설치되게 한다.
//
// 브라우저는 세 갈래로 갈린다.
//   prompt  — 크롬·엣지·삼성인터넷. beforeinstallprompt를 붙잡아 뒀다가 그대로 띄운다.
//   ios     — 아이폰·아이패드. 설치 API가 없다. 공유 → 홈 화면에 추가를 그림처럼 알려 준다.
//   generic — 그 밖(파이어폭스 등). 자동으로는 띄우지 않고, 사용자가 찾아왔을 때만 안내한다.
//
// 설치는 게임과 무관한 곁가지다. 어디서 실패하든 게임은 그대로 돌아가야 하므로
// 저장소 접근과 이벤트 호출은 전부 조용히 넘긴다.

const STATE_KEY = 'sonjupang-install';
export const SNOOZE_MS = 14 * 24 * 60 * 60 * 1000; // "나중에"를 누르면 2주 동안 다시 묻지 않는다
const AUTO_DELAY_MS = 6000; // 화면이 뜨자마자 덮으면 게임을 못 본다. 한 판 살펴볼 틈을 준다
const RETRY_MS = 30000; // 다른 창이 열려 있으면 이만큼 뒤에 다시 본다
const MAX_RETRY = 4;

const STEP_GUIDES = {
  ios: ['화면 아래 「공유」 단추를 누르세요', '「홈 화면에 추가」를 고르세요'],
  generic: ['브라우저 메뉴 단추를 누르세요', '「홈 화면에 추가」를 고르세요'],
};

// iPadOS 13부터 아이패드는 자기를 데스크톱 사파리라고 말한다. 손가락 수로만 갈라낼 수 있다.
export function isIosDevice(userAgent = '', maxTouchPoints = 0) {
  if (/iphone|ipod|ipad/i.test(userAgent)) return true;
  return /macintosh/i.test(userAgent) && maxTouchPoints > 1;
}

export function normalizeInstallState(raw) {
  const number = (value) => (Number.isFinite(value) && value > 0 ? value : 0);
  return {
    dismissedAt: number(raw?.dismissedAt),
    installedAt: number(raw?.installedAt),
  };
}

// 자동으로 띄울지 정한다. 이미 설치했거나, 설치할 방법이 없거나, 최근에 "나중에"를
// 누른 사람에게는 띄우지 않는다. generic은 안내문일 뿐이라 스스로 나타나지 않는다.
export function shouldAutoShow({ mode, state, now }) {
  if (mode !== 'prompt' && mode !== 'ios') return false;
  if (state.installedAt) return false;
  if (!state.dismissedAt) return true; // 아직 한 번도 물어보지 않았다
  return now - state.dismissedAt >= SNOOZE_MS;
}

function defaultStorage() {
  // 사파리 비공개 모드에서는 localStorage에 손대는 것만으로 예외가 난다.
  try { return window.localStorage; } catch { return null; }
}

export function readInstallState(storage) {
  try { return normalizeInstallState(JSON.parse(storage?.getItem(STATE_KEY) ?? 'null')); }
  catch { return normalizeInstallState(null); }
}

function writeInstallState(storage, state) {
  try { storage?.setItem(STATE_KEY, JSON.stringify(state)); } catch { /* 기억하지 못해도 설치는 된다 */ }
}

function isStandaloneDisplay() {
  try {
    // navigator.standalone은 iOS 사파리 전용이고, display-mode는 그 밖의 브라우저가 쓴다.
    if (window.navigator.standalone === true) return true;
    return ['standalone', 'fullscreen', 'minimal-ui', 'window-controls-overlay']
      .some((mode) => matchMedia(`(display-mode: ${mode})`).matches);
  } catch { return false; }
}

export function setupInstallPrompt({
  toast = () => {},
  storage = defaultStorage(),
  now = () => Date.now(),
  delayMs = AUTO_DELAY_MS,
} = {}) {
  const dialog = document.querySelector('#installDialog');
  if (!dialog) return { open() {} };

  const titleElement = document.querySelector('#installTitle');
  const textElement = document.querySelector('#installText');
  const stepsElement = document.querySelector('#installSteps');
  const laterButton = document.querySelector('#installLaterButton');
  const okButton = document.querySelector('#installOkButton');
  const openButton = document.querySelector('#installAppButton');
  const statusElement = document.querySelector('#installStatus');

  let state = readInstallState(storage);
  let deferredEvent = null;
  let autoScheduled = false;
  let currentMode = '';
  let returnFocus = null;

  function remember(patch) {
    state = normalizeInstallState({ ...state, ...patch });
    writeInstallState(storage, state);
  }

  function installedAlready() {
    return Boolean(state.installedAt) || isStandaloneDisplay();
  }

  function currentInstallMode() {
    if (installedAlready()) return '';
    if (deferredEvent) return 'prompt';
    if (isIosDevice(navigator.userAgent, navigator.maxTouchPoints)) return 'ios';
    return 'generic';
  }

  // 꾸미기 > 더 보기 안의 설치 자리. 설치가 끝났으면 단추를 감추고 한 줄로 알린다.
  function paint() {
    if (!openButton || !statusElement) return;
    const done = installedAlready();
    openButton.hidden = done;
    statusElement.textContent = done
      ? '이미 앱으로 설치돼 있어요'
      : '홈 화면에 두면 한 번에 열 수 있어요';
  }

  function renderSteps(mode) {
    if (!stepsElement) return;
    stepsElement.textContent = '';
    const guide = STEP_GUIDES[mode];
    if (!guide) { stepsElement.hidden = true; return; }
    for (const [index, line] of guide.entries()) {
      const item = document.createElement('li');
      const mark = document.createElement('span');
      mark.className = 'install-step-mark';
      mark.setAttribute('aria-hidden', 'true');
      mark.textContent = String(index + 1);
      item.append(mark, document.createTextNode(line));
      stepsElement.append(item);
    }
    stepsElement.hidden = false;
  }

  function open(trigger = null) {
    currentMode = currentInstallMode();
    if (!currentMode) { toast('이미 앱으로 설치돼 있어요'); paint(); return; }
    if (dialog.open) return;

    if (currentMode === 'prompt') {
      titleElement.textContent = '손주팡을 앱으로 설치할까요?';
      textElement.textContent = '홈 화면에서 바로 열 수 있고, 사진도 그대로 남아요';
      okButton.textContent = '설치하기';
      laterButton.hidden = false;
    } else {
      titleElement.textContent = '홈 화면에 손주팡을 놓아요';
      textElement.textContent = '아래 순서대로 두 번만 누르면 돼요';
      okButton.textContent = '알겠어요';
      laterButton.hidden = true;
    }
    renderSteps(currentMode === 'prompt' ? '' : currentMode);

    returnFocus = trigger;
    dialog.showModal();
    // 설치는 되돌리기 쉬운 일이라 무섭지 않지만, 기본 포커스는 물러설 쪽에 둔다(DESIGN §9).
    (laterButton.hidden ? okButton : laterButton).focus();
  }

  async function runNativePrompt() {
    const event = deferredEvent;
    deferredEvent = null;
    try {
      event.prompt();
      const { outcome } = await event.userChoice;
      if (outcome === 'accepted') toast('앱을 설치하고 있어요', 'success');
      else toast('설치는 꾸미기에서 다시 할 수 있어요');
    } catch {
      toast('설치 창을 열지 못했어요. 브라우저 메뉴에서 홈 화면에 추가를 눌러 주세요', 'danger');
    }
    paint();
  }

  // 닫는 일은 전부 이 함수를 지난다. dialog의 close 이벤트에 기대면, 그 이벤트를 흘리는
  // WebView에서 "나중에"가 기억되지 않아 열 때마다 팝업이 다시 뜬다(app.js의 확인 창과 같은 이유).
  function closeDialog() {
    remember({ dismissedAt: now() });
    dialog.close();
    returnFocus?.focus();
    returnFocus = null;
  }

  okButton.addEventListener('click', () => {
    const mode = currentMode;
    closeDialog();
    // prompt()는 누른 그 순간에 불러야 브라우저가 사용자 동작으로 인정한다. 뒤로 미루지 않는다.
    if (mode === 'prompt' && deferredEvent) runNativePrompt();
  });

  laterButton.addEventListener('click', () => {
    closeDialog();
    toast('설치는 꾸미기 > 더 보기에서 다시 할 수 있어요');
  });

  // Esc·백드롭으로 닫은 것도 "나중에"와 같이 본다. 닫은 사람을 다시 붙잡지 않는다.
  dialog.addEventListener('cancel', () => remember({ dismissedAt: now() }));

  function scheduleAuto(wait = delayMs, attempt = 0) {
    if (autoScheduled && attempt === 0) return;
    autoScheduled = true;
    if (!shouldAutoShow({ mode: currentInstallMode(), state, now: now() })) return;
    setTimeout(() => {
      if (!shouldAutoShow({ mode: currentInstallMode(), state, now: now() })) return;
      // 꾸미기나 확인 창이 열려 있으면 그 위에 또 덮지 않는다. 잠시 뒤에 다시 본다.
      if (document.querySelector('dialog[open]')) {
        if (attempt < MAX_RETRY) scheduleAuto(RETRY_MS, attempt + 1);
        return;
      }
      open();
    }, wait);
  }

  window.addEventListener('beforeinstallprompt', (event) => {
    event.preventDefault(); // 주소창의 작은 기본 안내 대신 우리 팝업으로 묻는다
    deferredEvent = event;
    paint();
    scheduleAuto();
  });

  window.addEventListener('appinstalled', () => {
    deferredEvent = null;
    remember({ installedAt: now() });
    paint();
    toast('앱을 설치했어요. 홈 화면에서 열어 보세요', 'success');
  });

  openButton?.addEventListener('click', () => open(openButton));

  paint();
  // 아이폰은 beforeinstallprompt가 오지 않으므로 여기서 바로 예약한다.
  if (currentInstallMode() === 'ios') scheduleAuto();

  return { open };
}
