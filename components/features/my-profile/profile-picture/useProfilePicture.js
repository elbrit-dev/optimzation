import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { decodeImageFile, validatePicture } from "./cropper";
import { fetchProfilePicture, resolvePictureUrl, saveProfilePicture } from "./pictureClient";

/**
 * Owns the whole change-picture flow: read what the ERP holds, pick, crop, save,
 * then show the result. It lives at the top of MyProfileExperience because the
 * desktop and mobile layouts are both mounted at once (only CSS hides one), so
 * they have to share this state rather than each keep their own.
 *
 * The displayed URL comes from three places, most-authoritative first:
 *   savedUrl - what this session just wrote, until a read confirms it
 *   erpUrl   - what the ERP reports, fetched here so no prop has to supply it
 *   propUrl  - profile.employee.imageUrl, if a query happens to bind one
 */
export function useProfilePicture({ imageUrl, baseUrl, user, employee, endpointKey, onChange }) {
  const [erpUrl, setErpUrl] = useState("");
  const [savedUrl, setSavedUrl] = useState("");
  const [image, setImage] = useState(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const decodedRef = useRef(null);
  // Read inside the focus listener, which is registered once and would
  // otherwise close over a stale `saving`.
  const savingRef = useRef(false);
  useEffect(() => {
    savingRef.current = saving;
  }, [saving]);

  const target = useMemo(
    () => ({
      user: String(user || "").trim(),
      employee: String(employee || "").trim(),
      endpointKey: String(endpointKey || "").trim(),
    }),
    [user, employee, endpointKey]
  );

  const propUrl = resolvePictureUrl(imageUrl, baseUrl);
  const pictureUrl = savedUrl || erpUrl || propUrl;
  const canEdit = Boolean(target.user);

  /**
   * Pulls the current picture from the ERP. A failure here is deliberately
   * quiet - the avatar just keeps showing initials rather than putting a
   * network error in front of someone who only opened their profile.
   */
  const refresh = useCallback(
    async (signal) => {
      if (!target.user) return;

      try {
        const fileUrl = await fetchProfilePicture({ ...target, signal });
        if (signal?.aborted) return;

        setErpUrl(fileUrl);
        // The ERP now reports our own write back to us, so the local copy has
        // done its job. An empty answer leaves it alone, in case a read races
        // ahead of a save that has only just landed.
        if (fileUrl) setSavedUrl("");
      } catch (fetchError) {
        if (fetchError?.name === "AbortError") return;
        console.error("Profile picture: could not read the ERP picture", fetchError);
      }
    },
    [target]
  );

  // On mount, and whenever the profile points at a different ERP user.
  useEffect(() => {
    const controller = new AbortController();
    setErpUrl("");
    refresh(controller.signal);
    return () => controller.abort();
  }, [refresh]);

  // A picture changed directly in the ERP shows up on the next return to the
  // tab, so it appears without a page reload and without polling the ERP.
  useEffect(() => {
    if (!target.user) return undefined;

    const onWake = () => {
      if (document.visibilityState === "hidden" || savingRef.current) return;
      refresh();
    };

    window.addEventListener("focus", onWake);
    document.addEventListener("visibilitychange", onWake);
    return () => {
      window.removeEventListener("focus", onWake);
      document.removeEventListener("visibilitychange", onWake);
    };
  }, [refresh, target.user]);

  const releaseImage = useCallback(() => {
    decodedRef.current?.release?.();
    decodedRef.current = null;
    setImage(null);
  }, []);

  useEffect(() => releaseImage, [releaseImage]);

  const pick = useCallback(
    async (file) => {
      setNotice("");

      if (!canEdit) {
        setError("This profile has no ERP user id, so the picture cannot be changed here.");
        return;
      }

      const invalid = validatePicture(file);
      if (invalid) {
        setError(invalid);
        return;
      }

      setError("");
      try {
        const decoded = await decodeImageFile(file);
        releaseImage();
        decodedRef.current = decoded;
        setImage(decoded);
      } catch (decodeError) {
        setError(decodeError?.message || "That image could not be opened.");
      }
    },
    [canEdit, releaseImage]
  );

  const cancel = useCallback(() => {
    releaseImage();
    setError("");
  }, [releaseImage]);

  const save = useCallback(
    async (dataUrl) => {
      setSaving(true);
      setError("");
      setNotice("");

      try {
        const result = await saveProfilePicture({ dataUrl, ...target });

        setSavedUrl(result.fileUrl);
        setNotice(result.warning || "Profile picture updated in the ERP.");
        releaseImage();
        onChange?.(result.fileUrl);
        // Confirms against the ERP rather than trusting the write blindly.
        refresh();
      } catch (saveError) {
        setError(saveError?.message || "The picture could not be saved.");
      } finally {
        setSaving(false);
      }
    },
    [target, onChange, releaseImage, refresh]
  );

  // The confirmation is transient; an error stays until the next attempt.
  useEffect(() => {
    if (!notice) return undefined;
    const timer = setTimeout(() => setNotice(""), 6000);
    return () => clearTimeout(timer);
  }, [notice]);

  return { pictureUrl, image, saving, error, notice, canEdit, pick, cancel, save };
}
