import { GAME_MODES } from './game-modes.js';

export const DEFAULT_GAME_MODE = GAME_MODES.TIMED;

// 모바일의 시스템 뒤로가기, 닫기 제스처, WebView별 예외처럼 선택창이 예상치 않게
// 닫히는 모든 경로를 하나로 모은다. 닫힘을 막는 대신 안전한 기본 모드로 이어서
// 사용자가 빈 게임판에 남거나 앱 밖으로 튕긴 것처럼 느끼지 않게 한다.
export function createModeSelectionController({ dialog, onSelect, defaultMode = DEFAULT_GAME_MODE }) {
  let waitingForChoice = false;

  function settle(mode, usedDefault) {
    if (!waitingForChoice) return false;
    waitingForChoice = false;
    if (dialog.open) dialog.close();
    onSelect(mode, { usedDefault });
    return true;
  }

  dialog.addEventListener('close', () => settle(defaultMode, true));

  return {
    begin() {
      waitingForChoice = true;
      if (!dialog.open) dialog.showModal();
    },
    choose(mode) {
      return settle(mode, false);
    },
  };
}
