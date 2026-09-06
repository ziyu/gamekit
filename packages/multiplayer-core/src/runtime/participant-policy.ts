import type { MultiplayerPeerPlayerBinding } from "./peer-player-binding";
import type { MultiplayerPeer } from "./types";

export type MultiplayerParticipantJoinDecision = "active" | "spectator" | "next-round" | "reject";

export type MultiplayerParticipantDepartureDecision = "remove" | "disconnected" | "spectator";

export type MultiplayerParticipantReconnectDecision =
  | "restore"
  | "active"
  | "spectator"
  | "next-round"
  | "reject";

export type MultiplayerParticipantBoundaryDecision = "retain" | "remove" | "activate";

export type MultiplayerParticipantJoinPolicyInput<TContext> = {
  peer: MultiplayerPeer;
  binding?: MultiplayerPeerPlayerBinding;
  context: TContext;
};

export type MultiplayerParticipantDeparturePolicyInput<TContext> = {
  peerId: string;
  binding?: MultiplayerPeerPlayerBinding;
  context: TContext;
};

export type MultiplayerParticipantReconnectPolicyInput<TContext> = {
  peer: MultiplayerPeer;
  binding: MultiplayerPeerPlayerBinding;
  context: TContext;
};

export type MultiplayerParticipantBoundaryPolicyInput<TContext> = {
  binding: MultiplayerPeerPlayerBinding;
  context: TContext;
};

export type MultiplayerParticipantPolicyRule<TDecision, TInput> =
  | TDecision
  | ((input: TInput) => TDecision);

export type CreateMultiplayerParticipantPolicyOptions<TContext> = {
  join: MultiplayerParticipantPolicyRule<
    MultiplayerParticipantJoinDecision,
    MultiplayerParticipantJoinPolicyInput<TContext>
  >;
  lateJoin: MultiplayerParticipantPolicyRule<
    MultiplayerParticipantJoinDecision,
    MultiplayerParticipantJoinPolicyInput<TContext>
  >;
  leave: MultiplayerParticipantPolicyRule<
    MultiplayerParticipantDepartureDecision,
    MultiplayerParticipantDeparturePolicyInput<TContext>
  >;
  disconnect: MultiplayerParticipantPolicyRule<
    MultiplayerParticipantDepartureDecision,
    MultiplayerParticipantDeparturePolicyInput<TContext>
  >;
  reconnect: MultiplayerParticipantPolicyRule<
    MultiplayerParticipantReconnectDecision,
    MultiplayerParticipantReconnectPolicyInput<TContext>
  >;
  boundary: MultiplayerParticipantPolicyRule<
    MultiplayerParticipantBoundaryDecision,
    MultiplayerParticipantBoundaryPolicyInput<TContext>
  >;
};

export type MultiplayerParticipantPolicy<TContext> = {
  join(input: MultiplayerParticipantJoinPolicyInput<TContext>): MultiplayerParticipantJoinDecision;
  lateJoin(
    input: MultiplayerParticipantJoinPolicyInput<TContext>
  ): MultiplayerParticipantJoinDecision;
  leave(
    input: MultiplayerParticipantDeparturePolicyInput<TContext>
  ): MultiplayerParticipantDepartureDecision;
  disconnect(
    input: MultiplayerParticipantDeparturePolicyInput<TContext>
  ): MultiplayerParticipantDepartureDecision;
  reconnect(
    input: MultiplayerParticipantReconnectPolicyInput<TContext>
  ): MultiplayerParticipantReconnectDecision;
  boundary(
    input: MultiplayerParticipantBoundaryPolicyInput<TContext>
  ): MultiplayerParticipantBoundaryDecision;
};

export function createMultiplayerParticipantPolicy<TContext>(
  options: CreateMultiplayerParticipantPolicyOptions<TContext>
): MultiplayerParticipantPolicy<TContext> {
  return {
    join(input) {
      return resolvePolicyRule(options.join, input);
    },
    lateJoin(input) {
      return resolvePolicyRule(options.lateJoin, input);
    },
    leave(input) {
      return resolvePolicyRule(options.leave, input);
    },
    disconnect(input) {
      return resolvePolicyRule(options.disconnect, input);
    },
    reconnect(input) {
      return resolvePolicyRule(options.reconnect, input);
    },
    boundary(input) {
      return resolvePolicyRule(options.boundary, input);
    }
  };
}

function resolvePolicyRule<TDecision, TInput>(
  rule: MultiplayerParticipantPolicyRule<TDecision, TInput>,
  input: TInput
): TDecision {
  return typeof rule === "function" ? (rule as (value: TInput) => TDecision)(input) : rule;
}
