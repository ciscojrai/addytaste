import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import DemoPage from './pages/DemoPage';
import './styles.css';

const isDemo = window.location.pathname.replace(/\/$/, '') === '/demo';
createRoot(document.getElementById('root') as HTMLElement).render(<StrictMode>{isDemo ? <DemoPage /> : <App />}</StrictMode>);
