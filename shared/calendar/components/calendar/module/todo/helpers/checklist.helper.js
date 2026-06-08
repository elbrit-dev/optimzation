export const CHECKLIST = {
    TASK_ITEM: "taskItem",
    TASK_LIST: "taskList",
  
    CHECKED: "checked",
    UNCHECKED: "unchecked",
  
    DATA_TYPE: "data-type",
    DATA_CHECKED: "data-checked",
    DATA_LIST: "data-list",
  
    QUILL_EDITOR_CLASS: "ql-editor read-mode",
    QUILL_UI_CLASS: "ql-ui",
  };

export function normalizeChecklistToERP(html = "") {
  if (!html) return "";

  const parser = new DOMParser();
  const doc = parser.parseFromString(html, "text/html");
  const root = doc.body;

  root
    .querySelectorAll(
      `li[${CHECKLIST.DATA_TYPE}="${CHECKLIST.TASK_ITEM}"]`
    )
    .forEach((li) => {
      const checked =
        li.getAttribute(CHECKLIST.DATA_CHECKED) ===
        "true";

      li.removeAttribute(CHECKLIST.DATA_TYPE);
      li.removeAttribute(CHECKLIST.DATA_CHECKED);

      li.setAttribute(
        CHECKLIST.DATA_LIST,
        checked
          ? CHECKLIST.CHECKED
          : CHECKLIST.UNCHECKED
      );

      const span = document.createElement("span");

      span.className = CHECKLIST.QUILL_UI_CLASS;
      span.setAttribute(
        "contenteditable",
        "false"
      );

      const p = li.querySelector("p");

      if (p) {
        li.innerHTML = "";
        li.appendChild(span);
        li.innerHTML += p.innerHTML;
      } else {
        li.prepend(span);
      }
    });

  root
    .querySelectorAll(
      `ul[${CHECKLIST.DATA_TYPE}="${CHECKLIST.TASK_LIST}"]`
    )
    .forEach((ul) => {
      const ol = document.createElement("ol");

      ol.innerHTML = ul.innerHTML;
      ul.replaceWith(ol);
    });

  return `<div class="${CHECKLIST.QUILL_EDITOR_CLASS}">${root.innerHTML}</div>`;
}

export function normalizeChecklistFromERP(html = "") {
  if (!html) return "";

  const parser = new DOMParser();
  const doc = parser.parseFromString(html, "text/html");

  const wrapper = doc.querySelector(".ql-editor");
  const root = wrapper || doc.body;

  root
    .querySelectorAll(
      `li[${CHECKLIST.DATA_LIST}]`
    )
    .forEach((li) => {
      const checked =
        li.getAttribute(CHECKLIST.DATA_LIST) ===
        CHECKLIST.CHECKED;

      li.removeAttribute(CHECKLIST.DATA_LIST);

      li.setAttribute(
        CHECKLIST.DATA_TYPE,
        CHECKLIST.TASK_ITEM
      );

      li.setAttribute(
        CHECKLIST.DATA_CHECKED,
        checked ? "true" : "false"
      );

      const span = li.querySelector(
        `.${CHECKLIST.QUILL_UI_CLASS}`
      );

      if (span) span.remove();

      if (!li.querySelector("p")) {
        const p = document.createElement("p");

        p.innerHTML = li.innerHTML;

        li.innerHTML = "";
        li.appendChild(p);
      }
    });

  root.querySelectorAll("ol").forEach((ol) => {
    const hasTaskItems = ol.querySelector(
      `li[${CHECKLIST.DATA_TYPE}="${CHECKLIST.TASK_ITEM}"]`
    );

    if (!hasTaskItems) return;

    const ul = document.createElement("ul");

    ul.setAttribute(
      CHECKLIST.DATA_TYPE,
      CHECKLIST.TASK_LIST
    );

    ul.innerHTML = ol.innerHTML;

    ol.replaceWith(ul);
  });

  return root.innerHTML;
}