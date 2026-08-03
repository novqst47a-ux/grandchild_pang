import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { androidBuildPaths, parseJavaMajor } from '../scripts/build-android.mjs';

test('Android WebView 99 이전에 없는 Path2D.roundRect를 사용하지 않는다', async () => {
  const source = await readFile(new URL('../src/custom-blocks.js', import.meta.url), 'utf8');
  const executableSource = source.replaceAll(/\/\/.*Path2D\.roundRect.*$/gm, '');
  assert.equal(executableSource.includes('.roundRect('), false);
});

test('웹 번들을 구형 Android WebView 문법 대상으로 변환한다', async () => {
  const config = await readFile(new URL('../vite.config.js', import.meta.url), 'utf8');
  assert.match(config, /target:\s*['"]chrome60['"]/);
});

test('Vite가 변환한 index.html을 원본 파일로 덮어쓰지 않는다', async () => {
  const buildScript = await readFile(new URL('../scripts/build.mjs', import.meta.url), 'utf8');
  const copiedFiles = buildScript.match(/const files\s*=\s*\[([^\]]*)\]/s)?.[1] ?? '';
  assert.doesNotMatch(copiedFiles, /['"]index\.html['"]/);
});

test('Android 12 기기가 최소 SDK 범위에 포함된다', async () => {
  const variables = await readFile(new URL('../android/variables.gradle', import.meta.url), 'utf8');
  const minSdk = Number(variables.match(/minSdkVersion\s*=\s*(\d+)/)?.[1]);
  assert.ok(minSdk <= 31, `minSdkVersion ${minSdk}은 Android 12(API 31)를 지원하지 않는다`);
});

test('Android 빌드용 Java 주 버전을 판별한다', () => {
  assert.equal(parseJavaMajor('openjdk version "21.0.10" 2026-01-20'), 21);
  assert.equal(parseJavaMajor('java version "1.8.0_412"'), 8);
  assert.equal(parseJavaMajor('알 수 없는 출력'), null);
});

test('Android Gradle 생성물을 사용자 Documents 경로로 분리한다', () => {
  const paths = androidBuildPaths({ USERPROFILE: 'C:\\Users\\net1' }, 'C:\\workspace\\webapp');
  assert.equal(paths.buildRoot, 'C:\\Users\\net1\\Documents\\Dev\\grandchild_pang');
  assert.equal(paths.gradleBuildDirectory, 'C:\\Users\\net1\\Documents\\Dev\\grandchild_pang\\android-build');
  assert.equal(paths.projectCacheDirectory, 'C:\\Users\\net1\\Documents\\Dev\\grandchild_pang\\gradle-project-cache');
  assert.equal(paths.apkPath, 'C:\\Users\\net1\\Documents\\Dev\\grandchild_pang\\android-build\\app\\outputs\\apk\\debug\\app-debug.apk');
});
