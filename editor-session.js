// Restore after Safari has finished rebuilding the viewport, not just one frame.
const draftKey = 'scene-editor';
let resumePosition = null;
let restoringPosition = false;
let restoreFrame = 0;
let draftTimer = 0;

function editorPosition() {
  return {
    text: source.value,
    open: editor.open,
    scrollY: window.scrollY,
    sourceTop: source.scrollTop,
    largeTop: large.scrollTop,
    sourceStart: source.selectionStart,
    sourceEnd: source.selectionEnd,
    largeStart: large.selectionStart,
    largeEnd: large.selectionEnd,
    view: $('controls').classList.contains('mobile-off') ? 'preview' : 'edit',
    typographyOpen: $('typography').open,
  };
}

function saveEditorPosition() {
  clearTimeout(draftTimer);
  if (!resumePosition) return;
  try {
    sessionStorage.setItem(draftKey, JSON.stringify(resumePosition));
  } catch {}
}

function rememberEditor() {
  if (restoringPosition || document.hidden) return;
  resumePosition = editorPosition();
  clearTimeout(draftTimer);
  draftTimer = setTimeout(saveEditorPosition, 150);
}

function stopRestoring() {
  cancelAnimationFrame(restoreFrame);
  restoringPosition = false;
}

function restoreEditorPosition() {
  if (!resumePosition || document.hidden) return;
  stopRestoring();
  restoringPosition = true;
  const saved = resumePosition;
  // Keep a fixed target throughout restoration. Programmatic scroll events must
  // never replace it with a transient zero while Safari lays the page out.
  mobile(saved.view || 'edit');
  $('typography').open = !!saved.typographyOpen;
  for (const [area, key] of [
      [source, 'source'],
      [large, 'large']
    ]) {
    area.setSelectionRange(saved[key + 'Start'] || 0, saved[key + 'End'] || 0);
  }
  const started = performance.now();

  function apply() {
    if (!restoringPosition || document.hidden) return;
    if (editor.open && viewport) {
      editor.style.setProperty('--visible-top', viewport.offsetTop + 'px');
      editor.style.setProperty('--visible-height', viewport.height + 'px');
    }
    source.scrollTop = saved.sourceTop || 0;
    large.scrollTop = saved.largeTop || 0;
    window.scrollTo({
      top: saved.scrollY || 0,
      behavior: 'instant'
    });
    if (performance.now() - started < 1400) restoreFrame = requestAnimationFrame(apply);
    else restoreFrame = requestAnimationFrame(() => {
      restoringPosition = false;
    });
  }
  apply();
}

function restoreDraft() {
  try {
    const saved = JSON.parse(sessionStorage.getItem(draftKey) || 'null');
    if (!saved || typeof saved.text !== 'string') return;
    source.value = large.value = saved.text;
    resumePosition = saved;
    restoringPosition = true;
    if (saved.open) {
      editor.showModal();
      $('done').focus({
        preventScroll: true
      });
    }
  } catch {}
}

// Explicit interaction immediately takes priority over restoration.
for (const event of ['pointerdown', 'touchstart', 'wheel', 'keydown', 'beforeinput']) {
  document.addEventListener(event, stopRestoring, {
    capture: true,
    passive: true
  });
}
for (const area of [source, large]) {
  area.addEventListener('scroll', rememberEditor, {
    passive: true
  });
  area.addEventListener('select', rememberEditor);
}
window.addEventListener('scroll', rememberEditor, {
  passive: true
});
document.addEventListener('visibilitychange', () => {
  if (document.hidden) {
    saveEditorPosition();
    stopRestoring();
  } else restoreEditorPosition();
});
window.addEventListener('pagehide', saveEditorPosition);
window.addEventListener('pageshow', restoreEditorPosition);
editor.addEventListener('close', rememberEditor);
$('expand').addEventListener('click', rememberEditor);
$('mobileTabs').addEventListener('click', rememberEditor);
$('typography').addEventListener('toggle', rememberEditor);
if ('scrollRestoration' in history) history.scrollRestoration = 'manual';

bgControls();
updateOutputs();
restoreDraft();
readBlocks();
document.fonts.ready.then(() => {
  if (resumePosition && restoringPosition) restoreEditorPosition();
});
