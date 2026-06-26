// Prevent duplicate native file picker dialogs in the restored 3D RVM tab.
//
// The restored Load control is a <label> containing the hidden file input, while
// the tab also delegates clicks on .rvm-btn-file and calls fileInput.click().
// One user click can therefore trigger both the native label/input activation
// and the delegated JS activation. This capture-phase guard makes the load
// action a singleton without changing the restored tab markup.

const FLAG = '__RVM_FILE_DIALOG_SINGLETON_V1__';

if (typeof window !== 'undefined' && !window[FLAG]) {
  window[FLAG] = true;
  let lastDialogAt = 0;

  document.addEventListener('click', (event) => {
    const target = event.target;
    if (!(target instanceof Element)) return;

    const fileInput = document.getElementById('rvm-file-input');
    if (!fileInput) return;

    // A programmatic fileInput.click() also dispatches a click event on the
    // input. Let the browser handle it, but stop it from reaching the restored
    // tab's delegated .rvm-btn-file handler and recursively opening again.
    if (target === fileInput || target.closest?.('#rvm-file-input')) {
      event.stopPropagation();
      event.stopImmediatePropagation?.();
      return;
    }

    const loadButton = target.closest?.('.rvm-btn-file');
    if (!loadButton) return;

    event.preventDefault();
    event.stopPropagation();
    event.stopImmediatePropagation?.();

    const now = performance.now();
    if (now - lastDialogAt < 800) return;
    lastDialogAt = now;

    // Resetting value lets the user pick the same UXML/JSON again and still
    // receive a change event after cancelling/reopening.
    fileInput.value = '';
    fileInput.click();
  }, true);
}
