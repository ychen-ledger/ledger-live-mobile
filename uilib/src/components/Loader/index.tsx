import React from "react";
import { Svg, Circle, G, Rect } from "react-native-svg";
import { useTheme } from "styled-components/native";
import { TouchableOpacity } from "react-native";

type Props = {
  // float number between 0 and 1
  progress?: number;

  // function triggered when pressing the loader
  onPress: () => void;

  // Display the square in the middle of the loader
  displayCancelIcon?: boolean;
};

const R = 25;

const ProgressLoader = ({
  progress = 0,
  onPress,
  displayCancelIcon = true,
}: Props): React.ReactElement => {
  const { colors } = useTheme();
  const backgroundColor = colors.palette.primary.backgroundLight;
  const progressColor = colors.palette.primary.dark;

  const strokeWidth = 4;
  const normalizedRadius = R - strokeWidth / 2;
  const circumference = normalizedRadius * 2 * Math.PI;
  const strokeDashoffset = circumference - progress * circumference;
  return (
    <TouchableOpacity onPress={onPress}>
      <Svg width="50" height="50">
        <Circle
          cx={25}
          cy={25}
          r={23}
          fill="transparent"
          stroke={backgroundColor}
          strokeDashoffset={0}
          strokeWidth={4}
        />
        <G transform={{ rotation: -90, originX: 25, originY: 25 }}>
          <Circle
            cx={25}
            cy={25}
            r={23}
            fill="transparent"
            stroke={progressColor}
            strokeWidth={4}
            strokeDasharray={circumference + " " + circumference}
            strokeDashoffset={strokeDashoffset}
          />
        </G>
        {displayCancelIcon && (
          <Rect
            fill={progressColor}
            height="10"
            width="10"
            y="20"
            x="20"
            rx="1"
          />
        )}
      </Svg>
    </TouchableOpacity>
  );
};

export default ProgressLoader;
