let audioContext;

const alertPatterns = {
  CRITICAL: { wave: 'square', notes: [880, 587, 880, 587, 880], beat: 0.14, length: 0.1, volume: 0.11 },
  HIGH: { wave: 'sawtooth', notes: [784, 784, 523], beat: 0.24, length: 0.16, volume: 0.09 },
  MEDIUM: { wave: 'triangle', notes: [659, 880], beat: 0.28, length: 0.18, volume: 0.07 },
  LOW: { wave: 'sine', notes: [523], beat: 0.36, length: 0.24, volume: 0.05 }
};

export async function unlockAlertAudio() {
  const AudioContext = window.AudioContext || window.webkitAudioContext;
  if (!AudioContext) throw new Error('La lecture audio n’est pas prise en charge par ce navigateur.');
  audioContext ??= new AudioContext();
  await audioContext.resume();
  if (audioContext.state !== 'running') throw new Error('Le son est bloqué par le navigateur.');
  return audioContext;
}

export async function playSeverityAlert(severity) {
  const context = await unlockAlertAudio();
  const pattern = alertPatterns[severity] || alertPatterns.MEDIUM;
  const startedAt = context.currentTime + 0.03;

  pattern.notes.forEach((frequency, index) => {
    const oscillator = context.createOscillator();
    const gain = context.createGain();
    const starts = startedAt + index * pattern.beat;
    oscillator.type = pattern.wave;
    oscillator.frequency.value = frequency;
    gain.gain.setValueAtTime(0.001, starts);
    gain.gain.exponentialRampToValueAtTime(pattern.volume, starts + 0.015);
    gain.gain.exponentialRampToValueAtTime(0.001, starts + pattern.length);
    oscillator.connect(gain);
    gain.connect(context.destination);
    oscillator.start(starts);
    oscillator.stop(starts + pattern.length + 0.02);
  });
}

export function publishSeverityAlert(detail) {
  if ('BroadcastChannel' in window) {
    const channel = new BroadcastChannel('cyberincident-alerts');
    channel.postMessage(detail);
    channel.close();
  }
}