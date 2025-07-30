import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import styled from 'styled-components';
import { useGame } from '../context/GameContext';

const GameContainer = styled.div`
  min-height: 100vh;
  background: linear-gradient(180deg, #000428 0%, #004e92 100%);
  position: relative;
  overflow: hidden;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
`;

const BridgeContainer = styled.div`
  position: relative;
  width: 600px;
  height: 500px;
  perspective: 1000px;
`;

const BridgeRow = styled.div`
  display: flex;
  justify-content: center;
  gap: 20px;
  margin: 10px 0;
`;

const GlassPanel = styled(motion.div)<{ 
  type: 'safe' | 'unsafe' | 'unknown'; 
  isRevealed: boolean;
  isPlayerOn: boolean;
}>`
  width: 80px;
  height: 40px;
  background: ${props => 
    props.isRevealed 
      ? (props.type === 'safe' ? 'rgba(76, 175, 80, 0.8)' : 'rgba(244, 67, 54, 0.8)')
      : 'rgba(135, 206, 235, 0.6)'
  };
  border: 2px solid ${props => 
    props.isPlayerOn ? '#FFD700' : 
    props.isRevealed 
      ? (props.type === 'safe' ? '#4CAF50' : '#F44336')
      : '#87CEEB'
  };
  border-radius: 8px;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 1.5rem;
  box-shadow: ${props => props.isPlayerOn ? '0 0 20px #FFD700' : '0 4px 8px rgba(0, 0, 0, 0.3)'};
  backdrop-filter: blur(5px);
  
  &:hover {
    transform: translateY(-2px);
    box-shadow: 0 6px 12px rgba(0, 0, 0, 0.4);
  }
`;

const Player = styled(motion.div)`
  position: absolute;
  width: 30px;
  height: 30px;
  background: #FF6B6B;
  border-radius: 50%;
  border: 3px solid white;
  z-index: 10;
  
  &::before {
    content: '🏃‍♂️';
    position: absolute;
    top: -15px;
    left: 50%;
    transform: translateX(-50%);
    font-size: 1.5rem;
  }
`;

const GameUI = styled.div`
  position: absolute;
  top: 2rem;
  right: 2rem;
  background: rgba(0, 0, 0, 0.8);
  color: white;
  padding: 1rem;
  border-radius: 10px;
  z-index: 30;
`;

const Instructions = styled.div`
  position: absolute;
  bottom: 2rem;
  left: 50%;
  transform: translateX(-50%);
  background: rgba(0, 0, 0, 0.8);
  color: white;
  padding: 1rem;
  border-radius: 10px;
  text-align: center;
  z-index: 30;
  max-width: 500px;
`;

const Button = styled(motion.button)`
  background: linear-gradient(45deg, #ff6b6b, #ff8e8e);
  border: none;
  border-radius: 8px;
  padding: 0.8rem 1.5rem;
  color: white;
  font-size: 1rem;
  font-weight: bold;
  cursor: pointer;
  margin: 0.5rem;
  
  &:disabled {
    background: #666;
    cursor: not-allowed;
  }
`;

const ProgressIndicator = styled.div`
  position: absolute;
  top: 2rem;
  left: 50%;
  transform: translateX(-50%);
  background: rgba(0, 0, 0, 0.8);
  color: white;
  padding: 1rem 2rem;
  border-radius: 50px;
  font-size: 1.2rem;
  font-weight: bold;
  text-align: center;
  z-index: 30;
`;

interface PanelData {
  id: string;
  type: 'safe' | 'unsafe';
  isRevealed: boolean;
}

const GlassBridge: React.FC = () => {
  const navigate = useNavigate();
  const { state, dispatch } = useGame();
  const [gameState, setGameState] = useState<'waiting' | 'playing' | 'won' | 'lost'>('waiting');
  const [currentRow, setCurrentRow] = useState(0);
  const [playerPosition, setPlayerPosition] = useState<{row: number, side: 'left' | 'right'} | null>(null);
  const [bridge, setBridge] = useState<PanelData[][]>([]);
  const [gameStarted, setGameStarted] = useState(false);
  const [hintsUsed, setHintsUsed] = useState(0);
  const maxHints = 3;
  const totalRows = 10;

  const generateBridge = useCallback(() => {
    const newBridge: PanelData[][] = [];
    
    for (let row = 0; row < totalRows; row++) {
      const leftPanel: PanelData = {
        id: `${row}-left`,
        type: Math.random() > 0.5 ? 'safe' : 'unsafe',
        isRevealed: false
      };
      
      const rightPanel: PanelData = {
        id: `${row}-right`,
        type: leftPanel.type === 'safe' ? 'unsafe' : 'safe', // Ensure one is always safe
        isRevealed: false
      };
      
      // Randomly swap to make it unpredictable
      if (Math.random() > 0.5) {
        leftPanel.type = leftPanel.type === 'safe' ? 'unsafe' : 'safe';
        rightPanel.type = rightPanel.type === 'safe' ? 'unsafe' : 'safe';
      }
      
      newBridge.push([leftPanel, rightPanel]);
    }
    
    return newBridge;
  }, []);

  const startGame = useCallback(() => {
    setGameStarted(true);
    setGameState('playing');
    setCurrentRow(0);
    setPlayerPosition(null);
    setBridge(generateBridge());
    setHintsUsed(0);
  }, [generateBridge]);

  const handlePanelClick = useCallback((rowIndex: number, panelIndex: number) => {
    if (gameState !== 'playing' || rowIndex !== currentRow) return;
    
    const panel = bridge[rowIndex][panelIndex];
    const side = panelIndex === 0 ? 'left' : 'right';
    
    // Reveal the panel
    setBridge(prev => {
      const newBridge = [...prev];
      newBridge[rowIndex][panelIndex].isRevealed = true;
      return newBridge;
    });
    
    // Set player position
    setPlayerPosition({ row: rowIndex, side });
    
    setTimeout(() => {
      if (panel.type === 'safe') {
        // Safe panel - move to next row
        if (rowIndex === totalRows - 1) {
          // Reached the end!
          setGameState('won');
        } else {
          setCurrentRow(prev => prev + 1);
          setPlayerPosition(null);
        }
      } else {
        // Unsafe panel - game over
        setGameState('lost');
      }
    }, 1000);
  }, [gameState, currentRow, bridge, totalRows]);

  const useHint = useCallback(() => {
    if (hintsUsed >= maxHints || gameState !== 'playing') return;
    
    // Reveal the safe panel in the current row
    setBridge(prev => {
      const newBridge = [...prev];
      const currentRowPanels = newBridge[currentRow];
      const safePanel = currentRowPanels.find(panel => panel.type === 'safe');
      if (safePanel) {
        safePanel.isRevealed = true;
      }
      return newBridge;
    });
    
    setHintsUsed(prev => prev + 1);
  }, [hintsUsed, maxHints, gameState, currentRow]);

  useEffect(() => {
    if (gameState === 'won') {
      const score = (totalRows - hintsUsed) * 100;
      dispatch({ type: 'COMPLETE_GAME', payload: { game: 'glass-bridge', score } });
    } else if (gameState === 'lost') {
      dispatch({ type: 'LOSE_LIFE' });
    }
  }, [gameState, totalRows, hintsUsed, dispatch]);

  const resetGame = () => {
    setGameState('waiting');
    setGameStarted(false);
    setCurrentRow(0);
    setPlayerPosition(null);
    setBridge([]);
    setHintsUsed(0);
  };

  const getPlayerPositionStyle = () => {
    if (!playerPosition) return {};
    
    const rowElement = document.querySelector(`[data-row="${playerPosition.row}"]`);
    const panelElement = document.querySelector(`[data-panel="${playerPosition.row}-${playerPosition.side}"]`);
    
    if (rowElement && panelElement) {
      const containerRect = document.querySelector('.bridge-container')?.getBoundingClientRect();
      const panelRect = panelElement.getBoundingClientRect();
      
      if (containerRect) {
        return {
          left: panelRect.left - containerRect.left + panelRect.width / 2 - 15,
          top: panelRect.top - containerRect.top + panelRect.height / 2 - 15,
        };
      }
    }
    
    return {};
  };

  return (
    <GameContainer>
      <GameUI>
        <div>Lives: ❤️ {state.player.lives}</div>
        <div>Score: {state.player.score}</div>
        <div>Hints: {maxHints - hintsUsed}/3</div>
      </GameUI>

      <ProgressIndicator>
        Step {currentRow + 1} of {totalRows}
      </ProgressIndicator>

      <motion.div
        className="bridge-container"
        initial={{ scale: 0.8, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={{ duration: 0.5 }}
      >
        <BridgeContainer>
          {bridge.map((row, rowIndex) => (
            <BridgeRow key={rowIndex} data-row={rowIndex}>
              {row.map((panel, panelIndex) => (
                <GlassPanel
                  key={panel.id}
                  data-panel={panel.id}
                  type={panel.type}
                  isRevealed={panel.isRevealed}
                  isPlayerOn={
                    playerPosition?.row === rowIndex && 
                    playerPosition?.side === (panelIndex === 0 ? 'left' : 'right')
                  }
                  onClick={() => handlePanelClick(rowIndex, panelIndex)}
                  animate={{
                    scale: rowIndex === currentRow ? [1, 1.05, 1] : 1,
                    opacity: rowIndex <= currentRow ? 1 : 0.5,
                  }}
                  transition={{
                    scale: { duration: 1, repeat: rowIndex === currentRow ? Infinity : 0 },
                  }}
                  whileHover={rowIndex === currentRow ? { scale: 1.1 } : {}}
                  whileTap={rowIndex === currentRow ? { scale: 0.95 } : {}}
                >
                  {panel.isRevealed && (panel.type === 'safe' ? '✅' : '💥')}
                  {rowIndex === currentRow && !panel.isRevealed && '❓'}
                </GlassPanel>
              ))}
            </BridgeRow>
          ))}
          
          {playerPosition && (
            <Player
              style={getPlayerPositionStyle()}
              animate={{ scale: [1, 1.2, 1] }}
              transition={{ duration: 0.5, repeat: Infinity }}
            />
          )}
        </BridgeContainer>
      </motion.div>

      <Instructions>
        <div style={{ marginBottom: '0.5rem' }}>
          Choose the correct glass panel to step on!
        </div>
        <div style={{ fontSize: '0.8rem', color: '#ccc', marginBottom: '1rem' }}>
          One panel in each row is safe, the other will break. Choose wisely!
        </div>
        {gameState === 'playing' && (
          <Button 
            onClick={useHint}
            disabled={hintsUsed >= maxHints}
            whileHover={{ scale: 1.05 }}
          >
            Use Hint ({maxHints - hintsUsed} left)
          </Button>
        )}
      </Instructions>

      <AnimatePresence>
        {!gameStarted && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            style={{
              position: 'absolute',
              top: '50%',
              left: '50%',
              transform: 'translate(-50%, -50%)',
              textAlign: 'center',
              background: 'rgba(0, 0, 0, 0.9)',
              color: 'white',
              padding: '2rem',
              borderRadius: '15px',
              zIndex: 40,
              maxWidth: '500px'
            }}
          >
            <h2>Glass Bridge</h2>
            <p>Cross the bridge by choosing the correct glass panels!</p>
            <p>One panel in each row is safe, the other will shatter.</p>
            <p>You have 3 hints to help you survive.</p>
            
            <Button onClick={startGame} whileHover={{ scale: 1.05 }}>
              Start Game
            </Button>
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {gameState === 'won' && (
          <motion.div
            initial={{ opacity: 0, scale: 0.5 }}
            animate={{ opacity: 1, scale: 1 }}
            style={{
              position: 'absolute',
              top: '50%',
              left: '50%',
              transform: 'translate(-50%, -50%)',
              textAlign: 'center',
              background: 'rgba(0, 200, 0, 0.9)',
              color: 'white',
              padding: '2rem',
              borderRadius: '15px',
              zIndex: 40
            }}
          >
            <h2>🎉 BRIDGE CROSSED! 🎉</h2>
            <p>You successfully crossed the glass bridge!</p>
            <p>Score: {(totalRows - hintsUsed) * 100} points</p>
            <div>
              <Button onClick={() => navigate('/')} whileHover={{ scale: 1.05 }}>
                Back to Menu
              </Button>
              <Button onClick={resetGame} whileHover={{ scale: 1.05 }}>
                Play Again
              </Button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {gameState === 'lost' && (
          <motion.div
            initial={{ opacity: 0, scale: 0.5 }}
            animate={{ opacity: 1, scale: 1 }}
            style={{
              position: 'absolute',
              top: '50%',
              left: '50%',
              transform: 'translate(-50%, -50%)',
              textAlign: 'center',
              background: 'rgba(200, 0, 0, 0.9)',
              color: 'white',
              padding: '2rem',
              borderRadius: '15px',
              zIndex: 40
            }}
          >
            <h2>💀 GLASS SHATTERED! 💀</h2>
            <p>You chose the wrong panel and fell!</p>
            <p>Lives remaining: {state.player.lives}</p>
            <div>
              <Button onClick={() => navigate('/')} whileHover={{ scale: 1.05 }}>
                Back to Menu
              </Button>
              {state.player.lives > 0 && (
                <Button onClick={resetGame} whileHover={{ scale: 1.05 }}>
                  Try Again
                </Button>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </GameContainer>
  );
};

export default GlassBridge;