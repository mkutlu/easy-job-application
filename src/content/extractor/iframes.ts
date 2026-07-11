// Same-origin iframes are directly reachable (same JS realm) via
// `.contentDocument`; cross-origin ones throw or return null under the
// browser's same-origin policy. We recurse so a same-origin iframe nested
// inside another same-origin iframe is still reached.
export function collectAccessibleDocuments(root: Document): {
  documents: Document[];
  crossOriginIframeCount: number;
} {
  const documents: Document[] = [root];
  let crossOriginIframeCount = 0;

  function recurse(doc: Document) {
    const frames = doc.querySelectorAll("iframe");
    frames.forEach((frame) => {
      let frameDoc: Document | null = null;
      try {
        frameDoc = frame.contentDocument;
      } catch {
        frameDoc = null;
      }
      if (frameDoc) {
        documents.push(frameDoc);
        recurse(frameDoc);
      } else {
        crossOriginIframeCount++;
      }
    });
  }

  recurse(root);
  return { documents, crossOriginIframeCount };
}
