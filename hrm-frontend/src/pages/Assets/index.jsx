import React, { useState } from 'react';
import AssetList from './AssetList';
import AssetAssignments from './AssetAssignments';

export default function Assets() {
  const [refreshKey, setRefreshKey] = useState(0);

  const handleRefresh = () => {
    setRefreshKey(prev => prev + 1);
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-6)' }}>
      <AssetList refreshKey={refreshKey} onRefresh={handleRefresh} />
      <AssetAssignments refreshKey={refreshKey} onRefresh={handleRefresh} />
    </div>
  );
}
