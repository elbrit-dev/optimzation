"use client";

import { useState } from "react";
import { Button } from "@calendar/components/ui/button";
import { toast } from "sonner";
import { Trash2 } from "lucide-react";
import { format, isValid, parseISO } from "date-fns";
import Tiptap from "@calendar/components/calendar/module/todo/components/TodoWysiwyg";

import { addLeadNote, deleteLeadNote } from "@calendar/components/calendar/module/event/services/event.service";
import { clearParticipantCache } from "@calendar/lib/data-cache";
import { fetchDoctorById } from "@calendar/components/calendar/module/event/services/master-data.service";

export function DoctorNotesSection({
  doctorId,
  notes = [],
  setDoctorOptions,
}) {
  const [showEditor, setShowEditor] = useState(false);
  const [newNote, setNewNote] = useState("");

  // Refresh ONLY this doctor (fresh, with the just-saved/deleted note) and merge
  // it in — don't replace the whole list with the capped fetchDoctors() slice,
  // which may not even contain this doctor, leaving the new note invisible.
  const refreshDoctors = async () => {
    if (!doctorId) return;
    clearParticipantCache("DOCTOR");
    const doctors = await fetchDoctorById(doctorId);
    if (!doctors.length) return;
    setDoctorOptions((current) => {
      const optionMap = new Map();
      [...(current ?? []), ...doctors].forEach((option) => {
        if (option?.value) optionMap.set(option.value, option);
      });
      return Array.from(optionMap.values());
    });
  };

  /* ================= ADD NOTE ================= */

  const handleSaveNote = async () => {
    try {
      await addLeadNote(doctorId, newNote);

      toast.success("Note added");

      await refreshDoctors();

      setShowEditor(false);
      setNewNote("");
    } catch (err) {
      console.error(err);
      toast.error("Failed to save note");
    }
  };

  /* ================= DELETE NOTE ================= */

  const handleDeleteNote = async (noteName) => {
    try {
      await deleteLeadNote(doctorId, noteName);
  
      toast.success("Note deleted");
  
      await refreshDoctors();
    } catch (err) {
      console.error(err);
      toast.error("Failed to delete note");
    }
  };

  const formatNoteDateTime = (value) => {
    if (!value) return "";

    const parsed =
      value instanceof Date ? value : parseISO(String(value));

    if (!isValid(parsed)) return "";

    return format(parsed, "dd/MM/yyyy, hh:mm a");
  };

  return (
    <div className="space-y-3">
      <div className="flex justify-between items-center">
        <p className="text-sm font-medium">Notes</p>

        <Button type="button"
          variant="outline"
          size="sm"
          onClick={() => setShowEditor(true)}
        >
          + Add
        </Button>
      </div>

      {notes.map((noteObj, index) => {
        const formattedDate = formatNoteDateTime(noteObj.creation);
        return (
          <div
            key={index}
            className="rounded-md border p-3 text-sm space-y-2 relative"
          >
            {/* DELETE ICON */}
            <Trash2
              className="absolute right-2 top-2 h-4 w-4 text-muted-foreground cursor-pointer hover:text-red-600"
              onClick={() => handleDeleteNote(noteObj.name)}
            />

            {formattedDate && (
              <div className="text-xs text-muted-foreground">
                {formattedDate}
              </div>
            )}

            <div
              dangerouslySetInnerHTML={{ __html: noteObj.note }}
            />
          </div>
        );
      })}

      {showEditor && (
        <div className="space-y-2 border rounded-md p-3">
          <Tiptap content={newNote} onChange={setNewNote} />

          <div className="flex justify-end gap-2">
            <Button type="button"
              variant="ghost"
              onClick={() => {
                setShowEditor(false);
                setNewNote("");
              }}
            >
              Cancel
            </Button>

            <Button type="button" onClick={handleSaveNote}>Save</Button>
          </div>
        </div>
      )}
    </div>
  );
}
