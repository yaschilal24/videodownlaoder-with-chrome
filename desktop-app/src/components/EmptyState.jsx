import React from 'react';

export default function EmptyState({ title, text, action }) {
  return (
    <div className="card flex flex-col items-center justify-center gap-2 px-6 py-14 text-center">
      <div className="text-4xl">📥</div>
      <h3 className="text-base font-semibold">{title}</h3>
      {text && <p className="max-w-sm text-sm text-muted">{text}</p>}
      {action}
    </div>
  );
}
