import {
  interpolateAngleRadians,
  interpolateNumber,
  interpolateQuaternion,
  stepValue,
  type NetworkAngleRadians,
  type NetworkQuaternion,
  type NetworkScalar
} from "./presentation";

export type MultiplayerPredictionStateFieldKind =
  | "scalar"
  | "angle-radians"
  | "vector2"
  | "vector3"
  | "quaternion"
  | "step";

export type MultiplayerPredictionStateField<TState> = {
  readonly kind: MultiplayerPredictionStateFieldKind;
  present(fromState: TState, toState: TState, targetState: TState, alpha: number): void;
};

export type MultiplayerPredictionMeasurableStateField<TState> =
  MultiplayerPredictionStateField<TState> & {
    measureCorrection(previousState: TState, nextState: TState): number;
  };

export type MultiplayerPredictionSmoothableStateField<TState> =
  MultiplayerPredictionMeasurableStateField<TState> & {
    applyCorrection(
      targetState: TState,
      previousPresentedState: TState,
      initialTargetState: TState,
      remainingAlpha: number
    ): void;
  };

export type MultiplayerPredictionStateCorrectionOptions<TState> = {
  measure: MultiplayerPredictionMeasurableStateField<TState>;
  smooth: readonly MultiplayerPredictionSmoothableStateField<TState>[];
  durationMs: number;
  maxMagnitude?: number;
};

export type MultiplayerPredictionStatePresentationOptions<TState> = {
  fields: readonly MultiplayerPredictionStateField<TState>[];
  correction?: MultiplayerPredictionStateCorrectionOptions<TState>;
};

export type MultiplayerPredictionScalarStateFieldOptions<TState> = {
  read(state: TState): NetworkScalar;
  write(state: TState, value: NetworkScalar): void;
};

export type MultiplayerPredictionAngleStateFieldOptions<TState> = {
  read(state: TState): NetworkAngleRadians;
  write(state: TState, value: NetworkAngleRadians): void;
};

export type MultiplayerPredictionVector2StateFieldOptions<TState> = {
  readX(state: TState): number;
  readY(state: TState): number;
  write(state: TState, x: number, y: number): void;
  snapDistance?: number;
};

export type MultiplayerPredictionVector3StateFieldOptions<TState> = {
  readX(state: TState): number;
  readY(state: TState): number;
  readZ(state: TState): number;
  write(state: TState, x: number, y: number, z: number): void;
  snapDistance?: number;
};

export type MultiplayerPredictionQuaternionStateFieldOptions<TState> = {
  readX(state: TState): number;
  readY(state: TState): number;
  readZ(state: TState): number;
  readW(state: TState): number;
  write(state: TState, value: NetworkQuaternion): void;
};

export type MultiplayerPredictionStepStateFieldOptions<TState, TValue> = {
  read(state: TState): TValue;
  write(state: TState, value: TValue): void;
  threshold?: number;
};

export type MultiplayerPredictionStatePresentationRuntime<TState> = {
  correction?: MultiplayerPredictionStateCorrectionOptions<TState>;
  present(fromState: TState, toState: TState, targetState: TState, alpha: number): TState;
  measureCorrection(previousState: TState, nextState: TState): number;
  applyCorrection(
    targetState: TState,
    previousPresentedState: TState,
    initialTargetState: TState,
    remainingAlpha: number
  ): TState;
};

export function definePredictionStatePresentation<TState>(
  options: MultiplayerPredictionStatePresentationOptions<TState>
): MultiplayerPredictionStatePresentationOptions<TState> {
  return options;
}

export function definePredictionScalarStateField<TState>(
  options: MultiplayerPredictionScalarStateFieldOptions<TState>
): MultiplayerPredictionSmoothableStateField<TState> {
  return {
    kind: "scalar",
    present(fromState, toState, targetState, alpha) {
      options.write(
        targetState,
        interpolateNumber(options.read(fromState), options.read(toState), alpha)
      );
    },
    measureCorrection(previousState, nextState) {
      return Math.abs(options.read(previousState) - options.read(nextState));
    },
    applyCorrection(targetState, previousPresentedState, initialTargetState, remainingAlpha) {
      const offset =
        (options.read(previousPresentedState) - options.read(initialTargetState)) * remainingAlpha;
      options.write(targetState, options.read(targetState) + offset);
    }
  };
}

export function definePredictionAngleStateField<TState>(
  options: MultiplayerPredictionAngleStateFieldOptions<TState>
): MultiplayerPredictionSmoothableStateField<TState> {
  return {
    kind: "angle-radians",
    present(fromState, toState, targetState, alpha) {
      options.write(
        targetState,
        interpolateAngleRadians(options.read(fromState), options.read(toState), alpha)
      );
    },
    measureCorrection(previousState, nextState) {
      return Math.abs(shortestAngleDelta(options.read(previousState), options.read(nextState)));
    },
    applyCorrection(targetState, previousPresentedState, initialTargetState, remainingAlpha) {
      const offset =
        shortestAngleDelta(options.read(initialTargetState), options.read(previousPresentedState)) *
        remainingAlpha;
      options.write(targetState, options.read(targetState) + offset);
    }
  };
}

export function definePredictionVector2StateField<TState>(
  options: MultiplayerPredictionVector2StateFieldOptions<TState>
): MultiplayerPredictionSmoothableStateField<TState> {
  const snapDistance = normalizeSnapDistance(options.snapDistance);
  return {
    kind: "vector2",
    present(fromState, toState, targetState, alpha) {
      const fromX = options.readX(fromState);
      const fromY = options.readY(fromState);
      const toX = options.readX(toState);
      const toY = options.readY(toState);
      const amount = distance2(fromX, fromY, toX, toY) > snapDistance ? 1 : clamp01(alpha);
      options.write(targetState, fromX + (toX - fromX) * amount, fromY + (toY - fromY) * amount);
    },
    measureCorrection(previousState, nextState) {
      return distance2(
        options.readX(previousState),
        options.readY(previousState),
        options.readX(nextState),
        options.readY(nextState)
      );
    },
    applyCorrection(targetState, previousPresentedState, initialTargetState, remainingAlpha) {
      options.write(
        targetState,
        options.readX(targetState) +
          (options.readX(previousPresentedState) - options.readX(initialTargetState)) *
            remainingAlpha,
        options.readY(targetState) +
          (options.readY(previousPresentedState) - options.readY(initialTargetState)) *
            remainingAlpha
      );
    }
  };
}

export function definePredictionVector3StateField<TState>(
  options: MultiplayerPredictionVector3StateFieldOptions<TState>
): MultiplayerPredictionSmoothableStateField<TState> {
  const snapDistance = normalizeSnapDistance(options.snapDistance);
  return {
    kind: "vector3",
    present(fromState, toState, targetState, alpha) {
      const fromX = options.readX(fromState);
      const fromY = options.readY(fromState);
      const fromZ = options.readZ(fromState);
      const toX = options.readX(toState);
      const toY = options.readY(toState);
      const toZ = options.readZ(toState);
      const amount =
        distance3(fromX, fromY, fromZ, toX, toY, toZ) > snapDistance ? 1 : clamp01(alpha);
      options.write(
        targetState,
        fromX + (toX - fromX) * amount,
        fromY + (toY - fromY) * amount,
        fromZ + (toZ - fromZ) * amount
      );
    },
    measureCorrection(previousState, nextState) {
      return distance3(
        options.readX(previousState),
        options.readY(previousState),
        options.readZ(previousState),
        options.readX(nextState),
        options.readY(nextState),
        options.readZ(nextState)
      );
    },
    applyCorrection(targetState, previousPresentedState, initialTargetState, remainingAlpha) {
      options.write(
        targetState,
        options.readX(targetState) +
          (options.readX(previousPresentedState) - options.readX(initialTargetState)) *
            remainingAlpha,
        options.readY(targetState) +
          (options.readY(previousPresentedState) - options.readY(initialTargetState)) *
            remainingAlpha,
        options.readZ(targetState) +
          (options.readZ(previousPresentedState) - options.readZ(initialTargetState)) *
            remainingAlpha
      );
    }
  };
}

export function definePredictionQuaternionStateField<TState>(
  options: MultiplayerPredictionQuaternionStateFieldOptions<TState>
): MultiplayerPredictionMeasurableStateField<TState> {
  return {
    kind: "quaternion",
    present(fromState, toState, targetState, alpha) {
      options.write(
        targetState,
        interpolateQuaternion(
          readQuaternion(options, fromState),
          readQuaternion(options, toState),
          alpha
        )
      );
    },
    measureCorrection(previousState, nextState) {
      const previous = readQuaternion(options, previousState);
      const next = readQuaternion(options, nextState);
      const dot = Math.abs(
        previous.x * next.x + previous.y * next.y + previous.z * next.z + previous.w * next.w
      );
      return 2 * Math.acos(Math.min(1, Math.max(-1, dot)));
    }
  };
}

export function definePredictionStepStateField<TState, TValue>(
  options: MultiplayerPredictionStepStateFieldOptions<TState, TValue>
): MultiplayerPredictionStateField<TState> {
  return {
    kind: "step",
    present(fromState, toState, targetState, alpha) {
      options.write(
        targetState,
        stepValue(options.read(fromState), options.read(toState), alpha, options.threshold)
      );
    }
  };
}

export function createMultiplayerPredictionStatePresentation<TState>(
  options: MultiplayerPredictionStatePresentationOptions<TState>
): MultiplayerPredictionStatePresentationRuntime<TState> {
  const fields = [...options.fields];
  const correction = options.correction;
  if (correction !== undefined) {
    const fieldSet = new Set(fields);
    if (!fieldSet.has(correction.measure)) {
      throw new Error(
        "Prediction correction measure field must be included in presentation fields."
      );
    }
    for (const field of correction.smooth) {
      if (!fieldSet.has(field)) {
        throw new Error(
          "Prediction correction smooth fields must be included in presentation fields."
        );
      }
    }
  }

  return {
    ...(correction === undefined ? {} : { correction }),
    present(fromState, toState, targetState, alpha) {
      for (const field of fields) {
        field.present(fromState, toState, targetState, alpha);
      }
      return targetState;
    },
    measureCorrection(previousState, nextState) {
      return correction?.measure.measureCorrection(previousState, nextState) ?? 0;
    },
    applyCorrection(targetState, previousPresentedState, initialTargetState, remainingAlpha) {
      for (const field of correction?.smooth ?? []) {
        field.applyCorrection(
          targetState,
          previousPresentedState,
          initialTargetState,
          remainingAlpha
        );
      }
      return targetState;
    }
  };
}

function readQuaternion<TState>(
  options: MultiplayerPredictionQuaternionStateFieldOptions<TState>,
  state: TState
): NetworkQuaternion {
  return {
    x: options.readX(state),
    y: options.readY(state),
    z: options.readZ(state),
    w: options.readW(state)
  };
}

function shortestAngleDelta(from: number, to: number): number {
  return Math.atan2(Math.sin(to - from), Math.cos(to - from));
}

function distance2(fromX: number, fromY: number, toX: number, toY: number): number {
  return Math.hypot(toX - fromX, toY - fromY);
}

function distance3(
  fromX: number,
  fromY: number,
  fromZ: number,
  toX: number,
  toY: number,
  toZ: number
): number {
  return Math.hypot(toX - fromX, toY - fromY, toZ - fromZ);
}

function normalizeSnapDistance(value: number | undefined): number {
  return value === undefined || !Number.isFinite(value)
    ? Number.POSITIVE_INFINITY
    : Math.max(0, value);
}

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value));
}
