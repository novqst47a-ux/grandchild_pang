// docs/DESIGN.md의 규칙 중 기계로 검사할 수 있는 것들.
// CSS와 문구는 유닛 테스트가 닿지 않는 영역이라 회귀가 조용히 쌓인다.
// 이 파일은 디자인 리뉴얼(docs/webapp-design-renewal-plan.md)의 완료 정의 역할을 한다.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const read = (name) => readFile(new URL(`../${name}`, import.meta.url), 'utf8');

const stripComments = (css) => css.replaceAll(/\/\*[\s\S]*?\*\//g, '');

// 최상위 규칙과 @media 안의 규칙을 모두 { 선택자, 본문 } 으로 뽑는다.
// 본문에 중괄호가 없는 규칙만 잡히므로 @media 래퍼 자체는 자연히 걸러진다.
function cssRules(css) {
  return [...stripComments(css).matchAll(/([^{}]+)\{([^{}]*)\}/g)]
    .map(([, selector, body]) => ({ selector: selector.trim(), body }));
}

// 모달 안에서 실제로 쓰이는 클래스를 index.html에서 읽어 온다.
// 선택자 이름만으로 판단하면 .primary-button처럼 게임 화면과 모달이 공유하는 클래스를
// 놓친다. 공유 클래스는 리뉴얼 과정에서 갈라져야 하므로, 걸리는 게 맞다.
function modalClasses(html) {
  const classes = new Set();
  for (const [, inner] of html.matchAll(/<dialog\b[^>]*>([\s\S]*?)<\/dialog>/gi)) {
    for (const [, value] of inner.matchAll(/\bclass="([^"]*)"/gi)) {
      for (const name of value.split(/\s+/).filter(Boolean)) classes.add(name);
    }
  }
  return classes;
}

// 해당 규칙이 모달 안 요소를 겨냥하는가.
function targetsModal(selector, classes) {
  return [...classes].some((name) => new RegExp(`\\.${name}(?![\\w-])`).test(selector));
}

test('구 보라·크림 토큰이 남아 있지 않다 (DESIGN §1.1)', async () => {
  const css = await read('styles.css');
  const stale = ['--purple', '--cream'].filter((token) => css.includes(token));
  assert.deepEqual(stale, [], `구 토큰이 남아 있다: ${stale.join(', ')}`);
});

test('DESIGN §1.1 색상 토큰이 모두 정의되어 있다', async () => {
  const css = await read('styles.css');
  const required = [
    '--canvas', '--surface', '--surface-warm', '--line', '--line-strong',
    '--ink', '--ink-soft', '--ink-faint',
    '--carrot', '--carrot-deep', '--carrot-lip', '--carrot-tint',
    '--success', '--danger', '--reward', '--focus', '--focus-tint',
    // 계획 문서 §5.1 / §5.4 / §5.5에서 추가한 보정 토큰
    '--board', '--board-edge', '--ink-disabled', '--btn-edge',
  ];
  const missing = required.filter((token) => !new RegExp(`${token}\\s*:`).test(css));
  assert.deepEqual(missing, [], `미정의 토큰: ${missing.join(', ')}`);
});

test('밝은 주황을 글자 색으로 쓰지 않는다 (DESIGN §1.2)', async () => {
  const css = await read('styles.css');
  // --carrot(#ff6f0f)은 흰 글자와 2.79:1이라 텍스트로 쓸 수 없다.
  // 아이콘·테두리·진행바 채움 등 비텍스트 용도로만 허용한다.
  const offenders = cssRules(css)
    .filter(({ body }) => /(?<!-)\bcolor:\s*var\(--carrot\)/.test(body))
    .map(({ selector }) => selector);
  assert.deepEqual(offenders, [], `--carrot을 글자 색으로 사용: ${offenders.join(' / ')}`);
});

test('글자 굵기가 400 / 700 / 800 / 900 만 쓴다 (DESIGN §2.1)', async () => {
  const css = await read('styles.css');
  const allowed = new Set(['400', '700', '800', '900', 'inherit']);
  const used = [...stripComments(css).matchAll(/font-weight:\s*([^;]+);/g)].map(([, value]) => value.trim());
  const invalid = [...new Set(used.filter((value) => !allowed.has(value)))];
  assert.deepEqual(invalid, [], `허용되지 않는 굵기: ${invalid.join(', ')}`);
});

test('모달 안에서는 3D 립을 쓰지 않는다 (DESIGN §4)', async () => {
  const [css, html] = [await read('styles.css'), await read('index.html')];
  const classes = modalClasses(html);
  // 립 = 흐린 그림자가 아니라 단색 오프셋. box-shadow의 blur가 0인 형태.
  const lip = /box-shadow:\s*[^;]*?\b0\s+-?\d+px\s+0\b/;
  const offenders = cssRules(css)
    .filter(({ selector, body }) => targetsModal(selector, classes) && lip.test(body))
    .map(({ selector }) => selector);
  assert.deepEqual(offenders, [], `모달 안에 립이 있다: ${offenders.join(' / ')}`);
});

test('모달 안에서는 bounce 이징을 쓰지 않는다 (DESIGN §8)', async () => {
  const [css, html] = [await read('styles.css'), await read('index.html')];
  const classes = modalClasses(html);
  const offenders = cssRules(css)
    .filter(({ selector, body }) => targetsModal(selector, classes) && body.includes('--e-bounce'))
    .map(({ selector }) => selector);
  assert.deepEqual(offenders, [], `모달 안에 bounce가 있다: ${offenders.join(' / ')}`);
});

// --- 문구 검사 (DESIGN §7) ---

function htmlCopy(html) {
  const body = html
    .replaceAll(/<script[\s\S]*?<\/script>/gi, '')
    .replaceAll(/<style[\s\S]*?<\/style>/gi, '');
  const attributes = [...body.matchAll(/\b(?:aria-label|alt|title|placeholder)="([^"]*)"/gi)].map(([, value]) => value);
  const text = body.replaceAll(/<[^>]+>/g, '\n');
  return [...attributes, text].join('\n');
}

function jsCopy(source) {
  const code = source
    .replaceAll(/\/\*[\s\S]*?\*\//g, '')
    .replaceAll(/^\s*\/\/.*$/gm, '');
  return [...code.matchAll(/'([^'\\\n]*)'|"([^"\\\n]*)"|`([^`\\]*)`/g)]
    .map(([, a, b, c]) => a ?? b ?? c)
    .filter((value) => /[가-힣]/.test(value))
    .join('\n');
}

async function userFacingCopy() {
  return `${htmlCopy(await read('index.html'))}\n${jsCopy(await read('src/app.js'))}`;
}

function findLines(copy, pattern) {
  return copy.split('\n').map((line) => line.trim()).filter((line) => pattern.test(line));
}

test('사용자 문구에 격식체(-습니다) 어미를 쓰지 않는다 (DESIGN §7)', async () => {
  // '-습니다'만 찾으면 '유지됩니다'·'삭제됩니다' 같은 '-ㅂ니다' 형태를 놓친다.
  // 두 형태 모두 '니다'로 끝나므로 그것을 기준으로 삼는다.
  // 명령형(누르세요) → 권유형(눌러 보세요) 규칙은 기계로 가리기 어려워 사람이 검토한다.
  const hits = findLines(await userFacingCopy(), /니다|니까/);
  assert.deepEqual(hits, [], `격식체 ${hits.length}건:\n${hits.join('\n')}`);
});

test('사용자 문구에 금지어가 없다 (DESIGN §7)', async () => {
  const hits = findLines(await userFacingCopy(), /오류|실패|잘못|불가능/);
  assert.deepEqual(hits, [], `금지어 ${hits.length}건:\n${hits.join('\n')}`);
});

test('사용자 문구에 어려운 말을 쓰지 않는다 (DESIGN §7)', async () => {
  // 프리셋 → 꾸민 모습, 슬롯 → 블록 자리, 크롭/자르기 → 사진 맞추기, 초기화 → 처음으로 되돌리기
  const hits = findLines(await userFacingCopy(), /프리셋|슬롯|크롭|자르기|초기화/);
  assert.deepEqual(hits, [], `어려운 말 ${hits.length}건:\n${hits.join('\n')}`);
});
