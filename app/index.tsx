import AsyncStorage from "@react-native-async-storage/async-storage";
import { LinearGradient } from "expo-linear-gradient";
import React, { useCallback, useEffect, useRef, useState } from "react";
import { AppState, Dimensions, Pressable, StyleSheet, Text, View } from "react-native";
import { AudioContext } from "react-native-audio-api";

const { width, height } = Dimensions.get("window");
const gameBoardSize = Math.min(width, height) * 0.75;
const GAP = 16;
const PADDING = 20;
const padSize = (gameBoardSize - PADDING * 2 - GAP) / 2;

enum Color {
  Green = "green",
  Red = "red",
  Yellow = "yellow",
  Blue = "blue",
}

const colors = [Color.Green, Color.Red, Color.Yellow, Color.Blue];

const FREQUENCIES: Record<Color, number> = {
  [Color.Green]: 329.63, // E4
  [Color.Red]: 261.63, // C4
  [Color.Yellow]: 220.0, // A3
  [Color.Blue]: 164.81, // E3
};
const ERROR_FREQ = 110; // A2

const HIGH_SCORE_KEY = "simon_says_high_score";

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
      <LinearGradient colors={["rgba(255, 255, 255, 0.4)", "transparent"]} style={styles.glossyOverlay} />
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
  const [gameOver, setGameOver] = useState(false);
  const [sequence, setSequence] = useState<Color[]>([]);
  const [playerSequence, setPlayerSequence] = useState<Color[]>([]);
  const [activeColor, setActiveColor] = useState<string | null>(null);
  const [isPlayerTurn, setIsPlayerTurn] = useState(false);

  const audioCtx = useRef<AudioContext | null>(null);

  useEffect(() => {
    audioCtx.current = new AudioContext();
    const handleAppStateChange = (nextAppState: any) => {
      if (nextAppState === "active" && audioCtx.current?.state === "suspended") {
        audioCtx.current.resume();
      }
    };
    const subscription = AppState.addEventListener("change", handleAppStateChange);
    return () => {
      subscription.remove();
      audioCtx.current?.close();
    };
  }, []);

  const playTone = (color: Color | "error", duration: number = 0.4) => {
    const ctx = audioCtx.current;
    if (!ctx) return;
    const oscillator = ctx.createOscillator();
    const gainNode = ctx.createGain();
    const freq = color === "error" ? ERROR_FREQ : FREQUENCIES[color];
    const type = color === "error" ? "sawtooth" : "sine";
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

  const playSequence = useCallback(async (seq: Color[]) => {
    await new Promise((resolve) => setTimeout(resolve, 300));
    for (let i = 0; i < seq.length; i++) {
      const color = seq[i];
      setActiveColor(color);
      playTone(color);
      await new Promise((resolve) => setTimeout(resolve, 600));
      setActiveColor(null);
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
    setPlayerSequence([]);
    setIsPlayerTurn(true);
  }, []);

  useEffect(() => {
    const loadHighScore = async () => {
      try {
        const storedHighScore = await AsyncStorage.getItem(HIGH_SCORE_KEY);
        if (storedHighScore !== null) {
          setHighScore(parseInt(storedHighScore, 10));
        }
      } catch (error) {
        console.error("Error loading high score", error);
      }
    };
    loadHighScore();
  }, []);

  // Play sequence when it changes
  useEffect(() => {
    if (gameStarted && sequence.length > 0 && !gameOver) {
      playSequence(sequence);
    }
  }, [sequence, gameStarted, gameOver, playSequence]);

  const saveHighScore = async (newHighScore: number) => {
    try {
      await AsyncStorage.setItem(HIGH_SCORE_KEY, newHighScore.toString());
    } catch (error) {
      console.error("Error saving high score", error);
    }
  };

  const handleStartGame = () => {
    setGameStarted(true);
    setGameOver(false);
    setScore(0);
    setPlayerSequence([]);
    setIsPlayerTurn(false);
    setActiveColor(null);

    // Start with a fresh sequence
    const firstColor = colors[Math.floor(Math.random() * colors.length)];
    setSequence([firstColor]);
  };

  const addNewColorToSequence = () => {
    setIsPlayerTurn(false);
    setSequence((prev) => {
      const newColor = colors[Math.floor(Math.random() * colors.length)];
      return [...prev, newColor];
    });
  };

  const handleColorPress = (color: Color) => {
    if (!gameStarted || !isPlayerTurn || gameOver) return;
    playTone(color);
    const newPlayerSequence = [...playerSequence, color];
    if (newPlayerSequence[newPlayerSequence.length - 1] !== sequence[newPlayerSequence.length - 1]) {
      playTone("error", 0.8);
      setGameOver(true);
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
      {/* Header */}
      <View style={styles.header}>
        <View style={styles.titleSection}>
          <Text style={styles.title}>SIMON</Text>
          <Text style={styles.titleAccent}>SAYS</Text>
          <Text style={styles.subtitle}>Memory Game</Text>
        </View>
        <View style={styles.highScoreSection}>
          <Text style={styles.highScoreLabel}>BEST</Text>
          <Text style={styles.highScoreValue}>{highScore}</Text>
        </View>
      </View>

      {/* Current Score Display - iOS Style */}
      <View style={styles.currentScoreDisplay}>
        <Text style={styles.currentScoreNumber}>{score}</Text>
        <View style={styles.currentScoreLabelContainer}>
          <Text style={styles.currentScoreLabel}>CURRENT SCORE</Text>
        </View>
      </View>

      {/* Game Board - Circular Container */}
      <View style={styles.gameBoardContainer}>
        <View style={styles.gameBoard}>
          <View style={styles.padsGrid}>
            <GamePad
              color={Color.Green}
              onClick={handleColorPress}
              disabled={!isPlayerTurn || gameOver}
              isActive={activeColor === Color.Green}
            />
            <GamePad
              color={Color.Red}
              onClick={handleColorPress}
              disabled={!isPlayerTurn || gameOver}
              isActive={activeColor === Color.Red}
            />
            <GamePad
              color={Color.Yellow}
              onClick={handleColorPress}
              disabled={!isPlayerTurn || gameOver}
              isActive={activeColor === Color.Yellow}
            />
            <GamePad
              color={Color.Blue}
              onClick={handleColorPress}
              disabled={!isPlayerTurn || gameOver}
              isActive={activeColor === Color.Blue}
            />
          </View>
        </View>
      </View>

      {/* Controls */}
      <View style={styles.controls}>
        <Pressable
          style={({ pressed }) => [
            styles.startButton,
            gameOver ? styles.startButtonGameOver : gameStarted ? styles.startButtonRestart : styles.startButtonStart,
            pressed && styles.startButtonPressed,
          ]}
          onPress={handleStartGame}
        >
          <Text style={styles.startButtonText}>{gameOver ? "TRY AGAIN" : gameStarted ? "RESTART" : "START GAME"}</Text>
        </Pressable>

        <Text style={styles.hintText}>
          {gameStarted ? (isPlayerTurn ? "Repeat the pattern!" : "Watch the sequence...") : "Press Start to begin."}
        </Text>
      </View>
    </View>
  );
}

// =================================================================
// Styles
// =================================================================
const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#0f172a", // slate-900
    alignItems: "center",
    justifyContent: "space-evenly",
    paddingVertical: 40,
    paddingHorizontal: 20,
  },
  header: {
    width: "100%",
    maxWidth: 400,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-end",
    paddingHorizontal: 8,
  },
  titleSection: {
    flex: 1,
  },
  title: {
    fontSize: 36,
    fontWeight: "bold",
    color: "#f8fafc", // slate-50
    letterSpacing: -1,
    lineHeight: 36,
  },
  titleAccent: {
    fontSize: 36,
    fontWeight: "bold",
    color: "#22d3ee", // cyan-400
    letterSpacing: -1,
    lineHeight: 36,
  },
  subtitle: {
    fontSize: 10,
    color: "#64748b", // slate-500
    letterSpacing: 2,
    textTransform: "uppercase",
    marginTop: 2,
  },
  highScoreSection: {
    alignItems: "flex-end",
    paddingBottom: 4,
  },
  highScoreLabel: {
    fontSize: 10,
    color: "#475569", // slate-600
    fontWeight: "bold",
    letterSpacing: 1.5,
    marginBottom: 2,
  },
  highScoreValue: {
    fontSize: 36,
    fontFamily: "monospace",
    color: "#22d3ee", // cyan-400
    fontWeight: "700",
  },
  currentScoreDisplay: {
    alignItems: "center",
    justifyContent: "center",
  },
  currentScoreNumber: {
    fontSize: 96,
    fontWeight: "200",
    color: "#f8fafc", // slate-50
    fontFamily: "monospace",
    letterSpacing: -4,
    textShadowColor: "rgba(34, 211, 238, 0.3)",
    textShadowOffset: { width: 0, height: 0 },
    textShadowRadius: 20,
  },
  currentScoreLabelContainer: {
    flexDirection: "row",
    alignItems: "center",
    marginTop: -8,
  },
  currentScoreLabel: {
    fontSize: 11,
    color: "#64748b", // slate-500
    fontWeight: "600",
    letterSpacing: 2,
  },
  gameBoardContainer: {
    alignItems: "center",
    justifyContent: "center",
  },
  gameBoard: {
    width: gameBoardSize,
    height: gameBoardSize,
    backgroundColor: "#1e293b", // slate-800
    borderRadius: gameBoardSize / 2,
    padding: 20,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.5,
    shadowRadius: 50,
    elevation: 20,
    borderWidth: 4,
    borderColor: "#334155", // slate-700
  },
  padsGrid: {
    width: "100%",
    height: "100%",
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "space-between",
    alignContent: "space-between",
  },
  controls: {
    width: "100%",
    maxWidth: 320,
    alignItems: "center",
  },
  startButton: {
    width: "100%",
    paddingVertical: 16,
    borderRadius: 12,
    alignItems: "center",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 8,
  },
  startButtonStart: {
    backgroundColor: "#22d3ee", // cyan-500
  },
  startButtonRestart: {
    backgroundColor: "#475569", // slate-600
    borderWidth: 1,
    borderColor: "#64748b", // slate-500
  },
  startButtonGameOver: {
    backgroundColor: "#ef4444", // red-500
  },
  startButtonPressed: {
    opacity: 0.8,
    transform: [{ scale: 0.98 }],
  },
  startButtonText: {
    color: "#ffffff",
    fontSize: 18,
    fontWeight: "bold",
    letterSpacing: 1.5,
  },
  hintText: {
    marginTop: 24,
    textAlign: "center",
    color: "#475569", // slate-600
    fontSize: 12,
    paddingHorizontal: 32,
  },
  // GamePad styles
  padBase: {
    width: padSize,
    height: padSize,
    borderRadius: 16,
    borderBottomWidth: 8,
    overflow: "hidden",
  },
  padActive: {
    borderBottomWidth: 0,
    transform: [{ translateY: 2 }],
    shadowRadius: 40,
    shadowOpacity: 0.8,
    elevation: 20,
  },
  padPressed: {
    transform: [{ translateY: 2 }, { scale: 0.95 }],
    borderBottomWidth: 0,
  },
  glossyOverlay: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    height: "50%",
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
  },
});

const padColorStyles = {
  [Color.Green]: StyleSheet.create({
    base: { backgroundColor: "#16a34a", borderColor: "#15803d" }, // green-600, green-700
    active: { backgroundColor: "#4ade80", shadowColor: "#4ade80" }, // green-400
  }),
  [Color.Red]: StyleSheet.create({
    base: { backgroundColor: "#dc2626", borderColor: "#b91c1c" }, // red-600, red-700
    active: { backgroundColor: "#f87171", shadowColor: "#f87171" }, // red-400
  }),
  [Color.Yellow]: StyleSheet.create({
    base: { backgroundColor: "#eab308", borderColor: "#ca8a04" }, // yellow-500, yellow-600
    active: { backgroundColor: "#facc15", shadowColor: "#facc15" }, // yellow-400
  }),
  [Color.Blue]: StyleSheet.create({
    base: { backgroundColor: "#2563eb", borderColor: "#1d4ed8" }, // blue-600, blue-700
    active: { backgroundColor: "#60a5fa", shadowColor: "#60a5fa" }, // blue-400
  }),
};
