export function createGameClock({ now = Date.now } = {}) {
  let phase = 'stopped';
  let deadline = 0;
  let pausedMilliseconds = 0;

  function stop() {
    phase = 'stopped';
    deadline = 0;
    pausedMilliseconds = 0;
  }

  function remainingMilliseconds() {
    if (phase === 'paused') return pausedMilliseconds;
    if (phase !== 'running') return 0;
    const remaining = deadline - now();
    if (remaining <= 0) {
      stop();
      return 0;
    }
    return remaining;
  }

  function validMilliseconds(seconds) {
    const milliseconds = seconds * 1000;
    return Number.isFinite(seconds) && seconds > 0 && Number.isFinite(milliseconds)
      ? milliseconds
      : 0;
  }

  return {
    start(seconds) {
      stop();
      const milliseconds = validMilliseconds(seconds);
      if (!milliseconds) return;
      deadline = now() + milliseconds;
      phase = 'running';
    },
    stop,
    remaining() {
      return Math.ceil(remainingMilliseconds() / 1000);
    },
    pause() {
      if (phase !== 'running') return;
      const milliseconds = remainingMilliseconds();
      if (!milliseconds) return;
      pausedMilliseconds = milliseconds;
      phase = 'paused';
      deadline = 0;
    },
    resume() {
      if (phase !== 'paused' || pausedMilliseconds <= 0) return;
      deadline = now() + pausedMilliseconds;
      pausedMilliseconds = 0;
      phase = 'running';
    },
    addSeconds(seconds) {
      const milliseconds = validMilliseconds(seconds);
      if (!milliseconds || !remainingMilliseconds()) return false;
      if (phase === 'paused') pausedMilliseconds += milliseconds;
      else deadline += milliseconds;
      return true;
    },
    isRunning() {
      return phase === 'running' && remainingMilliseconds() > 0;
    },
  };
}
