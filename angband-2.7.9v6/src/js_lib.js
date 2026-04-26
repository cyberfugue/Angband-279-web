/* js_lib.js -- Emscripten JS library for the Angband web terminal driver */

mergeInto(LibraryManager.library, {

  /*
   * js_getchar -- blocking keypress read.
   *
   * The __async suffix tells Emscripten that this function may suspend
   * execution via Asyncify.  When no key is queued the call parks until
   * the browser delivers one via term.onData(), then resumes C execution.
   */
  js_getchar__async: true,
  js_getchar: function () {
    return Asyncify.handleSleep(function (wakeUp) {
      if (Module._keyQueue && Module._keyQueue.length > 0) {
        wakeUp(Module._keyQueue.shift());
      } else {
        Module._keyWaiter = wakeUp;
      }
    });
  },

  /*
   * js_flush_input -- discard all pending keystrokes without blocking.
   * Called for TERM_XTRA_FLUSH (e.g. before important prompts).
   */
  js_flush_input: function () {
    if (Module._keyQueue) Module._keyQueue.length = 0;
    /* Leave _keyWaiter intact -- it will wake up on the next real key. */
  },

});
