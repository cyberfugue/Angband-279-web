/* File: main-web.c */
/* Purpose: Emscripten/WebAssembly terminal driver for Angband */

#include "angband.h"

#ifdef USE_WEB

#include <emscripten.h>

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
    printf("\033[%d;%dH", y + 1, x + 1);
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
            printf("\033[2J\033[H");
            fflush(stdout);
            curx = cury = 0;
            return (0);

        case TERM_XTRA_NOISE:
            printf("\007");
            fflush(stdout);
            return (0);

        case TERM_XTRA_SHAPE:
            /* cursor visibility -- no-op in web driver */
            return (0);

        case TERM_XTRA_ALIVE:
            /* suspend/resume -- no-op in web driver */
            return (0);

        case TERM_XTRA_EVENT:
            return (Term_xtra_web_event(v));

        case TERM_XTRA_FLUSH:
            /* Drain queued keystrokes. */
            js_flush_input();
            return (0);

        case TERM_XTRA_FRESH:
            fflush(stdout);
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
    int i;

    Term_curs_web(x, y);
    printf(COLOR_RESET);

    if (x + n >= 80)
    {
        /* Erase to end of line. */
        printf("\033[K");
    }
    else
    {
        for (i = 0; i < n; i++) putchar(' ');
        curx += n;
    }

    fflush(stdout);
    return (0);
}


/*
 * Term_text_web -- draw n characters of string s at (x, y) with attribute a.
 */
static errr Term_text_web(int x, int y, int n, byte a, cptr s)
{
    int i;
    byte attr = a & 0x0F; /* low 4 bits are colour index */

    Term_curs_web(x, y);
    printf("%s", ansi_fg[attr]);

    for (i = 0; i < n && s[i]; i++)
    {
        putchar((unsigned char)s[i]);
        if (++curx >= 80) { curx = 0; cury++; }
    }

    printf(COLOR_RESET);
    fflush(stdout);
    return (0);
}


static term term_screen_body;

static void Term_init_web(term *t)
{
    printf("\033[2J\033[H");
    fflush(stdout);
}

static void Term_nuke_web(term *t)
{
    printf(COLOR_RESET "\033[2J\033[H");
    fflush(stdout);
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

#endif /* USE_WEB */
