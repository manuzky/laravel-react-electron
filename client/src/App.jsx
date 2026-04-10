import { useEffect, useState } from 'react';
import { testAPI } from './api';

function App() {
  const [message, setMessage] = useState('');

  useEffect(() => {
    testAPI().then(data => {
      if (data) setMessage(data.message);
      else setMessage('No se pudo conectar con API');
    });
  }, []);

  return (
    <div className="App">
      <h1>Test Laravel API + React</h1>
      <p>{message}</p>
    </div>
  );
}

export default App;