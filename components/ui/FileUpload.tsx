"use client";
import { useState, useRef } from "react";
import { Upload, X, FileText, CheckCircle } from "lucide-react";
import { cn } from "@/lib/utils";

interface UploadedFile { name: string; size: number; status: "uploading" | "done" | "error"; }

interface FileUploadProps {
  label: string;
  accept?: string;
  onUpload?: (file: File) => void;
}

export default function FileUpload({ label, accept = ".pdf,.doc,.docx,.jpg,.png", onUpload }: FileUploadProps) {
  const [files, setFiles] = useState<UploadedFile[]>([]);
  const [dragging, setDragging] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  function handleFile(file: File) {
    const entry: UploadedFile = { name: file.name, size: file.size, status: "uploading" };
    setFiles(prev => [...prev, entry]);
    onUpload?.(file);
    setTimeout(() => {
      setFiles(prev => prev.map(f => f.name === file.name ? { ...f, status: "done" } : f));
    }, 1200);
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault(); setDragging(false);
    Array.from(e.dataTransfer.files).forEach(handleFile);
  }

  return (
    <div>
      <p className="label">{label}</p>
      <div
        onDrop={handleDrop}
        onDragOver={e => { e.preventDefault(); setDragging(true); }}
        onDragLeave={() => setDragging(false)}
        onClick={() => inputRef.current?.click()}
        className={cn("border-2 border-dashed rounded-xl p-8 text-center cursor-pointer transition-all",
          dragging ? "border-brand-blue bg-blue-50" : "border-gray-200 hover:border-gray-300 hover:bg-gray-50")}>
        <Upload size={24} className="mx-auto mb-2 text-gray-400" />
        <p className="text-sm font-medium text-gray-700">Drag & drop or click to upload</p>
        <p className="text-xs text-gray-400 mt-1">PDF, DOC, DOCX, JPG, PNG · Max 50MB</p>
        <input ref={inputRef} type="file" accept={accept} className="hidden"
          onChange={e => Array.from(e.target.files ?? []).forEach(handleFile)} multiple />
      </div>
      {files.length > 0 && (
        <ul className="mt-3 space-y-2">
          {files.map((f, i) => (
            <li key={i} className="flex items-center gap-3 bg-gray-50 rounded-xl px-4 py-2.5">
              <FileText size={15} className="text-gray-400 shrink-0" />
              <span className="text-sm text-gray-700 flex-1 truncate">{f.name}</span>
              <span className="text-xs text-gray-400">{(f.size / 1024).toFixed(0)} KB</span>
              {f.status === "done" ? (
                <CheckCircle size={15} className="text-green-500 shrink-0" />
              ) : (
                <div className="w-4 h-4 border-2 border-brand-blue border-t-transparent rounded-full animate-spin shrink-0" />
              )}
              <button onClick={e => { e.stopPropagation(); setFiles(prev => prev.filter((_, j) => j !== i)); }}>
                <X size={14} className="text-gray-400 hover:text-gray-600" />
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
