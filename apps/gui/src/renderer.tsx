import React, { useEffect, useState } from 'react';
import ReactDOM from 'react-dom';

interface Config {
  apiKey?: string;
  nodeId?: string;
}

function App() {
  const [config, setConfig] = useState<Config>({});
  const [apiKey, setApiKey] = useState('');

  useEffect(() => {
    window.aichain.readConfig().then((c) => {
      setConfig(c);
      if (c.apiKey) setApiKey(c.apiKey);
    });
  }, []);

  const save = async () => {
    await window.aichain.writeConfig({ apiKey });
    const c = await window.aichain.readConfig();
    setConfig(c);
  };

  if (!config.apiKey) {
    return (
      <div>
        <h1>API Key</h1>
        <input value={apiKey} onChange={(e) => setApiKey(e.target.value)} />
        <button onClick={save}>Salvar</button>
      </div>
    );
  }

  if (config.apiKey && config.nodeId) {
    return (
      <div>
        <h1>Running</h1>
        <p>Status: Running</p>
        <p>Último heartbeat: N/A</p>
        <button onClick={() => navigator.clipboard.writeText(config.nodeId!)}>
          Copiar Node ID
        </button>
      </div>
    );
  }

  return <div>Splash...</div>;
}

ReactDOM.render(<App />, document.getElementById('root'));
