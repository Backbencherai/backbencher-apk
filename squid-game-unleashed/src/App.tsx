import React from 'react';
import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import { motion } from 'framer-motion';
import styled from 'styled-components';
import MainMenu from './components/MainMenu';
import RedLightGreenLight from './games/RedLightGreenLight';
import HoneycombGame from './games/HoneycombGame';
import TugOfWar from './games/TugOfWar';
import MarblesGame from './games/MarblesGame';
import GlassBridge from './games/GlassBridge';
import SquidGameFinal from './games/SquidGameFinal';
import GameProvider from './context/GameContext';
import './App.css';

const AppContainer = styled.div`
  min-height: 100vh;
  background: linear-gradient(135deg, #1a1a2e 0%, #16213e 50%, #0f3460 100%);
  color: white;
  font-family: 'Arial', sans-serif;
  overflow-x: hidden;
`;

const App: React.FC = () => {
  return (
    <GameProvider>
      <AppContainer>
        <Router>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.5 }}
          >
            <Routes>
              <Route path="/" element={<MainMenu />} />
              <Route path="/red-light-green-light" element={<RedLightGreenLight />} />
              <Route path="/honeycomb" element={<HoneycombGame />} />
              <Route path="/tug-of-war" element={<TugOfWar />} />
              <Route path="/marbles" element={<MarblesGame />} />
              <Route path="/glass-bridge" element={<GlassBridge />} />
              <Route path="/squid-game" element={<SquidGameFinal />} />
            </Routes>
          </motion.div>
        </Router>
      </AppContainer>
    </GameProvider>
  );
};

export default App;
