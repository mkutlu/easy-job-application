// Recursively visits a document/shadow-root and every *open* shadow root
// nested inside it (some ATSs, e.g. Workday, build their forms out of web
// components). Closed shadow roots are unreachable by design in the
// platform -- there's no workaround, so they're simply not visited.
export function walkAllRoots(
  root: Document | ShadowRoot,
  visitRoot: (root: Document | ShadowRoot) => void,
): void {
  visitRoot(root);
  const all = root.querySelectorAll("*");
  all.forEach((el) => {
    const shadow = el.shadowRoot;
    if (shadow) walkAllRoots(shadow, visitRoot);
  });
}
