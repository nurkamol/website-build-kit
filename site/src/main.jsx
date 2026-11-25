import { StrictMode } from 'react';
import { hydrateRoot } from 'react-dom/client';
import './styles.css';
import App from './App.jsx';

hydrateRoot(document.getElementById('root'), <StrictMode><App /></StrictMode>);
