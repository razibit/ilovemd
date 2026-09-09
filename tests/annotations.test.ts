import { test } from "node:test";
import assert from "node:assert/strict";
import {
  annotationSvg,
  bounds,
  moveAnnotation,
  validateAnnotations,
  type AnnotationSet,
} from "../packages/engine/src/annotations";
import { anchoredScroll } from "../apps/web/src/usePreviewNavigation";
import { defaultSettings } from "../packages/engine/src/types";
test("annotation transforms preserve geometry and reject unsafe export input", () => {
  const snapshot = {
    id: "a",
    revision: 1,
    source: "# Test",
    assets: {},
    settings: defaultSettings,
  };
  const set: AnnotationSet = {
    schema: 1,
    id: "s",
    documentId: "a",
    revision: 1,
    version: "v",
    snapshot,
    layout: {
      width: 760,
      height: 400,
      fontSize: 16,
      lineHeight: 1.8,
      padding: [35, 38, 45, 38],
      theme: "light",
    },
    objects: [
      {
        id: "r",
        tool: "rectangle",
        points: [
          { x: 10, y: 20 },
          { x: 110, y: 70 },
        ],
        color: "#123456",
        width: 3,
        opacity: 0.25,
      },
    ],
  };
  assert.deepEqual(bounds(moveAnnotation(set.objects[0], 20, 30)), {
    x: 30,
    y: 50,
    width: 100,
    height: 50,
  });
  assert.match(annotationSvg(set.objects[0]), /opacity="0.25"/);
  validateAnnotations(set, snapshot);
  validateAnnotations(
    { ...set, layout: { ...set.layout, mediaWidth: 1 } },
    snapshot,
  );
  assert.throws(() =>
    validateAnnotations({ ...set, documentId: "other" }, snapshot),
  );
  assert.throws(() =>
    validateAnnotations(
      {
        ...set,
        objects: [{ ...set.objects[0], color: 'red" onload="alert(1)' }],
      },
      snapshot,
    ),
  );
  assert.throws(() =>
    validateAnnotations(
      { ...set, objects: [{ ...set.objects[0], points: [{ x: NaN, y: 1 }] }] },
      snapshot,
    ),
  );
  assert.equal(anchoredScroll(100, 200, 100, 200), 400);
});
