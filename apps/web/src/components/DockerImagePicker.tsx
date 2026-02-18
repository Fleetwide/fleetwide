import { useState } from 'react';
import { Box } from 'lucide-react';

const presets = [
  { label: 'Node.js 22', value: 'node:22' },
  { label: 'Node.js 22 (slim)', value: 'node:22-slim' },
  { label: 'Node.js 20', value: 'node:20' },
  { label: 'Python 3.12', value: 'python:3.12' },
  { label: 'Python 3.12 (slim)', value: 'python:3.12-slim' },
  { label: 'Go 1.22', value: 'golang:1.22' },
  { label: 'Rust (latest)', value: 'rust:latest' },
  { label: 'Ubuntu 24.04', value: 'ubuntu:24.04' },
  { label: 'Alpine 3.19', value: 'alpine:3.19' },
];

export function DockerImagePicker({
  value,
  onChange,
}: {
  value: string;
  onChange: (value: string) => void;
}) {
  const [isCustom, setIsCustom] = useState(!presets.some((p) => p.value === value) && value !== '');
  const isPresetSelected = presets.some((p) => p.value === value);

  return (
    <div>
      <label className="block text-sm font-medium text-gray-300 mb-2">Docker Image</label>
      <div className="grid grid-cols-3 gap-2 mb-2">
        {presets.map((preset) => (
          <button
            key={preset.value}
            type="button"
            onClick={() => {
              onChange(preset.value);
              setIsCustom(false);
            }}
            className={`rounded-md border px-3 py-2 text-xs text-left transition-colors ${
              value === preset.value
                ? 'border-blue-600 bg-blue-900/30 text-blue-400'
                : 'border-gray-700 bg-gray-800 text-gray-300 hover:border-gray-600'
            }`}
          >
            <div className="flex items-center gap-1.5">
              <Box size={12} className="shrink-0" />
              {preset.label}
            </div>
          </button>
        ))}
        <button
          type="button"
          onClick={() => {
            setIsCustom(true);
            if (isPresetSelected) onChange('');
          }}
          className={`rounded-md border px-3 py-2 text-xs text-left transition-colors ${
            isCustom
              ? 'border-blue-600 bg-blue-900/30 text-blue-400'
              : 'border-gray-700 bg-gray-800 text-gray-300 hover:border-gray-600'
          }`}
        >
          Custom...
        </button>
      </div>
      {isCustom && (
        <input
          type="text"
          value={isPresetSelected ? '' : value}
          onChange={(e) => onChange(e.target.value)}
          placeholder="e.g., myregistry.com/image:tag"
          className="w-full rounded-md border border-gray-700 bg-gray-800 px-3 py-2 text-sm text-white placeholder-gray-500 focus:border-blue-600 focus:outline-none"
        />
      )}
    </div>
  );
}
