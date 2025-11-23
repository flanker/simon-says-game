import AsyncStorage from '@react-native-async-storage/async-storage';
import { AudioContext } from 'react-native-audio-api';
import React, { useEffect, useState, useRef } from 'react';
import { Alert, Dimensions, StyleSheet, Text, View, AppState, Pressable } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';

const { width } = Dimensions.get('window');
const gameBoardSize = width * 0.9;
const padSize = gameBoardSize / 2 - 16;


enum Color {
  Green = 'green',
  Red = 'red',
  Yellow = 'yellow',
  Blue = 'blue',
}

const colors = [Color.Green, Color.Red, Color.Yellow, Color.Blue];

const FREQUENCIES: Record<Color, number> = {
  [Color.Green]: 329.63, // E4
  [Color.Red]: 261.63,   // C4
  [Color.Yellow]: 220.00, // A3
  [Color.Blue]: 164.81   // E3
};
const ERROR_FREQ = 110; // A2

const HIGH_SCORE_KEY = 'simon_says_high_score';

// =================================================================
// GamePad Component
// =================================================================
interface GamePadProps {
    color: Color;
    isActive: boolean;
    onClick: (color: Color) => void;
    disabled: boolean;
}

const GamePad: React.FC<GamePadProps> = ({ color, isActive, onClick, disabled }) => {
    const [isPressed, setIsPressed] = useState(false);

    const padStyles = [
        styles.padBase,
        padColorStyles[color].base,
        (isActive || isPressed) && padColorStyles[color].active,
        (isActive || isPressed) && styles.padActive,
        isPressed && styles.padPressed,
    ];

    return (
        <Pressable
            onPressIn={() => setIsPressed(true)}
            onPressOut={() => setIsPressed(false)}
            onPress={() => !disabled && onClick(color)}
            disabled={disabled}
            style={padStyles}
        >
            <LinearGradient
                colors={['rgba(255, 255, 255, 0.4)', 'transparent']}
                style={styles.glossyOverlay}
            />
        </Pressable>
    );
};

// =================================================================
// Main Game Component
// =================================================================
export default function Game() {
  const [score, setScore] = useState(0);
  const [highScore, setHighScore] = useState(0);
  const [gameStarted, setGameStarted] = useState(false);
  const [sequence, setSequence] = useState<Color[]>([]);
  const [playerSequence, setPlayerSequence] = useState<Color[]>([]);
  const [activeColor, setActiveColor] = useState<string | null>(null);
  const [isPlayerTurn, setIsPlayerTurn] = useState(false);
  
  const audioCtx = useRef<AudioContext | null>(null);

  useEffect(() => {
    audioCtx.current = new AudioContext();
    const handleAppStateChange = (nextAppState: any) => {
        if (nextAppState === 'active' && audioCtx.current?.state === 'suspended') {
            audioCtx.current.resume();
        }
    };
    const subscription = AppState.addEventListener('change', handleAppStateChange);
    return () => {
        subscription.remove();
        audioCtx.current?.close();
    };
  }, []);

  const playTone = (color: Color | 'error', duration: number = 0.4) => {
    const ctx = audioCtx.current;
    if (!ctx) return;
    const oscillator = ctx.createOscillator();
    const gainNode = ctx.createGain();
    const freq = color === 'error' ? ERROR_FREQ : FREQUENCIES[color];
    const type = color === 'error' ? 'sawtooth' : 'sine';
    oscillator.type = type;
    oscillator.frequency.setValueAtTime(freq, ctx.currentTime);
    gainNode.gain.setValueAtTime(0, ctx.currentTime);
    gainNode.gain.linearRampToValueAtTime(0.2, ctx.currentTime + 0.05);
    gainNode.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + duration);
    oscillator.connect(gainNode);
    gainNode.connect(ctx.destination);
    oscillator.start(ctx.currentTime);
    oscillator.stop(ctx.currentTime + duration);
  };

  useEffect(() => {
    const loadHighScore = async () => {
      try {
        const storedHighScore = await AsyncStorage.getItem(HIGH_SCORE_KEY);
        if (storedHighScore !== null) {
          setHighScore(parseInt(storedHighScore, 10));
        }
      } catch (error) {
        console.error('Error loading high score', error);
      }
    };
    loadHighScore();
  }, []);

  const saveHighScore = async (newHighScore: number) => {
    try {
      await AsyncStorage.setItem(HIGH_SCORE_KEY, newHighScore.toString());
    } catch (error) {
      console.error('Error saving high score', error);
    }
  };

  const handleStartGame = () => {
    setGameStarted(true);
    setScore(0);
    setSequence([]);
    setPlayerSequence([]);
    setTimeout(addNewColorToSequence, 500);
  };

  const addNewColorToSequence = () => {
    setIsPlayerTurn(false);
    const newColor = colors[Math.floor(Math.random() * colors.length)];
    const newSequence = [...sequence, newColor];
    setSequence(newSequence);
    playSequence(newSequence);
  };

  const playSequence = async (seq: Color[]) => {
    await new Promise(resolve => setTimeout(resolve, 300));
    for (let i = 0; i < seq.length; i++) {
      const color = seq[i];
      setActiveColor(color);
      playTone(color);
      await new Promise(resolve => setTimeout(resolve, 600));
      setActiveColor(null);
      await new Promise(resolve => setTimeout(resolve, 100));
    }
    setPlayerSequence([]);
    setIsPlayerTurn(true);
  };

  const handleColorPress = (color: Color) => {
    if (!gameStarted || !isPlayerTurn) return;
    playTone(color);
    const newPlayerSequence = [...playerSequence, color];
    if (newPlayerSequence[newPlayerSequence.length - 1] !== sequence[newPlayerSequence.length - 1]) {
      playTone('error', 0.8);
      endGame();
      return;
    }
    setPlayerSequence(newPlayerSequence);
    if (newPlayerSequence.length === sequence.length) {
      setScore(score + 1);
      setTimeout(addNewColorToSequence, 1000);
    }
  };

  const endGame = () => {
    Alert.alert('Game Over!', `Your score: ${score}`);
    if (score > highScore) {
      setHighScore(score);
      saveHighScore(score);
    }
    setGameStarted(false);
    setSequence([]);
    setPlayerSequence([]);
  };

  return (
    <View style={styles.container}>
        <View style={styles.header}>
            <Text style={styles.title}>Simon Says</Text>
            <View style={styles.scoreContainer}>
                <Text style={styles.scoreText}>Score: {score}</Text>
                <Text style={styles.scoreText}>High Score: {highScore}</Text>
            </View>
        </View>

        <View style={styles.gameBoard}>
            <View style={styles.row}>
                <GamePad color={Color.Green} onClick={handleColorPress} disabled={!isPlayerTurn} isActive={activeColor === Color.Green} />
                <GamePad color={Color.Red} onClick={handleColorPress} disabled={!isPlayerTurn} isActive={activeColor === Color.Red} />
            </View>
            <View style={styles.row}>
                <GamePad color={Color.Yellow} onClick={handleColorPress} disabled={!isPlayerTurn} isActive={activeColor === Color.Yellow} />
                <GamePad color={Color.Blue} onClick={handleColorPress} disabled={!isPlayerTurn} isActive={activeColor === Color.Blue} />
            </View>
        </View>

        <Pressable style={({pressed}) => [styles.startButton, pressed && styles.startButtonActive]} onPress={!gameStarted ? handleStartGame : endGame}>
          <Text style={styles.startButtonText}>{!gameStarted ? 'Start Game' : 'Restart Game'}</Text>
        </Pressable>
    </View>
  );
}

// =================================================================
// Styles
// =================================================================
const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#2D3748', // gray-800
    alignItems: 'center',
    justifyContent: 'space-around',
    paddingVertical: 40,
  },
  header: {
    alignItems: 'center',
  },
  title: {
    fontSize: 48,
    fontWeight: 'bold',
    color: '#E2E8F0', // gray-200
    letterSpacing: 2,
  },
  scoreContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    width: '80%',
    marginTop: 10,
  },
  scoreText: {
    fontSize: 20,
    color: '#A0AEC0', // gray-400
    fontWeight: '600',
  },
  gameBoard: {
    width: gameBoardSize,
    height: gameBoardSize,
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    alignContent: 'space-between',
  },
  padBase: {
    width: padSize,
    height: padSize,
    borderRadius: 24, // rounded-2xl is 1rem = 16px, using a bit more for aesthetics
    borderBottomWidth: 8,
    overflow: 'hidden',
  },
  padActive: {
      borderBottomWidth: 0,
      transform: [{ translateY: 4 }],
      shadowRadius: 20,
      shadowOpacity: 0.8,
      elevation: 20,
  },
  padPressed: {
    transform: [{ translateY: 4 }, { scale: 0.98 }],
    borderBottomWidth: 0,
  },
  glossyOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: '50%',
    borderRadius: 24,
  },
  startButton: {
    backgroundColor: '#4A5568', // gray-600
    paddingVertical: 15,
    paddingHorizontal: 40,
    borderRadius: 15,
    borderWidth: 1,
    borderColor: '#2D3748', // gray-800
    borderTopColor: '#718096', // gray-500
  },
  startButtonActive: {
    backgroundColor: '#2D3748', // gray-800
    borderColor: '#1A202C', // gray-900
    borderTopColor: '#4A5568', // gray-600
  },
  startButtonText: {
    color: '#E2E8F0', // gray-200
    fontSize: 20,
    fontWeight: 'bold',
  },
  // Keep row styles for the gameboard grid
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    width: '100%',
  },
});

const padColorStyles = {
    [Color.Green]: StyleSheet.create({
        base: { backgroundColor: '#2F855A', borderColor: '#276749' }, // green-600, green-800
        active: { backgroundColor: '#68D391', shadowColor: '#68D391' }, // green-400
    }),
    [Color.Red]: StyleSheet.create({
        base: { backgroundColor: '#C53030', borderColor: '#9B2C2C' }, // red-600, red-800
        active: { backgroundColor: '#FCA5A5', shadowColor: '#FCA5A5' }, // red-400
    }),
    [Color.Yellow]: StyleSheet.create({
        base: { backgroundColor: '#D69E2E', borderColor: '#B7791F' }, // yellow-500, yellow-700
        active: { backgroundColor: '#F6E05E', shadowColor: '#F6E05E' }, // yellow-300
    }),
    [Color.Blue]: StyleSheet.create({
        base: { backgroundColor: '#2B6CB0', borderColor: '#2C5282' }, // blue-600, blue-800
        active: { backgroundColor: '#63B3ED', shadowColor: '#63B3ED' }, // blue-400
    }),
};
