"use client";

import { useEffect, useState } from "react";
import { fetchTodoComments, saveTodoComment } from "@calendar/services/event.service";
import { getInitials } from "@calendar/lib/helper";
import { LOGGED_IN_USER } from "../auth/calendar-users";

export default function TodoComments({ todoName }) {
    const [comments, setComments] = useState([]);
    const [text, setText] = useState("");

    useEffect(() => {
        if (!todoName) return;
        fetchTodoComments(todoName).then(setComments);
    }, [todoName]);

    const handleSubmit = async (e) => {
        e.preventDefault();

        if (!text.trim()) return;

        const doc = {
            comment_type: "Comment",
            reference_doctype: "ToDo",
            reference_name: todoName,
            comment_email: LOGGED_IN_USER.email,
            comment_by: LOGGED_IN_USER.name,
            content: `<div class="ql-editor read-mode"><p>${text}</p></div>`,
        };

        await saveTodoComment(doc);

        setText("");

        const updated = await fetchTodoComments(todoName);
        setComments(updated);
    };

    return (
        <div className="space-y-4">

            {/* COMMENTS INPUT */}
            <div className="flex gap-3 items-start">

                {/* Avatar */}
                <div className="w-7 h-7 rounded-full bg-purple-200 text-purple-700 flex items-center justify-center text-xs font-semibold">
                    {getInitials(LOGGED_IN_USER.name)}
                </div>

                <div className="flex-1 space-y-2">

                    {/* Input */}
                    <input
                        value={text}
                        onChange={(e) => setText(e.target.value)}
                        placeholder="Type a reply / comment"
                        className="w-full border rounded-md px-3 py-1 text-sm bg-muted"
                    />

                    {/* COMMENT BUTTON */}
                    {text.trim() && (
                        <div className="flex justify-end">
                            <button
                                type="button"
                                onClick={handleSubmit}
                                className="px-3 py-1 text-sm bg-primary text-white rounded-md hover:opacity-90"
                            >
                                Comment
                            </button>
                        </div>
                    )}

                </div>
            </div>

            {/* ACTIVITY */}
            <div className="mt-4">
                <h3 className="text-sm font-semibold mb-3">Activity</h3>

                <div className="space-y-4">

                    {comments.map((c) => (
                        <div key={c.name} className="flex gap-3">

                            {/* Timeline column */}
                            <div className="flex flex-col items-center">
                                <div className="w-7 h-7 rounded-full bg-purple-200 text-purple-700 flex items-center justify-center text-xs font-semibold">
                                    {getInitials(c.comment_by)}
                                </div>

                                <div className="w-px bg-border flex-1 mt-1" />
                            </div>

                            {/* Content */}
                            <div className="flex-1">

                                {/* Header */}
                                <div className="text-xs text-muted-foreground mb-1">
                                    <span className="font-medium text-foreground">
                                        {c.comment_by}
                                    </span>{" "}
                                    commented · just now
                                </div>

                                {/* Text */}
                                <div
                                    className="text-sm text-foreground"
                                    dangerouslySetInnerHTML={{
                                        __html: c.content,
                                    }}
                                />

                            </div>

                        </div>
                    ))}

                </div>
            </div>

        </div>
    );
}