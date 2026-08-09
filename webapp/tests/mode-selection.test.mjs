import test from 'node:test';
import assert from 'node:assert/strict';
import { GAME_MODES } from '../src/game-modes.js';
import { createModeSelectionController } from '../src/mode-selection.js';

class FakeDialog extends EventTarget {
  open = false;

  showModal() {
    this.open = true;
  }

  close() {
    if (!this.open) return;
    this.open = false;
    this.dispatchEvent(new Event('close'));
  }
}

test('모드 선택창이 뒤로가기 등으로 닫히면 3분 도전을 기본 실행한다', () => {
  const dialog = new FakeDialog();
  const selected = [];
  const controller = createModeSelectionController({
    dialog,
    onSelect: (mode, options) => selected.push({ mode, ...options }),
  });

  controller.begin();
  dialog.close();

  assert.deepEqual(selected, [{ mode: GAME_MODES.TIMED, usedDefault: true }]);
});

test('사용자가 고른 무제한 모드는 닫힘 이벤트에 덮어쓰이지 않는다', () => {
  const dialog = new FakeDialog();
  const selected = [];
  const controller = createModeSelectionController({
    dialog,
    onSelect: (mode, options) => selected.push({ mode, ...options }),
  });

  controller.begin();
  assert.equal(controller.choose(GAME_MODES.UNLIMITED), true);
  dialog.close();

  assert.deepEqual(selected, [{ mode: GAME_MODES.UNLIMITED, usedDefault: false }]);
});
