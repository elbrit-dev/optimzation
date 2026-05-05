"use client";

import { useEditor, EditorContent } from "@tiptap/react";
import { useEffect } from "react";
import StarterKit from "@tiptap/starter-kit";
import Highlight from "@tiptap/extension-highlight";
import TaskList from "@tiptap/extension-task-list";
import TaskItem from "@tiptap/extension-task-item";
import BulletList from "@tiptap/extension-bullet-list";
import OrderedList from "@tiptap/extension-ordered-list";
import ListItem from "@tiptap/extension-list-item";

export default function TiptapViewer({ content }) {
  const editor = useEditor({
    editable: false,
    extensions: [
      StarterKit.configure({
        bulletList: false,
        orderedList: false,
        listItem: false,
      }),
      BulletList,
      OrderedList,
      ListItem,
      Highlight.configure({ multicolor: true }),
      TaskList,
      TaskItem.configure({ nested: true }),
    ],
    editorProps: {
      attributes: {
        class:
          "prose dark:prose-invert prose-sm sm:prose-base max-w-none " +
          "prose-ul:list-disc prose-ul:pl-6 " +
          "prose-ol:list-decimal prose-ol:pl-6 " +
          "prose-li:marker:text-foreground",
      },
    },
    content: content || "<p></p>",
    immediatelyRender: false,
  });

  // Update content when event changes
  useEffect(() => {
    if (editor && content) {
      editor.commands.setContent(content);
    }
  }, [editor, content]);

  // Destroy editor on unmount (important for dialogs)
  useEffect(() => {
    return () => {
      if (editor) {
        editor.destroy();
      }
    };
  }, [editor]);

  if (!content) {
    return (
      <div className="text-muted-foreground">
        No description
      </div>
    );
  }

  return <EditorContent editor={editor} />;
}