// The first-load intro's pre-paint decision. Plain module (no React): the server
// layout inlines PRE_PAINT in <head>, so it runs before the first paint.

export const INTRO_KEY = "rt.intro.seen";

/**
 * Sets html[data-intro] to "play" or "skip". A returning visitor, a reduced-motion
 * setting or a deep link (#film) skips the intro. Kept as a string: it must not wait for React.
 */
export const PRE_PAINT = `try{var d=document.documentElement,s=localStorage.getItem("${INTRO_KEY}")==="1",r=matchMedia("(prefers-reduced-motion: reduce)").matches;d.dataset.intro=(s||r||location.hash)?"skip":"play"}catch(e){document.documentElement.dataset.intro="skip"}`;
