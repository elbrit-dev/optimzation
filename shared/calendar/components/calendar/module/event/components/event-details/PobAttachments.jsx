"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { Dialog } from "@/design-system";
import {
    ATTACH_ACCEPT,
    checkFile,
    fetchPobFileBlob,
    fetchPobFiles,
    fileKind,
    sizeLabel,
} from "@calendar/components/calendar/module/event/services/pob-files.service";

/*
 * The photos and PDFs on a POB, as one set for the whole POB.
 *
 * Laid out like the bills on an expense claim (expense-claims/ui.jsx: Thumb,
 * FilePreview): a tile per file with its thumbnail, a dashed tile to add more,
 * and a full-screen preview. Nothing is written here. The form that owns the
 * POB keeps `changes` ({ added: File[], removed: savedFile[] }) and hands them
 * to savePobFiles once the Quotation is saved, so Cancel leaves ERP untouched.
 */

const ICONS = {
    clip: "M20 11.5l-8.2 8.2a5 5 0 0 1-7-7L13 4.5a3.3 3.3 0 0 1 4.7 4.7l-8.2 8.2a1.7 1.7 0 0 1-2.4-2.4L14.6 7.5",
    file: "M6 3h9l4 4v14H6zM14 3v5h5",
    x: "M6 6l12 12M18 6L6 18",
    back: "M15 6l-6 6 6 6",
    next: "M9 6l6 6-6 6",
    dl: "M12 4v11M7 10l5 5 5-5M5 20h14",
};

const Icon = ({ d, size = 16 }) => (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
        <path d={d} />
    </svg>
);

const Spinner = ({ size = 16 }) => (
    <span aria-hidden className="inline-block animate-spin rounded-full border-2 border-slate-300 border-t-blue-600" style={{ width: size, height: size }} />
);

const NONE = [];

/* A picked file, shaped like a saved one. */
const localFile = (file) => ({
    id: `local:${file.name}:${file.size}:${file.lastModified}`,
    name: file.name,
    size: file.size,
    kind: file.type === "application/pdf" ? "pdf" : "image",
    local: file,
});

const blobCache = new Map();
function useFileUrl(file) {
    const [state, setState] = useState({ status: "loading" });
    useEffect(() => {
        if (!file) return undefined;
        let alive = true;
        if (file.local) {
            const url = URL.createObjectURL(file.local);
            setState({ status: "ready", url });
            return () => URL.revokeObjectURL(url);
        }
        setState({ status: "loading" });
        const hit = blobCache.get(file.url);
        const pending = hit || fetchPobFileBlob(file.url).then((blob) => URL.createObjectURL(blob));
        if (!hit) {
            blobCache.set(file.url, pending);
            pending.catch(() => blobCache.delete(file.url));
        }
        pending
            .then((url) => alive && setState({ status: "ready", url }))
            .catch((error) => alive && setState({ status: "error", error: error.message }));
        return () => {
            alive = false;
        };
    }, [file]);
    return state;
}

function FileTile({ file, onOpen, onRemove }) {
    const img = useFileUrl(file.kind === "image" ? file : null);
    return (
        <div className="flex min-w-0 items-center gap-2.5 rounded-xl bg-white p-2 shadow-[0_0_0_1px_#e4e7ec]">
            <button
                type="button"
                onClick={onOpen}
                aria-label={`Preview ${file.name}`}
                className="grid h-11 w-11 flex-none cursor-zoom-in place-items-center overflow-hidden rounded-lg bg-slate-100"
                style={{ color: file.kind === "pdf" ? "#b42318" : "#475467" }}
            >
                {file.kind === "image" && img.status === "ready" ? (
                    <img src={img.url} alt="" className="h-full w-full object-cover" />
                ) : file.kind === "image" && img.status === "loading" ? (
                    <Spinner />
                ) : file.kind === "pdf" ? (
                    <span className="text-[10px] font-extrabold">PDF</span>
                ) : (
                    <Icon d={ICONS.file} size={18} />
                )}
            </button>
            <button type="button" onClick={onOpen} className="flex min-w-0 flex-1 flex-col gap-0.5 text-left">
                <span className="truncate text-[13px] font-semibold">{file.name}</span>
                <span className="text-[11px] text-slate-400">
                    {[file.local ? "New" : null, file.kind === "pdf" ? "PDF" : file.kind === "image" ? "Photo" : "File", sizeLabel(file.size)]
                        .filter(Boolean)
                        .join(" · ")}
                </span>
            </button>
            {onRemove && (
                <button
                    type="button"
                    onClick={onRemove}
                    aria-label={`Remove ${file.name}`}
                    className="grid h-8 w-8 flex-none place-items-center rounded-lg text-[#b42318] hover:bg-slate-100"
                >
                    <Icon d={ICONS.x} size={14} />
                </button>
            )}
        </div>
    );
}

function PobFilePreview({ file, files, onClose }) {
    const [current, setCurrent] = useState(file);
    const index = files.findIndex((f) => f.id === current.id);
    const { status, url, error } = useFileUrl(current);
    const step = (by) => setCurrent(files[index + by]);
    const navButton = "absolute grid h-10 w-10 place-items-center rounded-full bg-white/15 text-white";

    return (
        <Dialog.Root open onOpenChange={(next) => { if (!next) onClose?.(); }} backName="pob-file">
            <Dialog.Portal>
                <Dialog.Backdrop style={{ background: "rgba(10,14,22,.86)" }} />
                <Dialog.Viewport style={{ padding: 0 }}>
                    <Dialog.Popup
                        aria-label={current.name}
                        onClick={onClose}
                        style={{ inlineSize: "100%", blockSize: "100%", maxInlineSize: "none", maxBlockSize: "none", borderRadius: 0, background: "transparent", boxShadow: "none", display: "flex", flexDirection: "column" }}
                    >
                        <div onClick={(e) => e.stopPropagation()} className="flex flex-none items-center gap-2.5 py-3 pl-[18px] pr-3 text-white">
                            <span className="flex min-w-0 flex-1 flex-col">
                                <span className="truncate text-sm font-semibold">{current.name}</span>
                                {files.length > 1 && (
                                    <span className="text-xs text-slate-400">
                                        {index + 1} of {files.length}
                                    </span>
                                )}
                            </span>
                            {status === "ready" && (
                                <a href={url} download={current.name} aria-label="Download" className="grid h-10 w-10 place-items-center text-white">
                                    <Icon d={ICONS.dl} size={18} />
                                </a>
                            )}
                            <button type="button" aria-label="Close preview" onClick={onClose} className="grid h-10 w-10 place-items-center text-white">
                                <Icon d={ICONS.x} size={18} />
                            </button>
                        </div>
                        <div onClick={(e) => e.stopPropagation()} className="relative flex min-h-0 flex-1 items-center justify-center px-3 pb-4">
                            {status === "loading" && <Spinner size={28} />}
                            {status === "error" && <p className="rounded-lg bg-white px-4 py-3 text-sm text-slate-600">{error}</p>}
                            {status === "ready" && current.kind === "image" && (
                                <img src={url} alt={current.name} className="max-h-full max-w-full rounded-lg bg-white object-contain" />
                            )}
                            {status === "ready" && current.kind === "pdf" && (
                                <iframe title={current.name} src={url} className="h-full w-full max-w-[900px] rounded-lg border-0 bg-white" />
                            )}
                            {status === "ready" && current.kind === "other" && (
                                <a href={url} download={current.name} className="rounded-lg bg-white px-4 py-3 text-sm font-semibold text-blue-700">
                                    Download {current.name}
                                </a>
                            )}
                            {index > 0 && (
                                <button type="button" aria-label="Previous file" onClick={() => step(-1)} className={`${navButton} left-3`}>
                                    <Icon d={ICONS.back} size={18} />
                                </button>
                            )}
                            {index >= 0 && index < files.length - 1 && (
                                <button type="button" aria-label="Next file" onClick={() => step(1)} className={`${navButton} right-3`}>
                                    <Icon d={ICONS.next} size={18} />
                                </button>
                            )}
                        </div>
                    </Dialog.Popup>
                </Dialog.Viewport>
            </Dialog.Portal>
        </Dialog.Root>
    );
}

/**
 * @param quotationName the POB's Quotation, once it exists; its saved files are listed
 * @param changes       { added, removed } kept by the owning form (editable only)
 * @param onChange      called with the next `changes`; absent = read-only
 * @param title         heading over the files; null when the host already titles it
 */
export function PobAttachments({ quotationName, changes, onChange, disabled = false, title = "Attachments", className = "" }) {
    const editable = typeof onChange === "function";
    const inputRef = useRef(null);
    const [saved, setSaved] = useState({ status: quotationName ? "loading" : "ready", files: [] });
    const [open, setOpen] = useState(null);

    useEffect(() => {
        if (!quotationName) {
            setSaved({ status: "ready", files: [] });
            return undefined;
        }
        let alive = true;
        setSaved({ status: "loading", files: [] });
        fetchPobFiles(quotationName)
            .then((files) => alive && setSaved({ status: "ready", files }))
            .catch((error) => alive && setSaved({ status: "error", files: [], error: error.message }));
        return () => {
            alive = false;
        };
    }, [quotationName]);

    const added = (editable && changes?.added) || NONE;
    const removed = (editable && changes?.removed) || NONE;
    // Memoised so a tile keeps its object URL until the picked files change.
    const addedTiles = useMemo(() => added.map(localFile), [added]);
    const removedIds = new Set(removed.map((f) => f.id));
    const files = [...saved.files.filter((f) => !removedIds.has(f.id)), ...addedTiles];

    const pick = (e) => {
        const picked = Array.from(e.target.files ?? []);
        e.target.value = "";
        if (!picked.length) return;
        const ok = [];
        for (const file of picked) {
            const problem = checkFile(file);
            if (problem) toast.error(problem);
            else ok.push(file);
        }
        if (ok.length) onChange({ added: [...added, ...ok], removed });
    };

    const remove = (file) => {
        if (file.local) {
            onChange({ added: added.filter((f) => f !== file.local), removed });
        } else {
            onChange({ added, removed: [...removed, file] });
        }
    };

    // Read-only, most POBs have no files: stay out of the way until there are some.
    if (!editable && (saved.status === "loading" || (saved.status === "ready" && !files.length))) return null;

    return (
        <div className={`space-y-2 ${className}`}>
            {title && <p className="text-sm font-medium">{title}</p>}

            {saved.status === "loading" && (
                <p className="flex items-center gap-2 text-[13px] text-slate-400">
                    <Spinner />
                    Looking for files…
                </p>
            )}
            {saved.status === "error" && (
                <p className="text-[13px] text-[#b42318]">Files could not be read — {saved.error}</p>
            )}

            {files.length > 0 && (
                <div className="grid gap-2" style={{ gridTemplateColumns: "repeat(auto-fill,minmax(200px,1fr))" }}>
                    {files.map((file) => (
                        <FileTile
                            key={file.id}
                            file={file}
                            onOpen={() => setOpen(file)}
                            onRemove={editable && !disabled ? () => remove(file) : null}
                        />
                    ))}
                </div>
            )}

            {editable && (
                <>
                    <button
                        type="button"
                        disabled={disabled}
                        onClick={() => inputRef.current?.click()}
                        className="flex h-16 w-full items-center justify-center gap-2.5 rounded-[14px] border-[1.5px] border-dashed border-[#c7cfdb] bg-[#fbfcfd] p-2.5 text-[#1d4ed8] hover:border-[#2563eb] hover:bg-[#eef3fe] disabled:opacity-50"
                    >
                        <span className="grid h-9 w-9 place-items-center rounded-[10px] bg-[#e6edfd]">
                            <Icon d={ICONS.clip} size={17} />
                        </span>
                        <span className="flex flex-col items-start gap-0.5">
                            <span className="text-[13px] font-bold">Add photo or PDF</span>
                            <span className="text-[11px] font-medium text-slate-400">The order slip, prescription or any proof · 10 MB each</span>
                        </span>
                    </button>
                    <input ref={inputRef} type="file" multiple accept={ATTACH_ACCEPT} onChange={pick} className="hidden" />
                </>
            )}

            {open && <PobFilePreview file={open} files={files} onClose={() => setOpen(null)} />}
        </div>
    );
}
