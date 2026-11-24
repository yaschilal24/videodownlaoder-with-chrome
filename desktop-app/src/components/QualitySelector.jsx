import React from 'react';

const FORMATS = [['mp4', 'MP4 video'], ['webm', 'WebM video'], ['mp3', 'MP3 audio'], ['m4a', 'M4A audio']];

export default function QualitySelector({ heights = [], format, quality, onChange }) {
  const audioOnly = format === 'mp3' || format === 'm4a';
  const options = ['best', ...heights.map(String)];
  // Keep the choice valid when the available heights change.
  const value = options.includes(quality) ? quality : 'best';
  return (
    <div className="grid grid-cols-2 gap-3">
      <label className="text-xs text-muted">Format
        <select className="input mt-1" value={format} onChange={(e) => onChange({ format: e.target.value, quality: value })}>
          {FORMATS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
        </select>
      </label>
      <label className="text-xs text-muted">Quality
        <select className="input mt-1" disabled={audioOnly} value={audioOnly ? 'best' : value} onChange={(e) => onChange({ format, quality: e.target.value })}>
          {options.map((q) => <option key={q} value={q}>{q === 'best' ? 'Best available' : `Up to ${q}p`}</option>)}
        </select>
      </label>
    </div>
  );
}
