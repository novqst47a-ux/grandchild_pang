import { existsSync } from 'node:fs';
import { delimiter, join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { spawnSync } from 'node:child_process';

const REQUIRED_JAVA = 21;

export function androidBuildPaths(environment = process.env, workingDirectory = process.cwd()) {
  const buildRoot = environment.SONJUPANG_ANDROID_BUILD_ROOT
    ? resolve(environment.SONJUPANG_ANDROID_BUILD_ROOT)
    : environment.USERPROFILE
      ? join(environment.USERPROFILE, 'Documents', 'Dev', 'grandchild_pang')
      : resolve(workingDirectory, '.android-build');
  const gradleBuildDirectory = join(buildRoot, 'android-build');

  return {
    buildRoot,
    gradleBuildDirectory,
    projectCacheDirectory: join(buildRoot, 'gradle-project-cache'),
    apkPath: join(gradleBuildDirectory, 'app', 'outputs', 'apk', 'debug', 'app-debug.apk'),
  };
}

export function parseJavaMajor(versionOutput) {
  const match = String(versionOutput).match(/(?:openjdk|java|javac) version "?(\d+)(?:\.(\d+))?/i);
  if (!match) return null;
  const first = Number(match[1]);
  return first === 1 ? Number(match[2]) : first;
}

function javaExecutable(javaHome) {
  return javaHome
    ? join(javaHome, 'bin', process.platform === 'win32' ? 'java.exe' : 'java')
    : 'java';
}

function javaMajor(javaHome) {
  const executable = javaExecutable(javaHome);
  if (javaHome && !existsSync(executable)) return null;
  const result = spawnSync(executable, ['-version'], { encoding: 'utf8' });
  if (result.error) return null;
  return parseJavaMajor(`${result.stdout}\n${result.stderr}`);
}

function candidateJavaHomes(environment) {
  const candidates = [environment.JAVA_HOME, environment.STUDIO_JDK];

  if (process.platform === 'win32') {
    candidates.push(
      environment.ProgramFiles && join(environment.ProgramFiles, 'Android', 'Android Studio', 'jbr'),
      environment.LOCALAPPDATA && join(environment.LOCALAPPDATA, 'Programs', 'Android Studio', 'jbr'),
    );
  } else if (process.platform === 'darwin') {
    candidates.push('/Applications/Android Studio.app/Contents/jbr/Contents/Home');
  } else {
    candidates.push('/opt/android-studio/jbr', '/usr/local/android-studio/jbr');
  }

  return [...new Set(candidates.filter(Boolean).map((candidate) => resolve(candidate)))];
}

export function findCompatibleJava(environment = process.env) {
  for (const javaHome of candidateJavaHomes(environment)) {
    const major = javaMajor(javaHome);
    if (major >= REQUIRED_JAVA) return { javaHome, major };
  }

  const pathMajor = javaMajor(null);
  return pathMajor >= REQUIRED_JAVA ? { javaHome: null, major: pathMajor } : null;
}

export function main() {
  const java = findCompatibleJava();
  if (!java) {
    console.error(
      'Android 빌드에는 JDK 21 이상이 필요합니다. Android Studio를 설치하거나 JAVA_HOME을 JDK 21로 지정하세요.',
    );
    return 1;
  }

  const androidDirectory = resolve('android');
  const gradleWrapper = join(androidDirectory, process.platform === 'win32' ? 'gradlew.bat' : 'gradlew');
  const buildPaths = androidBuildPaths();
  const environment = { ...process.env };
  environment.SONJUPANG_ANDROID_BUILD_ROOT = buildPaths.buildRoot;
  if (java.javaHome) {
    environment.JAVA_HOME = java.javaHome;
    environment.PATH = `${join(java.javaHome, 'bin')}${delimiter}${environment.PATH ?? ''}`;
  }

  console.log(`JDK ${java.major}로 Android APK를 빌드합니다.`);
  console.log(`Gradle 생성물 경로: ${buildPaths.gradleBuildDirectory}`);
  const command = process.platform === 'win32' ? environment.ComSpec ?? 'cmd.exe' : gradleWrapper;
  const gradleArgs = ['assembleDebug', '--no-daemon', '--project-cache-dir', buildPaths.projectCacheDirectory];
  const args = process.platform === 'win32'
    ? ['/d', '/s', '/c', 'gradlew.bat', ...gradleArgs]
    : gradleArgs;
  const result = spawnSync(command, args, {
    cwd: androidDirectory,
    env: environment,
    stdio: 'inherit',
  });

  if (result.error) {
    console.error(`Gradle 실행 실패: ${result.error.message}`);
    return 1;
  }
  if (result.status !== 0) return result.status ?? 1;
  if (!existsSync(buildPaths.apkPath)) {
    console.error(`Gradle 빌드는 성공했지만 APK를 찾지 못했습니다: ${buildPaths.apkPath}`);
    return 1;
  }
  console.log(`APK 생성 완료: ${buildPaths.apkPath}`);
  return 0;
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  process.exitCode = main();
}
