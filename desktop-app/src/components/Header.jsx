import React from 'react';

export default function Header({ title, subtitle, right }) {
  return (
    <div className="mb-5 flex items-start justify-between gap-4">
      <div><h1 className="text-xl font-semibold">{title}</h1>{subtitle && <p className="text-sm text-muted">{subtitle}</p>}</div>
      {right}
    </div>
  );
}
