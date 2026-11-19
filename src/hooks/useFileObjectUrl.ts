import { useEffect, useMemo } from "react";

/**
 * Derives a revocable object URL for a staged File without setting React state inside an effect.
 */
export function useFileObjectUrl(file: File | null): string | null {
  const url = useMemo(() => (file ? URL.createObjectURL(file) : null), [file]);

  useEffect(() => {
    if (!url) return;
    return () => {
      URL.revokeObjectURL(url);
    };
  }, [url]);

  return url;
}
