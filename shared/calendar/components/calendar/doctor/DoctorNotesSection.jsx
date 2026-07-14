"use client";

import { useState } from "react";
import { Button } from "@calendar/components/ui/button";
import { toast } from "sonner";
import { Trash2 } from "lucide-react";
import { format, isValid, parseISO } from "date-fns";
import Tiptap from "@calendar/components/ui/TodoWysiwyg";

import { addLeadNote, deleteLeadNote } from "@calendar/services/event.service";
import { clearParticipantCache } from "@calendar/lib/participants-cache";
import { fetchDoctors } from "@calendar/services/participants.service";

export function DoctorNotesSection({
  doctorId,
  notes = [],
  setDoctorOptions,
}) {
  const [showEditor, setShowEditor] = useState(false);
  const [newNote, setNewNote] = useState("");

  const refreshDoctors = async () => {
    clearParticipantCache("DOCTOR");
    const doctors = await fetchDoctors();
    setDoctorOptions(doctors);
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
