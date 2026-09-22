import { TREE_RULES, getTreeGoals, getTreeStage, getTreeProgress } from './tree-mode.js';

const STAGES = {
  sprout: { name: '새싹', alt: '흙 위에 두 잎이 돋아난 작은 새싹' },
  sapling: { name: '어린나무', alt: '가지와 잎이 자란 어린나무' },
  mature: { name: '큰 나무', alt: '풍성한 초록 잎이 우거진 큰 나무' },
};

// 열매 버튼은 재사용한다. 점수가 바뀌거나 사진을 바꿔도 키보드 포커스를 잃지 않는다.
export function createTreeView({ panel, scene, harvestOverlay, onHarvest }) {
  const find = (id) => panel.querySelector(`#${id}`);
  const art = scene.querySelector('#treeArt');
  const fruitContainer = scene.querySelector('#treeFruits');
  const pop = scene.querySelector('#treeGrowthPop');
  const harvestContainer = harvestOverlay.querySelector('#harvestFruits');
  let previousPoints = 0;
  let previousCycle = 0;

  function createFruits(container, interactive) {
    const fruits = [];
    for (let index = 0; index < TREE_RULES.fruitCount; index += 1) {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'tree-fruit';
      button.dataset.fruit = String(index);
      button.hidden = true;
      const shell = document.createElement('img');
      shell.className = 'tree-fruit-shell';
      shell.src = 'assets/tree/fruit.png';
      shell.alt = '';
      shell.draggable = false;
      const photo = document.createElement('img');
      photo.className = 'tree-fruit-photo';
      photo.alt = '';
      photo.draggable = false;
      button.append(shell, photo);
      if (interactive) {
        const bonus = document.createElement('span');
        bonus.className = 'tree-fruit-bonus';
        bonus.textContent = `+${TREE_RULES.harvestBonus}`;
        bonus.setAttribute('aria-hidden', 'true');
        button.append(bonus);
        button.addEventListener('click', () => onHarvest(index));
      }
      container.append(button);
      fruits.push({ button, photo });
    }
    return fruits;
  }
  const previewFruits = createFruits(fruitContainer, false);
  const harvestFruits = createFruits(harvestContainer, true);

  return {
    render({ state, active, busy, photoForSlot, slotName, feverRemaining = TREE_RULES.feverSeconds }) {
      panel.hidden = !active;
      scene.hidden = !active;
      harvestOverlay.hidden = !active || state.phase !== 'harvest' || busy;
      if (!active) { previousCycle = 0; previousPoints = 0; return; }
      const stage = getTreeStage(state);
      const harvesting = state.phase === 'harvest';
      const progress = getTreeProgress(state, feverRemaining);
      const goals = getTreeGoals(state.cycle);
      const now = Date.now();
      panel.classList.toggle('is-harvesting', harvesting);
      if (scene.dataset.stage !== stage) {
        scene.dataset.stage = stage;
        art.src = `assets/tree/${stage}.png`;
        art.classList.remove('tree-grown');
        void art.offsetWidth;
        art.classList.add('tree-grown');
      }
      art.alt = STAGES[stage].alt;
      find('treeCycle').textContent = `${state.cycle}번째 나무`;
      find('treeStageName').textContent = harvesting ? '수확 피버!' : STAGES[stage].name;
      find('treePointCount').textContent = harvesting
        ? `${state.harvestCount}개 수확`
        : `${state.points} 성장`;
      const meter = find('treeProgress');
      meter.max = progress.max;
      meter.value = progress.value;
      meter.setAttribute('aria-label', progress.label);
      meter.setAttribute('aria-valuetext', `${progress.label}, ${progress.value} / ${progress.max}`);
      find('treeNext').textContent = harvesting
        ? busy ? '연달아 모은 블록을 정리하고 있어요' : '열매가 다시 열려요. 많이 따 보세요'
        : stage === 'sprout' ? `${goals.saplingPoints - state.points}개 더 모으면 어린나무가 돼요`
          : stage === 'sapling' ? `${goals.maturePoints - state.points}개 더 모으면 큰 나무가 돼요`
            : `열매 ${state.fruitSlots.length} / ${TREE_RULES.fruitCount}개 · 다음 열매까지 ${goals.pointsPerFruit - (state.points - goals.maturePoints) % goals.pointsPerFruit}개`;
      harvestOverlay.querySelector('#harvestCount').textContent = `${state.harvestCount}개 수확`;
      const timer = harvestOverlay.querySelector('#harvestTimer');
      timer.textContent = `${feverRemaining}초`;
      timer.classList.toggle('low', feverRemaining <= 3);
      find('treeTotal').textContent = `${state.totalHarvested}개`;
      for (const [fruits, interactive] of [[previewFruits, false], [harvestFruits, true]]) {
        fruits.forEach(({ button, photo }, index) => {
          const slot = state.fruitSlots[index];
          const regrowing = harvesting && now < state.fruitReadyAt[index];
          button.hidden = slot === undefined;
          button.disabled = !interactive || !harvesting || busy;
          button.classList.toggle('is-regrowing', regrowing);
          button.setAttribute('aria-disabled', String(button.disabled || regrowing));
          if (slot === undefined) return;
          const source = photoForSlot(slot);
          if (photo.getAttribute('src') !== source) photo.src = source;
          button.setAttribute('aria-label', `${index + 1}번째 ${slotName(slot)} 열매${regrowing ? ', 다시 열리고 있어요' : harvesting && interactive ? ` 수확하기, 보너스 ${TREE_RULES.harvestBonus}점` : ', 자라고 있어요'}`);
        });
      }
      if (state.cycle === previousCycle && state.points > previousPoints) {
        pop.textContent = `성장 +${state.points - previousPoints}`;
        pop.classList.remove('play');
        void pop.offsetWidth;
        pop.classList.add('play');
      } else if (state.cycle !== previousCycle) {
        pop.textContent = '';
        pop.classList.remove('play');
      }
      previousPoints = state.points;
      previousCycle = state.cycle;
    },
    focusFruit({ reveal = false, afterIndex = -1 } = {}) {
      const ordered = [...harvestFruits.slice(afterIndex + 1), ...harvestFruits.slice(0, afterIndex + 1)];
      const next = ordered.find(({ button }) => !button.hidden && !button.disabled && !button.classList.contains('is-regrowing'))
        || ordered.find(({ button }) => !button.hidden && !button.disabled);
      next?.button.focus({ preventScroll: !reveal });
    },
  };
}
