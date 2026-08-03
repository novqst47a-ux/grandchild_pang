// 디자인 토큰의 WCAG 대비를 검사한다.
// 문서(docs/DESIGN.md §1.2)의 대비표는 사람이 적은 값이라 코드와 어긋날 수 있으므로,
// 실제로 배포되는 styles.css / custom-blocks.js에서 색을 읽어 계산한다.
import { readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = dirname(dirname(fileURLToPath(import.meta.url)));

const TEXT_MIN = 4.5; // WCAG 1.4.3 본문 텍스트
const UI_MIN = 3.0; // WCAG 1.4.11 비텍스트 경계·구조

// 검사 조합. 앞이 전경, 뒤가 배경.
// kind 'text'는 글자, 'ui'는 테두리·립처럼 모양을 알아보게 하는 경계.
const PAIRS = [
  // docs/DESIGN.md §1.2 대비표
  ['본문 글자 / 앱 배경', '--ink', '--canvas', 'text'],
  ['보조 설명 / 앱 배경', '--ink-soft', '--canvas', 'text'],
  ['흰 글자 / 채움 버튼', '#ffffff', '--carrot-deep', 'text'],
  ['흰 글자 / 포커스', '#ffffff', '--focus', 'text'],
  ['흰 글자 / 성공', '#ffffff', '--success', 'text'],
  ['흰 글자 / 위험', '#ffffff', '--danger', 'text'],
  ['본문 글자 / 점수 노랑', '--ink', '--reward', 'text'],

  // 문서에 없지만 실제 화면에 나타나는 조합
  ['본문 글자 / 카드 면', '--ink', '--surface', 'text'],
  ['보조 설명 / 카드 면', '--ink-soft', '--surface', 'text'],
  ['본문 글자 / 게임판 바닥', '--ink', '--board', 'text'],
  ['본문 글자 / 선택 배경', '--ink', '--focus-tint', 'text'],
  ['브랜드 글자 / 옅은 강조 면', '--carrot-deep', '--carrot-tint', 'text'],
  ['위험 글자 / 위험 옅은 면', '--danger', '--danger-tint', 'text'],
  ['비활성 라벨 / 비활성 면', '--ink-disabled', '--surface-warm', 'text'],

  // 구조 경계 (계획 문서 §5.1)
  ['게임판 외곽선 / 게임판 바닥', '--board-edge', '--board', 'ui'],
  ['게임판 외곽선 / 앱 배경', '--board-edge', '--canvas', 'ui'],
  ['포커스 링 / 카드 면', '--focus', '--surface', 'ui'],
  // 게임 영역의 흰 버튼은 캔버스와 밝기가 거의 같다. 테두리·립이 유일한 경계다.
  ['게임 버튼 테두리·립 / 앱 배경', '--btn-edge', '--canvas', 'ui'],
  ['게임 버튼 테두리·립 / 버튼 면', '--btn-edge', '--surface', 'ui'],
];

// docs/DESIGN.md §1.2 — 밝은 --carrot 위 흰 글자는 저시력 사용자에게 읽히지 않는다.
// 이 조합은 "충분히 낮아야" 통과한다. 값이 올라갔다면 누군가 --carrot을 어둡게 바꾼 것이므로
// 문서의 "비텍스트 전용" 규칙 자체를 다시 볼 필요가 있다는 뜻이다.
const MUST_STAY_LOW = ['흰 글자 / 밝은 주황(사용 금지 확인)', '#ffffff', '--carrot'];

function parseHex(value) {
  const text = value.trim().replace('#', '');
  const full = text.length === 3 ? [...text].map((c) => c + c).join('') : text;
  if (!/^[0-9a-f]{6}$/i.test(full)) return null;
  return [0, 2, 4].map((index) => parseInt(full.slice(index, index + 2), 16));
}

function channel(value) {
  const c = value / 255;
  return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
}

function luminance(hex) {
  const [r, g, b] = parseHex(hex).map(channel);
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function contrast(a, b) {
  const [high, low] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (high + 0.05) / (low + 0.05);
}

// styles.css의 :root 블록에서 커스텀 속성을 읽는다. 색이 아닌 값(간격·시간)은 무시한다.
export function readTokens(css) {
  const tokens = new Map();
  for (const block of css.matchAll(/:root\s*\{([^}]*)\}/g)) {
    for (const [, name, value] of block[1].matchAll(/(--[\w-]+)\s*:\s*([^;]+);/g)) {
      if (parseHex(value)) tokens.set(name, value.trim());
    }
  }
  return tokens;
}

// custom-blocks.js의 DEFAULT_BLOCKS에서 [면, 립] 색 쌍을 순서대로 읽는다.
export function readBlockPalette(source) {
  const list = source.match(/DEFAULT_BLOCKS\s*=\s*\[([\s\S]*?)\n\];/)?.[1];
  if (!list) throw new Error('custom-blocks.js에서 DEFAULT_BLOCKS 배열을 찾지 못했습니다.');
  return [...list.matchAll(/name:\s*'([^']+)'[\s\S]*?colors:\s*\[\s*'(#[0-9a-f]{3,6})'\s*,\s*'(#[0-9a-f]{3,6})'\s*\]/gi)]
    .map(([, name, face, lip]) => ({ name, face, lip }));
}

function resolve1(reference, tokens) {
  if (reference.startsWith('#')) return reference;
  return tokens.get(reference) ?? null;
}

export async function checkContrast() {
  const css = await readFile(resolve(root, 'styles.css'), 'utf8');
  const blocksSource = await readFile(resolve(root, 'src/custom-blocks.js'), 'utf8');
  const tokens = readTokens(css);
  const failures = [];
  const missing = new Set();

  const line = (label, value, min, ok) =>
    `  ${ok ? '통과' : '실패'}  ${label.padEnd(30, ' ')} ${value.toFixed(2).padStart(6)} : 1  (기준 ${min})`;

  console.log('\n토큰 조합');
  for (const [label, fg, bg, kind] of PAIRS) {
    const front = resolve1(fg, tokens);
    const back = resolve1(bg, tokens);
    if (!front || !back) {
      for (const reference of [fg, bg]) if (!resolve1(reference, tokens)) missing.add(reference);
      console.log(`  건너뜀  ${label.padEnd(30, ' ')} 토큰 미정의`);
      continue;
    }
    const min = kind === 'text' ? TEXT_MIN : UI_MIN;
    const value = contrast(front, back);
    const ok = value >= min;
    if (!ok) failures.push(`${label}: ${value.toFixed(2)}:1 (기준 ${min}:1)`);
    console.log(line(label, value, min, ok));
  }

  const carrot = resolve1(MUST_STAY_LOW[2], tokens);
  if (carrot) {
    const value = contrast(MUST_STAY_LOW[1], carrot);
    console.log(`\n  참고  ${MUST_STAY_LOW[0]}  ${value.toFixed(2)} : 1 — 이 조합은 사용하지 않는다`);
  }

  // 게임판 위에서 블록을 알아보게 하는 것은 면이 아니라 립이다.
  // 다섯 블록 면은 서로 밝기가 거의 같아(1.0~1.5:1) 면 색으로는 구분되지 않는다.
  console.log('\n블록 립 / 게임판 바닥');
  const board = tokens.get('--board');
  if (!board) {
    missing.add('--board');
    console.log('  건너뜀  --board 토큰 미정의');
  } else {
    for (const { name, face, lip } of readBlockPalette(blocksSource)) {
      const value = contrast(lip, board);
      const ok = value >= UI_MIN;
      if (!ok) failures.push(`${name} 블록 립: ${value.toFixed(2)}:1 (기준 ${UI_MIN}:1)`);
      console.log(line(`${name} (면 ${face} / 립 ${lip})`, value, UI_MIN, ok));
    }
  }

  if (missing.size) {
    console.error(`\n미정의 토큰 ${missing.size}개: ${[...missing].join(', ')}`);
  }
  if (failures.length) {
    console.error(`\n대비 미달 ${failures.length}건`);
    for (const failure of failures) console.error(`  - ${failure}`);
  }
  if (missing.size || failures.length) {
    throw new Error(`대비 검사 실패 — 미정의 토큰 ${missing.size}개, 대비 미달 ${failures.length}건`);
  }
  console.log('\n대비 검사 통과');
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  try {
    await checkContrast();
  } catch (error) {
    console.error(`\n${error.message}`);
    process.exit(1);
  }
}
