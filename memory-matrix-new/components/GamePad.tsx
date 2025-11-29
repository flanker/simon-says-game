import React from "react";
import { Color } from "../types";

interface GamePadProps {
  color: Color;
  isActive: boolean;
  onClick: (color: Color) => void;
  disabled: boolean;
}

const GamePad: React.FC<GamePadProps> = ({ color, isActive, onClick, disabled }) => {
  // Base styles for layout
  const baseClasses =
    "w-full h-full rounded-3xl transition-all duration-200 ease-in-out border-b-[6px] active:border-b-0 active:translate-y-[6px] relative overflow-hidden group";

  // Heavier Macaron Palette (Saturated Pastels)
  // Green -> Seafoam: #6FD0B2 (Border: #4FB092)
  // Red -> Strawberry: #FF8593 (Border: #E06573)
  // Yellow -> Custard: #FFD768 (Border: #E0B849)
  // Blue -> Azure: #85C4FF (Border: #65A4DF)

  const colorStyles: Record<Color, string> = {
    [Color.GREEN]: `bg-[#6FD0B2] border-[#4FB092] ${
      isActive
        ? "!bg-[#98E6CD] shadow-[0_0_30px_rgba(109,208,178,0.9)] !border-b-0 translate-y-[6px] brightness-105"
        : ""
    }`,
    [Color.RED]: `bg-[#FF8593] border-[#E06573] ${
      isActive
        ? "!bg-[#FFACB7] shadow-[0_0_30px_rgba(255,133,147,0.9)] !border-b-0 translate-y-[6px] brightness-105"
        : ""
    }`,
    [Color.YELLOW]: `bg-[#FFD768] border-[#E0B849] ${
      isActive
        ? "!bg-[#FFE699] shadow-[0_0_30px_rgba(255,215,104,0.9)] !border-b-0 translate-y-[6px] brightness-105"
        : ""
    }`,
    [Color.BLUE]: `bg-[#85C4FF] border-[#65A4DF] ${
      isActive
        ? "!bg-[#ADD8FF] shadow-[0_0_30px_rgba(133,196,255,0.9)] !border-b-0 translate-y-[6px] brightness-105"
        : ""
    }`,
  };

  // Overlay for glossy effect (softer for macaron theme)
  const glossOverlay = (
    <div className="absolute top-0 left-0 right-0 h-2/5 bg-gradient-to-b from-white/40 to-transparent rounded-t-3xl pointer-events-none" />
  );

  return (
    <button
      className={`${baseClasses} ${colorStyles[color]} ${
        disabled ? "cursor-default" : "cursor-pointer active:scale-[0.98]"
      }`}
      onClick={() => !disabled && onClick(color)}
      disabled={disabled}
      aria-label={`Press ${color}`}
    >
      {glossOverlay}
    </button>
  );
};

export default GamePad;
