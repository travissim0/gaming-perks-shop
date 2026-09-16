'use client';

import React, { useRef, useState } from 'react';
import { Upload, FileText, AlertCircle, X, ChevronDown, Loader2 } from 'lucide-react';

interface CSVUploadZoneProps {
  onFileUpload: (file: File) => void;
  isProcessing?: boolean;
  error?: string | null;
  disabled?: boolean;
}

const COLUMNS = [
  'PlayerName', 'Team', 'Kills', 'Deaths', 'Captures', 'CarrierKills', 'CarryTimeSeconds', 'GameLengthMinutes', 'Result', 'MostPlayedClass',
  'ClassSwaps', 'TurretDamage', 'GameMode', 'Side', 'BaseUsed', 'Accuracy', 'AvgResourceUnusedPerDeath', 'AvgExplosiveUnusedPerDeath', 'EBHits', 'LeftEarly',
];

/** Drag-and-drop CSV picker for player-stat imports. Validates type and size, hands the file up. */
export default function CSVUploadZone({ onFileUpload, isProcessing, error, disabled }: CSVUploadZoneProps) {
  const [isDragOver, setIsDragOver] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [rejected, setRejected] = useState<string | null>(null);
  const [showFormat, setShowFormat] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleDragOver = (e: React.DragEvent) => { e.preventDefault(); setIsDragOver(true); };
  const handleDragLeave = (e: React.DragEvent) => { e.preventDefault(); setIsDragOver(false); };
  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
    if (disabled) return;
    const files = e.dataTransfer.files;
    if (files.length > 0) handleFileSelection(files[0]);
  };
  const handleFileInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (disabled) return;
    const files = e.target.files;
    if (files && files.length > 0) handleFileSelection(files[0]);
  };

  const handleFileSelection = (file: File) => {
    if (!file.name.toLowerCase().endsWith('.csv')) { setRejected(`${file.name} is not a .csv file.`); return; }
    if (file.size > 10 * 1024 * 1024) { setRejected(`${file.name} is over the 10 MB limit.`); return; }
    setRejected(null);
    setSelectedFile(file);
    onFileUpload(file);
  };

  const clearSelection = () => {
    setSelectedFile(null);
    setRejected(null);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const formatFileSize = (bytes: number) => {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`;
  };

  const inactive = isProcessing || disabled;

  return (
    <div className="space-y-2">
      <div
        className={`rounded-md border border-dashed px-4 py-5 text-center transition-colors ${
          isDragOver && !disabled ? 'border-[#22D3EE] bg-[#22D3EE]/5' : 'border-white/15 hover:border-white/30'
        } ${inactive ? 'opacity-50 pointer-events-none' : ''}`}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
      >
        {!selectedFile ? (
          <>
            <Upload className="mx-auto mb-2 h-6 w-6 text-[#8B98B0]" />
            <p className="text-sm text-[#E6EDF7]">Drop a CSV here, or</p>
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              disabled={inactive}
              className="mt-2 rounded-md bg-white/5 px-3 py-1.5 text-sm text-[#E6EDF7] hover:bg-white/10 disabled:opacity-50"
            >
              Choose a file
            </button>
            <p className="mt-2 text-[11px] text-[#8B98B0]">{disabled ? 'Fill in the fields above first.' : 'Up to 10 MB. Game mode is set to Tournament on import.'}</p>
            <input ref={fileInputRef} type="file" accept=".csv" onChange={handleFileInputChange} className="hidden" />
          </>
        ) : (
          <div className="flex items-center gap-3 text-left">
            <FileText className="h-6 w-6 shrink-0 text-[#34D399]" />
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm text-[#E6EDF7]">{selectedFile.name}</p>
              <p className="text-[11px] text-[#8B98B0]">{formatFileSize(selectedFile.size)} · modified {selectedFile.lastModified ? new Date(selectedFile.lastModified).toLocaleDateString() : 'unknown'}</p>
            </div>
            {isProcessing ? (
              <span className="inline-flex items-center gap-1.5 text-xs text-[#8B98B0]"><Loader2 className="h-4 w-4 animate-spin" /> Parsing…</span>
            ) : (
              <button type="button" onClick={clearSelection} disabled={inactive} className="rounded p-1 text-[#8B98B0] hover:bg-white/10 hover:text-[#E6EDF7]" aria-label="Remove file">
                <X className="h-4 w-4" />
              </button>
            )}
          </div>
        )}
      </div>

      {(rejected || error) && (
        <div className="flex items-start gap-2 rounded-md bg-[#F87171]/10 px-3 py-2 text-sm text-[#F87171]">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
          <pre className="whitespace-pre-wrap font-sans">{rejected || error}</pre>
        </div>
      )}

      <button type="button" onClick={() => setShowFormat((v) => !v)} className="flex items-center gap-1 text-[11px] text-[#8B98B0] hover:text-[#E6EDF7]">
        <ChevronDown className={`h-3.5 w-3.5 transition-transform ${showFormat ? 'rotate-180' : ''}`} />
        Expected columns
      </button>
      {showFormat && (
        <div className="rounded-md bg-[#0B0F1A]/60 p-3 text-[11px] text-[#8B98B0]">
          <div className="flex flex-wrap gap-1">
            {COLUMNS.map((c) => <code key={c} className="rounded bg-white/5 px-1.5 py-0.5 text-[#E6EDF7]">{c}</code>)}
          </div>
          <p className="mt-2">Date and game id are generated if the file doesn&apos;t include them.</p>
        </div>
      )}
    </div>
  );
}
