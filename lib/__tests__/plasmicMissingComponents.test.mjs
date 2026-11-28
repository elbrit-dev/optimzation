// node --test lib/__tests__/plasmicMissingComponents.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { fillMissingCodeComponents, MissingCodeComponent } from "../plasmicMissingComponents.js";

test("only unregistered code components get the stand-in", () => {
  const Registered = () => null;
  const components = { a: Registered };
  const filled = fillMissingCodeComponents(components, [
    { id: "a", name: "RingNav", isCode: true },
    { id: "b", name: "SurveyHome", displayName: "Surveys", isCode: true },
    { id: "c", name: "Homepage", isCode: false },
  ]);
  assert.deepEqual(filled, ["Surveys"]);
  assert.equal(components.a, Registered);
  assert.equal(components.b, MissingCodeComponent);
  assert.equal(components.c, undefined);
});

test("stand-in draws slot content and drops plain props", () => {
  const html = renderToStaticMarkup(
    React.createElement(MissingCodeComponent, {
      className: "x",
      gqlToken: "secret",
      homeContent: React.createElement("p", null, "Home Overview"),
      children: [React.createElement("b", { key: 1 }, "kid")],
    })
  );
  assert.equal(html, "<p>Home Overview</p><b>kid</b>");
});

test("stand-in with no slots draws nothing", () => {
  assert.equal(renderToStaticMarkup(React.createElement(MissingCodeComponent, { ariaLabel: "x" })), "");
});
