import type { ArenaActorControlFrame } from "../shared/config";

export function selectArenaPredictionActorControls(input: {
  authorityControls: Readonly<Record<string, ArenaActorControlFrame>>;
  liveMemberIds: ReadonlySet<string>;
  eliminatedMemberIds: readonly string[];
  playerIdsByPeerId: Readonly<Record<string, string>>;
  peerId: string;
  localInput: { moveX: number; moveZ: number; jump: boolean };
  inputSequence: number;
}): Record<string, ArenaActorControlFrame> {
  const controls = Object.fromEntries(
    Object.entries(input.authorityControls).filter(([memberId]) =>
      input.liveMemberIds.has(memberId)
    )
  );
  const localMemberId = input.playerIdsByPeerId[input.peerId];
  if (
    localMemberId !== undefined &&
    input.liveMemberIds.has(localMemberId) &&
    !input.eliminatedMemberIds.includes(localMemberId)
  ) {
    controls[localMemberId] = {
      sequence: input.inputSequence,
      moveX: input.localInput.moveX,
      moveZ: input.localInput.moveZ,
      jump: input.localInput.jump
    };
  }
  return controls;
}
