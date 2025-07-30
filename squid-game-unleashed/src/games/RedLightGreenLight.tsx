import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import styled from 'styled-components';
import { useGame } from '../context/GameContext';

const GameContainer = styled.div`
  min-height: 100vh;
  background: linear-gradient(180deg, #87CEEB 0%, #98FB98 100%);
  position: relative;
  overflow: hidden;
  display: flex;
  flex-direction: column;
`;

const GameArea = styled.div`
  flex: 1;
  position: relative;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: space-between;
  padding: 2rem;
`;

const DollContainer = styled(motion.div)`
  position: absolute;
  top: 5%;
  left: 50%;
  transform: translateX(-50%);
  z-index: 10;
`;

const Doll = styled(motion.div)<{ isRed: boolean }>`
  width: 150px;
  height: 200px;
  background: ${props => props.isRed ? '#ff4444' : '#44ff44'};
  border-radius: 50% 50% 40% 40%;
  position: relative;
  box-shadow: 0 10px 30px rgba(0, 0, 0, 0.3);
  
  &::before {
    content: '👁️';
    position: absolute;
    top: 30%;
    left: 50%;
    transform: translateX(-50%);
    font-size: 2rem;
    animation: ${props => props.isRed ? 'blink 0.5s infinite' : 'none'};
  }
  
  &::after {
    content: '${props => props.isRed ? '🔴' : '🟢'}';
    position: absolute;
    top: 60%;
    left: 50%;
    transform: translateX(-50%);
    font-size: 1.5rem;
  }
  
  @keyframes blink {
    0%, 50% { opacity: 1; }
    51%, 100% { opacity: 0.3; }
  }
`;

const StatusDisplay = styled(motion.div)<{ isRed: boolean }>`
  position: absolute;
  top: 20%;
  left: 50%;
  transform: translateX(-50%);
  background: ${props => props.isRed ? 'rgba(255, 68, 68, 0.9)' : 'rgba(68, 255, 68, 0.9)'};
  color: white;
  padding: 1rem 2rem;
  border-radius: 50px;
  font-size: 2rem;
  font-weight: bold;
  text-align: center;
  box-shadow: 0 5px 20px rgba(0, 0, 0, 0.3);
  z-index: 20;
`;

const Player = styled(motion.div)`
  width: 40px;
  height: 60px;
  background: #4169E1;
  border-radius: 20px 20px 5px 5px;
  position: absolute;
  bottom: 10%;
  left: 50%;
  transform: translateX(-50%);
  cursor: pointer;
  
  &::before {
    content: '🏃‍♂️';
    position: absolute;
    top: -10px;
    left: 50%;
    transform: translateX(-50%);
    font-size: 2rem;
  }
`;

const FinishLine = styled.div`
  position: absolute;
  top: 35%;
  left: 0;
  right: 0;
  height: 4px;
  background: repeating-linear-gradient(
    90deg,
    #000 0px,
    #000 20px,
    #fff 20px,
    #fff 40px
  );
  z-index: 5;
  
  &::before {
    content: 'FINISH LINE';
    position: absolute;
    top: -30px;
    left: 50%;
    transform: translateX(-50%);
    background: rgba(0, 0, 0, 0.8);
    color: white;
    padding: 0.5rem 1rem;
    border-radius: 20px;
    font-weight: bold;
  }
`;

const ProgressBar = styled.div`
  position: absolute;
  bottom: 5%;
  left: 50%;
  transform: translateX(-50%);
  width: 80%;
  height: 20px;
  background: rgba(255, 255, 255, 0.3);
  border-radius: 10px;
  overflow: hidden;
`;

const Progress = styled(motion.div)`
  height: 100%;
  background: linear-gradient(90deg, #4169E1, #1E90FF);
  border-radius: 10px;
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

const Controls = styled.div`
  position: absolute;
  bottom: 2rem;
  left: 2rem;
  background: rgba(0, 0, 0, 0.8);
  color: white;
  padding: 1rem;
  border-radius: 10px;
  z-index: 30;
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

const RedLightGreenLight: React.FC = () => {
  const navigate = useNavigate();
  const { state, dispatch } = useGame();
  const [gameState, setGameState] = useState<'waiting' | 'playing' | 'won' | 'lost'>('waiting');
  const [isRedLight, setIsRedLight] = useState(false);
  const [playerPosition, setPlayerPosition] = useState(0);
  const [timeLeft, setTimeLeft] = useState(30);
  const [isMoving, setIsMoving] = useState(false);
  const [gameStarted, setGameStarted] = useState(false);
  const [lightChangeTime, setLightChangeTime] = useState(0);
  
  const gameLoopRef = useRef<NodeJS.Timeout | null>(null);
  const lightTimerRef = useRef<NodeJS.Timeout | null>(null);
  const movementDetectionRef = useRef<NodeJS.Timeout | null>(null);

  const startGame = useCallback(() => {
    setGameStarted(true);
    setGameState('playing');
    setPlayerPosition(0);
    setTimeLeft(30);
    setIsRedLight(false);
    
    // Start the light changing cycle
    const changeLights = () => {
      const nextIsRed = Math.random() > 0.5;
      const duration = nextIsRed ? 
        Math.random() * 3000 + 2000 : // Red light: 2-5 seconds
        Math.random() * 4000 + 3000;  // Green light: 3-7 seconds
      
      setIsRedLight(nextIsRed);
      setLightChangeTime(Date.now());
      
      lightTimerRef.current = setTimeout(changeLights, duration);
    };
    
    changeLights();
    
    // Start game timer
    gameLoopRef.current = setInterval(() => {
      setTimeLeft(prev => {
        if (prev <= 1) {
          setGameState('lost');
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
  }, []);

  const movePlayer = useCallback((direction: 'forward' | 'backward') => {
    if (gameState !== 'playing') return;
    
    setIsMoving(true);
    
    // Clear previous movement detection
    if (movementDetectionRef.current) {
      clearTimeout(movementDetectionRef.current);
    }
    
    // Check if caught moving during red light
    if (isRedLight) {
      // Small grace period for reaction time
      const reactionTime = Date.now() - lightChangeTime;
      if (reactionTime > 500) { // 0.5 second grace period
        setGameState('lost');
        return;
      }
    }
    
    setPlayerPosition(prev => {
      const newPos = direction === 'forward' ? 
        Math.min(prev + 5, 100) : 
        Math.max(prev - 3, 0);
      
      // Check if reached finish line
      if (newPos >= 100) {
        setGameState('won');
      }
      
      return newPos;
    });
    
    // Reset movement detection after a short delay
    movementDetectionRef.current = setTimeout(() => {
      setIsMoving(false);
    }, 200);
  }, [gameState, isRedLight, lightChangeTime]);

  const handleKeyPress = useCallback((event: KeyboardEvent) => {
    if (gameState !== 'playing') return;
    
    switch (event.key.toLowerCase()) {
      case 'w':
      case 'arrowup':
        event.preventDefault();
        movePlayer('forward');
        break;
      case 's':
      case 'arrowdown':
        event.preventDefault();
        movePlayer('backward');
        break;
    }
  }, [movePlayer, gameState]);

  useEffect(() => {
    window.addEventListener('keydown', handleKeyPress);
    return () => window.removeEventListener('keydown', handleKeyPress);
  }, [handleKeyPress]);

  useEffect(() => {
    if (gameState === 'won') {
      dispatch({ type: 'COMPLETE_GAME', payload: { game: 'red-light-green-light', score: timeLeft * 10 } });
      if (gameLoopRef.current) clearInterval(gameLoopRef.current);
      if (lightTimerRef.current) clearTimeout(lightTimerRef.current);
    } else if (gameState === 'lost') {
      dispatch({ type: 'LOSE_LIFE' });
      if (gameLoopRef.current) clearInterval(gameLoopRef.current);
      if (lightTimerRef.current) clearTimeout(lightTimerRef.current);
    }
  }, [gameState, timeLeft, dispatch]);

  useEffect(() => {
    return () => {
      if (gameLoopRef.current) clearInterval(gameLoopRef.current);
      if (lightTimerRef.current) clearTimeout(lightTimerRef.current);
      if (movementDetectionRef.current) clearTimeout(movementDetectionRef.current);
    };
  }, []);

  const resetGame = () => {
    setGameState('waiting');
    setGameStarted(false);
    setIsRedLight(false);
    setPlayerPosition(0);
    setTimeLeft(30);
    setIsMoving(false);
  };

  return (
    <GameContainer>
      <GameArea>
        <GameUI>
          <div>Time: {timeLeft}s</div>
          <div>Lives: ❤️ {state.player.lives}</div>
          <div>Score: {state.player.score}</div>
        </GameUI>

        <Controls>
          <div style={{ marginBottom: '0.5rem' }}>
            Controls: W/↑ = Forward, S/↓ = Backward
          </div>
          <div style={{ fontSize: '0.8rem', color: '#ccc' }}>
            Move during GREEN light only!
          </div>
        </Controls>

        <DollContainer>
          <Doll 
            isRed={isRedLight}
            animate={{ 
              rotateY: isRedLight ? 0 : 180,
              scale: isRedLight ? 1.1 : 1 
            }}
            transition={{ duration: 0.5 }}
          />
        </DollContainer>

        <AnimatePresence>
          {gameStarted && (
            <StatusDisplay
              isRed={isRedLight}
              initial={{ scale: 0, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0, opacity: 0 }}
              transition={{ duration: 0.3 }}
            >
              {isRedLight ? 'RED LIGHT!' : 'GREEN LIGHT!'}
            </StatusDisplay>
          )}
        </AnimatePresence>

        <FinishLine />

        <Player
          animate={{
            bottom: `${10 + (playerPosition * 0.6)}%`,
            scale: isMoving ? 1.2 : 1,
            rotate: isMoving ? (Math.random() - 0.5) * 10 : 0
          }}
          transition={{ duration: 0.2 }}
        />

        <ProgressBar>
          <Progress
            animate={{ width: `${playerPosition}%` }}
            transition={{ duration: 0.3 }}
          />
        </ProgressBar>

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
                background: 'rgba(0, 0, 0, 0.8)',
                color: 'white',
                padding: '2rem',
                borderRadius: '15px',
                zIndex: 40
              }}
            >
              <h2>Red Light, Green Light</h2>
              <p>Move forward during GREEN light, freeze during RED light!</p>
              <p>Reach the finish line within 30 seconds to win.</p>
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
              <h2>🎉 CONGRATULATIONS! 🎉</h2>
              <p>You survived Red Light, Green Light!</p>
              <p>Score: {timeLeft * 10} points</p>
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
              <h2>💀 ELIMINATED! 💀</h2>
              <p>You were caught moving during red light!</p>
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
      </GameArea>
    </GameContainer>
  );
};

export default RedLightGreenLight;