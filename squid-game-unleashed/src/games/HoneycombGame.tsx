import React, { useState, useRef, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import styled from 'styled-components';
import { useGame } from '../context/GameContext';

const GameContainer = styled.div`
  min-height: 100vh;
  background: linear-gradient(135deg, #8B4513 0%, #D2691E 50%, #F4A460 100%);
  position: relative;
  overflow: hidden;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
`;

const CandyContainer = styled.div`
  position: relative;
  width: 400px;
  height: 400px;
  background: #FFD700;
  border-radius: 20px;
  box-shadow: 0 10px 30px rgba(0, 0, 0, 0.3);
  margin: 2rem;
  overflow: hidden;
`;

const Canvas = styled.canvas`
  position: absolute;
  top: 0;
  left: 0;
  cursor: crosshair;
  border-radius: 20px;
`;

const ShapeOverlay = styled.div<{ shape: string }>`
  position: absolute;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  font-size: 120px;
  opacity: 0.3;
  pointer-events: none;
  z-index: 1;
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

const ProgressBar = styled.div`
  position: absolute;
  bottom: 6rem;
  left: 50%;
  transform: translateX(-50%);
  width: 300px;
  height: 10px;
  background: rgba(255, 255, 255, 0.3);
  border-radius: 5px;
  overflow: hidden;
`;

const Progress = styled(motion.div)<{ progress: number }>`
  height: 100%;
  background: ${props => props.progress > 80 ? '#4CAF50' : props.progress > 50 ? '#FFC107' : '#FF5722'};
  border-radius: 5px;
  width: ${props => props.progress}%;
  transition: all 0.3s ease;
`;

const shapes = [
  { name: 'star', symbol: '⭐', path: 'M200,50 L220,150 L320,150 L240,220 L260,320 L200,250 L140,320 L160,220 L80,150 L180,150 Z' },
  { name: 'circle', symbol: '⭕', path: 'M200,50 A150,150 0 1,1 199,50 Z' },
  { name: 'triangle', symbol: '🔺', path: 'M200,50 L350,300 L50,300 Z' },
  { name: 'umbrella', symbol: '☂️', path: 'M200,80 A120,120 0 1,1 200,80 L200,280 M180,260 L220,260' }
];

const HoneycombGame: React.FC = () => {
  const navigate = useNavigate();
  const { state, dispatch } = useGame();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [gameState, setGameState] = useState<'waiting' | 'playing' | 'won' | 'lost'>('waiting');
  const [timeLeft, setTimeLeft] = useState(120); // 2 minutes
  const [selectedShape, setSelectedShape] = useState(shapes[0]);
  const [isDrawing, setIsDrawing] = useState(false);
  const [cutProgress, setCutProgress] = useState(0);
  const [cutPath, setCutPath] = useState<{x: number, y: number}[]>([]);
  const [gameStarted, setGameStarted] = useState(false);
  const [cracks, setCracks] = useState<{x: number, y: number}[]>([]);

  const gameTimerRef = useRef<NodeJS.Timeout | null>(null);

  const initializeCanvas = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Clear canvas
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    
    // Draw honeycomb background texture
    ctx.fillStyle = '#FFD700';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    
    // Add honeycomb pattern
    ctx.strokeStyle = '#FFA500';
    ctx.lineWidth = 1;
    for (let i = 0; i < canvas.width; i += 20) {
      for (let j = 0; j < canvas.height; j += 20) {
        ctx.beginPath();
        ctx.arc(i, j, 3, 0, 2 * Math.PI);
        ctx.stroke();
      }
    }

    // Draw the shape outline
    ctx.strokeStyle = '#8B4513';
    ctx.lineWidth = 3;
    ctx.setLineDash([5, 5]);
    
    const path = new Path2D(selectedShape.path);
    ctx.stroke(path);
    ctx.setLineDash([]);
  }, [selectedShape]);

  const startGame = useCallback(() => {
    const randomShape = shapes[Math.floor(Math.random() * shapes.length)];
    setSelectedShape(randomShape);
    setGameStarted(true);
    setGameState('playing');
    setTimeLeft(120);
    setCutProgress(0);
    setCutPath([]);
    setCracks([]);
    
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
  }, []);

  const calculateProgress = useCallback((path: {x: number, y: number}[]) => {
    if (path.length < 2) return 0;
    
    // Simple progress calculation based on path length and coverage
    const totalLength = path.reduce((acc, point, index) => {
      if (index === 0) return 0;
      const prev = path[index - 1];
      return acc + Math.sqrt(Math.pow(point.x - prev.x, 2) + Math.pow(point.y - prev.y, 2));
    }, 0);
    
    // Estimate required path length based on shape perimeter
    const estimatedPerimeter = selectedShape.name === 'circle' ? 942 : 
                              selectedShape.name === 'star' ? 1200 :
                              selectedShape.name === 'triangle' ? 900 : 1000;
    
    return Math.min((totalLength / estimatedPerimeter) * 100, 100);
  }, [selectedShape]);

  const handleMouseDown = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    if (gameState !== 'playing') return;
    
    setIsDrawing(true);
    const canvas = canvasRef.current;
    if (!canvas) return;
    
    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    
    setCutPath([{x, y}]);
  }, [gameState]);

  const handleMouseMove = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!isDrawing || gameState !== 'playing') return;
    
    const canvas = canvasRef.current;
    if (!canvas) return;
    
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    
    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    
    setCutPath(prev => {
      const newPath = [...prev, {x, y}];
      
      // Draw the cut line
      ctx.strokeStyle = '#8B0000';
      ctx.lineWidth = 2;
      ctx.beginPath();
      if (prev.length > 0) {
        const lastPoint = prev[prev.length - 1];
        ctx.moveTo(lastPoint.x, lastPoint.y);
        ctx.lineTo(x, y);
      }
      ctx.stroke();
      
      // Check for cracks (random chance when cutting too fast)
      const speed = prev.length > 0 ? 
        Math.sqrt(Math.pow(x - prev[prev.length - 1].x, 2) + Math.pow(y - prev[prev.length - 1].y, 2)) : 0;
      
      if (speed > 15 && Math.random() < 0.1) {
        setCracks(prevCracks => [...prevCracks, {x: x + (Math.random() - 0.5) * 20, y: y + (Math.random() - 0.5) * 20}]);
        
        // Draw crack
        ctx.strokeStyle = '#8B0000';
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.moveTo(x, y);
        ctx.lineTo(x + (Math.random() - 0.5) * 30, y + (Math.random() - 0.5) * 30);
        ctx.stroke();
      }
      
      // Update progress
      const progress = calculateProgress(newPath);
      setCutProgress(progress);
      
      // Check win condition
      if (progress >= 95 && cracks.length === 0) {
        setGameState('won');
      } else if (cracks.length >= 3) {
        setGameState('lost');
      }
      
      return newPath;
    });
  }, [isDrawing, gameState, calculateProgress, cracks.length]);

  const handleMouseUp = useCallback(() => {
    setIsDrawing(false);
  }, []);

  useEffect(() => {
    if (gameStarted) {
      initializeCanvas();
    }
  }, [gameStarted, initializeCanvas]);

  useEffect(() => {
    if (gameState === 'won') {
      dispatch({ type: 'COMPLETE_GAME', payload: { game: 'honeycomb', score: timeLeft * 5 + (100 - cutPath.length) } });
      if (gameTimerRef.current) clearInterval(gameTimerRef.current);
    } else if (gameState === 'lost') {
      dispatch({ type: 'LOSE_LIFE' });
      if (gameTimerRef.current) clearInterval(gameTimerRef.current);
    }
  }, [gameState, timeLeft, cutPath.length, dispatch]);

  useEffect(() => {
    return () => {
      if (gameTimerRef.current) clearInterval(gameTimerRef.current);
    };
  }, []);

  const resetGame = () => {
    setGameState('waiting');
    setGameStarted(false);
    setTimeLeft(120);
    setCutProgress(0);
    setCutPath([]);
    setCracks([]);
  };

  return (
    <GameContainer>
      <GameUI>
        <div>Time: {Math.floor(timeLeft / 60)}:{(timeLeft % 60).toString().padStart(2, '0')}</div>
        <div>Lives: ❤️ {state.player.lives}</div>
        <div>Score: {state.player.score}</div>
        <div>Shape: {selectedShape.symbol}</div>
      </GameUI>

      <Timer timeLeft={timeLeft}>
        {Math.floor(timeLeft / 60)}:{(timeLeft % 60).toString().padStart(2, '0')}
      </Timer>

      <motion.div
        initial={{ scale: 0.8, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={{ duration: 0.5 }}
      >
        <CandyContainer>
          <ShapeOverlay shape={selectedShape.name}>
            {selectedShape.symbol}
          </ShapeOverlay>
          <Canvas
            ref={canvasRef}
            width={400}
            height={400}
            onMouseDown={handleMouseDown}
            onMouseMove={handleMouseMove}
            onMouseUp={handleMouseUp}
            onMouseLeave={handleMouseUp}
          />
        </CandyContainer>
      </motion.div>

      <ProgressBar>
        <Progress progress={cutProgress} />
      </ProgressBar>

      <Instructions>
        <div style={{ marginBottom: '0.5rem' }}>
          Carefully cut along the shape outline
        </div>
        <div style={{ fontSize: '0.8rem', color: '#ccc' }}>
          Cut slowly to avoid cracks! Progress: {Math.round(cutProgress)}%
        </div>
        {cracks.length > 0 && (
          <div style={{ color: '#ff6b6b', fontWeight: 'bold' }}>
            Cracks: {cracks.length}/3 ⚠️
          </div>
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
            <h2>Honeycomb Challenge</h2>
            <p>Cut out the shape from the honeycomb candy without breaking it!</p>
            <p>Move your mouse slowly and carefully along the dotted outline.</p>
            <p>If you create 3 cracks, you lose!</p>
            
            <div style={{ margin: '1rem 0', display: 'flex', justifyContent: 'center', gap: '1rem' }}>
              {shapes.map(shape => (
                <motion.div
                  key={shape.name}
                  onClick={() => setSelectedShape(shape)}
                  style={{
                    fontSize: '2rem',
                    cursor: 'pointer',
                    padding: '0.5rem',
                    border: selectedShape.name === shape.name ? '2px solid #ff6b6b' : '2px solid transparent',
                    borderRadius: '8px'
                  }}
                  whileHover={{ scale: 1.2 }}
                  whileTap={{ scale: 0.9 }}
                >
                  {shape.symbol}
                </motion.div>
              ))}
            </div>
            
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
            <h2>🎉 PERFECT CUT! 🎉</h2>
            <p>You successfully extracted the {selectedShape.symbol} shape!</p>
            <p>Score: {timeLeft * 5 + (100 - cutPath.length)} points</p>
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
            <h2>💀 CANDY BROKEN! 💀</h2>
            <p>{cracks.length >= 3 ? 'Too many cracks!' : 'Time ran out!'}</p>
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

export default HoneycombGame;