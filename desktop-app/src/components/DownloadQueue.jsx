import React from 'react';
import DownloadCard from './DownloadCard.jsx';
import EmptyState from './EmptyState.jsx';

export default function DownloadQueue({ items, emptyTitle = 'Nothing here yet', emptyText }) {
  if (!items.length) return <EmptyState title={emptyTitle} text={emptyText} />;
  return <div className="space-y-3">{items.map((d) => <DownloadCard key={d.id} d={d} />)}</div>;
}
