/* File: main-web.c */
/* Purpose: Emscripten/WebAssembly terminal driver for Angband */

#include "angband.h"

#ifdef USE_WEB

#include <emscripten.h>
#include <sys/stat.h>
#include <string.h>

/*
 * ANSI colour sequences for Angband's 16 colour indices.
 * The terminal background is always black.
 */
static const char *ansi_fg[16] = {
    "\033[30m",     /*  0  TERM_DARK    black         */
    "\033[37m",     /*  1  TERM_WHITE   white         */
    "\033[37;2m",   /*  2  TERM_SLATE   dim white     */
    "\033[33m",     /*  3  TERM_ORANGE  yellow        */
    "\033[31m",     /*  4  TERM_RED                   */
    "\033[32m",     /*  5  TERM_GREEN                 */
    "\033[34m",     /*  6  TERM_BLUE                  */
    "\033[33;2m",   /*  7  TERM_UMBER   dim yellow    */
    "\033[90m",     /*  8  TERM_L_DARK  dark grey     */
    "\033[97m",     /*  9  TERM_L_WHITE bright white  */
    "\033[35m",     /* 10  TERM_VIOLET  magenta       */
    "\033[93m",     /* 11  TERM_YELLOW  bright yellow */
    "\033[91m",     /* 12  TERM_L_RED   bright red    */
    "\033[92m",     /* 13  TERM_L_GREEN bright green  */
    "\033[94m",     /* 14  TERM_L_BLUE  bright blue   */
    "\033[33m",     /* 15  TERM_L_UMBER yellow        */
};

#define COLOR_RESET "\033[0m"

static int curx = 0;
static int cury = 0;

/*
 * js_write_buf -- write raw bytes directly to xterm.js, bypassing the TTY.
 * This avoids all libc/Emscripten buffering: the bytes arrive at term.write()
 * in the same call that flushes them from C.
 */
EM_JS(void, js_write_buf, (const char *buf, int len), {
    if (!Module.termWrite) return;
    var bytes = new Uint8Array(HEAPU8.buffer, buf, len);
    var str = new TextDecoder('utf-8').decode(bytes);
    Module.termWrite(str);
});

/* Convenience wrapper for NUL-terminated strings */
static void web_puts(const char *s)
{
    js_write_buf(s, strlen(s));
}

/*
 * js_getchar -- blocking keypress read via Asyncify.
 * Implemented in js_lib.js; returns the char code of the next key.
 */
extern int js_getchar(void);

/*
 * js_flush_input -- drain the JavaScript key queue without blocking.
 */
extern void js_flush_input(void);


/* Move hardware cursor to column x, row y (both 0-based). */
static void do_cm(int x, int y)
{
    char buf[32];
    int n = snprintf(buf, sizeof(buf), "\033[%d;%dH", y + 1, x + 1);
    js_write_buf(buf, n);
}


/*
 * Term_xtra_web_event -- wait for (v != 0) or poll (v == 0) for a keypress.
 */
static errr Term_xtra_web_event(int v)
{
    if (v)
    {
        /* Blocking: suspend via Asyncify until a key arrives. */
        int c = js_getchar();
        if (c <= 0) return (1);
        Term_keypress(c);
        return (0);
    }

    /* Non-blocking: always report "no key ready". */
    return (1);
}


/*
 * Term_xtra_web -- handle special terminal requests.
 */
static errr Term_xtra_web(int n, int v)
{
    switch (n)
    {
        case TERM_XTRA_CLEAR:
            web_puts("\033[2J\033[H");
            curx = cury = 0;
            return (0);

        case TERM_XTRA_NOISE:
            web_puts("\007");
            return (0);

        case TERM_XTRA_SHAPE:
            return (0);

        case TERM_XTRA_ALIVE:
            return (0);

        case TERM_XTRA_EVENT:
            return (Term_xtra_web_event(v));

        case TERM_XTRA_FLUSH:
            js_flush_input();
            return (0);

        case TERM_XTRA_FRESH:
            /* Output is immediate (no C-level buffering), nothing to do. */
            return (0);
    }

    return (1);
}


/*
 * Term_curs_web -- move the hardware cursor to (x, y).
 */
static errr Term_curs_web(int x, int y)
{
    do_cm(x, y);
    curx = x;
    cury = y;
    return (0);
}


/*
 * Term_wipe_web -- erase n cells starting at (x, y).
 */
static errr Term_wipe_web(int x, int y, int n)
{
    char spaces[82];

    Term_curs_web(x, y);
    web_puts(COLOR_RESET);

    if (x + n >= 80)
    {
        web_puts("\033[K");
    }
    else
    {
        int count = (n < 80) ? n : 80;
        memset(spaces, ' ', count);
        js_write_buf(spaces, count);
        curx += count;
    }

    return (0);
}


/*
 * Term_text_web -- draw n characters of string s at (x, y) with attribute a.
 */
static errr Term_text_web(int x, int y, int n, byte a, cptr s)
{
    int i;
    byte attr = a & 0x0F;

    Term_curs_web(x, y);
    web_puts(ansi_fg[attr]);

    for (i = 0; i < n && s[i]; i++)
    {
        char c = (char)(unsigned char)s[i];
        js_write_buf(&c, 1);
        if (++curx >= 80) { curx = 0; cury++; }
    }

    web_puts(COLOR_RESET);
    return (0);
}


static term term_screen_body;

static void Term_init_web(term *t)
{
    web_puts("\033[2J\033[H");
}

static void Term_nuke_web(term *t)
{
    web_puts(COLOR_RESET "\033[2J\033[H");
}


/*
 * init_web -- set up and activate the WebAssembly terminal driver.
 */
errr init_web(void)
{
    term *t = &term_screen_body;

    term_init(t, 80, 24, 1024);

    t->soft_cursor = TRUE;
    t->icky_corner = TRUE;
    t->attr_blank  = TERM_DARK;
    t->char_blank  = ' ';

    t->init_hook = Term_init_web;
    t->nuke_hook = Term_nuke_web;
    t->xtra_hook = Term_xtra_web;
    t->curs_hook = Term_curs_web;
    t->wipe_hook = Term_wipe_web;
    t->text_hook = Term_text_web;

    Term_activate(t);

    return (0);
}


/*
 * web_main -- entry point called from JavaScript.
 * Creates the data directory (needed for first-run .raw file generation)
 * and provides a valid argv so main() doesn't dereference a null argv[0].
 */
void web_main(void)
{
    static char prog_name[] = "angband";
    static char *fake_argv[] = { prog_name, NULL };
    extern int main(int, char **);

    /* Create the data directory for generated .raw files. */
    mkdir("/lib/data", 0755);

    main(1, fake_argv);
}

#endif /* USE_WEB */
