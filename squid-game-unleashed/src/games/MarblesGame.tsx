import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import styled from 'styled-components';
import { useGame } from '../context/GameContext';

const GameContainer = styled.div`
  min-height: 100vh;
  background: linear-gradient(135deg, #4A4A4A 0%, #2C2C2C 50%, #1A1A1A 100%);
  position: relative;
  overflow: hidden;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
`;

const GameArea = styled.div`
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 2rem;
  padding: 2rem;
  max-width: 800px;
  width: 100%;
`;

const HandContainer = styled.div`
  display: flex;
  justify-content: space-around;
  width: 100%;
  margin: 2rem 0;
`;

const Hand = styled(motion.div)<{ isPlayer: boolean; isRevealed: boolean }>`
  width: 200px;
  height: 150px;
  background: ${props => props.isPlayer ? '#4CAF50' : '#F44336'};
  border-radius: 50% 50% 40% 40%;
  position: relative;
  cursor: ${props => props.isPlayer ? 'default' : 'pointer'};
  box-shadow: 0 10px 20px rgba(0, 0, 0, 0.3);
  border: 4px solid ${props => props.isRevealed ? '#FFD700' : 'transparent'};
  
  &::before {
    content: '${props => props.isPlayer ? '👤' : '🤖'}';
    position: absolute;
    top: -30px;
    left: 50%;
    transform: translateX(-50%);
    font-size: 2rem;
  }
  
  &::after {
    content: '${props => props.isRevealed ? (props.isPlayer ? '👋' : '✋') : '✊'}';
    position: absolute;
    top: 50%;
    left: 50%;
    transform: translate(-50%, -50%);
    font-size: 4rem;
  }
`;

const MarbleCount = styled.div<{ isPlayer: boolean }>`
  position: absolute;
  bottom: -40px;
  left: 50%;
  transform: translateX(-50%);
  background: rgba(0, 0, 0, 0.8);
  color: white;
  padding: 0.5rem 1rem;
  border-radius: 20px;
  font-weight: bold;
  border: 2px solid ${props => props.isPlayer ? '#4CAF50' : '#F44336'};
`;

const BettingArea = styled.div`
  background: rgba(255, 255, 255, 0.1);
  border-radius: 15px;
  padding: 2rem;
  text-align: center;
  backdrop-filter: blur(10px);
  border: 2px solid rgba(255, 255, 255, 0.2);
  min-width: 400px;
`;

const MarbleSelector = styled.div`
  display: flex;
  justify-content: center;
  gap: 1rem;
  margin: 1rem 0;
  flex-wrap: wrap;
`;

const MarbleOption = styled(motion.button)<{ selected: boolean }>`
  width: 60px;
  height: 60px;
  border-radius: 50%;
  border: 3px solid ${props => props.selected ? '#FFD700' : '#666'};
  background: ${props => props.selected ? '#FF6B6B' : '#333'};
  color: white;
  font-size: 1.2rem;
  font-weight: bold;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  
  &:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }
`;

const GuessButtons = styled.div`
  display: flex;
  justify-content: center;
  gap: 1rem;
  margin: 1rem 0;
`;

const GuessButton = styled(motion.button)<{ type: 'odd' | 'even' }>`
  background: ${props => props.type === 'odd' ? 
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

const RoundInfo = styled.div`
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

const MarblesGame: React.FC = () => {
  const navigate = useNavigate();
  const { state, dispatch } = useGame();
  const [gameState, setGameState] = useState<'waiting' | 'betting' | 'guessing' | 'revealing' | 'won' | 'lost'>('waiting');
  const [playerMarbles, setPlayerMarbles] = useState(10);
  const [opponentMarbles, setOpponentMarbles] = useState(10);
  const [playerBet, setPlayerBet] = useState(1);
  const [opponentBet, setOpponentBet] = useState(0);
  const [playerGuess, setPlayerGuess] = useState<'odd' | 'even' | null>(null);
  const [round, setRound] = useState(1);
  const [gameStarted, setGameStarted] = useState(false);
  const [showResult, setShowResult] = useState(false);
  const [lastRoundResult, setLastRoundResult] = useState<{
    playerWon: boolean;
    opponentHad: number;
    wasOdd: boolean;
  } | null>(null);

  const gameTimerRef = useRef<NodeJS.Timeout | null>(null);

  const startGame = useCallback(() => {
    setGameStarted(true);
    setGameState('betting');
    setPlayerMarbles(10);
    setOpponentMarbles(10);
    setPlayerBet(1);
    setRound(1);
    setShowResult(false);
    setLastRoundResult(null);
  }, []);

  const handleBetConfirm = useCallback(() => {
    if (playerBet > playerMarbles) return;
    
    // Opponent makes a bet (AI logic)
    const maxOpponentBet = Math.min(opponentMarbles, playerBet * 2);
    const minOpponentBet = Math.max(1, Math.min(opponentMarbles, Math.floor(playerBet / 2)));
    setOpponentBet(Math.floor(Math.random() * (maxOpponentBet - minOpponentBet + 1)) + minOpponentBet);
    
    setGameState('guessing');
  }, [playerBet, playerMarbles, opponentMarbles]);

  const handleGuess = useCallback((guess: 'odd' | 'even') => {
    setPlayerGuess(guess);
    setGameState('revealing');
    
    // Simulate opponent's marbles (1-20 range)
    const opponentActualMarbles = Math.floor(Math.random() * 20) + 1;
    const isOdd = opponentActualMarbles % 2 === 1;
    const playerWon = (guess === 'odd' && isOdd) || (guess === 'even' && !isOdd);
    
    setLastRoundResult({
      playerWon,
      opponentHad: opponentActualMarbles,
      wasOdd: isOdd
    });
    
    // Update marble counts
    setTimeout(() => {
      if (playerWon) {
        setPlayerMarbles(prev => prev + opponentBet);
        setOpponentMarbles(prev => prev - opponentBet);
      } else {
        setPlayerMarbles(prev => prev - playerBet);
        setOpponentMarbles(prev => prev + playerBet);
      }
      
      setShowResult(true);
      
      // Check win/lose conditions
      setTimeout(() => {
        if (playerMarbles + (playerWon ? opponentBet : -playerBet) <= 0) {
          setGameState('lost');
        } else if (opponentMarbles + (playerWon ? -opponentBet : playerBet) <= 0) {
          setGameState('won');
        } else {
          // Continue to next round
          setRound(prev => prev + 1);
          setGameState('betting');
          setPlayerBet(1);
          setPlayerGuess(null);
          setShowResult(false);
          setLastRoundResult(null);
        }
      }, 3000);
    }, 2000);
  }, [playerBet, opponentBet, playerMarbles, opponentMarbles]);

  useEffect(() => {
    if (gameState === 'won') {
      dispatch({ type: 'COMPLETE_GAME', payload: { game: 'marbles', score: playerMarbles * 50 } });
    } else if (gameState === 'lost') {
      dispatch({ type: 'LOSE_LIFE' });
    }
  }, [gameState, playerMarbles, dispatch]);

  useEffect(() => {
    return () => {
      if (gameTimerRef.current) clearTimeout(gameTimerRef.current);
    };
  }, []);

  const resetGame = () => {
    setGameState('waiting');
    setGameStarted(false);
    setPlayerMarbles(10);
    setOpponentMarbles(10);
    setPlayerBet(1);
    setOpponentBet(0);
    setPlayerGuess(null);
    setRound(1);
    setShowResult(false);
    setLastRoundResult(null);
  };

  return (
    <GameContainer>
      <GameUI>
        <div>Lives: ❤️ {state.player.lives}</div>
        <div>Score: {state.player.score}</div>
      </GameUI>

      <RoundInfo>
        Round {round} - Marbles Game
      </RoundInfo>

      <GameArea>
        <HandContainer>
          <div style={{ textAlign: 'center' }}>
            <Hand 
              isPlayer={true} 
              isRevealed={gameState === 'revealing' || showResult}
              animate={{ 
                scale: gameState === 'betting' ? [1, 1.05, 1] : 1,
                rotateY: gameState === 'revealing' ? [0, 180, 0] : 0
              }}
              transition={{ 
                scale: { duration: 1, repeat: gameState === 'betting' ? Infinity : 0 },
                rotateY: { duration: 1 }
              }}
            />
            <MarbleCount isPlayer={true}>
              You: {playerMarbles} marbles
            </MarbleCount>
          </div>

          <div style={{ textAlign: 'center' }}>
            <Hand 
              isPlayer={false} 
              isRevealed={gameState === 'revealing' || showResult}
              animate={{ 
                scale: gameState === 'guessing' ? [1, 1.05, 1] : 1,
                rotateY: gameState === 'revealing' ? [0, -180, 0] : 0
              }}
              transition={{ 
                scale: { duration: 1, repeat: gameState === 'guessing' ? Infinity : 0 },
                rotateY: { duration: 1 }
              }}
            />
            <MarbleCount isPlayer={false}>
              Opponent: {opponentMarbles} marbles
            </MarbleCount>
          </div>
        </HandContainer>

        <BettingArea>
          {gameState === 'betting' && (
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
            >
              <h3>Place Your Bet</h3>
              <p>Choose how many marbles to bet:</p>
              
              <MarbleSelector>
                {Array.from({ length: Math.min(playerMarbles, 5) }, (_, i) => i + 1).map(num => (
                  <MarbleOption
                    key={num}
                    selected={playerBet === num}
                    onClick={() => setPlayerBet(num)}
                    whileHover={{ scale: 1.1 }}
                    whileTap={{ scale: 0.9 }}
                  >
                    {num}
                  </MarbleOption>
                ))}
              </MarbleSelector>
              
              <Button 
                onClick={handleBetConfirm}
                disabled={playerBet > playerMarbles}
                whileHover={{ scale: 1.05 }}
              >
                Confirm Bet ({playerBet} marbles)
              </Button>
            </motion.div>
          )}

          {gameState === 'guessing' && (
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
            >
              <h3>Make Your Guess</h3>
              <p>You bet {playerBet} marbles</p>
              <p>Opponent bet {opponentBet} marbles</p>
              <p>Guess if the opponent has ODD or EVEN marbles:</p>
              
              <GuessButtons>
                <GuessButton
                  type="odd"
                  onClick={() => handleGuess('odd')}
                  whileHover={{ scale: 1.05 }}
                  whileTap={{ scale: 0.95 }}
                >
                  ODD
                </GuessButton>
                <GuessButton
                  type="even"
                  onClick={() => handleGuess('even')}
                  whileHover={{ scale: 1.05 }}
                  whileTap={{ scale: 0.95 }}
                >
                  EVEN
                </GuessButton>
              </GuessButtons>
            </motion.div>
          )}

          {gameState === 'revealing' && (
            <motion.div
              initial={{ opacity: 0, scale: 0.8 }}
              animate={{ opacity: 1, scale: 1 }}
            >
              <h3>Revealing...</h3>
              <p>You guessed: {playerGuess?.toUpperCase()}</p>
              <motion.div
                animate={{ rotate: 360 }}
                transition={{ duration: 2, repeat: Infinity, ease: "linear" }}
                style={{ fontSize: '3rem', margin: '1rem 0' }}
              >
                🎲
              </motion.div>
            </motion.div>
          )}

          {showResult && lastRoundResult && (
            <motion.div
              initial={{ opacity: 0, scale: 0.5 }}
              animate={{ opacity: 1, scale: 1 }}
            >
              <h3>{lastRoundResult.playerWon ? '🎉 YOU WON!' : '💀 YOU LOST!'}</h3>
              <p>Opponent had {lastRoundResult.opponentHad} marbles</p>
              <p>That's {lastRoundResult.wasOdd ? 'ODD' : 'EVEN'}</p>
              <p>You guessed: {playerGuess?.toUpperCase()}</p>
              
              {lastRoundResult.playerWon ? (
                <p style={{ color: '#4CAF50' }}>You gained {opponentBet} marbles!</p>
              ) : (
                <p style={{ color: '#F44336' }}>You lost {playerBet} marbles!</p>
              )}
            </motion.div>
          )}
        </BettingArea>
      </GameArea>

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
            <h2>Marbles Game</h2>
            <p>A game of wit and deception!</p>
            <p>Bet your marbles and guess if your opponent has an odd or even number.</p>
            <p>Win all their marbles to survive!</p>
            
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
            <p>You won all the marbles!</p>
            <p>Score: {playerMarbles * 50} points</p>
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
            <p>You lost all your marbles!</p>
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

export default MarblesGame;