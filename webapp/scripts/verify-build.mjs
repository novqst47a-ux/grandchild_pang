import { access, readFile } from 'node:fs/promises';
import { dirname, isAbsolute, relative, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const defaultOutput = resolve(root, 'dist');

function localPath(outputDirectory, indexPath, reference) {
  if (/^(?:[a-z]+:)?\/\//i.test(reference) || reference.startsWith('data:') || reference.startsWith('#')) return null;

  const pathname = decodeURIComponent(reference.split(/[?#]/, 1)[0]);
  return pathname.startsWith('/')
    ? resolve(outputDirectory, `.${pathname}`)
    : resolve(dirname(indexPath), pathname);
}

export async function verifyBuild(outputDirectory = defaultOutput) {
  const output = resolve(outputDirectory);
  const indexPath = resolve(output, 'index.html');
  const html = await readFile(indexPath, 'utf8');
  const scriptReferences = [...html.matchAll(/<script\b[^>]*\bsrc=["']([^"']+)["'][^>]*>/gi)].map((match) => match[1]);
  const linkReferences = [...html.matchAll(/<link\b[^>]*\bhref=["']([^"']+)["'][^>]*>/gi)].map((match) => match[1]);

  if (scriptReferences.length === 0) throw new Error('dist/index.html에 실행할 스크립트가 없습니다.');
  if (scriptReferences.some((reference) => reference === 'src/app.js' || reference.endsWith('/src/app.js'))) {
    throw new Error('dist/index.html이 개발용 src/app.js를 참조합니다. Vite 산출물이 덮어써졌습니다.');
  }

  for (const reference of [...scriptReferences, ...linkReferences]) {
    const target = localPath(output, indexPath, reference);
    if (!target) continue;

    const outsideOutput = isAbsolute(relative(output, target)) || relative(output, target).startsWith('..');
    if (outsideOutput) throw new Error(`빌드 산출물 밖을 참조합니다: ${reference}`);

    try {
      await access(target);
    } catch {
      throw new Error(`dist/index.html의 참조 파일이 없습니다: ${reference}`);
    }
  }

  console.log(`빌드 진입점 검증 완료: ${scriptReferences.join(', ')}`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  await verifyBuild();
}
