import { useCallback, useEffect, useRef, useState } from "react";

import { decodeImageFile, validatePicture } from "./cropper";
import { resolvePictureUrl, saveProfilePicture } from "./pictureClient";

/**
 * Owns the whole change-picture flow: pick, crop, save to the ERP, then show the
 * new avatar. It lives at the top of MyProfileExperience because the desktop and
 * mobile layouts are both mounted at once (only CSS hides one), so they have to
 * share this state rather than each keep their own.
 */
export function useProfilePicture({ imageUrl, baseUrl, user, employee, endpointKey, onChange }) {
  const initialUrl = resolvePictureUrl(imageUrl, baseUrl);

  const [pictureUrl, setPictureUrl] = useState(initialUrl);
  const [image, setImage] = useState(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  // A saved picture must survive the next profile refetch handing back the old
  // URL, so the prop only wins until the first successful save.
  const savedRef = useRef(false);
  const decodedRef = useRef(null);

  useEffect(() => {
    if (savedRef.current) return;
    setPictureUrl(resolvePictureUrl(imageUrl, baseUrl));
  }, [imageUrl, baseUrl]);

  const releaseImage = useCallback(() => {
    decodedRef.current?.release?.();
    decodedRef.current = null;
    setImage(null);
  }, []);

  useEffect(() => releaseImage, [releaseImage]);

  const canEdit = Boolean(String(user || "").trim());

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
        const result = await saveProfilePicture({
          dataUrl,
          user: String(user || "").trim(),
          employee: String(employee || "").trim(),
          endpointKey: String(endpointKey || "").trim(),
        });

        savedRef.current = true;
        setPictureUrl(result.fileUrl);
        setNotice(result.warning || "Profile picture updated in the ERP.");
        releaseImage();
        onChange?.(result.fileUrl);
      } catch (saveError) {
        setError(saveError?.message || "The picture could not be saved.");
      } finally {
        setSaving(false);
      }
    },
    [user, employee, endpointKey, onChange, releaseImage]
  );

  // The confirmation is transient; an error stays until the next attempt.
  useEffect(() => {
    if (!notice) return undefined;
    const timer = setTimeout(() => setNotice(""), 6000);
    return () => clearTimeout(timer);
  }, [notice]);

  return { pictureUrl, image, saving, error, notice, canEdit, pick, cancel, save };
}
