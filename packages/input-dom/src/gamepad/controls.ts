export const STANDARD_GAMEPAD_CONTROL = {
  buttonSouth: "Gamepad.Button.South",
  buttonEast: "Gamepad.Button.East",
  buttonWest: "Gamepad.Button.West",
  buttonNorth: "Gamepad.Button.North",
  leftBumper: "Gamepad.Button.LeftBumper",
  rightBumper: "Gamepad.Button.RightBumper",
  leftTrigger: "Gamepad.Trigger.Left",
  rightTrigger: "Gamepad.Trigger.Right",
  select: "Gamepad.Button.Select",
  start: "Gamepad.Button.Start",
  leftStick: "Gamepad.Button.LeftStick",
  rightStick: "Gamepad.Button.RightStick",
  dpadUp: "Gamepad.Dpad.Up",
  dpadDown: "Gamepad.Dpad.Down",
  dpadLeft: "Gamepad.Dpad.Left",
  dpadRight: "Gamepad.Dpad.Right",
  home: "Gamepad.Button.Home",
  leftXNegative: "Gamepad.Axis.LeftX.Negative",
  leftXPositive: "Gamepad.Axis.LeftX.Positive",
  leftYNegative: "Gamepad.Axis.LeftY.Negative",
  leftYPositive: "Gamepad.Axis.LeftY.Positive",
  rightXNegative: "Gamepad.Axis.RightX.Negative",
  rightXPositive: "Gamepad.Axis.RightX.Positive",
  rightYNegative: "Gamepad.Axis.RightY.Negative",
  rightYPositive: "Gamepad.Axis.RightY.Positive"
} as const;

export type StandardGamepadControl =
  (typeof STANDARD_GAMEPAD_CONTROL)[keyof typeof STANDARD_GAMEPAD_CONTROL];
