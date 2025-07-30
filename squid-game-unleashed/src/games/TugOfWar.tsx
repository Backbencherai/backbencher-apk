import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import styled from 'styled-components';
import { useGame } from '../context/GameContext';

const GameContainer = styled.div`
  min-height: 100vh;
  background: linear-gradient(180deg, #2C3E50 0%, #34495E 50%, #5D6D7E 100%);
  position: relative;
  overflow: hidden;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
`;

const BridgeContainer = styled.div`
  position: relative;
  width: 800px;
  height: 400px;
  background: linear-gradient(90deg, #8B4513 0%, #A0522D 100%);
  border-radius: 20px;
  box-shadow: 0 20px 40px rgba(0, 0, 0, 0.5);
  overflow: hidden;
`;

const Rope = styled(motion.div)`
  position: absolute;
  top: 50%;
  left: 0;
  right: 0;
  height: 20px;
  background: linear-gradient(90deg, #654321, #8B4513, #654321);
  transform: translateY(-50%);
  border-radius: 10px;
  box-shadow: inset 0 2px 4px rgba(0, 0, 0, 0.3);
`;

const RopeMarker = styled(motion.div)`
  position: absolute;
  top: 50%;
  left: 50%;
  width: 40px;
  height: 40px;
  background: #FF6B6B;
  border-radius: 50%;
  transform: translate(-50%, -50%);
  border: 4px solid white;
  box-shadow: 0 4px 8px rgba(0, 0, 0, 0.3);
  z-index: 10;
`;

const Team = styled(motion.div)<{ side: 'left' | 'right' }>`
  position: absolute;
  top: 20%;
  ${props => props.side}: 5%;
  width: 200px;
  height: 60%;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: space-around;
`;

const Player = styled(motion.div)<{ isActive: boolean }>`
  width: 40px;
  height: 50px;
  background: ${props => props.isActive ? '#4CAF50' : '#2196F3'};
  border-radius: 20px 20px 5px 5px;
  position: relative;
  border: 2px solid ${props => props.isActive ? '#388E3C' : '#1976D2'};
  
  &::before {
    content: '👤';
    position: absolute;
    top: -5px;
    left: 50%;
    transform: translateX(-50%);
    font-size: 1.5rem;
  }
`;

const PowerMeter = styled.div`
  position: absolute;
  bottom: 10%;
  left: 50%;
  transform: translateX(-50%);
  width: 400px;
  height: 40px;
  background: rgba(0, 0, 0, 0.7);
  border-radius: 20px;
  border: 2px solid white;
  overflow: hidden;
`;

const PowerBar = styled(motion.div)<{ power: number; side: 'left' | 'right' }>`
  height: 100%;
  background: ${props => props.side === 'left' ? 
    'linear-gradient(90deg, #4CAF50, #8BC34A)' : 
    'linear-gradient(90deg, #F44336, #FF5722)'};
  width: ${props => Math.abs(props.power)}%;
  ${props => props.side === 'right' ? 'margin-left: auto;' : ''}
  border-radius: ${props => props.side === 'left' ? '20px 0 0 20px' : '0 20px 20px 0'};
`;

const TimingIndicator = styled(motion.div)<{ isActive: boolean }>`
  position: absolute;
  top: 15%;
  left: 50%;
  transform: translateX(-50%);
  width: 200px;
  height: 200px;
  border: 8px solid ${props => props.isActive ? '#4CAF50' : '#666'};
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 3rem;
  color: white;
  background: rgba(0, 0, 0, 0.7);
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

const TugOfWar: React.FC = () => {
  const navigate = useNavigate();
  const { state, dispatch } = useGame();
  const [gameState, setGameState] = useState<'waiting' | 'playing' | 'won' | 'lost'>('waiting');
  const [timeLeft, setTimeLeft] = useState(60);
  const [ropePosition, setRopePosition] = useState(0); // -100 to 100
  const [playerPower, setPlayerPower] = useState(0);
  const [enemyPower, setEnemyPower] = useState(0);
  const [currentBeat, setCurrentBeat] = useState(0);
  const [isTimingActive, setIsTimingActive] = useState(false);
  const [gameStarted, setGameStarted] = useState(false);
  const [beatPattern, setBeatPattern] = useState<number[]>([]);
  const [playerInputs, setPlayerInputs] = useState<number[]>([]);
  const [round, setRound] = useState(1);

  const gameTimerRef = useRef<NodeJS.Timeout | null>(null);
  const beatTimerRef = useRef<NodeJS.Timeout | null>(null);

  const generateBeatPattern = useCallback(() => {
    const pattern = [];
    const patternLength = Math.min(4 + round, 8);
    for (let i = 0; i < patternLength; i++) {
      pattern.push(Math.floor(Math.random() * 4) + 1); // 1-4 beats
    }
    return pattern;
  }, [round]);

  const startGame = useCallback(() => {
    setGameStarted(true);
    setGameState('playing');
    setTimeLeft(60);
    setRopePosition(0);
    setPlayerPower(0);
    setEnemyPower(0);
    setCurrentBeat(0);
    setRound(1);
    setBeatPattern(generateBeatPattern());
    setPlayerInputs([]);
    
    // Start game timer
    gameTimerRef.current = setInterval(() => {
      setTimeLeft(prev => {
        if (prev <= 1) {
          setGameState('lost');
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    // Start beat system
    startBeatRound();
  }, [generateBeatPattern]);

  const startBeatRound = useCallback(() => {
    setIsTimingActive(true);
    setCurrentBeat(0);
    setPlayerInputs([]);
    
    // Give player 3 seconds to input the pattern
    beatTimerRef.current = setTimeout(() => {
      setIsTimingActive(false);
      calculateRoundResult();
    }, 3000);
  }, []);

  const calculateRoundResult = useCallback(() => {
    const pattern = beatPattern;
    const inputs = playerInputs;
    
    // Calculate accuracy
    let accuracy = 0;
    const minLength = Math.min(pattern.length, inputs.length);
    
    for (let i = 0; i < minLength; i++) {
      if (pattern[i] === inputs[i]) accuracy++;
    }
    
    // Penalty for wrong length
    const lengthPenalty = Math.abs(pattern.length - inputs.length);
    accuracy = Math.max(0, accuracy - lengthPenalty);
    
    const accuracyPercent = (accuracy / pattern.length) * 100;
    
    // Update power based on accuracy
    const powerGain = Math.floor(accuracyPercent / 10);
    setPlayerPower(prev => Math.min(prev + powerGain, 100));
    
    // Enemy power (gets stronger over time)
    const enemyGain = Math.floor(Math.random() * (3 + round)) + 2;
    setEnemyPower(prev => Math.min(prev + enemyGain, 100));
    
    // Update rope position
    setTimeout(() => {
      setRopePosition(prev => {
        const newPos = prev + (powerGain - enemyGain) * 5;
        
        // Check win/lose conditions
        if (newPos >= 80) {
          setGameState('won');
          return 80;
        } else if (newPos <= -80) {
          setGameState('lost');
          return -80;
        }
        
        return Math.max(-80, Math.min(80, newPos));
      });
      
      // Start next round
      setTimeout(() => {
        if (gameState === 'playing') {
          setRound(prev => prev + 1);
          setBeatPattern(generateBeatPattern());
          startBeatRound();
        }
      }, 1000);
    }, 500);
  }, [beatPattern, playerInputs, round, gameState, generateBeatPattern, startBeatRound]);

  const handleSpacePress = useCallback((event: KeyboardEvent) => {
    if (event.code === 'Space' && isTimingActive && gameState === 'playing') {
      event.preventDefault();
      const currentTime = Date.now();
      const beatNumber = Math.floor((currentTime % 4000) / 1000) + 1; // 1-4 based on timing
      
      setPlayerInputs(prev => [...prev, beatNumber]);
    }
  }, [isTimingActive, gameState]);

  useEffect(() => {
    window.addEventListener('keydown', handleSpacePress);
    return () => window.removeEventListener('keydown', handleSpacePress);
  }, [handleSpacePress]);

  useEffect(() => {
    if (gameState === 'won') {
      dispatch({ type: 'COMPLETE_GAME', payload: { game: 'tug-of-war', score: timeLeft * 8 + playerPower } });
      if (gameTimerRef.current) clearInterval(gameTimerRef.current);
      if (beatTimerRef.current) clearTimeout(beatTimerRef.current);
    } else if (gameState === 'lost') {
      dispatch({ type: 'LOSE_LIFE' });
      if (gameTimerRef.current) clearInterval(gameTimerRef.current);
      if (beatTimerRef.current) clearTimeout(beatTimerRef.current);
    }
  }, [gameState, timeLeft, playerPower, dispatch]);

  useEffect(() => {
    return () => {
      if (gameTimerRef.current) clearInterval(gameTimerRef.current);
      if (beatTimerRef.current) clearTimeout(beatTimerRef.current);
    };
  }, []);

  const resetGame = () => {
    setGameState('waiting');
    setGameStarted(false);
    setTimeLeft(60);
    setRopePosition(0);
    setPlayerPower(0);
    setEnemyPower(0);
    setCurrentBeat(0);
    setIsTimingActive(false);
    setRound(1);
    setBeatPattern([]);
    setPlayerInputs([]);
  };

  return (
    <GameContainer>
      <GameUI>
        <div>Time: {timeLeft}s</div>
        <div>Lives: ❤️ {state.player.lives}</div>
        <div>Score: {state.player.score}</div>
        <div>Round: {round}</div>
      </GameUI>

      <motion.div
        initial={{ scale: 0.8, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={{ duration: 0.5 }}
      >
        <BridgeContainer>
          <Team side="left">
            <Player isActive={playerPower > enemyPower} />
            <Player isActive={playerPower > enemyPower} />
            <Player isActive={playerPower > enemyPower} />
          </Team>
          
          <Team side="right">
            <Player isActive={enemyPower > playerPower} />
            <Player isActive={enemyPower > playerPower} />
            <Player isActive={enemyPower > playerPower} />
          </Team>

          <Rope />
          
          <RopeMarker
            animate={{ 
              x: ropePosition * 3,
              scale: isTimingActive ? [1, 1.2, 1] : 1
            }}
            transition={{ 
              x: { duration: 0.5 },
              scale: { duration: 0.5, repeat: isTimingActive ? Infinity : 0 }
            }}
          />

          {isTimingActive && (
            <TimingIndicator
              isActive={isTimingActive}
              animate={{ 
                scale: [1, 1.1, 1],
                rotate: [0, 360]
              }}
              transition={{ 
                scale: { duration: 0.75, repeat: Infinity },
                rotate: { duration: 3, ease: "linear" }
              }}
            >
              {beatPattern.length > 0 && `${beatPattern.join(' ')}`}
            </TimingIndicator>
          )}
        </BridgeContainer>
      </motion.div>

      <PowerMeter>
        <PowerBar power={playerPower} side="left" />
        <PowerBar power={enemyPower} side="right" />
        <div style={{
          position: 'absolute',
          top: '50%',
          left: '50%',
          transform: 'translate(-50%, -50%)',
          color: 'white',
          fontWeight: 'bold',
          fontSize: '0.8rem',
          zIndex: 10
        }}>
          {playerPower} vs {enemyPower}
        </div>
      </PowerMeter>

      <Instructions>
        <div style={{ marginBottom: '0.5rem' }}>
          Press SPACE to match the rhythm pattern!
        </div>
        <div style={{ fontSize: '0.8rem', color: '#ccc' }}>
          {isTimingActive ? 
            `Pattern: ${beatPattern.join(' ')} | Your input: ${playerInputs.join(' ')}` :
            'Wait for the next round...'
          }
        </div>
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
            <h2>Tug of War</h2>
            <p>Match the rhythm patterns to pull the rope!</p>
            <p>Press SPACE in the correct timing to match the pattern.</p>
            <p>Pull the rope to your side to win!</p>
            
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
            <h2>🎉 VICTORY! 🎉</h2>
            <p>You won the Tug of War!</p>
            <p>Score: {timeLeft * 8 + playerPower} points</p>
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
            <h2>💀 DEFEAT! 💀</h2>
            <p>You were pulled over the edge!</p>
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

export default TugOfWar;