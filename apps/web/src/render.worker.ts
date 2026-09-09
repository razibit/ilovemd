import { renderDocument, type DocumentSnapshot } from "@folio/engine";
self.onmessage = async (event: MessageEvent<{ snapshot: DocumentSnapshot; requestKey: string }>) => {
  const { snapshot, requestKey } = event.data;
  try {
    self.postMessage({
      requestKey,
      revision: snapshot.revision,
      result: await renderDocument(snapshot),
    });
  } catch (e) {
    self.postMessage({ requestKey, revision: snapshot.revision, error: String(e) });
  }
};
