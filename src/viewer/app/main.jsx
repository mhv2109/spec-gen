import React from 'react';
import ReactDOM from 'react-dom/client';
import InteractiveGraphViewer from '../InteractiveGraphViewer.jsx';

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <InteractiveGraphViewer
      graphUrl="/api/dependency-graph"
      mappingUrl="/api/mapping"
      specUrl="/api/spec"
    />
  </React.StrictMode>
);
