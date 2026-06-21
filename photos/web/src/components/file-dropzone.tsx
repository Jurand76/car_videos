"use client";

import clsx from "clsx";
import { useCallback } from "react";
import { useDropzone } from "react-dropzone";

type FileDropzoneProps = {
  label: string;
  hint?: string;
  onFile: (file: File) => void;
  previewUrl?: string | null;
  disabled?: boolean;
};

export function FileDropzone({
  label,
  hint,
  onFile,
  previewUrl,
  disabled,
}: FileDropzoneProps) {
  const onDrop = useCallback(
    (accepted: File[]) => {
      if (accepted[0]) {
        onFile(accepted[0]);
      }
    },
    [onFile],
  );

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: { "image/*": [".jpeg", ".jpg", ".png", ".webp"] },
    maxFiles: 1,
    disabled,
  });

  return (
    <div className="space-y-2">
      <p className="text-sm font-medium text-slate-700">{label}</p>

      <div
        {...getRootProps()}
        className={clsx(
          "relative aspect-[4/3] w-full cursor-pointer overflow-hidden rounded-xl border-2 border-dashed transition",
          isDragActive ? "border-brand-500 bg-brand-50" : "border-slate-300 bg-slate-50",
          disabled && "cursor-not-allowed opacity-60",
        )}
      >
        <input {...getInputProps()} />

        {previewUrl ? (
          <>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={previewUrl}
              alt="Podgląd"
              className="absolute inset-0 h-full w-full object-contain"
            />
            <div
              className={clsx(
                "absolute inset-x-0 bottom-0 bg-slate-900/65 px-3 py-2 text-center text-xs text-white transition",
                isDragActive && "bg-brand-600/80",
              )}
            >
              {isDragActive ? "Upuść nowe zdjęcie..." : "Kliknij lub przeciągnij, aby podmienić"}
            </div>
          </>
        ) : (
          <div className="flex h-full flex-col items-center justify-center p-4 text-center">
            <p className="text-sm text-slate-600">
              {isDragActive ? "Upuść plik tutaj..." : "Przeciągnij zdjęcie lub kliknij, aby wybrać"}
            </p>
            {hint && <p className="mt-1 text-xs text-slate-500">{hint}</p>}
          </div>
        )}
      </div>
    </div>
  );
}
