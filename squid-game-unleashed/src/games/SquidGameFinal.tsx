import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import styled from 'styled-components';
import { useGame } from '../context/GameContext';

const GameContainer = styled.div`
  min-height: 100vh;
  background: linear-gradient(135deg, #8B0000 0%, #DC143C 50%, #FF6347 100%);
  position: relative;
  overflow: hidden;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
`;

const GameField = styled.div`
  position: relative;
  width: 600px;
  height: 400px;
  background: rgba(139, 69, 19, 0.3);
  border: 4px solid #8B4513;
  border-radius: 20px;
  overflow: hidden;
  box-shadow: 0 20px 40px rgba(0, 0, 0, 0.5);
`;

const SquidShape = styled.div`
  position: absolute;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  width: 300px;
  height: 200px;
  opacity: 0.2;
  
  &::before {
    content: '🦑';
    position: absolute;
    top: 50%;
    left: 50%;
    transform: translate(-50%, -50%);
    font-size: 8rem;
  }
`;

const Player = styled(motion.div)<{ isAttacker: boolean }>`
  position: absolute;
  width: 40px;
  height: 40px;
  background: ${props => props.isAttacker ? '#FF6B6B' : '#4CAF50'};
  border-radius: 50%;
  border: 3px solid white;
  z-index: 10;
  cursor: pointer;
  
  &::before {
    content: '${props => props.isAttacker ? '⚔️' : '🛡️'}';
    position: absolute;
    top: -15px;
    left: 50%;
    transform: translateX(-50%);
    font-size: 1.5rem;
  }
`;

const DefenseZone = styled(motion.div)`
  position: absolute;
  bottom: 20px;
  left: 20px;
  right: 20px;
  height: 60px;
  background: rgba(76, 175, 80, 0.3);
  border: 2px dashed #4CAF50;
  border-radius: 10px;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 1.2rem;
  color: white;
  font-weight: bold;
`;

const AttackZone = styled(motion.div)`
  position: absolute;
  top: 20px;
  left: 20px;
  right: 20px;
  height: 60px;
  background: rgba(255, 107, 107, 0.3);
  border: 2px dashed #FF6B6B;
  border-radius: 10px;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 1.2rem;
  color: white;
  font-weight: bold;
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

const Timer = styled.div<{ timeLeft: number }>`
  position: absolute;
  top: 2rem;
  left: 50%;
  transform: translateX(-50%);
  background: ${props => props.timeLeft < 30 ? 'rgba(255, 0, 0, 0.9)' : 'rgba(0, 0, 0, 0.8)'};
  color: white;
  padding: 1rem 2rem;
  border-radius: 50px;
  font-size: 1.5rem;
  font-weight: bold;
  text-align: center;
  z-index: 30;
  animation: ${props => props.timeLeft < 30 ? 'pulse 0.5s infinite' : 'none'};
  
  @keyframes pulse {
    0%, 100% { transform: translateX(-50%) scale(1); }
    50% { transform: translateX(-50%) scale(1.1); }
  }
`;

const ActionButtons = styled.div`
  position: absolute;
  bottom: 2rem;
  left: 50%;
  transform: translateX(-50%);
  display: flex;
  gap: 1rem;
  z-index: 30;
`;

const ActionButton = styled(motion.button)<{ action: 'attack' | 'defend' }>`
  background: ${props => props.action === 'attack' ? 
    'linear-gradient(45deg, #FF6B6B, #FF8E8E)' : 
    'linear-gradient(45deg, #4CAF50, #66BB6A)'};
  border: none;
  border-radius: 8px;
  padding: 1rem 2rem;
  color: white;
  font-size: 1.2rem;
  font-weight: bold;
  cursor: pointer;
  
  &:disabled {
    background: #666;
    cursor: not-allowed;
  }
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

const Instructions = styled.div`
  position: absolute;
  bottom: 6rem;
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

const SquidGameFinal: React.FC = () => {
  const navigate = useNavigate();
  const { state, dispatch } = useGame();
  const [gameState, setGameState] = useState<'waiting' | 'playing' | 'won' | 'lost'>('waiting');
  const [timeLeft, setTimeLeft] = useState(120); // 2 minutes
  const [playerRole, setPlayerRole] = useState<'attacker' | 'defender'>('attacker');
  const [playerPosition, setPlayerPosition] = useState({ x: 300, y: 200 });
  const [opponentPosition, setOpponentPosition] = useState({ x: 300, y: 100 });
  const [playerHealth, setPlayerHealth] = useState(100);
  const [opponentHealth, setOpponentHealth] = useState(100);
  const [isPlayerTurn, setIsPlayerTurn] = useState(true);
  const [gameStarted, setGameStarted] = useState(false);
  const [lastAction, setLastAction] = useState<string | null>(null);
  const [round, setRound] = useState(1);

  const gameTimerRef = useRef<NodeJS.Timeout | null>(null);
  const turnTimerRef = useRef<NodeJS.Timeout | null>(null);

  const startGame = useCallback(() => {
    setGameStarted(true);
    setGameState('playing');
    setTimeLeft(120);
    setPlayerRole(Math.random() > 0.5 ? 'attacker' : 'defender');
    setPlayerPosition({ x: 300, y: playerRole === 'attacker' ? 350 : 50 });
    setOpponentPosition({ x: 300, y: playerRole === 'attacker' ? 50 : 350 });
    setPlayerHealth(100);
    setOpponentHealth(100);
    setIsPlayerTurn(true);
    setLastAction(null);
    setRound(1);
    
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

    // Start turn timer
    startTurnTimer();
  }, [playerRole]);

  const startTurnTimer = useCallback(() => {
    turnTimerRef.current = setTimeout(() => {
      if (isPlayerTurn) {
        // Player didn't act in time
        setPlayerHealth(prev => Math.max(0, prev - 20));
        setLastAction('You took too long! -20 health');
      }
      
      // Switch turns
      setIsPlayerTurn(prev => !prev);
      
      // AI opponent turn
      if (!isPlayerTurn) {
        setTimeout(() => {
          performOpponentAction();
        }, 1000);
      } else {
        startTurnTimer();
      }
    }, 10000); // 10 seconds per turn
  }, [isPlayerTurn]);

  const performOpponentAction = useCallback(() => {
    const actions = ['attack', 'defend', 'move'];
    const action = actions[Math.floor(Math.random() * actions.length)];
    
    switch (action) {
      case 'attack':
        const attackDamage = Math.floor(Math.random() * 30) + 10;
        setPlayerHealth(prev => Math.max(0, prev - attackDamage));
        setLastAction(`Opponent attacked! -${attackDamage} health`);
        break;
      case 'defend':
        setOpponentHealth(prev => Math.min(100, prev + 10));
        setLastAction('Opponent defended! +10 health');
        break;
      case 'move':
        setOpponentPosition(prev => ({
          x: Math.max(40, Math.min(560, prev.x + (Math.random() - 0.5) * 100)),
          y: Math.max(40, Math.min(360, prev.y + (Math.random() - 0.5) * 50))
        }));
        setLastAction('Opponent moved to a new position!');
        break;
    }
    
    // Switch back to player turn
    setTimeout(() => {
      setIsPlayerTurn(true);
      setRound(prev => prev + 1);
      startTurnTimer();
    }, 2000);
  }, []);

  const handleAction = useCallback((action: 'attack' | 'defend') => {
    if (!isPlayerTurn || gameState !== 'playing') return;
    
    if (turnTimerRef.current) {
      clearTimeout(turnTimerRef.current);
    }
    
    switch (action) {
      case 'attack':
        const distance = Math.sqrt(
          Math.pow(playerPosition.x - opponentPosition.x, 2) + 
          Math.pow(playerPosition.y - opponentPosition.y, 2)
        );
        
        const maxDistance = 200;
        const accuracy = Math.max(0, 1 - (distance / maxDistance));
        const attackDamage = Math.floor((Math.random() * 25 + 15) * accuracy);
        
        setOpponentHealth(prev => Math.max(0, prev - attackDamage));
        setLastAction(`You attacked! -${attackDamage} damage (${Math.round(accuracy * 100)}% accuracy)`);
        break;
        
      case 'defend':
        setPlayerHealth(prev => Math.min(100, prev + 15));
        setLastAction('You defended! +15 health');
        break;
    }
    
    // Switch to opponent turn
    setIsPlayerTurn(false);
    
    setTimeout(() => {
      performOpponentAction();
    }, 1000);
  }, [isPlayerTurn, gameState, playerPosition, opponentPosition, performOpponentAction]);

  const handlePlayerMove = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    if (!isPlayerTurn || gameState !== 'playing') return;
    
    const rect = e.currentTarget.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    
    // Restrict movement based on role
    if (playerRole === 'defender' && y > 200) return; // Defender stays in upper half
    if (playerRole === 'attacker' && y < 200) return; // Attacker stays in lower half
    
    setPlayerPosition({ x: Math.max(20, Math.min(580, x)), y: Math.max(20, Math.min(380, y)) });
  }, [isPlayerTurn, gameState, playerRole]);

  useEffect(() => {
    if (playerHealth <= 0) {
      setGameState('lost');
    } else if (opponentHealth <= 0) {
      setGameState('won');
    }
  }, [playerHealth, opponentHealth]);

  useEffect(() => {
    if (gameState === 'won') {
      dispatch({ type: 'COMPLETE_GAME', payload: { game: 'squid-game', score: playerHealth * 10 + timeLeft * 5 } });
      if (gameTimerRef.current) clearInterval(gameTimerRef.current);
      if (turnTimerRef.current) clearTimeout(turnTimerRef.current);
    } else if (gameState === 'lost') {
      dispatch({ type: 'LOSE_LIFE' });
      if (gameTimerRef.current) clearInterval(gameTimerRef.current);
      if (turnTimerRef.current) clearTimeout(turnTimerRef.current);
    }
  }, [gameState, playerHealth, timeLeft, dispatch]);

  useEffect(() => {
    return () => {
      if (gameTimerRef.current) clearInterval(gameTimerRef.current);
      if (turnTimerRef.current) clearTimeout(turnTimerRef.current);
    };
  }, []);

  const resetGame = () => {
    setGameState('waiting');
    setGameStarted(false);
    setTimeLeft(120);
    setPlayerRole('attacker');
    setPlayerPosition({ x: 300, y: 200 });
    setOpponentPosition({ x: 300, y: 100 });
    setPlayerHealth(100);
    setOpponentHealth(100);
    setIsPlayerTurn(true);
    setLastAction(null);
    setRound(1);
  };

  return (
    <GameContainer>
      <GameUI>
        <div>Lives: ❤️ {state.player.lives}</div>
        <div>Score: {state.player.score}</div>
        <div>Role: {playerRole === 'attacker' ? '⚔️ Attacker' : '🛡️ Defender'}</div>
        <div>Round: {round}</div>
      </GameUI>

      <Timer timeLeft={timeLeft}>
        {Math.floor(timeLeft / 60)}:{(timeLeft % 60).toString().padStart(2, '0')}
      </Timer>

      <motion.div
        initial={{ scale: 0.8, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={{ duration: 0.5 }}
      >
        <GameField onClick={handlePlayerMove}>
          <SquidShape />
          
          <AttackZone
            animate={{ opacity: playerRole === 'attacker' ? 0.5 : 0.2 }}
          >
            {playerRole === 'attacker' ? 'YOUR ZONE' : 'OPPONENT ZONE'}
          </AttackZone>
          
          <DefenseZone
            animate={{ opacity: playerRole === 'defender' ? 0.5 : 0.2 }}
          >
            {playerRole === 'defender' ? 'YOUR ZONE' : 'OPPONENT ZONE'}
          </DefenseZone>

          <Player
            isAttacker={playerRole === 'attacker'}
            style={{
              left: playerPosition.x - 20,
              top: playerPosition.y - 20,
            }}
            animate={{
              scale: isPlayerTurn ? [1, 1.1, 1] : 1,
              boxShadow: isPlayerTurn ? '0 0 20px #FFD700' : '0 0 10px rgba(255, 255, 255, 0.5)'
            }}
            transition={{
              scale: { duration: 1, repeat: isPlayerTurn ? Infinity : 0 }
            }}
          />

          <Player
            isAttacker={playerRole === 'defender'}
            style={{
              left: opponentPosition.x - 20,
              top: opponentPosition.y - 20,
            }}
            animate={{
              scale: !isPlayerTurn ? [1, 1.1, 1] : 1,
              boxShadow: !isPlayerTurn ? '0 0 20px #FF6B6B' : '0 0 10px rgba(255, 255, 255, 0.5)'
            }}
            transition={{
              scale: { duration: 1, repeat: !isPlayerTurn ? Infinity : 0 }
            }}
          />
        </GameField>
      </motion.div>

      <div style={{ 
        position: 'absolute', 
        bottom: '12rem', 
        left: '50%', 
        transform: 'translateX(-50%)',
        display: 'flex',
        gap: '2rem',
        background: 'rgba(0, 0, 0, 0.8)',
        padding: '1rem',
        borderRadius: '10px',
        color: 'white'
      }}>
        <div>Your Health: <span style={{ color: playerHealth > 50 ? '#4CAF50' : '#FF6B6B' }}>{playerHealth}%</span></div>
        <div>Opponent Health: <span style={{ color: opponentHealth > 50 ? '#4CAF50' : '#FF6B6B' }}>{opponentHealth}%</span></div>
      </div>

      <ActionButtons>
        <ActionButton
          action="attack"
          onClick={() => handleAction('attack')}
          disabled={!isPlayerTurn || gameState !== 'playing'}
          whileHover={{ scale: 1.05 }}
          whileTap={{ scale: 0.95 }}
        >
          ⚔️ Attack
        </ActionButton>
        <ActionButton
          action="defend"
          onClick={() => handleAction('defend')}
          disabled={!isPlayerTurn || gameState !== 'playing'}
          whileHover={{ scale: 1.05 }}
          whileTap={{ scale: 0.95 }}
        >
          🛡️ Defend
        </ActionButton>
      </ActionButtons>

      <Instructions>
        <div style={{ marginBottom: '0.5rem' }}>
          {isPlayerTurn ? 'Your Turn!' : 'Opponent\'s Turn'}
        </div>
        <div style={{ fontSize: '0.8rem', color: '#ccc' }}>
          {lastAction || 'Click to move, then choose your action!'}
        </div>
        <div style={{ fontSize: '0.8rem', color: '#ccc', marginTop: '0.5rem' }}>
          {playerRole === 'attacker' ? 
            'Stay in the lower zone and defeat your opponent!' : 
            'Stay in the upper zone and survive the attacks!'
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
            <h2>The Final Game</h2>
            <p>The ultimate showdown in the traditional Squid Game!</p>
            <p>You'll be randomly assigned as either an attacker or defender.</p>
            <p>Attackers must eliminate the defender, defenders must survive!</p>
            <p>Use strategy, positioning, and timing to win!</p>
            
            <Button onClick={startGame} whileHover={{ scale: 1.05 }}>
              Start Final Game
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
            <h2>🎉 ULTIMATE VICTORY! 🎉</h2>
            <p>You won the final Squid Game!</p>
            <p>You are the sole survivor!</p>
            <p>Final Score: {playerHealth * 10 + timeLeft * 5} points</p>
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
            <h2>💀 FINAL ELIMINATION! 💀</h2>
            <p>You were defeated in the final game!</p>
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

export default SquidGameFinal;