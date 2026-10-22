import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App.jsx';
import { ThemeProvider } from './context/ThemeContext.jsx';
import { ProjectProvider } from './context/ProjectContext.jsx';
import { AppConfigProvider } from './context/AppConfigContext.jsx';
import { CustomIconsProvider } from './context/CustomIconsContext.jsx';
import { CommunityAuthProvider } from './context/CommunityAuthContext.jsx';
import './styles/themes.css';
import './styles/global.css';

if ('serviceWorker' in navigator && !import.meta.env.DEV) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch((error) => {
      console.error('Brinfolynk offline app support could not be registered:', error);
    });
  });
}

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <AppConfigProvider>
      <CustomIconsProvider>
        <ThemeProvider>
          <ProjectProvider>
            <CommunityAuthProvider>
              <App />
            </CommunityAuthProvider>
          </ProjectProvider>
        </ThemeProvider>
      </CustomIconsProvider>
    </AppConfigProvider>
  </StrictMode>,
);
