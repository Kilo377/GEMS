const button = document.querySelector('[data-replay="load"]');
const status = document.querySelector('[data-replay="status"]');
let replayModule;
let starting = false;

async function loadDemo() {
  if (starting) return;
  starting = true;
  button.disabled = true;
  button.textContent = 'Loading interactive demo…';
  try {
    replayModule ??= await import('./replay.js?v=20261018-scene20');
    await replayModule.load();
  } catch (error) {
    status.textContent = `Unable to load 3D viewer: ${error.message}`;
  } finally {
    starting = false;
    if (!button.hidden) {
      button.disabled = false;
      button.textContent = 'Retry loading';
    }
  }
}

button.addEventListener('click', loadDemo);
loadDemo();
